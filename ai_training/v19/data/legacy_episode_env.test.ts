import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createApkSkirmishTrainingGameState,
    getApkSkirmishTrainingScenarios
} from '../../src/game/apk_skirmish';
import {
    deriveSdTrainingState,
    getPlanSetup,
    getSdTrainingPlanEntry,
    loadSdTrainingPlanConfig
} from '../../tools/sd_training_state_generator';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import {
    readApkSkirmishTrainingMap,
    type SkirmishEpisodeRecord
} from '../../tools/skirmish_training_runner';
import {
    createLegacyEpisodeEnvFactory,
    LEGACY_EPISODE_INITIALIZATION_MODE
} from './legacy_episode_env';

const UNPACK_DIR = path.resolve('APK/_analysis/unpack');
const PLAN_FILE = path.resolve('training_configs/sd_training_plan_20260705.json');
const MAP_NAME = '(2) Duel.aem';

function createEpisode(
    planId: string,
    seed: number,
    initialTurnStartApplied?: boolean
): SkirmishEpisodeRecord {
    return {
        kind: 'skirmish_episode',
        version: 1,
        scenario: {
            id: `SDPLAN:${planId}:${MAP_NAME}`,
            mode: 'SD',
            mapName: MAP_NAME,
            resourcePath: 'assets/maps/(2) Duel.aem'
        },
        seed,
        maxPlies: 50,
        maxSteps: 10,
        initialObservationHash: '',
        initialLegalActionCount: 0,
        fixedActionSpaceSize: 0,
        players: [],
        policyByPlayer: {},
        steps: [],
        summary: {
            stepCount: 0,
            terminal: false,
            stoppedByMaxSteps: false,
            timeout: false,
            illegalActionCount: 0,
            totalReward: 0,
            winnerAlliance: null,
            adjudicatedWinnerAlliance: null,
            finalArmyValueByAlliance: {},
            finalTurn: 1,
            finalCurrentPlayer: 0,
            economyByPlayer: {}
        },
        ...(initialTurnStartApplied === undefined ? {} : { initialTurnStartApplied })
    } as SkirmishEpisodeRecord;
}

describe('V19 历史 episode 环境适配器', () => {
    it('保留当前默认工厂收入语义，同时恢复旧 false 快照', async () => {
        const episode = createEpisode('sd-normal', 2026070501, false);
        const currentFactory = await createDefaultEnvFactory(UNPACK_DIR, PLAN_FILE);
        const legacyFactory = await createLegacyEpisodeEnvFactory(UNPACK_DIR, PLAN_FILE);

        const currentState = (await currentFactory.createEnv(episode)).getState();
        const legacyState = (await legacyFactory.createEnv(episode)).getState();

        expect(currentState.players.map(player => player.gold)).toEqual([450, 300]);
        expect(legacyState.players.map(player => player.gold)).toEqual([300, 300]);
        expect(LEGACY_EPISODE_INITIALIZATION_MODE).toBe('legacy-no-initial-income-v1');
    });

    it('拒绝显式记录已结算首回合收入的 episode', async () => {
        const factory = await createLegacyEpisodeEnvFactory(UNPACK_DIR, PLAN_FILE);
        await expect(factory.createEnv(createEpisode('sd-normal', 7, true)))
            .rejects.toThrow('请使用当前环境工厂');
    });

    it('拒绝非 SDPLAN 场景', async () => {
        const factory = await createLegacyEpisodeEnvFactory(UNPACK_DIR, PLAN_FILE);
        const episode = createEpisode('sd-normal', 8);
        episode.scenario.id = `SD:${MAP_NAME}`;

        await expect(factory.createEnv(episode)).rejects.toThrow('仅接受 SDPLAN episode');
    });

    it('派生局面与无首回合收入 base 上的权威派生结果一致', async () => {
        const seed = 2026070509;
        const episode = createEpisode('sd-small-advantage-endgame', seed);
        const factory = await createLegacyEpisodeEnvFactory(UNPACK_DIR, PLAN_FILE);
        const actual = (await factory.createEnv(episode)).getState();

        const config = await loadSdTrainingPlanConfig(PLAN_FILE);
        const plan = getSdTrainingPlanEntry(config, 'sd-small-advantage-endgame');
        const scenario = getApkSkirmishTrainingScenarios()
            .find(candidate => candidate.id === `SD:${MAP_NAME}`);
        expect(scenario).toBeDefined();
        const map = await readApkSkirmishTrainingMap(UNPACK_DIR, scenario!);
        const base = createApkSkirmishTrainingGameState(map, scenario!, {
            setup: getPlanSetup(config, plan),
            applyInitialTurnStart: false
        });
        const expected = deriveSdTrainingState(base, plan, seed);

        expect(actual).toEqual(expected);
    });

    it('普通和参数方案写入与生成器一致的四个 metadata 字段', async () => {
        const seed = 101;
        const factory = await createLegacyEpisodeEnvFactory(UNPACK_DIR, PLAN_FILE);
        const state = (await factory.createEnv(createEpisode('sd-low-gold', seed))).getState();
        const metadata = state.metadata as Record<string, unknown>;

        expect(metadata).toMatchObject({
            apkSkirmishTrainingScenarioId: `SDPLAN:sd-low-gold:${MAP_NAME}`,
            sdTrainingPlanId: 'sd-low-gold',
            sdTrainingPlanKind: 'parameter_variant',
            sdTrainingSeed: seed
        });
    });
});
