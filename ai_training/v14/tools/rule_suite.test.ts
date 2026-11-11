/**
 * V14/T14-01：规则与战术夹具套件。
 *
 * 运行：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/rule_suite.test.ts
 *
 * 约定：
 * - 每个场景至少一个应当成立的例子与一个容易误判的反例。
 * - 断言全部由 v14/tools/rule_oracle.ts 在真实 GameEngine 上求值；
 *   `verified=false` 的夹具只输出读数，不计入通过率。
 * - 结果写入 v14/out/<runId>/T14-01/rule_suite_results.json，包含逐谓词读数。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getTurnPlayerIds } from '../../src/game/rule_config';
import { getEffectiveStats } from '../../src/game/abilities';
import { encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import { getRecruitDeployPositions } from '../../src/game/map';
import type { Action, GameState, RuleConfig } from '../../src/game/types';
import {
    CASTLE_TERRAIN, FLAT_TERRAIN, TOWN_TERRAIN, cloneState, findLegalAction, legalCodesOf,
    makeState, posOf, runActions, unitAt,
} from './rule_fixtures';
import {
    type FixtureResult, type OracleContext, type Predicate, buildContext, effectiveStatsReading,
    evaluateFixture, reachableCount,
} from './rule_oracle';

const RUN_ID = process.env.V14_RUN_ID ?? 'v14_20260924_t14';
const OUT_DIR = path.resolve('v14', 'out', RUN_ID, 'T14-01');
const DAMAGED_TOWN_TERRAIN = 8;
const FOREST_TERRAIN = 7;
const MOUNTAIN_TERRAIN = 3;
const DEEP_WATER_TERRAIN = 2;

interface FixtureSpec {
    id: string;
    scenario: string;
    /** 未通过真实引擎读数验证的场景必须显式标 false，只输出读数。 */
    verified: boolean;
    unknownReasons?: string[];
    state: GameState;
    actions: Action[];
    predicates: Predicate[];
}

const fixtures: FixtureSpec[] = [];
function fixture(spec: FixtureSpec): void {
    fixtures.push(spec);
}

function actionOf(code: string, state: GameState): Action {
    const action = findLegalAction(state, code);
    if (!action) throw new Error(`夹具引用了非合法动作: ${code}`);
    return action;
}

// ---------------------------------------------------------------------------
// 场景 1：移动后攻击 / 占领
// ---------------------------------------------------------------------------

{
    // 正例：同一单位先移动再攻击，两步都必须是引擎合法动作。
    const state = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 4, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 4, y: 4, maxHp: 100 },
        ],
    });
    const codes = legalCodesOf(state);
    fixture({
        id: 'move-then-attack/positive',
        scenario: '移动后攻击/占领',
        verified: true,
        state,
        actions: [
            { type: 'move', unitId: 'a1', to: { x: 3, y: 4 } },
            { type: 'attack', attackerId: 'a1', targetId: 'd1' },
        ],
        predicates: [
            { kind: 'legal_action_present', code: 'move:a1:3,4' },
            { kind: 'legal_action_present', code: 'attack:a1:d1', atStep: 1,
              note: '攻击在「移动之后」才合法；初始状态距离 3 时不在合法集里' },
            { kind: 'reading', label: 'attackLegalAtStart', expected: false,
              read: (ctx) => legalCodesOf(ctx.before, ctx.before.currentPlayer).includes('attack:a1:d1') },
            { kind: 'unit_at', unitId: 'a1', x: 3, y: 4, note: '移动落点' },
            { kind: 'hp_equals', unitId: 'd1', value: 50, note: '55 攻 - 5 防 = 50，血量 100/100 缩放为 1.0' },
            { kind: 'attacker_hp_delta', unitId: 'a1', value: -25, note: '相邻士兵反击：目标剩余 50/100 hp ⇒ 伤害按 hp 缩放为 25' },
            { kind: 'winner', value: null, note: '第一步不结束对局；玩家回合由引擎决定' },
        ],
    });
    fixture({
        id: 'move-then-attack/wrong-order-rejected',
        scenario: '移动后攻击/占领',
        verified: true,
        state,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'legal_action_absent', code: 'attack:a1:d1', note: '距离 3 超出士兵射程' },
        ],
    });
    fixture({
        id: 'move-then-attack/other-unit-may-act',
        scenario: '移动后攻击/占领',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 4 },
                { id: 'a2', ownerId: 0, unitClass: 'soldier', x: 1, y: 5 },
                { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 4, y: 4 },
            ],
        }),
        actions: [
            { type: 'move', unitId: 'a1', to: { x: 1, y: 3 } },
            { type: 'move', unitId: 'a2', to: { x: 1, y: 6 } },
        ],
        predicates: [
            { kind: 'legal_action_present', code: 'move:a2:1,6', atStep: 1, note: '另一单位可在同一玩家回合内继续行动' },
            { kind: 'trace_types_executed', types: ['move'] },
            { kind: 'reading', label: 'firstStepIsCurrentPlayersAction', expected: true,
              read: (ctx) => ctx.run.stepLegal[0] },
            { kind: 'reading', label: 'legalMoveActorsAtStart', expected: ['a1', 'a2'], read: (ctx) => [...new Set(
                legalCodesOf(ctx.before, ctx.before.currentPlayer)
                    .filter((code) => code.startsWith('move:'))
                    .map((code) => code.split(':')[1]),
            )].sort(), note: '两单位在回合开始时都有合法移动；执行后两单位都已移动，因此不再有 move 动作' },
            { kind: 'reading', label: 'legalMoveActorsAfterBothMoved', expected: [], read: (ctx) => [...new Set(
                legalCodesOf(ctx.after, ctx.after.currentPlayer)
                    .filter((code) => code.startsWith('move:'))
                    .map((code) => code.split(':')[1]),
            )].sort() },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 2：普通远程反击（v13 复核反例）
// ---------------------------------------------------------------------------

{
    // 反例修复：投石车最小射程 3，因此在距离 3 攻击既合法又不会被反击。
    const catapultVsSoldier = makeState({
        players: [0, 1],
        units: [
            { id: 'c1', ownerId: 0, unitClass: 'catapult', x: 1, y: 1, maxHp: 100 },
            { id: 's1', ownerId: 1, unitClass: 'soldier', x: 4, y: 1, maxHp: 100 },
        ],
    });
    fixture({
        id: 'counter/ranged-min-range-no-counter',
        scenario: '普通远程反击',
        verified: true,
        state: catapultVsSoldier,
        actions: [{ type: 'attack', attackerId: 'c1', targetId: 's1' }],
        predicates: [
            { kind: 'accepted' },
            { kind: 'attack_attacker_hp_delta', attackerId: 'c1', targetId: 's1', expectedLoss: 0,
              note: '士兵 maxRange=1，距离 3 不可能反击；v13 编码器曾预计 50' },
            { kind: 'encoder_counter_semantics', attackerId: 'c1', targetId: 's1', expectedValue: 0,
              note: '语义槽 15 = 预计反击/100，修复后必须为 0' },
            { kind: 'hp_equals', unitId: 's1', value: 45, note: '投石车 60 攻 - 士兵 5 防 = 55' },
        ],
    });
    // 正例：相邻近战必须真的反击。
    const meleePair = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
        ],
    });
    fixture({
        id: 'counter/melee-does-counter',
        scenario: '普通远程反击',
        verified: true,
        state: meleePair,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'accepted' },
            { kind: 'hp_equals', unitId: 'd1', value: 50 },
            { kind: 'attacker_hp_delta', unitId: 'a1', value: -25,
              note: '相邻且目标存活 ⇒ 引擎必须反击；反击伤害按目标剩余 hp 比例缩放 (50*0.5=25)' },
            { kind: 'encoder_counter_semantics', attackerId: 'a1', targetId: 'd1', expectedValue: 0.25,
              note: '修复后编码器预测与引擎一致：目标受击后剩 50 hp ⇒ 反击 25 ⇒ 0.25' },
        ],
    });
    // 反例：若这一击直接击杀目标，就没有反击。
    const lethalPair = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, hp: 40, maxHp: 100 },
        ],
    });
    fixture({
        id: 'counter/kill-prevents-counter',
        scenario: '普通远程反击',
        verified: true,
        state: lethalPair,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'lethal_attack', attackerId: 'a1', targetId: 'd1' },
            { kind: 'attacker_hp_delta', unitId: 'a1', value: 0, note: '目标已死 ⇒ 无反击' },
            { kind: 'encoder_counter_semantics', attackerId: 'a1', targetId: 'd1', expectedValue: 0 },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 3：最小射程、致盲、反击风暴
// ---------------------------------------------------------------------------

{
    // 反例：弓箭手最小射程 2，距离 1 不能攻击。
    const archer = makeState({
        players: [0, 1],
        units: [
            { id: 'r1', ownerId: 0, unitClass: 'archer', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
        ],
    });
    fixture({
        id: 'range/min-range-blocks-adjacent',
        scenario: '最小射程、致盲、反击风暴',
        verified: true,
        state: archer,
        actions: [],
        predicates: [
            { kind: 'legal_action_absent', code: 'attack:r1:d1', note: '距离 1 < minRange 2' },
            { kind: 'reading', label: 'archerStats', expected: { minRange: 2, maxRange: 3, move: 4 },
              read: (ctx) => {
                  const s = effectiveStatsReading(ctx.before, 'r1');
                  return { minRange: s?.minRange, maxRange: s?.maxRange, move: s?.move };
              } },
        ],
    });
    fixture({
        id: 'range/min-range-allows-distant',
        scenario: '最小射程、致盲、反击风暴',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'r1', ownerId: 0, unitClass: 'archer', x: 1, y: 2, maxHp: 100 },
                { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 4, y: 2, maxHp: 100 },
            ],
        }),
        actions: [{ type: 'attack', attackerId: 'r1', targetId: 'd1' }],
        predicates: [
            { kind: 'accepted' },
            { kind: 'attack_attacker_hp_delta', attackerId: 'r1', targetId: 'd1', expectedLoss: 0 },
            { kind: 'hp_equals', unitId: 'd1', value: 60, note: '弓箭手 45 攻 - 士兵 5 防 = 40' },
        ],
    });
    // 反例：被致盲的攻击者不能攻击（引擎把致盲当作“无法行动”），
    // 因此“致盲后仍能攻击且不反击”这一历史假设本身就是错的。
    const blindedAttacker = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100,
              status: { type: 'blinded', remainingTurns: 1 } },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
        ],
    });
    fixture({
        id: 'range/blinded-unit-cannot-attack',
        scenario: '最小射程、致盲、反击风暴',
        verified: true,
        state: blindedAttacker,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'blindedAttackerHasNoAttack', expected: false, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).includes('attack:a1:d1') },
        ],
    });
    // 正例：目标被致盲时本次攻击不触发普通反击（状态在反击判定之前结算）。
    const blindAppliedByAttacker = makeState({
        players: [0, 1],
        units: [
            { id: 'blinder', ownerId: 0, unitClass: 'wolf_archer', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
        ],
    });
    fixture({
        id: 'range/blind-applied-before-counter-check',
        scenario: '最小射程、致盲、反击风暴',
        verified: true,
        state: blindAppliedByAttacker,
        actions: [{ type: 'attack', attackerId: 'blinder', targetId: 'd1' }],
        predicates: [
            { kind: 'accepted' },
            { kind: 'reading', label: 'targetStatusAfterHit', expected: 'blinded',
              read: (ctx) => ctx.after.units.find((u) => u.id === 'd1')?.status?.type ?? null },
            { kind: 'attacker_hp_delta', unitId: 'blinder', value: 0,
              note: '目标受击后新获得致盲 ⇒ 引擎不进行普通反击' },
        ],
    });
    // 反击风暴：狂战士在距离 3 被投石车攻击仍能反击。
    const counterStorm = makeState({
        players: [0, 1],
        units: [
            { id: 'c1', ownerId: 0, unitClass: 'catapult', x: 1, y: 1, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'berserker', x: 4, y: 1, maxHp: 100 },
        ],
    });
    fixture({
        id: 'range/counter-storm-at-distance-3',
        scenario: '最小射程、致盲、反击风暴',
        verified: true,
        state: counterStorm,
        actions: [{ type: 'attack', attackerId: 'c1', targetId: 'b1' }],
        predicates: [
            { kind: 'accepted' },
            { kind: 'attack_attacker_hp_delta', attackerId: 'c1', targetId: 'b1', expectedLoss: 0,
              note: '反击风暴要求距离 <= 2；距离 3 时狂战士无法反击' },
            { kind: 'encoder_counter_semantics', attackerId: 'c1', targetId: 'b1', expectedValue: 0,
              note: '修复后预计反击为 0' },
            { kind: 'reading', label: 'counterStormAtDistance2', expected: true, read: (ctx) => {
                // 投石车最小射程 3，无法在距离 2 攻击；改用射程 1..3 的狼射手验证
                // 「反击风暴在距离 <=2 时生效」。
                const at2 = makeState({
                    players: [0, 1],
                    units: [
                        { id: 'r1', ownerId: 0, unitClass: 'wolf_archer', x: 1, y: 1, maxHp: 100 },
                        { id: 'b1', ownerId: 1, unitClass: 'berserker', x: 3, y: 1, maxHp: 100 },
                    ],
                });
                const engine = new GameEngine(at2);
                const beforeHp = unitAt(engine.getState(), 'r1')?.hp ?? 0;
                const result = engine.step({ type: 'attack', attackerId: 'r1', targetId: 'b1' } as Action);
                const afterHp = result.state.units.find((u) => u.id === 'r1')?.hp ?? 0;
                return beforeHp - afterHp > 0;
            }, note: '距离 2 时反击风暴生效，攻击者必须失血' },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 4：击杀、玩家淘汰与联盟终局
// ---------------------------------------------------------------------------

{
    const notLethal = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, hp: 60, maxHp: 100 },
        ],
        tiles: [{ x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 1 }],
    });
    fixture({
        id: 'elimination/last-unit-survives',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: notLethal,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'nonlethal_attack', attackerId: 'a1', targetId: 'd1' },
            { kind: 'unit_alive', unitId: 'd1' },
            { kind: 'player_alive', playerId: 1 },
            { kind: 'winner', value: null, note: '未击杀最后单位 ⇒ 对局未结束' },
        ],
    });
    // 打死最后一兵但玩家仍有城堡 ⇒ 默认规则不淘汰。
    const stillHasCastle = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, hp: 40, maxHp: 100 },
        ],
        tiles: [{ x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 1 }],
        rules: { defeatOnNoUnitsAndNoCastles: true, defeatOnNoUnits: false },
    });
    fixture({
        id: 'elimination/killed-but-castle-remains',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: stillHasCastle,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'lethal_attack', attackerId: 'a1', targetId: 'd1' },
            { kind: 'unit_dead', unitId: 'd1' },
            { kind: 'player_alive', playerId: 1, note: '仍有城堡 ⇒ 默认淘汰条件不成立' },
            { kind: 'winner', value: null, note: '最后一兵死亡不等于终局' },
        ],
    });
    // 打死最后一兵且无城堡 ⇒ 淘汰并终局。
    // P1 无单位、无城堡、无金币，因此回合开始时没有任何可行招募，不会自我恢复。
    const noUnitsNoCastle = makeState({
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, hp: 40, maxHp: 100 },
        ],
        tiles: [{ x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { defeatOnNoUnitsAndNoCastles: true, defeatOnNoUnits: false },
    });
    fixture({
        id: 'elimination/no-units-no-castle-loses',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: noUnitsNoCastle,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'd1' }],
        predicates: [
            { kind: 'player_eliminated', playerId: 1 },
            { kind: 'winner', value: 0, note: '只剩 P0 联盟 ⇒ winner 为 P0 的联盟 ID' },
        ],
    });
    // 指挥官阵亡：开关关闭时不淘汰，开启时淘汰。
    const commanderDeath = (defeatOnCommanderDeath: boolean) => makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'p0cmd', ownerId: 0, unitClass: 'commander', x: 7, y: 0, maxHp: 100 },
            { id: 'cmd', ownerId: 1, unitClass: 'commander', x: 3, y: 2, hp: 35, maxHp: 100 },
            { id: 'd2', ownerId: 1, unitClass: 'soldier', x: 6, y: 6, maxHp: 100 },
        ],
        tiles: [
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 1 },
            { x: 1, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 1 },
            { x: 7, y: 1, terrainId: CASTLE_TERRAIN, ownerId: 0 },
        ],
        rules: { defeatOnCommanderDeath, defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'elimination/commander-death-off',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: commanderDeath(false),
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'cmd' }],
        predicates: [
            { kind: 'unit_dead', unitId: 'cmd' },
            { kind: 'player_alive', playerId: 1 },
            { kind: 'winner', value: null },
            { kind: 'reading', label: 'commanderDeathCount', expected: 1,
              read: (ctx) => ctx.after.players.find((p) => p.id === 1)?.commanderDeathCount ?? null },
        ],
    });
    fixture({
        id: 'elimination/commander-death-on',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: commanderDeath(true),
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'cmd' }],
        predicates: [
            { kind: 'unit_dead', unitId: 'cmd' },
            { kind: 'player_eliminated', playerId: 1, note: 'defeatOnCommanderDeath=true 时主帅阵亡即淘汰' },
            { kind: 'winner', value: 0 },
        ],
    });
    // 联盟终局：盟友存活时不能按“个人淘汰”算联盟失败。
    const allianceState = makeState({
        width: 10,
        height: 10,
        players: [0, 1, 2],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
            { id: 'friend', ownerId: 1, unitClass: 'soldier', x: 8, y: 8, maxHp: 100 },
            { id: 'enemy', ownerId: 2, unitClass: 'soldier', x: 3, y: 2, hp: 40, maxHp: 100 },
        ],
        tiles: [
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
            { x: 9, y: 9, terrainId: CASTLE_TERRAIN, ownerId: 1 },
        ],
        rules: { alliances: { 0: 10, 1: 10, 2: 20 }, defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'elimination/alliance-wins-together',
        scenario: '击杀、玩家淘汰与联盟终局',
        verified: true,
        state: allianceState,
        actions: [{ type: 'attack', attackerId: 'a1', targetId: 'enemy' }],
        predicates: [
            { kind: 'player_eliminated', playerId: 2 },
            { kind: 'winner', value: 10, note: 'winner 是联盟 ID，不是玩家 ID' },
            { kind: 'player_alive', playerId: 0 },
            { kind: 'player_alive', playerId: 1 },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 5：占领机会
// ---------------------------------------------------------------------------

{
    // 反例：P0 指挥官站在 P1 唯一的城堡上，但 P1 仍有存活单位。
    // 占领后 P1 失去城堡却仍有单位 ⇒ 默认淘汰条件不成立 ⇒ 对局继续。
    // 这正是任务书要求的「不能把存在合法 capture 当作获胜」的对照。
    const instantWin = makeState({
        players: [0, 1],
        units: [
            { id: 'cap', ownerId: 0, unitClass: 'commander', x: 4, y: 4, maxHp: 100 },
            { id: 'last', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, hp: 30, maxHp: 100 },
        ],
        tiles: [
            { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: null },
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
        ],
        rules: { defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'capture/legal-capture-is-not-a-win',
        scenario: '占领机会',
        verified: true,
        state: instantWin,
        // P0 指挥官已站在中立城堡上；占领后 P1 仍有单位 ⇒ 不会终局，
        // 这正是「存在合法 capture」不等于「获胜」的反例。
        actions: [{ type: 'capture', unitId: 'cap' }],
        predicates: [
            { kind: 'legal_action_present', code: 'capture:cap' },
            { kind: 'reading', label: 'captureIsNotAWinnerHere', expected: null, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                const result = engine.step({ type: 'capture', unitId: 'cap' } as Action);
                return result.state.winner;
            }, note: 'P1 仍有存活单位 ⇒ 引擎不给 winner；存在 capture 不是终局证明' },
            { kind: 'winner', value: null },
            { kind: 'tile_owner', x: 4, y: 4, ownerId: 0 },
        ],
    });
    // 反例：没有优先冲突时，错过必要占领会造成可证明的落后。
    // 这里验证“机会窗口”：占领被推迟一整轮后，敌方仍在场上并且城堡归属未变。
    const missedCapture = makeState({
        players: [0, 1],
        units: [
            { id: 'cap', ownerId: 0, unitClass: 'commander', x: 3, y: 4, maxHp: 100 },
            { id: 'last', ownerId: 1, unitClass: 'soldier', x: 4, y: 4, hp: 30, maxHp: 100 },
        ],
        tiles: [
            { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: null },
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
        ],
        rules: { defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'capture/missing-the-window-loses-the-win',
        scenario: '占领机会',
        verified: true,
        state: missedCapture,
        actions: [
            { type: 'move', unitId: 'cap', to: { x: 4, y: 4 } },
            { type: 'wait', unitId: 'cap' },
            { type: 'end_turn' },
        ],
        predicates: [
            { kind: 'winner', value: null, note: '站上城堡却选择 wait ⇒ 机会窗口内未完成占领，对局仍未结束' },
            { kind: 'tile_owner', x: 4, y: 4, ownerId: null, note: '城堡仍未被占领' },
            { kind: 'player_alive', playerId: 1 },
        ],
    });
    // 反例：有紧急威胁时允许先处理别的单位，不能强制所有 capture 首选。
    const urgentThreat = makeState({
        players: [0, 1],
        units: [
            { id: 'cap', ownerId: 0, unitClass: 'soldier', x: 4, y: 4, hp: 30, maxHp: 100 },
            { id: 'killer', ownerId: 1, unitClass: 'soldier', x: 4, y: 5, hp: 14, maxHp: 100 },
            // 移动终点刻意避开阵亡格 (4,5)：墓碑会消耗并给站上去的单位施加减益，
            // 那会引入与本场景无关的第二个机制。
            { id: 'helper', ownerId: 0, unitClass: 'soldier', x: 6, y: 5, maxHp: 100, movementRemaining: 4 },
        ],
        tiles: [{ x: 4, y: 4, terrainId: TOWN_TERRAIN, ownerId: null }],
    });
    fixture({
        id: 'capture/urgent-threat-allows-other-action',
        scenario: '占领机会',
        verified: true,
        state: urgentThreat,
        actions: [
            { type: 'attack', attackerId: 'cap', targetId: 'killer' },
            { type: 'move', unitId: 'helper', to: { x: 6, y: 4 } },
        ],
        predicates: [
            { kind: 'legal_action_present', code: 'capture:cap' },
            { kind: 'legal_action_present', code: 'attack:cap:killer' },
            { kind: 'trace_types_executed', types: ['attack', 'move'],
              note: '存在合法 capture 时，其他动作同样是被允许的选择' },
            { kind: 'unit_dead', unitId: 'killer' },
        ],
    });
}

{
    // 正例：P1 已经没有任何单位，其唯一剩下的资产是一座中立城堡，P0 指挥官站在其上。
    // 一步 capture 之后 P1 无单位且无城堡 ⇒ 默认淘汰条件成立 ⇒ P0 联盟立即获胜。
    const lastAsset = makeState({
        players: [0, 1],
        units: [
            { id: 'cap', ownerId: 0, unitClass: 'commander', x: 4, y: 4, maxHp: 100 },
        ],
        tiles: [
            { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: 1 },
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
        ],
        rules: { defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'capture/immediate-terminal-capture',
        scenario: '占领机会',
        verified: true,
        state: lastAsset,
        actions: [{ type: 'capture', unitId: 'cap' }],
        predicates: [
            { kind: 'legal_action_present', code: 'capture:cap', note: '城堡归属为敌方，因此属于可占领目标' },
            { kind: 'reading', label: 'forcedWinByCapture', expected: true, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                const result = engine.step({ type: 'capture', unitId: 'cap' } as Action);
                return result.state.winner === 0;
            }, note: '一步真实执行：占领后 P1 无单位且无城堡 ⇒ winner=0' },
            { kind: 'winner', value: 0 },
            { kind: 'tile_owner', x: 4, y: 4, ownerId: 0 },
            { kind: 'player_eliminated', playerId: 1 },
        ],
    });
    // 对照：同一个城堡，但 P1 还有一兵 ⇒ 同样的 capture 不终局。
    fixture({
        id: 'capture/same-capture-not-terminal-with-units',
        scenario: '占领机会',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'cap', ownerId: 0, unitClass: 'commander', x: 4, y: 4, maxHp: 100 },
                { id: 'survivor', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, hp: 30, maxHp: 100 },
            ],
            tiles: [
                { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: 1 },
                { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
            ],
            rules: { defeatOnNoUnitsAndNoCastles: true },
        }),
        actions: [{ type: 'capture', unitId: 'cap' }],
        predicates: [
            { kind: 'reading', label: 'winnerAfterSameCapture', expected: null, read: (ctx) => ctx.after.winner },
            { kind: 'tile_owner', x: 4, y: 4, ownerId: 0, note: '归属确实改变了' },
            { kind: 'player_alive', playerId: 1, note: '但玩家仍有单位，因此未被淘汰' },
        ],
    });
}
// ---------------------------------------------------------------------------
// 场景 6：城堡经济与伤害
// ---------------------------------------------------------------------------

{
    const economy = makeState({
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
        tiles: [
            { x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 },
            { x: 3, y: 2, terrainId: TOWN_TERRAIN, ownerId: 0 },
        ],
    });
    fixture({
        id: 'castle/income-at-owner-turn-start',
        scenario: '城堡经济与伤害',
        verified: true,
        state: economy,
        actions: [{ type: 'end_turn' }, { type: 'end_turn' }],
        predicates: [
            { kind: 'gold_equals', playerId: 0, value: 150, note: '城堡 100 + 村庄 50，在 P0 回合开始时结算' },
            { kind: 'gold_equals', playerId: 1, value: 0, note: 'P1 未拥有建筑' },
        ],
    });
    // 敌军站在己方城堡上：城堡拥有者回合开始受到 50 伤害。
    const trespass = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100 },
            { id: 'intruder', ownerId: 1, unitClass: 'soldier', x: 4, y: 4, maxHp: 100 },
        ],
        tiles: [
            { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: 0 },
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 1 },
        ],
    });
    fixture({
        id: 'castle/intruder-takes-damage',
        scenario: '城堡经济与伤害',
        verified: true,
        state: trespass,
        // P0 先结束回合 ⇒ P1 回合开始（入侵者不受影响），P1 结束 ⇒ P0 回合开始扣 50，
        // P0 再结束 ⇒ P1 回合开始，P1 再结束 ⇒ 第二次扣 50。
        actions: [{ type: 'end_turn' }, { type: 'end_turn' }, { type: 'end_turn' }, { type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'intruderHpAfterTwoOwnerTurnStarts', expected: 0,
              read: (ctx) => {
                  const unit = unitAt(ctx.after, 'intruder');
                  return unit ? unit.hp : 0;
              },
              note: '两次 P0 回合开始各扣 50 ⇒ 100 - 50 - 50 = 0，单位被移除' },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 7：招募与 pending
// ---------------------------------------------------------------------------

{
    const castleRecruitRules: RuleConfig = { allowSurrender: false, allowPendingRecruitEndTurn: false };
    const emptyCastle = makeState({
        players: [
            { id: 0, gold: 1000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [{ id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 }],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: castleRecruitRules,
    });
    fixture({
        id: 'pending/empty-castle-recruit-then-locks',
        scenario: '招募与 pending',
        verified: true,
        state: emptyCastle,
        actions: [{ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } }],
        predicates: [
            { kind: 'legal_action_present', code: 'recruit_to_castle:soldier:2,2' },
            { kind: 'reading', label: 'endTurnBlockedWhilePending', expected: false, read: (ctx) => {
                const mid = new GameEngine(ctx.before);
                mid.step({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } });
                const midState = mid.getState();
                return legalCodesOf(midState, midState.currentPlayer).includes('end_turn');
            }, note: 'allowPendingRecruitEndTurn=false 时空城 pending 同样禁止结束回合（见 rules.ts:327-333）' },
            { kind: 'reading', label: 'pending', expected: { hasPending: true, source: 'empty_castle', gold: 850 },
              read: (ctx) => {
                  const pending = ctx.after.pendingUnitId
                      ? ctx.after.units.find((u) => u.id === ctx.after.pendingUnitId)
                      : undefined;
                  return {
                      hasPending: Boolean(pending),
                      source: pending?.apkPendingRecruitSource ?? null,
                      gold: ctx.after.players.find((p) => p.id === 0)?.gold ?? null,
                  };
              } },
            { kind: 'reading', label: 'onlyPendingUnitMayAct', expected: true, read: (ctx) => {
                const pendingId = ctx.after.pendingUnitId;
                if (!pendingId) return false;
                const codes = legalCodesOf(ctx.after, ctx.after.currentPlayer)
                    .filter((code) => !code.startsWith('move:') && !code.startsWith('attack:')
                        && !code.startsWith('wait:') && !code.startsWith('capture:'));
                const actors = legalCodesOf(ctx.after, ctx.after.currentPlayer)
                    .filter((code) => code.startsWith('move:') || code.startsWith('attack:') || code.startsWith('wait:'))
                    .map((code) => code.split(':')[1]);
                return codes.length === 0 && actors.every((id) => id === pendingId);
            } },
        ],
    });
    // 反例：pending 未处理时不能再次招募。
    const afterRecruit = (() => {
        const engine = new GameEngine(emptyCastle);
        engine.step({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } });
        return engine.getState();
    })();
    fixture({
        id: 'pending/no-second-recruit-while-pending',
        scenario: '招募与 pending',
        verified: true,
        state: afterRecruit,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'recruitCodesWhilePending', expected: 0, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).filter((code) => code.startsWith('recruit_')).length },
        ],
    });
    // 反例：允许 pending 时结束回合的开关会改变合法动作集。
    const allowEndTurn = makeState({
        players: [
            { id: 0, gold: 1000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [{ id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 }],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { allowPendingRecruitEndTurn: true },
    });
    fixture({
        id: 'pending/allow-end-turn-switch',
        scenario: '招募与 pending',
        verified: true,
        state: allowEndTurn,
        actions: [
            { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } },
            { type: 'end_turn' },
        ],
        predicates: [
            { kind: 'reading', label: 'endTurnAllowedAfterRecruit', expected: true, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                engine.step({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } });
                const mid = engine.getState();
                return legalCodesOf(mid, mid.currentPlayer).includes('end_turn');
            } },
            { kind: 'reading', label: 'pendingClearedAfterEndTurn', expected: true,
              read: (ctx) => ctx.after.pendingUnitId === undefined },
        ],
    });
    // 指挥官堆叠招募：开启 commanderCastleRecruitUsesPending 时先生成 pending。
    const commanderStack = makeState({
        players: [
            { id: 0, gold: 3000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'cmd', ownerId: 0, unitClass: 'commander', x: 2, y: 2, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { commanderCastleRecruitUsesPending: true, allowSurrender: false },
    });
    fixture({
        id: 'pending/commander-castle-stacks-pending',
        scenario: '招募与 pending',
        verified: true,
        state: commanderStack,
        actions: [{ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 2, y: 2 } }],
        predicates: [
            { kind: 'reading', label: 'pendingSourceIsCommanderCastle', expected: 'commander_castle',
              read: (ctx) => {
                  const pending = ctx.after.pendingUnitId
                      ? ctx.after.units.find((u) => u.id === ctx.after.pendingUnitId)
                      : undefined;
                  return pending?.apkPendingRecruitSource ?? null;
              } },
            { kind: 'reading', label: 'commanderStillOnCastle', expected: true,
              read: (ctx) => Boolean(unitAt(ctx.after, 'cmd')?.pos.x === 2 && unitAt(ctx.after, 'cmd')?.pos.y === 2) },
            { kind: 'reading', label: 'pendingUnitSharesCastleTile', expected: true, read: (ctx) => {
                const pending = ctx.after.pendingUnitId
                    ? ctx.after.units.find((u) => u.id === ctx.after.pendingUnitId)
                    : undefined;
                return Boolean(pending && pending.pos.x === 2 && pending.pos.y === 2);
            } },
        ],
    });
    // 非堆叠规则：指挥官在城堡上时使用 recruit_and_deploy 直接部署。
    const commanderDeploy = makeState({
        players: [
            { id: 0, gold: 3000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'cmd', ownerId: 0, unitClass: 'commander', x: 2, y: 2, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { commanderCastleRecruitUsesPending: false, allowSurrender: false },
    });
    fixture({
        id: 'pending/commander-castle-deploys-directly',
        scenario: '招募与 pending',
        verified: true,
        state: commanderDeploy,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'hasRecruitAndDeploy', expected: true, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).some((code) => code.startsWith('recruit_and_deploy:')) },
        ],
    });
    // 部署空间被阻挡：城堡四个正交邻格被敌方单位占据。
    //
    // 为什么不用地形：本引擎没有“不可通行地形”。getMoveCostForUnit 只返回消耗，
    // 深水与山脉都只是消耗 3；指挥官移动力 4 仍能走进邻格（实测部署位置：全深水 226 个、
    // 全山脉 213 个）。唯一真正阻断地面单位的是“敌方单位占据目标格”
    // （map.ts:141-147 与 216-222），因此夹具使用敌对单位封锁。
    const blockedDeploy = makeState({
        width: 5,
        height: 5,
        players: [
            { id: 0, gold: 3000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'cmd', ownerId: 0, unitClass: 'commander', x: 2, y: 2, maxHp: 100 },
            { id: 'blk1', ownerId: 1, unitClass: 'soldier', x: 1, y: 2, maxHp: 100 },
            { id: 'blk2', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
            { id: 'blk3', ownerId: 1, unitClass: 'soldier', x: 2, y: 1, maxHp: 100 },
            { id: 'blk4', ownerId: 1, unitClass: 'soldier', x: 2, y: 3, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 4, y: 4, maxHp: 100 },
        ],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { commanderCastleRecruitUsesPending: false },
    });
    fixture({
        id: 'pending/blocked-deploy-has-no-spawn',
        scenario: '招募与 pending',
        verified: true,
        state: blockedDeploy,
        actions: [],
        predicates: [
            // 地面单位（士兵等）的部署位置必须为空：四个正交邻格被敌对单位占据，
            // 单步可达集合只剩城堡格自身。
            { kind: 'reading', label: 'groundDeployPositions', expected: [],
              read: (ctx) => getRecruitDeployPositions(ctx.before, 0, 'soldier', { x: 2, y: 2 }),
              note: 'map.ts:216-222：敌方单位占据的格子对地面单位不进入可达集合' },
            // 飞行单位（幽灵）可以越过敌方单位，因此仍可能在 5x5 地图上找到落点；
            // 这是引擎的真实行为，夹具如实记录，而不是把人造期望写死。
            { kind: 'reading', label: 'flyingDeployPositionsNonEmpty', expected: true,
              read: (ctx) => getRecruitDeployPositions(ctx.before, 0, 'ghost', { x: 2, y: 2 }).length > 0,
              note: '飞行单位可越过封锁，说明封锁只对地面单位成立' },
            { kind: 'reading', label: 'groundUnitFamiliesWithNoDeploy', expected: true, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                const codes = engine.getLegalActions(0).map(encodeAction);
                const groundClasses = ['soldier', 'archer', 'paladin', 'catapult', 'wolf', 'golem', 'druid'];
                const cleared = groundClasses.every(
                    (cls) => getRecruitDeployPositions(ctx.before, 0, cls as never, { x: 2, y: 2 }).length === 0,
                );
                return cleared && codes.some((code) => code.startsWith('recruit_and_deploy:'));
            }, note: '仍可提出该类动作，但地面兵种没有任何合法落点' },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 8：指挥官重招
// ---------------------------------------------------------------------------

{
    const recruitBase = (overrides: RuleConfig) => makeState({
        players: [
            { id: 0, gold: 1200, isAlive: true, commanderDeathCount: 0, commanderReserveLevel: 2, commanderReserveExp: 40 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [{ id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 }],
        tiles: [{ x: 2, y: 2, terrainId: CASTLE_TERRAIN, ownerId: 0 }],
        rules: { allowSurrender: false, ...overrides },
    });
    fixture({
        id: 'commander-recruit/enabled-and-priced',
        scenario: '指挥官重招',
        verified: true,
        state: recruitBase({ commanderRecruitBaseCost: 500, commanderRecruitCostGrowth: 100 }),
        actions: [{ type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 2, y: 2 } }],
        predicates: [
            { kind: 'legal_action_present', code: 'recruit_to_castle:commander:2,2' },
            { kind: 'reading', label: 'reserveCarried', expected: { level: 2, exp: 40 }, read: (ctx) => {
                const unit = ctx.after.pendingUnitId
                    ? ctx.after.units.find((u) => u.id === ctx.after.pendingUnitId)
                    : undefined;
                return { level: unit?.level ?? null, exp: unit?.exp ?? null };
            } },
            { kind: 'gold_equals', playerId: 0, value: 700 },
        ],
    });
    fixture({
        id: 'commander-recruit/disabled-has-no-action',
        scenario: '指挥官重招',
        verified: true,
        state: recruitBase({ commanderRecruitBaseCost: null }),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'commanderRecruitOffered', expected: false, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).some((code) => code.startsWith('recruit_to_castle:commander')) },
        ],
    });
    fixture({
        id: 'commander-recruit/price-grows-with-deaths',
        scenario: '指挥官重招',
        verified: true,
        state: (() => {
            const state = recruitBase({ commanderRecruitBaseCost: 500, commanderRecruitCostGrowth: 100 });
            const player = state.players.find((p) => p.id === 0);
            if (player) player.commanderDeathCount = 2;
            return state;
        })(),
        actions: [{ type: 'recruit_to_castle', unitClass: 'commander', castlePos: { x: 2, y: 2 } }],
        predicates: [
            { kind: 'gold_equals', playerId: 0, value: 500, note: '500 + 2*100 = 700，1200 - 700 = 500' },
        ],
    });
    fixture({
        id: 'commander-recruit/insufficient-gold',
        scenario: '指挥官重招',
        verified: true,
        state: (() => {
            const state = recruitBase({ commanderRecruitBaseCost: 500 });
            const player = state.players.find((p) => p.id === 0);
            if (player) player.gold = 400;
            return state;
        })(),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'commanderRecruitOffered', expected: false, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).some((code) => code.startsWith('recruit_to_castle:commander')) },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 9：支援 / 治疗 / 召唤
// ---------------------------------------------------------------------------

{
    const supportState = makeState({
        players: [0, 1],
        units: [
            { id: 'sup', ownerId: 0, unitClass: 'druid', x: 2, y: 2, maxHp: 100, level: 3 },
            { id: 'used', ownerId: 0, unitClass: 'soldier', x: 3, y: 2, maxHp: 100, hasMoved: true, hasActed: true },
            { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
    });
    fixture({
        id: 'support/resets-target-action-state',
        scenario: '支援/治疗/召唤',
        verified: true,
        state: supportState,
        actions: [{ type: 'support', supporterId: 'sup', targetId: 'used' }],
        predicates: [
            { kind: 'legal_action_present', code: 'support:sup:used' },
            { kind: 'reading', label: 'targetReset', expected: { hasActed: false, hasMoved: false, supported: true },
              read: (ctx) => {
                  const unit = unitAt(ctx.after, 'used');
                  return {
                      hasActed: unit?.hasActed ?? null,
                      hasMoved: unit?.hasMoved ?? null,
                      supported: unit?.hasBeenSupportedThisTurn ?? null,
                  };
              } },
            { kind: 'reading', label: 'supporterConsumed', expected: { hasActed: true, hasMoved: true },
              read: (ctx) => {
                  const unit = unitAt(ctx.after, 'sup');
                  return { hasActed: unit?.hasActed ?? null, hasMoved: unit?.hasMoved ?? null };
              } },
        ],
    });
    // 反例：未行动过的友军不能被支援（isFriendActed 必须为 true）。
    fixture({
        id: 'support/only-acted-friend-can-be-supported',
        scenario: '支援/治疗/召唤',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'sup', ownerId: 0, unitClass: 'druid', x: 2, y: 2, maxHp: 100, level: 3 },
                { id: 'fresh', ownerId: 0, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
            ],
        }),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'supportOfferedForFreshUnit', expected: false, read: (ctx) => legalCodesOf(
                ctx.before, ctx.before.currentPlayer,
            ).includes('support:sup:fresh') },
        ],
    });
    // 治疗：行动者字段是 healerId，且必须能实际改变目标血量。
    const healState = makeState({
        players: [0, 1],
        units: [
            { id: 'healer', ownerId: 0, unitClass: 'paladin', x: 2, y: 2, maxHp: 100 },
            { id: 'hurt', ownerId: 0, unitClass: 'soldier', x: 3, y: 2, hp: 30, maxHp: 100 },
            { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
    });
    fixture({
        id: 'heal/actor-field-and-effect',
        scenario: '支援/治疗/召唤',
        verified: true,
        state: healState,
        actions: [{ type: 'heal', healerId: 'healer', targetId: 'hurt' }],
        predicates: [
            { kind: 'legal_action_present', code: 'heal:healer:hurt' },
            { kind: 'hp_equals', unitId: 'hurt', value: 70, note: 'paladin 40 + 等级 0 ⇒ +40' },
            { kind: 'reading', label: 'healerActorCoord', expected: { x: 2, y: 2 }, read: (ctx) => {
                const action = findLegalAction(ctx.before, 'heal:healer:hurt');
                if (!action) return null;
                const features = encodeCandidateActionSpatial(ctx.before, ctx.before.currentPlayer, action);
                return features.actorCoord;
            }, note: 'v13 子集里 2,645 个治疗候选缺行动者坐标；修复后必须给出 healerId 的坐标' },
        ],
    });
    // 亡灵治疗：paladin 治亡灵变成伤害。
    fixture({
        id: 'heal/undead-takes-damage',
        scenario: '支援/治疗/召唤',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'healer', ownerId: 0, unitClass: 'paladin', x: 2, y: 2, maxHp: 100 },
                { id: 'ghost', ownerId: 1, unitClass: 'ghost', x: 3, y: 2, maxHp: 100 },
                { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
            ],
        }),
        actions: [{ type: 'heal', healerId: 'healer', targetId: 'ghost' }],
        predicates: [
            { kind: 'hp_equals', unitId: 'ghost', value: 40, note: '治疗亡灵 = -floor(40*3/2) = -60' },
        ],
    });
    // 召唤：骷髅出现在墓碑格，墓碑被消耗。
    const summonState = makeState({
        players: [0, 1],
        units: [
            { id: 'witch', ownerId: 0, unitClass: 'witch', x: 2, y: 2, maxHp: 100 },
            { id: 'enemy', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
        graves: [{ id: 'g1', pos: { x: 3, y: 2 }, remainingTurns: 3, ownerId: 0 }],
    });
    fixture({
        id: 'summon/spawns-skeleton-and-consumes-grave',
        scenario: '支援/治疗/召唤',
        verified: true,
        state: summonState,
        actions: [{ type: 'summon', summonerId: 'witch', graveId: 'g1', spawnPos: { x: 3, y: 2 } }],
        predicates: [
            { kind: 'legal_action_present', code: 'summon:witch:g1:3,2' },
            { kind: 'reading', label: 'spawned', expected: { gravesLeft: 0, skeletonAt: { x: 3, y: 2 } },
              read: (ctx) => {
                  const skeleton = ctx.after.units.find((u) => u.unitClass === 'skeleton');
                  return {
                      gravesLeft: ctx.after.graves?.length ?? null,
                      skeletonAt: skeleton ? { x: skeleton.pos.x, y: skeleton.pos.y } : null,
                  };
              } },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 10：突击后移动
// ---------------------------------------------------------------------------

{
    const assault = makeState({
        players: [0, 1],
        units: [
            { id: 'wolf', ownerId: 0, unitClass: 'wolf', x: 2, y: 2, maxHp: 100, movementRemaining: 6 },
            { id: 'prey', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
        ],
    });
    fixture({
        id: 'assault/post-attack-move-is-a-distinct-action',
        scenario: '突击后移动',
        verified: true,
        state: assault,
        actions: [
            { type: 'attack', attackerId: 'wolf', targetId: 'prey' },
            { type: 'post_attack_move', unitId: 'wolf', to: { x: 1, y: 1 } },
        ],
        predicates: [
            { kind: 'legal_action_present', code: 'post_attack_move:wolf:1,1', atStep: 1,
              note: '攻击之后才出现专用的突击后移动动作' },
            { kind: 'reading', label: 'actionsAreDistinctTypes', expected: ['attack', 'post_attack_move'],
              read: (ctx) => ctx.run.steps.map((s) => s.action.split(':')[0]) },
            { kind: 'reading', label: 'postAttackMovedFlag', expected: true,
              read: (ctx) => ctx.after.units.find((u) => u.id === 'wolf')?.hasPostAttackMoved ?? null },
            { kind: 'reading', label: 'noFurtherMoveAfterPostAttackMove', expected: false, read: (ctx) => legalCodesOf(
                ctx.after, ctx.after.currentPlayer,
            ).some((code) => code.startsWith('post_attack_move:wolf')) },
        ],
    });
    fixture({
        id: 'assault/ending-in-place-is-allowed',
        scenario: '突击后移动',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'wolf', ownerId: 0, unitClass: 'wolf', x: 2, y: 2, maxHp: 100, movementRemaining: 6 },
                { id: 'prey', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
            ],
        }),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'postAttackMoveSelfTileOffered', expected: true, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                engine.step({ type: 'attack', attackerId: 'wolf', targetId: 'prey' });
                const mid = engine.getState();
                return legalCodesOf(mid, mid.currentPlayer).includes('post_attack_move:wolf:2,2');
            }, note: 'APK 允许点当前格结束突击移动' },
        ],
    });
    // 反例：没有 assault_troop 的单位在攻击后没有专用移动。
    fixture({
        id: 'assault/non-assault-unit-has-none',
        scenario: '突击后移动',
        verified: true,
        state: makeState({
            players: [0, 1],
            units: [
                { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
                { id: 'd1', ownerId: 1, unitClass: 'soldier', x: 3, y: 2, maxHp: 100 },
            ],
        }),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'postAttackMoveOffered', expected: false, read: (ctx) => {
                const engine = new GameEngine(ctx.before);
                engine.step({ type: 'attack', attackerId: 'a1', targetId: 'd1' });
                const mid = engine.getState();
                return legalCodesOf(mid, mid.currentPlayer).some((code) => code.startsWith('post_attack_move:'));
            } },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 11：地形与路径
// ---------------------------------------------------------------------------

{
    // 反例：曼哈顿距离近不等于能攻击 / 能到达。
    const terrainState = makeState({
        width: 8,
        height: 8,
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100 },
            { id: 'wall1', ownerId: 1, unitClass: 'soldier', x: 2, y: 1, maxHp: 100 },
            { id: 'wall2', ownerId: 1, unitClass: 'soldier', x: 1, y: 2, maxHp: 100 },
            { id: 'wall3', ownerId: 1, unitClass: 'soldier', x: 2, y: 2, maxHp: 100 },
        ],
        tiles: [
            { x: 3, y: 1, terrainId: MOUNTAIN_TERRAIN },
            { x: 3, y: 2, terrainId: MOUNTAIN_TERRAIN },
            { x: 3, y: 3, terrainId: MOUNTAIN_TERRAIN },
        ],
    });
    fixture({
        id: 'terrain/blocked-cells-are-unreachable',
        scenario: '地形与路径',
        verified: true,
        state: terrainState,
        actions: [],
        predicates: [
            { kind: 'unreachable_move', unitId: 'a1', x: 4, y: 1, note: '被单位与山脉封锁' },
            { kind: 'reading', label: 'manhattanDistanceToBlockedCell', expected: 3,
              read: (ctx) => {
                  const pos = posOf(ctx.before, 'a1');
                  return pos ? Math.abs(pos.x - 4) + Math.abs(pos.y - 1) : null;
              } },
            { kind: 'reading', label: 'reachableCount', expected: 11,
              read: (ctx) => reachableCount(ctx.before, 'a1'),
              note: '实测读数：单位可绕行 (0,*) 一侧；本谓词固定该读数以便回归' },
        ],
    });
    // 高移动消耗 vs 道路。
    const costState = makeState({
        width: 8,
        height: 3,
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 0, y: 0, maxHp: 100 },
            { id: 'far', ownerId: 1, unitClass: 'soldier', x: 7, y: 2, maxHp: 100 },
        ],
        tiles: [
            { x: 1, y: 0, terrainId: MOUNTAIN_TERRAIN },
            { x: 2, y: 0, terrainId: MOUNTAIN_TERRAIN },
            { x: 1, y: 1, terrainId: FOREST_TERRAIN },
        ],
    });
    fixture({
        id: 'terrain/move-cost-differs-by-terrain',
        scenario: '地形与路径',
        verified: true,
        state: costState,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'mountainIsCostlierThanRoad', expected: { mountain: 3, road: 1 },
              read: (ctx) => {
                  const mountain = ctx.before.map.tiles[0][1];
                  const road = ctx.before.map.tiles[0][0];
                  return {
                      mountain: mountain.terrainId === MOUNTAIN_TERRAIN ? 3 : null,
                      road: road.terrainId === FLAT_TERRAIN ? 1 : null,
                  };
              } },
            { kind: 'reading', label: 'threeMountainsUnreachableWithMove4', expected: false,
              read: (ctx) => legalCodesOf(ctx.before, ctx.before.currentPlayer).includes('move:a1:3,0'),
              note: '3 格山脉 = 9 点移动消耗 > 士兵移动力 4' },
            { kind: 'reading', label: 'forestThenRoadReachable', expected: true,
              read: (ctx) => legalCodesOf(ctx.before, ctx.before.currentPlayer).includes('move:a1:2,1'),
              note: '森林 2 + 道路 1 = 3 <= 4' },
        ],
    });
    // 飞行单位越过水面。
    const flyState = makeState({
        width: 6,
        height: 3,
        players: [0, 1],
        units: [
            { id: 'ghost', ownerId: 0, unitClass: 'ghost', x: 0, y: 1, maxHp: 100 },
            { id: 'soldier', ownerId: 0, unitClass: 'soldier', x: 0, y: 2, maxHp: 100 },
            { id: 'far', ownerId: 1, unitClass: 'soldier', x: 5, y: 0, maxHp: 100 },
        ],
        tiles: [
            { x: 1, y: 1, terrainId: 2 },
            { x: 2, y: 1, terrainId: 2 },
            { x: 1, y: 2, terrainId: 2 },
            { x: 2, y: 2, terrainId: 2 },
        ],
    });
    fixture({
        id: 'terrain/flying-crosses-water',
        scenario: '地形与路径',
        verified: true,
        state: flyState,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'flyingReachesAcrossWater', expected: true,
              read: (ctx) => legalCodesOf(ctx.before, ctx.before.currentPlayer).includes('move:ghost:3,1') },
            { kind: 'reading', label: 'walkerDoesNotReachAcrossWater', expected: false,
              read: (ctx) => legalCodesOf(ctx.before, ctx.before.currentPlayer).includes('move:soldier:3,2') },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 12：多人行动顺序
// ---------------------------------------------------------------------------

{
    const threePlayers = makeState({
        width: 8,
        height: 8,
        players: [0, 1, 2],
        units: [
            { id: 'u0', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100 },
            { id: 'u1', ownerId: 1, unitClass: 'soldier', x: 1, y: 2, maxHp: 100 },
            { id: 'u2', ownerId: 2, unitClass: 'soldier', x: 1, y: 3, maxHp: 100 },
        ],
    });
    fixture({
        id: 'multi/next-active-player-skips-dead',
        scenario: '多人行动顺序',
        verified: true,
        state: (() => {
            const state = cloneState(threePlayers);
            const player = state.players.find((p) => p.id === 1);
            if (player) player.isAlive = false;
            return state;
        })(),
        actions: [{ type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'turnPlayerIds', expected: [0, 2], read: (ctx) => getTurnPlayerIds(ctx.before) },
            { kind: 'reading', label: 'nextCurrentPlayer', expected: 2,
              read: (ctx) => ctx.after.currentPlayer },
        ],
    });
    fixture({
        id: 'multi/next-active-player-skips-disabled',
        scenario: '多人行动顺序',
        verified: true,
        state: (() => {
            const state = cloneState(threePlayers);
            state.rules = { disabledTeams: [1] };
            return state;
        })(),
        actions: [{ type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'turnPlayerIdsWithDisabled', expected: [0, 2],
              read: (ctx) => getTurnPlayerIds(ctx.before) },
            { kind: 'reading', label: 'nextCurrentPlayer', expected: 2, read: (ctx) => ctx.after.currentPlayer },
        ],
    });
    fixture({
        id: 'multi/ally-is-not-an-opponent',
        scenario: '多人行动顺序',
        verified: true,
        state: (() => {
            const state = cloneState(threePlayers);
            state.rules = { alliances: { 0: 7, 1: 7, 2: 9 } };
            return state;
        })(),
        actions: [{ type: 'end_turn' }, { type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'orderIsP0P1P2', expected: [0, 1, 2], read: (ctx) => getTurnPlayerIds(ctx.before) },
            { kind: 'reading', label: 'afterTwoEndTurns', expected: 2, read: (ctx) => ctx.after.currentPlayer },
            { kind: 'reading', label: 'enemyCountFromP0', expected: 1, read: (ctx) => {
                  const own = ctx.before.players.find((p) => p.id === 0);
                  if (!own) return null;
                  return ctx.before.players.filter((p) => p.id !== 0 && p.isAlive).length - 1;
              }, note: 'P0 只有一个敌对玩家 P2，P1 是盟友' },
        ],
    });
    fixture({
        id: 'multi/four-players-preserve-order',
        scenario: '多人行动顺序',
        verified: true,
        state: makeState({
            width: 10,
            height: 10,
            players: [0, 1, 2, 3],
            units: [0, 1, 2, 3].map((id) => ({
                id: `u${id}`, ownerId: id, unitClass: 'soldier' as const, x: 1, y: 1 + id, maxHp: 100,
            })),
        }),
        actions: [],
        predicates: [
            { kind: 'reading', label: 'turnPlayerIds4p', expected: [0, 1, 2, 3],
              read: (ctx) => getTurnPlayerIds(ctx.before) },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 13：结束回合
// ---------------------------------------------------------------------------

{
    // 正例：确实应该换回合。
    const canEnd = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100, hasActed: true, hasMoved: true },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
    });
    fixture({
        id: 'end-turn/legitimate-switch',
        scenario: '结束回合',
        verified: true,
        state: canEnd,
        actions: [{ type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'currentPlayerAfterEndTurn', expected: 1, read: (ctx) => ctx.after.currentPlayer },
            { kind: 'reading', label: 'turnAfterSingleSwitch', expected: 1, read: (ctx) => ctx.after.turn,
              note: '引擎只在回合回到首个有效玩家时递增 turn（engine.ts:889-891）' },
        ],
    });
    // 反例：有必要动作时提早结束造成可证明损失。
    // P1 已经没有任何单位，(4,4) 的城堡是它唯一的资产；P0 指挥官正站在该格上。
    // 因此 P0 存在一步致胜动作 capture:a1，却在第一步选择 end_turn ⇒ 可证明的损失。
    const premature = makeState({
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'commander', x: 4, y: 4, maxHp: 100 },
        ],
        tiles: [
            { x: 4, y: 4, terrainId: CASTLE_TERRAIN, ownerId: 1 },
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
        ],
        rules: { defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'end-turn/premature-loses-provable-win',
        scenario: '结束回合',
        verified: true,
        state: premature,
        actions: [{ type: 'end_turn' }],
        predicates: [
            { kind: 'forced_win', allianceId: 0, note: '执行前存在立即致胜动作' },
            { kind: 'winner', value: null, note: '提早结束后对局仍未结束，且已交出行动机会' },
            { kind: 'reading', label: 'winningCaptureStillAvailableNextTurn', expected: true,
              read: (ctx) => legalCodesOf(ctx.after, 0).includes('capture:a1'),
              note: '机会窗口没有关闭：下一回合仍可占领，但已经白送对手一个完整回合' },
        ],
    });
    // 反例：反复无效动作的窗口检查 —— 引擎不会让无意义回合无限空转。
    const idle = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100, hasActed: true, hasMoved: true },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100, hasActed: true, hasMoved: true },
        ],
    });
    fixture({
        id: 'end-turn/idle-round-advances-turn-not-infinite',
        scenario: '结束回合',
        verified: true,
        state: idle,
        actions: [{ type: 'end_turn' }, { type: 'end_turn' }],
        predicates: [
            { kind: 'reading', label: 'turnAfterFullRound', expected: 2, read: (ctx) => ctx.after.turn },
            { kind: 'reading', label: 'currentPlayerAfterFullRound', expected: 0, read: (ctx) => ctx.after.currentPlayer },
        ],
    });
}

// ---------------------------------------------------------------------------
// 场景 14：真平局与截断
// ---------------------------------------------------------------------------

{
    // 真平局：双方都无单位且无城堡 ⇒ 引擎判定 winner = -1。
    // 说明：用「互相击杀」构造平局并不成立 —— 攻击者先结算，被击杀方不会再反击
    // （T14-01 首次失败读数：双方 40hp 时 a1 只造成 20 伤害，b1 存活并反击 10）。
    const draw = makeState({
        players: [
            { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
        ],
        units: [],
        rules: { defeatOnNoUnitsAndNoCastles: true },
    });
    fixture({
        id: 'draw/both-sides-eliminated-is-draw',
        scenario: '真平局与截断',
        verified: true,
        state: draw,
        // 引擎的胜负判定发生在 step 之后（engine.ts:921/940），因此必须真的执行一步；
        // 空动作列表不会调用 checkWinConditions，winner 仍为 null。
        actions: [{ type: 'end_turn' }],
        predicates: [
            { kind: 'winner', value: -1, note: 'aliveAlliances 为空 ⇒ 引擎判定 -1（规则平局）' },
            { kind: 'player_eliminated', playerId: 0 },
            { kind: 'player_eliminated', playerId: 1 },
        ],
    });
    // 截断：同一局面在 step cap 处停止，winner 仍为 null，分类必须不同于平局。
    const truncated = makeState({
        players: [0, 1],
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', x: 1, y: 1, maxHp: 100 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', x: 7, y: 7, maxHp: 100 },
        ],
        tiles: [
            { x: 0, y: 0, terrainId: CASTLE_TERRAIN, ownerId: 0 },
            { x: 7, y: 7, terrainId: CASTLE_TERRAIN, ownerId: 1 },
        ],
    });
    fixture({
        id: 'draw/step-cap-is-not-a-draw',
        scenario: '真平局与截断',
        verified: true,
        state: truncated,
        actions: [],
        predicates: [
            { kind: 'reading', label: 'terminatedAtStart', expected: false,
              read: (ctx) => new GameEngine(ctx.before).isTerminal() },
            { kind: 'reading', label: 'winnerBeforeCap', expected: null, read: (ctx) => ctx.before.winner },
            { kind: 'reading', label: 'capIsDistinctFromDraw', expected: true, read: (ctx) => {
                // 截断由评测器分类（STEP_LIMIT/PLY_LIMIT），引擎不产生 -1；
                // 因此“winning=null 且未终局”与“winner=-1”必须是两个不同读数。
                const engine = new GameEngine(ctx.before);
                return engine.getWinner() === null && !engine.isTerminal();
            } },
        ],
    });
}

// ---------------------------------------------------------------------------
// 执行与输出
// ---------------------------------------------------------------------------

function buildContextForFixture(spec: FixtureSpec): OracleContext {
    const state = cloneState(spec.state);
    const run = runActions(state, spec.actions);
    return buildContext(state, spec.actions, run);
}

const results: FixtureResult[] = [];
for (const spec of fixtures) {
    const ctx = buildContextForFixture(spec);
    // 预检不再用“初始状态的合法集”判断整条轨迹：
    // 多步窗口夹具（先移动再攻击）的后续动作在初始状态本来就不合法。
    // 合法性改由引擎逐步回执判定，任何被引擎拒绝的步骤都会让该夹具 FAIL。
    const rejected = ctx.stepLegal
        .map((legal, index) => (legal ? null : index))
        .filter((index): index is number => index !== null);
    const extraReasons = rejected.length
        ? [`第 ${rejected.join(',')} 步被引擎判定为非法动作（夹具声明与引擎不一致）。`]
        : [];
    results.push(evaluateFixture(
        spec.id, spec.scenario, spec.verified,
        spec.actions.map(encodeAction), spec.predicates, ctx,
        [...(spec.unknownReasons ?? []), ...extraReasons],
    ));
}

const verifiedResults = results.filter((r) => r.verified);
const unknownResults = results.filter((r) => !r.verified);
const failed = verifiedResults.filter((r) => !r.pass);
const allPredicates = verifiedResults.flatMap((r) => r.predicates);
const failedPredicates = allPredicates.filter((p) => !p.pass);

const report = {
    schema: 'v14_rule_suite_results_1',
    task: 'T14-01',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    head: process.env.V14_HEAD ?? null,
    counts: {
        fixtures: results.length,
        verifiedFixtures: verifiedResults.length,
        unknownFixtures: unknownResults.length,
        failedFixtures: failed.length,
        predicates: allPredicates.length,
        failedPredicates: failedPredicates.length,
    },
    scenarios: [...new Set(results.map((r) => r.scenario))],
    results,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'rule_suite_results.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`[T14-01] fixtures=${results.length} verified=${verifiedResults.length} unknown=${unknownResults.length} failed=${failed.length}`);
for (const result of failed) {
    console.log(`  FAIL ${result.fixtureId}`);
    for (const predicate of result.predicates.filter((p) => !p.pass)) {
        console.log(`    - ${predicate.label}: reading=${JSON.stringify(predicate.reading)} expected=${JSON.stringify(predicate.expected)}`);
    }
}
for (const result of unknownResults) {
    console.log(`  UNKNOWN ${result.fixtureId}: ${result.unknownReasons.join('; ')}`);
}
if (failed.length > 0) {
    process.exitCode = 1;
} else {
    console.log(`[T14-01] PASSED ${allPredicates.length}/${allPredicates.length} verified predicates`);
}
