import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import {
    createPresetPolicyFactory,
    createSeededRng,
    parseRunnerArgs,
    runSkirmishEpisode,
    summarizeSkirmishEpisodes
} from './skirmish_training_runner';
import { parseEpisodeJsonl } from './skirmish_training_eval';

describe('skirmish training runner', () => {
    it('种子随机数可复现', () => {
        const left = createSeededRng(123);
        const right = createSeededRng(123);

        expect([left(), left(), left()]).toEqual([right(), right(), right()]);
    });

    it('baseline 策略通过固定动作索引执行，不产生非法动作', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 7,
            maxPlies: 20
        });

        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:demo',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed: 7,
            maxPlies: 20,
            maxSteps: 8,
            policyFactory: createPresetPolicyFactory('heuristic-vs-random')
        });

        expect(episode.summary.stepCount).toBe(8);
        expect(episode.summary.illegalActionCount).toBe(0);
        expect(episode.steps.every(step => step.actionCode !== null)).toBe(true);
        expect(episode.players.map(player => player.policy)).toEqual(['heuristic', 'random']);
        expect(episode.summary.economyByPlayer[0]).toEqual(expect.objectContaining({
            spentValue: expect.any(Number),
            killValue: expect.any(Number),
            lostValue: expect.any(Number)
        }));
    });

    it('可以汇总 JSONL episode 评估指标', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 3,
            maxPlies: 20
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:demo',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed: 3,
            maxPlies: 20,
            maxSteps: 3,
            policyFactory: createPresetPolicyFactory('random')
        });
        const parsed = parseEpisodeJsonl(`${JSON.stringify(episode)}\n`, 'episode.jsonl');
        const summary = summarizeSkirmishEpisodes(parsed);

        expect(parsed).toHaveLength(1);
        expect(summary.episodeCount).toBe(1);
        expect(summary.illegalActionCount).toBe(0);
        expect(summary.byScenario['TEST:demo'].episodeCount).toBe(1);
        expect(summary.economyByPlayer[0]).toEqual(expect.objectContaining({
            spentValue: expect.any(Number),
            killValue: expect.any(Number),
            lostValue: expect.any(Number)
        }));
    });

    it('超时裁定赢家会进入胜局统计', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 11,
            maxPlies: 20
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:timeout',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed: 11,
            maxPlies: 20,
            maxSteps: 1,
            policyFactory: createPresetPolicyFactory('heuristic-vs-random')
        });
        const timeoutEpisode = {
            ...episode,
            summary: {
                ...episode.summary,
                timeout: true,
                winnerAlliance: null,
                adjudicatedWinnerAlliance: 0
            }
        };
        const summary = summarizeSkirmishEpisodes([timeoutEpisode]);

        expect(summary.naturalWinCount).toBe(0);
        expect(summary.adjudicatedWinCount).toBe(1);
        expect(summary.winsByPolicy.heuristic).toBe(1);
    });

    it('解析 worker 和进度参数', () => {
        const options = parseRunnerArgs([
            '--workers',
            '5',
            '--progress-interval-ms',
            '2000',
            '--progress-interval-steps',
            '50',
            '--no-progress'
        ]);

        expect(options.workers).toBe(5);
        expect(options.progressIntervalMs).toBe(2000);
        expect(options.progressIntervalSteps).toBe(50);
        expect(options.progress).toBe(false);
    });
});
