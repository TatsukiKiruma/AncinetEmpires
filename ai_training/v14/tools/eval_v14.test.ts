/**
 * V14/T14-05：评测协议自测（纯断言，无引擎依赖）。
 *
 * 写法参考 v13/tools/eval_v3_core.test.ts：同一 run-tool 入口加载，top-level 直接跑断言，
 * 全部断言失败时抛错使进程退出码非 0。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/eval_v14.test.ts
 *
 * 退出码 0 = 全部断言通过。
 */
import * as assert from 'node:assert/strict';
import {
    classifyOutcome,
    isError,
    isNatural,
    isUndecided,
    type OutcomeInputs,
    type OutcomeKind,
} from '../../v13/tools/eval_v3_core';
import {
    buildCacheIdentityV15,
    buildMirrorId,
    cacheReuseDiffV15,
    canonicalActionKey,
    earlyEliminationAux,
    resolveEncoderSchema,
    type MirrorIdParts,
} from './eval_v14_protocol';
import {
    aggregatePairs,
    buildPairs,
    compareDeclaredVsRecomputed,
    viewOutcomeForSeat,
    type GameRecordLike,
    type PairRecord,
} from './eval_v14_aggregate';
import { recomputeOutcomeForViewedSeat } from './eval_v14_match';
import {
    ENCODER_SCHEMA_ID_V13,
    ENCODER_SCHEMA_ID_V14,
    ENCODER_SCHEMA_ID_V15,
} from '../../src/game/ai/spatial_tensor_encoder';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        console.log(`  FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const approx = (a: number | null, b: number, eps = 1e-9): void => {
    assert.ok(a !== null && Math.abs(a - b) <= eps, `期望 ${b}，实际 ${a}`);
};

console.log('[T14-05] 分类互斥测试');

const base: OutcomeInputs = {
    engineError: null,
    policyError: null,
    cancelled: false,
    wallTimeout: false,
    winner: null,
    winnerAlliance: null,
    candidateAlliance: 0,
    steps: 10,
    maxSteps: 100,
    plies: 10,
    maxPlies: null,
};

const kind = (over: Partial<OutcomeInputs>): OutcomeKind => classifyOutcome({ ...base, ...over });

test('winner=-1 为 NATURAL_DRAW（规则真平局，不是截断）', () => {
    const k = kind({ winner: -1, winnerAlliance: -1 });
    assert.equal(k, 'NATURAL_DRAW');
    assert.equal(isNatural(k), true);
});

test('STEP/PLY/WALL/CANCELLED/ERROR 互斥：错误不进截断，截断不进自然', () => {
    const step = kind({ winner: null, steps: 100, maxSteps: 100 });
    const ply = kind({ winner: null, steps: 5, maxSteps: 100, plies: 1200, maxPlies: 1200 });
    const wall = kind({ winner: null, wallTimeout: true });
    const cancelled = kind({ winner: null, cancelled: true });
    const policyErr = kind({ winner: null, policyError: 'no action', steps: 100, maxSteps: 100 });
    const engineErr = kind({ winner: null, engineError: 'boom', steps: 100, maxSteps: 100 });
    assert.equal(step, 'STEP_LIMIT');
    assert.equal(ply, 'PLY_LIMIT');
    assert.equal(wall, 'WALL_TIMEOUT');
    assert.equal(cancelled, 'CANCELLED');
    assert.equal(policyErr, 'POLICY_ERROR');
    assert.equal(engineErr, 'ENGINE_ERROR');
    for (const k of [step, ply, wall, cancelled]) {
        assert.equal(isUndecided(k), true);
        assert.equal(isNatural(k), false);
        assert.equal(isError(k), false);
    }
    for (const k of [policyErr, engineErr]) {
        assert.equal(isError(k), true);
        assert.equal(isUndecided(k), false);
        assert.equal(isNatural(k), false);
    }
});

console.log('[T14-05] 镜像缓存键测试');

const mirrorBase: MirrorIdParts = {
    scenarioId: 'SD:(2) Duel.aem',
    seed: 2026092401,
    maxSteps: 20000,
    maxPlies: null,
    wallTimeoutMs: 900000,
    mirrorPolicyVersion: 'heuristic-seatstream-v1',
    rulesHash: 'rules-deadbeef',
};

const mirrorFields: Array<keyof MirrorIdParts> = [
    'scenarioId',
    'seed',
    'maxSteps',
    'maxPlies',
    'wallTimeoutMs',
    'mirrorPolicyVersion',
    'rulesHash',
];

test('改任一字段则键变化（含 maxPlies null 与数值互换）', () => {
    const ref = buildMirrorId(mirrorBase);
    const alternates: Record<keyof MirrorIdParts, MirrorIdParts> = {
        scenarioId: { ...mirrorBase, scenarioId: 'SD:(3) Midway.aem' },
        seed: { ...mirrorBase, seed: 2026092402 },
        maxSteps: { ...mirrorBase, maxSteps: 19999 },
        maxPlies: { ...mirrorBase, maxPlies: 1200 },
        wallTimeoutMs: { ...mirrorBase, wallTimeoutMs: 600000 },
        mirrorPolicyVersion: { ...mirrorBase, mirrorPolicyVersion: 'heuristic-seatstream-v2' },
        rulesHash: { ...mirrorBase, rulesHash: 'rules-cafe0001' },
    };
    for (const f of mirrorFields) {
        assert.notEqual(buildMirrorId(alternates[f]), ref, `字段 ${f} 变化时键必须变化`);
    }
    // 中文：null 与数值必须区分（限与不限是不同实验）。
    assert.notEqual(buildMirrorId({ ...mirrorBase, maxPlies: null }), buildMirrorId({ ...mirrorBase, maxPlies: 1200 }));
});

test('缺任一字段则抛错（maxPlies 仅接受显式 null，不接受 undefined）', () => {
    for (const f of mirrorFields) {
        const broken = { ...mirrorBase } as Record<string, unknown>;
        delete broken[f];
        assert.throws(() => buildMirrorId(broken as unknown as MirrorIdParts), /缺失|parts 缺失/, `字段 ${f} 缺失时必须抛错`);
    }
    assert.throws(() => buildMirrorId(undefined as unknown as MirrorIdParts));
});

console.log('[T14-05] 动作规范键测试');

test('heal 与 support 同 id 不同类型给出不同键', () => {
    const heal = canonicalActionKey({ type: 'heal', healerId: 'u1', targetId: 'u2' });
    const support = canonicalActionKey({ type: 'support', supporterId: 'u1', targetId: 'u2' });
    assert.notEqual(heal, support);
    assert.equal(heal, 'heal:u1:u2');
    assert.equal(support, 'support:u1:u2');
});

test('heal 换 healer 即换键（旧 6 字段键丢失 healerId 的碰撞反例）', () => {
    const a = canonicalActionKey({ type: 'heal', healerId: 'u1', targetId: 'u2' });
    const b = canonicalActionKey({ type: 'heal', healerId: 'u3', targetId: 'u2' });
    assert.notEqual(a, b);
});

test('recruit 不同兵种/不同城堡给出不同键', () => {
    const a = canonicalActionKey({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 1, y: 2 } });
    const b = canonicalActionKey({ type: 'recruit_to_castle', unitClass: 'archer', castlePos: { x: 1, y: 2 } });
    const c = canonicalActionKey({ type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 3, y: 4 } });
    assert.notEqual(a, b);
    assert.notEqual(a, c);
});

test('summon 区分 graveId 与 spawnPos；摧毁区分目标；post_attack_move 区分落点；end_turn/surrender 为常量', () => {
    const s1 = canonicalActionKey({ type: 'summon', summonerId: 'u1', graveId: 'g1', spawnPos: { x: 1, y: 1 } });
    const s2 = canonicalActionKey({ type: 'summon', summonerId: 'u1', graveId: 'g2', spawnPos: { x: 1, y: 1 } });
    const s3 = canonicalActionKey({ type: 'summon', summonerId: 'u1', graveId: 'g1', spawnPos: { x: 2, y: 1 } });
    assert.notEqual(s1, s2);
    assert.notEqual(s1, s3);
    const d1 = canonicalActionKey({ type: 'destroy_town', unitId: 'u1', target: { x: 5, y: 5 } });
    const d2 = canonicalActionKey({ type: 'destroy_town', unitId: 'u1' });
    assert.notEqual(d1, d2);
    const p1 = canonicalActionKey({ type: 'post_attack_move', unitId: 'u1', to: { x: 1, y: 1 } });
    const p2 = canonicalActionKey({ type: 'post_attack_move', unitId: 'u1', to: { x: 1, y: 2 } });
    assert.notEqual(p1, p2);
    assert.equal(canonicalActionKey({ type: 'end_turn' }), 'end_turn');
    assert.equal(canonicalActionKey({ type: 'surrender' }), 'surrender');
    assert.notEqual(canonicalActionKey({ type: 'end_turn' }), canonicalActionKey({ type: 'surrender' }));
});

console.log('[T14-05] 编码器 schema 解析测试');

test('V13/V14 schema 通过；未知抛错；无字段按 V13 legacy；启发式臂返回 heuristic/na', () => {
    assert.deepEqual(resolveEncoderSchema({ encoderSchemaId: ENCODER_SCHEMA_ID_V13 }), {
        schemaId: ENCODER_SCHEMA_ID_V13,
        legacy: false,
    });
    assert.deepEqual(resolveEncoderSchema({ encoderSchemaId: ENCODER_SCHEMA_ID_V14 }), {
        schemaId: ENCODER_SCHEMA_ID_V14,
        legacy: false,
    });
    assert.throws(() => resolveEncoderSchema({ encoderSchemaId: 'spatial-v2/24x20x20+g20' }), /不支持/);
    assert.deepEqual(resolveEncoderSchema({}), { schemaId: ENCODER_SCHEMA_ID_V13, legacy: true });
    assert.deepEqual(resolveEncoderSchema(null, { isHeuristicArm: true }), { schemaId: 'heuristic/na', legacy: false });
    assert.throws(() => resolveEncoderSchema(null), /必须提供 checkpoint/);
});

console.log('[T14-05] 提前淘汰辅助结局测试');

test('isAlive=false 且 winner=null 才为 true；终局已定或仍存活为 false', () => {
    const eliminated = { players: [{ id: 0, gold: 0, isAlive: false, commanderDeathCount: 1 }], winner: null };
    assert.equal(earlyEliminationAux(eliminated, 0), true);
    assert.equal(earlyEliminationAux({ ...eliminated, winner: 1 }, 0), false);
    const alive = { players: [{ id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 }], winner: null };
    assert.equal(earlyEliminationAux(alive, 0), false);
    // 中文：联盟中队友仍能获胜时，不能按个人淘汰算联盟失败——本函数只报“个人已淘汰”，
    // 联盟胜负仍以整局 winner 为准（此处 winner=null 故主协议继续）。
    assert.throws(() => earlyEliminationAux(eliminated, 99), /不在/);
});

console.log('[T14-05] 聚合手算对照测试');

/**
 * 手工小例（3 对，每对=候选臂+镜像臂，共 6 行），手算过程：
 *
 * P1（双自然·胜）：候选 NATURAL_WIN（winner 联盟 0，视角联盟 0）→ s_c=1；
 *   镜像 NATURAL_LOSS（winner 联盟 1，视角联盟 0）→ s_m=0；d=+1。
 * P2（双自然·平）：候选 NATURAL_DRAW → 0.5；镜像 NATURAL_DRAW → 0.5；d=0。
 * P3（单侧截断）：候选 STEP_LIMIT → 区间 [0,1]；镜像 NATURAL_LOSS（视角联盟 0，
 *   winner 联盟 1）→ 点值 0；差值区间=[C_low−M_high, C_high−M_low]=[0−0, 1−0]=[0,1]。
 *
 * 期望：完整配对数=2，均值=(1+0)/2=0.5，W/D/L=1/1/0；
 * 总体均值区间按每局区间平均（3 局：[1,1]、[0,0]、[0,1]）：
 *   low=(1+0+0)/3=1/3，high=(1+0+1)/3=2/3；
 * 错误数=0 → experimentValid=true。
 */
function handExampleRows(): GameRecordLike[] {
    return [
        { arm: 'CANDIDATE', scenarioId: 'SD:(2) Duel.aem', seed: 1, viewedSeat: 0, outcomeKind: 'NATURAL_WIN', winnerAllianceId: 0, candidateAllianceId: 0 },
        { arm: 'MIRROR', scenarioId: 'SD:(2) Duel.aem', seed: 1, viewedSeat: 0, outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 0 },
        { arm: 'CANDIDATE', scenarioId: 'SD:(2) Duel.aem', seed: 1, viewedSeat: 1, outcomeKind: 'NATURAL_DRAW', winnerAllianceId: -1, candidateAllianceId: 1 },
        { arm: 'MIRROR', scenarioId: 'SD:(2) Duel.aem', seed: 1, viewedSeat: 1, outcomeKind: 'NATURAL_DRAW', winnerAllianceId: -1, candidateAllianceId: 1 },
        { arm: 'CANDIDATE', scenarioId: 'SD:(2) Duel.aem', seed: 2, viewedSeat: 0, outcomeKind: 'STEP_LIMIT', winnerAllianceId: null, candidateAllianceId: 0 },
        { arm: 'MIRROR', scenarioId: 'SD:(2) Duel.aem', seed: 2, viewedSeat: 0, outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 0 },
    ];
}

test('人工 3 对（1 胜 1 平 1 截断）：配对均值与区间与手算一致', () => {
    const { pairs, orphans } = buildPairs(handExampleRows());
    assert.equal(orphans.length, 0);
    assert.equal(pairs.length, 3);
    const report = aggregatePairs(pairs as PairRecord[]);
    assert.equal(report.totalPairs, 3);
    assert.equal(report.completePairs.count, 2);
    approx(report.completePairs.mean, 0.5);
    assert.equal(report.completePairs.candidateWins, 1);
    assert.equal(report.completePairs.candidateDraws, 1);
    assert.equal(report.completePairs.candidateLosses, 0);
    assert.equal(report.truncatedPairs.count, 1);
    approx(report.overallMeanInterval.low, 1 / 3);
    approx(report.overallMeanInterval.high, 2 / 3);
    assert.equal(report.overallMeanInterval.overPairs, 3);
    assert.equal(report.errors.count, 0);
    assert.equal(report.errors.experimentValid, true);
    // 中文：block 数=(Duel,1),(Duel,2)=2 <8，smallSample 必须为 true，区间仅供参考。
    assert.equal(report.clusterCI.blocks <= 2, true);
    assert.equal(report.clusterCI.smallSample, true);
    assert.ok(
        (report.clusterCI.low95 as number) <= (report.clusterCI.mean as number) &&
            (report.clusterCI.mean as number) <= (report.clusterCI.high95 as number),
    );
});

test('错误局判 experimentValid=false（不靠上下界掩盖）', () => {
    const rows = handExampleRows();
    rows.push(
        { arm: 'CANDIDATE', scenarioId: 'SD:(2) Duel.aem', seed: 3, viewedSeat: 0, outcomeKind: 'POLICY_ERROR', winnerAllianceId: null, candidateAllianceId: 0 },
        { arm: 'MIRROR', scenarioId: 'SD:(2) Duel.aem', seed: 3, viewedSeat: 0, outcomeKind: 'NATURAL_WIN', winnerAllianceId: 0, candidateAllianceId: 0 },
    );
    const { pairs } = buildPairs(rows);
    const report = aggregatePairs(pairs as PairRecord[]);
    assert.equal(report.totalPairs, 4);
    assert.equal(report.errors.count, 1);
    approx(report.errors.rate, 1 / 4);
    assert.equal(report.errors.experimentValid, false);
    assert.deepEqual(report.errors.pairKeys, ['SD:(2) Duel.aem#seed=3#seat=0']);
});

test('分层：map 缺失时按 scenarioId；座位与人数分别计数；人数缺失记 null', () => {
    const { pairs } = buildPairs(handExampleRows());
    const report = aggregatePairs(pairs as PairRecord[]);
    assert.deepEqual(report.strata.byMap, [
        { key: 'SD:(2) Duel.aem', pairs: 3, complete: 2, completeMean: 0.5, truncated: 1, errors: 0 },
    ]);
    const seatKeys = report.strata.bySeat.map((s) => s.key).sort();
    assert.deepEqual(seatKeys, ['0', '1']);
    assert.deepEqual(report.strata.byPlayerCount, [
        { key: 'null', pairs: 3, complete: 2, completeMean: 0.5, truncated: 1, errors: 0 },
    ]);
});

console.log('[T15-09A] V15 缓存身份与视角重算测试');

test('buildCacheIdentityV15：改任一身份字段即换键；缺字段抛错；gameId 符合协议格式', () => {
    const base = {
        runId: 'v15_20260925_core',
        runMode: 'dev' as const,
        panelId: 'dev',
        blockId: 'dev:duel:b0',
        scenarioId: 'SDPLAN:sd-normal:(2) Duel.aem',
        rootSeed: 2026094500,
        episodeIndex: 0,
        rootFamilyId: 'SDPLAN:sd-normal:(2) Duel.aem#2026094500#0',
        candidateSeat: 0,
        viewedSeat: 0,
        arm: 'CANDIDATE' as const,
        modelId: 'spatial_candidate:c2_s42.json:42:abcdefabcdef',
        checkpointSha256: 'a'.repeat(64),
        encoderSchemaId: 'spatial26_global20_actionSemantics53_v15',
        rngContract: 'heuristic-seatstream-v1',
        actionFilter: 'filter-surrender-v1',
        initialStateHash: '1'.repeat(64),
        mapHash: '2'.repeat(64),
        mapLayoutHash: '3'.repeat(64),
        rulesHash: '4'.repeat(64),
        engineSourceDigest: '5'.repeat(64),
        policySourceDigest: '6'.repeat(64),
        maxStepsAtomicActions: 12000,
        maxPliesAtomicActions: null,
        wallTimeoutMs: 300000,
    };
    const ref = buildCacheIdentityV15(base);
    const mutated: Array<[string, Record<string, unknown>]> = [
        ['initialStateHash', { ...base, initialStateHash: '9'.repeat(64) }],
        ['mapHash', { ...base, mapHash: '9'.repeat(64) }],
        ['mapLayoutHash', { ...base, mapLayoutHash: '9'.repeat(64) }],
        ['rulesHash', { ...base, rulesHash: '9'.repeat(64) }],
        ['engineSourceDigest', { ...base, engineSourceDigest: '9'.repeat(64) }],
        ['policySourceDigest', { ...base, policySourceDigest: '9'.repeat(64) }],
        ['rngContract', { ...base, rngContract: 'heuristic-seatstream-v2' }],
        ['actionFilter', { ...base, actionFilter: 'filter-none-v0' }],
        ['maxStepsAtomicActions', { ...base, maxStepsAtomicActions: 11999 }],
        ['wallTimeoutMs', { ...base, wallTimeoutMs: 299999 }],
        ['maxPliesAtomicActions', { ...base, maxPliesAtomicActions: 1200 }],
        ['runMode', { ...base, runMode: 'confirm' }],
        ['candidateSeat', { ...base, candidateSeat: 1 }],
        ['viewedSeat', { ...base, viewedSeat: 1 }],
        ['arm', { ...base, arm: 'MIRROR' }],
        ['checkpointSha256', { ...base, checkpointSha256: 'b'.repeat(64) }],
        ['encoderSchemaId', { ...base, encoderSchemaId: 'spatial24_global20_actionSemantics32_v13' }],
    ];
    for (const [name, parts] of mutated) {
        const alt = buildCacheIdentityV15(parts as never);
        assert.notEqual(alt.key, ref.key, `字段 ${name} 变化时身份键必须变化`);
    }
    for (const name of Object.keys(base)) {
        const broken = { ...base } as Record<string, unknown>;
        delete broken[name];
        assert.throws(() => buildCacheIdentityV15(broken as never), /缺失/, `字段 ${name} 缺失时必须抛错`);
    }
    assert.equal(
        ref.gameId,
        'v15_20260925_core|dev|dev:duel:b0|spatial_candidate:c2_s42.json:42:abcdefabcdef|CANDIDATE|seat=0|view=0',
    );
});

test('cacheReuseDiffV15：忽略 viewedSeat/arm（同一份计算按座位展开），其余字段必须一致', () => {
    const a = { scenarioId: 'x', seed: 1, rulesHash: 'r', candidateSeat: null, viewedSeat: null, arm: 'MIRROR' };
    const b = { ...a, viewedSeat: 2, arm: 'MIRROR' };
    assert.deepEqual(cacheReuseDiffV15(a, b), []);
    assert.deepEqual(cacheReuseDiffV15(a, { ...a, rulesHash: 'q' }), ['rulesHash']);
    // 中文：不同候选座位不是同一份计算（对局内容不同），必须报差异。
    assert.deepEqual(cacheReuseDiffV15(a, { ...a, candidateSeat: 0 }), ['candidateSeat']);
});

test('recomputeOutcomeForViewedSeat 与聚合器 viewOutcomeForSeat 全枚举一致', () => {
    const kinds: OutcomeKind[] = [
        'NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW',
        'STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED',
        'POLICY_ERROR', 'ENGINE_ERROR',
    ];
    const winners: Array<number | null> = [null, -1, 0, 1, 2];
    const views: Array<number | null> = [null, 0, 1, 2];
    for (const k of kinds) {
        for (const w of winners) {
            for (const v of views) {
                assert.equal(
                    recomputeOutcomeForViewedSeat(k, w, v),
                    viewOutcomeForSeat(k, w, v),
                    `分类不一致：kind=${k} winner=${w} view=${v}`,
                );
            }
        }
    }
});

test('镜像行声明 NATURAL_LOSS 但被测座位联盟获胜时，重算值为 NATURAL_WIN 并计入差异', () => {
    // 中文：复刻 v14b 三人图的真实镜像行——全 H0 对局 winner=1，镜像行按自己视角写 LOSS，
    // 但座位 1 的联盟就是 1，从 winner 重算应为 WIN。这正是任务书要求纠正的读数。
    const rows: GameRecordLike[] = [
        { arm: 'MIRROR', scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem', seed: 1, viewedSeat: 1, candidateSeat: null, outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 1 },
        { arm: 'MIRROR', scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem', seed: 1, viewedSeat: 0, candidateSeat: null, outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 0 },
        { arm: 'CANDIDATE', scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem', seed: 1, viewedSeat: 0, candidateSeat: 0, outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 0 },
    ];
    const cmp = compareDeclaredVsRecomputed(rows);
    assert.equal(cmp.rows, 3);
    assert.equal(cmp.differingRows, 1);
    const diff = cmp.details.find((d) => d.differs) as never as { recomputedOutcome: OutcomeKind; seat: number | null };
    assert.equal(diff.recomputedOutcome, 'NATURAL_WIN');
    assert.equal(diff.seat, 1);
    assert.deepEqual(cmp.byArm, [
        { arm: 'CANDIDATE', rows: 1, differing: 0 },
        { arm: 'MIRROR', rows: 2, differing: 1 },
    ]);
});

test('V15 schema 通过 resolveEncoderSchema；未知 schema 仍抛错', () => {
    assert.deepEqual(resolveEncoderSchema({ encoderSchemaId: ENCODER_SCHEMA_ID_V15 }), {
        schemaId: ENCODER_SCHEMA_ID_V15,
        legacy: false,
    });
    assert.throws(() => resolveEncoderSchema({ encoderSchemaId: 'spatial26_global20_actionSemantics53_v16' }), /不支持/);
});

console.log();
if (failures.length) {
    console.error(`[T14-05] FAILED ${failures.length}/${passed + failures.length}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`[T14-05] PASSED ${passed}/${passed}`);
