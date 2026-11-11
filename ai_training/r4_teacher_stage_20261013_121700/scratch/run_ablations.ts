import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RootRolloutSearchTeacher } from '../research/search_teacher';
import { ABLATION_MATERIAL_ONLY_WEIGHTS, DEFAULT_EVALUATOR_WEIGHTS } from '../research/state_evaluator';
import { runPairedArena, evaluateTacticalSuite } from '../research/evaluate';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { encodeAction } from '../env/src/game/env';
import { Policy } from '../research/match_runner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAblations() {
    console.log('=== [T06 消融] 启动四项核心消融实验 ===');
    const devMaps = ['(2) Icy Paths.aem', '(2) The Crossing.aem'];
    const suitePath = path.resolve(__dirname, '../eval/tactical_suite.json');

    const hAI = new HeuristicAI();
    const policyH: Policy = {
        id: 'frozen_heuristic',
        chooseAction: (ctx) => {
            const act = hAI.getAction(ctx.engineClone, ctx.observerPlayerId);
            return act ? encodeAction(act) : ctx.candidateCodes[0];
        }
    };

    // 默认基准教师 (K=4, 完整回应, H+ApkLike双策略, 完整建筑估值)
    const baseTeacher = new RootRolloutSearchTeacher('teacher_baseline_k4', {
        targetK: 4,
        useFullResponse: true,
        opponentPolicies: ['heuristic', 'apk_like'],
        evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS
    });

    // 变体 1: 根贪心 (不模拟对手后续)
    const greedyTeacher = new RootRolloutSearchTeacher('ablation_root_greedy', {
        targetK: 4,
        useFullResponse: false,
        opponentPolicies: ['heuristic', 'apk_like'],
        evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS
    });

    // 变体 2: 仅 H 回应
    const hOnlyTeacher = new RootRolloutSearchTeacher('ablation_h_only_response', {
        targetK: 4,
        useFullResponse: true,
        opponentPolicies: ['heuristic'],
        evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS
    });

    // 变体 3: K=8
    const k8Teacher = new RootRolloutSearchTeacher('ablation_k8_candidates', {
        targetK: 8,
        useFullResponse: true,
        opponentPolicies: ['heuristic', 'apk_like'],
        evaluatorWeights: DEFAULT_EVALUATOR_WEIGHTS
    });

    // 变体 4: 仅军力金币估值 (不含建筑)
    const matOnlyTeacher = new RootRolloutSearchTeacher('ablation_material_only', {
        targetK: 4,
        useFullResponse: true,
        opponentPolicies: ['heuristic', 'apk_like'],
        evaluatorWeights: ABLATION_MATERIAL_ONLY_WEIGHTS
    });

    const ablationResults: any = {
        timestamp: new Date().toISOString(),
        tactical: {},
        vsBaselineArena: {}
    };

    // 1. 战术题套件评估
    console.log('>>> 正在运行 5 种配置的战术题评估 (各 44 题)...');
    ablationResults.tactical = {
        baseline: await evaluateTacticalSuite(baseTeacher, suitePath),
        rootGreedy: await evaluateTacticalSuite(greedyTeacher, suitePath),
        hOnly: await evaluateTacticalSuite(hOnlyTeacher, suitePath),
        k8: await evaluateTacticalSuite(k8Teacher, suitePath),
        materialOnly: await evaluateTacticalSuite(matOnlyTeacher, suitePath)
    };

    console.log('战术题验收命中率:');
    console.log(`- Baseline: ${(ablationResults.tactical.baseline.acceptanceRate * 100).toFixed(1)}%`);
    console.log(`- Root Greedy: ${(ablationResults.tactical.rootGreedy.acceptanceRate * 100).toFixed(1)}%`);
    console.log(`- H-Only Response: ${(ablationResults.tactical.hOnly.acceptanceRate * 100).toFixed(1)}%`);
    console.log(`- K=8: ${(ablationResults.tactical.k8.acceptanceRate * 100).toFixed(1)}%`);
    console.log(`- Material-Only: ${(ablationResults.tactical.materialOnly.acceptanceRate * 100).toFixed(1)}%`);

    // 2. 对战最强冻结基线 (HeuristicAI) 的配对赛对比
    console.log('>>> 正在运行各消融变体 vs Frozen Heuristic 配对实战...');
    const matchConfig = { maxAtomicActions: 500, maxHandoffs: 50, maxEpisodeWallSeconds: 120 };

    console.log('1/5: Running Baseline vs Heuristic...');
    const arenaBase = await runPairedArena(baseTeacher, policyH, devMaps, 2, matchConfig);
    ablationResults.vsBaselineArena.baseline = arenaBase.summary;

    console.log('2/5: Running Root Greedy vs Heuristic...');
    const arenaGreedy = await runPairedArena(greedyTeacher, policyH, devMaps, 2, matchConfig);
    ablationResults.vsBaselineArena.rootGreedy = arenaGreedy.summary;

    console.log('3/5: Running H-Only Response vs Heuristic...');
    const arenaHOnly = await runPairedArena(hOnlyTeacher, policyH, devMaps, 2, matchConfig);
    ablationResults.vsBaselineArena.hOnly = arenaHOnly.summary;

    console.log('4/5: Running K=8 vs Heuristic...');
    const arenaK8 = await runPairedArena(k8Teacher, policyH, devMaps, 2, matchConfig);
    ablationResults.vsBaselineArena.k8 = arenaK8.summary;

    console.log('5/5: Running Material-Only vs Heuristic...');
    const arenaMat = await runPairedArena(matOnlyTeacher, policyH, devMaps, 2, matchConfig);
    ablationResults.vsBaselineArena.materialOnly = arenaMat.summary;

    const outDir = path.resolve(__dirname, '../artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'ablation_results.json');
    fs.writeFileSync(outFile, JSON.stringify(ablationResults, null, 2), 'utf-8');
    console.log(`消融实验结果已保存至: ${outFile}`);
}

runAblations().catch(err => {
    console.error('消融运行失败:', err);
    process.exit(1);
});
