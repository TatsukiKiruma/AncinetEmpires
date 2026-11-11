import type { ApkAemMap } from '../../src/game/apk_map';
import {
    createApkSkirmishTrainingGameState,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../../src/game/apk_skirmish';
import { AncientEmpiresEnv } from '../../src/game/env';
import type { GameState } from '../../src/game/types';
import {
    buildSdPlanScenarioId,
    deriveSdTrainingState,
    getPlanSetup,
    getSdTrainingPlanEntry,
    isDerivedSdPlan,
    loadSdTrainingPlanConfig,
    parseSdPlanScenarioId,
    type SdTrainingPlanEntry
} from '../../tools/sd_training_state_generator';
import type { SkirmishDatasetEnvFactory } from '../../tools/skirmish_dataset_export';
import {
    readApkSkirmishTrainingMap,
    type SkirmishEpisodeRecord
} from '../../tools/skirmish_training_runner';

/** 历史课程 episode 的初始化语义；该标记不能用于描述当前自然开局。 */
export const LEGACY_EPISODE_INITIALIZATION_MODE = 'legacy-no-initial-income-v1' as const;

type LegacyEpisodeRecord = SkirmishEpisodeRecord & {
    initialTurnStartApplied?: unknown;
};

/**
 * 重建未结算首回合收入的历史 SDPLAN episode。
 *
 * 这是严格的历史快照兼容入口。当前自然开局以及显式记录已结算首回合收入的
 * episode 必须继续使用当前环境工厂。
 */
export async function createLegacyEpisodeEnvFactory(
    unpackDir: string,
    planFile: string
): Promise<SkirmishDatasetEnvFactory> {
    const scenarioById = new Map<string, ApkSkirmishTrainingScenario>(
        getApkSkirmishTrainingScenarios().map(scenario => [scenario.id, scenario])
    );
    const mapCache = new Map<string, ApkAemMap>();
    const planConfig = await loadSdTrainingPlanConfig(planFile);

    return {
        async createEnv(episode) {
            assertLegacyEpisodeMarker(episode);

            const parsedScenario = parseSdPlanScenarioId(episode.scenario.id);
            if (!parsedScenario) {
                throw new Error(`历史快照适配器仅接受 SDPLAN episode: ${episode.scenario.id}`);
            }

            const plan = getSdTrainingPlanEntry(planConfig, parsedScenario.planId);
            const scenarioId = `SD:${parsedScenario.mapName}`;
            const scenario = scenarioById.get(scenarioId);
            if (!scenario) {
                throw new Error(`未知 SD 训练地图场景，无法重建历史快照: ${scenarioId}`);
            }

            const cachedMap = mapCache.get(scenario.resourcePath);
            const map = cachedMap ?? await readApkSkirmishTrainingMap(unpackDir, scenario);
            mapCache.set(scenario.resourcePath, map);

            const baseState = createApkSkirmishTrainingGameState(map, scenario, {
                setup: getPlanSetup(planConfig, plan),
                applyInitialTurnStart: false
            });
            const initialState = isDerivedSdPlan(plan)
                ? deriveSdTrainingState(baseState, plan, episode.seed)
                : tagLegacyGeneratedState(baseState, plan, episode.seed);

            return new AncientEmpiresEnv({
                initialState,
                seed: episode.seed,
                maxPlies: episode.maxPlies
            });
        }
    };
}

function assertLegacyEpisodeMarker(episode: SkirmishEpisodeRecord): void {
    const marker = (episode as LegacyEpisodeRecord).initialTurnStartApplied;
    if (marker === true) {
        throw new Error(
            `episode ${episode.scenario.id} 已显式结算首回合收入，请使用当前环境工厂`
        );
    }
    if (marker !== undefined && marker !== false) {
        throw new Error(
            `episode ${episode.scenario.id} 的 initialTurnStartApplied 必须缺省或为 false`
        );
    }
}

// 与 sd_training_state_generator 内部标记保持一致，但不借此改变历史局面。
function tagLegacyGeneratedState(state: GameState, plan: SdTrainingPlanEntry, seed: number): GameState {
    state.metadata = {
        ...(state.metadata ?? {}),
        apkSkirmishTrainingScenarioId: buildSdPlanScenarioId(
            plan.id,
            state.metadata?.apkMapName ?? 'unknown'
        )
    };
    const metadata = state.metadata as Record<string, unknown>;
    metadata.sdTrainingPlanId = plan.id;
    metadata.sdTrainingPlanKind = plan.kind;
    metadata.sdTrainingSeed = seed;
    return state;
}
