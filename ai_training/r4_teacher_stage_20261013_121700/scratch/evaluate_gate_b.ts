import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RootRolloutSearchTeacher } from '../research/search_teacher';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy, MatchRecord } from '../research/match_runner';
import { runPairedArena, evaluateTacticalSuite, ArenaSummary } from '../research/evaluate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GateBVerdict {
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
    };
    vsHeuristicSummary: ArenaSummary;
    vsApkLikeSummary: ArenaSummary;
    tacticalSuiteResults: any;
    failedReplaysSavedCount: number;
    failureCategoryStats: {
        candidate_miss: number;
        perspective_error: number;
        phase_mismatch: number;
        leaf_evaluation: number;
        throughput_timeout: number;
        endgame_loop: number;
        rule_protocol: number;
    };
    recommendation: string;
}

async function runGateB(pairsPerMapVsH: number = 10, pairsPerMapVsApk: number = 10) {
    console.log(`=== [GATE B] 启动正式教师资格验证 (vs H: ${pairsPerMapVsH * 2} pairs, vs Apk: ${pairsPerMapVsApk * 2} pairs) ===`);

    const devMaps = ['(2) Icy Paths.aem', '(2) The Crossing.aem'];
    const suitePath = path.resolve(__dirname, '../eval/tactical_suite.json');

    // 冻结教师（K=4，完整回应，双策略对抗，完整建筑与军力估值）
    const teacher = new RootRolloutSearchTeacher('root_rollout_teacher_v1', {
        targetK: 4,
        useFullResponse: true,
        opponentPolicies: ['heuristic', 'apk_like']
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
        maxAtomicActions: 1000,
        maxHandoffs: 80,
        maxEpisodeWallSeconds: 300
    };

    // 1. 战术题套件评估
    console.log('>>> 正在进行 44 道战术题严格验收...');
    const tacticalResults = await evaluateTacticalSuite(teacher, suitePath);
    console.log(`战术题验收题解决率: ${(tacticalResults.acceptanceRate * 100).toFixed(1)}% (${tacticalResults.acceptanceSolved}/${tacticalResults.acceptanceCases})`);
    console.log(`战术题诊断题解决率: ${(tacticalResults.diagnosticRate * 100).toFixed(1)}% (${tacticalResults.diagnosticSolved}/${tacticalResults.diagnosticCases})`);

    // 2. 对战最强冻结基线 (HeuristicAI)
    console.log(`>>> 正在运行 Teacher vs Frozen Heuristic 配对对战 (${pairsPerMapVsH} 对/图 × 2 图 = ${pairsPerMapVsH * 2} 对 = ${pairsPerMapVsH * 4} 局)...`);
    const arenaH = await runPairedArena(teacher, policyH, devMaps, pairsPerMapVsH, matchConfig);

    console.log(`vs Heuristic 结果: Wins=${arenaH.summary.winsA}, Loss=${arenaH.summary.winsB}, Draws=${arenaH.summary.draws}, Truncations=${arenaH.summary.truncations}, Errors=${arenaH.summary.errors}`);
    console.log(`保守得分 (95% CI 下界): ${(arenaH.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaH.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaH.summary.ci95Upper * 100).toFixed(2)}%]`);

    // 3. 对战次级基线 (ApkLikeAI)
    console.log(`>>> 正在运行 Teacher vs Frozen ApkLike 配对对战 (${pairsPerMapVsApk} 对/图 × 2 图 = ${pairsPerMapVsApk * 2} 对 = ${pairsPerMapVsApk * 4} 局)...`);
    const arenaApk = await runPairedArena(teacher, policyApk, devMaps, pairsPerMapVsApk, matchConfig);

    console.log(`vs ApkLike 结果: Wins=${arenaApk.summary.winsA}, Loss=${arenaApk.summary.winsB}, Draws=${arenaApk.summary.draws}, Truncations=${arenaApk.summary.truncations}, Errors=${arenaApk.summary.errors}`);
    console.log(`保守得分 (95% CI 下界): ${(arenaApk.summary.conservativeScoreA * 100).toFixed(2)}%, 95% CI: [${(arenaApk.summary.ci95Lower * 100).toFixed(2)}%, ${(arenaApk.summary.ci95Upper * 100).toFixed(2)}%]`);

    // 4. 提取失败对局与归因分类
    const failureStats = {
        candidate_miss: 0,
        perspective_error: 0,
        phase_mismatch: 0,
        leaf_evaluation: 0,
        throughput_timeout: 0,
        endgame_loop: 0,
        rule_protocol: 0
    };

    const failedRecords: MatchRecord[] = [];
    const allRecords = [...arenaH.records, ...arenaApk.records];

    for (const rec of allRecords) {
        // Teacher 执黑或执白输掉的局，或发生异常的局
        const teacherSeat = rec.policies[0] === teacher.id ? 0 : 1;
        const opponentSeat = 1 - teacherSeat;

        if (rec.outcome.isNaturalTerminal && rec.outcome.winnerAlliance === opponentSeat) {
            failedRecords.push(rec);
            // 归因分析
            if (rec.steps.length > 300) {
                failureStats.leaf_evaluation++;
            } else {
                failureStats.candidate_miss++;
            }
        } else if (rec.outcome.terminationReason === 'truncated_repeated_state') {
            failedRecords.push(rec);
            failureStats.endgame_loop++;
        } else if (rec.outcome.isTruncated) {
            failedRecords.push(rec);
            failureStats.endgame_loop++;
        } else if (rec.outcome.isError) {
            failedRecords.push(rec);
            failureStats.rule_protocol++;
        }
    }

    // 保存代表性失败回放至 artifacts/failed_replays/
    const failDir = path.resolve(__dirname, '../artifacts/failed_replays');
    fs.mkdirSync(failDir, { recursive: true });
    const savedFailures: string[] = [];
    for (let i = 0; i < Math.min(10, failedRecords.length); i++) {
        const failRec = failedRecords[i];
        const failPath = path.join(failDir, `failure_${i + 1}.json`);
        fs.writeFileSync(failPath, JSON.stringify(failRec, null, 2), 'utf-8');
        savedFailures.push(failPath);
    }
    console.log(`保存了 ${savedFailures.length} 份代表性失败回放至 artifacts/failed_replays/`);

    // 5. 综合门槛审核 (Gate B Criteria)
    const conservativeScoreMin60 = arenaH.summary.conservativeScoreA >= 0.60;
    const ci95LowerMin50 = arenaH.summary.ci95Lower > 0.50;
    const truncationRateH = arenaH.summary.truncations / (arenaH.summary.totalGames || 1);
    const truncationMax10Pct = truncationRateH <= 0.10;
    const errorsZero = arenaH.summary.errors === 0 && arenaApk.summary.errors === 0;
    const noRegressionOnSecondary = arenaApk.summary.winRateA >= 0.50;
    const tacticalSuitePass = tacticalResults.acceptanceRate >= 0.80;

    let verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL' = 'FAIL';
    if (conservativeScoreMin60 && ci95LowerMin50 && truncationMax10Pct && errorsZero && noRegressionOnSecondary && tacticalSuitePass) {
        verdict = 'PASS';
    } else {
        verdict = 'FAIL';
    }

    const recommendation = verdict === 'PASS'
        ? '搜索教师在冻结规则下展现出超越规则基线的显著优势，具备进入 T07 数据生产和学生训练阶段的资格！'
        : `搜索教师未能满足 Gate B 全部严苛门槛。主要问题：保守得分=${(arenaH.summary.conservativeScoreA * 100).toFixed(1)}%（门槛≥60%），CI95下界=${(arenaH.summary.ci95Lower * 100).toFixed(1)}%（门槛>50%），截断率=${(truncationRateH * 100).toFixed(1)}%（门槛≤10%）。依据任务书硬性边界，不具备进入大规模数据生产与学生训练资格，严禁“碰运气”启动学生模型训练！`;

    const verdictPayload: GateBVerdict = {
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
            tacticalSuitePass
        },
        vsHeuristicSummary: arenaH.summary,
        vsApkLikeSummary: arenaApk.summary,
        tacticalSuiteResults: tacticalResults,
        failedReplaysSavedCount: savedFailures.length,
        failureCategoryStats: failureStats,
        recommendation
    };

    const outDir = path.resolve(__dirname, '../artifacts');
    fs.writeFileSync(path.join(outDir, 'gate_b_verdict.json'), JSON.stringify(verdictPayload, null, 2), 'utf-8');
    console.log(`Gate B 裁决已保存至: ${path.join(outDir, 'gate_b_verdict.json')}`);
    console.log(`最终裁定: [${verdict}]`);
}

runGateB(5, 5); // 初始各 5 对/图 = 10 对 = 20 局，共 40 局真实配对验证
