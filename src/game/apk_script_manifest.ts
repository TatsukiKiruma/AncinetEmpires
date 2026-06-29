export const APK_SCRIPT_MANIFEST_VERSION = 'aer-release-4.2.5.1';
export const APK_SCRIPT_DECRYPTED_JS_FILE_COUNT = 27;

export const APK_SCRIPT_DECRYPTION_INFO = {
    sourceGlob: 'assets/mods/**/*.js',
    cipher: 'DES/CBC/PKCS7',
    keyHex: '72 6b 00 00 00 00 46 46',
    ivHex: '72 6b 00 00 00 00 46 46'
} as const;

// 来自 aer-release-4.2.5.1 解密后的 27 个 mods/**/*.js 脚本。
// 这里只归档调用次数；大量 Async* API 属于剧情/演出层，不在对战规则引擎中执行。
export const APK_SCRIPT_API_CALL_COUNTS = {
    'Stage.AsyncMessage': 187,
    'Stage.CreateReinforcement': 162,
    'Stage.SyncGameOver': 83,
    'Stage.AsyncMapFocus': 67,
    'Stage.SyncSetUnitStaticWithCode': 57,
    'Stage.AsyncReinforce': 51,
    'Stage.PutBoolean': 44,
    'Stage.GetBoolean': 42,
    'Stage.SyncSetUnitCode': 40,
    'Stage.SyncSetUnitLevel': 35,
    'Stage.SyncSetUnitLimit': 25,
    'Stage.CountUnit': 25,
    'Stage.GetUnit': 18,
    'Stage.PutInteger': 17,
    'Stage.SyncSetGold': 16,
    'Stage.CheckCommander': 16,
    'Stage.AsyncDestroyUnit': 16,
    'Stage.SyncSetRecruitUnitsForTeam': 14,
    'Stage.SyncSetRecruitUnits': 13,
    'Stage.SyncDisableTeam': 13,
    'Stage.AsyncMoveUnit': 13,
    'Stage.SyncSetAlliance': 12,
    'Stage.SyncRestoreTeam': 12,
    'Stage.CountCastle': 12,
    'Stage.SyncSetUnitTargetedWithCode': 9,
    'Stage.SyncOverrideMov': 9,
    'Stage.GetInteger': 8,
    'Stage.AsyncRemoveUnit': 8,
    'Stage.SyncSetUnitHead': 6,
    'Stage.GetTileTeam': 6,
    'Stage.AsyncChangeTile': 6,
    'Stage.AsyncDivineJudgement': 5,
    'Stage.AsyncDestroyTile': 5,
    'Stage.AsyncChangeUnitTeam': 5,
    'Stage.SyncSetUnitStatic': 4,
    'Stage.SyncChangeGold': 4,
    'Stage.CheckCastle': 4,
    'Stage.GetCurrentTeam': 3,
    'Stage.AsyncShowObjectives': 3,
    'Stage.AsyncAttack': 3,
    'Stage.SyncSetCommander': 2,
    'Stage.SyncDestroyTeam': 2,
    'Stage.GetUnits': 2,
    'Stage.GetAliveAlliances': 2,
    'Stage.CheckPlayerTeam': 2,
    'Stage.AsyncNextTurn': 2,
    'Stage.AsyncCreateUnit': 2,
    'Stage.AsyncCarryFlag': 2,
    'Stage.SyncSetUnitStatus': 1,
    'Stage.GetDistance': 1,
    'Stage.CountVillage': 1,
    'Stage.CheckGameOver': 1,
    'Stage.AsyncSummon': 1,
    'Stage.AsyncMoveOver': 1,
    'Stage.AsyncChangeUnitHitPoint': 1,
    'Stage.AsyncCarryUnit': 1,
    'rule.SetIncomeVillage': 8,
    'rule.SetIncomeCastle': 7,
    'rule.SetIncomeCommanderBase': 7,
    'rule.SetIncomeCommanderGrowth': 7
} as const;

export type ApkScriptApiName = keyof typeof APK_SCRIPT_API_CALL_COUNTS;

export interface NumericValueDistribution {
    value: number;
    scriptCount: number;
}

export interface RecruitUnitDistribution {
    apkUnitIds: readonly number[];
    scriptCount: number;
}

export interface TeamRecruitUnitDistribution extends RecruitUnitDistribution {
    teamId: number;
}

export interface AllianceDistribution {
    teamId: number;
    allianceId: number;
    callCount: number;
}

export interface DisabledTeamDistribution {
    teamId: number;
    callCount: number;
}

export interface IncomeProfileDistribution {
    incomeVillage?: number;
    incomeCastle?: number;
    incomeCommanderBase?: number;
    incomeCommanderGrowth?: number;
    scriptCount: number;
}

// 只收录可由字面量直接提取的规则配置分布；动态参数仍需后续脚本/场景执行器处理。
export const APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS = {
    syncSetGold: [
        { value: 300, scriptCount: 5 },
        { value: 400, scriptCount: 1 },
        { value: 450, scriptCount: 1 },
        { value: 500, scriptCount: 5 },
        { value: 600, scriptCount: 1 },
        { value: 800, scriptCount: 3 }
    ] satisfies NumericValueDistribution[],
    syncSetUnitLimit: [
        { value: 10, scriptCount: 5 },
        { value: 15, scriptCount: 6 },
        { value: 20, scriptCount: 2 },
        { value: 25, scriptCount: 1 },
        { value: 30, scriptCount: 5 },
        { value: 40, scriptCount: 1 },
        { value: 50, scriptCount: 4 },
        { value: 60, scriptCount: 1 }
    ] satisfies NumericValueDistribution[],
    syncSetRecruitUnits: [
        { apkUnitIds: [0, 1], scriptCount: 2 },
        { apkUnitIds: [0, 1, 2], scriptCount: 1 },
        { apkUnitIds: [0, 1, 2, 3], scriptCount: 1 },
        { apkUnitIds: [0, 1, 2, 3, 4, 5], scriptCount: 1 },
        { apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7], scriptCount: 2 },
        { apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8], scriptCount: 6 }
    ] satisfies RecruitUnitDistribution[],
    syncSetRecruitUnitsForTeam: [
        { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12], scriptCount: 1 },
        { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 16, 17, 19, 20], scriptCount: 2 },
        { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 17, 19], scriptCount: 1 },
        { teamId: 0, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 12, 13], scriptCount: 1 },
        { teamId: 0, apkUnitIds: [1, 2, 5, 6, 7, 12], scriptCount: 1 },
        { teamId: 1, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 8, 14, 18], scriptCount: 1 },
        { teamId: 4, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8], scriptCount: 1 },
        { teamId: 4, apkUnitIds: [0, 1, 3, 14, 18], scriptCount: 1 },
        { teamId: 4, apkUnitIds: [0, 1, 3, 4, 14, 15, 18, 19], scriptCount: 1 },
        { teamId: 4, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 8, 14, 18], scriptCount: 1 },
        { teamId: 5, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 18, 19], scriptCount: 1 },
        { teamId: 5, apkUnitIds: [0, 1, 3, 4, 14, 15, 18, 19], scriptCount: 1 },
        { teamId: 5, apkUnitIds: [1, 2, 3, 4, 12, 14, 17, 19], scriptCount: 1 }
    ] satisfies TeamRecruitUnitDistribution[],
    syncSetAlliance: [
        { teamId: 0, allianceId: 1, callCount: 1 },
        { teamId: 1, allianceId: 2, callCount: 2 },
        { teamId: 2, allianceId: 2, callCount: 2 },
        { teamId: 3, allianceId: 2, callCount: 2 },
        { teamId: 4, allianceId: 2, callCount: 2 },
        { teamId: 5, allianceId: 2, callCount: 2 },
        { teamId: 5, allianceId: 5, callCount: 1 }
    ] satisfies AllianceDistribution[],
    syncDisableTeam: [
        { teamId: 1, callCount: 7 },
        { teamId: 3, callCount: 4 },
        { teamId: 4, callCount: 1 },
        { teamId: 5, callCount: 1 }
    ] satisfies DisabledTeamDistribution[],
    ruleIncomeProfiles: [
        {
            incomeVillage: 0,
            incomeCastle: 0,
            incomeCommanderBase: 0,
            incomeCommanderGrowth: 0,
            scriptCount: 7
        },
        {
            incomeVillage: 100,
            scriptCount: 1
        }
    ] satisfies IncomeProfileDistribution[]
} as const;

export function getApkScriptApiCallCount(apiName: string): number {
    return APK_SCRIPT_API_CALL_COUNTS[apiName as ApkScriptApiName] ?? 0;
}

