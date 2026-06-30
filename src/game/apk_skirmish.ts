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
import { AncientEmpiresEnv } from './env';
import { mergeRuleConfig } from './rule_config';
import { ApkSkirmishMode, ApkSkirmishSetupOptions, GameState, RuleConfig, UnitClass } from './types';

const SO_RECRUITABLE_APK_UNIT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
const SD_RECRUITABLE_APK_UNIT_IDS = [9, 0, 14, 19, 1, 18, 15, 2, 12, 3, 13, 4, 5, 17, 6, 20, 7, 16, 8] as const;
const DEFAULT_APK_SKIRMISH_TRAINING_MODES = ['SD', 'SO'] as const satisfies readonly ApkSkirmishMode[];

// 2026-06-30 用户实机确认的遭遇战开局设置范围。
export const APK_SKIRMISH_SETUP_OPTIONS: ApkSkirmishSetupOptions = {
    initialGold: { default: 300, min: 0, max: 2000, step: 50 },
    unitLimit: { default: 30, min: 20, max: 100, step: 10 },
    levelCap: { default: 3, min: 0, max: 9, step: 1 },
    modes: {
        default: 'SD',
        options: ['SD', 'SO'],
        labels: {
            SD: '默认',
            SO: '原版'
        }
    }
};

export interface ApkSkirmishTrainingScenarioFilter extends ApkSkirmishTrainingMapFilter {
    modes?: readonly ApkSkirmishMode[];
}

export interface ApkSkirmishSetupSelection {
    initialGold?: number;
    unitLimit?: number;
    levelCap?: RuleConfig['levelCap'];
}

export interface ResolvedApkSkirmishSetupSelection {
    initialGold: number;
    unitLimit: number;
    levelCap: RuleConfig['levelCap'];
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
    setupOptions: ApkSkirmishSetupOptions;
    rules: RuleConfig;
}

export type ApkSkirmishTrainingScenarioInput = string | ApkSkirmishTrainingScenario;

type CreateApkSkirmishTrainingBaseOptions = Omit<
    CreateApkSkirmishGameStateOptions,
    'mode' | 'mapName' | 'apkVersion' | 'apkSha256' | 'apkResourcePath'
>;

export interface CreateApkSkirmishTrainingGameStateOptions extends CreateApkSkirmishTrainingBaseOptions {
    strictManifest?: boolean;
}

export interface CreateApkSkirmishTrainingEnvOptions extends CreateApkSkirmishTrainingGameStateOptions {
    seed?: number;
    maxPlies?: number;
}

function mapApkUnitIds(apkUnitIds: readonly number[]): UnitClass[] {
    return apkUnitIds.map(apkUnitId => APK_UNIT_ID_TO_CLASS[apkUnitId]);
}

export function getApkSkirmishSetupOptions(): ApkSkirmishSetupOptions {
    return {
        initialGold: { ...APK_SKIRMISH_SETUP_OPTIONS.initialGold },
        unitLimit: { ...APK_SKIRMISH_SETUP_OPTIONS.unitLimit },
        levelCap: { ...APK_SKIRMISH_SETUP_OPTIONS.levelCap },
        modes: {
            default: APK_SKIRMISH_SETUP_OPTIONS.modes.default,
            options: [...APK_SKIRMISH_SETUP_OPTIONS.modes.options],
            labels: { ...APK_SKIRMISH_SETUP_OPTIONS.modes.labels }
        }
    };
}

function validateApkSkirmishMode(mode: ApkSkirmishMode): ApkSkirmishMode {
    if (!APK_SKIRMISH_SETUP_OPTIONS.modes.options.includes(mode)) {
        throw new Error(`未知 APK skirmish 模式: ${mode}`);
    }
    return mode;
}

function resolveNumericSetupValue(
    key: keyof Pick<ApkSkirmishSetupSelection, 'initialGold' | 'unitLimit' | 'levelCap'>,
    label: string,
    value: number | undefined
): number {
    const option = APK_SKIRMISH_SETUP_OPTIONS[key];
    const resolved = value ?? option.default;

    if (!Number.isInteger(resolved)) {
        throw new Error(`APK skirmish ${label} 必须是整数`);
    }

    if (resolved < option.min || resolved > option.max) {
        throw new Error(`APK skirmish ${label} 必须在 ${option.min}-${option.max} 范围内`);
    }

    if ((resolved - option.min) % option.step !== 0) {
        throw new Error(`APK skirmish ${label} 必须按 ${option.step} 递增`);
    }

    return resolved;
}

export function resolveApkSkirmishSetupSelection(
    setup: ApkSkirmishSetupSelection = {}
): ResolvedApkSkirmishSetupSelection {
    return {
        initialGold: resolveNumericSetupValue('initialGold', '起始金币', setup.initialGold),
        unitLimit: resolveNumericSetupValue('unitLimit', '单位上限', setup.unitLimit),
        levelCap: resolveNumericSetupValue('levelCap', '等级上限', setup.levelCap) as RuleConfig['levelCap']
    };
}

export function getApkSkirmishRuleConfig(
    mode: ApkSkirmishMode = 'SD',
    setup: ApkSkirmishSetupSelection = {}
): RuleConfig {
    const resolvedMode = validateApkSkirmishMode(mode);
    const resolvedSetup = resolveApkSkirmishSetupSelection(setup);
    const rules: RuleConfig = {
        initialGold: resolvedSetup.initialGold,
        unitLimit: resolvedSetup.unitLimit,
        levelCap: resolvedSetup.levelCap,
        allowSurrender: true,
        allowPendingRecruitEndTurn: true,
        allowPendingRecruitSurrender: true,
        defeatOnNoUnitsAndNoCastles: true,
        defeatOnNoUnits: false,
        commanderRecruitBaseCost: 400,
        commanderRecruitCostGrowth: 0
    };

    if (resolvedMode === 'SO') {
        // SO/controller.js 的 OnGameStart 明确调用 SyncSetRecruitUnits(0..8)。
        rules.recruitableUnits = mapApkUnitIds(SO_RECRUITABLE_APK_UNIT_IDS);
        rules.commanderRecruitBaseCost = null;
    } else {
        // SD/Default 模式经实机验证可招募指挥官和 18 个普通单位，不包含骷髅/水晶。
        rules.recruitableUnits = mapApkUnitIds(SD_RECRUITABLE_APK_UNIT_IDS);
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
        setupOptions: getApkSkirmishSetupOptions(),
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

export function getApkSkirmishTrainingScenario(
    id: string,
    filter: ApkSkirmishTrainingScenarioFilter = {}
): ApkSkirmishTrainingScenario | null {
    return getApkSkirmishTrainingScenarios(filter).find(scenario => scenario.id === id) ?? null;
}

function resolveTrainingScenario(input: ApkSkirmishTrainingScenarioInput): ApkSkirmishTrainingScenario {
    if (typeof input !== 'string') return input;

    const scenario = getApkSkirmishTrainingScenario(input);
    if (!scenario) {
        throw new Error(`未知 APK skirmish 训练场景: ${input}`);
    }
    return scenario;
}

function assertTrainingScenarioMatchesMap(
    map: ApkAemMap,
    scenario: ApkSkirmishTrainingScenario
) {
    const manifestEntry = getApkSkirmishMapManifestEntry(scenario.mapName);
    if (!manifestEntry || !matchesApkSkirmishMapManifest(map, manifestEntry)) {
        throw new Error(`APK skirmish 训练场景 ${scenario.id} 与传入 AEM 地图不匹配`);
    }
}

export interface CreateApkSkirmishGameStateOptions extends CreateGameStateFromApkAemMapOptions {
    mode?: ApkSkirmishMode;
    setup?: ApkSkirmishSetupSelection;
}

export function createApkSkirmishGameState(
    map: ApkAemMap,
    options: CreateApkSkirmishGameStateOptions = {}
): GameState {
    const { mode = 'SD', setup, rules: overrideRules, metadata: overrideMetadata, ...stateOptions } = options;
    const modeRules = getApkSkirmishRuleConfig(mode, setup);
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
            apkSkirmishMode: mode,
            apkSkirmishSetupOptions: getApkSkirmishSetupOptions()
        }
    });
}

export function createApkSkirmishTrainingGameState(
    map: ApkAemMap,
    scenarioInput: ApkSkirmishTrainingScenarioInput,
    options: CreateApkSkirmishTrainingGameStateOptions = {}
): GameState {
    const scenario = resolveTrainingScenario(scenarioInput);
    const {
        strictManifest = true,
        metadata: overrideMetadata,
        ...stateOptions
    } = options;

    if (strictManifest) {
        assertTrainingScenarioMatchesMap(map, scenario);
    }

    return createApkSkirmishGameState(map, {
        ...stateOptions,
        mode: scenario.mode,
        mapName: scenario.mapName,
        metadata: {
            ...(overrideMetadata ?? {}),
            apkSkirmishTrainingScenarioId: scenario.id
        }
    });
}

export function createApkSkirmishTrainingEnv(
    map: ApkAemMap,
    scenarioInput: ApkSkirmishTrainingScenarioInput,
    options: CreateApkSkirmishTrainingEnvOptions = {}
): AncientEmpiresEnv {
    const {
        seed,
        maxPlies,
        ...stateOptions
    } = options;

    return new AncientEmpiresEnv({
        initialState: createApkSkirmishTrainingGameState(map, scenarioInput, stateOptions),
        seed,
        maxPlies
    });
}
