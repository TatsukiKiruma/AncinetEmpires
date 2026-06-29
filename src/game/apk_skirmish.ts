import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { APK_RELEASE_SHA256, APK_RELEASE_VERSION, getApkSkirmishMapManifestEntry, matchesApkSkirmishMapManifest } from './apk_manifest';
import { ApkAemMap, createGameStateFromApkAemMap, CreateGameStateFromApkAemMapOptions } from './apk_map';
import { GameState, RuleConfig, UnitClass } from './types';

export type ApkSkirmishMode = 'SD' | 'SO';

const SO_RECRUITABLE_APK_UNIT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

function mapApkUnitIds(apkUnitIds: readonly number[]): UnitClass[] {
    return apkUnitIds.map(apkUnitId => APK_UNIT_ID_TO_CLASS[apkUnitId]);
}

export function getApkSkirmishRuleConfig(mode: ApkSkirmishMode = 'SD'): RuleConfig {
    const rules: RuleConfig = {
        defeatOnNoUnitsAndNoCastles: true,
        defeatOnNoUnits: false
    };

    if (mode === 'SO') {
        // SO/controller.js 的 OnGameStart 明确调用 SyncSetRecruitUnits(0..8)。
        rules.recruitableUnits = mapApkUnitIds(SO_RECRUITABLE_APK_UNIT_IDS);
    }

    return rules;
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
        rules: {
            ...modeRules,
            ...(overrideRules ?? {})
        },
        metadata: {
            ...(overrideMetadata ?? {}),
            apkSkirmishMode: mode
        }
    });
}
