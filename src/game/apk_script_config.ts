import { APK_UNIT_ID_TO_CLASS } from './apk_compat';
import { ApkScriptLiteralRuleConfig, ApkScriptLiteralStageStateConfig, getApkScriptLiteralRuleConfig, getApkScriptLiteralStageStateConfig } from './apk_script_manifest';
import { syncOverrideMov, syncSetUnitStatus } from './apk_stage';
import { applyInitialRuleConfig, mergeRuleConfig } from './rule_config';
import { GameState, RuleConfig, TeamRuleConfig, UnitClass } from './types';

export interface ApkScriptIgnoredLifecycleCalls {
    syncRestoreTeamIds: number[];
    syncGameOverAllianceIds: number[];
}

export interface ApkScriptRuleConfigBuildResult {
    resourcePath: string;
    rules: RuleConfig;
    ignoredLifecycleCalls: ApkScriptIgnoredLifecycleCalls;
    warnings: string[];
}

export interface ApkScriptStageStateApplyResult {
    resourcePath: string;
    appliedSyncOverrideMovCount: number;
    appliedSyncSetUnitStatusCount: number;
    warnings: string[];
}

function getLastValue<T>(values: readonly T[] | undefined): T | undefined {
    return values && values.length > 0 ? values[values.length - 1] : undefined;
}

function uniqueNumbers(values: readonly number[] | undefined): number[] {
    return [...new Set(values ?? [])];
}

function uniqueUnitClasses(values: readonly UnitClass[]): UnitClass[] {
    return [...new Set(values)];
}

function ensureTeamRuleConfig(rules: RuleConfig, teamId: number): TeamRuleConfig {
    if (!rules.teams) rules.teams = {};
    const current = rules.teams[teamId] ?? {};
    rules.teams[teamId] = current;
    return current;
}

function mapApkUnitIds(apkUnitIds: readonly number[], warnings: string[], context: string): UnitClass[] {
    const unitClasses: UnitClass[] = [];

    for (const apkUnitId of apkUnitIds) {
        const unitClass = APK_UNIT_ID_TO_CLASS[apkUnitId];
        if (!unitClass) {
            warnings.push(`${context} 包含未知 APK 单位 ID ${apkUnitId}，已跳过。`);
            continue;
        }
        unitClasses.push(unitClass);
    }

    return uniqueUnitClasses(unitClasses);
}

function resolveLiteralRuleConfig(source: ApkScriptLiteralRuleConfig | string): ApkScriptLiteralRuleConfig | null {
    return typeof source === 'string' ? getApkScriptLiteralRuleConfig(source) : source;
}

function resolveLiteralStageStateConfig(source: ApkScriptLiteralStageStateConfig | string): ApkScriptLiteralStageStateConfig | null {
    return typeof source === 'string' ? getApkScriptLiteralStageStateConfig(source) : source;
}

function cloneRuleConfig(rules: RuleConfig): RuleConfig {
    const teams: Record<number, TeamRuleConfig> = {};
    for (const [teamId, teamRules] of Object.entries(rules.teams ?? {})) {
        teams[Number(teamId)] = { ...teamRules };
        if (teamRules.recruitableUnits) {
            teams[Number(teamId)].recruitableUnits = [...teamRules.recruitableUnits];
        }
    }

    const cloned: RuleConfig = { ...rules };
    if (rules.recruitableUnits) cloned.recruitableUnits = [...rules.recruitableUnits];
    if (rules.prices) cloned.prices = { ...rules.prices };
    if (rules.alliances) cloned.alliances = { ...rules.alliances };
    if (rules.disabledTeams) cloned.disabledTeams = [...rules.disabledTeams];
    if (rules.commanderUnitIds) cloned.commanderUnitIds = { ...rules.commanderUnitIds };
    if (Object.keys(teams).length > 0) cloned.teams = teams;
    return cloned;
}

export function buildApkScriptRuleConfig(source: ApkScriptLiteralRuleConfig | string): ApkScriptRuleConfigBuildResult | null {
    const config = resolveLiteralRuleConfig(source);
    if (!config) return null;

    const warnings: string[] = [];
    const rules: RuleConfig = {};

    if (config.ruleIncome) {
        if (config.ruleIncome.incomeVillage !== undefined) rules.incomeVillage = config.ruleIncome.incomeVillage;
        if (config.ruleIncome.incomeCastle !== undefined) rules.incomeCastle = config.ruleIncome.incomeCastle;
        if (config.ruleIncome.incomeCommanderBase !== undefined) rules.incomeCommanderBase = config.ruleIncome.incomeCommanderBase;
        if (config.ruleIncome.incomeCommanderGrowth !== undefined) rules.incomeCommanderGrowth = config.ruleIncome.incomeCommanderGrowth;
    }

    const initialGold = getLastValue(config.syncSetGoldValues);
    if (initialGold !== undefined) {
        rules.initialGold = initialGold;
        if ((config.syncSetGoldValues?.length ?? 0) > 1) {
            warnings.push(`${config.resourcePath} 多次设置初始金币，静态配置使用最后一次值 ${initialGold}。`);
        }
    }

    const unitLimit = getLastValue(config.syncSetUnitLimitValues);
    if (unitLimit !== undefined) {
        rules.unitLimit = unitLimit;
        if ((config.syncSetUnitLimitValues?.length ?? 0) > 1) {
            warnings.push(`${config.resourcePath} 多次设置单位上限，静态配置使用最后一次值 ${unitLimit}。`);
        }
    }

    const recruitableApkUnitIds = getLastValue(config.syncSetRecruitUnits);
    if (recruitableApkUnitIds) {
        rules.recruitableUnits = mapApkUnitIds(
            recruitableApkUnitIds,
            warnings,
            `${config.resourcePath} 全局招募列表`
        );
    }

    for (const call of config.syncSetRecruitUnitsForTeam ?? []) {
        ensureTeamRuleConfig(rules, call.teamId).recruitableUnits = mapApkUnitIds(
            call.apkUnitIds,
            warnings,
            `${config.resourcePath} 队伍 ${call.teamId} 招募列表`
        );
    }

    for (const call of config.syncSetAllianceCalls ?? []) {
        if (!rules.alliances) rules.alliances = {};
        rules.alliances[call.teamId] = call.allianceId;
    }

    const disabledTeams = uniqueNumbers(config.syncDisableTeamIds);
    if (disabledTeams.length > 0) {
        rules.disabledTeams = disabledTeams;
    }

    for (const call of config.syncChangeGoldCalls ?? []) {
        if (initialGold === undefined) {
            warnings.push(`${config.resourcePath} 对队伍 ${call.teamId} 调整金币 ${call.delta}，但没有静态初始金币，无法安全折算为开局金币。`);
            continue;
        }

        const teamRules = ensureTeamRuleConfig(rules, call.teamId);
        teamRules.initialGold = (teamRules.initialGold ?? initialGold) + call.delta;
    }

    return {
        resourcePath: config.resourcePath,
        rules: cloneRuleConfig(rules),
        ignoredLifecycleCalls: {
            syncRestoreTeamIds: uniqueNumbers(config.syncRestoreTeamIds),
            syncGameOverAllianceIds: uniqueNumbers(config.syncGameOverAllianceIds)
        },
        warnings
    };
}

export function getApkScriptRuleConfig(source: ApkScriptLiteralRuleConfig | string): RuleConfig | null {
    return buildApkScriptRuleConfig(source)?.rules ?? null;
}

export function applyApkScriptRuleConfig(state: GameState, source: ApkScriptLiteralRuleConfig | string): ApkScriptRuleConfigBuildResult | null {
    const result = buildApkScriptRuleConfig(source);
    if (!result) return null;

    state.rules = mergeRuleConfig(state.rules, result.rules);
    state.metadata = {
        ...(state.metadata ?? {}),
        apkRuleScriptResourcePath: result.resourcePath,
        apkRuleScriptIgnoredRestoreTeamIds: [...result.ignoredLifecycleCalls.syncRestoreTeamIds],
        apkRuleScriptIgnoredGameOverAllianceIds: [...result.ignoredLifecycleCalls.syncGameOverAllianceIds],
        apkRuleScriptWarnings: [...result.warnings]
    };
    applyInitialRuleConfig(state);
    return result;
}

export function applyApkScriptStageStateConfig(
    state: GameState,
    source: ApkScriptLiteralStageStateConfig | string
): ApkScriptStageStateApplyResult | null {
    const config = resolveLiteralStageStateConfig(source);
    if (!config) return null;

    const warnings: string[] = [];
    let appliedSyncOverrideMovCount = 0;
    let appliedSyncSetUnitStatusCount = 0;

    for (const call of config.syncOverrideMovCalls ?? []) {
        if (syncOverrideMov(state, call.code, call.tileType, call.mov)) {
            appliedSyncOverrideMovCount += 1;
        } else {
            warnings.push(`${config.resourcePath} 的 SyncOverrideMov(${call.code}, ${call.tileType}, ${call.mov}) 未应用，单位 code 不存在或参数非法。`);
        }
    }

    for (const call of config.syncSetUnitStatusCalls ?? []) {
        if (syncSetUnitStatus(state, call.x, call.y, call.statusId, call.rounds, call.replaceExisting)) {
            appliedSyncSetUnitStatusCount += 1;
        } else {
            warnings.push(`${config.resourcePath} 的 SyncSetUnitStatus(${call.x}, ${call.y}, ${call.statusId}, ${call.rounds}, ${call.replaceExisting}) 未应用，坐标无单位或参数非法。`);
        }
    }

    const result: ApkScriptStageStateApplyResult = {
        resourcePath: config.resourcePath,
        appliedSyncOverrideMovCount,
        appliedSyncSetUnitStatusCount,
        warnings
    };

    state.metadata = {
        ...(state.metadata ?? {}),
        apkStageStateScriptResourcePath: result.resourcePath,
        apkStageStateAppliedSyncOverrideMovCount: result.appliedSyncOverrideMovCount,
        apkStageStateAppliedSyncSetUnitStatusCount: result.appliedSyncSetUnitStatusCount,
        apkStageStateScriptWarnings: [...result.warnings]
    };

    return result;
}
