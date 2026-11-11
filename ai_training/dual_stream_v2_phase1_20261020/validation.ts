import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getLegalActions } from '../../src/game/rules';
import type { Action, GameState } from '../../src/game/types';
import { ENTITY_DIM, ENTITY_FIELDS as F, MAP_CHANNELS, PLAYER_SLOTS, POINTER_DIM, RELATION_DIM, type DualObservation } from '../../src/ai_runtime/dual_v2/contract';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { decodeFactoredAction } from '../../src/ai_runtime/dual_v2/factored_actions';
import { encodeOutcomeTarget } from '../../src/ai_runtime/dual_v2/player_order';
import { SYMMETRIES, transformAction, transformPosition, transformState, transformTileIndex } from './symmetry';

export function validateObservation(state: GameState, legal: Action[], x = encodeDualObservation(state, legal)) {
    const n = x.entityIndexMap.entities.length;
    assert.equal(x.playerOrder.playerIds[0], state.currentPlayer);
    assert.equal(x.spatialTensor.length, MAP_CHANNELS * state.map.width * state.map.height);
    assert.equal(x.entityTokens.length, n * ENTITY_DIM); assert.equal(x.relationalBias.length, n * n * RELATION_DIM);
    assert.equal(x.playerOrder.features.length, PLAYER_SLOTS * 11);
    for (const values of [x.spatialTensor, x.entityTokens, x.relationalBias, x.playerOrder.features]) for (const v of values) assert.ok(Number.isFinite(v));
    assert.equal(x.actions.sourceIndices.length, legal.filter(a => a.type !== 'surrender').length);
    const seen = new Set<string>();
    for (let i = 0; i < x.actions.sourceIndices.length; i++) {
        const tuple = x.actions.pointers.subarray(i * POINTER_DIM, (i + 1) * POINTER_DIM), code = [...tuple].join(':');
        assert.ok(!seen.has(code)); seen.add(code);
        assert.deepEqual(decodeFactoredAction(state, x.entityIndexMap, tuple), legal[x.actions.sourceIndices[i]]);
        assert.equal(x.actions.actorMask[tuple[0]], 1);
        assert.ok(x.actions.tilesByActor.get(tuple[0])!.includes(tuple[1]));
        assert.ok(x.actions.rowsByActorTile.get(`${tuple[0]}:${tuple[1]}`)!.includes(i));
    }
    return x;
}
export function validateSymmetry(state: GameState, legal: Action[], base: DualObservation, targetAction?: Action) {
    const area = state.map.width * state.map.height, n = base.entityIndexMap.entities.length;
    for (const symmetry of SYMMETRIES) {
        const transformed = transformState(state, symmetry), actions = legal.map(a => transformAction(a, state.map.width, state.map.height, symmetry));
        assert.deepEqual(getLegalActions(transformed, transformed.currentPlayer).map(encodeAction).sort(), actions.map(encodeAction).sort());
        const next = validateObservation(transformed, actions);
        for (let channel = 0; channel < MAP_CHANNELS; channel++) for (let i = 0; i < area; i++) assert.equal(next.spatialTensor[channel * area + transformTileIndex(i, state.map.width, state.map.height, symmetry)], base.spatialTensor[channel * area + i]);
        const permutation = base.entityIndexMap.entities.map(e => e.kind === 'unit' ? next.entityIndexMap.units.get(e.id)! : e.kind === 'grave' ? next.entityIndexMap.graves.get(e.id)! : next.entityIndexMap.castles.get(transformTileIndex(e.y * state.map.width + e.x, state.map.width, state.map.height, symmetry))!);
        const coordinateFields = new Set<number>([F.x, F.y, F.nx, F.ny, F.dx, F.dy]);
        for (let i = 0; i < n; i++) {
            const ni = permutation[i], e = base.entityIndexMap.entities[i], p = transformPosition(e, state.map.width, state.map.height, symmetry);
            for (let d = 0; d < ENTITY_DIM; d++) if (!coordinateFields.has(d)) assert.equal(next.entityTokens[ni * ENTITY_DIM + d], base.entityTokens[i * ENTITY_DIM + d]);
            assert.equal(next.entityTokens[ni * ENTITY_DIM + F.x], p.x); assert.equal(next.entityTokens[ni * ENTITY_DIM + F.y], p.y);
            assert.equal(next.entityTokens[ni * ENTITY_DIM + F.nx], Math.fround(p.x / Math.max(1, state.map.width - 1))); assert.equal(next.entityTokens[ni * ENTITY_DIM + F.ny], Math.fround(p.y / Math.max(1, state.map.height - 1)));
            for (const [field, flip] of [[F.dx, symmetry === 'flipH' || symmetry === 'rot180'], [F.dy, symmetry === 'flipV' || symmetry === 'rot180']] as const) assert.ok(next.entityTokens[ni * ENTITY_DIM + field] === base.entityTokens[i * ENTITY_DIM + field] * (flip ? -1 : 1));
            for (let j = 0; j < n; j++) for (let d = 0; d < RELATION_DIM; d++) assert.equal(next.relationalBias[(ni * n + permutation[j]) * RELATION_DIM + d], base.relationalBias[(i * n + j) * RELATION_DIM + d]);
        }
        for (let i = 0; i < base.actions.sourceIndices.length; i++) {
            const a = base.actions.pointers.subarray(i * POINTER_DIM, (i + 1) * POINTER_DIM), b = next.actions.pointers.subarray(i * POINTER_DIM, (i + 1) * POINTER_DIM);
            assert.equal(b[0], a[0] === n ? n : permutation[a[0]]); assert.equal(b[1], transformTileIndex(a[1], state.map.width, state.map.height, symmetry)); assert.equal(b[2], a[2]); assert.equal(b[3], a[3]); assert.equal(b[4], a[4] < 0 ? -1 : permutation[a[4]]);
        }
        assert.deepEqual(encodeOutcomeTarget(transformed, next.playerOrder, true, -1), encodeOutcomeTarget(state, base.playerOrder, true, -1));
        if (targetAction && state.winner === null) {
            const options = { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true };
            const a = new GameEngine(state, options).step(targetAction), b = new GameEngine(transformed, options).step(transformAction(targetAction, state.map.width, state.map.height, symmetry));
            assert.deepEqual(b.state, transformState(a.state, symmetry));
        }
    }
}
