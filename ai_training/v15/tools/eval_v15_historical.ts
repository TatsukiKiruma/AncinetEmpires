/**
 * V15/T15-09A：用 V14b 六份**原 games** 重算历史表（owner A）。
 *
 * 任务书 §10.1 第四条：重算得到审核里的「三人图 34/36 候选自然完成、26/36 完整配对」
 * 及逐 seed 区间。**主 V15 的 root/地图权重与旧聚合不同，要另列版本**，不能要求两种
 * 权重的总数值相同——因此本报告并列两栏：
 *
 * - `legacyV14Aggregate`：直接调用 `v14/tools/eval_v14_aggregate.ts` 的
 *   `buildPairs` + `aggregatePairs`（历史实现原样），并与仓库里已存的
 *   `*.aggregate.json` 逐字段对比，证明历史语义没有被改动；
 * - `v15Weighted`：走 V15 的严格配对 + 加权聚合（root 内等权座位 → 地图内等权 roots
 *   → 面板权重），bootstrap 用冻结的 10,000 次 / seed 2026099500。
 *
 * 只读历史文件；本工具不写 `v14/out/**`。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_historical.ts \
 *     --out v15/out/<runId>/T15-09/historical_recompute.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
    isError,
    isNatural,
    isUndecided,
    type OutcomeKind,
} from '../../v13/tools/eval_v3_core';
import {
    aggregatePairs,
    buildPairs,
    compareDeclaredVsRecomputed,
    parseGamesJsonl,
} from '../../v14/tools/eval_v14_aggregate';
import {
    aggregateV15,
    detailsFromPairsV15,
    loadFrozenEvalConfigV15,
    strictBuildPairsV15,
    type EvalRowV15,
    type PairDetailV15,
} from './eval_v15_core';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ROOT = path.resolve(arg('--run-root', 'v15/out/v15_20260925_core') as string);
const V14B = path.resolve('v14/out/v14_20260925_t14b/T14-06/matches');

/** 六份原文件（审核用的同一批）。 */
const FILES: Array<{ file: string; map: string; playerCount: number; trainingSeed: number; tag: string }> = [
    { file: 'duel2p_c1s42.games.jsonl', map: '(2) Duel.aem', playerCount: 2, trainingSeed: 42, tag: 'c1_s42' },
    { file: 'duel2p_c1s1337.games.jsonl', map: '(2) Duel.aem', playerCount: 2, trainingSeed: 1337, tag: 'c1_s1337' },
    { file: 'duel2p_c1s2026.games.jsonl', map: '(2) Duel.aem', playerCount: 2, trainingSeed: 2026, tag: 'c1_s2026' },
    { file: 'frozen3p_c1s42.games.jsonl', map: '(3) Frozen fields.aem', playerCount: 3, trainingSeed: 42, tag: 'c1_s42' },
    { file: 'frozen3p_c1s1337.games.jsonl', map: '(3) Frozen fields.aem', playerCount: 3, trainingSeed: 1337, tag: 'c1_s1337' },
    { file: 'frozen3p_c1s2026.games.jsonl', map: '(3) Frozen fields.aem', playerCount: 3, trainingSeed: 2026, tag: 'c1_s2026' },
];

/** 审核 §4 的登记数字（用于对照，不作为真值）。 */
const AUDIT_TABLE: Record<string, { candidateNatural: string; completePairs: string; candidateWDLTrunc: string; planDeltaBound: [number, number] }> = {
    'Duel/42': { candidateNatural: '8/8', completePairs: '8/8', candidateWDLTrunc: '0/0/8/0', planDeltaBound: [-0.5, -0.5] },
    'Duel/1337': { candidateNatural: '8/8', completePairs: '8/8', candidateWDLTrunc: '0/0/8/0', planDeltaBound: [-0.5, -0.5] },
    'Duel/2026': { candidateNatural: '8/8', completePairs: '8/8', candidateWDLTrunc: '0/0/8/0', planDeltaBound: [-0.5, -0.5] },
    'Frozen fields/42': { candidateNatural: '12/12', completePairs: '9/12', candidateWDLTrunc: '1/0/11/0', planDeltaBound: [-0.4167, -0.1667] },
    'Frozen fields/1337': { candidateNatural: '12/12', completePairs: '9/12', candidateWDLTrunc: '0/0/12/0', planDeltaBound: [-0.5, -0.25] },
    'Frozen fields/2026': { candidateNatural: '10/12', completePairs: '8/12', candidateWDLTrunc: '0/0/10/2', planDeltaBound: [-0.5, -0.0833] },
};
const AUDIT_TOTALS_3P = { candidateNatural: '34/36', completePairs: '26/36' };

function sha256File(abs: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

const cfg = loadFrozenEvalConfigV15(RUN_ROOT);

interface FileResult {
    file: string;
    sha256: string;
    mapName: string;
    playerCount: number;
    trainingSeed: number;
    modelTag: string;
    rows: number;
    /** 计划内的候选臂数（本文件的候选行数：4 seeds × 座位数）。 */
    plannedCandidateArms: number;
    candidateNaturalCount: number;
    completePairCount: number;
    truncatedPairCount: number;
    errorPairCount: number;
    legacyV14Aggregate: Record<string, unknown>;
    v15Weighted: Record<string, unknown>;
    candidateBreakdown: Record<string, number>;
    mirrorBreakdown: Record<string, number>;
    viewpoint: Record<string, unknown>;
    auditComparison: Record<string, unknown>;
}

const fileResults: FileResult[] = [];
const allDetails: PairDetailV15[] = [];

for (const spec of FILES) {
    const abs = path.join(V14B, spec.file);
    const text = fs.readFileSync(abs, 'utf8');
    const rows = parseGamesJsonl(text) as EvalRowV15[];

    // ---- 1) 历史实现原样复算，并与仓库中已存 aggregate JSON 对比 ----
    const legacyPairs = buildPairs(rows as never);
    const legacyReport = aggregatePairs(legacyPairs.pairs);
    const storedPath = path.join(V14B, '..', 'aggregate', spec.file.replace('.games.jsonl', '.aggregate.json'));
    const stored = fs.existsSync(storedPath)
        ? JSON.parse(fs.readFileSync(storedPath, 'utf8'))
        : null;
    const storedMatches = stored === null ? null : {
        totalPairs: stored.totalPairs === legacyReport.totalPairs,
        completeCount: stored.completePairs.count === legacyReport.completePairs.count,
        completeMean: approxEqual(stored.completePairs.mean, legacyReport.completePairs.mean),
        candidateWDL: stored.completePairs.candidateWins === legacyReport.completePairs.candidateWins
            && stored.completePairs.candidateDraws === legacyReport.completePairs.candidateDraws
            && stored.completePairs.candidateLosses === legacyReport.completePairs.candidateLosses,
        truncatedCount: stored.truncatedPairs.count === legacyReport.truncatedPairs.count,
        overallLow: approxEqual(stored.overallMeanInterval.low, legacyReport.overallMeanInterval.low),
        overallHigh: approxEqual(stored.overallMeanInterval.high, legacyReport.overallMeanInterval.high),
        clusterCI: approxEqual(stored.clusterCI.low95, legacyReport.clusterCI.low95)
            && approxEqual(stored.clusterCI.high95, legacyReport.clusterCI.high95),
        errors: stored.errors.count === legacyReport.errors.count,
    };

    // ---- 2) V15 严格配对 + 加权聚合（单文件=单图，读数按可用地图归一化） ----
    const strict = strictBuildPairsV15(rows, { requireIdentity: false });
    for (const p of strict.pairs) {
        (p.candidate as EvalRowV15).modelTag = spec.tag;
        (p.mirror as EvalRowV15).modelTag = spec.tag;
    }
    const details = detailsFromPairsV15(strict.pairs).map((d) => ({
        ...d,
        // 中文：六份文件用的是同一批 seed（1..4），跨文件 root 键会碰撞；用训练 seed 标签
        // 前缀把 root 家族区分开，保证 bootstrap 的整块单位是「(训练seed, root)」而不是合并后的伪 root。
        rootKey: `${spec.tag}|${d.rootKey}`,
        modelTag: spec.tag,
    }));
    allDetails.push(...details);

    const v15Report = aggregateV15(details, {
        panelWeightsByMap: cfg.panel.panelWeightsByMap,
        bootstrapIterations: cfg.statistics.bootstrapIterations,
        bootstrapSeed: cfg.statistics.bootstrapSeed,
        aggregationOrder: cfg.statistics.aggregationOrder,
    });

    // ---- 3) 候选/镜像完成率与截断分解（协议 §6 必列项） ----
    const candidateBreakdown = { natural: 0, win: 0, draw: 0, loss: 0, truncated: 0, error: 0 };
    const mirrorBreakdown = { entities: 0, entityNatural: 0, seatViews: 0, seatViewNatural: 0 };
    const entitySeen = new Set<string>();
    for (const d of details) {
        const c = d.candidate;
        if (isNatural(c.declaredOutcome)) {
            candidateBreakdown.natural++;
            if (c.viewedOutcome === 'NATURAL_WIN') candidateBreakdown.win++;
            else if (c.viewedOutcome === 'NATURAL_DRAW') candidateBreakdown.draw++;
            else candidateBreakdown.loss++;
        } else if (isUndecided(c.declaredOutcome)) candidateBreakdown.truncated++;
        else if (isError(c.declaredOutcome)) candidateBreakdown.error++;

        mirrorBreakdown.seatViews++;
        if (isNatural(d.mirror.declaredOutcome)) mirrorBreakdown.seatViewNatural++;
        if (!entitySeen.has(d.mirrorEntityKey)) {
            entitySeen.add(d.mirrorEntityKey);
            mirrorBreakdown.entities++;
            if (isNatural(d.mirror.declaredOutcome)) mirrorBreakdown.entityNatural++;
        }
    }

    // ---- 4) 视角对照（声明值 vs 从 winner 重算） ----
    const viewpoint = compareDeclaredVsRecomputed(rows as never);

    // ---- 5) 与审核登记数字对照 ----
    // 中文：审核表用「地图简称/训练 seed」做键，这里去掉 '(2) '/'(3) ' 前缀与 '.aem'。
    const auditKey = `${spec.map.replace(/^\(\d+\)\s*/, '').replace('.aem', '')}/${spec.trainingSeed}`;
    const audit = AUDIT_TABLE[auditKey];
    const candidateNaturalStr = `${candidateBreakdown.natural}/${details.length}`;
    const completePairStr = `${v15Report.totals.completePairs}/${details.length}`;
    const wdlTruncStr = `${candidateBreakdown.win}/${candidateBreakdown.draw}/${candidateBreakdown.loss}/${candidateBreakdown.truncated}`;
    const lowHigh: [number, number] = [
        round(v15Report.panel.lowBound as number, 4),
        round(v15Report.panel.highBound as number, 4),
    ];

    fileResults.push({
        file: spec.file,
        sha256: sha256File(abs),
        mapName: spec.map,
        playerCount: spec.playerCount,
        trainingSeed: spec.trainingSeed,
        modelTag: spec.tag,
        rows: rows.length,
        plannedCandidateArms: details.length,
        candidateNaturalCount: candidateBreakdown.natural,
        completePairCount: v15Report.totals.completePairs,
        truncatedPairCount: v15Report.totals.truncatedPairs,
        errorPairCount: v15Report.totals.errorPairs,
        legacyV14Aggregate: {
            note: '直接调用 v14 历史实现（buildPairs + aggregatePairs），未改动其语义',
            pairs: legacyReport.totalPairs,
            orphans: legacyPairs.orphans.length,
            completePairs: legacyReport.completePairs.count,
            completeMean: legacyReport.completePairs.mean,
            candidateWDL: [
                legacyReport.completePairs.candidateWins,
                legacyReport.completePairs.candidateDraws,
                legacyReport.completePairs.candidateLosses,
            ],
            truncatedPairs: legacyReport.truncatedPairs.count,
            overallMeanInterval: legacyReport.overallMeanInterval,
            clusterCI: {
                blocks: legacyReport.clusterCI.blocks,
                mean: legacyReport.clusterCI.mean,
                low95: legacyReport.clusterCI.low95,
                high95: legacyReport.clusterCI.high95,
                seed: legacyReport.clusterCI.seed,
                b: legacyReport.clusterCI.b,
            },
            errors: legacyReport.errors,
            storedAggregatePath: storedPath.replace(/\\/g, '/'),
            storedMatches,
        },
        v15Weighted: {
            note: 'V15 权重：root 内等权座位 → 地图内等权 roots → 面板权重（单图读数按可用地图归一化）',
            candidateNatural: candidateNaturalStr,
            completePairs: completePairStr,
            candidateWDLTrunc: wdlTruncStr,
            panelCompletePoint: v15Report.panel.completePoint,
            panelLowBound: v15Report.panel.lowBound,
            panelHighBound: v15Report.panel.highBound,
            renormalized: v15Report.panel.renormalized,
            roots: v15Report.totals.roots,
            bootstrap10000: {
                seed: cfg.statistics.bootstrapSeed,
                iterations: cfg.statistics.bootstrapIterations,
                rootBlocks: v15Report.bootstrap.completePointInterval.blocks,
                low95: v15Report.bootstrap.completePointInterval.low95,
                high95: v15Report.bootstrap.completePointInterval.high95,
                conservativeLowerBound: v15Report.bootstrap.conservativeLowerBound,
            },
            truncationKinds: v15Report.breakdowns.truncationKinds,
            errorKinds: v15Report.breakdowns.errorKinds,
        },
        candidateBreakdown,
        mirrorBreakdown,
        viewpoint: {
            rows: viewpoint.rows,
            differingRows: viewpoint.differingRows,
            byArm: viewpoint.byArm,
            byOutcome: viewpoint.byOutcome,
        },
        auditComparison: {
            auditKey,
            auditRegistered: audit ?? null,
            recomputed: {
                candidateNatural: candidateNaturalStr,
                completePairs: completePairStr,
                candidateWDLTrunc: wdlTruncStr,
                planDeltaBound: lowHigh,
            },
            matchesAudit: audit === undefined ? null : {
                candidateNatural: audit.candidateNatural === candidateNaturalStr,
                completePairs: audit.completePairs === completePairStr,
                candidateWDLTrunc: audit.candidateWDLTrunc === wdlTruncStr,
                planDeltaBound: approxEqual(audit.planDeltaBound[0], lowHigh[0], 5e-5)
                    && approxEqual(audit.planDeltaBound[1], lowHigh[1], 5e-5),
            },
        },
    });
}

// ---- 六份合计：三人图 34/36 与 26/36 ----
const threeP = fileResults.filter((f) => f.playerCount === 3);
const duel = fileResults.filter((f) => f.playerCount === 2);
const sum = (list: FileResult[], pick: (f: FileResult) => number): number => list.reduce((a, f) => a + pick(f), 0);
const totals = {
    threePlayer: {
        candidateNatural: `${sum(threeP, (f) => f.candidateNaturalCount)}/${sum(threeP, (f) => f.plannedCandidateArms)}`,
        completePairs: `${sum(threeP, (f) => f.completePairCount)}/${sum(threeP, (f) => f.plannedCandidateArms)}`,
        auditRegistered: AUDIT_TOTALS_3P,
        candidateBreakdown: {
            natural: sum(threeP, (f) => f.candidateBreakdown.natural),
            win: sum(threeP, (f) => f.candidateBreakdown.win),
            draw: sum(threeP, (f) => f.candidateBreakdown.draw),
            loss: sum(threeP, (f) => f.candidateBreakdown.loss),
            truncated: sum(threeP, (f) => f.candidateBreakdown.truncated),
            error: sum(threeP, (f) => f.candidateBreakdown.error),
        },
    },
    duel: {
        candidateNatural: `${sum(duel, (f) => f.candidateNaturalCount)}/${sum(duel, (f) => f.plannedCandidateArms)}`,
        completePairs: `${sum(duel, (f) => f.completePairCount)}/${sum(duel, (f) => f.plannedCandidateArms)}`,
        candidateBreakdown: {
            natural: sum(duel, (f) => f.candidateBreakdown.natural),
            win: sum(duel, (f) => f.candidateBreakdown.win),
            draw: sum(duel, (f) => f.candidateBreakdown.draw),
            loss: sum(duel, (f) => f.candidateBreakdown.loss),
            truncated: sum(duel, (f) => f.candidateBreakdown.truncated),
            error: sum(duel, (f) => f.candidateBreakdown.error),
        },
    },
};

// ---- 两种权重版本（明确不同，不要求总数值相同） ----
const panelReport = aggregateV15(allDetails, {
    panelWeightsByMap: cfg.panel.panelWeightsByMap,
    bootstrapIterations: cfg.statistics.bootstrapIterations,
    bootstrapSeed: cfg.statistics.bootstrapSeed,
    aggregationOrder: cfg.statistics.aggregationOrder,
});
const legacyPerFileMeans = fileResults.map((f) => (f.legacyV14Aggregate as any).completeMean as number | null);
const weightVersions = {
    note:
        '旧聚合按「文件（训练 seed × 地图）」平均每个文件的 block 均值，六份文件等权；'
        + 'V15 面板按「root → 地图 → 面板权重（两图各 1/2）」加权。两者权重结构不同，'
        + '总数值本来就不要求相同——这里并列，不做等价声明。',
    legacyV14PerFile: {
        perFileCompleteMean: fileResults.map((f) => ({
            file: f.file,
            completeMean: (f.legacyV14Aggregate as any).completeMean,
            completePairs: (f.legacyV14Aggregate as any).completePairs,
        })),
        unweightedMeanAcrossFiles: mean(legacyPerFileMeans.filter((v): v is number => v !== null)),
        trainingSeedWeighting: '每份文件（训练 seed × 地图）各占 1/6',
    },
    v15PanelWeighted: {
        panelCompletePoint: panelReport.panel.completePoint,
        panelLowBound: panelReport.panel.lowBound,
        panelHighBound: panelReport.panel.highBound,
        renormalized: panelReport.panel.renormalized,
        usedWeightSum: panelReport.panel.usedWeightSum,
        byMap: panelReport.panel.byMap.map((s) => ({
            key: s.key,
            roots: s.roots,
            completePairs: s.completePairs,
            completePoint: s.completePoint,
            lowBound: s.lowBound,
            highBound: s.highBound,
        })),
        bootstrap10000: panelReport.bootstrap,
        trainingSeedWeighting: 'root 家族整块重采样后地图内平均，再两图各 1/2；训练 seed 先分别报告再等权描述',
        perTrainingSeed: panelReport.perTrainingSeed,
    },
};

const auditReproduced = {
    threePlayerCandidateNatural34of36: totals.threePlayer.candidateNatural === AUDIT_TOTALS_3P.candidateNatural,
    threePlayerCompletePairs26of36: totals.threePlayer.completePairs === AUDIT_TOTALS_3P.completePairs,
    perFileAllMatch: fileResults.every((f) => Object.values((f.auditComparison as any).matchesAudit as Record<string, boolean>).every((v) => v)),
    legacyStoredAggregateAllMatch: fileResults.every((f) => {
        const m = (f.legacyV14Aggregate as any).storedMatches as Record<string, boolean> | null;
        return m !== null && Object.values(m).every((v) => v);
    }),
    viewpointDifferencesFound: fileResults.reduce((a, f) => a + (f.viewpoint.differingRows as number), 0),
};

const outPath = path.resolve(arg('--out', path.join(RUN_ROOT, 'T15-09', 'historical_recompute.json')) as string);
const payload = {
    schema: 'v15_historical_recompute_1',
    task: 'T15-09A',
    owner: 'A',
    generatedAt: new Date().toISOString(),
    sourceDirectory: V14B.replace(/\\/g, '/'),
    readingMode: '只读原 games 与已存 aggregate JSON；本工具不写 v14/out/**',
    frozenStatistics: {
        bootstrapIterations: cfg.statistics.bootstrapIterations,
        bootstrapSeed: cfg.statistics.bootstrapSeed,
        panelWeightsByMap: cfg.panel.panelWeightsByMap,
        aggregationOrder: cfg.statistics.aggregationOrder,
    },
    files: fileResults,
    totals,
    weightVersions,
    auditReproduced,
    conclusions: [
        `三人图候选自然完成 ${totals.threePlayer.candidateNatural}（审核登记 ${AUDIT_TOTALS_3P.candidateNatural}）：${auditReproduced.threePlayerCandidateNatural34of36 ? '复现' : '不一致'}`,
        `三人图双臂完整配对 ${totals.threePlayer.completePairs}（审核登记 ${AUDIT_TOTALS_3P.completePairs}）：${auditReproduced.threePlayerCompletePairs26of36 ? '复现' : '不一致'}`,
        `历史聚合实现与原 aggregate JSON 逐字段一致：${auditReproduced.legacyStoredAggregateAllMatch ? '是（未改变历史语义）' : '否'}`,
        `镜像行声明视角与 winner 重算不一致的行数：${auditReproduced.viewpointDifferencesFound}（必须靠重算视角，不能相信行内字样）`,
        'V15 面板权重与旧聚合成交权重不同，总数值并列而不等价。',
    ],
    passed: auditReproduced.threePlayerCandidateNatural34of36
        && auditReproduced.threePlayerCompletePairs26of36
        && auditReproduced.perFileAllMatch
        && auditReproduced.legacyStoredAggregateAllMatch,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
if (fs.existsSync(outPath)) {
    throw new Error(`[T15-09A] 已存在同名产物，拒绝覆盖：${outPath}`);
}
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

console.log(`[T15-09A] 三人图候选自然完成 ${totals.threePlayer.candidateNatural}；完整配对 ${totals.threePlayer.completePairs}`);
console.log(`[T15-09A] 双人图候选自然完成 ${totals.duel.candidateNatural}；完整配对 ${totals.duel.completePairs}`);
console.log(`[T15-09A] 历史实现与已存 aggregate 一致=${auditReproduced.legacyStoredAggregateAllMatch}；视角差异行=${auditReproduced.viewpointDifferencesFound}`);
console.log(`[T15-09A] -> ${outPath}`);
if (!payload.passed) {
    console.error('[T15-09A] 历史重算未通过对照');
    process.exit(1);
}

/* ---------------- 小工具 ---------------- */

function approxEqual(a: number | null | undefined, b: number | null | undefined, eps = 1e-9): boolean {
    if (a === null || a === undefined || b === null || b === undefined) return a === b;
    return Math.abs(a - b) <= eps;
}

function round(v: number | null, digits: number): number {
    if (v === null || !Number.isFinite(v)) return Number.NaN;
    const f = 10 ** digits;
    return Math.round(v * f) / f;
}

function mean(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
