import { describe, expect, it } from 'vitest';
import { buildApkSkirmishRuleReport } from './apk_skirmish_rule_report';

describe('APK skirmish rule report', () => {
    it('复核用户实机确认的 skirmish 规则没有回退', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');

        expect(report.generatedAt).toBe('2026-06-30T00:00:00.000Z');
        expect(report.checkCount).toBe(22);
        expect(report.failedCheckCount).toBe(0);
        expect(report.checks.every(check => check.status === 'pass')).toBe(true);
        expect(report.projectProbeItems).toHaveLength(2);
        expect(report.projectProbeItems.map(item => item.id)).toEqual([
            'support-assault-project-probe',
            'counter-blind-storm-project-probe'
        ]);
        expect(report.manualVerificationItems).toHaveLength(5);
        expect(report.manualVerificationItems.map(item => item.id)).toEqual([
            'low-confidence-tiles-t80-t83',
            'water-obstacle-tiles-t81-t82',
            'support-and-assault-edge-order',
            'counter-blind-storm-order',
            'default-commander-income'
        ]);
        expect(report.manualVerificationItems.filter(item => item.priority === 'P0')).toEqual([]);
    });

    it('固化待实机验证边界的当前项目探针输出', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');
        const byId = Object.fromEntries(report.projectProbeItems.map(item => [item.id, item]));

        expect(byId['support-assault-project-probe'].currentProjectBehavior).toEqual({
            support: {
                initialSupportActionCount: 2,
                targetHasActedAfterSupport: false,
                targetSupportedFlagAfterSupport: true,
                supporterHasActedAfterSupport: true,
                secondSupportAvailableAfterTargetActsAgain: false
            },
            assault: {
                movementRemainingAfterMove: 4,
                movementRemainingAfterAttack: 4,
                hasActedAfterAttack: true,
                postAttackMoveCount: 9,
                farthestPostAttackMoveDistance: 4
            }
        });
        expect(byId['counter-blind-storm-project-probe'].currentProjectBehavior).toEqual({
            blindingAttackAgainstNormalCounter: {
                defenderStatusAfterAttack: 'blinded',
                attackerHpAfterAttack: 100,
                normalCounterTriggered: false
            },
            blindingAttackAgainstCounterStormAtRange2: {
                defenderStatusAfterAttack: 'blinded',
                attackerHpAfterAttack: 50,
                counterStormTriggered: true
            },
            counterStormAtRange3: {
                defenderStatusAfterAttack: 'blinded',
                attackerHpAfterAttack: 100,
                counterStormTriggered: false
            }
        });
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
        expect(byId['recruit-economy'].actual).toEqual({
            sd: [
                { unitClass: 'commander', cost: 400, population: 0 },
                { unitClass: 'soldier', cost: 150, population: 1 },
                { unitClass: 'ghost', cost: 200, population: 1 },
                { unitClass: 'mermaid', cost: 200, population: 1 },
                { unitClass: 'archer', cost: 250, population: 1 },
                { unitClass: 'slime', cost: 250, population: 1 },
                { unitClass: 'dark_mage', cost: 300, population: 1 },
                { unitClass: 'water_elemental', cost: 300, population: 1 },
                { unitClass: 'paladin', cost: 400, population: 2 },
                { unitClass: 'witch', cost: 400, population: 2 },
                { unitClass: 'berserker', cost: 500, population: 2 },
                { unitClass: 'elf', cost: 500, population: 2 },
                { unitClass: 'wolf', cost: 600, population: 3 },
                { unitClass: 'ice_elemental', cost: 600, population: 3 },
                { unitClass: 'golem', cost: 600, population: 3 },
                { unitClass: 'druid', cost: 600, population: 3 },
                { unitClass: 'catapult', cost: 800, population: 4 },
                { unitClass: 'wolf_archer', cost: 800, population: 4 },
                { unitClass: 'dragon', cost: 1000, population: 5 }
            ],
            so: [
                { unitClass: 'soldier', cost: 150, population: 1 },
                { unitClass: 'archer', cost: 250, population: 1 },
                { unitClass: 'water_elemental', cost: 300, population: 1 },
                { unitClass: 'witch', cost: 400, population: 2 },
                { unitClass: 'elf', cost: 500, population: 2 },
                { unitClass: 'wolf', cost: 600, population: 3 },
                { unitClass: 'golem', cost: 600, population: 3 },
                { unitClass: 'catapult', cost: 800, population: 4 },
                { unitClass: 'dragon', cost: 1000, population: 5 }
            ]
        });
        expect(byId['commander-recruit-availability'].actual).toEqual({
            sdWithAliveCommander: { canRecruitCommander: false },
            sdWithoutCommander: { canRecruitCommander: true },
            soWithoutCommander: { canRecruitCommander: false }
        });
        expect(byId['commander-recruit-cost-profile'].actual).toEqual({
            sdDeathCounts0To2: [400, 500, 600],
            soDeathCounts0To2: [null, null, null]
        });
        expect(byId['commander-no-auto-revive'].actual).toEqual({
            afterDeath: {
                commanderDeathCount: 1,
                commanderReserveLevel: 2,
                commanderReserveExp: 350,
                playerAlive: true,
                hasCommander: false
            },
            nextOwnTurn: {
                currentPlayer: 1,
                commanderDeathCount: 1,
                playerAlive: true,
                commanderCount: 0,
                commanderRecruitCost: 500,
                canRecruitCommander: true
            },
            afterRecruit: {
                gold: 600,
                commanderLevel: 2,
                commanderExp: 350
            }
        });
        expect(byId['overheal-clipping'].actual).toEqual({
            firstHeal: { hp: 140, maxHp: 100, exceededMaxHp: true },
            secondHeal: { hp: 170, maxHp: 100, exceededMaxHp: true },
            turnStartRecovery: { hp: 100, maxHp: 100 },
            levelUp: { triggered: true, level: 1, hp: 130 },
            undeadPoison: { hp: 100, maxHp: 100, remainingTicks: 1 }
        });
        expect(byId['undead-overheal'].actual).toEqual({
            poison95: { hp: 100, maxHp: 100, remainingTicks: 1 },
            poison100: { hp: 100, maxHp: 100, remainingTicks: 1 },
            grave95: { hp: 100, maxHp: 100, graveCount: 0 },
            grave100: { hp: 100, maxHp: 100, graveCount: 0 }
        });
        expect(byId['terrain-defense-combat'].actual).toEqual({
            apkTile: { id: 33, defenseBonus: 20 },
            soldierDefenderDamage: 30,
            flyingDefenderDamage: 50
        });
        expect(byId['default-commander-income'].actual).toEqual({
            staticEvidence: {
                languageConfirmsCommanderIncome: true,
                sdControllerHasLiteralRuleConfig: false,
                soControllerRuleIncome: null,
                explicitZeroCommanderIncomeScriptCount: 7
            },
            sd: {
                rules: { incomeCommanderBase: 0, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 0, level1: 25, level2: 50, noCommander: 0 }
            },
            so: {
                rules: { incomeCommanderBase: 0, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 0, level1: 25, level2: 50, noCommander: 0 }
            }
        });
        expect(byId['default-training-terrain-risk'].actual).toEqual({
            mapCount: 20,
            approximateTerrainIds: [30, 31],
            unverifiedApproximateTerrainIds: [],
            lowConfidenceIdsInDefaultTraining: [],
            mapsWithApproximateTerrain: [
                { name: '(2) Mourningstar.aem', approximateTerrainIds: [30], approximateTileCount: 2 },
                { name: '(4) The Crucible.aem', approximateTerrainIds: [31], approximateTileCount: 1 },
                { name: '(4) Waterways.aem', approximateTerrainIds: [31], approximateTileCount: 2 },
                { name: '(4) Winterstorm.aem', approximateTerrainIds: [31], approximateTileCount: 4 }
            ]
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
