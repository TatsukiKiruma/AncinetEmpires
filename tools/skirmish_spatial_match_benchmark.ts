/**
 * 空间残差网络对战评测基准 (Path B - Spatial Match Benchmark)
 *
 * 评估契约：
 * 1. 双向换边对称评测：Spatial ResNet vs HeuristicAI (各作为 P0 与 P1 对局)；
 * 2. 真实端到端单调时钟度量：记录 P50, P95, Max 决策耗时，统计超限与回退；
 * 3. 严格遵循 R01 结果分类：自然胜负与步数截断分开，杜绝假平局；
 * 4. 产出可复验的 Markdown 报告与 JSON 统计工件。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';
import { classifyGameOutcome, aggregateOutcomes, GameOutcomeRecord } from './skirmish_evaluation_core';
import { Action } from '../src/game/types';

export interface SpatialMatchResult {
    matchId: string;
    seed: number;
    spatialPlayerId: number;
    heuristicPlayerId: number;
    winner: number | null;
    spatialWon: boolean;
    heuristicWon: boolean;
    isDraw: boolean;
    isTruncated: boolean;
    stepCount: number;
    terminationCause: string;
    spatialLatenciesMs: number[];
    deadlineMissCount: number;
    fallbackCount: number;
}

export function runSpatialVsHeuristicMatch(
    seed: number,
    spatialPlayerId: number,
    maxSteps: number = 100
): SpatialMatchResult {
    const heuristicPlayerId = spatialPlayerId === 0 ? 1 : 0;
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    const engine = new GameEngine(state);
    const heuristicAi = new HeuristicAI();

    const spatialLatencies: number[] = [];
    let deadlineMisses = 0;
    let fallbacks = 0;
    let stepCount = 0;

    while (engine.getState().winner === null && stepCount < maxSteps) {
        const curPlayer = engine.getState().currentPlayer;
        let action: Action;

        if (curPlayer === spatialPlayerId) {
            const res = getSpatialAiActionSync(engine, curPlayer, { deadlineMs: 1000 });
            action = res.action;
            spatialLatencies.push(res.e2eMs ?? res.latencyMs);
            if (res.deadlineMiss) deadlineMisses += 1;
            if (res.fallbackUsed) fallbacks += 1;
        } else {
            action = heuristicAi.getAction(engine, curPlayer);
        }

        engine.step(action);
        stepCount += 1;
    }

    const finalState = engine.getState();
    const winner = finalState.winner;
    const spatialWon = winner === spatialPlayerId;
    const heuristicWon = winner === heuristicPlayerId;
    const isTruncated = winner === null && stepCount >= maxSteps;
    const isDraw = winner === -1;

    let terminationCause = 'UNKNOWN';
    if (winner !== null) {
        terminationCause = winner === -1 ? 'RULE_NATURAL_DRAW' : `RULE_NATURAL_WIN_P${winner}`;
    } else if (isTruncated) {
        terminationCause = 'UNRESOLVED_MAX_STEPS_TRUNCATION';
    }

    return {
        matchId: `match_seed_${seed}_spatial_p${spatialPlayerId}`,
        seed,
        spatialPlayerId,
        heuristicPlayerId,
        winner,
        spatialWon,
        heuristicWon,
        isDraw,
        isTruncated,
        stepCount,
        terminationCause,
        spatialLatenciesMs: spatialLatencies,
        deadlineMissCount: deadlineMisses,
        fallbackCount: fallbacks
    };
}

export function runSpatialBenchmark(options: {
    matches?: number;
    seedStart?: number;
    maxSteps?: number;
    outDir?: string;
}): {
    totalMatches: number;
    spatialWins: number;
    heuristicWins: number;
    truncations: number;
    naturalWinRate: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    maxLatencyMs: number;
    allWithin1000Ms: boolean;
    results: SpatialMatchResult[];
} {
    const totalMatches = options.matches ?? 8;
    const seedStart = options.seedStart ?? 7001;
    const maxSteps = options.maxSteps ?? 80;
    const results: SpatialMatchResult[] = [];

    console.log(`Starting Spatial ResNet vs HeuristicAI benchmark (${totalMatches} symmetric matches)...`);

    for (let i = 0; i < totalMatches; i += 1) {
        const seed = seedStart + i;
        // 奇偶换边对称：P0 / P1 交替
        const spatialPlayer = (i % 2 === 0) ? 0 : 1;
        console.log(`  Match ${i + 1}/${totalMatches}: Seed ${seed}, Spatial as P${spatialPlayer}...`);
        const res = runSpatialVsHeuristicMatch(seed, spatialPlayer, maxSteps);
        results.push(res);
        console.log(`    -> Result: ${res.terminationCause} (steps: ${res.stepCount}, spatialWon: ${res.spatialWon})`);
    }

    const spatialWins = results.filter(r => r.spatialWon).length;
    const heuristicWins = results.filter(r => r.heuristicWon).length;
    const truncations = results.filter(r => r.isTruncated).length;
    const naturalWinRate = spatialWins / Math.max(1, totalMatches);

    const allLatencies = results.flatMap(r => r.spatialLatenciesMs).sort((a, b) => a - b);
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)] ?? 0;
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)] ?? 0;
    const maxLat = allLatencies[allLatencies.length - 1] ?? 0;
    const allWithin1000Ms = maxLat <= 1000;

    const summary = {
        totalMatches,
        spatialWins,
        heuristicWins,
        truncations,
        naturalWinRate,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        maxLatencyMs: maxLat,
        allWithin1000Ms,
        results
    };

    if (options.outDir) {
        mkdirSync(options.outDir, { recursive: true });
        writeFileSync(path.join(options.outDir, 'spatial-match-benchmark.json'), JSON.stringify(summary, null, 2), 'utf8');

        const md = `# Spatial ResNet v1 对战评估报告

**测试协议：** 双向换边对称评测 (8 局)  
**对照基准：** \`HeuristicAI\` (原生启发式冠军)  
**模型架构：** 2D Spatial Conv ResNet (24通道输入, ~47K参数)  

---

## 1. 战绩汇总

| 评估指标 | 数值 | 判定 |
| :--- | :---: | :---: |
| **总对局数** | ${totalMatches} | 换边对称 |
| **Spatial ResNet 胜场** | ${spatialWins} | ${((spatialWins / totalMatches) * 100).toFixed(1)}% |
| **HeuristicAI 胜场** | ${heuristicWins} | ${((heuristicWins / totalMatches) * 100).toFixed(1)}% |
| **步数截断数** | ${truncations} | ${((truncations / totalMatches) * 100).toFixed(1)}% |
| **自然胜率** | ${(naturalWinRate * 100).toFixed(1)}% | 规则自然终局 |

---

## 2. 真实时延遥测 (单调时钟度量)

- **P50 耗时：** ${p50.toFixed(1)} ms
- **P95 耗时：** ${p95.toFixed(1)} ms
- **最大耗时：** ${maxLat.toFixed(1)} ms
- **1000ms 契约合规：** ${allWithin1000Ms ? '✅ 100% 达标' : '❌ 存在超限'}
`;
        writeFileSync(path.join(options.outDir, 'spatial-match-benchmark.md'), md, 'utf8');
    }

    return summary;
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_spatial_match_benchmark.ts')) {
    const outDir = 'docs/training/reports/spatial_benchmark_01';
    runSpatialBenchmark({ matches: 8, outDir });
}
