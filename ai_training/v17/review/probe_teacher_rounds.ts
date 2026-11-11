/** 只改变目标轮数，比较搜索的实际轨迹；不修改 V16 教师。 */
import * as fs from 'node:fs';
import { createAppApkSkirmishGameState } from '../../src/game/apk_skirmish_map_assets';
import { searchS1Action, S1_TIERS } from '../../v16/tools/teacher_s1_v16';

const state = createAppApkSkirmishGameState('(2) Duel.aem');
const observations = ([1, 2] as const).map(targetRounds => {
    const result = searchS1Action({ state, playerId: state.currentPlayer,
        s1: { tier: { ...S1_TIERS.S1b, targetRounds }, rng: () => 0.5, wallMsPerDecision: 30000 } });
    return { requestedRounds: targetRounds, actionCode: result.actionCode,
        engineTransitions: result.engineTransitions, wallCapHit: result.wallCapHit,
        candidates: result.candidates.map(c => ({ code: c.actionCode, rounds: c.roundsCompleted,
            value: c.value, boundary: c.reachedBoundary, pv: c.principalVariation })) };
});
const result = { observations, sameSearchResult: JSON.stringify({ ...observations[0], requestedRounds: 0 }) === JSON.stringify({ ...observations[1], requestedRounds: 0 }) };
fs.writeFileSync('v17/review/teacher_rounds.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ sameSearchResult: result.sameSearchResult,
    runs: observations.map(o => ({ requested: o.requestedRounds, transitions: o.engineTransitions,
        maxRounds: Math.max(...o.candidates.map(c => c.rounds)), wallCapHit: o.wallCapHit })) }));
