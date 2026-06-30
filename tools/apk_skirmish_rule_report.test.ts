import { describe, expect, it } from 'vitest';
import { buildApkSkirmishRuleReport } from './apk_skirmish_rule_report';

describe('APK skirmish rule report', () => {
    it('复核用户实机确认的 skirmish 规则没有回退', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');

        expect(report.generatedAt).toBe('2026-06-30T00:00:00.000Z');
        expect(report.checkCount).toBe(16);
        expect(report.failedCheckCount).toBe(0);
        expect(report.checks.every(check => check.status === 'pass')).toBe(true);
        expect(report.manualVerificationItems).toHaveLength(10);
        expect(report.manualVerificationItems.map(item => item.id)).toEqual([
            'commander-recruit-cost-growth',
            'commander-auto-revive',
            'overheal-clipping',
            'undead-overheal',
            'low-confidence-tiles-t80-t83',
            'water-obstacle-tiles-t81-t82',
            'commander-castle-recruit-ui-flow',
            'support-and-assault-edge-order',
            'counter-blind-storm-order',
            'default-commander-income'
        ]);
        expect(report.manualVerificationItems.filter(item => item.priority === 'P0').map(item => item.id)).toEqual([
            'commander-recruit-cost-growth',
            'commander-auto-revive',
            'overheal-clipping'
        ]);
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
        expect(byId['commander-recruit-availability'].actual).toEqual({
            sdWithAliveCommander: { canRecruitCommander: false },
            sdWithoutCommander: { canRecruitCommander: true },
            soWithoutCommander: { canRecruitCommander: false }
        });
        expect(byId['commander-recruit-cost-profile'].actual).toEqual({
            sdDeathCounts0To2: [400, 400, 400],
            soDeathCounts0To2: [null, null, null]
        });
        expect(byId['commander-no-auto-revive'].actual).toEqual({
            afterDeath: {
                commanderDeathCount: 1,
                playerAlive: true,
                hasCommander: false
            },
            nextOwnTurn: {
                currentPlayer: 1,
                commanderDeathCount: 1,
                playerAlive: true,
                commanderCount: 0,
                canRecruitCommander: true
            }
        });
        expect(byId['setup-applied-to-gameplay'].actual).toEqual({
            playerGold: [450, 450],
            rules: { initialGold: 450, unitLimit: 20, levelCap: 1 },
            unitLimitBlocksRecruit: true,
            levelAfterAtCapAttack: 1,
            expAfterAtCapAttack: 600
        });
        expect(byId['training-observation-skirmish-rules'].actual).toEqual({
            rules: {
                initialGold: 450,
                unitLimit: 20,
                levelCap: 1,
                allowSurrender: true,
                commanderRecruitBaseCost: 400
            },
            player0: {
                gold: 450,
                unitCount: 2,
                population: 1,
                unitLimit: 20,
                recruitableUnitCount: 19,
                includesCommander: true,
                commanderRecruitCost: 400,
                commanderUnitId: 'u1'
            },
            commander: {
                id: 'u1',
                isCommander: true,
                population: 0,
                cost: 400
            },
            legalActions: {
                hasSurrender: true,
                hasCommanderRecruitWhileAlive: false,
                hasSoldierRecruit: true
            },
            pending: {
                pendingUnitId: 'u_100',
                pendingUnitIsMarked: true,
                pendingUnitSource: 'empty_castle',
                observationPendingMatchesState: true
            }
        });
        expect(byId['recruit-execution-state'].actual).toEqual({
            emptyCastle: {
                playerGold: 850,
                pendingUnitId: 'u_100',
                pendingUnit: {
                    unitClass: 'soldier',
                    x: 0,
                    y: 0,
                    hasMoved: false,
                    hasActed: false,
                    movementRemaining: null,
                    source: 'empty_castle'
                },
                actionTypes: ['end_turn', 'move', 'surrender', 'wait'],
                canControlOtherUnit: false,
                canRecruitAgain: false
            },
            commanderCastle: {
                playerGold: 850,
                pendingUnitId: 'u_100',
                pendingUnit: {
                    unitClass: 'soldier',
                    x: 0,
                    y: 1,
                    hasMoved: true,
                    hasActed: false,
                    movementRemaining: 0,
                    source: 'commander_castle'
                },
                actionTypes: ['wait'],
                canControlOtherUnit: false,
                canRecruitAgain: false
            }
        });
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
