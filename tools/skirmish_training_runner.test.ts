import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { AncientEmpiresEnv } from '../src/game/env';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { createDemoState } from '../src/game/demo_map';
import {
    createBcBlendPolicy,
    createBcHybridPolicy,
    createPresetPolicyFactory,
    createBcRankerPolicy,
    createSeededRng,
    formatEpisodeTempLog,
    getEpisodeTempLogPath,
    parseRunnerArgs,
    resolveScenarioMaxPlies,
    resolveScenarioMaxSteps,
    runSkirmishEpisode,
    summarizeSkirmishEpisodes
} from './skirmish_training_runner';
import { parseEpisodeJsonl } from './skirmish_training_eval';
import type { SkirmishBcModel } from './skirmish_bc_train';

function createZeroBcModel(featureDim = 128): SkirmishBcModel {
    return {
        kind: 'skirmish_bc_ranker',
        version: 1,
        featureExtractor: 'hashed-action-v1',
        featureDim,
        weights: new Array(featureDim).fill(0),
        epochs: 1,
        learningRate: 0.1,
        maxCandidates: 64,
        trainedSamples: 1,
        createdAt: '2026-07-02T00:00:00.000Z'
    };
}

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
        expect(episode.steps[0]).toEqual(expect.objectContaining({
            lostValueByPlayer: expect.any(Object)
        }));
    });

    it('训练热路径按需构造 observation，并直接执行已选合法动作', () => {
        class PreparedActionEnv extends AncientEmpiresEnv {
            public fixedActionCalls = 0;

            public override stepFixedAction(...args: Parameters<AncientEmpiresEnv['stepFixedAction']>) {
                this.fixedActionCalls += 1;
                return super.stepFixedAction(...args);
            }
        }

        const env = new PreparedActionEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 17,
            maxPlies: 20
        });
        const resetResult = env.reset(17);
        const observationDescriptor = Object.getOwnPropertyDescriptor(resetResult, 'observation');
        const initialTurn = resetResult.state.turn;
        env.stepAction(resetResult.legalActions[0]);

        expect(observationDescriptor?.get).toEqual(expect.any(Function));
        expect(resetResult.observation.turn).toBe(initialTurn);

        runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:prepared-action',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed: 17,
            maxPlies: 20,
            maxSteps: 3,
            policyFactory: createPresetPolicyFactory('heuristic-vs-random')
        });

        expect(env.fixedActionCalls).toBe(0);
    });

    it('默认按 150 回合计算每局超时，并允许 max-plies 覆盖', () => {
        const defaults = parseRunnerArgs([]);

        expect(defaults.maxTurns).toBe(150);
        expect(defaults.maxPlies).toBeNull();
        expect(defaults.maxSteps).toBeNull();
        expect(defaults.tempLogs).toBe(true);
        expect(defaults.tempLogTurnInterval).toBe(5);
        expect(path.basename(defaults.tempDir)).toBe('temp');
        expect(resolveScenarioMaxPlies(defaults, { playerCount: 2 })).toBe(300);
        expect(resolveScenarioMaxSteps(defaults, 300)).toBe(19200);

        const override = parseRunnerArgs([
            '--max-turns',
            '150',
            '--max-plies',
            '20',
            '--max-steps',
            '8',
            '--temp-log-turn-interval',
            '10',
            '--no-temp-log'
        ]);

        expect(resolveScenarioMaxPlies(override, { playerCount: 4 })).toBe(20);
        expect(resolveScenarioMaxSteps(override, 20)).toBe(8);
        expect(override.tempLogTurnInterval).toBe(10);
        expect(override.tempLogs).toBe(false);
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

    it('可以生成每局详细行为 JSONL 日志', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 13,
            maxPlies: 20
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:temp',
                mode: 'SD',
                mapName: 'demo map.aem',
                resourcePath: 'demo'
            },
            seed: 13,
            maxPlies: 20,
            maxSteps: 2,
            policyFactory: createPresetPolicyFactory('heuristic-vs-random')
        });
        const logLines = formatEpisodeTempLog(episode, 12, 5)
            .trimEnd()
            .split('\n')
            .map(line => JSON.parse(line) as Record<string, unknown>);

        expect(logLines[0]).toEqual(expect.objectContaining({
            kind: 'skirmish_episode_header',
            jobId: 12,
            turnInterval: 5,
            seed: 13
        }));
        expect(logLines[1]).toEqual(expect.objectContaining({
            kind: 'skirmish_turn_window',
            fromTurn: 1,
            toTurn: 5,
            economyDeltaByPlayer: expect.any(Object),
            economyAfterWindow: expect.any(Object),
            steps: expect.any(Array)
        }));
        expect(logLines.at(-1)).toEqual(expect.objectContaining({
            kind: 'skirmish_summary'
        }));
        expect(path.basename(getEpisodeTempLogPath('C:\\tmp', episode, 12))).toBe('job-000013-SD-demo-map.aem-seed-13.jsonl');
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

    it('连续多回合没有物质或目标进展时可以提前停止', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 19,
            maxPlies: 100
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: 'TEST:stagnation',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            },
            seed: 19,
            maxPlies: 100,
            maxSteps: 100,
            stagnationPatienceTurns: 2,
            stagnationMinTurns: 2,
            policyFactory: () => ({
                name: 'idle',
                selectFixedActionIndex: ({ result }) => (
                    result.legalActionEntries.find(entry => entry.code === 'end_turn')
                    ?? result.legalActionEntries.find(entry => entry.code.startsWith('wait:'))
                    ?? result.legalActionEntries[0]
                ).fixedActionIndex
            })
        });

        expect(episode.summary.terminal).toBe(false);
        expect(episode.summary.stoppedByMaxSteps).toBe(false);
        expect(episode.summary.stoppedByStagnation).toBe(true);
        expect(episode.summary.truncationReason).toBe('stagnation');
        expect(episode.summary.stagnationTurns).toBeGreaterThanOrEqual(2);
        expect(episode.summary.stepCount).toBeLessThan(100);
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

    it('解析 BC 模型参数，并要求 bc preset 提供模型文件', () => {
        const options = parseRunnerArgs([
            '--preset',
            'bc-blend-vs-random',
            '--model',
            'training_runs/models/skirmish-bc-f2048-e5.json',
            '--no-progress'
        ]);

        expect(options.preset).toBe('bc-blend-vs-random');
        expect(options.modelFile).toContain('skirmish-bc-f2048-e5.json');
        expect(() => parseRunnerArgs(['--preset', 'bc-vs-random'])).toThrow(/--model/);
        expect(() => parseRunnerArgs(['--preset', 'bc-hybrid-vs-random'])).toThrow(/--model/);
        expect(() => parseRunnerArgs(['--preset', 'bc-blend-vs-random'])).toThrow(/--model/);
    });

    it('平衡 heuristic/apk-like preset 会按 seed 换边', () => {
        const options = parseRunnerArgs([
            '--preset',
            'heuristic-apk-like-balanced',
            '--no-progress'
        ]);
        const factory = createPresetPolicyFactory('heuristic-apk-like-balanced');

        expect(options.preset).toBe('heuristic-apk-like-balanced');
        expect([0, 1, 2, 3].map(playerId => factory(playerId, [0, 1, 2, 3], 2).name))
            .toEqual(['heuristic', 'apk-like', 'heuristic', 'apk-like']);
        expect([0, 1, 2, 3].map(playerId => factory(playerId, [0, 1, 2, 3], 3).name))
            .toEqual(['apk-like', 'heuristic', 'apk-like', 'heuristic']);
    });

    it('BC ranker 策略只返回合法固定动作索引', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 21,
            maxPlies: 20
        });
        const result = env.reset(21);
        const policy = createBcRankerPolicy(createZeroBcModel());
        const fixedIndex = policy.selectFixedActionIndex({
            result,
            playerId: result.observation.currentPlayer,
            stepNumber: 1,
            episodeSeed: 21,
            scenario: {
                id: 'TEST:bc-policy',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            }
        });

        expect(result.fixedLegalActionIndexes).toContain(fixedIndex);
        const selected = result.legalActionEntries.find(entry => entry.fixedActionIndex === fixedIndex);
        if (result.legalActionEntries.some(entry => entry.action.type !== 'surrender')) {
            expect(selected?.action.type).not.toBe('surrender');
        }
    });

    it('BC hybrid 策略只返回合法固定动作索引', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 22,
            maxPlies: 20
        });
        const result = env.reset(22);
        const policy = createBcHybridPolicy(createZeroBcModel(), 22);
        const fixedIndex = policy.selectFixedActionIndex({
            result,
            playerId: result.observation.currentPlayer,
            stepNumber: 1,
            episodeSeed: 22,
            scenario: {
                id: 'TEST:bc-hybrid-policy',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            }
        });

        expect(result.fixedLegalActionIndexes).toContain(fixedIndex);
    });

    it('BC blend 策略只返回合法固定动作索引', () => {
        const env = new AncientEmpiresEnv({
            initialState: createDemoState(getApkSkirmishRuleConfig('SD')),
            seed: 23,
            maxPlies: 20
        });
        const result = env.reset(23);
        const policy = createBcBlendPolicy(createZeroBcModel(), 23);
        const fixedIndex = policy.selectFixedActionIndex({
            result,
            playerId: result.observation.currentPlayer,
            stepNumber: 1,
            episodeSeed: 23,
            scenario: {
                id: 'TEST:bc-blend-policy',
                mode: 'SD',
                mapName: 'demo',
                resourcePath: 'demo'
            }
        });

        expect(result.fixedLegalActionIndexes).toContain(fixedIndex);
    });
});
