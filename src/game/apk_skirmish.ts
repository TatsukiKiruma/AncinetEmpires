import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import {
    APK_RELEASE_SHA256,
    APK_RELEASE_VERSION,
    getApkSkirmishMapManifestEntry,
    getApkSkirmishTrainingMapManifest,
    matchesApkSkirmishMapManifest,
    type ApkSkirmishMapManifestEntry,
    type ApkSkirmishTerrainConfidenceReport,
    type ApkSkirmishTrainingMapFilter
} from './apk_manifest';
import { ApkAemMap, createGameStateFromApkAemMap, CreateGameStateFromApkAemMapOptions } from './apk_map';
import { mergeRuleConfig } from './rule_config';
import { GameState, RuleConfig, UnitClass } from './types';

export type ApkSkirmishMode = 'SD' | 'SO';

const SO_RECRUITABLE_APK_UNIT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const DEFAULT_APK_SKIRMISH_TRAINING_MODES = ['SD', 'SO'] as const satisfies readonly ApkSkirmishMode[];

export interface ApkSkirmishTrainingScenarioFilter extends ApkSkirmishTrainingMapFilter {
    modes?: readonly ApkSkirmishMode[];
}

export interface ApkSkirmishTrainingScenario {
    id: string;
    mode: ApkSkirmishMode;
    mapName: string;
    resourcePath: string;
    width: number;
    height: number;
    playerCount: number;
    initialUnitCount: number;
    recommendedGold: number | null;
    terrainConfidence: ApkSkirmishTerrainConfidenceReport;
    rules: RuleConfig;
}

function mapApkUnitIds(apkUnitIds: readonly number[]): UnitClass[] {
    return apkUnitIds.map(apkUnitId => APK_UNIT_ID_TO_CLASS[apkUnitId]);
}

export function getApkSkirmishRuleConfig(mode: ApkSkirmishMode = 'SD'): RuleConfig {
    const rules: RuleConfig = {
        allowSurrender: true,
        defeatOnNoUnitsAndNoCastles: true,
        defeatOnNoUnits: false
    };

    if (mode === 'SO') {
        // SO/controller.js 的 OnGameStart 明确调用 SyncSetRecruitUnits(0..8)。
        rules.recruitableUnits = mapApkUnitIds(SO_RECRUITABLE_APK_UNIT_IDS);
    }

    return rules;
}

function cloneTerrainConfidenceReport(
    terrainConfidence: ApkSkirmishTerrainConfidenceReport
): ApkSkirmishTerrainConfidenceReport {
    return {
        tileCount: terrainConfidence.tileCount,
        byConfidence: { ...terrainConfidence.byConfidence },
        approximateTerrainIds: [...terrainConfidence.approximateTerrainIds],
        approximateTileCount: terrainConfidence.approximateTileCount,
        unmappedTerrainIds: [...terrainConfidence.unmappedTerrainIds],
        unmappedTileCount: terrainConfidence.unmappedTileCount
    };
}

function buildTrainingScenario(
    entry: ApkSkirmishMapManifestEntry,
    mode: ApkSkirmishMode
): ApkSkirmishTrainingScenario {
    return {
        id: `${mode}:${entry.name}`,
        mode,
        mapName: entry.name,
        resourcePath: entry.resourcePath,
        width: entry.width,
        height: entry.height,
        playerCount: entry.playerIds.length,
        initialUnitCount: entry.initialUnitCount,
        recommendedGold: entry.recommendedGold,
        terrainConfidence: cloneTerrainConfidenceReport(entry.terrainConfidence),
        rules: mergeRuleConfig(undefined, getApkSkirmishRuleConfig(mode))
    };
}

export function getApkSkirmishTrainingScenarios(
    filter: ApkSkirmishTrainingScenarioFilter = {}
): ApkSkirmishTrainingScenario[] {
    const {
        modes = DEFAULT_APK_SKIRMISH_TRAINING_MODES,
        ...mapFilter
    } = filter;

    return getApkSkirmishTrainingMapManifest(mapFilter).flatMap(entry => (
        modes.map(mode => buildTrainingScenario(entry, mode))
    ));
}

export interface CreateApkSkirmishGameStateOptions extends CreateGameStateFromApkAemMapOptions {
    mode?: ApkSkirmishMode;
}

export function createApkSkirmishGameState(
    map: ApkAemMap,
    options: CreateApkSkirmishGameStateOptions = {}
): GameState {
    const { mode = 'SD', rules: overrideRules, metadata: overrideMetadata, ...stateOptions } = options;
    const modeRules = getApkSkirmishRuleConfig(mode);
    const manifestEntry = stateOptions.mapName ? getApkSkirmishMapManifestEntry(stateOptions.mapName) : null;
    const isOfficialManifestMap = manifestEntry !== null && matchesApkSkirmishMapManifest(map, manifestEntry);

    return createGameStateFromApkAemMap(map, {
        ...stateOptions,
        apkVersion: stateOptions.apkVersion ?? (isOfficialManifestMap ? APK_RELEASE_VERSION : undefined),
        apkSha256: stateOptions.apkSha256 ?? (isOfficialManifestMap ? APK_RELEASE_SHA256 : undefined),
        apkResourcePath: stateOptions.apkResourcePath ?? (isOfficialManifestMap && manifestEntry ? manifestEntry.resourcePath : undefined),
        rules: mergeRuleConfig(modeRules, overrideRules),
        metadata: {
            ...(overrideMetadata ?? {}),
            apkSkirmishMode: mode
        }
    });
}
