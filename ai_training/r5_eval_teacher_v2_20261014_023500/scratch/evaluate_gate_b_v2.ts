import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SearchTeacherV2 } from '../research/search_teacher_v2';
import { ABLATION_CONFIGS_EVALUATOR } from '../research/state_evaluator_v2';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy, MatchRecord } from '../research/match_runner';
import { runPairedArena, evaluateTacticalSuite, ArenaSummary } from '../research/evaluate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GateBVerdictV2 {
    timestamp: string;
    rulesRevision: string;
    targetBaseline: string;
    secondaryBaseline: string;
    teacherConfig: any;
    qualificationVerdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL';
    gateBCriteria: {
        conservativeScoreMin60: boolean;
        ci95LowerMin50: boolean;
        truncationMax10Pct: boolean;
        errorsZero: boolean;
        noRegressionOnSecondary: boolean;
        tacticalSuitePass: boolean;
        oldTacticalSuitePass: boolean;
    };
    vsHeuristicSummary: ArenaSummary;
    vsApkLikeSummary: ArenaSummary;
    tacticalSuiteResultsV2: any;
    tacticalSuiteResultsOld: any;
    failedReplaysSavedCount: number;
    failureCategoryStats: {
        natural_losses: number;
        endgame_loop_repeated: number;
        ply_limit_exhausted: number;
        step_limit_exhausted: number;
        wall_clock_timeout: number;
        rule_protocol_error: number;
    };
    recommendation: string;
}

async function runGateB(pairsPerMapVsH: number = 5, pairsPerMapVsApk: number = 5) {
    console.log(`=== [GATE B] 启动正式教师资格复验 (vs H: ${pairsPerMapVsH * 2} pairs, vs Apk: ${pairsPerMapVsApk * 2} pairs) ===`);

    const devMaps = ['(2) Icy Paths.aem', '(2) The Crossing.aem'];
    const pOldSuite = path.resolve(__dirname, '../eval/tactical_suite_original.json');
    const pNewSuite = path.resolve(__dirname, '../eval/tactical_suite_v2.json');

    // 冻结候选教师 frozen_teacher_v2 (支持轻量控图地缘估值)
    const teacher = new SearchTeacherV2('frozen_teacher_v2', {
        targetK: 4,
        useFullResponse: true,
        opponentPolicies: ['heuristic', 'apk_like'],
        evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.c_territory_only
    });

    const hAI = new HeuristicAI();
    const policyH: Policy = {
        id: 'frozen_heuristic',
        chooseAction: (ctx) => {
            const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
            return act ? encodeAction(act) : ctx.candidateCodes[0];
        }
    };

    const apkAI = new ApkLikeAI();
    const policyApk: Policy = {
        id: 'frozen_apklike',
        chooseAction: (ctx) => {
            const act = apkAI.getAction(ctx.engineClone, ctx.observerPlayerId);
            return act ? encodeAction(act) : ctx.candidateCodes[0];
        }
    };

    const matchConfig = {
        maxAtomicActions: 800,
        maxHandoffs: 60,
        maxEpisodeWallSeconds: 150
    };

    // 1. 战术题套件评估 (同时核验旧题库与新修订题库)
    console.log('>>> 正在进行战术题严格验收 (旧题库 44 题 & 新题库 54 题)...');
    const tacResultsOld = await evaluateTacticalSuite(teacher, pOldSuite);
    console.log(`[旧题库] 验收题解决率: ${(tacResultsOld.acceptanceRate * 100).toFixed(1)}% (${tacResultsOld.acceptanceSolved}/${tacResultsOld.acceptanceCases})`);
    console.log(`[旧题库] 诊断题解决率: ${(tacResultsOld.diagnosticRate * 100).toFixed(1)}% (${tacResultsOld.diagnosticSolved}/${tacResultsOld.diagnosticCases})`);

    const tacResultsNew = await evaluateTacticalSuite(teacher, pNewSuite);
    console.log(`[新题库] 验收题解决率: ${(tacResultsNew.acceptanceRate * 100).toFixed(1)}% (${tacResultsNew.acceptanceSolved}/${tacResultsNew.acceptanceCases})`);
    console.log(`[新题库] 诊断题解决率: ${(tacResultsNew.diagnosticRate * 100).toFixed(1)}% (${tacResultsNew.diagnosticSolved}/${tacResultsNew.diagnosticCases})`);

    // 2. 对战最强冻结基线 (HeuristicAI)
    console.log(`\n>>> 正在运行 Teacher vs Frozen Heuristic 配对对战 (${pairsPerMapVsH} 对/图 × 2 图 = ${pairsPerMapVsH * 2} 对 = ${pairsPerMapVsH * 4} 局)...`);
    const arenaH = await runPairedArena(teacher, policyH, devMaps, pairsPerMapVsH, matchConfig, 1000);

    console.log(`vs Heuristic 结果: Wins=${arenaH.summary.winsA}, Loss=${arenaH.summary.winsB}, Draws=${arenaH.summary.draws}, Truncations=${arenaH.summary.truncations}, Errors=${arenaH.summary.errors}`);
    console.log(`保守得分 (95% CI 下界): ${(arenaH.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaH.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaH.summary.ci95Upper * 100).toFixed(2)}%]`);
    console.log(`截断分布: 重复状态=${arenaH.summary.truncationBreakdown.repeatedState}, 换手上限=${arenaH.summary.truncationBreakdown.plyLimit}, 步数上限=${arenaH.summary.truncationBreakdown.stepLimit}, 墙钟超时=${arenaH.summary.truncationBreakdown.wallSeconds}`);

    // 3. 对战次级基线 (ApkLikeAI)
    console.log(`\n>>> 正在运行 Teacher vs Frozen ApkLike 配对对战 (${pairsPerMapVsApk} 对/图 × 2 图 = ${pairsPerMapVsApk * 2} 对 = ${pairsPerMapVsApk * 4} 局)...`);
    const arenaApk = await runPairedArena(teacher, policyApk, devMaps, pairsPerMapVsApk, matchConfig, 2000);

    console.log(`vs ApkLike 结果: Wins=${arenaApk.summary.winsA}, Loss=${arenaApk.summary.winsB}, Draws=${arenaApk.summary.draws}, Truncations=${arenaApk.summary.truncations}, Errors=${arenaApk.summary.errors}`);
    console.log(`保守得分 (95% CI 下界): ${(arenaApk.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaApk.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaApk.summary.ci95Upper * 100).toFixed(2)}%]`);
    console.log(`截断分布: 重复状态=${arenaApk.summary.truncationBreakdown.repeatedState}, 换手上限=${arenaApk.summary.truncationBreakdown.plyLimit}, 步数上限=${arenaApk.summary.truncationBreakdown.stepLimit}, 墙钟超时=${arenaApk.summary.truncationBreakdown.wallSeconds}`);

    // 4. 精细归因统计与失败样本归档
    const failureStats = {
        natural_losses: 0,
        endgame_loop_repeated: 0,
        ply_limit_exhausted: 0,
        step_limit_exhausted: 0,
        wall_clock_timeout: 0,
        rule_protocol_error: 0
    };

    const failedRecords: MatchRecord[] = [];
    const allRecords = [...arenaH.records, ...arenaApk.records];

    for (const rec of allRecords) {
        const teacherSeat = rec.policies[0] === teacher.id ? 0 : 1;
        const opponentSeat = 1 - teacherSeat;

        if (rec.outcome.isNaturalTerminal && rec.outcome.winnerAlliance === opponentSeat) {
            failedRecords.push(rec);
            failureStats.natural_losses++;
        } else if (rec.outcome.terminationReason === 'truncated_repeated_state') {
            failedRecords.push(rec);
            failureStats.endgame_loop_repeated++;
        } else if (rec.outcome.terminationReason === 'truncated_ply_limit') {
            failedRecords.push(rec);
            failureStats.ply_limit_exhausted++;
        } else if (rec.outcome.terminationReason === 'truncated_step_limit') {
            failedRecords.push(rec);
            failureStats.step_limit_exhausted++;
        } else if (rec.outcome.terminationReason === 'truncated_wall_seconds') {
            failedRecords.push(rec);
            failureStats.wall_clock_timeout++;
        } else if (rec.outcome.isError) {
            failedRecords.push(rec);
            failureStats.rule_protocol_error++;
        }
    }

    const failDir = path.resolve(__dirname, '../artifacts/failed_replays');
    fs.mkdirSync(failDir, { recursive: true });
    const savedFailures: string[] = [];
    for (let i = 0; i < Math.min(10, failedRecords.length); i++) {
        const failRec = failedRecords[i];
        const failPath = path.join(failDir, `gate_b_failure_${i + 1}.json`);
        fs.writeFileSync(failPath, JSON.stringify(failRec, null, 2), 'utf-8');
        savedFailures.push(failPath);
    }
    console.log(`保存了 ${savedFailures.length} 份代表性失败/截断回放至 artifacts/failed_replays/`);

    // 5. 严格门槛审核 (Gate B Criteria)
    const conservativeScoreMin60 = arenaH.summary.conservativeScoreA >= 0.60;
    const ci95LowerMin50 = arenaH.summary.ci95Lower > 0.50;
    const truncationRateH = arenaH.summary.truncations / (arenaH.summary.totalGames || 1);
    const truncationMax10Pct = truncationRateH <= 0.10;
    const errorsZero = arenaH.summary.errors === 0 && arenaApk.summary.errors === 0;
    const noRegressionOnSecondary = arenaApk.summary.winRateA >= 0.50;
    const tacticalSuitePass = tacResultsNew.acceptanceRate >= 0.80;
    const oldTacticalSuitePass = tacResultsOld.acceptanceSolved >= 26; // 32 题口径需至少 26 题 (81.25%)

    let verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL' = 'FAIL';
    if (conservativeScoreMin60 && ci95LowerMin50 && truncationMax10Pct && errorsZero && noRegressionOnSecondary && tacticalSuitePass && oldTacticalSuitePass) {
        verdict = 'PASS';
    } else {
        verdict = 'FAIL';
    }

    const recommendation = verdict === 'PASS'
        ? '搜索教师在冻结规则下展现出超越规则基线的显著优势，具备进入下一阶段数据生产和学生蒸馏的准入资格！'
        : `Gate B 资格复验明确判定为 [FAIL]！核心原因：对最强基线保守得分=${(arenaH.summary.conservativeScoreA * 100).toFixed(1)}%（门槛>=60%），CI95下界=${(arenaH.summary.ci95Lower * 100).toFixed(1)}%（门槛>50%），截断率=${(truncationRateH * 100).toFixed(1)}%（门槛<=10%），旧 32 题验收通过数=${tacResultsOld.acceptanceSolved}/32（门槛>=26题）。依据任务书硬性边界，严禁进入学生网络蒸馏或大规模数据生产！`;

    const verdictPayload: GateBVerdictV2 = {
        timestamp: new Date().toISOString(),
        rulesRevision: 'apk-4.2.5.1-rules-20261013-r4',
        targetBaseline: 'frozen_heuristic',
        secondaryBaseline: 'frozen_apklike',
        teacherConfig: teacher['config'],
        qualificationVerdict: verdict,
        gateBCriteria: {
            conservativeScoreMin60,
            ci95LowerMin50,
            truncationMax10Pct,
            errorsZero,
            noRegressionOnSecondary,
            tacticalSuitePass,
            oldTacticalSuitePass
        },
        vsHeuristicSummary: arenaH.summary,
        vsApkLikeSummary: arenaApk.summary,
        tacticalSuiteResultsV2: tacResultsNew,
        tacticalSuiteResultsOld: tacResultsOld,
        failedReplaysSavedCount: savedFailures.length,
        failureCategoryStats: failureStats,
        recommendation
    };

    const outDir = path.resolve(__dirname, '../artifacts');
    const verdictFile = path.join(outDir, 'gate_b_verdict.json');
    fs.writeFileSync(verdictFile, JSON.stringify(verdictPayload, null, 2), 'utf-8');
    console.log(`Gate B 裁决已保存至: ${verdictFile}`);
    console.log(`最终裁定: [${verdict}]`);
}

runGateB(5, 5); // 各 5 对/图 = 10 对 = 20 局/对手，共 40 局严格复验
