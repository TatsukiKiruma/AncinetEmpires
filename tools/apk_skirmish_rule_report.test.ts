import { describe, expect, it } from 'vitest';
import { buildApkSkirmishRuleReport } from './apk_skirmish_rule_report';

describe('APK skirmish rule report', () => {
    it('复核用户实机确认的 skirmish 规则没有回退', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');

        expect(report.generatedAt).toBe('2026-06-30T00:00:00.000Z');
        expect(report.checkCount).toBe(30);
        expect(report.failedCheckCount).toBe(0);
        expect(report.checks.every(check => check.status === 'pass')).toBe(true);
        expect(report.projectProbeItems).toHaveLength(3);
        expect(report.projectProbeItems.map(item => item.id)).toEqual([
            'support-assault-project-probe',
            'counter-blind-storm-project-probe',
            'status-damage-project-probe'
        ]);
        expect(report.manualVerificationItems).toHaveLength(4);
        expect(report.manualVerificationItems.map(item => item.id)).toEqual([
            'opencode-tiles-t80-t83-ui-check',
            'opencode-water-obstacle-t81-t82-ui-check',
            'support-and-assault-edge-order',
            'counter-blind-storm-order'
        ]);
        expect(report.manualVerificationItems.filter(item => item.priority === 'P0')).toEqual([]);
        expect(report.manualVerificationItems.every(item => item.verificationSteps.length >= 4)).toBe(true);
        expect(report.manualVerificationItems.every(item => item.recordTemplate.length >= 4)).toBe(true);
        expect(report.manualVerificationItems.find(item => item.id === 'support-and-assault-edge-order')).toEqual(
            expect.objectContaining({
                verificationSteps: expect.arrayContaining([
                    '用德鲁伊测试目标未行动、已行动、等级高于德鲁伊、等级等于德鲁伊、同联盟不同队伍五种情况能否支援。',
                    '用狼或狼骑射手先移动若干格后攻击，记录攻击后可移动范围是否等于攻击前剩余移动力。'
                ]),
                recordTemplate: expect.arrayContaining([
                    '支援：未行动目标 可/不可；已行动目标 可/不可；高等级目标 可/不可；等等级目标 可/不可；同联盟不同队伍目标 可/不可'
                ])
            })
        );
        expect(report.manualVerificationItems.find(item => item.id === 'counter-blind-storm-order')).toEqual(
            expect.objectContaining({
                verificationSteps: expect.arrayContaining([
                    '用黑魔法师或狼骑射手本次攻击附加致盲，目标为可普通反击单位，记录本次反击是否发生。',
                    '分别测试鼓舞攻击者、虚弱防守者、鼓舞攻击虚弱防守者的近战和远程伤害。'
                ]),
                recordTemplate: expect.arrayContaining([
                    '反击风暴距离 1/2/3：发生情况：'
                ])
            })
        );
    });

    it('固化待实机验证边界的当前项目探针输出', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');
        const byId = Object.fromEntries(report.projectProbeItems.map(item => [item.id, item]));

        expect(byId['support-assault-project-probe'].currentProjectBehavior).toEqual({
            support: {
                initialSupportActionCount: 2,
                targetHasActedAfterSupport: false,
                targetHasMovedAfterSupport: false,
                targetMovementRemainingAfterSupport: 4,
                targetSupportedFlagAfterSupport: true,
                supporterHasActedAfterSupport: true,
                secondSupportAvailableAfterTargetActsAgain: false,
                freshTargetSupportAvailable: false,
                highLevelTargetSupportAvailable: false,
                equalLevelTargetSupportAvailable: true,
                alliedTeamSupportAvailable: false
            },
            assault: {
                movementRemainingAfterMove: 4,
                movementRemainingAfterAttack: 4,
                hasActedAfterAttack: true,
                postAttackMoveCount: 10,
                farthestPostAttackMoveDistance: 4,
                oneStepPostAttackMoveResolved: true,
                movementRemainingAfterPostAttackMove: 3,
                hasPostAttackMovedAfterPostAttackMove: true,
                postAttackMoveAvailableAfterPostAttackMove: false
            }
        });
        expect(byId['counter-blind-storm-project-probe'].currentProjectBehavior).toEqual({
            normalCounterAtRange1: {
                attackerHpAfterAttack: 75,
                normalCounterTriggered: true
            },
            blindingAttackAgainstNormalCounter: {
                defenderStatusAfterAttack: 'blinded',
                attackerHpAfterAttack: 100,
                normalCounterTriggered: false
            },
            rangedNormalCounterAtRange2: {
                attackerHpAfterAttack: 100,
                normalCounterTriggered: false
            },
            counterStatusApplication: {
                attackerStatusAfterCounter: 'poisoned',
                attackerStatusRemainingTicks: 2
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
            },
            activeKillPreventsCounter: {
                attackerHpAfterAttack: 100,
                defenderAliveAfterAttack: false
            },
            counterKillClearsAssaultPostMove: {
                attackerAliveAfterCounter: false,
                attackerGraveCreated: true,
                postAttackMoveAvailable: false
            }
        });
        expect(byId['status-damage-project-probe'].currentProjectBehavior).toEqual({
            meleeSoldierVsSoldier: {
                normal: 50,
                inspired: 60,
                weakened: 60,
                inspiredAgainstWeakened: 70
            },
            rangedArcherVsSoldier: {
                normal: 40,
                inspired: 45,
                weakened: 45,
                inspiredAgainstWeakened: 50
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
            secondHeal: { available: false, hp: 130, maxHp: 100, exceededMaxHp: true },
            turnStartRecovery: { hp: 100, maxHp: 100 },
            levelUp: { triggered: true, level: 1, hp: 130 },
            undeadPoison: { hp: 100, maxHp: 100, remainingTicks: 1 }
        });
        expect(byId['undead-overheal'].actual).toEqual({
            poison95: { hp: 100, maxHp: 100, remainingTicks: 1 },
            poison100: { hp: 100, maxHp: 100, remainingTicks: 1 },
            grave95: { hp: 100, maxHp: 100, graveCount: 0 },
            grave100: { hp: 100, maxHp: 100, graveCount: 0 },
            grave130: { hp: 100, maxHp: 100, graveCount: 0 }
        });
        expect(byId['terrain-defense-combat'].actual).toEqual({
            apkTile: { id: 33, defenseBonus: 20 },
            soldierDefenderDamage: 30,
            flyingDefenderDamage: 50
        });
        expect(byId['default-commander-income'].actual).toEqual({
            staticEvidence: {
                languageConfirmsCommanderIncome: true,
                dexRuleDataConstructorDefaults: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                dexSetterFields: { incomeCommanderBase: 'Lc/a/b/a/t/d;.s:I', incomeCommanderGrowth: 'Lc/a/b/a/t/d;.t:I' },
                sdControllerHasLiteralRuleConfig: false,
                soControllerRuleIncome: null,
                explicitZeroCommanderIncomeScriptCount: 7
            },
            sd: {
                rules: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 50, level1: 75, level2: 100, noCommander: 0 }
            },
            so: {
                rules: { incomeCommanderBase: 50, incomeCommanderGrowth: 25 },
                goldAfterTurnStart: { level0: 50, level1: 75, level2: 100, noCommander: 0 }
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
        expect(byId['training-scenario-terrain-gate'].actual).toEqual({
            scenarioCount: 40,
            modes: ['SD', 'SO'],
            approximateTerrainIds: [30, 31],
            unverifiedApproximateTerrainIds: [],
            scenariosWithUnverifiedApproximate: []
        });
        expect(byId['dex-operation-order-evidence'].actual).toEqual({
            dexPath: 'APK/_analysis/unpack/classes.dex',
            methodCount: 8,
            missingExpectationCount: 0,
            requiredOperationOrders: [
                {
                    id: 'support-target-validation',
                    operationOrderMatched: true,
                    missingOperationOrderExpectations: []
                },
                {
                    id: 'counter-attack-validation',
                    operationOrderMatched: true,
                    missingOperationOrderExpectations: []
                },
                {
                    id: 'attack-status-application',
                    operationOrderMatched: true,
                    missingOperationOrderExpectations: []
                }
            ]
        });
        expect(byId['opencode-counter-status-semantics'].actual).toEqual({
            normalCounterAtRange1: true,
            normalCounterAtRange2: false,
            newBlindCancelsOrdinaryCounter: true,
            counterStormAtRange2: true,
            counterStormAtRange3: false,
            counterAttackAppliesPoison: {
                attackerStatusAfterCounter: 'poisoned',
                attackerStatusRemainingTicks: 2
            }
        });
        expect(byId['opencode-support-same-team-semantics'].actual).toEqual({
            sameTeamSupportAvailable: true,
            alliedDifferentTeamSupportAvailable: false,
            secondSupportAvailableAfterTargetActsAgain: false
        });
        expect(byId['opencode-t80-t83-terrain-semantics'].actual).toEqual({
            t80: { kind: 4, flagA: 1, defenseBonus: 10, moveCost: 1, healPerTurn: 20, projectTerrainId: 12, terrainKey: 'temple', income: 0, actionTypes: [] },
            t81: { kind: 8, flagA: 0, defenseBonus: 10, moveCost: 3, healPerTurn: 0, projectTerrainId: 2, terrainKey: 'deep_water', income: 0, actionTypes: [] },
            t82: { kind: 3, flagA: 0, defenseBonus: 10, moveCost: 3, healPerTurn: 0, projectTerrainId: 2, terrainKey: 'deep_water', income: 0, actionTypes: [] },
            t83: { kind: 3, flagA: 0, defenseBonus: 10, moveCost: 3, healPerTurn: 20, projectTerrainId: 16, terrainKey: 'water_temple', income: 0, actionTypes: [] }
        });
        expect(byId['language-rule-evidence'].actual).toEqual({
            langPath: 'APK/_analysis/unpack/assets/languages/en.lang',
            checkCount: 28,
            failedCheckCount: 0,
            requiredChecks: [
                { id: 'language-entries', status: 'pass' },
                { id: 'support-restrictions', status: 'pass' },
                { id: 'support-reset-action', status: 'pass' },
                { id: 'combat-modifiers', status: 'pass' },
                { id: 'assault-post-attack-move', status: 'pass' },
                { id: 'aura-abilities', status: 'pass' },
                { id: 'summon-and-undead-graves', status: 'pass' },
                { id: 'single-status-slot', status: 'pass' },
                { id: 'tile-language-rules', status: 'pass' },
                { id: 'status-blind-weaken', status: 'pass' }
            ]
        });
        expect(byId['script-rule-evidence'].actual).toEqual({
            manifestScriptCount: 27,
            apiCallKindCount: 60,
            literalRuleConfigCount: 26,
            literalStageStateConfigCount: 4,
            applicationCheckCount: 7,
            failedApplicationCheckCount: 0,
            requiredApplicationChecks: [
                { id: 'rule-config-observation', status: 'pass' },
                { id: 'so-recruit-observation', status: 'pass' },
                { id: 'team-rule-observation', status: 'pass' },
                { id: 'team-rule-turn-application', status: 'pass' },
                { id: 'script-income-application', status: 'pass' },
                { id: 'stage-move-override-observation', status: 'pass' },
                { id: 'stage-status-observation', status: 'pass' }
            ]
        });
        expect(byId['data-bin-manifest-evidence'].actual).toEqual({
            unitClassCount: 21,
            apkUnitIdCount: 21,
            projectMissingApkUnitClasses: [],
            apkMissingProjectUnitClasses: [],
            projectCostedUnitCount: 18,
            ruleDrivenUnitCosts: ['commander', 'crystal', 'skeleton'],
            abilityIdCount: 26,
            abilityRoundTripCount: 26,
            statusIdCount: 4,
            statusRoundTripCount: 4,
            terrainCount: 84,
            expectedTerrainCount: 84,
            terrainRecordSize: 40,
            terrainMappingSummary: {
                confirmed: 4,
                atlas: 73,
                approximate: 7,
                unmapped: 0
            }
        });
        expect(byId['setup-applied-to-gameplay'].actual).toEqual({
            playerGold: [450, 450],
            rules: { initialGold: 450, unitLimit: 20, levelCap: 1 },
            unitLimitBlocksRecruit: true,
            levelAfterAtCapAttack: 1,
            expAfterAtCapAttack: 630
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
                canControlOtherUnit: true,
                canRecruitAgain: false
            },
            commanderCastle: {
                playerGold: 850,
                pendingUnitId: 'u_100',
                pendingUnit: {
                    unitClass: 'soldier',
                    x: 0,
                    y: 0,
                    hasMoved: false,
                    hasActed: false,
                    movementRemaining: null,
                    source: 'commander_castle'
                },
                actionTypes: ['move', 'wait'],
                canControlOtherUnit: false,
                canRecruitAgain: false
            },
            commanderCastleNoDeployTarget: {
                canRecruitAndDeploy: false,
                actionTypes: ['end_turn', 'recruit_to_castle', 'surrender', 'wait']
            }
        });
    });

    it('固化 t30/t31、投降和淘汰行为', () => {
        const report = buildApkSkirmishRuleReport('2026-06-30T00:00:00.000Z');
        const byId = Object.fromEntries(report.checks.map(check => [check.id, check]));

        expect(byId['t30-t31-recovery'].actual).toEqual({
            t30Poisoned: { hp: 40, status: 'poisoned', remainingTicks: 1, remainingTurns: null },
            t31Poisoned: { hp: 70, status: null, remainingTicks: null, remainingTurns: null },
            t30Blinded: { hp: 70, status: 'blinded', remainingTicks: null, remainingTurns: 0 },
            t31Blinded: { hp: 70, status: null, remainingTicks: null, remainingTurns: null },
            t30Weakened: { hp: 70, status: 'weakened', remainingTicks: null, remainingTurns: 0 },
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
