import { createDefaultAppGameState } from '../../src/game/default_state';
import { GameEngine } from '../../src/game/engine';
import type { GameState, Unit } from '../../src/game/types';
import { UNIT_CLASSES } from '../../src/ai_runtime/dual_v2/contract';

export function multiplayerFixture(players = 4, size = 16, unitsPerPlayer = 8, allied = false): GameState {
    const units: Unit[] = [];
    for (let ownerId = 0; ownerId < players; ownerId++) for (let i = 0; i < unitsPerPlayer; i++) {
        const side = Math.ceil(Math.sqrt(unitsPerPlayer));
        const x = (ownerId % 2 ? size - side * 2 : 1) + (i % side) * 2;
        const y = (ownerId >= 2 ? size - side * 2 : 1) + Math.floor(i / side) * 2;
        units.push({ id: `p${ownerId}u${i}`, ownerId, unitClass: i === 0 ? 'commander' : UNIT_CLASSES[(i - 1) % UNIT_CLASSES.length], pos: { x, y }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false });
    }
    const state: GameState = { turn: 24, currentPlayer: 0, winner: null, map: { width: size, height: size, tiles: Array.from({ length: size }, () => Array.from({ length: size }, () => ({ terrainId: 1, ownerId: null }))) }, players: Array.from({ length: players }, (_, id) => ({ id, gold: 3000, isAlive: true, commanderDeathCount: 0 })), units, graves: [{ id: 'g0', pos: { x: Math.floor(size / 2), y: Math.floor(size / 2) }, remainingTurns: 4 }], rules: { alliances: allied ? { 0: 10, 1: 20, 2: 10, 3: 20 } : {}, commanderCastleRecruitUsesPending: false, commanderRecruitBaseCost: 1000 } };
    for (let p = 0; p < players; p++) { const u = units[p * unitsPerPlayer]; state.map.tiles[u.pos.y][u.pos.x] = { terrainId: 10, ownerId: p }; }
    return state;
}
export function standardFixture(): GameState { return createDefaultAppGameState(); }

export function specialFixtures(): GameState[] {
    const state = multiplayerFixture(2, 16, 8);
    state.units = [
        { id: 'commander', ownerId: 0, unitClass: 'commander', pos: { x: 1, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'druid', ownerId: 0, unitClass: 'druid', pos: { x: 3, y: 3 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 3 },
        { id: 'archer', ownerId: 0, unitClass: 'archer', pos: { x: 4, y: 3 }, hp: 70, maxHp: 100, hasMoved: false, hasActed: true },
        { id: 'witch', ownerId: 0, unitClass: 'witch', pos: { x: 5, y: 3 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'paladin', ownerId: 0, unitClass: 'paladin', pos: { x: 4, y: 4 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'assault', ownerId: 0, unitClass: 'wolf_archer', pos: { x: 7, y: 7 }, hp: 100, maxHp: 100, hasMoved: true, hasActed: true, movementRemaining: 3 },
        { id: 'capture', ownerId: 0, unitClass: 'soldier', pos: { x: 8, y: 8 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'repair', ownerId: 0, unitClass: 'soldier', pos: { x: 9, y: 9 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'catapult', ownerId: 0, unitClass: 'catapult', pos: { x: 8, y: 5 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
        { id: 'enemy', ownerId: 1, unitClass: 'soldier', pos: { x: 6, y: 3 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
    ];
    state.graves = [{ id: 'grave', pos: { x: 5, y: 4 }, remainingTurns: 3 }];
    state.map.tiles[8][8] = { terrainId: 9, ownerId: 1 }; state.map.tiles[9][9] = { terrainId: 8, ownerId: null };
    state.map.tiles[5][11] = { terrainId: 9, ownerId: null };
    state.map.tiles[2][2] = { terrainId: 10, ownerId: 0 };
    const options = { applyInitialTurnStart: false, disableAutoAdvanceWhenNoMeaningfulAction: true };
    const emptyEngine = new GameEngine(state, options);
    const emptyAction = emptyEngine.getLegalActions(0).find(a => a.type === 'recruit_to_castle' && a.castlePos.x === 2 && a.castlePos.y === 2)!;
    const emptyPending = emptyEngine.step(emptyAction).state;
    const stacked = structuredClone(state); stacked.rules!.commanderCastleRecruitUsesPending = true;
    const stackEngine = new GameEngine(stacked, options);
    const stackAction = stackEngine.getLegalActions(0).find(a => a.type === 'recruit_to_castle' && a.castlePos.x === 1 && a.castlePos.y === 1)!;
    const stackedPending = stackEngine.step(stackAction).state;
    return [state, emptyPending, stacked, stackedPending];
}
