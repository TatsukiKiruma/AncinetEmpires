import { describe, expect, it } from 'vitest';
import type { Action, GameState, Position, Unit, UnitClass } from '../types';
import type { TerrainId, Tile } from '../terrain';
import {
    ACTION_SEMANTIC_DIM_PATH3,
    ENCODER_SCHEMA_CHANNELS,
    ENCODER_SCHEMA_ID_V13,
    ENCODER_SCHEMA_ID_V19,
    ENCODER_SCHEMA_ID_V19_PATH3,
    ENCODER_SCHEMA_SEMANTIC_DIM,
    encodeCandidateActionSpatial,
    encodeCandidateActionsSpatialForSchema,
    encodeGameStateSpatial,
} from './spatial_tensor_encoder';
import { encodePathRelations } from './path_relations';
import { SpatialResNetPredictor, createInitializedSpatialResNet } from './spatial_conv_net';

function tile(terrainId: TerrainId = 6, ownerId: number | null = null): Tile {
    return { terrainId, ownerId };
}

function unit(id: string, unitClass: UnitClass, pos: Position, ownerId = 0): Unit {
    return { id, unitClass, pos, ownerId, hp: 100, maxHp: 100, hasMoved: false, hasActed: false };
}

function stateForPath(): GameState {
    const width = 8;
    const height = 3;
    const state: GameState = {
        turn: 1,
        currentPlayer: 0,
        map: {
            width,
            height,
            tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => tile())),
        },
        units: [unit('soldier', 'soldier', { x: 0, y: 1 })],
        players: [
            { id: 0, gold: 500, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 500, isAlive: true, commanderDeathCount: 0 },
        ],
        winner: null,
    };
    state.map.tiles[1][7] = tile(9, 1);
    return state;
}

function bytes(values: Float32Array | number[]): number[] {
    const array = values instanceof Float32Array ? values : Float32Array.from(values);
    return Array.from(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

describe('Path-3 schema 与批量候选编码', () => {
    it('独立登记34/20/56 schema', () => {
        expect(ENCODER_SCHEMA_ID_V19_PATH3).toBe('spatial34_global20_actionSemantics56_v19_path3');
        expect(ENCODER_SCHEMA_CHANNELS[ENCODER_SCHEMA_ID_V19_PATH3]).toBe(34);
        expect(ENCODER_SCHEMA_SEMANTIC_DIM[ENCODER_SCHEMA_ID_V19_PATH3]).toBe(56);
        expect(ACTION_SEMANTIC_DIM_PATH3).toBe(56);
    });

    it('旧53维逐字节不变；56维前三53相同且尾部等于权威路径事实', () => {
        const state = stateForPath();
        const actions: Action[] = [
            { type: 'move', unitId: 'soldier', to: { x: 1, y: 1 } },
            { type: 'end_turn' },
        ];
        const directLegacy = actions.map((action) =>
            encodeCandidateActionSpatial(state, 0, action, 'v2', 'v15_current'));
        const batchedLegacy = encodeCandidateActionsSpatialForSchema(
            state, 0, actions, 'v2', ENCODER_SCHEMA_ID_V19,
        );
        const path3 = encodeCandidateActionsSpatialForSchema(
            state, 0, actions, 'v2', ENCODER_SCHEMA_ID_V19_PATH3,
        );
        const expectedPath = encodePathRelations(state, 0, actions);

        for (let index = 0; index < actions.length; index += 1) {
            expect(bytes(batchedLegacy[index].semantics)).toEqual(bytes(directLegacy[index].semantics));
            expect(path3[index].semantics).toHaveLength(56);
            expect(bytes(Array.from(path3[index].semantics).slice(0, 53)))
                .toEqual(bytes(directLegacy[index].semantics));
            const tail = Array.from(path3[index].semantics).slice(53);
            expect(tail[0]).toBe(expectedPath[index].reachableCapturableBuilding);
            expect(tail[1]).toBeCloseTo(expectedPath[index].normalizedNearestCapturableCost);
            expect(tail[2]).toBeCloseTo(expectedPath[index].normalizedCapturableCostReduction);
        }
        expect(path3[0].semantics[53]).toBe(1);
        expect(path3[0].semantics[54]).toBeCloseTo(6 / 40);
        expect(path3[0].semantics[55]).toBeCloseTo(1 / 40);
        expect(Array.from(path3[1].semantics).slice(53)).toEqual([0, 0, 0]);
    });
});

describe('Path-3 predictor 严格校验实际语义维度', () => {
    it('拒绝错维度与第56维NaN', () => {
        const state = stateForPath();
        const action: Action = { type: 'end_turn' };
        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(
            20261003, 'spatial-resnet-v2', ENCODER_SCHEMA_ID_V19_PATH3,
        ));
        const encoded = encodeGameStateSpatial(state, 0, 'v2', { channels: 34 });
        const feature = encodeCandidateActionsSpatialForSchema(
            state, 0, [action], 'v2', ENCODER_SCHEMA_ID_V19_PATH3,
        )[0];
        const short = { ...feature, semantics: Array.from(feature.semantics).slice(0, 55) };
        expect(() => predictor.predict(encoded, [short])).toThrow(/length 55 != expected 56/);

        const poisoned = { ...feature, semantics: Float32Array.from(feature.semantics) };
        poisoned.semantics[55] = Number.NaN;
        expect(() => predictor.predict(encoded, [poisoned])).toThrow(/non-finite value at index 55/);
    });

    it('历史32维schema按自身维度保留旧variant前缀，不会误传53维', () => {
        const state = stateForPath();
        const actions: Action[] = [{ type: 'move', unitId: 'soldier', to: { x: 1, y: 1 } }];
        const legacy53 = encodeCandidateActionSpatial(state, 0, actions[0], 'v2', 'v13_legacy');
        const encoded32 = encodeCandidateActionsSpatialForSchema(
            state, 0, actions, 'v2', ENCODER_SCHEMA_ID_V13,
        )[0];
        expect(encoded32.semantics).toHaveLength(32);
        expect(bytes(encoded32.semantics)).toEqual(bytes(Array.from(legacy53.semantics).slice(0, 32)));

        const predictor = new SpatialResNetPredictor(createInitializedSpatialResNet(
            13, 'spatial-resnet-v2', ENCODER_SCHEMA_ID_V13,
        ));
        const encodedState = encodeGameStateSpatial(state, 0, 'v2', { channels: 24 });
        expect(() => predictor.predict(encodedState, [encoded32])).not.toThrow();
        expect(() => predictor.predict(encodedState, [legacy53])).toThrow(/length 53 != expected 32/);
    });
});
