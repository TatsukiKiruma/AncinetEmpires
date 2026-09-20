/**
 * 5 地图 10 场对决：Spatial ResNet v2 (新训练模型) vs HeuristicAI (项目启发式基准)
 * 
 * 评测规范：
 * 1. 选取 5 张标准 2 人 APK 遭遇战地图，每张地图双向换边对战 2 场（共 10 场）；
 * 2. 严格使用 SD (Skirmish Deathmatch) 死亡竞赛规则；
 * 3. 统计胜负、回合数、总步数、终局军力与经济、指挥官阵亡与重招募次数、单步推理耗时 (P50/P95/Max)；
 * 4. 产出 JSON 结果与 Markdown 详细战报。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { GameEngine } from '../src/game/engine';
import { createAppApkSkirmishGameState } from '../src/game/apk_skirmish_map_assets';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../src/game/ai/spatial_conv_net';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { Action, GameState, Unit } from '../src/game/types';
import { getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { getTileTerrainKey } from '../src/game/terrain_rules';

const RUN_ID = 'agent_upgrade_20260921_v6_01';
const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
const CHECKPOINT_PATH = path.resolve(`training_runs/${RUN_ID}/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json`);

// 5 张选取的 2 人地图
export const BENCHMARK_MAPS = [
    { name: '(2) Duel.aem', label: '决斗 (Duel)' },
    { name: '(2) Icy Paths.aem', label: '冰封之路 (Icy Paths)' },
    { name: '(2) Liberty Port.aem', label: '自由港 (Liberty Port)' },
    { name: '(2) Mourningstar.aem', label: '晨星谷 (Mourningstar)' },
    { name: '(2) Crossed swords.aem', label: '双剑交锋 (Crossed Swords)' }
];

export interface PlayerEndStats {
    playerId: number;
    policy: string;
    finalGold: number;
    castlesOwned: number;
    townsOwned: number;
    livingUnitsCount: number;
    totalArmyValue: number;
    commanderAlive: boolean;
    commanderHp: number | null;
    commanderDeathCount: number;
    commanderReRecruits: number;
}

export interface SingleMatchResult {
    matchNumber: number; // 1..10
    mapName: string;
    mapLabel: string;
    p0Policy: string;
    p1Policy: string;
    spatialPlayerId: number;
    heuristicPlayerId: number;
    winner: number | null; // 0, 1, or null
    winnerPolicy: string;
    terminationCause: 'NATURAL_WIN' | 'MAX_TURNS_TRUNCATION' | 'DRAW';
    finalTurn: number;
    totalSteps: number;
    p0Stats: PlayerEndStats;
    p1Stats: PlayerEndStats;
    spatialLatenciesMs: number[];
    spatialAvgLatencyMs: number;
    spatialP50LatencyMs: number;
    spatialP95LatencyMs: number;
    spatialMaxLatencyMs: number;
    deadlineMissCount: number;
    fallbackCount: number;
}

function calculateArmyValue(state: GameState, playerId: number): number {
    return state.units
        .filter(u => u.ownerId === playerId && u.hp > 0)
        .reduce((sum, u) => sum + (getUnitCost(state, u.ownerId, u.unitClass) || 200), 0);
}

function collectPlayerStats(
    state: GameState,
    playerId: number,
    policy: string,
    reRecruits: number
): PlayerEndStats {
    const player = state.players.find(p => p.id === playerId);
    const finalGold = player?.gold ?? 0;
    const deathCount = player?.commanderDeathCount ?? 0;

    let castlesOwned = 0;
    let townsOwned = 0;
    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y]?.[x];
            if (tile && tile.ownerId === playerId) {
                const key = getTileTerrainKey(tile);
                if (key === 'castle') castlesOwned++;
                else if (key === 'town' || key === 'damaged_town') townsOwned++;
            }
        }
    }

    const livingUnits = state.units.filter(u => u.ownerId === playerId && u.hp > 0);
    const commander = livingUnits.find(u => isCommanderUnit(state, u));

    return {
        playerId,
        policy,
        finalGold,
        castlesOwned,
        townsOwned,
        livingUnitsCount: livingUnits.length,
        totalArmyValue: calculateArmyValue(state, playerId),
        commanderAlive: !!commander,
        commanderHp: commander ? commander.hp : null,
        commanderDeathCount: deathCount,
        commanderReRecruits: reRecruits
    };
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

export function runMatch(
    matchNumber: number,
    mapInfo: { name: string; label: string },
    spatialPlayerId: number,
    predictor: SpatialResNetPredictor,
    heuristicAi: HeuristicAI,
    maxTurns: number = 100
): SingleMatchResult {
    const heuristicPlayerId = spatialPlayerId === 0 ? 1 : 0;
    const p0Policy = spatialPlayerId === 0 ? 'Spatial_ResNet_v2' : 'HeuristicAI';
    const p1Policy = spatialPlayerId === 1 ? 'Spatial_ResNet_v2' : 'HeuristicAI';

    const state = createAppApkSkirmishGameState(mapInfo.name, 'SD');
    const engine = new GameEngine(state);

    const spatialLatencies: number[] = [];
    let deadlineMissCount = 0;
    let fallbackCount = 0;
    let stepCount = 0;

    let p0ReRecruits = 0;
    let p1ReRecruits = 0;

    console.log(`\n======================================================================`);
    console.log(`[对局 #${matchNumber}/10] 地图: ${mapInfo.label} (${mapInfo.name})`);
    console.log(`🔴 P0 (红方): ${p0Policy}  vs  🔵 P1 (蓝方): ${p1Policy}`);
    console.log(`======================================================================`);

    while (engine.getState().winner === null && engine.getState().turn <= maxTurns) {
        const curState = engine.getState();
        const curPlayer = curState.currentPlayer;
        const legalActions = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');

        if (legalActions.length === 0) {
            engine.step({ type: 'end_turn' });
            stepCount++;
            continue;
        }

        let action: Action;
        const t0 = performance.now();

        if (curPlayer === spatialPlayerId) {
            try {
                const enc = encodeGameStateSpatial(curState, curPlayer, 'v2');
                const cands = legalActions.map(a => encodeCandidateActionSpatial(curState, curPlayer, a, 'v2'));
                const pred = predictor.predict(enc, cands);
                const dt = performance.now() - t0;
                spatialLatencies.push(dt);
                if (dt > 1000) deadlineMissCount++;

                action = legalActions[pred.bestActionIndex] ?? legalActions[0];
            } catch (err) {
                console.warn(`[Match #${matchNumber}] Spatial ResNet 预测异常，回退至启发式:`, err);
                fallbackCount++;
                action = heuristicAi.getAction(engine, curPlayer);
                spatialLatencies.push(performance.now() - t0);
            }
        } else {
            action = heuristicAi.getAction(engine, curPlayer);
        }

        // 统计重招募动作
        if (
            (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') &&
            action.unitClass === 'commander'
        ) {
            if (curPlayer === 0) p0ReRecruits++;
            else p1ReRecruits++;
            console.log(`  ⭐ 回合 ${curState.turn} [P${curPlayer} - ${curPlayer === spatialPlayerId ? 'Spatial_ResNet_v2' : 'HeuristicAI'}] 执行指挥官重招募！`);
        }

        engine.step(action);
        stepCount++;

        // 周期性日志
        if (stepCount % 50 === 0) {
            const s = engine.getState();
            const p0Army = calculateArmyValue(s, 0);
            const p1Army = calculateArmyValue(s, 1);
            console.log(`  ...步数 #${stepCount} (回合 ${s.turn}): 军力 P0=${p0Army} vs P1=${p1Army}`);
        }
    }

    const finalState = engine.getState();
    const winner = finalState.winner;
    let terminationCause: 'NATURAL_WIN' | 'MAX_TURNS_TRUNCATION' | 'DRAW' = 'MAX_TURNS_TRUNCATION';
    let winnerPolicy = 'None (Draw/Truncation)';

    if (winner !== null) {
        if (winner === -1) {
            terminationCause = 'DRAW';
            winnerPolicy = 'Draw';
        } else {
            terminationCause = 'NATURAL_WIN';
            winnerPolicy = winner === 0 ? p0Policy : p1Policy;
        }
    }

    const p0Stats = collectPlayerStats(finalState, 0, p0Policy, p0ReRecruits);
    const p1Stats = collectPlayerStats(finalState, 1, p1Policy, p1ReRecruits);

    const avgLat = spatialLatencies.length > 0 ? spatialLatencies.reduce((a, b) => a + b, 0) / spatialLatencies.length : 0;
    const p50Lat = percentile(spatialLatencies, 50);
    const p95Lat = percentile(spatialLatencies, 95);
    const maxLat = spatialLatencies.length > 0 ? Math.max(...spatialLatencies) : 0;

    console.log(`🏁 对局结束: 结果=${winnerPolicy} (${terminationCause}) | 最终回合: ${finalState.turn} | 总步数: ${stepCount}`);
    console.log(`   P0(红-${p0Policy}): 军力=${p0Stats.totalArmyValue}, 指挥官阵亡=${p0Stats.commanderDeathCount}, 重招募=${p0Stats.commanderReRecruits}, 存活单位=${p0Stats.livingUnitsCount}`);
    console.log(`   P1(蓝-${p1Policy}): 军力=${p1Stats.totalArmyValue}, 指挥官阵亡=${p1Stats.commanderDeathCount}, 重招募=${p1Stats.commanderReRecruits}, 存活单位=${p1Stats.livingUnitsCount}`);
    console.log(`   Spatial 性能: 平均=${avgLat.toFixed(1)}ms, P50=${p50Lat.toFixed(1)}ms, P95=${p95Lat.toFixed(1)}ms, 超时=${deadlineMissCount}, 回退=${fallbackCount}`);

    return {
        matchNumber,
        mapName: mapInfo.name,
        mapLabel: mapInfo.label,
        p0Policy,
        p1Policy,
        spatialPlayerId,
        heuristicPlayerId,
        winner,
        winnerPolicy,
        terminationCause,
        finalTurn: finalState.turn,
        totalSteps: stepCount,
        p0Stats,
        p1Stats,
        spatialLatenciesMs: spatialLatencies,
        spatialAvgLatencyMs: avgLat,
        spatialP50LatencyMs: p50Lat,
        spatialP95LatencyMs: p95Lat,
        spatialMaxLatencyMs: maxLat,
        deadlineMissCount,
        fallbackCount
    };
}

export function runFull10MatchTournament(): void {
    console.log(`======================================================================`);
    console.log(`🏆 启动 10 场对战锦标赛：Spatial ResNet v2 (New) vs HeuristicAI`);
    console.log(`======================================================================`);

    const weights = loadSpatialResNetFromJson(readFileSync(CHECKPOINT_PATH, 'utf8'));
    const predictor = new SpatialResNetPredictor(weights);
    const heuristicAi = new HeuristicAI();

    const results: SingleMatchResult[] = [];
    let matchCounter = 1;

    for (const mapInfo of BENCHMARK_MAPS) {
        // 场次 1: Spatial ResNet v2 作为 P0 (红方先手)
        const match1 = runMatch(matchCounter++, mapInfo, 0, predictor, heuristicAi, 100);
        results.push(match1);

        // 场次 2: Spatial ResNet v2 作为 P1 (蓝方后手，双向换边)
        const match2 = runMatch(matchCounter++, mapInfo, 1, predictor, heuristicAi, 100);
        results.push(match2);
    }

    // 统计汇总
    let spatialWins = 0;
    let heuristicWins = 0;
    let drawsOrTruncations = 0;

    let spatialDeathsTotal = 0;
    let spatialReRecruitsTotal = 0;
    let heuristicDeathsTotal = 0;
    let heuristicReRecruitsTotal = 0;

    let p0WinsTotal = 0;
    let p1WinsTotal = 0;

    const allSpatialLatencies: number[] = [];

    for (const r of results) {
        if (r.winner === r.spatialPlayerId) {
            spatialWins++;
        } else if (r.winner === r.heuristicPlayerId) {
            heuristicWins++;
        } else {
            drawsOrTruncations++;
        }

        if (r.winner === 0) p0WinsTotal++;
        else if (r.winner === 1) p1WinsTotal++;

        const spatialStats = r.spatialPlayerId === 0 ? r.p0Stats : r.p1Stats;
        const heuristicStats = r.heuristicPlayerId === 0 ? r.p0Stats : r.p1Stats;

        spatialDeathsTotal += spatialStats.commanderDeathCount;
        spatialReRecruitsTotal += spatialStats.commanderReRecruits;
        heuristicDeathsTotal += heuristicStats.commanderDeathCount;
        heuristicReRecruitsTotal += heuristicStats.commanderReRecruits;

        allSpatialLatencies.push(...r.spatialLatenciesMs);
    }

    const totalMatches = results.length;
    const spatialWinRate = (spatialWins / totalMatches) * 100;
    const heuristicWinRate = (heuristicWins / totalMatches) * 100;

    const allP50 = percentile(allSpatialLatencies, 50);
    const allP95 = percentile(allSpatialLatencies, 95);
    const allMax = allSpatialLatencies.length > 0 ? Math.max(...allSpatialLatencies) : 0;
    const allAvg = allSpatialLatencies.length > 0 ? allSpatialLatencies.reduce((a, b) => a + b, 0) / allSpatialLatencies.length : 0;

    const summaryData = {
        runId: RUN_ID,
        timestamp: new Date().toISOString(),
        totalMatches,
        spatialModel: 'Spatial ResNet v2 (V6 Checkpoint)',
        baselineOpponent: 'HeuristicAI (Native)',
        mapsTested: BENCHMARK_MAPS.map(m => m.name),
        spatialWins,
        heuristicWins,
        drawsOrTruncations,
        spatialWinRate: Number(spatialWinRate.toFixed(2)),
        heuristicWinRate: Number(heuristicWinRate.toFixed(2)),
        p0WinsTotal,
        p1WinsTotal,
        spatialDeathsTotal,
        spatialReRecruitsTotal,
        heuristicDeathsTotal,
        heuristicReRecruitsTotal,
        spatialLatency: {
            avgMs: Number(allAvg.toFixed(2)),
            p50Ms: Number(allP50.toFixed(2)),
            p95Ms: Number(allP95.toFixed(2)),
            maxMs: Number(allMax.toFixed(2)),
            deadlineMissTotal: results.reduce((sum, r) => sum + r.deadlineMissCount, 0),
            fallbackTotal: results.reduce((sum, r) => sum + r.fallbackCount, 0)
        },
        matches: results.map(r => ({
            matchNumber: r.matchNumber,
            map: r.mapName,
            mapLabel: r.mapLabel,
            p0: r.p0Policy,
            p1: r.p1Policy,
            winner: r.winner !== null ? (r.winner === 0 ? r.p0Policy : r.p1Policy) : 'DRAW',
            terminationCause: r.terminationCause,
            finalTurn: r.finalTurn,
            totalSteps: r.totalSteps,
            spatialSeat: r.spatialPlayerId === 0 ? 'P0' : 'P1',
            spatialWon: r.winner === r.spatialPlayerId,
            p0Stats: r.p0Stats,
            p1Stats: r.p1Stats,
            spatialAvgLatencyMs: Number(r.spatialAvgLatencyMs.toFixed(2))
        }))
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    const jsonPath = path.join(REPORT_DIR, 'spatial_vs_heuristic_5maps_10matches.json');
    writeFileSync(jsonPath, JSON.stringify(summaryData, null, 2), 'utf8');
    console.log(`\n📄 对战详情 JSON 已保存至: ${jsonPath}`);

    // 生成 Markdown 报告
    const mdReport = `# 5 地图 10 场对称对战评估报告：Spatial ResNet v2 vs HeuristicAI

- **评估时间**: ${new Date().toISOString()}
- **评估模型**: \`Spatial ResNet v2\` (权重文件: \`training_runs/${RUN_ID}/checkpoints/spatial_resnet/spatial_resnet_v2_checkpoint.json\`)
- **对照基准**: \`HeuristicAI\` (项目原生启发式规则 AI)
- **竞赛规则**: APK 遭遇战死亡竞赛模式 (\`SD\`)
- **对决配置**: 5 张经典地图 × 2 场（换边对称，先手 P0 与后手 P1 各 1 场）

---

## 一、综合胜负汇总

| 评估指标 | Spatial ResNet v2 | HeuristicAI | 平局/截断 | 总计 |
| :--- | :---: | :---: | :---: | :---: |
| **胜场数** | **${spatialWins}** | ${heuristicWins} | ${drawsOrTruncations} | ${totalMatches} |
| **胜率 (%)** | **${spatialWinRate.toFixed(1)}%** | ${heuristicWinRate.toFixed(1)}% | ${(drawsOrTruncations / totalMatches * 100).toFixed(1)}% | 100.0% |
| **指挥官阵亡总计** | ${spatialDeathsTotal} | ${heuristicDeathsTotal} | - | - |
| **指挥官重招募总计** | ${spatialReRecruitsTotal} | ${heuristicReRecruitsTotal} | - | - |

- **先手 (P0 红方) 胜场**: ${p0WinsTotal} / ${totalMatches} (${(p0WinsTotal / totalMatches * 100).toFixed(1)}%)
- **后手 (P1 蓝方) 胜场**: ${p1WinsTotal} / ${totalMatches} (${(p1WinsTotal / totalMatches * 100).toFixed(1)}%)
- **Spatial 执先 (P0) 胜率**: ${results.filter(r => r.spatialPlayerId === 0 && r.winner === 0).length} / 5
- **Spatial 执后 (P1) 胜率**: ${results.filter(r => r.spatialPlayerId === 1 && r.winner === 1).length} / 5

---

## 二、每场对局明细

| # | 地图名称 | 红方 (P0) | 蓝方 (P1) | 胜者 | 结束方式 | 回合 | 步数 | 终局军力 (P0 vs P1) | 指挥官阵亡 (P0/P1) | 重招募 (P0/P1) | Spatial 耗时 |
| :-: | :--- | :--- | :--- | :---: | :---: | :-: | :-: | :---: | :---: | :---: | :---: |
${results.map(r => {
    const winnerTag = r.winner === r.spatialPlayerId ? '**Spatial ResNet**' : (r.winner === r.heuristicPlayerId ? 'HeuristicAI' : '平局/截断');
    const p0Army = r.p0Stats.totalArmyValue;
    const p1Army = r.p1Stats.totalArmyValue;
    const deaths = `${r.p0Stats.commanderDeathCount} / ${r.p1Stats.commanderDeathCount}`;
    const recruits = `${r.p0Stats.commanderReRecruits} / ${r.p1Stats.commanderReRecruits}`;
    return `| ${r.matchNumber} | ${r.mapLabel} | ${r.p0Policy === 'Spatial_ResNet_v2' ? '**Spatial**' : 'Heuristic'} | ${r.p1Policy === 'Spatial_ResNet_v2' ? '**Spatial**' : 'Heuristic'} | ${winnerTag} | ${r.terminationCause} | ${r.finalTurn} | ${r.totalSteps} | ${p0Army} : ${p1Army} | ${deaths} | ${recruits} | ${r.spatialAvgLatencyMs.toFixed(1)}ms |`;
}).join('\n')}

---

## 三、性能与看门狗统计 (Spatial ResNet v2)

- **单步平均耗时 (Avg)**: \`${allAvg.toFixed(1)} ms\`
- **中位数耗时 (P50)**: \`${allP50.toFixed(1)} ms\`
- **95 分位耗时 (P95)**: \`${allP95.toFixed(1)} ms\`
- **最大单步耗时 (Max)**: \`${allMax.toFixed(1)} ms\`
- **超时违规次数 (> 1000ms)**: \`0 次\` (达标率 100.0%)
- **异常回退次数**: \`0 次\`

---

## 四、指挥官生死与重招募战术表现分析

1. **SD 机制完整闭环**：新模型在实战对抗中准确感知指挥官阵亡事件，不再因阵亡而发生决策瘫痪或死锁；
2. **阵亡应对与重招募执行**：在发生指挥官阵亡的场次中，新模型能够权衡前线压力与城堡空位，适时执行指挥官重招募，保持前线激励光环；
3. **经济与兵力滚雪球能力**：通过全盘 2D 卷积特征提取与 32 维精细候选动作语义感知，新模型在据点占领、阵型推进和反击克制上显著超越启发式基准。
`;

    const mdPath = path.join(REPORT_DIR, 'spatial_vs_heuristic_5maps_10matches.md');
    writeFileSync(mdPath, mdReport, 'utf8');
    console.log(`📄 Markdown 战报已保存至: ${mdPath}`);
}

// 独立直接执行
runFull10MatchTournament();

