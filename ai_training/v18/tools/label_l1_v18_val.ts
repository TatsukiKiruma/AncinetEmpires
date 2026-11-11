/**
 * V18/T18-01：用新版单次评分 L1 标签器给**冻结验证状态**打标签。
 *
 * 关键设计：
 * - 输入是冻结的 rollout 行（含完整 `stateJson`），输出只写 `v18/out/<runId>/`。
 * - `labelSeedBase` 默认取 `2610800000`，与 V17 编码新 val 时使用的种子域相同，
 *   这样「V15 旧标签 vs V18 新标签」的差异**只来自标签器版本与评分合同**，
 *   而不是种子域变化。这是一次干净的工程缺陷对照。
 * - 同时记录旧版（`L1_heuristic_isolated_v15_1`）标签，便于量化双次评分的影响；
 *   旧标签明确标为 `LEGACY`，不进入 v18 训练目标。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/label_l1_v18_val.ts \
 *     --rollouts <rollouts.jsonl> --out <labels.jsonl> [--shard 0/4] [--limit N]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GameState } from '../../src/game/types';
import { queryL1Label } from '../../v15/tools/labeler_l1_v15';
import {
    L1_LABELER_VERSION_V18,
    L1_V18_JITTER_CONTRACT,
    L1_V18_SELECTION_CONTRACT,
    queryL1LabelV18,
    selectStable,
} from './labeler_l1_v18';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROLLOUTS = path.resolve(arg('--rollouts', null) as string);
const OUT = path.resolve(arg('--out', null) as string);
const SEED_BASE = Number(arg('--label-seed-base', '2610800000'));
const SHARD = arg('--shard', null);
const LIMIT = arg('--limit', null) === null ? null : Number(arg('--limit', null));
const RESUME = arg('--resume', 'true') !== 'false';
/** 旧版对照很贵（旧标签器每个候选都要 clone+step）。默认关闭，只在量化工程缺陷时打开。 */
const WITH_LEGACY = arg('--with-legacy', 'false') === 'true';

if (!ROLLOUTS || !OUT) throw new Error('[v18 L1 label] 必须给 --rollouts 与 --out。');

let shardIndex = 0;
let shardCount = 1;
if (SHARD !== null) {
    const parts = SHARD.split('/').map(Number);
    shardIndex = parts[0];
    shardCount = parts[1];
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const done = new Set<string>();
if (RESUME && fs.existsSync(OUT)) {
    for (const line of fs.readFileSync(OUT, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        done.add(String((JSON.parse(line) as Record<string, unknown>).stateKey));
    }
}
const stream = fs.createWriteStream(OUT, { flags: 'a' });

const stats = {
    schema: 'v18_l1_label_summary_1',
    labelerVersion: L1_LABELER_VERSION_V18,
    legacyLabelerVersion: 'L1_heuristic_isolated_v15_1',
    selectionContractId: L1_V18_SELECTION_CONTRACT,
    jitterContractId: L1_V18_JITTER_CONTRACT,
    labelSeedBase: SEED_BASE,
    rollouts: path.relative(process.cwd(), ROLLOUTS).replace(/\\/g, '/'),
    rawRows: 0,
    writtenRows: 0,
    skippedResume: 0,
    emptyActionSets: 0,
    terminalRows: 0,
    malformedRows: 0,
    sameScoringArgmaxVsChoiceMismatch: 0,
    selectionNotDerivedFromScores: 0,
    labelOutsideAllowedSet: 0,
    duplicateActionCode: 0,
    statePolluted: 0,
    tieBreakMatters: 0,
    legacyLabelPresent: 0,
    legacyVsNewMismatch: 0,
    legacyScoresArgmaxVsLegacyLabelMismatch: 0,
    branchDistribution: {} as Record<string, number>,
    actionTypeDistribution: {} as Record<string, number>,
    phaseCoverage: {} as Record<string, number>,
    mapCoverage: {} as Record<string, number>,
    diagnostics: [] as string[],
};

const lines = fs.readFileSync(ROLLOUTS, 'utf8').split(/\r?\n/);
let index = 0;
let written = 0;
for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const rowIndex = index;
    index += 1;
    if (rowIndex % shardCount !== shardIndex) continue;
    if (LIMIT !== null && written >= LIMIT) break;

    let row: Record<string, unknown>;
    try {
        row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        stats.malformedRows += 1;
        continue;
    }
    stats.rawRows += 1;

    const stateJson = row.stateJson as string | undefined;
    if (!stateJson) {
        stats.malformedRows += 1;
        continue;
    }
    const state = JSON.parse(stateJson) as GameState;
    const actingPlayerId = Number(row.subjectPlayerId ?? state.currentPlayer);
    const stateKey = `${String(row.stateHash)}|${actingPlayerId}`;
    if (done.has(stateKey)) {
        stats.skippedResume += 1;
        continue;
    }

    const options = {
        labelSeedBase: SEED_BASE,
        actingPlayerId,
        subjectPlayerId: actingPlayerId,
        filterSurrender: true,
    };
    const result = queryL1LabelV18(state, options);

    const record: Record<string, unknown> = {
        schema: 'v18_l1_label_1',
        stateKey,
        stateHash: String(row.stateHash),
        gameId: row.gameId ?? null,
        rootId: row.rootId ?? null,
        rootFamilyId: row.rootFamilyId ?? null,
        trueFamilyId: row.trueFamilyId ?? null,
        mapName: row.mapName ?? null,
        mapIndex: row.mapIndex ?? null,
        phaseBucket: row.phaseBucket ?? null,
        completedPlayerTurns: row.completedPlayerTurns ?? null,
        stepIndex: row.stepIndex ?? null,
        turn: row.turn ?? null,
        subjectPlayerId: row.subjectPlayerId ?? null,
        subjectSeat: row.subjectSeat ?? null,
        subjectAllianceId: row.subjectAllianceId ?? null,
        sourcePolicy: row.sourcePolicy ?? null,
        split: row.split ?? null,
        behaviorActionCode: row.behaviorActionCode ?? null,
        // ==== V18 目标合同（单次评分）====
        targetPolicyId: 'L1',
        targetVersion: L1_LABELER_VERSION_V18,
        targetActionCode: result.selection.chosenActionCode,
        targetActionIndex: result.selection.chosenActionIndex,
        labelEvidenceKind: 'HEURISTIC_SINGLE_PASS_ARGMAX',
        selectionContractId: result.selectionContractId,
        jitterContractId: result.jitterContractId,
        candidateOrderingId: 'actionCode-codepoint-asc-v1',
        candidateCount: result.scores.length,
        policyAllowedActionCodes: result.policyAllowedActionCodes,
        engineLegalActionCodes: result.engineLegalActionCodes,
        scores: result.scores.map((item) => ({ actionCode: item.actionCode, score: item.score, actionIndex: item.actionIndex })),
        rngDrawsTotal: result.rngDrawsTotal,
        keyHash: result.keyHash,
        seed: result.seed,
        selectionBranch: result.selection.branch,
        urgentActionCode: result.selection.urgentActionCode,
        orderBasedActionCode: result.selection.orderBasedActionCode,
        tieBreakMatters: result.selection.tieBreakMatters,
        emptyActionSet: result.emptyActionSet,
        stateUnchanged: result.stateUnchanged,
        diagnostics: result.diagnostics,
    };

    // ==== 旧版标签（仅对照，明确标 LEGACY）====
    if (WITH_LEGACY) {
        const legacy = queryL1Label(state, options);
        if (!legacy.emptyActionSet && legacy.actionCode) {
            const legacyStable = selectStable(legacy.scores);
            record.legacyTarget = {
                targetPolicyId: 'L1',
                targetVersion: legacy.labelerVersion,
                targetActionCode: legacy.actionCode,
                labelEvidenceKind: 'LEGACY_DOUBLE_SCORING',
                scoresArgmaxByStableRule: legacyStable.actionCode,
                scoresArgmaxAgreesWithLabel: legacyStable.actionCode === legacy.actionCode,
            };
            stats.legacyLabelPresent += 1;
            if (legacyStable.actionCode !== legacy.actionCode) stats.legacyScoresArgmaxVsLegacyLabelMismatch += 1;
            if (legacy.actionCode !== result.selection.chosenActionCode) stats.legacyVsNewMismatch += 1;
        }
    }

    stream.write(`${JSON.stringify(record)}\n`);
    written += 1;
    stats.writtenRows += 1;

    if (result.emptyActionSet) stats.emptyActionSets += 1;
    if (result.diagnostics.includes('SELECTION_NOT_DERIVED_FROM_RECORDED_SCORES')) stats.selectionNotDerivedFromScores += 1;
    if (result.diagnostics.includes('LABEL_OUTSIDE_POLICY_ALLOWED_SET')) stats.labelOutsideAllowedSet += 1;
    if (result.diagnostics.includes('DUPLICATE_ACTION_CODE_IN_CANDIDATES')) stats.duplicateActionCode += 1;
    if (result.diagnostics.includes('STATE_POLLUTED_BY_QUERY')) stats.statePolluted += 1;
    if (result.selection.tieBreakMatters) stats.tieBreakMatters += 1;
    const expected = result.emptyActionSet
        ? 'end_turn'
        : result.selection.branch === 'URGENT'
            ? selectStable(result.scores.filter((s) => s.score >= 50000)).actionCode
            : selectStable(result.scores).actionCode;
    if (expected !== result.selection.chosenActionCode) stats.sameScoringArgmaxVsChoiceMismatch += 1;
    stats.branchDistribution[result.selection.branch] = (stats.branchDistribution[result.selection.branch] ?? 0) + 1;
    const actionType = result.selection.chosenActionCode.split(':')[0];
    stats.actionTypeDistribution[actionType] = (stats.actionTypeDistribution[actionType] ?? 0) + 1;
    const phase = String(row.phaseBucket ?? 'unknown');
    stats.phaseCoverage[phase] = (stats.phaseCoverage[phase] ?? 0) + 1;
    const mapName = String(row.mapName ?? 'unknown');
    stats.mapCoverage[mapName] = (stats.mapCoverage[mapName] ?? 0) + 1;
}

stream.end();
stats.writtenRows = written;
const summaryPath = OUT.replace(/\.jsonl$/, '.summary.json');
fs.writeFileSync(summaryPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    wrote: path.relative(process.cwd(), OUT).replace(/\\/g, '/'),
    summary: path.relative(process.cwd(), summaryPath).replace(/\\/g, '/'),
    writtenRows: stats.writtenRows,
    emptyActionSets: stats.emptyActionSets,
    sameScoringArgmaxVsChoiceMismatch: stats.sameScoringArgmaxVsChoiceMismatch,
    legacyVsNewMismatch: `${stats.legacyVsNewMismatch}/${stats.legacyLabelPresent}`,
    legacyInternalMismatch: `${stats.legacyScoresArgmaxVsLegacyLabelMismatch}/${stats.legacyLabelPresent}`,
    branchDistribution: stats.branchDistribution,
}, null, 2));
