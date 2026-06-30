import { describe, expect, it } from 'vitest';
import { buildApkSkirmishRuleReport } from './apk_skirmish_rule_report';

describe('APK skirmish rule report', () => {
    it('复核用户实机确认的 skirmish 规则没有回退', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');

        expect(report.generatedAt).toBe('2026-06-30T00:00:00.000Z');
        expect(report.checkCount).toBe(10);
        expect(report.failedCheckCount).toBe(0);
        expect(report.checks.every(check => check.status === 'pass')).toBe(true);
    });

    it('固化 SD/SO 招募列表与遭遇战开局设置', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');
        const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));

        expect(byId['setup-options'].actual).toEqual({
            initialGold: { default: 300, min: 0, max: 2000, step: 50 },
            unitLimit: { default: 30, min: 20, max: 100, step: 10 },
            levelCap: { default: 3, min: 0, max: 9, step: 1 },
            modes: {
                default: 'SD',
                options: ['SD', 'SO'],
                labels: { SD: '默认', SO: '原版' }
            }
        });
        expect(byId['sd-recruitable-units'].actual).toEqual(expect.objectContaining({
            includesCommander: true,
            excludesSkeleton: true,
            excludesCrystal: true,
            commanderRecruitBaseCost: 400
        }));
        expect(byId['so-recruitable-units'].actual).toEqual(expect.objectContaining({
            commanderRecruitBaseCost: null
        }));
    });

    it('固化 t30/t31、投降和淘汰行为', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');
        const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));

        expect(byId['t30-t31-recovery'].actual).toEqual({
            t30Poisoned: { hp: 40, status: 'poisoned', remainingTicks: 1, remainingTurns: null },
            t31Poisoned: { hp: 60, status: null, remainingTicks: null, remainingTurns: null },
            t30Blinded: { hp: 70, status: 'blinded', remainingTicks: null, remainingTurns: 1 },
            t31Blinded: { hp: 70, status: null, remainingTicks: null, remainingTurns: null },
            t30Weakened: { hp: 70, status: 'weakened', remainingTicks: null, remainingTurns: 1 },
            t31Weakened: { hp: 70, status: null, remainingTicks: null, remainingTurns: null }
        });
        expect(byId.surrender.actual).toEqual({
            playerAlive: false,
            ownUnitCount: 0,
            ownedBuildingCount: 0,
            winner: 1
        });
        expect(byId['defeat-condition'].actual).toEqual({
            noUnitsButHasCastle: { playerAlive: true, winner: null },
            noUnitsAndNoCastle: { playerAlive: false, winner: 0 }
        });
    });
});
