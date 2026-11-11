import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { encodeCandidateActionSpatial, encodeGameStateSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState, Position, Unit, UnitClass } from '../../src/game/types';
import type { TerrainId, Tile } from '../../src/game/terrain';
import { encodePathRelations, PATH_COST_NORMALIZER } from './path_relations';

function tile(terrainId: TerrainId = 6, ownerId: number | null = null, apkMoveCost?: number): Tile {
    return { terrainId, ownerId, ...(apkMoveCost === undefined ? {} : { apkMoveCost }) };
}

function unit(id: string, unitClass: UnitClass, pos: Position, ownerId = 0): Unit {
    return { id, unitClass, pos, ownerId, hp: 100, maxHp: 100, hasMoved: false, hasActed: false };
}

function makeState(width: number, height: number, actor: Unit): GameState {
    return {
        turn: 1,
        currentPlayer: 0,
        map: {
            width,
            height,
            tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => tile())),
        },
        units: [actor],
        players: [
            { id: 0, gold: 500, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 500, isAlive: true, commanderDeathCount: 0 },
        ],
        winner: null,
    };
}

function localPatch(state: GameState, action: Action, radius: number): number[] {
    const encoded = encodeGameStateSpatial(state, 0, 'v2', { channels: 34 });
    const candidate = encodeCandidateActionSpatial(state, 0, action, 'v2', 'v15_current');
    const centers = [candidate.actorCoord, candidate.landingCoord, candidate.targetCoord]
        .filter((pos): pos is Position => pos !== null);
    const values: number[] = [];
    for (const center of centers) {
        for (let channel = 0; channel < 34; channel += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    const x = center.x + dx;
                    const y = center.y + dy;
                    values.push(x < 0 || y < 0 || x >= 20 || y >= 20
                        ? 0
                        : encoded.spatialTensor[channel * 400 + y * 20 + x]);
                }
            }
        }
    }
    values.push(...candidate.semantics);
    return values;
}

describe('候选夺城路径关系原型', () => {
    it('远处城镇与营地交换时旧候选局部输入相同，新路径代价可区分', () => {
        const actor = unit('soldier', 'soldier', { x: 2, y: 10 });
        const nearTown = makeState(20, 20, actor);
        const farTown = makeState(20, 20, { ...actor });
        nearTown.map.tiles[10][18] = tile(9, 1);
        nearTown.map.tiles[18][18] = tile(11, null);
        farTown.map.tiles[10][18] = tile(11, null);
        farTown.map.tiles[18][18] = tile(9, 1);
        const action: Action = { type: 'move', unitId: 'soldier', to: { x: 3, y: 10 } };

        // 五层3×3卷积的候选坐标感受野半径为5；两个远处格均在局部块之外。
        expect(localPatch(nearTown, action, 5)).toEqual(localPatch(farTown, action, 5));
        const near = encodePathRelations(nearTown, 0, [action])[0];
        const far = encodePathRelations(farTown, 0, [action])[0];
        expect(near.reachableCapturableBuilding).toBe(1);
        expect(far.reachableCapturableBuilding).toBe(1);
        expect(near.normalizedNearestCapturableCost).toBe(15 / PATH_COST_NORMALIZER);
        expect(far.normalizedNearestCapturableCost).toBe(23 / PATH_COST_NORMALIZER);
        expect(near.normalizedCapturableCostReduction).toBe(1 / PATH_COST_NORMALIZER);
    });

    it('权威移动代价判定不可达；attack等非落点动作固定为零', () => {
        const state = makeState(5, 3, unit('soldier', 'soldier', { x: 0, y: 1 }));
        for (let y = 0; y < 3; y += 1) state.map.tiles[y][2] = tile(6, null, 999999);
        state.map.tiles[1][4] = tile(9, 1);
        const actions: Action[] = [
            { type: 'move', unitId: 'soldier', to: { x: 1, y: 1 } },
            { type: 'attack', attackerId: 'soldier', targetId: 'missing' },
            { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 0, y: 1 } },
        ];
        expect(encodePathRelations(state, 0, actions)).toEqual([
            { reachableCapturableBuilding: 0, normalizedNearestCapturableCost: 0, normalizedCapturableCostReduction: 0 },
            { reachableCapturableBuilding: 0, normalizedNearestCapturableCost: 0, normalizedCapturableCostReduction: 0 },
            { reachableCapturableBuilding: 0, normalizedNearestCapturableCost: 0, normalizedCapturableCostReduction: 0 },
        ]);
    });

    it('水之子使用真实水域代价；飞行但无占领能力的兵种不会被误判', () => {
        const mermaidState = makeState(4, 1, unit('mermaid', 'mermaid', { x: 0, y: 0 }));
        mermaidState.map.tiles[0][1] = tile(2);
        mermaidState.map.tiles[0][2] = tile(2);
        mermaidState.map.tiles[0][3] = tile(9, 1);
        const mermaid = encodePathRelations(mermaidState, 0, [
            { type: 'move', unitId: 'mermaid', to: { x: 1, y: 0 } },
        ])[0];
        expect(mermaid.normalizedNearestCapturableCost).toBe(2 / PATH_COST_NORMALIZER);
        expect(mermaid.normalizedCapturableCostReduction).toBe(1 / PATH_COST_NORMALIZER);

        const dragonState = makeState(4, 1, unit('dragon', 'dragon', { x: 0, y: 0 }));
        dragonState.map.tiles[0][3] = tile(9, 1);
        expect(encodePathRelations(dragonState, 0, [
            { type: 'move', unitId: 'dragon', to: { x: 1, y: 0 } },
        ])[0]).toEqual({
            reachableCapturableBuilding: 0,
            normalizedNearestCapturableCost: 0,
            normalizedCapturableCostReduction: 0,
        });
    });

    it('敌军占位会阻断狭道；移除后友军可穿过且自身起点不构成障碍', () => {
        const actor = unit('soldier', 'soldier', { x: 0, y: 1 });
        const state = makeState(5, 2, actor);
        for (let x = 1; x < 5; x += 1) state.map.tiles[1][x] = tile(6, null, 999999);
        state.map.tiles[0][4] = tile(9, 1);
        state.units.push(unit('ally', 'archer', { x: 1, y: 0 }));
        state.units.push(unit('enemy', 'archer', { x: 2, y: 0 }, 1));
        const action: Action = { type: 'move', unitId: 'soldier', to: { x: 0, y: 0 } };
        expect(encodePathRelations(state, 0, [action])[0].reachableCapturableBuilding).toBe(0);

        state.units = state.units.filter((candidate) => candidate.id !== 'enemy');
        const clear = encodePathRelations(state, 0, [action])[0];
        expect(clear.reachableCapturableBuilding).toBe(1);
        expect(clear.normalizedNearestCapturableCost).toBe(4 / PATH_COST_NORMALIZER);
    });

    it('recruit_and_deploy按所招兵种与落点计算，capture在当前建筑代价为零', () => {
        const state = makeState(6, 1, unit('commander', 'commander', { x: 5, y: 0 }));
        state.map.tiles[0][0] = tile(10, 0);
        state.map.tiles[0][5] = tile(10, 1);
        const relations = encodePathRelations(state, 0, [
            {
                type: 'recruit_and_deploy', unitClass: 'soldier',
                castlePos: { x: 0, y: 0 }, to: { x: 1, y: 0 },
            },
            { type: 'capture', unitId: 'commander' },
        ]);
        // 士兵不能占城堡，因此部署候选不能借指挥官的能力得到正特征。
        expect(relations[0]).toEqual({
            reachableCapturableBuilding: 0,
            normalizedNearestCapturableCost: 0,
            normalizedCapturableCostReduction: 0,
        });
        expect(relations[1]).toEqual({
            reachableCapturableBuilding: 1,
            normalizedNearestCapturableCost: 0,
            normalizedCapturableCostReduction: 0,
        });
    });

    it('合成20×20小局批量候选耗时探针', () => {
        const state = makeState(20, 20, unit('commander', 'commander', { x: 2, y: 10 }));
        state.map.tiles[1][18] = tile(10, 1);
        state.map.tiles[18][18] = tile(9, 1);
        const actions: Action[] = [];
        for (let y = 5; y < 15; y += 1) {
            for (let x = 3; x < 8; x += 1) actions.push({ type: 'move', unitId: 'commander', to: { x, y } });
        }
        encodePathRelations(state, 0, actions);
        const runs = 20;
        const started = performance.now();
        for (let index = 0; index < runs; index += 1) encodePathRelations(state, 0, actions);
        const meanMs = (performance.now() - started) / runs;
        console.log(`[path-relations] 20x20 state × ${actions.length} candidates: ${meanMs.toFixed(3)} ms/批`);
        expect(Number.isFinite(meanMs)).toBe(true);
    });
});
