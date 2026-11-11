/**
 * 实时对局观战与数据看板 (Live Match Runner with Real-time Telemetry)
 *
 * 用法：
 *   npx tsx tools/skirmish_live_match.ts [options]
 *
 * 参数：
 *   --p0 <policy>      红方 P0 策略 (默认: spatial_resnet_v1，可选: heuristic, random, net_b_s10)
 *   --p1 <policy>      蓝方 P1 策略 (默认: heuristic，可选: spatial_resnet_v1, random, net_b_s10)
 *   --delay <ms>       每步动画延迟毫秒数 (默认: 60，设为 0 可极速执行)
 *   --max-steps <n>    最大步数上限 (默认: 100)
 *   --seed <n>         初始随机种子 (默认: 7001)
 */

import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { RandomAI } from '../src/game/ai/random_ai';
import { getSpatialAiActionSync } from '../src/game/ai/spatial_neural_adapter';
import { encodeGameStateSpatial, encodeCandidateActionSpatial } from '../src/game/ai/spatial_tensor_encoder';
import { getDefaultSpatialPredictor } from '../src/game/ai/spatial_neural_adapter';
import { Action, GameState, Unit } from '../src/game/types';
import { getTileTerrainKey } from '../src/game/terrain_rules';
import { getUnitCost, isCommanderUnit } from '../src/game/rule_config';
import { UNIT_CONFIGS } from '../src/game/constants';

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateArmyValue(state: GameState, playerId: number): number {
    return state.units
        .filter(u => u.ownerId === playerId && u.hp > 0)
        .reduce((sum, u) => sum + (getUnitCost(state, u.ownerId, u.unitClass) || UNIT_CONFIGS[u.unitClass]?.cost || 200), 0);
}

function formatActionText(action: Action, state: GameState): string {
    switch (action.type) {
        case 'move':
            return `移动单位 [${action.unitId}] 至 (${action.to.x}, ${action.to.y})`;
        case 'attack': {
            const atk = state.units.find(u => u.id === action.attackerId);
            const def = state.units.find(u => u.id === action.targetId);
            return `攻击 [${action.attackerId}:${atk?.unitClass || '?'}] ⚔️ [${action.targetId}:${def?.unitClass || '?'}]`;
        }
        case 'capture': {
            const u = state.units.find(unit => unit.id === action.unitId);
            return `占领 [${action.unitId}:${u?.unitClass || '?'}] 夺取城镇 (${u?.pos.x}, ${u?.pos.y})`;
        }
        case 'repair':
            return `修理损坏城镇 [${action.unitId}]`;
        case 'recruit_to_castle':
            return `城堡征兵: ${action.unitClass} 部署至 (${action.castlePos.x}, ${action.castlePos.y})`;
        case 'recruit_and_deploy':
            return `城堡征兵并前推: ${action.unitClass} 移动至 (${action.to.x}, ${action.to.y})`;
        case 'heal':
            return `治疗单位 [${action.targetId}]`;
        case 'support':
            return `支援增强 [${action.targetId}]`;
        case 'summon':
            return `墓碑通灵召唤骷髅在 (${action.spawnPos.x}, ${action.spawnPos.y})`;
        case 'destroy_town':
            return `摧毁敌方城镇 [${action.unitId}]`;
        case 'post_attack_move':
            return `突击部队后撤移动至 (${action.to.x}, ${action.to.y})`;
        case 'wait':
            return `原地待命 [${action.unitId}]`;
        case 'end_turn':
            return `结束本回合 (Turn End)`;
        case 'surrender':
            return `投降 (Surrender)`;
        default:
            return JSON.stringify(action);
    }
}

export async function runLiveMatch(options: {
    p0Policy?: string;
    p1Policy?: string;
    delayMs?: number;
    maxSteps?: number;
    seed?: number;
}): Promise<void> {
    const p0Policy = options.p0Policy ?? 'spatial_resnet_v1';
    const p1Policy = options.p1Policy ?? 'heuristic';
    const delayMs = options.delayMs ?? 60;
    const maxSteps = options.maxSteps ?? 100;
    const seed = options.seed ?? 7001;

    console.clear?.();
    console.log(`\n` + `═`.repeat(78));
    console.log(`   ⚔️  ANCIENT EMPIRES 实时对战沙盘 (Live Match Benchmark)  ⚔️`);
    console.log(`   红方 (P0): ${p0Policy}   VS   蓝方 (P1): ${p1Policy}   |   种子: ${seed}`);
    console.log(`═`.repeat(78) + `\n`);

    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    const engine = new GameEngine(state);
    const heuristicAi = new HeuristicAI();
    const randomAi = new RandomAI();
    const spatialPredictor = getDefaultSpatialPredictor();

    let stepCount = 0;

    while (engine.getState().winner === null && stepCount < maxSteps) {
        const curState = engine.getState();
        const curPlayer = curState.currentPlayer;
        const curPolicy = curPlayer === 0 ? p0Policy : p1Policy;

        const legalActions = engine.getLegalActions(curPlayer).filter(a => a.type !== 'surrender');
        if (legalActions.length === 0) {
            engine.step({ type: 'end_turn' });
            stepCount += 1;
            continue;
        }

        const t0 = performance.now();
        let chosenAction: Action;
        let latencyMs = 0;
        let predictedValue: number | null = null;

        if (curPolicy === 'spatial_resnet_v1') {
            const encoded = encodeGameStateSpatial(curState, curPlayer);
            const candFeats = legalActions.map(a => encodeCandidateActionSpatial(curState, curPlayer, a));
            const pred = spatialPredictor.predict(encoded, candFeats);
            chosenAction = legalActions[pred.bestActionIndex] ?? legalActions[0];
            predictedValue = pred.value;
            latencyMs = Math.round(performance.now() - t0);
        } else if (curPolicy === 'heuristic') {
            chosenAction = heuristicAi.getAction(engine, curPlayer);
            latencyMs = Math.round(performance.now() - t0);
        } else {
            chosenAction = randomAi.getAction(engine, curPlayer);
            latencyMs = Math.round(performance.now() - t0);
        }

        // 收集即时数据指标
        const p0 = curState.players.find(p => p.id === 0);
        const p1 = curState.players.find(p => p.id === 1);
        const gold0 = p0?.gold ?? 0;
        const gold1 = p1?.gold ?? 0;
        const goldDiff = gold0 - gold1;
        const goldDiffStr = goldDiff >= 0 ? `+${goldDiff}G (红方领先)` : `${goldDiff}G (蓝方领先)`;

        const army0 = calculateArmyValue(curState, 0);
        const army1 = calculateArmyValue(curState, 1);
        const units0 = curState.units.filter(u => u.ownerId === 0 && u.hp > 0).length;
        const units1 = curState.units.filter(u => u.ownerId === 1 && u.hp > 0).length;

        const allTiles = curState.map.tiles.flat();
        const towns0 = allTiles.filter(t => t.ownerId === 0 && (getTileTerrainKey(t) === 'town' || getTileTerrainKey(t) === 'castle')).length;
        const towns1 = allTiles.filter(t => t.ownerId === 1 && (getTileTerrainKey(t) === 'town' || getTileTerrainKey(t) === 'castle')).length;
        const townsNeutral = allTiles.filter(t => t.ownerId === null && (getTileTerrainKey(t) === 'town' || getTileTerrainKey(t) === 'castle')).length;

        const cmdr0 = curState.units.find(u => u.ownerId === 0 && isCommanderUnit(curState, u));
        const cmdr1 = curState.units.find(u => u.ownerId === 1 && isCommanderUnit(curState, u));

        const actionText = formatActionText(chosenAction, curState);

        // 格式化实时数据仪表板
        const playerBadge = curPlayer === 0 ? `🔴 [P0 红方 - ${curPolicy}]` : `🔵 [P1 蓝方 - ${curPolicy}]`;
        const valueStr = predictedValue !== null
            ? `V(局势胜率): ${(predictedValue * 100).toFixed(1)}% (${predictedValue >= 0 ? '红方占优' : '蓝方占优'})`
            : `启发式评估中`;

        console.log(`┌─ 回合 ${curState.turn} | 步数 #${stepCount + 1} ───────────────────────────────────────────`);
        console.log(`│ 行动方: ${playerBadge}  |  耗时: ${latencyMs}ms  |  ${valueStr}`);
        console.log(`│ 💰 经济态势: P0: ${gold0}G  |  P1: ${gold1}G  |  经济差: ${goldDiffStr}`);
        console.log(`│ 🏰 领地建筑: P0: ${towns0}座  |  P1: ${towns1}座  |  中立: ${townsNeutral}座`);
        console.log(`│ 🛡️ 军力对比: P0: ${units0}单位 (军值 ${army0})  |  P1: ${units1}单位 (军值 ${army1})`);
        console.log(`│ 👑 指挥官HP: P0: ${cmdr0?.hp ?? 0}/${cmdr0?.maxHp ?? 100} HP  |  P1: ${cmdr1?.hp ?? 0}/${cmdr1?.maxHp ?? 100} HP`);
        console.log(`│ ⚡ 决策动作: ${actionText}`);
        console.log(`└──────────────────────────────────────────────────────────────────────────\n`);

        engine.step(chosenAction);
        stepCount += 1;

        if (delayMs > 0) {
            await sleep(delayMs);
        }
    }

    const finalState = engine.getState();
    const winner = finalState.winner;

    console.log(`\n` + `═`.repeat(78));
    console.log(`   🏁 对局结束 结算面板 (Match Result) 🏁`);
    console.log(`═`.repeat(78));
    if (winner === 0) {
        console.log(`🎉 获胜方: 🔴 P0 红方 (${p0Policy}) 取得辉煌胜利！`);
    } else if (winner === 1) {
        console.log(`🎉 获胜方: 🔵 P1 蓝方 (${p1Policy}) 取得辉煌胜利！`);
    } else if (winner === -1) {
        console.log(`🤝 结果: 双方达成自然平局 (Rule Natural Draw)！`);
    } else {
        console.log(`⏱️ 结果: 达到最大步数限制 (${stepCount} 步)，平局截断 (Truncated)！`);
    }

    const fGold0 = finalState.players.find(p => p.id === 0)?.gold ?? 0;
    const fGold1 = finalState.players.find(p => p.id === 1)?.gold ?? 0;
    console.log(`\n📊 终局统计数据:`);
    console.log(`  - 最终回合数: ${finalState.turn} 回合 (总执行 ${stepCount} 步动作)`);
    console.log(`  - 最终经济: P0 ${fGold0}G  vs  P1 ${fGold1}G (终局经济差: ${fGold0 - fGold1}G)`);
    console.log(`  - 存活部队: P0 ${finalState.units.filter(u => u.ownerId === 0 && u.hp > 0).length} 部队  vs  P1 ${finalState.units.filter(u => u.ownerId === 1 && u.hp > 0).length} 部队`);
    console.log(`═`.repeat(78) + `\n`);
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_live_match.ts')) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`Usage: npx tsx tools/skirmish_live_match.ts [options]`);
        console.log(`Options:`);
        console.log(`  --p0 <policy>      P0 AI policy (default: spatial_resnet_v1)`);
        console.log(`  --p1 <policy>      P1 AI policy (default: heuristic)`);
        console.log(`  --delay <ms>       Delay per action in ms (default: 60)`);
        console.log(`  --max-steps <n>    Max steps before ending (default: 100)`);
        console.log(`  --seed <n>         Map seed (default: 7001)`);
        process.exit(0);
    }

    const parseArg = (flag: string, defVal: string) => {
        const idx = process.argv.indexOf(flag);
        return idx !== -1 ? process.argv[idx + 1] : defVal;
    };

    const p0 = parseArg('--p0', 'spatial_resnet_v1');
    const p1 = parseArg('--p1', 'heuristic');
    const delay = parseInt(parseArg('--delay', '60'), 10);
    const maxSteps = parseInt(parseArg('--max-steps', '80'), 10);
    const seed = parseInt(parseArg('--seed', '7001'), 10);

    runLiveMatch({
        p0Policy: p0,
        p1Policy: p1,
        delayMs: delay,
        maxSteps,
        seed
    }).catch(err => {
        console.error('Live match execution failed:', err);
        process.exit(1);
    });
}
