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

export interface ApkScriptSyncChangeGoldCall {
    teamId: number;
    delta: number;
}

export interface ApkScriptTeamRecruitUnitsCall {
    teamId: number;
    apkUnitIds: readonly number[];
}

export interface ApkScriptAllianceCall {
    teamId: number;
    allianceId: number;
}

export interface ApkScriptRuleIncomeConfig {
    incomeVillage?: number;
    incomeCastle?: number;
    incomeCommanderBase?: number;
    incomeCommanderGrowth?: number;
}

export interface ApkScriptLiteralRuleConfig {
    resourcePath: string;
    syncSetGoldValues?: readonly number[];
    syncChangeGoldCalls?: readonly ApkScriptSyncChangeGoldCall[];
    syncSetUnitLimitValues?: readonly number[];
    syncSetRecruitUnits?: readonly (readonly number[])[];
    syncSetRecruitUnitsForTeam?: readonly ApkScriptTeamRecruitUnitsCall[];
    syncSetAllianceCalls?: readonly ApkScriptAllianceCall[];
    syncDisableTeamIds?: readonly number[];
    syncRestoreTeamIds?: readonly number[];
    syncGameOverAllianceIds?: readonly number[];
    ruleIncome?: ApkScriptRuleIncomeConfig;
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

export const APK_SCRIPT_LITERAL_RULE_CONFIGS = [
    {
        resourcePath: 'assets/mods/AEI/s1.js',
        syncSetUnitLimitValues: [10],
        syncDisableTeamIds: [1],
        syncRestoreTeamIds: [1],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEI/s2.js',
        syncSetUnitLimitValues: [10],
        syncSetRecruitUnits: [[0, 1, 2]],
        syncDisableTeamIds: [1],
        syncRestoreTeamIds: [1],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEI/s3.js',
        syncSetUnitLimitValues: [15],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEI/s4.js',
        syncSetGoldValues: [300],
        syncSetUnitLimitValues: [15],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEI/s5.js',
        syncSetGoldValues: [800],
        syncChangeGoldCalls: [{ teamId: 0, delta: 100 }],
        syncSetUnitLimitValues: [20],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEI/s6.js',
        syncSetGoldValues: [300],
        syncSetUnitLimitValues: [25],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEI/s7.js',
        syncSetGoldValues: [300],
        syncSetUnitLimitValues: [30],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEII/s1.js',
        syncSetUnitLimitValues: [10],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEII/s2.js',
        syncSetGoldValues: [300],
        syncSetUnitLimitValues: [15],
        syncSetRecruitUnits: [[0, 1]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEII/s3.js',
        syncSetUnitLimitValues: [30],
        syncDisableTeamIds: [1],
        syncRestoreTeamIds: [1],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEII/s4.js',
        syncSetUnitLimitValues: [15],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEII/s5.js',
        syncSetUnitLimitValues: [15],
        syncDisableTeamIds: [1],
        syncRestoreTeamIds: [1],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEII/s6.js',
        syncSetGoldValues: [600],
        syncSetUnitLimitValues: [30],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEII/s7.js',
        syncSetGoldValues: [300],
        syncSetUnitLimitValues: [40],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        syncDisableTeamIds: [1],
        syncRestoreTeamIds: [1],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEII/s8.js',
        syncSetGoldValues: [800],
        syncChangeGoldCalls: [{ teamId: 0, delta: 200 }],
        syncSetUnitLimitValues: [30],
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEIII/s1.js',
        syncSetUnitLimitValues: [10],
        syncGameOverAllianceIds: [1, 5],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/AEIII/s2.js',
        syncSetGoldValues: [500],
        syncChangeGoldCalls: [{ teamId: 4, delta: 500 }],
        syncSetUnitLimitValues: [50],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12] },
            { teamId: 4, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8] }
        ],
        syncGameOverAllianceIds: [1, 5]
    },
    {
        resourcePath: 'assets/mods/AEIII/s3.js',
        syncSetGoldValues: [800],
        syncSetUnitLimitValues: [30],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [1, 2, 5, 6, 7, 12] }
        ],
        syncGameOverAllianceIds: [1, 3]
    },
    {
        resourcePath: 'assets/mods/AEIII/s4.js',
        syncSetGoldValues: [500],
        syncSetUnitLimitValues: [50],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 12, 13] },
            { teamId: 5, apkUnitIds: [1, 2, 3, 4, 12, 14, 17, 19] }
        ],
        syncSetAllianceCalls: [{ teamId: 5, allianceId: 5 }],
        syncDisableTeamIds: [4, 5],
        syncRestoreTeamIds: [5],
        syncGameOverAllianceIds: [1, 5],
        ruleIncome: { incomeVillage: 100 }
    },
    {
        resourcePath: 'assets/mods/AEIII/s5.js',
        syncSetGoldValues: [400],
        syncChangeGoldCalls: [{ teamId: 4, delta: 500 }],
        syncSetUnitLimitValues: [50],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 17, 19] },
            { teamId: 4, apkUnitIds: [0, 1, 3, 14, 18] }
        ],
        syncGameOverAllianceIds: [1, 5]
    },
    {
        resourcePath: 'assets/mods/AEIII/s6.js',
        syncSetGoldValues: [500],
        syncSetUnitLimitValues: [50],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 16, 17, 19, 20] },
            { teamId: 1, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 8, 14, 18] },
            { teamId: 4, apkUnitIds: [0, 1, 3, 4, 5, 6, 7, 8, 14, 18] },
            { teamId: 5, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 18, 19] }
        ],
        syncSetAllianceCalls: [
            { teamId: 1, allianceId: 2 },
            { teamId: 2, allianceId: 2 },
            { teamId: 3, allianceId: 2 },
            { teamId: 4, allianceId: 2 },
            { teamId: 5, allianceId: 2 }
        ],
        syncDisableTeamIds: [3],
        syncRestoreTeamIds: [3],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/AEIII/s7.js',
        syncSetGoldValues: [500],
        syncSetUnitLimitValues: [60],
        syncSetRecruitUnitsForTeam: [
            { teamId: 0, apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 16, 17, 19, 20] },
            { teamId: 4, apkUnitIds: [0, 1, 3, 4, 14, 15, 18, 19] },
            { teamId: 5, apkUnitIds: [0, 1, 3, 4, 14, 15, 18, 19] }
        ],
        syncSetAllianceCalls: [
            { teamId: 0, allianceId: 1 },
            { teamId: 1, allianceId: 2 },
            { teamId: 2, allianceId: 2 },
            { teamId: 3, allianceId: 2 },
            { teamId: 4, allianceId: 2 },
            { teamId: 5, allianceId: 2 }
        ],
        syncDisableTeamIds: [3],
        syncRestoreTeamIds: [3],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/SO/controller.js',
        syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]]
    },
    {
        resourcePath: 'assets/mods/TU/s1.js',
        syncSetUnitLimitValues: [10],
        syncGameOverAllianceIds: [1, 2],
        ruleIncome: { incomeVillage: 0, incomeCastle: 0, incomeCommanderBase: 0, incomeCommanderGrowth: 0 }
    },
    {
        resourcePath: 'assets/mods/TU/s2.js',
        syncSetGoldValues: [450],
        syncSetUnitLimitValues: [15],
        syncSetRecruitUnits: [[0, 1]],
        syncGameOverAllianceIds: [1, 2]
    },
    {
        resourcePath: 'assets/mods/TU/s3.js',
        syncSetGoldValues: [500],
        syncSetUnitLimitValues: [20],
        syncSetRecruitUnits: [[0, 1, 2, 3]],
        syncGameOverAllianceIds: [1, 2]
    }
] as const satisfies readonly ApkScriptLiteralRuleConfig[];

export function getApkScriptLiteralRuleConfig(resourcePath: string): ApkScriptLiteralRuleConfig | null {
    return APK_SCRIPT_LITERAL_RULE_CONFIGS.find(entry => entry.resourcePath === resourcePath) ?? null;
}

export function getApkScriptApiCallCount(apiName: string): number {
    return APK_SCRIPT_API_CALL_COUNTS[apiName as ApkScriptApiName] ?? 0;
}
