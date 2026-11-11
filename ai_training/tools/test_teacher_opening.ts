import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import {
    createSearchTeacherPolicyFactory,
    evaluatePositionForRoot,
    type SearchTeacherDecision
} from './skirmish_search_teacher';
import { createHeuristicBaselinePolicy, runSkirmishEpisode } from './skirmish_training_runner';
import { getDistance } from '../src/game/map';
import { getTileTerrainKey } from '../src/game/terrain_rules';
import { areEnemyPlayers, getAllianceId, isCommanderUnit } from '../src/game/rule_config';
import type { GameState } from '../src/game/types';

function customLeafEvaluator(state: GameState, rootAllianceId: number): number {
    const base = evaluatePositionForRoot(state, rootAllianceId, 250);
    
    // 1. 目标接近度 (中立/敌方城镇与城堡)
    const objectives: { x: number; y: number }[] = [];
    for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
            const tile = state.map.tiles[y][x];
            const key = getTileTerrainKey(tile);
            if (key === 'town' || key === 'castle') {
                objectives.push({ x, y });
            }
        }
    }

    let rootObjectiveScore = 0;
    let enemyObjectiveScore = 0;
    let rootSafetyScore = 0;
    let enemySafetyScore = 0;

    for (const u of state.units) {
        if (u.hp <= 0) continue;
        const uAlliance = getAllianceId(state, u.ownerId);
        const isRoot = uAlliance === rootAllianceId;

        // 寻找对该单位有意义的目标
        const unownedOrEnemyObjs = objectives.filter(o => {
            const tile = state.map.tiles[o.y][o.x];
            return tile.ownerId === null || areEnemyPlayers(state, u.ownerId, tile.ownerId);
        });

        if (unownedOrEnemyObjs.length > 0) {
            const minDist = Math.min(...unownedOrEnemyObjs.map(o => getDistance(u.pos, o)));
            const prox = Math.max(0, 10 - minDist) * 12;
            if (isRoot) rootObjectiveScore += prox;
            else enemyObjectiveScore += prox;
        }

        // 指挥官安全考量
        if (isCommanderUnit(state, u)) {
            const nearbyEnemies = state.units.filter(e => e.hp > 0 && areEnemyPlayers(state, u.ownerId, e.ownerId) && getDistance(u.pos, e.pos) <= 3);
            const nearbyAllies = state.units.filter(a => a.hp > 0 && a.id !== u.id && !areEnemyPlayers(state, u.ownerId, a.ownerId) && getDistance(u.pos, a.pos) <= 2);
            if (nearbyEnemies.length >= 2 && nearbyAllies.length <= 1) {
                const penalty = (nearbyEnemies.length - nearbyAllies.length) * 90;
                if (isRoot) rootSafetyScore -= penalty;
                else enemySafetyScore -= penalty;
            }
        }
    }

    return base + (rootObjectiveScore - enemyObjectiveScore) + (rootSafetyScore - enemySafetyScore);
}

const initialState = createDemoState(getApkSkirmishRuleConfig('SD'));
const env = new AncientEmpiresEnv({
    initialState,
    seed: 2000,
    maxPlies: 40
});

const policyFactory = (playerId: number, playerIds: readonly number[], epSeed: number) => {
    if (playerId === 0) {
        return createSearchTeacherPolicyFactory({
            config: {
                deadlineMs: 1000,
                searchStopElapsedMs: 850,
                returnTargetElapsedMs: 950,
                nodeBudget: 150,
                recruitQuota: 1
            },
            leafEvaluator: customLeafEvaluator
        })(playerId, playerIds, epSeed);
    }
    return createHeuristicBaselinePolicy(epSeed);
};

const episode = runSkirmishEpisode({
    env,
    scenario: { id: 'TEST', mode: 'SD', mapName: 'demo', resourcePath: 'demo' },
    seed: 2000,
    maxPlies: 40,
    maxSteps: 200,
    policyFactory
});

console.log('Seed 2000 Game result with custom evaluator:');
console.log('Winner alliance:', episode.summary.winnerAlliance, 'Adjudicated:', episode.summary.adjudicatedWinnerAlliance);
console.log('Steps:', episode.summary.stepCount);
console.log('Final army value:', episode.summary.finalArmyValueByAlliance);
console.log('Economy:', JSON.stringify(episode.summary.economyByPlayer, null, 2));
