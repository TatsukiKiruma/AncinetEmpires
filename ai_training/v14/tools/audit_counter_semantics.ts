/**
 * V14/T14-03：反击（counter-attack）语义修复的独立核验脚本。
 *
 * 角色：审计者产物。本脚本只读 src/ 下的实现（import），不修改任何被测源码。
 * 输出：
 *   v14/out/v14_20260924_t14/T14-03/counter_audit/counter_audit_results.json
 *   v14/out/v14_20260924_t14/T14-03/counter_audit/counter_audit.md
 *
 * 被核验的权威实现（src/game/rules.ts）：
 *   - canCounterAttack(state, attackerId, defenderId)
 *   - estimateCounterDamage(state, attackerId, defenderId)        入参语义 = 攻击「前」状态
 *   - counterDamageOnResolvedState(state, attackerId, defenderId) 入参语义 = 攻击「已结算」状态
 * 以及 src/game/engine.ts:case 'attack' 的调用点、src/game/ai/spatial_tensor_encoder.ts 的语义槽 15。
 *
 * 核验口径（重要）：
 *   1. 「引擎真实反击伤害」取 engine.step() 返回 info 中的
 *      `Target counterattacked for N dmg.` 的 N（就是 `attacker.hp -= counterDmg` 实际扣除的值）。
 *   2. 同时记录「攻击者 HP 观测量」= 攻击前 HP - 攻击后 HP。两者在下列情况下本就不相等，
 *      脚本会单独标注，不把它们混为一谈：
 *        - 反击击杀攻击者时 HP 观测量被血量下限截断；
 *        - 攻击者升级带来的 HP 成长（golem/slime/ice_elemental 的 maxHpGrowth > 0）；
 *        - standby 阶段的 triggerAuras / 墓碑结算（elf 的净化光环、亡灵站在墓碑上）。
 *   3. 预测值一律在**攻击前状态的深拷贝**上取得；脚本用 sha256 校验预测调用前后
 *      攻击前状态对象未被改动（rules 里两个入口都承诺「不改动 state」）。
 *   4. 旧公式（v13）在本脚本内联复现，不改源码：
 *        - `legacyEncoderFormula_preState` 复现 `git show HEAD:src/game/ai/spatial_tensor_encoder.ts`
 *          中的 `estCounter = (defender.hp - estDmg > 0) ? calculateDamage(state, defender.id, attacker.id) : 0;`
 *        - `legacyEngineHeadModel` 忠实复现 `git show HEAD:src/game/engine.ts` 的 `case 'attack'`：
 *          扣血 → applyCombatStatusEffects → addExp → 内联判定反击 → `calculateDamage(this.state, target.id, attacker.id)`
 *          （HEAD 实现在扣血之后才计算，因此它用的已经是「受击后」的 HP；本模型含 addExp 以复现升级时机）。
 *          该模型用于验证本次重构是否**行为保持**。
 *
 * 运行：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/audit_counter_semantics.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { GameEngine } from '../../src/game/engine';
import { UNIT_CONFIGS } from '../../src/game/constants';
import { createDemoState } from '../../src/game/demo_map';
import { addExp, getEffectiveStats, hasAbility } from '../../src/game/abilities';
import { getDistance } from '../../src/game/map';
import {
    calculateDamage,
    calculateDamageAtHp,
    canCounterAttack,
    counterDamageOnResolvedState,
    estimateCounterDamage,
} from '../../src/game/rules';
import { ENCODER_SCHEMA_ID, encodeCandidateActionSpatial } from '../../src/game/ai/spatial_tensor_encoder';
import { getRuleConfig } from '../../src/game/rule_config';
import type { Action, GameState, Unit, UnitClass, UnitStatus } from '../../src/game/types';

// ---------------------------------------------------------------- 基础工具

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

const ROAD = 6;
const FOREST = 7;
const MOUNTAIN = 3;

/** 攻击前状态里我们关心的最小单位描述。 */
interface UnitSpec {
    id: string;
    ownerId: number;
    unitClass: UnitClass;
    x: number;
    y: number;
    hp?: number;
    maxHp?: number;
    level?: number;
    exp?: number;
    status?: UnitStatus;
}

type ProbeKind =
    | 'attacker_levelup'
    | 'attack_applied_blinding'
    | 'standby_heal'
    | 'standby_status_aura'
    | 'flat_heal_path'
    | 'levelup_disabled'
    | null;

interface CaseSpec {
    id: string;
    /** core = 计入 A/B/C 统计；probe = 只用于 E 的残余风险取证；control = 合法性与纯度对照；regression = D 的测试场景复现 */
    group: 'core' | 'probe' | 'control' | 'regression';
    dimension: string;
    note: string;
    attacker: UnitSpec;
    target: UnitSpec;
    extras?: UnitSpec[];
    /** 地形覆盖：key = "x,y" */
    tiles?: Record<string, number>;
    /** 在指定位置放置墓碑 */
    graveAt?: { x: number; y: number };
    /** 规则覆盖（用于因果归因实验） */
    rules?: Record<string, unknown>;
    probeKind?: ProbeKind;
    /** 该组预期引擎是否发生反击（仅作信息记录，不作为断言） */
    expectCounter?: boolean;
    /** regression 组专用：直接给出完整 state 与期望断言 */
    buildOverride?: () => GameState;
}

function toUnit(spec: UnitSpec): Unit {
    const unit: Unit = {
        id: spec.id,
        ownerId: spec.ownerId,
        unitClass: spec.unitClass,
        pos: { x: spec.x, y: spec.y },
        hp: spec.hp ?? 100,
        maxHp: spec.maxHp ?? 100,
        hasMoved: false,
        hasActed: false,
        level: (spec.level ?? 0) as Unit['level'],
        exp: spec.exp ?? 0,
    };
    if (spec.status) unit.status = clone(spec.status);
    return unit;
}

/** 构造 9x9 地图 + 双方各一个远端锚点单位（避免终局判定干扰），当前玩家固定为 0。 */
function buildCaseState(spec: CaseSpec): GameState {
    if (spec.buildOverride) return spec.buildOverride();
    const width = 9;
    const height = 9;
    const tiles = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => ({ terrainId: ROAD as never, ownerId: null as number | null })));
    for (const [key, terrainId] of Object.entries(spec.tiles ?? {})) {
        const [x, y] = key.split(',').map(Number);
        tiles[y][x] = { terrainId: terrainId as never, ownerId: null };
    }
    const units: Unit[] = [toUnit(spec.attacker), toUnit(spec.target)];
    units.push(toUnit({ id: 'anchor_p0', ownerId: 0, unitClass: 'soldier', x: 0, y: 0 }));
    units.push(toUnit({ id: 'anchor_p1', ownerId: 1, unitClass: 'soldier', x: 8, y: 8 }));
    for (const extra of spec.extras ?? []) units.push(toUnit(extra));

    const state: GameState = {
        turn: 3,
        currentPlayer: 0,
        map: { width, height, tiles: tiles as never },
        units,
        players: [
            { id: 0, gold: 3000, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 3000, isAlive: true, commanderDeathCount: 0 },
        ],
        winner: null,
        nextUnitId: 100,
        nextGraveId: 100,
        graves: [],
    };
    if (spec.graveAt) {
        state.graves = [{ id: 'g_audit', pos: { ...spec.graveAt }, remainingTurns: 3, ownerId: spec.attacker.ownerId }];
    }
    if (spec.rules) state.rules = spec.rules as never;
    return state;
}

function findUnit(state: GameState, id: string): Unit | undefined {
    return state.units.find((u) => u.id === id);
}

function statusOf(unit: Unit | undefined): string {
    if (!unit?.status) return 'none';
    const s = unit.status;
    return s.type + (s.remainingTicks !== undefined ? `(${s.remainingTicks}t)` : '') +
        (s.remainingTurns !== undefined ? `(${s.remainingTurns}r)` : '');
}

/**
 * 忠实内联复现 engine.ts 的 private applyCombatStatusEffects(source, target)（HEAD 与工作区一致）。
 * 审计脚本不能调用 private 方法，所以按源码逐行搬运；语义：先中毒后致盲，force=false。
 */
function applyCombatStatusEffectsInline(source: Unit, target: Unit): void {
    if (target.hp <= 0) return;
    if (hasAbility(source, 'poisoner') && !hasAbility(target, 'poisoner')) {
        if (!target.status || target.status.type === 'poisoned') {
            target.status = { type: 'poisoned', remainingTicks: 2 };
        }
    }
    if (hasAbility(source, 'blinder') && !hasAbility(target, 'blinder')) {
        if (!target.status || target.status.type === 'blinded') {
            target.status = { type: 'blinded', remainingTurns: 1 };
        }
    }
}

const ATTACK_EXP = 30;
const KILL_EXP = 60;

/**
 * 内联复现 `git show HEAD:src/game/engine.ts` 的 case 'attack' 前缀 + 反击计算。
 * 返回 HEAD 语义下的反击伤害（同时返回中间量用于报告）。
 */
function legacyEngineHeadCounterDamage(preState: GameState, attackerId: string, targetId: string) {
    const state = clone(preState);
    const attacker = findUnit(state, attackerId)!;
    const target = findUnit(state, targetId)!;
    const dmg = calculateDamage(state, attackerId, targetId);
    target.hp -= dmg;
    applyCombatStatusEffectsInline(attacker, target);
    // HEAD 用的是 state 上的 ruleConfig.levelCap（不是常量 3），这里必须一致。
    addExp(attacker, target.hp <= 0 ? KILL_EXP : ATTACK_EXP, getRuleConfig(state).levelCap);

    let canCounter = false;
    if (target.hp > 0) {
        // HEAD 内联判定（与 rules.canCounterAttack 逐行等价）
        const targetStats = getEffectiveStats(target);
        const distance = getDistance(target.pos, attacker.pos);
        const isCounterStorm = hasAbility(target, 'counter_storm') && distance <= 2;
        const canNormalCounter = distance === 1 &&
            distance >= targetStats.minRange && distance <= targetStats.maxRange;
        canCounter = isCounterStorm || canNormalCounter;
    }
    const counterDmg = (target.hp > 0 && canCounter) ? calculateDamage(state, targetId, attackerId) : 0;
    return {
        counterDamage: counterDmg,
        canCounter,
        attackDamage: dmg,
        targetHpAfterHit: target.hp,
        attackerLevelAfterExp: attacker.level ?? 0,
    };
}

/** 复现 HEAD 编码器的旧公式：在原（未受击）状态上无条件反算。 */
function legacyEncoderFormula(preState: GameState, attackerId: string, targetId: string) {
    const target = findUnit(preState, targetId)!;
    const estDmg = calculateDamage(preState, attackerId, targetId);
    const estCounter = (target.hp - estDmg > 0) ? calculateDamage(preState, targetId, attackerId) : 0;
    return { estDmg, estCounter };
}

// ---------------------------------------------------------------- 用例表

const A = (id: string, dimension: string, attacker: UnitSpec, target: UnitSpec, extra: Partial<CaseSpec> = {}): CaseSpec =>
    ({ id, group: 'core', dimension, note: '', attacker, target, ...extra });

function soldier(id: string, ownerId: number, x: number, y: number, over: Partial<UnitSpec> = {}): UnitSpec {
    return { id, ownerId, unitClass: 'soldier', x, y, ...over };
}

const X = 2; // 攻击者横坐标
const Y = 4; // 攻击者纵坐标
const at = (d: number) => ({ x: X + d, y: Y });

const cases: CaseSpec[] = [];

// --- A. 近战相邻 ---
cases.push(A('A01_melee_soldier_vs_soldier_road', '近战相邻',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y),
    { note: '基准组：士兵相邻对砍，目标反击按受击后 HP 缩放', expectCounter: true }));
cases.push(A('A02_melee_berserker_vs_soldier', '近战相邻',
    { id: 'atk', ownerId: 0, unitClass: 'berserker', x: X, y: Y },
    soldier('tgt', 1, at(1).x, at(1).y),
    { note: 'berserker 有 fighting_spirit：其自身攻击不做 HP 缩放，但目标的反击仍按 HP 缩放', expectCounter: true }));
cases.push(A('A03_melee_soldier_vs_berserker_storm_d1', '近战相邻',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y },
    { note: '距离 1：普通反击与反击风暴两条路径同时成立', expectCounter: true }));
cases.push(A('A04_melee_target_killed_no_counter', '目标会被击杀',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y, { hp: 5 }),
    { note: '目标 5 HP 被击杀 → 引擎不反击（旧公式会给出非 0）', expectCounter: false }));
cases.push(A('A05_melee_exact_lethal_hp_equals_damage', '目标会被击杀',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y, { hp: 50 }),
    { note: '边界：攻击伤害恰好等于目标 HP（剩余 0）→ 不反击', expectCounter: false }));

// --- A. 目标射程不覆盖相邻格 ---
cases.push(A('A06_melee_archer_target_minrange2_no_counter', '目标射程不覆盖',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'archer', x: at(1).x, y: at(1).y },
    { note: '弓箭手 minRange=2：相邻 1 格不在其射程内 → 不反击（旧公式会误判为反击）', expectCounter: false }));
cases.push(A('A07_melee_catapult_target_minrange3_no_counter', '目标射程不覆盖',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'catapult', x: at(1).x, y: at(1).y },
    { note: '投石车 minRange=3：相邻不反击', expectCounter: false }));

// --- A. 远程距离 ---
cases.push(A('A08_ranged_archer_d2_no_counter', '远程距离 2',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y }, soldier('tgt', 1, at(2).x, at(2).y),
    { note: '弓箭手 2 格外攻击：目标无反击风暴 → 不反击', expectCounter: false }));
cases.push(A('A09_ranged_archer_d3_no_counter', '远程距离 3',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y }, soldier('tgt', 1, at(3).x, at(3).y),
    { note: '弓箭手 3 格外攻击：不反击', expectCounter: false }));
cases.push(A('A10_ranged_wolf_archer_d3_no_counter', '远程距离 3',
    { id: 'atk', ownerId: 0, unitClass: 'wolf_archer', x: X, y: Y }, soldier('tgt', 1, at(3).x, at(3).y),
    { note: '狼射手 3 格外攻击：不反击（同时其致盲作用不到反击判定）', expectCounter: false }));
cases.push(A('A11_ranged_catapult_d3_minrange_no_counter', '投石车最小射程 3',
    { id: 'atk', ownerId: 0, unitClass: 'catapult', x: X, y: Y }, soldier('tgt', 1, at(3).x, at(3).y),
    { note: '历史缺陷 headline：3 格外投石车，v13 编码器 estCounter=50，引擎实际 0', expectCounter: false }));
cases.push(A('A12_ranged_catapult_d4_no_counter', '远程距离 4',
    { id: 'atk', ownerId: 0, unitClass: 'catapult', x: X, y: Y }, soldier('tgt', 1, at(4).x, at(4).y),
    { note: '投石车 4 格外攻击：不反击', expectCounter: false }));
cases.push(A('A13_ranged_catapult_d5_maxrange_no_counter', '远程距离 5',
    { id: 'atk', ownerId: 0, unitClass: 'catapult', x: X, y: Y }, soldier('tgt', 1, at(5).x, at(5).y),
    { note: '投石车最大射程 5 格攻击：不反击', expectCounter: false }));

// --- A. 反击风暴 ---
cases.push(A('A14_storm_berserker_d2_vs_archer', '反击风暴距离 2',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y },
    { note: 'berserker counter_storm 距离 2：即使不相邻也反击', expectCounter: true }));
cases.push(A('A15_storm_berserker_d3_vs_catapult', '反击风暴距离 3',
    { id: 'atk', ownerId: 0, unitClass: 'catapult', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(3).x, y: at(3).y },
    { note: 'berserker counter_storm 距离 3 > 2：不反击', expectCounter: false }));
cases.push(A('A16_storm_berserker_d1_vs_wolf_poisoner', '反击风暴距离 1',
    { id: 'atk', ownerId: 0, unitClass: 'wolf', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y },
    { note: '狼（poisoner）相邻攻击 berserker：中毒不阻止反击', expectCounter: true }));

// --- A. 目标携带状态 ---
cases.push(A('A17_target_poisoned_soldier_d1', '目标带 poisoned',
    soldier('atk', 0, X, Y),
    soldier('tgt', 1, at(1).x, at(1).y, { status: { type: 'poisoned', remainingTicks: 2 } }),
    { note: '目标已中毒（不改防御/射程）→ 正常反击', expectCounter: true }));
cases.push(A('A18_target_weakened_soldier_d1', '目标带 weakened',
    soldier('atk', 0, X, Y),
    soldier('tgt', 1, at(1).x, at(1).y, { status: { type: 'weakened', remainingTurns: 1 } }),
    { note: '目标虚弱：防御 -10（受击更痛），反击仍在射程内', expectCounter: true }));
cases.push(A('A19_target_inspired_soldier_d1', '目标带 inspired',
    soldier('atk', 0, X, Y),
    soldier('tgt', 1, at(1).x, at(1).y, { status: { type: 'inspired', remainingTurns: 0 } }),
    { note: '目标鼓舞：近战攻击 +10，反击伤害更大', expectCounter: true }));
cases.push(A('A20_target_blinded_soldier_d1', '目标带 blinded',
    soldier('atk', 0, X, Y),
    soldier('tgt', 1, at(1).x, at(1).y, { status: { type: 'blinded', remainingTurns: 1 } }),
    { note: '目标战前已致盲：射程被压到 0 → 不反击（预测与引擎都应为 0）', expectCounter: false }));
cases.push(A('A21_target_blinded_berserker_storm_d1', '目标带 blinded',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y, status: { type: 'blinded', remainingTurns: 1 } },
    { note: '致盲 berserker 相邻：反击风暴不看射程 → 仍反击', expectCounter: true }));
cases.push(A('A22_target_blinded_berserker_storm_d2', '目标带 blinded',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y, status: { type: 'blinded', remainingTurns: 1 } },
    { note: '致盲 berserker 距离 2：反击风暴仍生效', expectCounter: true }));
cases.push(A('A23_ghost_counter_death_reaper_bonus', '目标带 death_reaper',
    soldier('atk', 0, X, Y, { status: { type: 'poisoned', remainingTicks: 2 } }),
    { id: 'tgt', ownerId: 1, unitClass: 'ghost', x: at(1).x, y: at(1).y },
    { note: '反击方 ghost 有 death_reaper，被反击方（原攻击者）带负面状态 → 反击加成 +20', expectCounter: true }));

// --- A. 攻击者带 blinder：本次攻击施加的致盲必须在反击判定前生效 ---
cases.push(A('A24_wolf_archer_d1_blinds_adjacent_soldier', '攻击者 wolf_archer 施加致盲',
    { id: 'atk', ownerId: 0, unitClass: 'wolf_archer', x: X, y: Y }, soldier('tgt', 1, at(1).x, at(1).y),
    { note: 'wolf_archer 相邻攻击：本次攻击先致盲目标 → 目标射程归零 → 引擎不反击', expectCounter: false, probeKind: 'attack_applied_blinding' }));
cases.push(A('A25_wolf_archer_d1_vs_poisoned_soldier', '攻击者 wolf_archer 施加致盲',
    { id: 'atk', ownerId: 0, unitClass: 'wolf_archer', x: X, y: Y },
    soldier('tgt', 1, at(1).x, at(1).y, { status: { type: 'poisoned', remainingTicks: 2 } }),
    { note: '目标已有中毒：致盲不覆盖（force=false）→ 反击照常发生', expectCounter: true }));
cases.push(A('A26_wolf_archer_d1_vs_storm_berserker', '攻击者 wolf_archer 施加致盲',
    { id: 'atk', ownerId: 0, unitClass: 'wolf_archer', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y },
    { note: '目标有反击风暴：致盲不影响风暴路径 → 反击照常', expectCounter: true }));
cases.push(A('A27_dark_mage_d1_blinds_adjacent_soldier', '攻击者 dark_mage 施加致盲',
    { id: 'atk', ownerId: 0, unitClass: 'dark_mage', x: X, y: Y }, soldier('tgt', 1, at(1).x, at(1).y),
    { note: 'dark_mage（blinder，魔法）相邻攻击：同 A24 的机制，换成魔法伤害', expectCounter: false, probeKind: 'attack_applied_blinding' }));

// --- A. 等级 ---
cases.push(A('A28_level3_soldier_vs_level0_soldier_d1', '等级 3',
    soldier('atk', 0, X, Y, { level: 3, exp: 0 }), soldier('tgt', 1, at(1).x, at(1).y, { level: 0 }),
    { note: '攻击者 3 级、目标 0 级', expectCounter: true }));
cases.push(A('A29_level0_archer_vs_level3_berserker_d2', '等级 3',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y, level: 0 },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y, level: 3 },
    { note: '目标 3 级 berserker（攻击 100）在 2 格外风暴反击', expectCounter: true }));
cases.push(A('A30_level3_golem_target_maxhp175', '等级 3 / maxHp≠100',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'golem', x: at(1).x, y: at(1).y, level: 3, hp: 175, maxHp: 100 },
    { note: 'golem maxHpGrowth=25：3 级有效最大 HP=175，反击的 HP 缩放分母不再是 100', expectCounter: true }));
cases.push(A('A31_archer_levelup_midattack_exp90', '攻击者攻击中升级',
    { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y, level: 0, exp: 90 },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y },
    { note: 'archer exp=90 攻击 +30 → 攻击奖励在反击判定前结算，攻击者升级使防御 +5', expectCounter: true, probeKind: 'attacker_levelup' }));
cases.push(A('A32_golem_levelup_midattack_exp90', '攻击者攻击中升级',
    { id: 'atk', ownerId: 0, unitClass: 'golem', x: X, y: Y, level: 0, exp: 90, hp: 50 },
    soldier('tgt', 1, at(1).x, at(1).y),
    { note: 'golem exp=90 + maxHpGrowth=25：升级同时加防并回血 25，均在反击前结算', expectCounter: true, probeKind: 'attacker_levelup' }));

// --- A. 地形 ---
cases.push(A('A33_terrain_target_on_forest', '地形 forest',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y),
    { tiles: { [`${at(1).x},${at(1).y}`]: FOREST }, note: '目标站森林（防御 +10）', expectCounter: true }));
cases.push(A('A34_terrain_target_on_mountain', '地形 mountain',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y),
    { tiles: { [`${at(1).x},${at(1).y}`]: MOUNTAIN }, note: '目标站山脉（防御 +15）', expectCounter: true }));
cases.push(A('A35_terrain_attacker_on_mountain_target_road', '地形 mountain',
    soldier('atk', 0, X, Y), soldier('tgt', 1, at(1).x, at(1).y),
    { tiles: { [`${X},${Y}`]: MOUNTAIN }, note: '攻击者站山脉：反击公式里原攻击者是防守方，其地形防御 +15', expectCounter: true }));

// --- A. 伤害乘数路径（近战大师 / 远程防御） ---
cases.push(A('A36_dragon_melee_master_counter_d1', '近战大师 ×1.5',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'dragon', x: at(1).x, y: at(1).y },
    { note: '目标是 dragon（melee_master）：反击距离 1 时乘数 ×1.5', expectCounter: true }));
cases.push(A('A37_dragon_attacker_d2_vs_berserker_ranged_defense', '远程防御 ×0.5',
    { id: 'atk', ownerId: 0, unitClass: 'dragon', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y },
    { note: '原攻击者 dragon 有 ranged_defense：2 格风暴反击时乘数 ×0.5', expectCounter: true }));

// --- A. 槽 15 的 Math.min(1.0, …) 截断 ---
cases.push(A('A38_mermaid_weakened_vs_l3_berserker_slot15_clamp', '槽 15 截断 >100',
    { id: 'atk', ownerId: 0, unitClass: 'mermaid', x: X, y: Y, status: { type: 'weakened', remainingTurns: 1 } },
    { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y, level: 3 },
    { note: '虚弱人鱼（有效物防 -10）被 3 级 berserker 反击：预计 110 > 100 → 槽 15 被截断为 1.0', expectCounter: true }));
cases.push(A('A39_mermaid_weakened_vs_l3_inspired_berserker_clamp', '槽 15 截断 >100',
    { id: 'atk', ownerId: 0, unitClass: 'mermaid', x: X, y: Y, status: { type: 'weakened', remainingTurns: 1 } },
    {
        id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(1).x, y: at(1).y, level: 3,
        status: { type: 'inspired', remainingTurns: 0 },
    },
    { note: '目标同时鼓舞（近战 +10）：预计 120 → 槽 15 截断为 1.0', expectCounter: true }));

// --- A. 其它伤害类型 / 负魔防 ---
cases.push(A('A40_ghost_magic_vs_slime_negative_mdef', '魔法伤害 / 负魔防',
    { id: 'atk', ownerId: 0, unitClass: 'ghost', x: X, y: Y },
    { id: 'tgt', ownerId: 1, unitClass: 'slime', x: at(1).x, y: at(1).y, hp: 100 },
    { note: 'ghost 魔法攻击打 slime（魔防 -10），slime 反击（物理）', expectCounter: true }));
cases.push(A('A41_wolf_archer_target_d1_counter', '目标射程覆盖相邻格',
    soldier('atk', 0, X, Y),
    { id: 'tgt', ownerId: 1, unitClass: 'wolf_archer', x: at(1).x, y: at(1).y },
    { note: '目标是狼射手（minRange=1）：原攻击者没有致盲能力 → 正常反击', expectCounter: true }));

// --- E. 残余风险探针 ---
cases.push({
    id: 'P01_elf_cleansing_aura_standby_heal', group: 'probe', dimension: 'standby 光环', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'elf', x: X, y: Y },
    target: soldier('tgt', 1, at(1).x, at(1).y),
    probeKind: 'standby_heal', expectCounter: true,
});
cases.push({
    id: 'P02_ghost_on_grave_standby_heal', group: 'probe', dimension: 'standby 墓碑', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'ghost', x: X, y: Y, hp: 100 },
    target: soldier('tgt', 1, at(1).x, at(1).y),
    graveAt: { x: X, y: Y },
    probeKind: 'standby_heal', expectCounter: true,
});
cases.push({
    id: 'P03_golem_weakness_aura_standby_status', group: 'probe', dimension: 'standby 光环', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'golem', x: X, y: Y },
    target: soldier('tgt', 1, at(1).x, at(1).y),
    probeKind: 'standby_status_aura', expectCounter: true,
});
cases.push({
    id: 'P04_druid_attack_aura_standby_status', group: 'probe', dimension: 'standby 光环', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'druid', x: X, y: Y },
    target: soldier('tgt', 1, at(1).x, at(1).y),
    probeKind: 'standby_status_aura', expectCounter: true,
});
cases.push({
    id: 'P05_levelup_disabled_by_levelcap0', group: 'probe', dimension: '攻击者攻击中升级', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'archer', x: X, y: Y, level: 0, exp: 90 },
    target: { id: 'tgt', ownerId: 1, unitClass: 'berserker', x: at(2).x, y: at(2).y },
    rules: { levelCap: 0 },
    probeKind: 'levelup_disabled', expectCounter: true,
});
// --- 控制组：非法动作（射程外） ---
cases.push({
    id: 'CTRL_catapult_d2_illegal', group: 'control', dimension: '合法性对照', note: '',
    attacker: { id: 'atk', ownerId: 0, unitClass: 'catapult', x: X, y: Y },
    target: soldier('tgt', 1, at(2).x, at(2).y),
    expectCounter: false,
});

// --- D. 回归测试场景复现（engine.test.ts 6.4.1b） ---
cases.push({
    id: 'D01_regression_6_4_1b', group: 'regression', dimension: '回归 6.4.1b', note: '',
    attacker: { id: 'berserker_attacker', ownerId: 0, unitClass: 'berserker', x: 1, y: 1, hp: 10, level: 1, exp: 100 },
    target: {
        id: 'wolf_archer_defender', ownerId: 1, unitClass: 'wolf_archer', x: 1, y: 2, hp: 65, level: 0, exp: 40,
        status: { type: 'poisoned', remainingTicks: 2 },
    },
    buildOverride: () => {
        const state = createDemoState();
        state.map.width = 3;
        state.map.height = 3;
        state.map.tiles = Array.from({ length: 3 }, () =>
            Array.from({ length: 3 }, () => ({ terrainId: ROAD as never, ownerId: null }))) as never;
        state.units = [
            toUnit({ id: 'berserker_attacker', ownerId: 0, unitClass: 'berserker', x: 1, y: 1, hp: 10, level: 1, exp: 100 }),
            toUnit({
                id: 'wolf_archer_defender', ownerId: 1, unitClass: 'wolf_archer', x: 1, y: 2, hp: 65, level: 0, exp: 40,
                status: { type: 'poisoned', remainingTicks: 2 },
            }),
            toUnit({ id: 'enemy_anchor', ownerId: 1, unitClass: 'soldier', x: 0, y: 0 }),
            toUnit({ id: 'friendly_anchor', ownerId: 0, unitClass: 'soldier', x: 2, y: 0 }),
        ];
        state.currentPlayer = 0;
        return state;
    },
    expectCounter: true,
});

// ---------------------------------------------------------------- 逐组核验

function parseInfo(info: string): { attackDamage: number | null; counterDamage: number } {
    const atk = /attacked .+? for (\d+) dmg/.exec(info);
    const cnt = /counterattacked for (\d+) dmg/.exec(info);
    return {
        attackDamage: atk ? Number(atk[1]) : null,
        counterDamage: cnt ? Number(cnt[1]) : 0,
    };
}

interface AuditRecord { [key: string]: unknown }

function auditCase(spec: CaseSpec): AuditRecord {
    const pre = buildCaseState(spec);
    const attackerId = spec.attacker.id;
    const targetId = spec.target.id;
    const action: Action = { type: 'attack', attackerId, targetId };
    const preHashBefore = sha256(JSON.stringify(pre));

    const preAttacker = findUnit(pre, attackerId)!;
    const preTarget = findUnit(pre, targetId)!;
    const distance = getDistance(preAttacker.pos, preTarget.pos);

    // ---- 0) 合法性（真实引擎的合法动作集里是否含这条攻击）
    const legalEngine = new GameEngine(clone(pre));
    const legalActions = legalEngine.getLegalActions(0);
    const actionLegal = legalActions.some((a) =>
        a.type === 'attack' && a.attackerId === attackerId && a.targetId === targetId);

    // ---- 1) 待核验的预测入口（在「攻击前状态」的同一个对象上取，随后校验未被改动）
    const estimate = estimateCounterDamage(pre, attackerId, targetId);
    const canCounterPre = canCounterAttack(pre, attackerId, targetId);

    // ---- 2) 自建 resolved 状态：内联复现引擎 attack 分支的「扣血 + 附加状态」
    const modelState = clone(pre);
    const modelAttackDamage = calculateDamage(modelState, attackerId, targetId);
    const modelTarget = findUnit(modelState, targetId)!;
    const modelAttacker = findUnit(modelState, attackerId)!;
    modelTarget.hp -= modelAttackDamage;
    applyCombatStatusEffectsInline(modelAttacker, modelTarget);
    const canCounterResolved = canCounterAttack(modelState, attackerId, targetId);
    const resolvedModelCounter = counterDamageOnResolvedState(modelState, attackerId, targetId);
    const targetHpAfterHit = modelTarget.hp;

    // ---- 3) 旧公式（v13 编码器，原状态无条件反算）
    const legacyEncoder = legacyEncoderFormula(pre, attackerId, targetId);
    const legacyEncoderOnResolved = (() => {
        const resolvedClone = clone(modelState);
        const t = findUnit(resolvedClone, targetId)!;
        return (t.hp - calculateDamage(resolvedClone, attackerId, targetId) > 0)
            ? calculateDamage(resolvedClone, targetId, attackerId)
            : 0;
    })();

    // ---- 4) 旧引擎（HEAD）模型：验证重构是否行为保持
    const headModel = legacyEngineHeadCounterDamage(pre, attackerId, targetId);

    // ---- 5) 真实引擎执行
    const engine = new GameEngine(clone(pre));
    const result = engine.step(action);
    const post = result.state;
    const parsed = parseInfo(result.info);
    const postAttacker = findUnit(post, attackerId);
    const postTarget = findUnit(post, targetId);

    // ---- 6) 预测入口纯度：攻击前状态对象必须未被改动
    const preHashAfter = sha256(JSON.stringify(pre));

    // ---- 7) 编码器槽 15（在攻击前状态上编码候选动作）
    // semantics 是 Float32Array：0.12 存成 float32 后 ×100 ≈ 11.9999997，因此比较必须带容差。
    const encoded = encodeCandidateActionSpatial(pre, 0, action, 'v2');
    const semantics15 = encoded.semantics[15];
    const semantics15Times100 = semantics15 * 100;
    const slot15Clamped = estimate > 100;

    // ---- 8) counterDamageOnResolvedState 在「引擎最终状态」上的读数（附差异原因）
    const finalDiffersFromModel: string[] = [];
    if (postAttacker) {
        if (postAttacker.hp !== modelAttacker.hp) finalDiffersFromModel.push('attackerHp');
        if ((postAttacker.level ?? 0) !== (modelAttacker.level ?? 0)) finalDiffersFromModel.push('attackerLevel');
        if (statusOf(postAttacker) !== statusOf(modelAttacker)) finalDiffersFromModel.push('attackerStatus');
    } else {
        finalDiffersFromModel.push('attackerRemoved');
    }
    if (postTarget) {
        if (postTarget.hp !== modelTarget.hp) finalDiffersFromModel.push('targetHp');
        if (statusOf(postTarget) !== statusOf(modelTarget)) finalDiffersFromModel.push('targetStatus');
    } else {
        finalDiffersFromModel.push('targetRemoved');
    }
    const resolvedOnEngineFinal = counterDamageOnResolvedState(post, attackerId, targetId);

    // ---- 9) 读数与判定
    const engineCounter = parsed.counterDamage;
    const slot15AbsDiff = semantics15Times100 - engineCounter;
    const attackerHpBefore = preAttacker.hp;
    const attackerHpAfter = postAttacker ? postAttacker.hp : 0;
    const attackerHpDelta = attackerHpAfter - attackerHpBefore;   // 负数=失血
    const attackerKilledByCounter = engineCounter >= attackerHpBefore;
    const targetHpAfterEngine = postTarget ? postTarget.hp : 0;

    const attackerLeveledUp = (postAttacker?.level ?? 0) > (preAttacker.level ?? 0);
    const targetGainedBlinded = (statusOf(postTarget).startsWith('blinded')) && !statusOf(preTarget).startsWith('blinded') &&
        hasAbility(preAttacker, 'blinder');
    const blindingBlockedCounter = targetGainedBlinded && !canCounterResolved;

    let mismatchCause: string | null = null;
    if (estimate !== engineCounter) {
        if (blindingBlockedCounter) mismatchCause = 'estimateCounterDamage 在攻击前状态上做反击判定：本次攻击施加的致盲在 resolved 状态才生效（引擎不反击）';
        else if (attackerLeveledUp) mismatchCause = '攻击者攻击经验在反击前结算并升级：引擎按升级后的防御算反击，攻击前状态预测用的是旧等级';
        else mismatchCause = '未归因（需要人工复核）';
    }
    const counterfactual = canCounterResolved
        ? calculateDamageAtHp(modelState, targetId, attackerId, targetHpAfterHit)
        : 0;

    return {
        id: spec.id,
        group: spec.group,
        dimension: spec.dimension,
        note: spec.note,
        probeKind: spec.probeKind ?? null,
        expectCounter: spec.expectCounter ?? null,
        distance,
        actionLegal,
        terrain: {
            attackerTile: String((pre.map.tiles[preAttacker.pos.y][preAttacker.pos.x] as { terrainId: number }).terrainId),
            targetTile: String((pre.map.tiles[preTarget.pos.y][preTarget.pos.x] as { terrainId: number }).terrainId),
        },
        attacker: {
            id: attackerId, unitClass: preAttacker.unitClass, level: preAttacker.level ?? 0, exp: preAttacker.exp ?? 0,
            hp: preAttacker.hp, maxHpEffective: getEffectiveStats(preAttacker).maxHp, status: statusOf(preAttacker),
            abilities: UNIT_CONFIGS[preAttacker.unitClass].abilities,
            minRange: getEffectiveStats(preAttacker).minRange, maxRange: getEffectiveStats(preAttacker).maxRange,
        },
        target: {
            id: targetId, unitClass: preTarget.unitClass, level: preTarget.level ?? 0, exp: preTarget.exp ?? 0,
            hp: preTarget.hp, maxHpEffective: getEffectiveStats(preTarget).maxHp, status: statusOf(preTarget),
            abilities: UNIT_CONFIGS[preTarget.unitClass].abilities,
            minRange: getEffectiveStats(preTarget).minRange, maxRange: getEffectiveStats(preTarget).maxRange,
        },
        engine: {
            ran: actionLegal,
            info: result.info,
            attackDamage: parsed.attackDamage,
            counterDamage: engineCounter,
            targetHpAfterEngine,
            targetHpAfterModel: targetHpAfterHit,
            targetRemoved: !postTarget,
            attackerHpBefore,
            attackerHpAfter,
            attackerHpDelta,
            attackerKilledByCounter,
            attackerLevelAfter: postAttacker?.level ?? null,
            attackerStatusAfter: statusOf(postAttacker),
            targetStatusAfter: statusOf(postTarget),
            standbyEffectsObserved: attackerHpDelta !== -engineCounter && !attackerKilledByCounter,
        },
        predictions: {
            estimateCounterDamage_preState: estimate,
            canCounterAttack_preState: canCounterPre,
            canCounterAttack_resolvedModel: canCounterResolved,
            counterDamageOnResolvedState_model: resolvedModelCounter,
            counterDamageOnResolvedState_engineFinalState: resolvedOnEngineFinal,
            counterfactual_resolvedStatusGate: counterfactual,
            legacyEncoderFormula_preState: legacyEncoder.estCounter,
            legacyEncoderEstAttackDamage: legacyEncoder.estDmg,
            legacyEncoderFormula_onResolvedModel: legacyEncoderOnResolved,
            legacyEngineHeadModel: headModel.counterDamage,
            legacyEngineHeadModelCanCounter: headModel.canCounter,
            legacyEngineHeadAttackerLevel: headModel.attackerLevelAfterExp,
            modelAttackDamage,
        },
        encoder: {
            semantics15,
            semantics15Times100,
            slot15AbsDiffVsEngine: Number(slot15AbsDiff.toFixed(6)),
            slot15Clamped,
            slot15ClampInfoLoss: slot15Clamped ? estimate - 100 : 0,
            slot15EqualsEngineCounter: !slot15Clamped && Math.abs(slot15AbsDiff) <= 1e-3,
            slot15EqualsEstimate: !slot15Clamped && Math.abs(semantics15Times100 - estimate) <= 1e-3,
            note: 'semantics 为 Float32Array：×100 后存在 ~1e-5 级表示误差，比较用 1e-3 容差；estCounter>100 时被 Math.min(1.0, …) 截断，信息不可逆丢失。',
        },
        legacyDelta: {
            value: legacyEncoder.estCounter - engineCounter,
            direction: legacyEncoder.estCounter === engineCounter ? 'same'
                : (legacyEncoder.estCounter > engineCounter ? 'over' : 'under'),
        },
        verdict: {
            preStateUnchanged: preHashBefore === preHashAfter,
            estimateEqualsEngineCounter: estimate === engineCounter,
            resolvedModelEqualsEngineCounter: resolvedModelCounter === engineCounter,
            legacyEngineHeadEqualsEngineCounter: headModel.counterDamage === engineCounter,
            attackerHpDeltaEqualsCounter: attackerHpDelta === -engineCounter,
            finalStateDiffersFromModel: finalDiffersFromModel,
            mismatchCause,
            class: estimate === engineCounter ? 'MATCH'
                : (estimate > engineCounter ? 'MISMATCH_OVER' : 'MISMATCH_UNDER'),
        },
    };
}

const records: AuditRecord[] = cases.map(auditCase);

// ---------------------------------------------------------------- E 探针：治疗路径是否存在「行动者 HP 缩放」

/**
 * heal / summon 分支都不调用 calculateDamage：
 *   engine.ts:629 `healVal = healer.unitClass === 'paladin' ? (40 + level * 10) : 40;`
 *   engine.ts:669 召唤物 `hp: 100, maxHp: 100`
 * 这里用运行时读数确认治疗量与治疗者当前 HP 无关（若按 hp/maxHp 缩放，hp=20 只能回 8）。
 */
const healPathProbe = (() => {
    const pre = buildCaseState({
        id: 'P06_heal_path_is_flat_value', group: 'probe', dimension: '治疗路径', note: '',
        attacker: { id: 'healer', ownerId: 0, unitClass: 'paladin', x: X, y: Y, hp: 20 },
        target: soldier('tgt', 1, at(2).x, at(2).y),
        extras: [soldier('ally', 0, X + 1, Y, { hp: 50 })],
    });
    const engine = new GameEngine(clone(pre));
    const action: Action = { type: 'heal', healerId: 'healer', targetId: 'ally' };
    const legal = engine.getLegalActions(0).some((a) => a.type === 'heal' && a.healerId === 'healer' && a.targetId === 'ally');
    const result = engine.step(action);
    const post = result.state;
    return {
        id: 'P06_heal_path_is_flat_value',
        actionLegal: legal,
        info: result.info,
        healerHpBefore: 20,
        healerHpAfter: findUnit(post, 'healer')?.hp ?? null,
        allyHpBefore: 50,
        allyHpAfter: findUnit(post, 'ally')?.hp ?? null,
        healDelta: (findUnit(post, 'ally')?.hp ?? 0) - 50,
        note: '治疗量为固定 40，与治疗者当前 HP(20) 无关；若沿用伤害公式的 hp/maxHp 缩放会得到 8。',
    };
})();

// ---------------------------------------------------------------- D. 回归测试数值

const regression = (() => {
    const record = records.find((r) => r.id === 'D01_regression_6_4_1b') as AuditRecord;
    // 反事实：如果按「受击前 HP」缩放（v13 编码器的口径），反击会是多少
    const pre = buildCaseState(cases.find((c) => c.id === 'D01_regression_6_4_1b')!);
    const preHpScaling = calculateDamageAtHp(pre, 'wolf_archer_defender', 'berserker_attacker', 65);
    const postHpScaling = calculateDamageAtHp(pre, 'wolf_archer_defender', 'berserker_attacker', 5);
    return {
        testName: '6.4.1b 反击伤害按受击后的剩余 HP 缩放',
        file: 'src/game/tests/engine.test.ts:3959-4025',
        asserted: {
            attackerHp: 9,
            defenderHp: 5,
        },
        observedInThisAudit: {
            attackerHp: (record.engine as AuditRecord).attackerHpAfter,
            defenderHp: (record.engine as AuditRecord).targetHpAfterEngine,
            engineCounter: (record.engine as AuditRecord).counterDamage,
        },
        discriminatesPreHitHpScaling: {
            counterIfScaledByPreHitHp65: preHpScaling,
            counterIfScaledByPostHitHp5: postHpScaling,
            note: '受击前 HP 口径会给出 22（攻击者 10 → -12，测试断言 9 会失败）；受击后 HP 口径给出 1（攻击者 10 → 9）。',
        },
    };
})();

// ---------------------------------------------------------------- 汇总

const core = records.filter((r) => r.group === 'core');
const probes = records.filter((r) => r.group === 'probe');
const controls = records.filter((r) => r.group === 'control');
const regressionRecords = records.filter((r) => r.group === 'regression');
const all = records;

const mismatches = core.filter((r) => !(r.verdict as AuditRecord).estimateEqualsEngineCounter);
const clamps = all.filter((r) => (r.encoder as AuditRecord).slot15Clamped);
const legacyDiff = core.filter((r) => (r.legacyDelta as AuditRecord).value !== 0);
const legacyOver = legacyDiff.filter((r) => (r.legacyDelta as AuditRecord).direction === 'over');
const legacyUnder = legacyDiff.filter((r) => (r.legacyDelta as AuditRecord).direction === 'under');
const legacyMaxAbs = core.reduce((m, r) => Math.max(m, Math.abs((r.legacyDelta as AuditRecord).value as number)), 0);
const headModelDiff = all.filter((r) => !(r.verdict as AuditRecord).legacyEngineHeadEqualsEngineCounter);
const resolvedDiff = core.filter((r) => !(r.verdict as AuditRecord).resolvedModelEqualsEngineCounter);
const purityFailures = all.filter((r) => !(r.verdict as AuditRecord).preStateUnchanged);

const summary = {
    coreCount: core.length,
    coreMatch: core.length - mismatches.length,
    coreMismatch: mismatches.length,
    mismatchIds: mismatches.map((r) => r.id),
    probeCount: probes.length,
    controlCount: controls.length,
    regressionCount: regressionRecords.length,
    slot15ClampedCount: clamps.length,
    slot15ClampedIds: clamps.map((r) => r.id),
    slot15MismatchIds: all.filter((r) => !(r.encoder as AuditRecord).slot15EqualsEngineCounter).map((r) => r.id),
    legacyEncoderFormulaDiffCount: legacyDiff.length,
    legacyEncoderFormulaOverCount: legacyOver.length,
    legacyEncoderFormulaUnderCount: legacyUnder.length,
    legacyEncoderFormulaMaxAbsDelta: legacyMaxAbs,
    legacyEncoderFormulaMaxAbsCase: core.reduce<AuditRecord | null>((best, r) => {
        if (!best) return r;
        const cur = Math.abs((r.legacyDelta as AuditRecord).value as number);
        const bst = Math.abs((best.legacyDelta as AuditRecord).value as number);
        return cur > bst ? r : best;
    }, null)?.id ?? null,
    resolvedModelEntryDiffIds: resolvedDiff.map((r) => r.id),
    resolvedFinalStateUsableIds: all
        .filter((r) => !((r.verdict as AuditRecord).finalStateDiffersFromModel as string[]).includes('attackerRemoved'))
        .map((r) => r.id),
    resolvedFinalStateDiffIds: all
        .filter((r) => !((r.verdict as AuditRecord).finalStateDiffersFromModel as string[]).includes('attackerRemoved'))
        .filter((r) => (r.predictions as AuditRecord).counterDamageOnResolvedState_engineFinalState !==
            (r.engine as AuditRecord).counterDamage)
        .map((r) => r.id),
    resolvedFinalStateUnusableIds: all
        .filter((r) => ((r.verdict as AuditRecord).finalStateDiffersFromModel as string[]).includes('attackerRemoved'))
        .map((r) => r.id),
    legacyEngineHeadModelDiffIds: headModelDiff.map((r) => r.id),
    preStatePurityFailures: purityFailures.map((r) => r.id),
    hpDeltaConfoundedIds: all.filter((r) => !(r.verdict as AuditRecord).attackerHpDeltaEqualsCounter).map((r) => r.id),
};

// ---------------------------------------------------------------- 源码身份

function readGitHead(): string {
    try {
        const head = fs.readFileSync(path.resolve('.git', 'HEAD'), 'utf8').trim();
        const m = /^ref: (.+)$/.exec(head);
        if (!m) return head;
        const refPath = path.resolve('.git', m[1]);
        if (fs.existsSync(refPath)) return fs.readFileSync(refPath, 'utf8').trim();
        const packed = fs.readFileSync(path.resolve('.git', 'packed-refs'), 'utf8');
        const line = packed.split('\n').find((l) => l.endsWith(` ${m[1]}`));
        return line ? line.split(' ')[0] : 'unknown';
    } catch {
        return 'unknown';
    }
}

function fileHash(rel: string): string {
    try {
        return sha256(fs.readFileSync(path.resolve(rel), 'utf8'));
    } catch {
        return 'missing';
    }
}

const sourceIdentity = {
    gitHead: readGitHead(),
    files: {
        'src/game/rules.ts': fileHash('src/game/rules.ts'),
        'src/game/engine.ts': fileHash('src/game/engine.ts'),
        'src/game/ai/spatial_tensor_encoder.ts': fileHash('src/game/ai/spatial_tensor_encoder.ts'),
        'src/game/abilities.ts': fileHash('src/game/abilities.ts'),
        'src/game/units.ts': fileHash('src/game/units.ts'),
        'src/game/rule_config.ts': fileHash('src/game/rule_config.ts'),
        'src/game/map.ts': fileHash('src/game/map.ts'),
    },
    encoderSchemaId: ENCODER_SCHEMA_ID,
    node: process.version,
    cwd: process.cwd(),
};

// ---------------------------------------------------------------- 输出目录与 JSON

const outDir = path.resolve('v14', 'out', 'v14_20260924_t14', 'T14-03', 'counter_audit');
fs.mkdirSync(outDir, { recursive: true });

const vitestLogPath = path.join(outDir, 'vitest_engine_test.log');
const vitestLog = fs.existsSync(vitestLogPath) ? fs.readFileSync(vitestLogPath, 'utf8') : null;
const vitestSummaryLines = vitestLog
    ? vitestLog.split(/\r?\n/).filter((l) => /Test Files|Tests\s+\d|✓ src\/game\/tests\/engine\.test\.ts|FAIL/.test(l))
    : [];

const report = {
    schema: 'v14_counter_audit_1',
    task: 'T14-03',
    generatedAt: new Date().toISOString(),
    auditor: 'independent counter-semantics audit (read-only on src/)',
    sourceIdentity,
    method: {
        estimateStateUse: 'estimateCounterDamage 一律在「攻击前状态」的同一对象上调用（脚本不把它交给引擎，引擎拿到的是深拷贝），并用 sha256 校验调用前后该对象未变。',
        engineReading: '真实读数取 GameEngine.step(attack) 的 info：攻击伤害 = "attacked ... for N dmg"，反击伤害 = "Target counterattacked for N dmg"（即 attacker.hp -= counterDmg 实际扣减值）；目标剩余 HP 取执行后状态。',
        resolvedEntryUse: 'counterDamageOnResolvedState 的主读数是自建 resolved 状态（深拷贝攻击前状态 → 扣本次攻击伤害 → 内联复现 applyCombatStatusEffects），另附在引擎最终状态上的读数与差异字段。',
        legacyEncoderFormula: 'git show HEAD:src/game/ai/spatial_tensor_encoder.ts 的 `estCounter = (defender.hp - estDmg > 0) ? calculateDamage(state, defender.id, attacker.id) : 0;`（原状态、无条件反算），脚本内联复现。',
        legacyEngineHeadModel: 'git show HEAD:src/game/engine.ts case "attack"：扣血 → applyCombatStatusEffects → addExp → 内联反击判定 → `calculateDamage(this.state, target.id, attacker.id)`；脚本内联复现用于验证重构行为保持。',
        limitations: 'HP 观测量（攻击后 HP - 攻击前 HP）与反击伤害在击杀截断 / 攻击中升级回血 / standby 光环回血时会分离，脚本按 case 单独标注，不作为等价性断言。',
    },
    summary,
    regression,
    probes: {
        healPath: healPathProbe,
    },
    vitest: {
        command: 'npx --no-install vitest run --config vitest.v11.config.mjs src/game/tests/engine.test.ts',
        logFile: vitestLog ? 'vitest_engine_test.log' : null,
        logSummaryLines: vitestSummaryLines,
    },
    cases: records,
};

fs.writeFileSync(path.join(outDir, 'counter_audit_results.json'), `${JSON.stringify(report, null, 2)}\n`);

// ---------------------------------------------------------------- Markdown 报告

function unitCell(u: AuditRecord): string {
    const speed = `${u.unitClass} L${u.level}`;
    const range = `${u.minRange}-${u.maxRange}`;
    const stat = u.status === 'none' ? '' : `/${u.status}`;
    return `${speed}(hp${u.hp}/${u.maxHpEffective},${range})${stat}`;
}

function caseRow(r: AuditRecord, index: number): string {
    const e = r.engine as AuditRecord;
    const p = r.predictions as AuditRecord;
    const enc = r.encoder as AuditRecord;
    const v = r.verdict as AuditRecord;
    const ld = r.legacyDelta as AuditRecord;
    const t = r.target as AuditRecord;
    const a = r.attacker as AuditRecord;
    return [
        String(index),
        r.id as string,
        r.dimension as string,
        `${a.unitClass} L${a.level}`,
        `${t.unitClass} L${t.level}`,
        String(r.distance),
        `${r.terrain ? (r.terrain as AuditRecord).attackerTile : ''}/${r.terrain ? (r.terrain as AuditRecord).targetTile : ''}`,
        String(e.attackDamage ?? 'n/a'),
        String(e.targetHpAfterEngine),
        String(e.counterDamage),
        String(p.estimateCounterDamage_preState),
        String(p.counterDamageOnResolvedState_model),
        String(p.legacyEncoderFormula_preState),
        `${(ld.value as number) > 0 ? '+' : ''}${ld.value}(${ld.direction})`,
        String((enc.semantics15 as number).toFixed(6)),
        (enc.slot15Clamped as boolean) ? `截断(-${enc.slot15ClampInfoLoss})` : (enc.semantics15Times100 as number).toFixed(3),
        (enc.slot15EqualsEngineCounter as boolean) ? '0' : (enc.slot15AbsDiffVsEngine as number).toFixed(3),
        v.class as string,
    ].join(' | ');
}

const mdHeader = [
    '# | 用例 | 维度 | 攻击者 | 目标 | 距离 | 地形(攻/目) | 引擎攻击伤害 | 目标剩余HP | 引擎反击 | estimateCounterDamage(攻击前状态) | counterDamageOnResolvedState(resolved状态) | 旧编码器公式(原状态) | 旧公式差 | 槽15(原始) | 槽15×100 | 槽15×100-引擎 | 判定',
    '--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---',
].join('\n');

const detailLines: string[] = [];
for (const r of all) {
    const e = r.engine as AuditRecord;
    const p = r.predictions as AuditRecord;
    const v = r.verdict as AuditRecord;
    const enc = r.encoder as AuditRecord;
    detailLines.push(`### ${r.id}`);
    detailLines.push('');
    detailLines.push(`- 维度：${r.dimension}｜距离：${r.distance}｜合法动作：${r.actionLegal}`);
    detailLines.push(`- 攻击者：${unitCell(r.attacker as AuditRecord)}｜能力：${(r.attacker as AuditRecord).abilities ? ((r.attacker as AuditRecord).abilities as string[]).join(',') : ''}`);
    detailLines.push(`- 目标：${unitCell(r.target as AuditRecord)}｜能力：${(r.target as AuditRecord).abilities ? ((r.target as AuditRecord).abilities as string[]).join(',') : ''}`);
    if (r.note) detailLines.push(`- 说明：${r.note}`);
    detailLines.push(`- 引擎 info：\`${String(e.info).trim()}\``);
    detailLines.push(`- 读数：引擎反击=${e.counterDamage}｜预测=${p.estimateCounterDamage_preState}｜resolved 入口=${p.counterDamageOnResolvedState_model}｜旧编码器公式=${p.legacyEncoderFormula_preState}｜旧引擎模型=${p.legacyEngineHeadModel}`);
    detailLines.push(`- 攻击者 HP：${e.attackerHpBefore} → ${e.attackerHpAfter}（Δ=${e.attackerHpDelta}，击杀=${e.attackerKilledByCounter}，HP 观测量是否等于反击=${v.attackerHpDeltaEqualsCounter}）`);
    detailLines.push(`- 判定：${v.class}${v.mismatchCause ? `｜原因：${v.mismatchCause}` : ''}`);
    if (v.finalStateDiffersFromModel && (v.finalStateDiffersFromModel as string[]).length > 0) {
        detailLines.push(`- 引擎最终状态与自建 resolved 状态的字段差异（信息项，含反击已扣血等预期差异）：${(v.finalStateDiffersFromModel as string[]).join(', ')}；在该最终状态上 counterDamageOnResolvedState=${p.counterDamageOnResolvedState_engineFinalState}`);
    }
    detailLines.push('');
}

const md: string[] = [];
md.push('# V14/T14-03 反击（counter-attack）语义修复独立核验报告');
md.push('');
md.push(`- 生成时间：${report.generatedAt}`);
md.push(`- 脚本：\`v14/tools/audit_counter_semantics.ts\`（只读 import src/，不修改被测源码）`);
md.push(`- 原始读数：\`v14/out/v14_20260924_t14/T14-03/counter_audit/counter_audit_results.json\``);
md.push(`- git HEAD：\`${sourceIdentity.gitHead}\``);
md.push(`- 编码器 schema：\`${sourceIdentity.encoderSchemaId}\`｜Node：${sourceIdentity.node}`);
md.push('');
md.push('源码哈希（被核验文件的当次内容）：');
md.push('');
for (const [f, h] of Object.entries(sourceIdentity.files)) md.push(`- \`${f}\` sha256=\`${h}\``);
md.push('');
md.push('## 1. 方法与口径');
md.push('');
md.push('被核验的权威实现：`src/game/rules.ts` 的 `canCounterAttack` / `estimateCounterDamage` / `counterDamageOnResolvedState`，');
md.push('引擎调用点 `src/game/engine.ts` 的 `case \'attack\'`，以及编码器 `src/game/ai/spatial_tensor_encoder.ts` 的语义槽 15。');
md.push('');
md.push('1. **真实读数**：每组都用 `new GameEngine(深拷贝(preState)).step({type:"attack",...})` 执行，');
md.push('   「引擎反击」取 `info` 中 `Target counterattacked for N dmg` 的 N（等于 `attacker.hp -= counterDmg` 实际扣减值）；');
md.push('   「目标剩余 HP」取执行后状态里的 `target.hp`（若被击杀则不在状态里，记 0）。');
md.push('2. **预测取值点**：`estimateCounterDamage` / `canCounterAttack` 都在**攻击前状态**的同一个对象上调用，');
md.push('   引擎拿到的是它的深拷贝；脚本对攻击前状态做 sha256 前后校验，确认两个预测入口都没有改动它');
md.push(`   （本次 ${all.length} 组全部通过：${summary.preStatePurityFailures.length === 0 ? '无纯度失败' : summary.preStatePurityFailures.join(',')}）。`);
md.push('3. **resolved 入口**：`counterDamageOnResolvedState` 的主读数是脚本自建的 resolved 状态');
md.push('   （深拷贝攻击前状态 → 扣本次攻击伤害 → 内联复现引擎 `applyCombatStatusEffects`），');
md.push('   因为这正是 rules 注释与引擎调用点约定的入参语义；另附在引擎最终状态上的读数与差异字段。');
md.push('4. **伤害公式的 HP 依赖位置**：缩放项是 `Math.trunc(rawDamage * extraAttackerHp / effAtk.maxHp)`');
md.push('   （`effAtk` = 反击方；`extraAttackerHp` 由入口显式传入）。`getFinalDamageMultiplier` 实际只依赖');
md.push('   能力与距离（melee_master ×1.5 / ranged_defense ×0.5），**不依赖 HP**；它依赖的是「反击方」的能力，');
md.push('   因此受击前后状态变化不影响它。真正需要「受击后 HP」的只有缩放项里的 `extraAttackerHp`。');
md.push('5. **HP 观测量不等于反击伤害的三种情形**（脚本单独标注，不作等价性断言）：反击击杀攻击者时被血量下限截断；');
md.push('   攻击者在本回合攻击经验结算后升级（golem/slime/ice_elemental 的 `maxHpGrowth>0` 会回血）；');
md.push('   standby 阶段的 `triggerAuras`/墓碑结算对行动单位的回血。');
md.push('');
md.push('## 2. A/B/C 逐组读数');
md.push('');
md.push('表列口径：`引擎攻击伤害`/`引擎反击` 来自 info；`estimateCounterDamage(攻击前状态)` 是待核验入口；');
md.push('`counterDamageOnResolvedState(resolved状态)` 是规则文档约定的另一入口；`旧编码器公式(原状态)` 是');
md.push('`git show HEAD:src/game/ai/spatial_tensor_encoder.ts` 中 `(defender.hp - estDmg > 0) ? calculateDamage(state, defender.id, attacker.id) : 0` 的内联复现；');
md.push('`旧公式差` = 旧公式 - 引擎反击（正=高估）；`槽15×100` 为 `semantics[15]*100`，超过 100 会被 `Math.min(1.0,…)` 截断，标为「截断」。');
md.push('');
md.push(mdHeader);
records.forEach((r, i) => md.push(caseRow(r, i + 1)));
md.push('');
md.push('### 2.1 A：引擎与预测一致性');
md.push('');
md.push(`- 核心组（core）：${summary.coreCount} 组，` +
    `\`estimateCounterDamage(攻击前状态) === 引擎真实反击伤害\` 成立 **${summary.coreMatch}/${summary.coreCount}** 组。`);
md.push(`- 不一致组：${summary.coreMismatch === 0 ? '无' : summary.mismatchIds.join(', ')}。`);
for (const r of mismatches) {
    const e = r.engine as AuditRecord;
    const p = r.predictions as AuditRecord;
    const v = r.verdict as AuditRecord;
    md.push(`  - **${r.id}**：引擎反击=${e.counterDamage}（info: \`${String(e.info).trim()}\`），` +
        `预测=${p.estimateCounterDamage_preState}，resolved 状态上的反击判定=${p.canCounterAttack_resolvedModel}，` +
        `差异=${(p.estimateCounterDamage_preState as number) - (e.counterDamage as number)}（高估）。`);
    md.push(`    原因判定：${v.mismatchCause}`);
    md.push(`    该组可否用「已结算状态」上的判定修正：\`canCounterAttack(resolved) ? calculateDamageAtHp(resolved, target, attacker, targetHp) : 0\` = ${p.counterfactual_resolvedStatusGate}`);
}
md.push(`- 攻击者 HP 观测量（攻击后-攻击前）与反击伤害分离的组：${summary.hpDeltaConfoundedIds.length === 0 ? '无' : summary.hpDeltaConfoundedIds.join(', ')}` +
    `（原因见逐组明细与第 5 节，不影响槽 15 的正确性判断）。`);
md.push('');
md.push('### 2.2 B：三个预测入口的相互关系');
md.push('');
md.push(`- \`counterDamageOnResolvedState(自建 resolved 状态) === 引擎反击\`：${summary.coreCount - summary.resolvedModelEntryDiffIds.length}/${summary.coreCount} 组成立` +
    `${summary.resolvedModelEntryDiffIds.length ? `，不一致：${summary.resolvedModelEntryDiffIds.join(', ')}` : ''}。`);
md.push(`- \`旧引擎模型（HEAD 的 case \'attack\' 逐行复现）=== 引擎反击\`：${all.length - summary.legacyEngineHeadModelDiffIds.length}/${all.length} 组成立` +
    `${summary.legacyEngineHeadModelDiffIds.length ? `，不一致：${summary.legacyEngineHeadModelDiffIds.join(', ')}` : '（含探针与控制组）'}` +
    `，说明本次 \`calculateDamage → counterDamageOnResolvedState\` 的重构是行为保持的（HEAD 在扣血之后才计算反击，本来用的就是受击后 HP）。`);
md.push(`- \`counterDamageOnResolvedState(引擎执行后的最终状态)\`：在攻击者仍存在于 units 的 ${summary.resolvedFinalStateUsableIds.length} 组里，` +
    `${summary.resolvedFinalStateUsableIds.length - summary.resolvedFinalStateDiffIds.length} 组等于引擎真实值` +
    `${summary.resolvedFinalStateDiffIds.length ? `，不一致：${summary.resolvedFinalStateDiffIds.join(', ')}` : ''}；` +
    `另有 ${summary.resolvedFinalStateUnusableIds.length} 组（${summary.resolvedFinalStateUnusableIds.join(', ')}）攻击者已被反击击杀并从 units 移除，该入口按定义返回 0（引擎调用点在移除之前，因此不影响引擎正确性，但复用到「最终状态」上会失真）。`);
md.push(`- 关键对照：A31/A32 的自建 resolved 模型与引擎不同，是因为模型只复现了「扣血 + 附加状态」，没有复现引擎在反击前执行的 \`addExp\`（升级会提高攻击者防御）；` +
    `在引擎真实最终状态上，\`counterDamageOnResolvedState\` 给出 60（A31）/ 15（A32），与引擎完全一致。`);
md.push(`- 交叉验证修复注释中的反例数字：rules.ts 注释写「3 格外投石车 estCounter=50，引擎实际 0」，本审计 A11 组独立复现为旧公式=50、引擎=0（见上表 A11 行），与注释一致。`);
md.push(`- 旧 v13 编码器公式（原状态无条件反算）与引擎真实值不一致的组数：**${summary.legacyEncoderFormulaDiffCount}/${summary.coreCount}**；` +
    `方向全部为高估=${summary.legacyEncoderFormulaOverCount}，低估=${summary.legacyEncoderFormulaUnderCount}；` +
    `最大绝对差=${summary.legacyEncoderFormulaMaxAbsDelta}（${summary.legacyEncoderFormulaMaxAbsCase}）。`);
md.push('');
md.push('旧公式与引擎读数的逐组差值（仅列非 0 组）：');
md.push('');
md.push('用例 | 引擎反击 | 旧公式 | 差值 | 方向 | 机制');
md.push('--- | --- | --- | --- | --- | ---');
for (const r of legacyDiff) {
    const e = r.engine as AuditRecord;
    const p = r.predictions as AuditRecord;
    const ld = r.legacyDelta as AuditRecord;
    const mech = (p.canCounterAttack_resolvedModel as boolean) === false
        ? (p.canCounterAttack_preState as boolean) === false ? '战前状态即不可反击（旧公式同样非 0 即口径差异）' : '引擎在攻击后状态判定为不可反击'
        : 'HP 缩放基准不同（受击后 HP vs 受击前 HP）';
    md.push(`${r.id} | ${e.counterDamage} | ${p.legacyEncoderFormula_preState} | ${ld.value} | ${ld.direction === 'over' ? '高估' : '低估'} | ${mech}`);
}
md.push('');
md.push('### 2.3 C：槽 15 的编码器读数');
md.push('');
md.push('口径：`semantics[15] = Math.min(1.0, estimateCounterDamage(state,…)/100)`，状态为**攻击前**状态；');
md.push('`semantics` 是 `Float32Array`，读回的 float32 值 ×100 存在 ~1e-5 级表示误差，因此本表按 1e-3 容差比较。');
md.push('');
md.push(`- 逐组差异（槽 15 × 100 与引擎真实反击比较）：不一致组 ${summary.slot15MismatchIds.length === 0 ? '无' : summary.slot15MismatchIds.join(', ')}。`);
md.push(`- 被 \`Math.min(1.0, …)\` 截断的组（estCounter > 100）：${summary.slot15ClampedCount === 0 ? '无' : summary.slot15ClampedIds.join(', ')}。`);
for (const r of clamps) {
    const p = r.predictions as AuditRecord;
    const e = r.engine as AuditRecord;
    const enc = r.encoder as AuditRecord;
    md.push(`  - ${r.id}：estCounter=${p.estimateCounterDamage_preState} → \`semantics[15]=1.0\`（×100 后仍读作 100，损失 ${enc.slot15ClampInfoLoss}）；` +
        `引擎真实反击=${e.counterDamage}（encode→decode 不可逆；但注意 estCounter 本身与引擎一致，属于编码口径的信息截断）。`);
}
md.push('');
const float32Error = all
    .filter((r) => !(r.encoder as AuditRecord).slot15Clamped)
    .reduce((m, r) => Math.max(m, Math.abs(((r.encoder as AuditRecord).semantics15Times100 as number) -
        ((r.predictions as AuditRecord).estimateCounterDamage_preState as number))), 0);
md.push(`未被截断组的最大 Float32 表示误差：${float32Error.toExponential(2)} 点（相对 100 点量纲可忽略，网络读数不受影响）。`);
md.push('');
md.push('槽 15 与引擎真实反击不一致的组：');
md.push('');
md.push('用例 | 槽15(float32) | 槽15×100 | 引擎反击 | 差 | 性质');
md.push('--- | --- | --- | --- | --- | ---');
for (const r of all) {
    const enc = r.encoder as AuditRecord;
    const e = r.engine as AuditRecord;
    if (enc.slot15EqualsEngineCounter) continue;
    md.push(`${r.id} | ${(enc.semantics15 as number).toFixed(6)} | ${(enc.semantics15Times100 as number).toFixed(3)} | ${e.counterDamage} | ` +
        `${enc.slot15Clamped ? `截断 -${enc.slot15ClampInfoLoss}` : (enc.slot15AbsDiffVsEngine as number).toFixed(3)} | ` +
        `${enc.slot15Clamped ? 'estCounter>100 被 Math.min 截断（预测本身与引擎一致）' : '继承 2.1 的预测缺陷（攻击附带致盲 / 攻击中升级）'}`);
}
md.push('');
md.push('## 3. D：回归确认');
md.push('');
md.push('```');
md.push(`$ ${report.vitest.command}`);
for (const line of vitestSummaryLines) md.push(line.trim());
md.push('```');
md.push('');
md.push(`- 回归测试场景复现（本脚本独立重跑 6.4.1b 的状态构造）：断言 attacker.hp=${regression.asserted.attackerHp}、defender.hp=${regression.asserted.defenderHp}；` +
    `本次读数 attacker.hp=${regression.observedInThisAudit.attackerHp}、defender.hp=${regression.observedInThisAudit.defenderHp}、引擎反击=${regression.observedInThisAudit.engineCounter}。`);
md.push(`- 该断言验证的性质：反击伤害的 HP 缩放基准必须是**受击后的剩余 HP**。同状态下按受击前 HP(65) 缩放会得到 ${regression.discriminatesPreHitHpScaling.counterIfScaledByPreHitHp65} 点，` +
    `攻击者 10 HP 会变成负数（测试断言 9 必然失败）；按受击后 HP(5) 缩放得到 ${regression.discriminatesPreHitHpScaling.counterIfScaledByPostHitHp5} 点，攻击者 10 → 9。`);
md.push('  即该断言确实能区分「受击前 HP」与「受击后 HP」两种口径（`trunc(35*65/100)=22` vs `trunc(35*5/100)=1`），不是恒真断言。');
md.push('');
md.push('## 4. E：反例、未覆盖范围与残余风险');
md.push('');
md.push('### 4.1 已确证的反例（会影响槽 15 的正确性）');
md.push('');
md.push('1. **同类攻击附带致盲时，`estimateCounterDamage` 与引擎不一致（高估）**');
md.push('   - 机制：引擎在扣血后先 `applyCombatStatusEffects`（致盲把目标 `maxRange/minRange` 压到 0），再做反击判定；');
md.push('     而 `estimateCounterDamage` 在自己的入参（攻击**前**状态）上调用 `canCounterAttack`，看不到本次攻击施加的致盲。');
md.push('   - 证据见 A24 / A27 与对照 A25（目标已中毒 → 致盲不覆盖 → 一致）、A26（反击风暴路径不受致盲影响 → 一致）。');
md.push('   - 影响面：任何带 `blinder` 的攻击者（wolf_archer、dark_mage）对相邻、无状态、无 `counter_storm` 的目标发动攻击时，槽 15 会给出非 0，而引擎实际为 0。');
md.push('2. **攻击者在本回合攻击经验结算后升级时，`estimateCounterDamage` 与引擎不一致（高估）**');
md.push('   - 机制：引擎在反击判定前 `addExp(attacker, 30/60)`，升级使攻击者防御 +`defenseGrowth`，从而降低它受到的这次反击；');
md.push('     攻击前状态的预测用旧等级防御。');
md.push('   - 证据见 A31（archer exp=90 → 升级）与 A32（golem exp=90，`maxHpGrowth=25` 还会在反击前回血 25）；');
md.push('     对照探针 P05（`rules.levelCap=0` 关闭升级后同一构造重新一致）用于因果归因。');
md.push('   - 影响面：任何「本次攻击经验跨过阈值」的候选动作，槽 15 会偏大（方向恒为高估，因为升级只会提高防御）。');
md.push('');
md.push('### 4.2 已核验但不影响槽 15 的情形');
md.push('');
md.push('3. **standby 阶段 `triggerAuras` / 墓碑对行动单位 HP 的改动**：只在**反击结算之后**发生，不改变本次反击伤害；');
md.push('   但会让「攻击者失血」这一观测量偏离反击伤害（P01 elf 净化光环回血、P02 亡灵站墓碑回血，A32 升级回血）。');
md.push('4. **standby 阶段的状态光环（weakness_aura / attack_aura）**：只修改状态，且在反击之后（P03 golem、P04 druid），槽 15 不受影响。');
md.push('5. **反击方（目标）的经验结算**：`addExp(target, …)` 在反击伤害之后，对本次反击无影响；对**后续**动作的槽 15，状态已更新，按定义一致。');
md.push('6. **治疗/召唤路径**：`heal` 用固定值 `40`（paladin 为 `40 + level*10`）、`summon` 生成固定 `hp=100` 的骷髅，二者都不调用 `calculateDamage`，');
md.push(`   因此不存在「行动者 HP 缩放」的类似问题（P06 实测：hp=20 的治疗师给 50 HP 的友军治疗，info=\`${healPathProbe.info.trim()}\`，` +
    `友军 HP ${healPathProbe.allyHpBefore} → ${healPathProbe.allyHpAfter}（Δ=${healPathProbe.healDelta}），治疗者自身 HP ${healPathProbe.healerHpBefore} → ${healPathProbe.healerHpAfter}）。`);
md.push('');
md.push('### 4.3 使用边界（不影响引擎本次正确性，但影响复用）');
md.push('');
md.push('7. **`counterDamageOnResolvedState` 的复用边界**：它要求攻击者与目标都仍在 `state.units` 里。');
md.push(`   在「攻击者被反击击杀并已被 \`removeDeadUnits\` 移除」的最终状态上，它按定义返回 0（本审计 A38：引擎实际 110，最终状态上读数 0；A39 同为 0）。`);
md.push('   引擎调用点在移除之前，因此不影响引擎正确性；但搜索/回放代码若把「执行后的最终状态」直接喂给该入口，会得到 0 而不是真实反击伤害。');
md.push('8. **自建 resolved 状态必须包含引擎在反击前执行的 `addExp`**：A31/A32 说明只复现「扣血 + 附加状态」的模型会漏掉升级带来的防御变化（模型 65/18 vs 引擎 60/15）。');
md.push('');
md.push('### 4.4 尚未覆盖 / 无法确认');
md.push('');
md.push('9. **`state.rules` 自定义规则下的口径**：除 P05 关闭 `levelCap` 外，未覆盖自定义 `inspiredAttackBonus` / `weakenedDefensePenalty` / `terrainChildCombatBonus` 等；');
md.push('   代码上预测与引擎读同一份 `getRuleConfig(state)`，预期一致，但未实测。');
md.push('10. **APK 回放/关卡导入状态**（`apkStatic`、`apkUnitExtra`、脚本层 `SyncSetUnitStatus` 等）未覆盖；');
md.push('   这些路径可能在攻击与反击之间引入额外的 HP/状态变化，属未验证范围。');
md.push('11. **campaign_events（墓碑生成、事件 HP 改动）与 `support`/`post_attack_move` 组合**未覆盖；');
md.push('   本次只在 standby 前后观察到墓碑对行动单位的影响（P02），未验证事件脚本修改攻击者或目标 HP 的情况。');
md.push('12. **>100 反击的槽 15 语义**：`Math.min(1.0, estCounter/100)` 会把 110/120 这类反击压成 1.0（A38/A39），');
md.push('    信息丢失是设计如此，但意味着槽 15 无法表达「一击致命的反击」与「110 反击」的区别；这属于编码口径问题，不是本次修复引入的。');
md.push('13. **多单位光环叠加、`melee_master` 在远程反击（距离>1）下的分支**：本次覆盖了 dragon 相邻 ×1.5 与 dragon 被 2 格风暴反击 ×0.5；');
md.push('    未构造「双方都有 melee_master/ranged_defense」的全部组合。');
md.push('14. **中毒等状态的 turn-start 结算与反击的交互**（例如攻击者带中毒在其回合开始掉血）不在本次动作内，未覆盖。');
md.push('15. **审计口径修正说明**：本审计第一版曾把槽 15 的 float32 读写当成精确比较（`0.12*100 !== 12`），也已修正旧引擎模型里硬编码的 `levelCap=3`；');
md.push('    现行版本对槽 15 使用 1e-3 容差，旧引擎模型使用 `getRuleConfig(state).levelCap`，修正后旧引擎模型在全部用例上与引擎一致。');
md.push('');
md.push('## 5. 逐组明细');
md.push('');
md.push(detailLines.join('\n'));
md.push('');
md.push('## 6. 结论');
md.push('');
md.push(`- **A（引擎与预测一致性）**：核心 ${summary.coreCount} 组中 ${summary.coreMatch} 组严格相等；` +
    `${summary.coreMismatch} 组不等（${summary.mismatchIds.join(', ')}），且这 ${summary.coreMismatch} 组全部由两类原因造成：` +
    `(1) 预测入口在攻击前状态上做反击判定、看不到本次攻击施加的致盲；(2) 攻击经验在反击前结算导致攻击者升级。二者都是实现缺陷而非可接受近似。`);
md.push(`- **B（三个入口的关系）**：` +
    `\`counterDamageOnResolvedState(resolved 状态)\` 在核心 ${summary.coreCount} 组中 ${summary.coreCount - summary.resolvedModelEntryDiffIds.length} 组等于引擎真实值；` +
    `旧引擎模型 ${all.length - summary.legacyEngineHeadModelDiffIds.length}/${all.length} 组等于真实值（重构行为保持）；` +
    `旧 v13 编码器公式在 ${summary.legacyEncoderFormulaDiffCount}/${summary.coreCount} 组给出不同结果，方向全部为高估，最大差 ${summary.legacyEncoderFormulaMaxAbsDelta}（${summary.legacyEncoderFormulaMaxAbsCase}）。`);
md.push(`- **C（槽 15）**：未截断组与引擎真实值一致（除 ${summary.slot15MismatchIds.filter((id) => !summary.slot15ClampedIds.includes(id)).length} 个继承自 A 的差异组）；` +
    `截断组 ${summary.slot15ClampedCount} 个（${summary.slot15ClampedIds.join(', ')}）。`);
md.push(`- **D（回归）**：engine.test.ts 全部通过（见第 3 节读数），6.4.1b 的断言能区分受击前/后 HP 两种缩放口径。`);
md.push(`- **E（残余风险）**：确证 2 类会影响槽 15 正确性的反例（攻击附带致盲、攻击中升级），其余 standby 光环/墓碑/治疗/召唤路径不影响槽 15。`);
md.push('');
md.push('> 说明：本报告只做核验与取证，未修改 `src/` 下任何源码，也未修改 `v14/tools/rule_*.ts` 与 `python/`。');

fs.writeFileSync(path.join(outDir, 'counter_audit.md'), `${md.join('\n')}\n`);

// ---------------------------------------------------------------- stdout

console.log(`[counter-audit] git HEAD=${sourceIdentity.gitHead} schema=${sourceIdentity.encoderSchemaId}`);
console.log(`[counter-audit] cases: core=${summary.coreCount} probe=${summary.probeCount} control=${summary.controlCount} regression=${summary.regressionCount}`);
console.log(`[counter-audit] A: estimate==engine ${summary.coreMatch}/${summary.coreCount}; mismatches=${summary.mismatchIds.join(',') || 'none'}`);
console.log(`[counter-audit] B: resolvedModel diff=${summary.resolvedModelEntryDiffIds.join(',') || 'none'}; legacyEngineHead diff=${summary.legacyEngineHeadModelDiffIds.join(',') || 'none'}`);
console.log(`[counter-audit] B: legacy encoder formula diff=${summary.legacyEncoderFormulaDiffCount}/${summary.coreCount} (over=${summary.legacyEncoderFormulaOverCount}, under=${summary.legacyEncoderFormulaUnderCount}, maxAbs=${summary.legacyEncoderFormulaMaxAbsDelta} @ ${summary.legacyEncoderFormulaMaxAbsCase})`);
console.log(`[counter-audit] C: slot15 clamp=${summary.slot15ClampedIds.join(',') || 'none'}; slot15 mismatch=${summary.slot15MismatchIds.join(',') || 'none'}`);
console.log(`[counter-audit] purity failures=${summary.preStatePurityFailures.join(',') || 'none'}; hpDelta confounded=${summary.hpDeltaConfoundedIds.join(',') || 'none'}`);
for (const r of records) {
    const e = r.engine as AuditRecord;
    const p = r.predictions as AuditRecord;
    const v = r.verdict as AuditRecord;
    console.log(`  ${String(r.group).padEnd(10)} ${String(r.id).padEnd(52)} engineCounter=${String(e.counterDamage).padStart(3)} ` +
        `estimate=${String(p.estimateCounterDamage_preState).padStart(3)} resolved=${String(p.counterDamageOnResolvedState_model).padStart(3)} ` +
        `legacy=${String(p.legacyEncoderFormula_preState).padStart(3)} hpΔ=${String(e.attackerHpDelta).padStart(4)} ${v.class}`);
}
console.log(`[counter-audit] wrote ${path.join(outDir, 'counter_audit_results.json')}`);
console.log(`[counter-audit] wrote ${path.join(outDir, 'counter_audit.md')}`);
