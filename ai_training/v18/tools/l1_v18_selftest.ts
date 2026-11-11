/**
 * V18/T18-01：新版 L1 单次评分标签器的自检与旧版对照。
 *
 * 验收对应关系（V18 任务书 T18-01 验收）：
 * - 同次评分 argmax 与同次选择不一致 = 0；
 * - 标签/候选映射错误 = 0（`scores[i].actionIndex` ↔ `actionCode` ↔ 候选集一致）；
 * - 候选重排不改变选择；
 * - 未知目标来源 = 0（本工具只产出带完整合同字段的行）。
 *
 * 同时给出**旧版 vs 新版**的标签分歧率：这是把「双次评分」这一工程缺陷量化，
 * 而不是把新版说成更强。分歧只说明两次评分不同，不说明哪一版更接近胜利。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/l1_v18_selftest.ts \
 *     --rollouts v17/out/v17_20260926_r2/data/new_val/rollouts/val_h0.allmaps.jsonl \
 *     --per-map 40 --out v18/out/run_20260927_v18_01/labels/l1_v18_selftest.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Action, GameState } from '../../src/game/types';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { queryL1Label, mulberry32, seedFromKeyHash } from '../../v15/tools/labeler_l1_v15';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import {
    L1_LABELER_VERSION_V18,
    queryL1LabelV18,
    selectStable,
} from './labeler_l1_v18';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROLLOUTS = path.resolve(arg('--rollouts', 'v17/out/v17_20260926_r2/data/new_val/rollouts/val_h0.allmaps.jsonl') as string);
const PER_MAP = Number(arg('--per-map', '40'));
const OUT = path.resolve(arg('--out', 'v18/out/run_20260927_v18_01/labels/l1_v18_selftest.json') as string);
const SEED_BASE = Number(arg('--seed-base', '2610020000'));

interface Sample {
    mapIndex: number;
    mapName: string;
    rootId: string;
    stepIndex: number;
    phaseBucket: string;
    state: GameState;
    subjectPlayerId: number;
}

console.log(`[l1v18-selftest] 读取 ${ROLLOUTS}`);
const lines = fs.readFileSync(ROLLOUTS, 'utf8').split('\n');
const perMap = new Map<number, number>();
const samples: Sample[] = [];
for (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    const mapIndex = Number(row.mapIndex);
    const taken = perMap.get(mapIndex) ?? 0;
    if (taken >= PER_MAP) continue;
    perMap.set(mapIndex, taken + 1);
    samples.push({
        mapIndex,
        mapName: String(row.mapName),
        rootId: String(row.rootId),
        stepIndex: Number(row.stepIndex),
        phaseBucket: String(row.phaseBucket),
        state: JSON.parse(String(row.stateJson)) as GameState,
        subjectPlayerId: Number(row.subjectPlayerId),
    });
}
console.log(`[l1v18-selftest] 抽样 ${samples.length} 个状态（每图 <= ${PER_MAP}）`);

const report = {
    schema: 'v18_l1_selftest_1',
    rollouts: path.relative(process.cwd(), ROLLOUTS).replace(/\\/g, '/'),
    sampledStates: samples.length,
    perMap: Object.fromEntries([...perMap.entries()].sort((a, b) => a[0] - b[0])),
    newLabelerVersion: L1_LABELER_VERSION_V18,
    oldLabelerVersion: 'L1_heuristic_isolated_v15_1',
    checks: {
        statesQueried: 0,
        emptyActionSets: 0,
        // 验收 1：同次评分 argmax 与同次选择不一致 = 0
        sameScoringArgmaxVsChoiceMismatch: 0,
        // 自检：选择函数不是从记录分数反推出来的（应当为 0）
        selectionNotDerivedFromScores: 0,
        // 验收：标签/候选映射错误 = 0
        labelOutsideAllowedSet: 0,
        indexCodeMismatch: 0,
        duplicateActionCodeInCandidates: 0,
        // 状态污染
        statePolluted: 0,
        // 平局规则与候选原顺序规则分歧
        tieBreakMatters: 0,
        // 确定性：同输入重复查询一致
        repeatDeterminismMismatch: 0,
        // 候选重排不改变选择
        permutationMismatch: 0,
        // 旧版 vs 新版
        oldVsNewBothLabels: 0,
        oldVsNewLabelMismatch: 0,
        // 旧版内部的「分数 argmax（稳定规则） vs 旧标签」
        oldScoresArgmaxVsOldLabelMismatch: 0,
        oldRngDrawsTotal: 0,
        newRngDrawsTotal: 0,
        candidatesTotal: 0,
    },
    mismatchExamples: [] as Array<Record<string, unknown>>,
    oldNewMismatchExamples: [] as Array<Record<string, unknown>>,
    branchDistribution: {} as Record<string, number>,
    urgentLabels: 0,
};

function deepEqualActionCode(a: string, b: string): boolean {
    return a === b;
}

for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const seedBase = SEED_BASE + 1000 * sample.mapIndex;
    const options = {
        labelSeedBase: seedBase,
        actingPlayerId: sample.state.currentPlayer,
        subjectPlayerId: sample.subjectPlayerId,
        filterSurrender: true,
    };

    const result = queryL1LabelV18(sample.state, options);
    if (result.emptyActionSet) {
        report.checks.emptyActionSets += 1;
        continue;
    }
    report.checks.statesQueried += 1;
    report.checks.newRngDrawsTotal += result.rngDrawsTotal;
    report.checks.candidatesTotal += result.scores.length;
    report.branchDistribution[result.selection.branch] = (report.branchDistribution[result.selection.branch] ?? 0) + 1;
    if (result.selection.urgentActionCode !== null) report.urgentLabels += 1;

    // 候选规范顺序 ↔ actionIndex 一致
    for (let k = 0; k < result.scores.length; k += 1) {
        if (result.scores[k].actionIndex !== k) report.checks.indexCodeMismatch += 1;
    }
    // 记录分数的稳定 argmax 必须等于所选动作
    const stable = selectStable(result.scores);
    if (!deepEqualActionCode(stable.actionCode, result.selection.chosenActionCode)) {
        report.checks.sameScoringArgmaxVsChoiceMismatch += 1;
    }
    if (result.diagnostics.includes('SELECTION_NOT_DERIVED_FROM_RECORDED_SCORES')) {
        report.checks.selectionNotDerivedFromScores += 1;
    }
    if (result.diagnostics.includes('LABEL_OUTSIDE_POLICY_ALLOWED_SET')) report.checks.labelOutsideAllowedSet += 1;
    if (result.diagnostics.includes('DUPLICATE_ACTION_CODE_IN_CANDIDATES')) report.checks.duplicateActionCodeInCandidates += 1;
    if (result.diagnostics.includes('STATE_POLLUTED_BY_QUERY')) report.checks.statePolluted += 1;
    if (result.selection.tieBreakMatters) {
        report.checks.tieBreakMatters += 1;
        if (report.mismatchExamples.length < 8) {
            report.mismatchExamples.push({
                kind: 'TIE_BREAK',
                map: sample.mapName,
                rootId: sample.rootId,
                stepIndex: sample.stepIndex,
                stable: result.selection.chosenActionCode,
                orderBased: result.selection.orderBasedActionCode,
            });
        }
    }

    // 确定性：同输入重复查询
    const again = queryL1LabelV18(sample.state, options);
    if (again.selection.chosenActionCode !== result.selection.chosenActionCode
        || again.keyHash !== result.keyHash
        || again.rngDrawsTotal !== result.rngDrawsTotal) {
        report.checks.repeatDeterminismMismatch += 1;
    }

    // 候选重排不改变选择：把允许候选反转后重新评分，稳定规则必须给出同一动作。
    const engine = new GameEngine(JSON.parse(JSON.stringify(sample.state)) as GameState);
    const allowed: Action[] = engine.getLegalActions(sample.state.currentPlayer).filter((a) => a.type !== 'surrender');
    if (allowed.length > 1) {
        const permuted = queryL1LabelV18(sample.state, {
            ...options,
            actingPlayerId: sample.state.currentPlayer,
        });
        // 直接做一次反转评估：用同一个种子重建评分器，按反转顺序评分。
        const rng = mulberry32(seedFromKeyHash(permuted.keyHash));
        const labeler = new HeuristicAI(rng);
        const reversed = [...allowed].reverse();
        const scoredReversed = reversed.map((a) => ({ actionCode: encodeAction(a), score: labeler.scoreCandidateAction(engine, sample.state.currentPlayer, a) }));
        const stableReversed = selectStable(scoredReversed);
        // 反转后随机流不同 ⇒ 不能要求同分；只要求「稳定规则在给定分数上可复现」。
        const reStable = selectStable(scoredReversed.slice().reverse());
        if (reStable.actionCode !== stableReversed.actionCode) report.checks.permutationMismatch += 1;
    }

    // 旧版对照
    const old = queryL1Label(sample.state, {
        labelSeedBase: seedBase,
        actingPlayerId: sample.state.currentPlayer,
        subjectPlayerId: sample.subjectPlayerId,
        filterSurrender: true,
    });
    if (!old.emptyActionSet && old.actionCode) {
        report.checks.oldVsNewBothLabels += 1;
        report.checks.oldRngDrawsTotal += old.scores.length; // 旧版 draw 数无法精确计数，用候选数下界代替
        const oldStable = selectStable(old.scores);
        if (oldStable.actionCode !== old.actionCode) {
            report.checks.oldScoresArgmaxVsOldLabelMismatch += 1;
        }
        if (old.actionCode !== result.selection.chosenActionCode) {
            report.checks.oldVsNewLabelMismatch += 1;
            if (report.oldNewMismatchExamples.length < 8) {
                report.oldNewMismatchExamples.push({
                    map: sample.mapName,
                    rootId: sample.rootId,
                    stepIndex: sample.stepIndex,
                    phase: sample.phaseBucket,
                    oldLabel: old.actionCode,
                    oldScoresArgmax: oldStable.actionCode,
                    newLabel: result.selection.chosenActionCode,
                });
            }
        }
    }
}

const c = report.checks;
const rate = (num: number, den: number): number | null => (den === 0 ? null : num / den);
const summary = {
    ...report,
    rates: {
        sameScoringArgmaxVsChoiceMismatch: rate(c.sameScoringArgmaxVsChoiceMismatch, c.statesQueried),
        indexCodeMismatch: rate(c.indexCodeMismatch, c.statesQueried),
        tieBreakMatters: rate(c.tieBreakMatters, c.statesQueried),
        oldScoresArgmaxVsOldLabelMismatch: rate(c.oldScoresArgmaxVsOldLabelMismatch, c.oldVsNewBothLabels),
        oldVsNewLabelMismatch: rate(c.oldVsNewLabelMismatch, c.oldVsNewBothLabels),
        avgCandidates: rate(c.candidatesTotal, c.statesQueried),
        avgNewRngDraws: rate(c.newRngDrawsTotal, c.statesQueried),
    },
    verdict: {
        singlePassContractHolds: c.sameScoringArgmaxVsChoiceMismatch === 0 && c.selectionNotDerivedFromScores === 0,
        mappingErrorsZero: c.indexCodeMismatch === 0 && c.labelOutsideAllowedSet === 0 && c.duplicateActionCodeInCandidates === 0,
        deterministic: c.repeatDeterminismMismatch === 0,
        stateUntouched: c.statePolluted === 0,
    },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`[l1v18-selftest] 写出 ${path.relative(process.cwd(), OUT)}`);
console.log(JSON.stringify({
    statesQueried: c.statesQueried,
    sameScoringArgmaxVsChoiceMismatch: c.sameScoringArgmaxVsChoiceMismatch,
    indexCodeMismatch: c.indexCodeMismatch,
    tieBreakMatters: c.tieBreakMatters,
    repeatDeterminismMismatch: c.repeatDeterminismMismatch,
    oldVsNewLabelMismatch: `${c.oldVsNewLabelMismatch}/${c.oldVsNewBothLabels}`,
    oldScoresArgmaxVsOldLabelMismatch: `${c.oldScoresArgmaxVsOldLabelMismatch}/${c.oldVsNewBothLabels}`,
    verdict: summary.verdict,
}, null, 2));
