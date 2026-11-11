import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import type { DualStreamModel } from './model_runtime';
import { DualStreamTurnSearchAI } from './turn_search_ai';
import { createDefaultAppGameState } from '../../game/default_state';
import { multiplayerLedger } from './multiplayer_leaf';
import { strongestAllianceDamage } from './alliance_threat';
import { takeoverDecision, type BranchEvidence } from './takeover_guard';

const evidence = (): BranchEvidence => ({ ledger: multiplayerLedger(createDefaultAppGameState(), createDefaultAppGameState(), 0), score: 0, ledgerScore: 0, health: new Map([['指挥官', 100]]), lethalActors: 0, supports: 0, complete: true });

describe('阶段5.4进攻收益与联盟威胁', () => {
    it.each(['enemyCommanderKills', 'enemyKills', 'castles', 'towns'] as const)('普通单位避险不得否决已有%s战果', key => {
        const primary = evidence(), candidate = evidence(); primary.lethalActors = 1; primary.ledger[key] = 1;
        candidate.score = 10;
        expect(takeoverDecision(primary, candidate)).toBeNull();
    });
    it('低分撤退不能触发避险否决；同分同战果可否决；指挥官仍优先保护', () => {
        const primary = evidence(), candidate = evidence(); primary.lethalActors = 1; primary.score = 1;
        expect(takeoverDecision(primary, candidate)).toBeNull();
        candidate.score = 1; expect(takeoverDecision(primary, candidate)).toBe('veto');
        candidate.score = -100; primary.health.set('指挥官', 99);
        expect(takeoverDecision(primary, candidate)).toBe('veto');
    });
    it('互相敌对的三个阵营不能合并虚构致死，同联盟仍合并前三击', () => {
        const state = createDefaultAppGameState(), defender = state.units.find(u => u.ownerId === 0)!;
        const template = state.units.find(u => u.ownerId === 1)!;
        state.units = [defender, ...[1, 2, 3, 4].map(ownerId => ({ ...structuredClone(template), id: `敌军${ownerId}`, ownerId }))];
        state.rules = { ...state.rules, alliances: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 } };
        const context = { projectedDamage: () => 40 };
        expect(strongestAllianceDamage(state, 0, defender, context)).toBe(40);
        state.rules.alliances = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1 };
        expect(strongestAllianceDamage(state, 0, defender, context)).toBe(120);
    });
});

describe('阶段5.4五单位反扑与深度预算', () => {
    function retaliationProbe() {
        const state = createDefaultAppGameState(), self = state.currentPlayer;
        const own = structuredClone(state.units.find(u => u.ownerId === self)!);
        const enemy = structuredClone(state.units.find(u => u.ownerId !== self)!);
        state.players.forEach(p => { p.gold = 0; });
        state.map.tiles = state.map.tiles.map(row => row.map(() => ({ terrainId: 6, ownerId: null })));
        state.units = [{ ...own, id: '己方指挥官', pos: { x: 0, y: 0 } }, { ...enemy, id: '敌方指挥官', pos: { x: 12, y: 12 }, apkStatic: true },
            ...Array.from({ length: 7 }, (_, i) => ({ ...structuredClone(enemy), id: `敌方步兵${i}`, unitClass: 'soldier' as const, pos: { x: i + 3, y: 8 } }))];
        const ai = new DualStreamTurnSearchAI({ forward: () => { throw Error('反扑不得调用网络'); } } as unknown as DualStreamModel) as any;
        ai.deadline = performance.now() + 10000;
        return { ai, self, branch: { engine: new GameEngine(state), queue: [], actors: [], prior: 0, score: 0 } };
    }
    it('充足预算下默认真实完结五条敌方单位链', () => {
        const { ai, self, branch } = retaliationProbe();
        const result = ai.retaliation(branch, self);
        expect(result.complete).toBe(true); expect(result.expandedChains).toBe(5); expect(result.coreChains).toBe(2);
    });
    it('核心两链之后自适应静态收口不冒称额外真实展开，也不误记未完成', () => {
        const { ai, self, branch } = retaliationProbe(), original = ai.complete.bind(ai);
        let completed = 0;
        vi.spyOn(ai, 'complete').mockImplementation((...args: unknown[]) => {
            const result = original(...args);
            if (++completed === 2) ai.deadline = performance.now() + 20;
            return result;
        });
        const result = ai.retaliation(branch, self);
        expect(result.expandedChains).toBe(2); expect(result.coreChains).toBe(2);
        expect(result.adaptiveClosures).toBe(1); expect(result.staticComplete).toBe(true); expect(result.complete).toBe(true);
    });
    it('第二条核心链预算过期仍严格判为未完成', () => {
        const { ai, self, branch } = retaliationProbe(), original = ai.complete.bind(ai);
        vi.spyOn(ai, 'complete').mockImplementation((...args: unknown[]) => {
            const result = original(...args); ai.deadline = performance.now() - 1; return result;
        });
        const result = ai.retaliation(branch, self);
        expect(result.expandedChains).toBe(1); expect(result.complete).toBe(false);
    });
    function multiplayerProbe() {
        const { ai, self, branch } = retaliationProbe(), state = branch.engine.getState();
        const template = state.units.find(u => u.ownerId !== self)!;
        state.map = { width: 18, height: 18, tiles: Array.from({ length: 18 }, () => Array.from({ length: 18 }, () => ({ terrainId: 6, ownerId: null }))) };
        state.players.push({ ...state.players[1], id: 2 }, { ...state.players[1], id: 3 });
        state.rules = { ...state.rules, alliances: { 0: 0, 1: 1, 2: 2, 3: 3 } };
        state.units = state.units.filter(u => u.ownerId === self);
        for (const player of [1, 2, 3]) {
            const king = player === 1 ? { x: 17, y: 0 } : player === 2 ? { x: 0, y: 17 } : { x: 17, y: 17 };
            state.units.push({ ...structuredClone(template), id: `指挥官${player}`, ownerId: player, pos: king, apkStatic: true });
            for (let i = 0; i < 4; i++) state.units.push({ ...structuredClone(template), id: `步兵${player}-${i}`, ownerId: player, unitClass: 'soldier', apkStatic: false, pos: player === 1 ? { x: 14 + i, y: 1 } : player === 2 ? { x: 1, y: 14 + i } : { x: 14 + i, y: 16 } });
        }
        return { ai, self, branch: { ...branch, engine: new GameEngine(state) } };
    }
    it('四人局总计八链，仍为后续每个敌方顺位保留两条核心链', () => {
        const { ai, self, branch } = multiplayerProbe();
        const original = ai.complete.bind(ai), byPlayer = new Map<number, number>();
        vi.spyOn(ai, 'complete').mockImplementation((...args: any[]) => {
            const result = original(...args);
            if (result.length) byPlayer.set(args[2], (byPlayer.get(args[2]) ?? 0) + 1);
            return result;
        });
        const result = ai.retaliation(branch, self);
        expect(result.complete).toBe(true); expect(result.expandedChains).toBe(8); expect(result.coreChains).toBe(6);
        expect([...byPlayer]).toEqual([[1, 4], [2, 2], [3, 2]]);
    });
    it('延伸链须同时给后续敌方预留核心时间，不能只预留链数', () => {
        const { ai, self, branch } = multiplayerProbe(), complete = ai.complete.bind(ai), first = ai.retaliationFirst.bind(ai);
        const byPlayer = new Map<number, number>();
        vi.spyOn(ai, 'complete').mockImplementation((...args: any[]) => {
            const result = complete(...args);
            if (result.length) {
                byPlayer.set(args[2], (byPlayer.get(args[2]) ?? 0) + 1);
                if (args[2] === 1 && byPlayer.get(1) === 2) ai.deadline = performance.now() + 160;
            }
            return result;
        });
        // 只对第一顺位的延伸入场制造紧窗口，后续顺位恢复充分预算以隔离该边界。
        vi.spyOn(ai, 'retaliationFirst').mockImplementation((view: GameEngine) => {
            if (view.getState().currentPlayer === 2) ai.deadline = performance.now() + 10000;
            return first(view);
        });
        const result = ai.retaliation(branch, self);
        expect(byPlayer.get(1)).toBe(2); expect(result.adaptiveClosures).toBeGreaterThanOrEqual(1);
        expect(result.complete).toBe(true); expect(result.coreChains).toBe(6);
    });
    it('默认节点预算允许第260个节点并拒绝第261个', () => {
        const { ai, self, branch } = retaliationProbe();
        const action = branch.engine.getLegalActions(self).find(a => a.type === 'move')!;
        ai.nodes = 259;
        expect(ai.apply(branch, action)).not.toBeNull(); expect(ai.nodes).toBe(260);
        expect(ai.apply(branch, action)).toBeNull();
    });
    it.each([2, 3])('%s人局的充足预算决赛圈分别保留四案或三案', players => {
        const state = createDefaultAppGameState();
        if (players === 3) {
            state.players.push({ ...state.players[1], id: 2 });
            state.units.push({ ...structuredClone(state.units[1]), id: '第三方指挥官', ownerId: 2, pos: { x: 3, y: 3 } });
        }
        const engine = new GameEngine(state), self = state.currentPlayer;
        const actions = engine.getLegalActions(self).filter(a => a.type === 'move').slice(0, 4);
        const model = { forward: () => ({ valueProbs: Float32Array.of(.5, .5, 0, 0, 0, 0) }) } as unknown as DualStreamModel;
        const ai = new DualStreamTurnSearchAI(model, { maxUnits: 1 }) as any;
        vi.spyOn(ai, 'candidateRoots').mockReturnValue(actions.map(action => ({ action, score: 0 })));
        vi.spyOn(ai, 'complete').mockImplementation((_branch: unknown, action: unknown) => [{ engine, queue: [{ state, action }], actors: ['同一单位'], prior: 0, score: 0 }]);
        vi.spyOn(ai, 'retaliation').mockReturnValue({ penalty: 0, commanders: new Map(), complete: true, staticComplete: true, lethalActors: 0, expandedChains: 0, staticCoveredUnits: 0 });
        ai.getAction(engine, self);
        expect(ai.telemetry.comparedUnits).toHaveLength(players === 2 ? 4 : 3);
        expect(ai.deadline - ai.tierOneEnd).toBeCloseTo(880 * .58, 0);
        expect(ai.retaliationLimit - ai.deadline).toBeCloseTo(70, 0);
    });
    it('末尾挑战案不足完整反扑窗口时不启动，并明确记录跳过数量', () => {
        const engine = new GameEngine(createDefaultAppGameState()), state = engine.getState(), self = state.currentPlayer;
        const actions = engine.getLegalActions(self).filter(a => a.type === 'move').slice(0, 4);
        const model = { forward: () => ({ valueProbs: Float32Array.of(.5, .5, 0, 0, 0, 0) }) } as unknown as DualStreamModel;
        const ai = new DualStreamTurnSearchAI(model, { maxUnits: 1 }) as any;
        vi.spyOn(ai, 'candidateRoots').mockReturnValue(actions.map(action => ({ action, score: 0 })));
        vi.spyOn(ai, 'complete').mockImplementation((_branch: unknown, action: unknown) => [{ engine, queue: [{ state, action }], actors: ['同一单位'], prior: 0, score: 0 }]);
        const reaction = vi.spyOn(ai, 'retaliation').mockImplementation(() => {
            ai.retaliationLimit = performance.now() + 219;
            return { penalty: 0, commanders: new Map(), complete: true, staticComplete: true, lethalActors: 0, expandedChains: 2, staticCoveredUnits: 0 };
        });
        ai.getAction(engine, self);
        expect(ai.telemetry.plannedFinalists).toBe(4); expect(ai.telemetry.budgetSkippedCandidates).toBe(3);
        expect(reaction).toHaveBeenCalledTimes(1); expect(ai.telemetry.comparedUnits).toHaveLength(1);
        expect(ai.telemetry.retaliationAttempts).toBe(1); expect(ai.telemetry.retaliationComplete).toBe(1);
    });
});
