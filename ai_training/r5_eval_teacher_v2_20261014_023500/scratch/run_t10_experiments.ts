import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CorrectedSearchTeacherV1 } from '../research/search_teacher_v1';
import { SearchTeacherV2 } from '../research/search_teacher_v2';
import { ABLATION_CONFIGS_EVALUATOR } from '../research/state_evaluator_v2';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy } from '../research/match_runner';
import { runPairedArena, evaluateTacticalSuite } from '../research/evaluate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runT10Experiments() {
    console.log('=== [T10] 启动 Teacher v2 单变量改进与消融实验 ===');
    const devMaps = ['(2) Icy Paths.aem', '(2) The Crossing.aem'];
    const pOldSuite = path.resolve(__dirname, '../eval/tactical_suite_original.json');
    const pNewSuite = path.resolve(__dirname, '../eval/tactical_suite_v2.json');

    const hAI = new HeuristicAI();
    const policyH: Policy = {
        id: 'frozen_heuristic',
        chooseAction: (ctx) => {
            const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
            return act ? encodeAction(act) : ctx.candidateCodes[0];
        }
    };

    const matchConfig = {
        maxAtomicActions: 500,
        maxHandoffs: 40,
        maxEpisodeWallSeconds: 120
    };

    // 定义 6 组对比实验变体：
    const variants: Array<{
        name: string;
        tag: string;
        teacher: any;
    }> = [
        {
            name: '修复版基准 v1 (对照组)',
            tag: 'v1_corrected_control',
            teacher: new CorrectedSearchTeacherV1('v1_corrected_control', { targetK: 4 })
        },
        {
            name: '变体 A: 候选精简覆盖 (K=3)',
            tag: 'v2_varA_k3',
            teacher: new CorrectedSearchTeacherV1('v2_varA_k3', { targetK: 3 })
        },
        {
            name: '变体 B: 目标推进估值 (真实地形通行成本+控险)',
            tag: 'v2_varB_push_only',
            teacher: new SearchTeacherV2('v2_varB_push_only', {
                targetK: 4,
                evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.b_push_only
            })
        },
        {
            name: '变体 C: 控图地缘估值',
            tag: 'v2_varC_territory_only',
            teacher: new SearchTeacherV2('v2_varC_territory_only', {
                targetK: 4,
                evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.c_territory_only
            })
        },
        {
            name: '变体 D: 2 轮对抗换手推演',
            tag: 'v2_varD_depth2',
            teacher: new SearchTeacherV2('v2_varD_depth2', {
                targetK: 3,
                multiHandoffDepth: 2,
                maxSimulationSteps: 60
            })
        },
        {
            name: '变体 E: 综合改进 Teacher v2 (推进+控图+精选候选)',
            tag: 'v2_combined_final',
            teacher: new SearchTeacherV2('v2_combined_final', {
                targetK: 4,
                evaluatorWeights: ABLATION_CONFIGS_EVALUATOR.combined_push_territory
            })
        }
    ];

    const results: any[] = [];

    for (const v of variants) {
        console.log(`\n--------------------------------------------------`);
        console.log(`>>> 正在评估: [${v.name}] (${v.tag})`);
        const startTime = Date.now();

        // 1. 战术题评估 (新题库 54 题)
        const tacRes = await evaluateTacticalSuite(v.teacher, pNewSuite);
        console.log(`  战术验收题解决率: ${(tacRes.acceptanceRate * 100).toFixed(1)}% (${tacRes.acceptanceSolved}/${tacRes.acceptanceCases})`);

        // 2. 配对 Arena Pilot (对战 Heuristic, 2 地图 × 1 对 = 2 对 = 4 局)
        const arenaRes = await runPairedArena(v.teacher, policyH, devMaps, 1, matchConfig);
        const summ = arenaRes.summary;

        console.log(`  Pilot vs Heuristic: 胜=${summ.winsA}, 负=${summ.winsB}, 平=${summ.draws}, 截断=${summ.truncations}`);
        console.log(`  截断详情: 重复状态=${summ.truncationBreakdown.repeatedState}, 换手上限=${summ.truncationBreakdown.plyLimit}, 步数上限=${summ.truncationBreakdown.stepLimit}`);
        console.log(`  配对均分: ${(summ.pairMeanScoreA * 100).toFixed(1)}%, 保守得分: ${(summ.conservativeScoreA * 100).toFixed(1)}%`);

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`  耗时: ${elapsed.toFixed(1)}s`);

        results.push({
            name: v.name,
            tag: v.tag,
            tacticalAcceptanceRate: tacRes.acceptanceRate,
            tacticalAcceptanceSolved: tacRes.acceptanceSolved,
            tacticalDiagnosticRate: tacRes.diagnosticRate,
            tacticalDiagnosticSolved: tacRes.diagnosticSolved,
            arenaPilot: {
                totalGames: summ.totalGames,
                winsA: summ.winsA,
                winsB: summ.winsB,
                draws: summ.draws,
                truncations: summ.truncations,
                truncationBreakdown: summ.truncationBreakdown,
                pairMeanScoreA: summ.pairMeanScoreA,
                conservativeScoreA: summ.conservativeScoreA,
                uniqueTrajectories: summ.uniqueTrajectoriesCount
            },
            elapsedSeconds: elapsed
        });
    }

    const outPath = path.resolve(__dirname, '../artifacts/t10_ablation_results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n=== T10 单变量实验全部完成！结果已存至 ${outPath} ===`);
}

runT10Experiments();
