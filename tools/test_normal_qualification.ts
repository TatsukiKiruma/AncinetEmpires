import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createSearchTeacherPolicyFactory, type SearchTeacherDecision } from './skirmish_search_teacher';
import { createHeuristicBaselinePolicy, runSkirmishEpisode, type SkirmishPolicyFactory } from './skirmish_training_runner';

console.log('Evaluating Normal Domain (8 games) with Strategic Prior + Recruit Quota...');

let teacherWins = 0;
let draws = 0;
let losses = 0;

for (let i = 0; i < 8; i += 1) {
    const teacherPlayerId = i % 2 === 0 ? 0 : 1;
    const seed = 2000 + i;
    const initialState = createDemoState(getApkSkirmishRuleConfig('SD'));
    const env = new AncientEmpiresEnv({
        initialState,
        seed,
        maxPlies: 40
    });

    const policyFactory: SkirmishPolicyFactory = (playerId, playerIds, epSeed) => {
        if (playerId === teacherPlayerId) {
            return createSearchTeacherPolicyFactory({
                config: {
                    deadlineMs: 1000,
                    searchStopElapsedMs: 850,
                    returnTargetElapsedMs: 950,
                    nodeBudget: 150,
                    strategicWeight: 1.0,
                    recruitQuota: 1
                }
            })(playerId, playerIds, epSeed);
        }
        return createHeuristicBaselinePolicy(epSeed);
    };

    const episode = runSkirmishEpisode({
        env,
        scenario: {
            id: `QUAL:normal:${i}`,
            mode: 'SD',
            mapName: 'demo',
            resourcePath: 'demo'
        },
        seed,
        maxPlies: 40,
        maxSteps: 200,
        policyFactory
    });

    const effectiveWinnerAlliance = episode.summary.winnerAlliance !== null
        ? episode.summary.winnerAlliance
        : episode.summary.adjudicatedWinnerAlliance;
    const teacherAllianceId = episode.players.find(p => p.id === teacherPlayerId)?.allianceId;
    const teacherWon = effectiveWinnerAlliance !== null && effectiveWinnerAlliance === teacherAllianceId;
    const draw = effectiveWinnerAlliance === null || effectiveWinnerAlliance === -1;

    if (teacherWon) teacherWins++;
    else if (draw) draws++;
    else losses++;

    console.log(`  [normal] Game ${i + 1}/8 (Teacher P${teacherPlayerId}): ${teacherWon ? 'WIN' : draw ? 'DRAW' : 'LOSS'} (steps: ${episode.summary.stepCount}, winAlliance: ${effectiveWinnerAlliance})`);
}

console.log(`\nNormal Domain Summary: Wins: ${teacherWins}, Draws: ${draws}, Losses: ${losses}, WinRate: ${(teacherWins / 8 * 100).toFixed(1)}%`);
