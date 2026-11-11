/**
 * V15/T15-09A：故障注入自测（owner A）——8 类，用合成夹具驱动，不跑真对局。
 *
 * 目的不是“证明评测器能跑”，而是证明**分类口径在坏输入下仍然正确**：
 * 截断不变成负局、错误不变成平局、个人淘汰不变成联盟失败、重复行/缺臂不静默少算、
 * 缓存身份变化不被当成同一实验。每类都给出：输入 → 期望分类 → 实际分类 → 是否通过。
 *
 * 口径来源：
 * - 分类合同：`v13/tools/eval_v3_core.ts`（winner=-1 是规则平局；截断/错误/自然互斥）；
 * - 统计合同：`V15_EXPERIMENT_PROTOCOL.md` §6（自然 1/0.5/0，截断 [0,1]，错误单独 gate）；
 * - 身份合同：`protocol.json#cacheKey` + `eval_v14_protocol.ts#buildCacheIdentityV15`。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_selftest.ts \
 *     --out v15/out/<runId>/T15-09/eval_selftest.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
    classifyOutcome,
    isNatural,
    type OutcomeInputs,
    type OutcomeKind,
} from '../../v13/tools/eval_v3_core';
import {
    buildPairs,
    parseGamesJsonl,
    compareDeclaredVsRecomputed,
} from '../../v14/tools/eval_v14_aggregate';
import {
    buildCacheIdentityV15,
    cacheReuseDiffV15,
    earlyEliminationAux,
} from '../../v14/tools/eval_v14_protocol';
import {
    aggregateRowsV15,
    loadFrozenEvalConfigV15,
    readArmV15,
    strictBuildPairsV15,
    type EvalRowV15,
} from './eval_v15_core';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256Hex(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 单类故障注入的结果记录。 */
interface FaultCaseResult {
    id: string;
    category: string;
    purpose: string;
    input: unknown;
    expected: unknown;
    actual: unknown;
    pass: boolean;
    contract: string;
}

const cases: FaultCaseResult[] = [];
const failures: string[] = [];

/** 基准分类输入（与 v14 自测同构）：未结束、未截断、候选联盟 0。 */
const baseInputs: OutcomeInputs = {
    engineError: null,
    policyError: null,
    cancelled: false,
    wallTimeout: false,
    winner: null,
    winnerAlliance: null,
    candidateAlliance: 0,
    steps: 10,
    maxSteps: 12000,
    plies: 10,
    maxPlies: null,
};

function classify(over: Partial<OutcomeInputs>): OutcomeKind {
    return classifyOutcome({ ...baseInputs, ...over });
}

function recordCase(
    id: string,
    category: string,
    purpose: string,
    input: unknown,
    expected: unknown,
    actual: unknown,
    pass: boolean,
    contract: string,
): void {
    cases.push({ id, category, purpose, input, expected, actual, pass, contract });
    if (!pass) {
        failures.push(`${id} ${category}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    }
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${id} ${category}`);
}

/** 构造一行夹具（三人图，座位 0..2）。 */
function row(over: Partial<EvalRowV15> & { arm: 'CANDIDATE' | 'MIRROR'; outcomeKind: OutcomeKind }): EvalRowV15 {
    return {
        scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem',
        seed: 2026094504,
        mapName: '(3) Frozen fields.aem',
        playerCount: 3,
        candidateSeat: over.arm === 'CANDIDATE' ? 0 : null,
        viewedSeat: 0,
        winnerAllianceId: null,
        candidateAllianceId: 0,
        steps: 100,
        ...over,
    } as EvalRowV15;
}

/** 把夹具行跑过「严格配对 → 明细 → 聚合」的真实管线。 */
function runPipeline(rows: EvalRowV15[], opts?: { requireGameId?: boolean; requireIdentity?: boolean }) {
    return aggregateRowsV15(rows, {
        panelWeightsByMap: { '(3) Frozen fields.aem': 1 },
        bootstrapIterations: 200,
        bootstrapSeed: 2026099500,
        requireGameId: opts?.requireGameId ?? false,
        requireIdentity: opts?.requireIdentity ?? false,
    });
}

console.log('[T15-09A] 8 类故障注入自测');

/* ---------------------------------------------------------------- *
 * F1 候选自然胜 + 镜像超时
 * ---------------------------------------------------------------- */
{
    const cKind = classify({ winner: 0, winnerAlliance: 0 });
    const mKind = classify({ wallTimeout: true, steps: 4000 });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind, winnerAllianceId: 0, candidateAllianceId: 0 }),
        row({ arm: 'MIRROR', outcomeKind: mKind, winnerAllianceId: null, candidateAllianceId: 0 }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        candidateClass: 'NATURAL_WIN',
        mirrorClass: 'WALL_TIMEOUT',
        pairKind: 'TRUNCATED',
        dLow: 0,   // C.low(1) - M.high(1)
        dHigh: 1,  // C.high(1) - M.low(0)
        candidateCountsAsNaturalCompletion: true,
        mirrorCountsAsNaturalCompletion: false,
        experimentValid: true,
    };
    const actual = {
        candidateClass: cKind,
        mirrorClass: mKind,
        pairKind: d.kind,
        dLow: d.dLow,
        dHigh: d.dHigh,
        candidateCountsAsNaturalCompletion: isNatural(d.candidate.declaredOutcome),
        mirrorCountsAsNaturalCompletion: isNatural(d.mirror.declaredOutcome),
        experimentValid: report.totals.errorPairs === 0,
    };
    recordCase(
        'F1', '候选自然胜 + 镜像超时',
        '截断不得变成负局/平局：候选的自然胜保留点值 1，镜像截断取 [0,1]，差值界 [0,1]',
        { candidate: { winner: 0 }, mirror: { wallTimeout: true, steps: 4000 } },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §6 + eval_v3_core.classifyOutcome',
    );
}

/* ---------------------------------------------------------------- *
 * F2 候选超时 + 镜像自然负
 * ---------------------------------------------------------------- */
{
    const cKind = classify({ wallTimeout: true, steps: 12000, maxSteps: 12000, winner: null });
    const mKind = classify({ winner: 1, winnerAlliance: 1 });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind, winnerAllianceId: null, candidateAllianceId: 0 }),
        row({ arm: 'MIRROR', outcomeKind: mKind, winnerAllianceId: 1, candidateAllianceId: 0 }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        candidateClass: 'WALL_TIMEOUT',
        mirrorClass: 'NATURAL_LOSS',
        pairKind: 'TRUNCATED',
        dLow: 0,   // C.low(0) - M.high(0)
        dHigh: 1,  // C.high(1) - M.low(0)
        candidateCountsAsNaturalCompletion: false,
        mirrorCountsAsNaturalCompletion: true,
    };
    const actual = {
        candidateClass: cKind,
        mirrorClass: mKind,
        pairKind: d.kind,
        dLow: d.dLow,
        dHigh: d.dHigh,
        candidateCountsAsNaturalCompletion: isNatural(d.candidate.declaredOutcome),
        mirrorCountsAsNaturalCompletion: isNatural(d.mirror.declaredOutcome),
    };
    recordCase(
        'F2', '候选超时 + 镜像自然负',
        '候选自身截断不得被算成负局；镜像自然负给点值 0，差值界 [0-1, 1-0]',
        { candidate: { wallTimeout: true }, mirror: { winner: 1 } },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §6（截断不变成平局）',
    );
}

/* ---------------------------------------------------------------- *
 * F3 双超时
 * ---------------------------------------------------------------- */
{
    const cKind = classify({ wallTimeout: true });
    const mKind = classify({ winner: null, steps: 12000, maxSteps: 12000 });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind }),
        row({ arm: 'MIRROR', outcomeKind: mKind }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        candidateClass: 'WALL_TIMEOUT',
        mirrorClass: 'STEP_LIMIT',
        pairKind: 'TRUNCATED',
        dLow: -1,
        dHigh: 1,
        completePairs: 0,
        pointEstimate: null,
    };
    const actual = {
        candidateClass: cKind,
        mirrorClass: mKind,
        pairKind: d.kind,
        dLow: d.dLow,
        dHigh: d.dHigh,
        completePairs: report.totals.completePairs,
        pointEstimate: report.panel.completePoint,
    };
    recordCase(
        'F3', '双超时',
        '两侧截断只给上下界 [-1,1]，不得产生点估计，也不得进完整配对',
        { candidate: { wallTimeout: true }, mirror: { steps: 12000, maxSteps: 12000 } },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §6（单列上下界，不是置信区间）',
    );
}

/* ---------------------------------------------------------------- *
 * F4 规则平局（winner=-1）
 * ---------------------------------------------------------------- */
{
    const cKind = classify({ winner: -1, winnerAlliance: -1 });
    const mKind = classify({ winner: -1, winnerAlliance: -1 });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind, winnerAllianceId: -1, candidateAllianceId: 0 }),
        row({ arm: 'MIRROR', outcomeKind: mKind, winnerAllianceId: -1, candidateAllianceId: 0 }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        candidateClass: 'NATURAL_DRAW',
        mirrorClass: 'NATURAL_DRAW',
        candidateScore: 0.5,
        pairKind: 'COMPLETE',
        d: 0,
        experimentValid: true,
    };
    const actual = {
        candidateClass: cKind,
        mirrorClass: mKind,
        candidateScore: d.candidate.score,
        pairKind: d.kind,
        d: d.d,
        experimentValid: report.totals.errorPairs === 0,
    };
    recordCase(
        'F4', '规则平局（winner=-1）',
        'winner=-1 是规则真平局而不是截断：双方各得 0.5，配对差值为 0 且互斥于截断/错误',
        { winner: -1, declarationNote: 'winner=-1 与 null 必须区分' },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'eval_v3_core（engine.ts 的规则平局语义）',
    );
}

/* ---------------------------------------------------------------- *
 * F5 候选被淘汰但盟友仍存活
 * ---------------------------------------------------------------- */
{
    // 中文：三人图里座位 0 与座位 1 同属联盟 0（夹具联盟表），座位 0 个人被淘汰，
    // 但整局由联盟 0 获胜。主协议按联盟记分 ⇒ 候选得 1；个人淘汰只作辅助结果。
    const state = {
        players: [
            { id: 0, isAlive: false },
            { id: 1, isAlive: true },
            { id: 2, isAlive: false },
        ],
        winner: 0,
    };
    const auxWhenWinnerDecided = earlyEliminationAux(state, 0);
    const auxWhileRunning = earlyEliminationAux({ ...state, winner: null }, 0);
    const cKind = classify({ winner: 0, winnerAlliance: 0 });
    const mKind = classify({ winner: 0, winnerAlliance: 0 });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind, winnerAllianceId: 0, candidateAllianceId: 0, earlyEliminationAux: true }),
        row({ arm: 'MIRROR', outcomeKind: mKind, winnerAllianceId: 0, candidateAllianceId: 0 }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        allyAllianceWins: true,
        candidateScoreFromAllianceView: 1,
        earlyEliminationAuxWhenWinnerDecided: false,
        earlyEliminationAuxWhileRunning: true,
        mainProtocolContinuesWhileWinnerNull: true,
        pairKind: 'COMPLETE',
    };
    const actual = {
        allyAllianceWins: cKind === 'NATURAL_WIN',
        candidateScoreFromAllianceView: d.candidate.score,
        earlyEliminationAuxWhenWinnerDecided: auxWhenWinnerDecided,
        earlyEliminationAuxWhileRunning: auxWhileRunning,
        mainProtocolContinuesWhileWinnerNull: auxWhileRunning === true,
        pairKind: d.kind,
    };
    recordCase(
        'F5', '候选被淘汰但盟友仍存活',
        '个人淘汰 ≠ 联盟失败：只要联盟仍有存活成员并最终获胜，候选视角为胜；winner=null 时只记辅助结局、主协议继续',
        { players: state.players, winner: 0, candidateSeat: 0, allySeat: 1 },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'eval_v14_protocol.earlyEliminationAux + protocol §5.1 淘汰规则',
    );
}

/* ---------------------------------------------------------------- *
 * F6 非法动作 / 崩溃
 * ---------------------------------------------------------------- */
{
    const cKind = classify({ policyError: 'chosen action is not in the policy-allowed set: move:u1:3,4' });
    const mKind = classify({ engineError: 'engine.step threw: TypeError' });
    const rows = [
        row({ arm: 'CANDIDATE', outcomeKind: cKind, error: 'chosen action is not in the policy-allowed set: move:u1:3,4' }),
        row({ arm: 'MIRROR', outcomeKind: mKind, error: 'engine.step threw: TypeError' }),
    ];
    const { report } = runPipeline(rows);
    const d = report.pairDetails[0];
    const expected = {
        candidateClass: 'POLICY_ERROR',
        mirrorClass: 'ENGINE_ERROR',
        pairKind: 'ERROR',
        errorsAreLossOrDraw: false,
        pointEstimate: null,
        errorPairs: 1,
        illegalActionOrCrashCounted: 2,
        errorKinds: { POLICY_ERROR: 1, ENGINE_ERROR: 1 },
    };
    const actual = {
        candidateClass: cKind,
        mirrorClass: mKind,
        pairKind: d.kind,
        errorsAreLossOrDraw: d.candidate.score !== null || d.mirror.score !== null,
        pointEstimate: report.panel.completePoint,
        errorPairs: report.totals.errorPairs,
        illegalActionOrCrashCounted: report.breakdowns.illegalActionOrCrash,
        errorKinds: report.breakdowns.errorKinds,
    };
    recordCase(
        'F6', '非法动作 / 崩溃',
        '错误不是截断也不是负局：单独走错误 gate，不参与点估计与区间平均；两侧错误各自计数',
        { candidate: { policyError: '动作不在允许集' }, mirror: { engineError: 'step 抛错' } },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §6（对局错误不变成负局）+ eval_v3_core.isError',
    );
}

/* ---------------------------------------------------------------- *
 * F7 重复行 / 缺臂
 * ---------------------------------------------------------------- */
{
    const nat = classify({ winner: 0, winnerAlliance: 0 });
    const dupRows: EvalRowV15[] = [
        row({ arm: 'CANDIDATE', outcomeKind: nat, gameId: 'g|cand|1' }),
        row({ arm: 'MIRROR', outcomeKind: nat, winnerAllianceId: 0, gameId: 'g|mirror|1' }),
        row({ arm: 'CANDIDATE', outcomeKind: nat, gameId: 'g|cand|1' }), // 同一 gameId 重复
    ];
    const dup = strictBuildPairsV15(dupRows, { requireIdentity: false });
    const missingRows: EvalRowV15[] = [
        row({ arm: 'CANDIDATE', outcomeKind: nat, gameId: 'g|cand|2' }),
    ];
    const missing = strictBuildPairsV15(missingRows, { requireIdentity: false });
    const legacyDup = buildPairs(dupRows as never);
    const rowsNoGameId: EvalRowV15[] = [
        row({ arm: 'CANDIDATE', outcomeKind: nat }),
        row({ arm: 'CANDIDATE', outcomeKind: nat }),
        row({ arm: 'MIRROR', outcomeKind: nat, winnerAllianceId: 0 }),
    ];
    const legacyNoId = strictBuildPairsV15(rowsNoGameId, { requireIdentity: false });
    const expected = {
        duplicateGameIdReported: true,
        duplicateGameIdCount: 1,
        duplicateDoesNotOverwriteSilently: true,
        missingArmReported: true,
        missingArmCount: 1,
        duplicateArmWithoutGameIdReported: true,
        pairsFromDuplicateFixture: 1,
        v14LegacyBehaviourKeepsDuplicateInOrphans: true,
    };
    const actual = {
        duplicateGameIdReported: dup.issues.some((i) => i.kind === 'DUPLICATE_GAME_ID'),
        duplicateGameIdCount: dup.issues.filter((i) => i.kind === 'DUPLICATE_GAME_ID').length,
        duplicateDoesNotOverwriteSilently: dup.pairs.length === 1,
        missingArmReported: missing.issues.some((i) => i.kind === 'MISSING_ARM'),
        missingArmCount: missing.issues.filter((i) => i.kind === 'MISSING_ARM').length,
        duplicateArmWithoutGameIdReported: legacyNoId.issues.some((i) => i.kind === 'DUPLICATE_ARM_ROW'),
        pairsFromDuplicateFixture: dup.pairs.length,
        v14LegacyBehaviourKeepsDuplicateInOrphans: legacyDup.pairs.length === 1 && legacyDup.orphans.length === 1,
    };
    recordCase(
        'F7', '重复行 / 缺臂',
        '重复 gameId 与缺臂必须显式报错，不能用 Map 覆盖后悄悄少算对局；历史 v14 行为（orphans）保持可复算',
        { duplicateFixture: dupRows.length, missingFixture: missingRows.length },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §5.2（无法配对/重复 pairId 必须报错）',
    );
}

/* ---------------------------------------------------------------- *
 * F8 缓存身份变化
 * ---------------------------------------------------------------- */
{
    const identityBase = {
        runId: 'v15_20260925_core',
        runMode: 'dev' as const,
        panelId: 'dev',
        blockId: 'dev:frozen:b0',
        scenarioId: 'SDPLAN:sd-normal:(3) Frozen fields.aem',
        rootSeed: 2026094504,
        episodeIndex: 4,
        rootFamilyId: 'SDPLAN:sd-normal:(3) Frozen fields.aem#2026094504#4',
        candidateSeat: 0 as number | null,
        viewedSeat: 0 as number | null,
        arm: 'CANDIDATE' as const,
        modelId: 'spatial_candidate:c2_s42:abcdefabcdef',
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
        maxPliesAtomicActions: null as number | null,
        wallTimeoutMs: 300000,
    };
    const candIdentity = buildCacheIdentityV15(identityBase);
    const mirrorIdentity = buildCacheIdentityV15({
        ...identityBase, arm: 'MIRROR', candidateSeat: null, viewedSeat: 0,
        modelId: 'heuristic:mirror:v1', checkpointSha256: null, encoderSchemaId: 'heuristic/na',
    });
    const nat = classify({ winner: 0, winnerAlliance: 0 });
    const okRows: EvalRowV15[] = [
        row({ arm: 'CANDIDATE', outcomeKind: nat, gameId: candIdentity.gameId, cacheIdentity: candIdentity }),
        row({ arm: 'MIRROR', outcomeKind: nat, winnerAllianceId: 0, gameId: mirrorIdentity.gameId, cacheIdentity: mirrorIdentity }),
    ];
    const sameIdentity = strictBuildPairsV15(okRows, { requireIdentity: true });
    // 中文：镜像行的规则改了（rulesHash 变）⇒ 与候选臂不是同一实验，必须报身份错配而不是配对。
    const changedMirrorIdentity = buildCacheIdentityV15({ ...identityBase, arm: 'MIRROR', candidateSeat: null, viewedSeat: 0, rulesHash: '9'.repeat(64), modelId: 'heuristic:mirror:v1', checkpointSha256: null, encoderSchemaId: 'heuristic/na' });
    const changedRows: EvalRowV15[] = [
        row({ arm: 'CANDIDATE', outcomeKind: nat, gameId: candIdentity.gameId, cacheIdentity: candIdentity }),
        row({ arm: 'MIRROR', outcomeKind: nat, winnerAllianceId: 0, gameId: changedMirrorIdentity.gameId, cacheIdentity: changedMirrorIdentity }),
    ];
    const changed = strictBuildPairsV15(changedRows, { requireIdentity: true });
    // 中文：同一份镜像计算按不同座位展开时 viewedSeat 不同，但仍可复用（只复用计算）；
    // 规则摘要一变就必须判为不可复用。
    const reuseSameEntity = cacheReuseDiffV15(
        mirrorIdentity.fields,
        { ...mirrorIdentity.fields, viewedSeat: 2 },
    );
    const reuseDiffDifferentRules = cacheReuseDiffV15(
        mirrorIdentity.fields,
        { ...mirrorIdentity.fields, rulesHash: '9'.repeat(64) },
    );
    const expected = {
        sameIdentityPairs: 1,
        sameIdentityIssues: 0,
        changedRulesHashPairs: 0,
        changedRulesHashIssueKind: 'IDENTITY_MISMATCH',
        changedKeyDiffers: true,
        reuseSameEntityDiff: [],
        reuseDifferentRulesDiff: ['rulesHash'],
        reuseIsNotExtraIndependentSample: true,
    };
    const actual = {
        sameIdentityPairs: sameIdentity.pairs.length,
        sameIdentityIssues: sameIdentity.issues.length,
        changedRulesHashPairs: changed.pairs.length,
        changedRulesHashIssueKind: changed.issues[0]?.kind ?? null,
        changedKeyDiffers: changedMirrorIdentity.key !== candIdentity.key,
        reuseSameEntityDiff: reuseSameEntity,
        reuseDifferentRulesDiff: reuseDiffDifferentRules,
        reuseIsNotExtraIndependentSample: true,
    };
    recordCase(
        'F8', '缓存身份变化',
        '同一 root 的候选臂与镜像臂必须共享初始状态/地图/规则/引擎/随机流/caps 身份；规则摘要一变即为身份错配，不得配对；复用镜像只复用计算',
        { changedField: 'rulesHash', base: candIdentity.key.slice(0, 48) + '…', changed: changedMirrorIdentity.key.slice(0, 48) + '…' },
        expected, actual,
        JSON.stringify(expected) === JSON.stringify(actual),
        'protocol §5.2 缓存键 + eval_v14_protocol.buildCacheIdentityV15',
    );
}

/* ---------------------------------------------------------------- *
 * 聚合视角对照（合成 + 真实 V14b 文件）
 * ---------------------------------------------------------------- */
console.log('[T15-09A] 聚合视角对照');

/** 合成对照：镜像行字面 NATURAL_LOSS，但被测座位所属联盟获胜。 */
const syntheticViewRows: EvalRowV15[] = [
    row({ arm: 'MIRROR', outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 1, viewedSeat: 1 }),
    row({ arm: 'MIRROR', outcomeKind: 'NATURAL_LOSS', winnerAllianceId: 1, candidateAllianceId: 0, viewedSeat: 0 }),
];
const syntheticCompare = compareDeclaredVsRecomputed(syntheticViewRows as never);
const syntheticReading = {
    declaredVsRecomputed: syntheticCompare.byOutcome,
    differingRows: syntheticCompare.differingRows,
    seat1: readArmV15(syntheticViewRows[0]).viewedOutcome,
    seat0: readArmV15(syntheticViewRows[1]).viewedOutcome,
};

/** 真实对照：v14b 六份原 games（只读）。 */
const V14B_MATCHES = path.resolve('v14/out/v14_20260925_t14b/T14-06/matches');
const v14bFiles = [
    'duel2p_c1s42.games.jsonl', 'duel2p_c1s1337.games.jsonl', 'duel2p_c1s2026.games.jsonl',
    'frozen3p_c1s42.games.jsonl', 'frozen3p_c1s1337.games.jsonl', 'frozen3p_c1s2026.games.jsonl',
];
const realFiles: Array<Record<string, unknown>> = [];
for (const name of v14bFiles) {
    const abs = path.join(V14B_MATCHES, name);
    const text = fs.readFileSync(abs, 'utf8');
    const rows = parseGamesJsonl(text);
    const cmp = compareDeclaredVsRecomputed(rows);
    realFiles.push({
        file: name.replace(/\\/g, '/'),
        sha256: sha256Hex(text),
        rows: cmp.rows,
        differingRows: cmp.differingRows,
        byArm: cmp.byArm,
        byOutcome: cmp.byOutcome,
    });
}
const realDiffering = realFiles.reduce((a, f) => a + (f.differingRows as number), 0);
const realRows = realFiles.reduce((a, f) => a + (f.rows as number), 0);

const viewpointComparison = {
    purpose: '聚合必须先按被测联盟从 winner 重算视角；此表给出「行里声明值 vs 重算值」的对照读数',
    synthetic: syntheticReading,
    realV14b: {
        directory: V14B_MATCHES.replace(/\\/g, '/'),
        files: realFiles,
        totals: { rows: realRows, differingRows: realDiffering },
        interpretation:
            '镜像行在旧 runner 里没有候选座位（视角联盟为 null），因此任何 winner 都被记成 NATURAL_LOSS；'
            + '三人图中被测座位 1/2 的联盟获胜时即为错写。重算后这些行变成 NATURAL_WIN。',
    },
    pass: syntheticCompare.differingRows === 1
        && syntheticReading.seat1 === 'NATURAL_WIN'
        && syntheticReading.seat0 === 'NATURAL_LOSS'
        && realRows > 0,
};

if (!viewpointComparison.pass) failures.push('聚合视角对照未通过');

/* ---------------------------------------------------------------- *
 * 冻结配置自检（数值直接取自 T15-00，不发明）
 * ---------------------------------------------------------------- */
const runRoot = path.resolve(arg('--run-root', 'v15/out/v15_20260925_core') as string);
const cfg = loadFrozenEvalConfigV15(runRoot);
const configCheck = {
    runId: cfg.runId,
    caps: cfg.caps,
    bootstrap: {
        iterations: cfg.statistics.bootstrapIterations,
        seed: cfg.statistics.bootstrapSeed,
        unit: cfg.statistics.bootstrapUnit,
        stratifiedBy: cfg.statistics.bootstrapStratifiedBy,
    },
    panelWeightsByMap: cfg.panel.panelWeightsByMap,
    devPanelBlocks: cfg.devPanel.map((b) => b.blockId),
    seatPairingsPerModel: cfg.panel.candidateSeatsPerModel,
    candidateArms: cfg.panel.candidateArms,
    mirrorEntities: cfg.panel.mirrorEntities,
    totalMatches: cfg.panel.totalMatches,
    costPreflightRoots: cfg.costPreflight.map((b) => ({ blockId: b.blockId, rootSeed: b.rootSeed, mapName: b.mapName })),
    pass:
        cfg.caps.maxStepsAtomicActions === 12000
        && cfg.caps.wallTimeoutMs === 300000
        && cfg.statistics.bootstrapIterations === 10000
        && cfg.statistics.bootstrapSeed === 2026099500
        && cfg.panel.candidateArms === 240
        && cfg.panel.mirrorEntities === 8
        && cfg.panel.totalMatches === 248
        && cfg.devPanel.length === 8,
};
if (!configCheck.pass) failures.push('冻结配置自检未通过（数值与 protocol.json 不一致）');

/* ---------------------------------------------------------------- *
 * 输出
 * ---------------------------------------------------------------- */
const outPath = path.resolve(arg('--out', path.join(runRoot, 'T15-09', 'eval_selftest.json')) as string);
const payload = {
    schema: 'v15_eval_selftest_1',
    task: 'T15-09A',
    owner: 'A',
    runId: cfg.runId,
    generatedAt: new Date().toISOString(),
    method: '合成夹具驱动：分类走 v13 classifyOutcome，配对走 v15 strictBuildPairsV15，统计走 v15 aggregateV15；不跑真对局',
    faultInjection: {
        categories: cases.length,
        passed: cases.filter((c) => c.pass).length,
        failed: cases.filter((c) => !c.pass).length,
        cases,
    },
    viewpointComparison,
    configCheck,
    passed: failures.length === 0,
    failures,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (fs.existsSync(outPath)) {
    throw new Error(`[T15-09A] 已存在同名产物，拒绝覆盖：${outPath}`);
}
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`[T15-09A] 故障注入 ${payload.faultInjection.passed}/${payload.faultInjection.categories} 通过；视角对照 differing=${realDiffering}/${realRows}`);
console.log(`[T15-09A] -> ${outPath}`);
if (failures.length) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
