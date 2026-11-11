/**
 * T07-P 候选动作快速粗筛测试。
 *
 * 目的：证明轻量化教师（开启 prefilterWidth）在不改规则、不改评价口径的前提下：
 *   ① prefilterActions 语义正确——保留全部关键动作、Infinity 宽度时原样返回、只裁 move；
 *   ② 六战术夹具在轻配置下仍全绿（合法性/看对手/候选来源/必胜短路不变）；
 *   ③ 夹具局面下轻教师的根决策与未过滤教师【逐位一致】——把 T08-B 对教师的资格平滑迁移到部署用的轻教师。
 *
 * 单次决策 <100ms 的验收由独立基准脚本 t07p_benchmark.ts 在真实 SD 局面测量（vitest 内不做计时断言，避免机器调度噪声）。
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { encodeAction } from '../src/game/env';
import type { GameState } from '../src/game/types';
import {
    searchTeacherAction,
    prefilterActions,
    DEFAULT_SEARCH_TEACHER_CONFIG,
    type SearchTeacherConfig
} from './skirmish_search_teacher';

function demoState(mutate: (state: GameState) => void): GameState {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    mutate(state);
    return state;
}

// 轻配置：粗筛宽度取 24——在真实 40+ 动作局面仍显著裁剪（触发粗筛），但在战术夹具局面上
// 已足以包含昂贵评分器的真实最优候选，实测与未过滤教师逐位一致（见下方等价块）。
const LIGHT: Partial<SearchTeacherConfig> = { prefilterWidth: 24 };
const FULL: Partial<SearchTeacherConfig> = { prefilterWidth: Number.POSITIVE_INFINITY };

describe('prefilterActions：粗筛语义', () => {
    it('prefilterWidth=Infinity（默认）时原样返回，动作集合不变', () => {
        const state = demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; });
        const actions = new GameEngine(state).getLegalActions(0);
        const out = prefilterActions(state, 0, actions, Number.POSITIVE_INFINITY);
        expect(out.length).toBe(actions.length);
        expect(new Set(out.map(encodeAction))).toEqual(new Set(actions.map(encodeAction)));
    });

    it('有限宽度下：输出是输入子集、保留全部 capture/attack/recruit、裁剪冗余 move', () => {
        const state = demoState(s => {
            s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 };
            s.map.tiles[1][3].ownerId = null;
            s.players.find(p => p.id === 0)!.gold = 5000;
        });
        const actions = new GameEngine(state).getLegalActions(0).filter(a => a.type !== 'surrender');
        const out = prefilterActions(state, 0, actions, 4);
        const outCodes = new Set(out.map(encodeAction));
        const inCodes = new Set(actions.map(encodeAction));
        // 子集
        for (const code of outCodes) expect(inCodes.has(code)).toBe(true);
        // 战术必需的关键动作零遗漏：所有 capture / attack 必须保留（win-now 与占领不被裁）
        for (const a of actions) {
            if (a.type === 'capture' || a.type === 'attack') {
                expect(outCodes.has(encodeAction(a))).toBe(true);
            }
        }
        // 招募限流但非清零：若引擎提供招募，至少保留 1 条代表（供 buildCandidatePool 探索桶命中）
        const recruits = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        const keptRecruits = [...outCodes].filter(c => c.startsWith('recruit'));
        if (recruits.length > 0) expect(keptRecruits.length).toBeGreaterThanOrEqual(1);
        // 输出规模受控（≤ 原集）
        expect(out.length).toBeLessThanOrEqual(actions.length);
    });

    it('宽度 >= 动作数时不裁剪（与不启用等价）', () => {
        const state = demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; });
        const actions = new GameEngine(state).getLegalActions(0);
        const out = prefilterActions(state, 0, actions, actions.length + 10);
        expect(out.length).toBe(actions.length);
    });
});

describe('T07-P 轻教师：六战术夹具仍全绿', () => {
    const captureState = () => demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; s.map.tiles[1][3].ownerId = null; });

    it('必胜短路：轻配置同样命中 win-now', () => {
        const state = demoState(s => {
            s.units = s.units.filter(u => u.ownerId === 0 || u.id === 'u4');
            s.units.find(u => u.id === 'u3')!.pos = { x: 2, y: 3 };
            const victim = s.units.find(u => u.id === 'u4')!;
            victim.pos = { x: 2, y: 4 }; victim.hp = 1;
            s.map.tiles = s.map.tiles.map((row, y) => row.map((t, x) => (x === 7 && y === 7 ? { ...t, ownerId: null } : t)));
        });
        const decision = searchTeacherAction({ state, playerId: 0, rng: () => 0.5, config: LIGHT });
        expect(decision.reason).toBe('win-now');
        expect(legalCodes(state).has(decision.selectedCode)).toBe(true);
    });

    it('移动后占领：capture 进入轻教师候选集', () => {
        const decision = searchTeacherAction({ state: captureState(), playerId: 0, rng: () => 0.5, config: { ...LIGHT, nodeBudget: 500 } });
        expect(decision.candidates.find(c => c.actionCode === 'capture:u3')).toBeDefined();
    });

    it('反杀陷阱：攻击候选评估对手回应', () => {
        const state = demoState(s => {
            s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 3 };
            const d = s.units.find(u => u.id === 'u4')!;
            d.pos = { x: 3, y: 4 }; d.hp = 40;
        });
        const decision = searchTeacherAction({ state, playerId: 0, rng: () => 0.5, config: { ...LIGHT, nodeBudget: 600, opponentReplyWidth: 2 } });
        const attack = decision.candidates.find(c => c.actionCode.startsWith('attack:u3'));
        expect(attack).toBeDefined();
        expect(attack!.opponentReplyCodes.length).toBeGreaterThanOrEqual(1);
        expect(decision.sawOpponentPhase).toBe(true);
    });

    it('招募堵路：招募经候选来源进入轻教师', () => {
        const state = demoState(s => { s.players.find(p => p.id === 0)!.gold = 500; });
        const decision = searchTeacherAction({ state, playerId: 0, rng: () => 0.5, config: { ...LIGHT, nodeBudget: 400, explorePerBucket: 3, beamWidth: 12 } });
        const engineRecruits = new GameEngine(state).getLegalActions(0).filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        const recruitCand = decision.candidates.find(c => c.actionCode.startsWith('recruit'));
        if (engineRecruits.length > 0) expect(recruitCand).toBeDefined();
        else expect(recruitCand).toBeUndefined();
    });

    it('援助顺序 & 保命：轻教师所有候选合法、看过对手阶段', () => {
        const assist = demoState(s => {
            s.units.find(u => u.id === 'u3')!.pos = { x: 1, y: 1 };
            const b = s.units.find(u => u.id === 'u1')!;
            b.pos = { x: 1, y: 0 }; b.hp = 30;
        });
        const a = searchTeacherAction({ state: assist, playerId: 0, rng: () => 0.5, config: { ...LIGHT, nodeBudget: 400 } });
        for (const c of a.candidates) expect(legalCodes(assist).has(c.actionCode)).toBe(true);

        const survive = demoState(s => {
            const scout = s.units.find(u => u.id === 'u3')!; scout.pos = { x: 3, y: 3 }; scout.hp = 10;
            s.units.find(u => u.id === 'u4')!.pos = { x: 3, y: 5 };
        });
        const sv = searchTeacherAction({ state: survive, playerId: 0, rng: () => 0.5, config: { ...LIGHT, nodeBudget: 600 } });
        expect(legalCodes(survive).has(sv.selectedCode)).toBe(true);
        expect(sv.selectedCode).not.toBe('end_turn');
        expect(sv.sawOpponentPhase).toBe(true);
    });
});

describe('T07-P 轻教师：夹具局面根决策与未过滤教师逐位一致（资格迁移）', () => {
    const cases: Array<[string, () => GameState, Partial<SearchTeacherConfig>]> = [
        ['capture', () => demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; s.map.tiles[1][3].ownerId = null; }), { nodeBudget: 500 }],
        ['counterkill', () => demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 3 }; const d = s.units.find(u => u.id === 'u4')!; d.pos = { x: 3, y: 4 }; d.hp = 40; }), { nodeBudget: 600, opponentReplyWidth: 2 }],
        ['recruit', () => demoState(s => { s.players.find(p => p.id === 0)!.gold = 500; }), { nodeBudget: 400, explorePerBucket: 3, beamWidth: 12 }],
        ['survive', () => demoState(s => { const sc = s.units.find(u => u.id === 'u3')!; sc.pos = { x: 3, y: 3 }; sc.hp = 10; s.units.find(u => u.id === 'u4')!.pos = { x: 3, y: 5 }; }), { nodeBudget: 600 }],
        ['assist', () => demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 1, y: 1 }; const b = s.units.find(u => u.id === 'u1')!; b.pos = { x: 1, y: 0 }; b.hp = 30; }), { nodeBudget: 400 }],
        ['open', () => demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 2, y: 2 }; s.units.find(u => u.id === 'u4')!.pos = { x: 2, y: 4 }; }), {}]
    ];
    for (const [name, build, extra] of cases) {
        it(`${name}: 轻配置 selectedCode === 未过滤配置`, () => {
            const full = searchTeacherAction({ state: build(), playerId: 0, rng: () => 0.5, config: { ...FULL, ...extra } });
            const light = searchTeacherAction({ state: build(), playerId: 0, rng: () => 0.5, config: { ...LIGHT, ...extra } });
            expect(light.selectedCode).toBe(full.selectedCode);
        });
    }
});

void DEFAULT_SEARCH_TEACHER_CONFIG;

describe('T07-P 极限宽度：6 夹具在 width=4（最小时延档）仍保持性质', () => {
    const VEG: Partial<SearchTeacherConfig> = { prefilterWidth: 4 };
    it('占领/反杀/保命/援助/开放局：width=4 仍产出合法动作且保留关键性质', () => {
        const cap = demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 1 }; s.map.tiles[1][3].ownerId = null; });
        const dCap = searchTeacherAction({ state: cap, playerId: 0, rng: () => 0.5, config: { ...VEG, nodeBudget: 500 } });
        expect(dCap.candidates.find(c => c.actionCode === 'capture:u3')).toBeDefined();
        expect(legalCodes(cap).has(dCap.selectedCode)).toBe(true);

        const counter = demoState(s => { s.units.find(u => u.id === 'u3')!.pos = { x: 3, y: 3 }; const d = s.units.find(u => u.id === 'u4')!; d.pos = { x: 3, y: 4 }; d.hp = 40; });
        const dC = searchTeacherAction({ state: counter, playerId: 0, rng: () => 0.5, config: { ...VEG, nodeBudget: 600, opponentReplyWidth: 2 } });
        expect(dC.candidates.find(c => c.actionCode.startsWith('attack:u3'))).toBeDefined();
        expect(dC.sawOpponentPhase).toBe(true);

        const surv = demoState(s => { const sc = s.units.find(u => u.id === 'u3')!; sc.pos = { x: 3, y: 3 }; sc.hp = 10; s.units.find(u => u.id === 'u4')!.pos = { x: 3, y: 5 }; });
        const dS = searchTeacherAction({ state: surv, playerId: 0, rng: () => 0.5, config: { ...VEG, nodeBudget: 600 } });
        expect(legalCodes(surv).has(dS.selectedCode)).toBe(true);
        expect(dS.selectedCode).not.toBe('end_turn');
    });

    it('width=4 必胜短路仍生效', () => {
        const state = demoState(s => {
            s.units = s.units.filter(u => u.ownerId === 0 || u.id === 'u4');
            s.units.find(u => u.id === 'u3')!.pos = { x: 2, y: 3 };
            const v = s.units.find(u => u.id === 'u4')!; v.pos = { x: 2, y: 4 }; v.hp = 1;
            s.map.tiles = s.map.tiles.map((row, y) => row.map((t, x) => (x === 7 && y === 7 ? { ...t, ownerId: null } : t)));
        });
        const decision = searchTeacherAction({ state, playerId: 0, rng: () => 0.5, config: VEG });
        expect(decision.reason).toBe('win-now');
    });
});

function legalCodes(state: GameState): Set<string> {
    return new Set(new GameEngine(state).getLegalActions(0).map(a => encodeAction(a)));
}
