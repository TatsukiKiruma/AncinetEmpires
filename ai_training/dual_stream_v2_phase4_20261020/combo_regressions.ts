import fs from 'node:fs';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { GameState, Unit, UnitClass, Action } from '../../src/game/types';
import { DualStreamTurnSearchAI, turnStateHash } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import type { DualStreamModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { tacticalActionPriors } from '../../src/ai_runtime/dual_v2/tactical_prior';
import { multiplayerLedger } from '../../src/ai_runtime/dual_v2/multiplayer_leaf';

const dir = import.meta.dirname;
const unit = (id: string, ownerId: number, unitClass: UnitClass, x: number, y: number, hp = 100): Unit => ({ id, ownerId, unitClass, pos: { x, y }, hp, maxHp: 100, hasMoved: false, hasActed: false });
function base(): GameState {
    return { turn: 1, currentPlayer: 0, winner: null, map: { width: 6, height: 6, tiles: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ terrainId: 6, ownerId: null }))) },
        players: [0, 1].map(id => ({ id, gold: 0, isAlive: true, commanderDeathCount: 0 })), units: [{ ...unit('self', 0, 'commander', 0, 0), hasActed: true, hasMoved: true }, { ...unit('enemy', 1, 'commander', 5, 5), apkStatic: true }], rules: { commanderCastleRecruitUsesPending: true, alliances: { 0: 0, 1: 1 } } };
}
const zero = { forward: (o: { actions: { pointers: Int32Array }; entityIndexMap: { globalActorIdx: number } }) => ({ logits: new Float32Array(o.actions.pointers.length / 5), valueProbs: Float32Array.of(.5, .5, 0, 0, 0, 0), valueLogits: Float32Array.of(0, 0, -1e9, -1e9, -1e9, -1e9) }) } as unknown as DualStreamModel;
function execute(state: GameState, maxUnits: number) {
    const engine = new GameEngine(state), traces: Action[] = [], witnesses: unknown[] = [];
    const ai = new DualStreamTurnSearchAI(zero, { maxUnits, budgetMs: 900, maxNodes: 180, onWitness: w => {
        const replay = new GameEngine(w.initial);
        for (const [i, a] of w.actions.entries()) {
            if (i > 0 && replay.getState().currentPlayer === 0) throw Error('反扑越过己方下一回合');
            if (!replay.getLegalActions(replay.getState().currentPlayer).some(b => encodeAction(b) === encodeAction(a))) throw Error('反扑见证非法'); replay.step(a);
        }
        if (turnStateHash(replay.getState()) !== w.finalHash) throw Error('反扑见证终态不同'); witnesses.push(w);
    } });
    const start = performance.now();
    const first = ai.getAction(engine, 0); traces.push(first); engine.step(first);
    const telemetry = { ...ai.telemetry };
    while (ai.memory.queue.length && !engine.isTerminal() && engine.getState().currentPlayer === 0) {
        const a = ai.getAction(engine, 0); if (!ai.telemetry.queued) throw Error('队列校验失效');
        if (!engine.getLegalActions(0).some(b => encodeAction(b) === encodeAction(a))) throw Error('己方计划非法');
        traces.push(a); engine.step(a);
    }
    return { state: engine.getState(), traces, telemetry, witnesses: witnesses.length, ms: performance.now() - start };
}
const fixtures: { name: string; state: GameState; success: (s: GameState, actions: Action[]) => boolean }[] = [];
{
    const s = base(); s.units.push(unit('a', 0, 'soldier', 2, 3), unit('b', 0, 'soldier', 3, 2), unit('occupier', 0, 'commander', 1, 3), unit('guard', 1, 'soldier', 3, 3, 60));
    s.map.tiles[3][3] = { terrainId: 10, ownerId: 1 };
    fixtures.push({ name: '集火斩杀并占城', state: s, success: t => !t.units.some(u => u.id === 'guard') && t.map.tiles[3][3].ownerId === 0 });
}
{
    const s = base(); s.units.push(unit('a', 0, 'archer', 1, 3), { ...unit('druid', 0, 'druid', 1, 2), level: 3, hasMoved: true }, unit('guard', 1, 'soldier', 3, 3, 70));
    fixtures.push({ name: '德鲁伊刷新主力二动斩杀', state: s, success: (t, a) => !t.units.some(u => u.id === 'guard') && a.some(x => x.type === 'support') && a.filter(x => x.type === 'attack' && x.attackerId === 'a').length >= 2 });
}
{
    const s = base(); s.units.push(unit('blocker', 0, 'archer', 3, 3), unit('striker', 0, 'soldier', 1, 3), unit('guard', 1, 'golem', 4, 3, 20));
    for (let y = 0; y < 6; y++) for (let x = 1; x < 5; x++) if (y !== 3 && !(x === 3 && y === 2)) s.map.tiles[y][x] = { terrainId: 2, ownerId: null, apkMoveCost: 999999 };
    fixtures.push({ name: '腾格让位后近战斩杀', state: s, success: (t, a) => !t.units.some(u => u.id === 'guard') && a.some(x => x.type === 'move' && x.unitId === 'blocker') && a.some(x => x.type === 'move' && x.unitId === 'striker' && x.to.x === 3 && x.to.y === 3) });
}
{
    const s = base(); s.units.push(unit('garrison', 0, 'soldier', 1, 1)); s.map.tiles[1][1] = { terrainId: 10, ownerId: 0 }; s.map.tiles[1][3] = { terrainId: 9, ownerId: null };
    s.players[0].gold = 200; s.rules = { ...s.rules, recruitableUnits: ['soldier'] };
    fixtures.push({ name: '出城占村空城招募并外移', state: s, success: (t, a) => t.map.tiles[1][3].ownerId === 0 && a.some(x => x.type === 'recruit_to_castle') && t.units.some(u => u.id.startsWith('u_') && (u.pos.x !== 1 || u.pos.y !== 1)) });
}
const results = fixtures.map(f => {
    const red = execute(f.state, 1), green = execute(f.state, 3);
    const redCannotKill = !f.state.units.some(u => u.id === 'guard') || red.state.units.some(u => u.id === 'guard');
    return { name: f.name, initial: f.state, red: { ...red, success: f.success(red.state, red.traces), redCannotKill }, green: { ...green, success: f.success(green.state, green.traces) }, passed: redCannotKill && !f.success(red.state, red.traces) && f.success(green.state, green.traces) };
});
const special = fixtures[3].state, e = new GameEngine(special), legal = e.getLegalActions(0), p = tacticalActionPriors(e.getState(), legal);
const wait = legal.findIndex(a => a.type === 'wait' && a.unitId === 'garrison');
const ledger = multiplayerLedger(special, structuredClone(special), 0);
const passed = results.every(r => r.passed) && p[wait].forbidden && ledger.net === 0;
fs.writeFileSync(dir + '/multi-unit-combo-regressions.json', JSON.stringify({ passed, source: '独立合法夹具，零网络分数隔离搜索机制', results }, null, 2));
console.log(JSON.stringify({ passed, results: results.map(r => ({ name: r.name, passed: r.passed, red: r.red.traces, green: r.green.traces, telemetry: r.green.telemetry })) }));
process.exitCode = passed ? 0 : 1;
