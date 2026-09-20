/**
 * 200 回合对局测试与终局经济/兵力评测工具
 *
 * 规则要求：
 * 1. 每个对局上限 200 回合 (Turn <= 200)；
 * 2. 一旦分出胜负 (winner !== null) 立即结束并输出终局胜利信息；
 * 3. 若战至 200 回合仍未分出胜负，输出完整总经济与当前存活兵力对比！
 */

import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';
import { Action, GameState, Unit } from '../src/game/types';
import { getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getTileTerrainKey } from '../src/game/terrain_rules';

export interface MatchEvaluationReport {
    matchId: string;
    p0Policy: string;
    p1Policy: string;
    seed: number;
    finalTurn: number;
    finalStep: number;
    winner: number | null;
    winnerPolicy: string | null;
    terminationCause: 'VICTORY' | 'MAX_TURNS_TRUNCATION';
    p0Stats: PlayerMatchStats;
    p1Stats: PlayerMatchStats;
    p0AvgLatencyMs: number;
    p1AvgLatencyMs: number;
}

export interface PlayerMatchStats {
    playerId: number;
    policy: string;
    finalGold: number;
    totalGoldEarned: number;
    totalGoldSpent: number;
    castlesOwned: number;
    townsOwned: number;
    totalTerritory: number;
    livingUnitsCount: number;
    totalArmyValue: number;
    commanderHp: number | null;
    commanderMaxHp: number | null;
    unitsBreakdown: Record<string, { count: number; totalHp: number; avgHp: number }>;
}

function calculateArmyValue(state: GameState, playerId: number): number {
    return state.units
        .filter(u => u.ownerId === playerId && u.hp > 0)
        .reduce((sum, u) => sum + (getUnitCost(state, u.ownerId, u.unitClass) || UNIT_CONFIGS[u.unitClass]?.cost || 200), 0);
}

function extractPlayerStats(state: GameState, playerId: number, policy: string, earnedGold: number, spentGold: number): PlayerMatchStats {
    const player = state.players.find(p => p.id === playerId);
    const finalGold = player?.gold ?? 0;

    let castlesOwned = 0;
    let townsOwned = 0;
    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            if (tile.ownerId === playerId) {
                const key = getTileTerrainKey(tile);
                if (key === 'castle') castlesOwned++;
                else if (key === 'town' || key === 'damaged_town') townsOwned++;
            }
        }
    }

    const livingUnits = state.units.filter(u => u.ownerId === playerId && u.hp > 0);
    const totalArmyValue = calculateArmyValue(state, playerId);

    let commanderHp: number | null = null;
    let commanderMaxHp: number | null = null;
    const commander = livingUnits.find(u => isCommanderUnit(state, u));
    if (commander) {
        commanderHp = commander.hp;
        commanderMaxHp = commander.maxHp;
    }

    const unitsBreakdown: Record<string, { count: number; totalHp: number; avgHp: number }> = {};
    for (const u of livingUnits) {
        if (!unitsBreakdown[u.unitClass]) {
            unitsBreakdown[u.unitClass] = { count: 0, totalHp: 0, avgHp: 0 };
        }
        unitsBreakdown[u.unitClass].count++;
        unitsBreakdown[u.unitClass].totalHp += u.hp;
    }
    for (const cls of Object.keys(unitsBreakdown)) {
        unitsBreakdown[cls].avgHp = Math.round(unitsBreakdown[cls].totalHp / unitsBreakdown[cls].count);
    }

    return {
        playerId,
        policy,
        finalGold,
        totalGoldEarned: earnedGold,
        totalGoldSpent: spentGold,
        castlesOwned,
        townsOwned,
        totalTerritory: castlesOwned + townsOwned,
        livingUnitsCount: livingUnits.length,
        totalArmyValue,
        commanderHp,
        commanderMaxHp,
        unitsBreakdown
    };
}

export function runMatch200Turns(
    matchId: string,
    p0Type: 'spatial' | 'heuristic',
    p1Type: 'spatial' | 'heuristic',
    seed: number = 7001,
    maxTurns: number = 200
): MatchEvaluationReport {
    const state = createDemoState();
    const engine = new GameEngine(state);
    const heuristicAi = new HeuristicAI();

    const p0PolicyName = p0Type === 'spatial' ? 'Spatial_ResNet_v1' : 'HeuristicAI';
    const p1PolicyName = p1Type === 'spatial' ? 'Spatial_ResNet_v1' : 'HeuristicAI';

    const p0Latencies: number[] = [];
    const p1Latencies: number[] = [];

    let p0EarnedGold = 0;
    let p1EarnedGold = 0;
    let p0SpentGold = 0;
    let p1SpentGold = 0;

    let prevP0Gold = state.players.find(p => p.id === 0)?.gold ?? 0;
    let prevP1Gold = state.players.find(p => p.id === 1)?.gold ?? 0;

    let stepCount = 0;
    let lastTurn = state.turn;

    console.log(`\n======================================================================`);
    console.log(`⚔️ 开始对局测试 [${matchId}] (随机种子: ${seed})`);
    console.log(`🔴 P0 (红方): ${p0PolicyName}`);
    console.log(`🔵 P1 (蓝方): ${p1PolicyName}`);
    console.log(`⏱️ 回合上限: ${maxTurns} 回合`);
    console.log(`======================================================================\n`);

    while (engine.getState().winner === null && engine.getState().turn <= maxTurns) {
        const curState = engine.getState();
        const curPlayer = curState.currentPlayer;

        // 跟踪金币变化 (判断收入与支出)
        const curP0Gold = curState.players.find(p => p.id === 0)?.gold ?? 0;
        const curP1Gold = curState.players.find(p => p.id === 1)?.gold ?? 0;

        if (curP0Gold > prevP0Gold) p0EarnedGold += (curP0Gold - prevP0Gold);
        else if (curP0Gold < prevP0Gold) p0SpentGold += (prevP0Gold - curP0Gold);

        if (curP1Gold > prevP1Gold) p1EarnedGold += (curP1Gold - prevP1Gold);
        else if (curP1Gold < prevP1Gold) p1SpentGold += (prevP1Gold - curP1Gold);

        prevP0Gold = curP0Gold;
        prevP1Gold = curP1Gold;

        // 决策动作
        let action: Action;
        const t0 = performance.now();

        if (curPlayer === 0) {
            if (p0Type === 'spatial') {
                const dec = getSpatialAiActionSync(engine, 0, { deadlineMs: 1000 });
                action = dec.action;
                p0Latencies.push(dec.e2eMs ?? (performance.now() - t0));
            } else {
                action = heuristicAi.getAction(engine, 0);
                p0Latencies.push(performance.now() - t0);
            }
        } else {
            if (p1Type === 'spatial') {
                const dec = getSpatialAiActionSync(engine, 1, { deadlineMs: 1000 });
                action = dec.action;
                p1Latencies.push(dec.e2eMs ?? (performance.now() - t0));
            } else {
                action = heuristicAi.getAction(engine, 1);
                p1Latencies.push(performance.now() - t0);
            }
        }

        // 打印每 20 回合进度
        if (curState.turn !== lastTurn && curState.turn % 20 === 0) {
            lastTurn = curState.turn;
            const p0Army = calculateArmyValue(curState, 0);
            const p1Army = calculateArmyValue(curState, 1);
            console.log(`[进行中] 回合 ${curState.turn}/${maxTurns} | 步数 #${stepCount} | 军力对比: P0(红)=${p0Army} vs P1(蓝)=${p1Army} (差值: ${p0Army - p1Army > 0 ? '+' : ''}${p0Army - p1Army})`);
        }

        engine.step(action);
        stepCount++;

        // 检查是否在这一步后产生胜者
        if (engine.getState().winner !== null) {
            break;
        }
    }

    const endState = engine.getState();
    const isDecided = endState.winner !== null;
    const winnerId = endState.winner;
    const winnerPolicy = winnerId === 0 ? p0PolicyName : (winnerId === 1 ? p1PolicyName : null);

    const p0Stats = extractPlayerStats(endState, 0, p0PolicyName, p0EarnedGold, p0SpentGold);
    const p1Stats = extractPlayerStats(endState, 1, p1PolicyName, p1EarnedGold, p1SpentGold);

    const p0AvgLat = p0Latencies.length > 0 ? p0Latencies.reduce((a, b) => a + b, 0) / p0Latencies.length : 0;
    const p1AvgLat = p1Latencies.length > 0 ? p1Latencies.reduce((a, b) => a + b, 0) / p1Latencies.length : 0;

    // 格式化输出
    console.log(`\n══════════════════════════════════════════════════════════════════════`);
    if (isDecided) {
        console.log(`🏆 【胜负已分】 获胜方: [P${winnerId} - ${winnerPolicy}] 🎉`);
        console.log(`⏱️ 终局位置: 第 ${endState.turn} 回合 (总步数: ${stepCount} 步)`);
    } else {
        console.log(`⚖️ 【战至 200 回合平局截断】 未在上限内分出胜负！`);
        console.log(`⏱️ 最终回合: 第 ${endState.turn} 回合 (总步数: ${stepCount} 步)`);
    }
    console.log(`══════════════════════════════════════════════════════════════════════\n`);

    console.log(`📊 【总经济对比面板】:`);
    console.log(`──────────────────────────────────────────────────────────────────────`);
    console.log(`  指标项目                 🔴 P0 (${p0PolicyName})        🔵 P1 (${p1PolicyName})        经济对比差`);
    console.log(`──────────────────────────────────────────────────────────────────────`);
    console.log(`  现存金币 (Current Gold):     ${p0Stats.finalGold.toString().padEnd(15)} ${p1Stats.finalGold.toString().padEnd(15)} ${p0Stats.finalGold - p1Stats.finalGold > 0 ? '+' : ''}${p0Stats.finalGold - p1Stats.finalGold}G`);
    console.log(`  累计收入 (Total Earned):     ${p0Stats.totalGoldEarned.toString().padEnd(15)} ${p1Stats.totalGoldEarned.toString().padEnd(15)} ${p0Stats.totalGoldEarned - p1Stats.totalGoldEarned > 0 ? '+' : ''}${p0Stats.totalGoldEarned - p1Stats.totalGoldEarned}G`);
    console.log(`  招募支出 (Total Spent):      ${p0Stats.totalGoldSpent.toString().padEnd(15)} ${p1Stats.totalGoldSpent.toString().padEnd(15)} ${p0Stats.totalGoldSpent - p1Stats.totalGoldSpent > 0 ? '+' : ''}${p0Stats.totalGoldSpent - p1Stats.totalGoldSpent}G`);
    console.log(`  控制建筑 (Castles/Towns):    ${(p0Stats.castlesOwned + '堡 / ' + p0Stats.townsOwned + '城').padEnd(15)} ${(p1Stats.castlesOwned + '堡 / ' + p1Stats.townsOwned + '城').padEnd(15)} ${p0Stats.totalTerritory - p1Stats.totalTerritory > 0 ? '+' : ''}${p0Stats.totalTerritory - p1Stats.totalTerritory}座`);
    console.log(`──────────────────────────────────────────────────────────────────────\n`);

    console.log(`🛡️ 【当前兵力对比面板】:`);
    console.log(`──────────────────────────────────────────────────────────────────────`);
    console.log(`  指标项目                 🔴 P0 (${p0PolicyName})        🔵 P1 (${p1PolicyName})        兵力对比差`);
    console.log(`──────────────────────────────────────────────────────────────────────`);
    console.log(`  存活部队数 (Unit Count):     ${(p0Stats.livingUnitsCount + ' 个单位').padEnd(15)} ${(p1Stats.livingUnitsCount + ' 个单位').padEnd(15)} ${p0Stats.livingUnitsCount - p1Stats.livingUnitsCount > 0 ? '+' : ''}${p0Stats.livingUnitsCount - p1Stats.livingUnitsCount}个`);
    console.log(`  存活总军值 (Army Value):     ${(p0Stats.totalArmyValue + ' 价值').padEnd(15)} ${(p1Stats.totalArmyValue + ' 价值').padEnd(15)} ${p0Stats.totalArmyValue - p1Stats.totalArmyValue > 0 ? '+' : ''}${p0Stats.totalArmyValue - p1Stats.totalArmyValue}价值`);
    console.log(`  指挥官HP (Commander):        ${(p0Stats.commanderHp !== null ? p0Stats.commanderHp + '/' + p0Stats.commanderMaxHp + ' HP' : '已阵亡').padEnd(15)} ${(p1Stats.commanderHp !== null ? p1Stats.commanderHp + '/' + p1Stats.commanderMaxHp + ' HP' : '已阵亡').padEnd(15)} -`);
    console.log(`──────────────────────────────────────────────────────────────────────`);

    console.log(`\n🪖 存活部队兵种清单:`);
    console.log(`  🔴 P0 编队: ` + Object.entries(p0Stats.unitsBreakdown).map(([k, v]) => `${k} x${v.count} (均血 ${v.avgHp})`).join(' | '));
    console.log(`  🔵 P1 编队: ` + Object.entries(p1Stats.unitsBreakdown).map(([k, v]) => `${k} x${v.count} (均血 ${v.avgHp})`).join(' | '));
    console.log(`\n⚡ 平均决策耗时: P0 = ${p0AvgLat.toFixed(1)}ms | P1 = ${p1AvgLat.toFixed(1)}ms\n`);

    return {
        matchId,
        p0Policy: p0PolicyName,
        p1Policy: p1PolicyName,
        seed,
        finalTurn: endState.turn,
        finalStep: stepCount,
        winner: winnerId,
        winnerPolicy,
        terminationCause: isDecided ? 'VICTORY' : 'MAX_TURNS_TRUNCATION',
        p0Stats,
        p1Stats,
        p0AvgLatencyMs: p0AvgLat,
        p1AvgLatencyMs: p1AvgLat
    };
}

async function main() {
    console.log(`######################################################################`);
    console.log(`       AncientEmpires 200 回合对局测试套件 (Path B ResNet vs Heuristic)`);
    console.log(`######################################################################`);

    // 对局 1: 红方新 AI (Spatial ResNet) vs 蓝方启发式 (HeuristicAI)
    const r1 = runMatch200Turns('Match_1_Spatial_P0_vs_Heuristic_P1', 'spatial', 'heuristic', 7001, 200);

    // 对局 2: 双向换边！红方启发式 (HeuristicAI) vs 蓝方新 AI (Spatial ResNet)
    const r2 = runMatch200Turns('Match_2_Heuristic_P0_vs_Spatial_P1', 'heuristic', 'spatial', 7001, 200);

    console.log(`\n######################################################################`);
    console.log(`                       对局测试汇总结果 (Summary)`);
    console.log(`######################################################################`);
    console.log(`对局 1: ${r1.winner !== null ? `胜者: P${r1.winner} (${r1.winnerPolicy}) [第 ${r1.finalTurn} 回合]` : `200 回合平局截断 | 军力比: P0(${r1.p0Stats.totalArmyValue}) vs P1(${r1.p1Stats.totalArmyValue})`}`);
    console.log(`对局 2: ${r2.winner !== null ? `胜者: P${r2.winner} (${r2.winnerPolicy}) [第 ${r2.finalTurn} 回合]` : `200 回合平局截断 | 军力比: P0(${r2.p0Stats.totalArmyValue}) vs P1(${r2.p1Stats.totalArmyValue})`}`);
    console.log(`######################################################################\n`);
}

main().catch(console.error);
