import { describe, expect, it } from 'vitest';
import {
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
});
