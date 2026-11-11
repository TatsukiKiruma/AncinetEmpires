/**
 * V14/T14-03：状态成对审查（state aliasing）。
 *
 * 目的：找出「与决策相关的状态差异」在策略输入上是否不可见（别名）。
 * 方法：构造成对状态，只改动一个因素，比较 (a) 引擎合法动作集是否变化、
 * (b) 策略输入（空间张量 + 全局特征 + 每个候选动作的语义）是否完全相同。
 * 注意：任务书明确「同一状态下不同候选不碰撞」不能代替这个检查，
 * 因此这里比较的是「不同状态」的输入。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/state_aliasing_probe.ts \
 *     --run-id v14_20260924_t14
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { calculateArmyValue, encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import {
    ENCODER_SCHEMA_ID,
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { GameState, UnitClass } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

interface PairSpec {
    id: string;
    factor: string;
    note: string;
    build: () => { state: GameState; playerId: number };
    mutate: (state: GameState) => void;
}

function baseState(): GameState {
    const width = 8;
    const height = 8;
    const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ terrainId: 6 as const, ownerId: null as number | null })));
    return {
        turn: 3,
        currentPlayer: 0,
        map: { width, height, tiles: tiles as never },
        units: [
            { id: 'a1', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 2 }, hp: 80, maxHp: 100, hasMoved: false, hasActed: false, level: 1, exp: 0 },
            { id: 'a2', ownerId: 0, unitClass: 'archer', pos: { x: 2, y: 3 }, hp: 60, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 },
            { id: 'b1', ownerId: 1, unitClass: 'soldier', pos: { x: 5, y: 5 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 },
            { id: 'b2', ownerId: 1, unitClass: 'wolf', pos: { x: 6, y: 6 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 },
        ],
        players: [
            { id: 0, gold: 300, isAlive: true, commanderDeathCount: 0 },
            { id: 1, gold: 300, isAlive: true, commanderDeathCount: 0 },
        ],
        winner: null,
        nextUnitId: 100,
        nextGraveId: 1,
    };
}

const pairs: PairSpec[] = [];
function pair(spec: PairSpec): void { pairs.push(spec); }

pair({
    id: 'whose-turn-is-next',
    factor: '下个有效行动者顺序',
    note: '只有 players 顺序/ID 决定的回合顺序变化：编码器不输入 currentPlayer 之外的顺序信息',
    build: () => ({ state: baseState(), playerId: 0 }),
    mutate: (state) => {
        // 交换玩家数组顺序（回合顺序由 getTurnPlayerIds 的 ID 排序决定，因此这里改成 ID 互换）
        state.players = [state.players[1], state.players[0]];
        state.players[0].id = 0;
        state.players[1].id = 1;
        state.units.forEach((u) => { u.ownerId = u.ownerId === 0 ? 1 : 0; });
        state.currentPlayer = 0;
    },
});
pair({
    id: 'castle-pending-source',
    factor: '城堡 pending 来源',
    note: 'apkPendingRecruitSource 影响合法动作集，但不一定进入特征',
    build: () => {
        const state = baseState();
        state.units.push({
            id: 'rec', ownerId: 0, unitClass: 'soldier', pos: { x: 2, y: 2 }, hp: 100, maxHp: 100,
            hasMoved: false, hasActed: false, level: 0, exp: 0, apkPendingRecruitSource: 'empty_castle',
        });
        state.pendingUnitId = 'rec';
        state.map.tiles[2][2] = { terrainId: 10, ownerId: 0 } as never;
        return { state, playerId: 0 };
    },
    mutate: (state) => {
        const rec = state.units.find((u) => u.id === 'rec');
        if (rec) rec.apkPendingRecruitSource = 'commander_castle';
    },
});
pair({
    id: 'has-post-attack-moved',
    factor: '已执行突击后移动',
    note: 'hasPostAttackMoved 影响合法动作集；特征里没有该标志位',
    build: () => {
        const state = baseState();
        const wolf = state.units.find((u) => u.id === 'b2');
        if (wolf) { wolf.unitClass = 'wolf'; wolf.hasActed = true; wolf.movementRemaining = 4; }
        state.currentPlayer = 1;
        return { state, playerId: 1 };
    },
    mutate: (state) => {
        const wolf = state.units.find((u) => u.id === 'b2');
        if (wolf) wolf.hasPostAttackMoved = true;
    },
});
pair({
    id: 'has-been-supported',
    factor: '本回合已被支援',
    note: 'hasBeenSupportedThisTurn 影响 support 候选是否存在；特征里没有该标志位',
    build: () => {
        const state = baseState();
        state.units.push({
            id: 'sup', ownerId: 0, unitClass: 'druid', pos: { x: 3, y: 3 }, hp: 100, maxHp: 100,
            hasMoved: false, hasActed: false, level: 3, exp: 0,
        });
        const a2 = state.units.find((u) => u.id === 'a2');
        if (a2) { a2.hasActed = true; a2.hasMoved = true; }
        return { state, playerId: 0 };
    },
    mutate: (state) => {
        const a2 = state.units.find((u) => u.id === 'a2');
        if (a2) a2.hasBeenSupportedThisTurn = true;
    },
});
pair({
    id: 'movement-remaining',
    factor: '突击剩余移动力',
    note: 'movementRemaining 决定 post_attack_move 的可达范围；特征中只有 hasMoved，没有剩余量',
    build: () => {
        const state = baseState();
        const wolf = state.units.find((u) => u.id === 'b2');
        if (wolf) { wolf.hasActed = true; wolf.movementRemaining = 6; }
        state.currentPlayer = 1;
        return { state, playerId: 1 };
    },
    mutate: (state) => {
        const wolf = state.units.find((u) => u.id === 'b2');
        if (wolf) wolf.movementRemaining = 1;
    },
});
pair({
    id: 'unit-exp-and-level',
    factor: '经验值（不含等级）',
    note: 'exp 影响升级进度但不影响当前有效属性；预期不改变输入',
    build: () => ({ state: baseState(), playerId: 0 }),
    mutate: (state) => {
        const a1 = state.units.find((u) => u.id === 'a1');
        if (a1) a1.exp = 250;
    },
});
pair({
    id: 'castle-owner-ally',
    factor: '城堡归属：盟友 vs 敌方',
    note: '归属影响领地通道 8/9，应当在输入上可见',
    build: () => {
        const state = baseState();
        state.players.push({ id: 2, gold: 100, isAlive: true, commanderDeathCount: 0 });
        state.units.push({ id: 'c1', ownerId: 2, unitClass: 'soldier', pos: { x: 7, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 });
        state.map.tiles[4][4] = { terrainId: 10, ownerId: 1 } as never;
        return { state, playerId: 0 };
    },
    mutate: (state) => {
        const tile = state.map.tiles[4][4] as { ownerId: number | null };
        tile.ownerId = 2;
        state.rules = { alliances: { 0: 0, 1: 1, 2: 0 } };
    },
});
pair({
    id: 'defeat-flags',
    factor: '淘汰条件开关',
    note: 'defeatOnCommanderDeath 等开关只影响终局判定，不影响棋盘特征 —— 预期输入相同但合法动作/终局语义不同',
    build: () => ({ state: baseState(), playerId: 0 }),
    mutate: (state) => {
        state.rules = { defeatOnCommanderDeath: true, defeatOnNoCastles: true };
    },
});
pair({
    id: 'duplicate-unit-class-different-level',
    factor: '同兵种不同等级',
    note: '等级影响有效射程/攻击，应当在动作语义与单位通道上可见',
    build: () => ({ state: baseState(), playerId: 0 }),
    mutate: (state) => {
        const a1 = state.units.find((u) => u.id === 'a1');
        if (a1) a1.level = 9 as never;
    },
});

function inputDigest(state: GameState, playerId: number): { digest: string; legal: string[]; reachable: number } {
    const engine = new GameEngine(clone(state));
    const legal = engine.getLegalActions(playerId).map(encodeAction);
    const spatial = encodeGameStateSpatial(state, playerId, 'v2');
    const candidates = legal.map((code) => {
        const action = engine.getLegalActions(playerId).find((a) => encodeAction(a) === code);
        if (!action) return code;
        const features = encodeCandidateActionSpatial(state, playerId, action, 'v2');
        return `${code}|${JSON.stringify(features.actorCoord)}|${JSON.stringify(features.landingCoord)}|${JSON.stringify(features.targetCoord)}|${Array.from(features.semantics).join(',')}`;
    });
    const digest = sha256(JSON.stringify({
        tensor: Array.from(spatial.spatialTensor),
        global: Array.from(spatial.globalFeatures),
        candidates,
    }));
    return { digest, legal, reachable: legal.length };
}

const runId = arg('--run-id', 'v14_20260924_t14') as string;
const outDir = path.resolve('v14', 'out', runId, 'T14-03');
fs.mkdirSync(outDir, { recursive: true });

const cases: any[] = [];
let aliasedButActionDiffers = 0;
for (const spec of pairs) {
    const left = spec.build();
    const rightState = clone(left.state);
    spec.mutate(rightState);
    const leftRead = inputDigest(left.state, left.playerId);
    const rightRead = inputDigest(rightState, left.playerId);
    const inputsIdentical = leftRead.digest === rightRead.digest;
    const legalIdentical = leftRead.legal.join('|') === rightRead.legal.join('|');
    if (inputsIdentical && !legalIdentical) aliasedButActionDiffers += 1;
    cases.push({
        id: spec.id,
        factor: spec.factor,
        note: spec.note,
        playerId: left.playerId,
        inputsIdentical,
        legalIdentical,
        leftDigest: leftRead.digest,
        rightDigest: rightRead.digest,
        leftGlobal: JSON.stringify(Array.from(encodeGameStateSpatial(left.state, left.playerId, 'v2').globalFeatures)),
        rightGlobal: JSON.stringify(Array.from(encodeGameStateSpatial(rightState, left.playerId, 'v2').globalFeatures)),
        leftLegalCount: leftRead.reachable,
        rightLegalCount: rightRead.reachable,
        leftLegalSample: leftRead.legal.slice(0, 6),
        rightLegalSample: rightRead.legal.slice(0, 6),
        leftUnitLevels: left.state.units.map((u) => u.id + ":L" + String(u.level ?? 0)),
        rightUnitLevels: rightState.units.map((u) => u.id + ":L" + String(u.level ?? 0)),
        leftArmyValue: calculateArmyValue(left.state, left.playerId),
        rightArmyValue: calculateArmyValue(rightState, left.playerId),
        verdict: inputsIdentical && !legalIdentical
            ? 'ALIAS_WITH_ACTION_DIFFERENCE'
            : inputsIdentical ? 'ALIAS_SAME_ACTIONS'
                : 'VISIBLE',
    });
}

const report = {
    schema: 'v14_state_aliasing_cases_1',
    task: 'T14-03',
    runId,
    generatedAt: new Date().toISOString(),
    encoderSchemaId: ENCODER_SCHEMA_ID,
    method: '成对状态：只改动一个因素，比较引擎合法动作集与策略输入摘要（空间张量 + 全局特征 + 每个候选的坐标与语义）。',
    limitation: '本轮对只覆盖列出的因素；未覆盖的因素在 rule_contract/T14-03 报告中列为未验证范围。',
    counts: {
        pairs: cases.length,
        visible: cases.filter((c) => c.verdict === 'VISIBLE').length,
        aliasSameActions: cases.filter((c) => c.verdict === 'ALIAS_SAME_ACTIONS').length,
        aliasWithActionDifference: aliasedButActionDiffers,
    },
    cases,
};
fs.writeFileSync(path.join(outDir, 'state_aliasing_cases.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[T14-03] aliasing pairs=${cases.length} visible=${report.counts.visible} ` +
    `aliasSameActions=${report.counts.aliasSameActions} aliasWithActionDifference=${aliasedButActionDiffers}`);
for (const c of cases) {
    console.log(`  ${c.verdict.padEnd(30)} ${c.id} (legal ${c.leftLegalCount} -> ${c.rightLegalCount})`);
}
