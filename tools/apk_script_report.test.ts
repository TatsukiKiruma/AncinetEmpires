import { describe, expect, it } from 'vitest';
import {
    buildApkScriptApplicationChecks,
    countApkScriptApiCalls,
    extractApkScriptLiteralRuleConfig,
    extractApkScriptLiteralStageStateConfig
} from './apk_script_report';

describe('APK 脚本复核工具', () => {
    const source = `
        function OnCreateRule(rule) {
            rule.SetIncomeVillage(100);
            rule.SetIncomeCastle(0);
            rule.SetIncomeCommanderBase(0);
            rule.SetIncomeCommanderGrowth(0);
        }
        function OnGameStart() {
            Stage.SyncSetGold(500);
            Stage.SyncChangeGold(4, 500);
            Stage.SyncSetUnitLimit(50);
            Stage.SyncSetRecruitUnits(0, 1, 2);
            Stage.SyncSetRecruitUnitsForTeam(4, 0, 1, 3);
            Stage.SyncSetAlliance(4, 2);
            Stage.SyncDisableTeam(3);
            Stage.SyncRestoreTeam(3);
            Stage.SyncGameOver(2);
            Stage.SyncOverrideMov('crystal', 1, 99);
            Stage.SyncSetUnitStatus(6, 9, 2, 2, true);
        }
    `;

    it('统计 Stage 与 rule API 调用次数', () => {
        expect(countApkScriptApiCalls(source)).toEqual({
            'Stage.SyncChangeGold': 1,
            'Stage.SyncDisableTeam': 1,
            'Stage.SyncGameOver': 1,
            'Stage.SyncOverrideMov': 1,
            'Stage.SyncRestoreTeam': 1,
            'Stage.SyncSetAlliance': 1,
            'Stage.SyncSetGold': 1,
            'Stage.SyncSetRecruitUnits': 1,
            'Stage.SyncSetRecruitUnitsForTeam': 1,
            'Stage.SyncSetUnitLimit': 1,
            'Stage.SyncSetUnitStatus': 1,
            'rule.SetIncomeCastle': 1,
            'rule.SetIncomeCommanderBase': 1,
            'rule.SetIncomeCommanderGrowth': 1,
            'rule.SetIncomeVillage': 1
        });
    });

    it('提取可安全转为 RuleConfig 的字面量规则配置', () => {
        expect(extractApkScriptLiteralRuleConfig('assets/mods/X/s1.js', source)).toEqual({
            resourcePath: 'assets/mods/X/s1.js',
            syncSetGoldValues: [500],
            syncChangeGoldCalls: [{ teamId: 4, delta: 500 }],
            syncSetUnitLimitValues: [50],
            syncSetRecruitUnits: [[0, 1, 2]],
            syncSetRecruitUnitsForTeam: [{ teamId: 4, apkUnitIds: [0, 1, 3] }],
            syncSetAllianceCalls: [{ teamId: 4, allianceId: 2 }],
            syncDisableTeamIds: [3],
            syncRestoreTeamIds: [3],
            syncGameOverAllianceIds: [2],
            ruleIncome: {
                incomeVillage: 100,
                incomeCastle: 0,
                incomeCommanderBase: 0,
                incomeCommanderGrowth: 0
            }
        });
    });

    it('提取单位/坐标状态字面量配置', () => {
        expect(extractApkScriptLiteralStageStateConfig('assets/mods/X/s1.js', source)).toEqual({
            resourcePath: 'assets/mods/X/s1.js',
            syncOverrideMovCalls: [{ code: 'crystal', tileType: 1, mov: 99 }],
            syncSetUnitStatusCalls: [{ x: 6, y: 9, statusId: 2, rounds: 2, replaceExisting: true }]
        });
    });

    it('复核脚本配置应用后能进入训练 observation', () => {
        const applicationChecks = buildApkScriptApplicationChecks();
        const byId = Object.fromEntries(applicationChecks.map(check => [check.id, check]));

        expect(applicationChecks).toHaveLength(6);
        expect(applicationChecks.every(check => check.status === 'pass')).toBe(true);
        expect(byId['rule-config-observation'].actual).toEqual({
            resourcePath: 'assets/mods/AEI/s5.js',
            rulesInitialGold: 800,
            team0InitialGold: 900,
            player0Gold: 900,
            player1Gold: 800,
            player0AllianceId: 1,
            player0UnitLimit: 5,
            ignoredGameOverAllianceIds: [1, 2],
            warningCount: 0
        });
        expect(byId['so-recruit-observation'].actual).toEqual({
            resourcePath: 'assets/mods/SO/controller.js',
            recruitableUnitCount: 9,
            includesSoldier: true,
            includesDragon: true,
            includesCommander: false,
            commanderRecruitCost: null
        });
        expect(byId['team-rule-observation'].actual).toEqual({
            resourcePath: 'assets/mods/AEIII/s6.js',
            initialGold: 500,
            unitLimit: 50,
            disabledTeams: [3],
            alliances: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
            team0RecruitableUnitCount: 15,
            team1RecruitableUnitCount: 10,
            team5RecruitableUnitCount: 12,
            ignoredRestoreTeamIds: [3],
            ignoredGameOverAllianceIds: [1, 2]
        });
        expect(byId['script-income-application'].actual).toEqual({
            resourcePath: 'assets/mods/AEIII/s4.js',
            incomeVillage: 100,
            incomeCastle: 100,
            incomeCommanderBase: 0,
            incomeCommanderGrowth: 25,
            player0GoldBeforeIncome: 500,
            player0GoldAfterIncome: 600
        });
        expect(byId['stage-move-override-observation'].actual).toEqual({
            resourcePath: 'assets/mods/AEIII/s4.js',
            appliedSyncOverrideMovCount: 1,
            appliedSyncSetUnitStatusCount: 0,
            warningCount: 4,
            unitMoveOverrides: { 0: 1 }
        });
        expect(byId['stage-status-observation'].actual).toEqual({
            resourcePath: 'assets/mods/AEIII/s7.js',
            appliedSyncOverrideMovCount: 0,
            appliedSyncSetUnitStatusCount: 1,
            warningCount: 0,
            status: 'inspired',
            apkStatusId: 2,
            statusRemainingTurns: 2,
            statusRemainingTicks: null
        });
    });
});
