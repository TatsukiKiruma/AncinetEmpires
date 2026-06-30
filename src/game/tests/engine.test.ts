import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv, calculateArmyValue, decodeAction, encodeAction, getActionSpaceSchema } from '../env';
import type { Action } from '../types';
import { createDemoState } from '../demo_map';
import { createDefaultAppGameState } from '../default_state';
import { TERRAIN_CONFIG, UNIT_CONFIGS } from '../constants';
import { calculateDamage, getLegalActions } from '../rules';
import { getMoveCostTo, getReachablePositions } from '../map';
import { getMoveCostForUnit, isFlying, isWaterTerrain, isMountainTerrain, isForestTerrain, getAttackBonus, getDefenseBonus, clearNegativeStatus, getEffectiveStats, getExpThresholdForLevel, addExp } from '../abilities';
import { APK_ABILITY_ID_TO_TYPE, APK_ABILITY_TYPE_TO_ID, APK_STATUS_ID_TO_TYPE, APK_STATUS_TYPE_TO_ID, APK_UNIT_CLASS_TO_ID, APK_UNIT_ID_TO_CLASS } from '../apk_compat';
import { APK_RELEASE_SHA256, APK_RELEASE_VERSION, APK_SKIRMISH_MAP_MANIFEST, getApkSkirmishMapManifestEntry, getApkSkirmishTerrainUsageSummary, getApkSkirmishTerrainVerificationTargets, getApkSkirmishTrainingMapManifest, matchesApkSkirmishMapManifest } from '../apk_manifest';
import { APK_TERRAIN_CONFIGS, APK_TERRAIN_COUNT, APK_TERRAIN_RECORD_SIZE, getApkTerrainConfig, getKnownApkTerrainIdsForProject, getSkirmishApkTerrainIdsForProject, getSkirmishApkTerrainMappingInfo, mapKnownApkTerrainId, mapSkirmishApkTerrainId } from '../apk_terrain';
import { APK_AEM_MAGIC, APK_AEM_ZERO_SUFFIX_TAIL_HEX, parseApkAemMap, getApkAemTerrainUsage, createGameStateFromApkAemMap, getApkAemTerrainConfidenceUsage, getUnmappedSkirmishApkTerrainIds } from '../apk_map';
import { APK_SCRIPT_API_CALL_COUNTS, APK_SCRIPT_DECRYPTED_JS_FILE_COUNT, APK_SCRIPT_DECRYPTION_INFO, APK_SCRIPT_LITERAL_RULE_CONFIGS, APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS, APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS, getApkScriptApiCallCount, getApkScriptLiteralRuleConfig, getApkScriptLiteralStageStateConfig } from '../apk_script_manifest';
import { applyApkScriptRuleConfig, applyApkScriptStageStateConfig, buildApkScriptRuleConfig, getApkScriptRuleConfig } from '../apk_script_config';
import { createApkSkirmishGameState, createApkSkirmishTrainingEnv, createApkSkirmishTrainingGameState, getApkSkirmishRuleConfig, getApkSkirmishSetupOptions, getApkSkirmishTrainingScenario, getApkSkirmishTrainingScenarios, resolveApkSkirmishSetupSelection } from '../apk_skirmish';
import { RandomAI } from '../ai/random_ai';
import { HeuristicAI } from '../ai/heuristic_ai';
import { ruleSetIncomeCastle, ruleSetIncomeCommanderBase, ruleSetIncomeCommanderGrowth, ruleSetIncomeVillage, ruleSetLevelCap, ruleSetPrices, ruleSetUnitPrice } from '../apk_rule';
import { checkCastle, checkCommander, checkGameOver, checkPlayerTeam, checkTeamDestroyed, checkVillage, countCastle, countUnit, countVillage, getAliveAlliances, getBoolean, getCommander, getCurrentTeam, getDistance as getStageDistance, getInteger, getTileTeam, getUnit, getUnits, putBoolean, putInteger, syncChangeGold, syncDestroyTeam, syncDisableTeam, syncGameOver, syncOverrideMov, syncRestoreTeam, syncSetAlliance, syncSetCommander, syncSetCurrentTeam, syncSetGold, syncSetGoldForTeam, syncSetRecruitUnits, syncSetRecruitUnitsForTeam, syncSetUnitCode, syncSetUnitHead, syncSetUnitHeadWithCode, syncSetUnitLevel, syncSetUnitLimit, syncSetUnitLimitForTeam, syncSetUnitStatic, syncSetUnitStaticWithCode, syncSetUnitStatus, syncSetUnitTargeted, syncSetUnitTargetedWithCode } from '../apk_stage';
import { getTileDefenseBonus, getTileHealPerTurn, getTileMoveCost, getTileTerrainKey } from '../terrain_rules';
import { getUnitCost } from '../rule_config';

describe('GameEngine Rules', () => {

    it('应用默认对局使用 APK SD skirmish 规则', () => {
        const state = createDefaultAppGameState();

        expect(state.players.map(player => player.gold)).toEqual([300, 300]);
        expect(state.rules).toEqual(getApkSkirmishRuleConfig('SD'));
        expect(getLegalActions(state, 0).some(action => action.type === 'surrender')).toBe(true);
        expect(getLegalActions(state, 0).some(action => (
            (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy')
            && action.unitClass === 'skeleton'
        ))).toBe(false);
    });

    it('17类地形配置存在，数值正确', () => {
        expect(TERRAIN_CONFIG[1].key).toBe('snow');
        expect(TERRAIN_CONFIG[1].moveCost).toBe(1);
        expect(TERRAIN_CONFIG[1].defenseBonus).toBe(5); // 雪地
        expect(TERRAIN_CONFIG[9].key).toBe('town');
        expect(TERRAIN_CONFIG[9].defenseBonus).toBe(15); // 城镇
        expect(TERRAIN_CONFIG[9].healPerTurn).toBe(20);
        expect(TERRAIN_CONFIG[9].incomePerTurn).toBe(50);
        expect(TERRAIN_CONFIG[10].key).toBe('castle');
        expect(TERRAIN_CONFIG[10].defenseBonus).toBe(15);
        expect(TERRAIN_CONFIG[10].healPerTurn).toBe(20);
        expect(TERRAIN_CONFIG[10].incomePerTurn).toBe(100); // 城堡
        expect(TERRAIN_CONFIG[17].key).toBe('bridge');
        expect(TERRAIN_CONFIG[17].tags).toContain('water');
        expect(TERRAIN_CONFIG[12].tags).toContain('cleanse');
        expect(TERRAIN_CONFIG[16].tags).toContain('cleanse');
        
        expect(Object.keys(TERRAIN_CONFIG).length).toBe(17);
    });

    it('APK 84 条 tile 原始规则表已归档并包含高可信映射', () => {
        expect(APK_TERRAIN_RECORD_SIZE).toBe(40);
        expect(APK_TERRAIN_COUNT).toBe(84);
        expect(APK_TERRAIN_CONFIGS).toHaveLength(84);

        const ruin = getApkTerrainConfig(27)!;
        const village = getApkTerrainConfig(36)!;
        const castle = getApkTerrainConfig(37)!;
        const bridge = getApkTerrainConfig(72)!;

        expect(ruin.defenseBonus).toBe(10);
        expect(ruin.moveCost).toBe(1);
        expect(ruin.linkedC).toBe(36);
        expect(village.defenseBonus).toBe(15);
        expect(village.healPerTurn).toBe(20);
        expect(village.linkedB).toBe(27);
        expect(castle.defenseBonus).toBe(15);
        expect(castle.healPerTurn).toBe(20);
        expect(bridge.kind).toBe(1);
        expect(bridge.moveCost).toBe(1);

        expect(mapKnownApkTerrainId(27)).toBe(8);
        expect(mapKnownApkTerrainId(36)).toBe(9);
        expect(mapKnownApkTerrainId(37)).toBe(10);
        expect(mapKnownApkTerrainId(72)).toBe(17);
        expect(getKnownApkTerrainIdsForProject(9)).toEqual([36]);
        expect(mapKnownApkTerrainId(2)).toBeNull();

        expect(mapSkirmishApkTerrainId(2)).toBe(2);
        expect(mapSkirmishApkTerrainId(15)).toBe(7);
        expect(mapSkirmishApkTerrainId(17)).toBe(3);
        expect(mapSkirmishApkTerrainId(28)).toBe(17);
        expect(mapSkirmishApkTerrainId(36)).toBe(9);
        expect(getSkirmishApkTerrainIdsForProject(17)).toEqual([28, 29, 72]);
        expect(getSkirmishApkTerrainMappingInfo(36)).toEqual(expect.objectContaining({
            projectTerrainId: 9,
            confidence: 'confirmed'
        }));
        expect(getSkirmishApkTerrainMappingInfo(18)).toEqual(expect.objectContaining({
            projectTerrainId: 1,
            confidence: 'atlas'
        }));
        expect(getSkirmishApkTerrainMappingInfo(31)).toEqual(expect.objectContaining({
            projectTerrainId: 12,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(30)).toEqual(expect.objectContaining({
            projectTerrainId: 11,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'low_confidence_camp_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(80)).toEqual(expect.objectContaining({
            projectTerrainId: 12,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(81)).toEqual(expect.objectContaining({
            projectTerrainId: 2,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'low_confidence_water_obstacle_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(82)).toEqual(expect.objectContaining({
            projectTerrainId: 2,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'low_confidence_water_obstacle_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(83)).toEqual(expect.objectContaining({
            projectTerrainId: 16,
            confidence: 'approximate',
            evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_water_temple_semantics']
        }));
        expect(getSkirmishApkTerrainMappingInfo(999)).toEqual({
            apkTerrainId: 999,
            projectTerrainId: null,
            confidence: 'unmapped',
            evidence: []
        });
    });

    it('APK skirmish 官方地图清单代码化并可校验来源', () => {
        expect(APK_RELEASE_VERSION).toBe('aer-release-4.2.5.1');
        expect(APK_RELEASE_SHA256).toBe('51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B');
        expect(APK_SKIRMISH_MAP_MANIFEST).toHaveLength(20);
        expect(APK_SKIRMISH_MAP_MANIFEST.map(entry => entry.name)).toEqual([
            '(4) Crossroads.aem',
            '(3) Frozen fields.aem',
            '(2) Icy Paths.aem',
            '(2) Liberty Port.aem',
            '(2) Mourningstar.aem',
            '(2) Peak Island.aem',
            '(4) Shadowlands.aem',
            '(4) Solitude.aem',
            '(2) The Crossing.aem',
            '(4) The Crucible.aem',
            '(4) Waterways.aem',
            '(4) Winterstorm.aem',
            '(4) classic 1.aem',
            '(3) classic 2.aem',
            '(2) Duel.aem',
            '(2) Crossed swords.aem',
            '(4) Critical mass.aem',
            '(3) Midway.aem',
            '(2) Swamplands.aem',
            '(3) Glu.aem'
        ]);

        const duelManifest = getApkSkirmishMapManifestEntry('(2) Duel.aem')!;
        expect(duelManifest).toEqual({
            name: '(2) Duel.aem',
            resourcePath: 'assets/maps/(2) Duel.aem',
            width: 13,
            height: 13,
            author: 'youxing',
            playerIds: [0, 1],
            initialUnitCount: 2,
            initialUnits: [
                { teamId: 1, x: 9, y: 6, apkUnitId: 9, extra: 0 },
                { teamId: 0, x: 4, y: 4, apkUnitId: 9, extra: 0 }
            ],
            castleOwnerCounts: { '0': 1, '1': 1 },
            villageOwnerCounts: { '1': 1, N: 4 },
            tileUsage: { 0: 67, 1: 6, 2: 7, 3: 7, 5: 3, 6: 7, 7: 5, 8: 2, 9: 7, 10: 5, 11: 7, 12: 3, 13: 2, 15: 7, 16: 4, 17: 6, 18: 4, 19: 4, 20: 2, 21: 2, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 36: 5, 37: 2 },
            terrainConfidence: {
                tileCount: 169,
                byConfidence: {
                    confirmed: 8,
                    atlas: 161,
                    approximate: 0,
                    unmapped: 0
                },
                approximateTerrainIds: [],
                approximateTileCount: 0,
                unmappedTerrainIds: [],
                unmappedTileCount: 0
            },
            unmappedTerrainIds: [],
            recommendedGold: 200,
            tailTemplate: 'zero_suffix_58'
        });
        expect(APK_SKIRMISH_MAP_MANIFEST.every(entry => entry.initialUnitCount === entry.initialUnits.length)).toBe(true);
        expect(APK_SKIRMISH_MAP_MANIFEST.every(entry => {
            const tileCount = Object.values(entry.tileUsage).reduce((sum, count) => sum + count, 0);
            return tileCount === entry.width * entry.height;
        })).toBe(true);
        expect([...new Set(APK_SKIRMISH_MAP_MANIFEST.map(entry => entry.tailTemplate))]).toEqual(['zero_suffix_58']);
        expect(APK_SKIRMISH_MAP_MANIFEST.flatMap(entry => entry.unmappedTerrainIds)).toEqual([]);
        expect(APK_SKIRMISH_MAP_MANIFEST.every(entry => entry.terrainConfidence.tileCount === entry.width * entry.height)).toBe(true);
        expect(APK_SKIRMISH_MAP_MANIFEST.filter(entry => entry.terrainConfidence.approximateTileCount > 0).map(entry => ({
            name: entry.name,
            approximateTerrainIds: entry.terrainConfidence.approximateTerrainIds,
            approximateTileCount: entry.terrainConfidence.approximateTileCount
        }))).toEqual([
            { name: '(2) Mourningstar.aem', approximateTerrainIds: [30], approximateTileCount: 2 },
            { name: '(4) The Crucible.aem', approximateTerrainIds: [31], approximateTileCount: 1 },
            { name: '(4) Waterways.aem', approximateTerrainIds: [31], approximateTileCount: 2 },
            { name: '(4) Winterstorm.aem', approximateTerrainIds: [31], approximateTileCount: 4 }
        ]);
        const verificationTargets = getApkSkirmishTerrainVerificationTargets();
        expect(verificationTargets).toHaveLength(4);
        expect(verificationTargets).toMatchObject([
            {
                mapName: '(2) Mourningstar.aem',
                resourcePath: 'assets/maps/(2) Mourningstar.aem',
                playerCount: 2,
                apkTerrainId: 30,
                tileCount: 2,
                positions: [
                    { x: 3, y: 4, ownerCode: 0xff, ownerId: null },
                    { x: 7, y: 6, ownerCode: 0xff, ownerId: null }
                ],
                projectTerrainId: 11,
                confidence: 'approximate',
                evidence: ['data_bin_values', 'texture_atlas', 'low_confidence_camp_semantics'],
                terrainConfig: {
                    id: 30,
                    kind: 5,
                    flagA: 1,
                    variant: 0,
                    linkedA: -1,
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    flagB: 0,
                    linkedB: -1,
                    linkedC: -1,
                    flagC: 0,
                    tail: '0x00000000'
                },
                projectRuleSemantics: {
                    projectTerrainKey: 'camp',
                    projectTerrainName: '野外营地',
                    projectTerrainTags: ['land', 'building', 'camp', 'healing', 'not_capturable', 'not_recruit_source'],
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    clearsNegativeStatus: false,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false,
                    canBeDestroyed: false,
                    canBeRepaired: false,
                    isWater: false,
                    isLand: true
                },
                manualChecks: [
                    { key: 'projectTerrainKey', currentProjectValue: 'camp' },
                    { key: 'defenseBonus', currentProjectValue: 10 },
                    { key: 'healPerTurn', currentProjectValue: 20 },
                    { key: 'moveCost', currentProjectValue: 1 },
                    { key: 'clearsNegativeStatus', currentProjectValue: false },
                    { key: 'canBeCaptured', currentProjectValue: false },
                    { key: 'generatesIncome', currentProjectValue: false },
                    { key: 'canRecruit', currentProjectValue: false },
                    { key: 'canBeDestroyed', currentProjectValue: false },
                    { key: 'canBeRepaired', currentProjectValue: false },
                    { key: 'isWater', currentProjectValue: false },
                    { key: 'isLand', currentProjectValue: true }
                ]
            },
            {
                mapName: '(4) The Crucible.aem',
                resourcePath: 'assets/maps/(4) The Crucible.aem',
                playerCount: 4,
                apkTerrainId: 31,
                tileCount: 1,
                positions: [
                    { x: 9, y: 9, ownerCode: 0xff, ownerId: null }
                ],
                projectTerrainId: 12,
                confidence: 'approximate',
                evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics'],
                terrainConfig: {
                    id: 31,
                    kind: 8,
                    flagA: 1,
                    variant: 5,
                    linkedA: -1,
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    flagB: 0,
                    linkedB: -1,
                    linkedC: -1,
                    flagC: 0,
                    tail: '0x00000000'
                },
                projectRuleSemantics: {
                    projectTerrainKey: 'temple',
                    projectTerrainName: '神庙',
                    projectTerrainTags: ['land', 'building', 'temple', 'healing', 'cleanse'],
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    clearsNegativeStatus: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false,
                    canBeDestroyed: false,
                    canBeRepaired: false,
                    isWater: false,
                    isLand: true
                },
                manualChecks: [
                    { key: 'projectTerrainKey', currentProjectValue: 'temple' },
                    { key: 'defenseBonus', currentProjectValue: 10 },
                    { key: 'healPerTurn', currentProjectValue: 20 },
                    { key: 'moveCost', currentProjectValue: 1 },
                    { key: 'clearsNegativeStatus', currentProjectValue: true },
                    { key: 'canBeCaptured', currentProjectValue: false },
                    { key: 'generatesIncome', currentProjectValue: false },
                    { key: 'canRecruit', currentProjectValue: false },
                    { key: 'canBeDestroyed', currentProjectValue: false },
                    { key: 'canBeRepaired', currentProjectValue: false },
                    { key: 'isWater', currentProjectValue: false },
                    { key: 'isLand', currentProjectValue: true }
                ]
            },
            {
                mapName: '(4) Waterways.aem',
                resourcePath: 'assets/maps/(4) Waterways.aem',
                playerCount: 4,
                apkTerrainId: 31,
                tileCount: 2,
                positions: [
                    { x: 7, y: 8, ownerCode: 0xff, ownerId: null },
                    { x: 7, y: 11, ownerCode: 0xff, ownerId: null }
                ],
                projectTerrainId: 12,
                confidence: 'approximate',
                evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics'],
                terrainConfig: {
                    id: 31,
                    kind: 8,
                    flagA: 1,
                    variant: 5,
                    linkedA: -1,
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    flagB: 0,
                    linkedB: -1,
                    linkedC: -1,
                    flagC: 0,
                    tail: '0x00000000'
                },
                projectRuleSemantics: {
                    projectTerrainKey: 'temple',
                    projectTerrainName: '神庙',
                    projectTerrainTags: ['land', 'building', 'temple', 'healing', 'cleanse'],
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    clearsNegativeStatus: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false,
                    canBeDestroyed: false,
                    canBeRepaired: false,
                    isWater: false,
                    isLand: true
                },
                manualChecks: [
                    { key: 'projectTerrainKey', currentProjectValue: 'temple' },
                    { key: 'defenseBonus', currentProjectValue: 10 },
                    { key: 'healPerTurn', currentProjectValue: 20 },
                    { key: 'moveCost', currentProjectValue: 1 },
                    { key: 'clearsNegativeStatus', currentProjectValue: true },
                    { key: 'canBeCaptured', currentProjectValue: false },
                    { key: 'generatesIncome', currentProjectValue: false },
                    { key: 'canRecruit', currentProjectValue: false },
                    { key: 'canBeDestroyed', currentProjectValue: false },
                    { key: 'canBeRepaired', currentProjectValue: false },
                    { key: 'isWater', currentProjectValue: false },
                    { key: 'isLand', currentProjectValue: true }
                ]
            },
            {
                mapName: '(4) Winterstorm.aem',
                resourcePath: 'assets/maps/(4) Winterstorm.aem',
                playerCount: 4,
                apkTerrainId: 31,
                tileCount: 4,
                positions: [
                    { x: 0, y: 0, ownerCode: 0xff, ownerId: null },
                    { x: 12, y: 0, ownerCode: 0xff, ownerId: null },
                    { x: 0, y: 12, ownerCode: 0xff, ownerId: null },
                    { x: 12, y: 12, ownerCode: 0xff, ownerId: null }
                ],
                projectTerrainId: 12,
                confidence: 'approximate',
                evidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics'],
                terrainConfig: {
                    id: 31,
                    kind: 8,
                    flagA: 1,
                    variant: 5,
                    linkedA: -1,
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    flagB: 0,
                    linkedB: -1,
                    linkedC: -1,
                    flagC: 0,
                    tail: '0x00000000'
                },
                projectRuleSemantics: {
                    projectTerrainKey: 'temple',
                    projectTerrainName: '神庙',
                    projectTerrainTags: ['land', 'building', 'temple', 'healing', 'cleanse'],
                    defenseBonus: 10,
                    healPerTurn: 20,
                    moveCost: 1,
                    clearsNegativeStatus: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false,
                    canBeDestroyed: false,
                    canBeRepaired: false,
                    isWater: false,
                    isLand: true
                },
                manualChecks: [
                    { key: 'projectTerrainKey', currentProjectValue: 'temple' },
                    { key: 'defenseBonus', currentProjectValue: 10 },
                    { key: 'healPerTurn', currentProjectValue: 20 },
                    { key: 'moveCost', currentProjectValue: 1 },
                    { key: 'clearsNegativeStatus', currentProjectValue: true },
                    { key: 'canBeCaptured', currentProjectValue: false },
                    { key: 'generatesIncome', currentProjectValue: false },
                    { key: 'canRecruit', currentProjectValue: false },
                    { key: 'canBeDestroyed', currentProjectValue: false },
                    { key: 'canBeRepaired', currentProjectValue: false },
                    { key: 'isWater', currentProjectValue: false },
                    { key: 'isLand', currentProjectValue: true }
                ]
            }
        ]);
        expect(verificationTargets.map(target => ({
            apkTerrainId: target.apkTerrainId,
            status: target.manualVerification.status,
            observedAt: target.manualVerification.observedAt,
            observed: target.manualVerification.observed
        }))).toEqual([
            {
                apkTerrainId: 30,
                status: 'confirmed',
                observedAt: '2026-06-30',
                observed: {
                    canHeal: true,
                    clearsPoisoned: false,
                    clearsBlinded: false,
                    clearsWeakened: false,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false
                }
            },
            {
                apkTerrainId: 31,
                status: 'confirmed',
                observedAt: '2026-06-30',
                observed: {
                    canHeal: true,
                    clearsPoisoned: true,
                    clearsBlinded: true,
                    clearsWeakened: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false
                }
            },
            {
                apkTerrainId: 31,
                status: 'confirmed',
                observedAt: '2026-06-30',
                observed: {
                    canHeal: true,
                    clearsPoisoned: true,
                    clearsBlinded: true,
                    clearsWeakened: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false
                }
            },
            {
                apkTerrainId: 31,
                status: 'confirmed',
                observedAt: '2026-06-30',
                observed: {
                    canHeal: true,
                    clearsPoisoned: true,
                    clearsBlinded: true,
                    clearsWeakened: true,
                    canBeCaptured: false,
                    generatesIncome: false,
                    canRecruit: false
                }
            }
        ]);
        const mutableVerificationTarget = getApkSkirmishTerrainVerificationTargets({ mapNames: ['(2) Mourningstar.aem'] })[0];
        mutableVerificationTarget.evidence.push('mutated');
        mutableVerificationTarget.terrainConfig!.moveCost = 99;
        mutableVerificationTarget.positions[0].x = 99;
        mutableVerificationTarget.projectRuleSemantics.projectTerrainTags.push('mutated');
        mutableVerificationTarget.manualChecks.push({ key: 'mutated', currentProjectValue: true });
        expect(getApkSkirmishTerrainVerificationTargets({ mapNames: ['(2) Mourningstar.aem'] })[0]).toMatchObject({
            positions: [
                { x: 3, y: 4, ownerCode: 0xff, ownerId: null },
                { x: 7, y: 6, ownerCode: 0xff, ownerId: null }
            ],
            evidence: ['data_bin_values', 'texture_atlas', 'low_confidence_camp_semantics'],
            terrainConfig: { moveCost: 1 },
            projectRuleSemantics: {
                projectTerrainTags: ['land', 'building', 'camp', 'healing', 'not_capturable', 'not_recruit_source']
            },
            manualChecks: expect.arrayContaining([
                { key: 'projectTerrainKey', currentProjectValue: 'camp' },
                { key: 'clearsNegativeStatus', currentProjectValue: false }
            ])
        });
        expect(getApkSkirmishTerrainVerificationTargets({ mapNames: ['(2) Mourningstar.aem'] })[0].manualChecks).toEqual(expect.not.arrayContaining([
            { key: 'mutated', currentProjectValue: true }
        ]));
        expect(getApkSkirmishTerrainVerificationTargets({ confidences: ['confirmed'], apkTerrainIds: [37] }).map(target => ({
            mapName: target.mapName,
            tileCount: target.tileCount,
            confidence: target.confidence,
            projectTerrainId: target.projectTerrainId,
            defenseBonus: target.terrainConfig?.defenseBonus
        }))).toEqual([
            { mapName: '(2) Crossed swords.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Duel.aem', tileCount: 2, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Icy Paths.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Liberty Port.aem', tileCount: 3, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Mourningstar.aem', tileCount: 2, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Peak Island.aem', tileCount: 2, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) Swamplands.aem', tileCount: 2, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(2) The Crossing.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(3) Frozen fields.aem', tileCount: 3, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(3) Glu.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(3) Midway.aem', tileCount: 6, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(3) classic 2.aem', tileCount: 3, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Critical mass.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Crossroads.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Shadowlands.aem', tileCount: 10, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Solitude.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) The Crucible.aem', tileCount: 8, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Waterways.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) Winterstorm.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 },
            { mapName: '(4) classic 1.aem', tileCount: 4, confidence: 'confirmed', projectTerrainId: 10, defenseBonus: 15 }
        ]);
        const terrainUsageSummary = getApkSkirmishTerrainUsageSummary();
        expect(terrainUsageSummary.reduce((sum, entry) => sum + entry.tileCount, 0)).toBe(4207);
        expect(terrainUsageSummary.every(entry => entry.mapCount === entry.mapNames.length)).toBe(true);
        expect(getApkSkirmishTerrainUsageSummary({ confidences: ['unmapped'] })).toEqual([]);
        expect(getApkSkirmishTerrainUsageSummary({ confidences: ['approximate'] }).map(entry => ({
            apkTerrainId: entry.apkTerrainId,
            tileCount: entry.tileCount,
            mapCount: entry.mapCount,
            projectTerrainId: entry.projectTerrainId,
            confidence: entry.confidence,
            mapNames: entry.mapNames
        }))).toEqual([
            {
                apkTerrainId: 30,
                tileCount: 2,
                mapCount: 1,
                projectTerrainId: 11,
                confidence: 'approximate',
                mapNames: ['(2) Mourningstar.aem']
            },
            {
                apkTerrainId: 31,
                tileCount: 7,
                mapCount: 3,
                projectTerrainId: 12,
                confidence: 'approximate',
                mapNames: ['(4) The Crucible.aem', '(4) Waterways.aem', '(4) Winterstorm.aem']
            }
        ]);
        expect(getApkSkirmishTerrainUsageSummary({
            apkTerrainIds: [30, 31],
            mapNames: ['(4) Winterstorm.aem']
        }).map(entry => ({
            apkTerrainId: entry.apkTerrainId,
            tileCount: entry.tileCount,
            mapNames: entry.mapNames
        }))).toEqual([
            { apkTerrainId: 31, tileCount: 4, mapNames: ['(4) Winterstorm.aem'] }
        ]);
        expect(getApkSkirmishTrainingMapManifest().map(entry => entry.name)).toEqual([
            '(4) Crossroads.aem',
            '(3) Frozen fields.aem',
            '(2) Icy Paths.aem',
            '(2) Liberty Port.aem',
            '(2) Mourningstar.aem',
            '(2) Peak Island.aem',
            '(4) Shadowlands.aem',
            '(4) Solitude.aem',
            '(2) The Crossing.aem',
            '(4) The Crucible.aem',
            '(4) Waterways.aem',
            '(4) Winterstorm.aem',
            '(4) classic 1.aem',
            '(3) classic 2.aem',
            '(2) Duel.aem',
            '(2) Crossed swords.aem',
            '(4) Critical mass.aem',
            '(3) Midway.aem',
            '(2) Swamplands.aem',
            '(3) Glu.aem'
        ]);
        expect(getApkSkirmishTrainingMapManifest()).toHaveLength(20);
        expect(getApkSkirmishTrainingMapManifest({
            allowVerifiedApproximateTerrain: false
        })).toHaveLength(16);
        expect(getApkSkirmishTrainingMapManifest({ playerCounts: [2] }).map(entry => entry.name)).toEqual([
            '(2) Icy Paths.aem',
            '(2) Liberty Port.aem',
            '(2) Mourningstar.aem',
            '(2) Peak Island.aem',
            '(2) The Crossing.aem',
            '(2) Duel.aem',
            '(2) Crossed swords.aem',
            '(2) Swamplands.aem'
        ]);
        expect(getApkSkirmishTrainingMapManifest({
            playerCounts: [2],
            allowVerifiedApproximateTerrain: false
        }).map(entry => entry.name)).toEqual([
            '(2) Icy Paths.aem',
            '(2) Liberty Port.aem',
            '(2) Peak Island.aem',
            '(2) The Crossing.aem',
            '(2) Duel.aem',
            '(2) Crossed swords.aem',
            '(2) Swamplands.aem'
        ]);
        const trainingScenarios = getApkSkirmishTrainingScenarios();
        expect(trainingScenarios).toHaveLength(40);
        expect(trainingScenarios.slice(0, 4).map(scenario => scenario.id)).toEqual([
            'SD:(4) Crossroads.aem',
            'SO:(4) Crossroads.aem',
            'SD:(3) Frozen fields.aem',
            'SO:(3) Frozen fields.aem'
        ]);
        expect(trainingScenarios.every(scenario => scenario.terrainConfidence.unmappedTileCount === 0)).toBe(true);
        expect(trainingScenarios.filter(scenario => scenario.terrainConfidence.approximateTileCount > 0).map(scenario => ({
            id: scenario.id,
            approximateTerrainIds: scenario.terrainConfidence.approximateTerrainIds,
            approximateTileCount: scenario.terrainConfidence.approximateTileCount
        }))).toEqual([
            { id: 'SD:(2) Mourningstar.aem', approximateTerrainIds: [30], approximateTileCount: 2 },
            { id: 'SO:(2) Mourningstar.aem', approximateTerrainIds: [30], approximateTileCount: 2 },
            { id: 'SD:(4) The Crucible.aem', approximateTerrainIds: [31], approximateTileCount: 1 },
            { id: 'SO:(4) The Crucible.aem', approximateTerrainIds: [31], approximateTileCount: 1 },
            { id: 'SD:(4) Waterways.aem', approximateTerrainIds: [31], approximateTileCount: 2 },
            { id: 'SO:(4) Waterways.aem', approximateTerrainIds: [31], approximateTileCount: 2 },
            { id: 'SD:(4) Winterstorm.aem', approximateTerrainIds: [31], approximateTileCount: 4 },
            { id: 'SO:(4) Winterstorm.aem', approximateTerrainIds: [31], approximateTileCount: 4 }
        ]);
        expect(getApkSkirmishSetupOptions()).toEqual({
            initialGold: { default: 300, min: 0, max: 2000, step: 50 },
            unitLimit: { default: 30, min: 20, max: 100, step: 10 },
            levelCap: { default: 3, min: 0, max: 9, step: 1 },
            modes: {
                default: 'SD',
                options: ['SD', 'SO'],
                labels: {
                    SD: '默认',
                    SO: '原版'
                }
            }
        });

        const soDuelScenario = getApkSkirmishTrainingScenarios({
            playerCounts: [2],
            modes: ['SO']
        }).find(scenario => scenario.mapName === '(2) Duel.aem')!;
        expect(soDuelScenario).toEqual(expect.objectContaining({
            id: 'SO:(2) Duel.aem',
            mode: 'SO',
            resourcePath: 'assets/maps/(2) Duel.aem',
            playerCount: 2,
            initialUnitCount: 2,
            recommendedGold: 200,
            setupOptions: {
                initialGold: { default: 300, min: 0, max: 2000, step: 50 },
                unitLimit: { default: 30, min: 20, max: 100, step: 10 },
                levelCap: { default: 3, min: 0, max: 9, step: 1 },
                modes: {
                    default: 'SD',
                    options: ['SD', 'SO'],
                    labels: {
                        SD: '默认',
                        SO: '原版'
                    }
                }
            }
        }));
        expect(soDuelScenario.rules).toEqual(expect.objectContaining({
            allowSurrender: true,
            defeatOnNoUnitsAndNoCastles: true,
            defeatOnNoUnits: false,
            recruitableUnits: [
                'soldier',
                'archer',
                'water_elemental',
                'witch',
                'elf',
                'wolf',
                'golem',
                'catapult',
                'dragon'
            ]
        }));
        expect(getApkSkirmishTrainingScenarios({ modes: ['SD'] })[0].rules.recruitableUnits).toEqual([
            'commander',
            'soldier',
            'ghost',
            'mermaid',
            'archer',
            'slime',
            'dark_mage',
            'water_elemental',
            'paladin',
            'witch',
            'berserker',
            'elf',
            'wolf',
            'ice_elemental',
            'golem',
            'druid',
            'catapult',
            'wolf_archer',
            'dragon'
        ]);
        const sdCommanderCostState = createDemoState(getApkSkirmishRuleConfig('SD'));
        expect([0, 1, 2].map(deathCount => {
            sdCommanderCostState.players[0].commanderDeathCount = deathCount;
            return getUnitCost(sdCommanderCostState, 0, 'commander');
        })).toEqual([400, 400, 400]);
        expect(getUnitCost(createDemoState(getApkSkirmishRuleConfig('SO')), 0, 'commander')).toBeNull();

        const mutableScenario = getApkSkirmishTrainingScenarios({ modes: ['SO'] })[0];
        mutableScenario.rules.recruitableUnits!.push('commander');
        mutableScenario.terrainConfidence.byConfidence.confirmed = -1;
        mutableScenario.setupOptions.initialGold.default = 999;
        mutableScenario.setupOptions.modes.options = [];
        const freshScenario = getApkSkirmishTrainingScenarios({ modes: ['SO'] })[0];
        expect(freshScenario.rules.recruitableUnits).not.toContain('commander');
        expect(freshScenario.terrainConfidence.byConfidence.confirmed).toBeGreaterThan(0);
        expect(freshScenario.setupOptions.initialGold.default).toBe(300);
        expect(freshScenario.setupOptions.modes.options).toEqual(['SD', 'SO']);

        const swamplandsManifest = getApkSkirmishMapManifestEntry('(2) Swamplands.aem')!;
        expect(swamplandsManifest.initialUnits.filter(unit => unit.apkUnitId === 0)).toHaveLength(4);
        expect(swamplandsManifest.castleOwnerCounts).toEqual({ N: 2 });
        expect(getApkSkirmishMapManifestEntry('(2) Missing.aem')).toBeNull();

        const duelTerrainIds = Object.entries(duelManifest.tileUsage).flatMap(([apkTerrainId, count]) => (
            Array.from({ length: count }, () => Number(apkTerrainId))
        ));
        const duelTerrain = Array.from({ length: duelManifest.height }, (_, y) => Array.from({ length: duelManifest.width }, (_, x) => {
            const apkTerrainId = duelTerrainIds[y * duelManifest.width + x];
            return {
                x,
                y,
                raw: (apkTerrainId << 12) | 0xff,
                apkTerrainId,
                ownerCode: 0xff,
                ownerId: null,
                projectTerrainId: null
            };
        }));
        const setOwnerForNextDuelTile = (apkTerrainId: number, ownerId: number | null) => {
            const cell = duelTerrain.flat().find(item => item.apkTerrainId === apkTerrainId && item.ownerId === null);
            if (!cell) throw new Error(`Duel 测试地图缺少可设归属的 APK tile: ${apkTerrainId}`);
            const ownerCode = ownerId ?? 0xff;
            cell.raw = (apkTerrainId << 12) | ownerCode;
            cell.ownerCode = ownerCode;
            cell.ownerId = ownerId;
        };
        setOwnerForNextDuelTile(37, 0);
        setOwnerForNextDuelTile(37, 1);
        setOwnerForNextDuelTile(36, 1);

        const officialDuelLikeMap = {
            magic: APK_AEM_MAGIC,
            width: 13,
            height: 13,
            author: 'youxing',
            playerIds: [0, 1],
            terrainRecordOffset: 0,
            terrainCount: 13 * 13,
            terrain: duelTerrain,
            unitRecordOffset: 0,
            unitValueCount: 10,
            units: [
                { apkUnitId: 9, teamId: 0, extra: 0, x: 4, y: 4, unitClass: 'commander' as const },
                { apkUnitId: 9, teamId: 1, extra: 0, x: 9, y: 6, unitClass: 'commander' as const }
            ],
            recommendedGold: 200,
            tailOffset: 0,
            tail: {
                offset: 0,
                length: 58,
                hex: APK_AEM_ZERO_SUFFIX_TAIL_HEX,
                bytes: [],
                template: 'zero_suffix_58' as const
            }
        };
        expect(matchesApkSkirmishMapManifest(officialDuelLikeMap, duelManifest)).toBe(true);

        const duelState = createApkSkirmishGameState(officialDuelLikeMap, { mode: 'SD', mapName: '(2) Duel.aem' });
        expect(duelState.metadata).toEqual(expect.objectContaining({
            source: 'apk_aem',
            apkMapName: '(2) Duel.aem',
            apkSkirmishMode: 'SD',
            apkVersion: APK_RELEASE_VERSION,
            apkSha256: APK_RELEASE_SHA256,
            apkResourcePath: 'assets/maps/(2) Duel.aem',
            apkSkirmishSetupOptions: getApkSkirmishSetupOptions(),
            recommendedGold: 200,
            apkTailTemplate: 'zero_suffix_58'
        }));
        expect(getApkSkirmishTrainingScenario('SO:(2) Duel.aem')).toEqual(expect.objectContaining({
            id: 'SO:(2) Duel.aem',
            mode: 'SO',
            mapName: '(2) Duel.aem'
        }));

        const soDuelTrainingState = createApkSkirmishTrainingGameState(officialDuelLikeMap, 'SO:(2) Duel.aem');
        expect(soDuelTrainingState.metadata).toEqual(expect.objectContaining({
            source: 'apk_aem',
            apkMapName: '(2) Duel.aem',
            apkSkirmishMode: 'SO',
            apkSkirmishTrainingScenarioId: 'SO:(2) Duel.aem',
            apkVersion: APK_RELEASE_VERSION,
            apkSha256: APK_RELEASE_SHA256,
            apkResourcePath: 'assets/maps/(2) Duel.aem',
            apkSkirmishSetupOptions: getApkSkirmishSetupOptions()
        }));
        expect(soDuelTrainingState.rules?.recruitableUnits).toEqual(getApkSkirmishRuleConfig('SO').recruitableUnits);
        const soDuelTrainingEnv = createApkSkirmishTrainingEnv(officialDuelLikeMap, 'SO:(2) Duel.aem', {
            seed: 7,
            maxPlies: 50
        });
        expect(soDuelTrainingEnv.getObservation().metadata?.apkSkirmishTrainingScenarioId).toBe('SO:(2) Duel.aem');
        expect(soDuelTrainingEnv.getObservation().rules.recruitableUnits).toEqual(getApkSkirmishRuleConfig('SO').recruitableUnits);
        const setupObservation = soDuelTrainingEnv.getObservation();
        setupObservation.metadata!.apkSkirmishSetupOptions!.initialGold.default = 999;
        setupObservation.metadata!.apkSkirmishSetupOptions!.modes.options = [];
        expect(soDuelTrainingEnv.getObservation().metadata?.apkSkirmishSetupOptions).toEqual(getApkSkirmishSetupOptions());

        const mismatchedMap = { ...officialDuelLikeMap, recommendedGold: 300 };
        expect(matchesApkSkirmishMapManifest(mismatchedMap, duelManifest)).toBe(false);
        expect(() => createApkSkirmishTrainingGameState(mismatchedMap, 'SO:(2) Duel.aem')).toThrow(
            'APK skirmish 训练场景 SO:(2) Duel.aem 与传入 AEM 地图不匹配'
        );
        const looseTrainingState = createApkSkirmishTrainingGameState(mismatchedMap, 'SO:(2) Duel.aem', {
            strictManifest: false
        });
        expect(looseTrainingState.metadata?.apkSkirmishTrainingScenarioId).toBe('SO:(2) Duel.aem');
        expect(looseTrainingState.metadata?.apkVersion).toBeUndefined();

        const mismatchedTerrain = officialDuelLikeMap.terrain.map(row => row.map(cell => ({ ...cell })));
        const changedTerrainCell = mismatchedTerrain.flat().find(cell => cell.apkTerrainId === 0)!;
        changedTerrainCell.apkTerrainId = 1;
        changedTerrainCell.raw = (1 << 12) | changedTerrainCell.ownerCode;
        expect(matchesApkSkirmishMapManifest({ ...officialDuelLikeMap, terrain: mismatchedTerrain }, duelManifest)).toBe(false);
        const mismatchedState = createApkSkirmishGameState(mismatchedMap, { mode: 'SD', mapName: '(2) Duel.aem' });
        expect(mismatchedState.metadata?.apkVersion).toBeUndefined();
        expect(mismatchedState.metadata?.apkSha256).toBeUndefined();
        expect(mismatchedState.metadata?.apkResourcePath).toBeUndefined();
    });

    it('APK mods 脚本 API 计数和字面量规则配置已归档', () => {
        expect(APK_SCRIPT_DECRYPTED_JS_FILE_COUNT).toBe(27);
        expect(APK_SCRIPT_DECRYPTION_INFO).toEqual(expect.objectContaining({
            sourceGlob: 'assets/mods/**/*.js',
            cipher: 'DES/CBC/PKCS7',
            keyHex: '72 6b 00 00 00 00 46 46'
        }));

        expect(APK_SCRIPT_API_CALL_COUNTS['Stage.AsyncMessage']).toBe(187);
        expect(APK_SCRIPT_API_CALL_COUNTS['Stage.SyncSetUnitLimit']).toBe(25);
        expect(APK_SCRIPT_API_CALL_COUNTS['Stage.SyncSetRecruitUnitsForTeam']).toBe(14);
        expect(APK_SCRIPT_API_CALL_COUNTS['Stage.SyncSetAlliance']).toBe(12);
        expect(APK_SCRIPT_API_CALL_COUNTS['rule.SetIncomeVillage']).toBe(8);
        expect(getApkScriptApiCallCount('Stage.SyncSetGold')).toBe(16);
        expect(getApkScriptApiCallCount('Stage.Unknown')).toBe(0);

        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.syncSetGold).toEqual([
            { value: 300, scriptCount: 5 },
            { value: 400, scriptCount: 1 },
            { value: 450, scriptCount: 1 },
            { value: 500, scriptCount: 5 },
            { value: 600, scriptCount: 1 },
            { value: 800, scriptCount: 3 }
        ]);
        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.syncSetUnitLimit.map(entry => entry.value)).toEqual([10, 15, 20, 25, 30, 40, 50, 60]);
        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.syncSetRecruitUnits).toContainEqual({
            apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8],
            scriptCount: 6
        });
        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.syncSetRecruitUnitsForTeam).toContainEqual({
            teamId: 0,
            apkUnitIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 16, 17, 19, 20],
            scriptCount: 2
        });
        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.syncSetAlliance).toContainEqual({
            teamId: 5,
            allianceId: 2,
            callCount: 2
        });
        expect(APK_SCRIPT_LITERAL_RULE_DISTRIBUTIONS.ruleIncomeProfiles).toContainEqual({
            incomeVillage: 0,
            incomeCastle: 0,
            incomeCommanderBase: 0,
            incomeCommanderGrowth: 0,
            scriptCount: 7
        });

        expect(APK_SCRIPT_LITERAL_RULE_CONFIGS).toHaveLength(26);
        expect(getApkScriptLiteralRuleConfig('assets/mods/SO/controller.js')).toEqual({
            resourcePath: 'assets/mods/SO/controller.js',
            syncSetRecruitUnits: [[0, 1, 2, 3, 4, 5, 6, 7, 8]]
        });
        expect(getApkScriptLiteralRuleConfig('assets/mods/AEI/s1.js')).toEqual(expect.objectContaining({
            syncSetUnitLimitValues: [10],
            syncDisableTeamIds: [1],
            syncRestoreTeamIds: [1],
            ruleIncome: {
                incomeVillage: 0,
                incomeCastle: 0,
                incomeCommanderBase: 0,
                incomeCommanderGrowth: 0
            }
        }));
        expect(getApkScriptLiteralRuleConfig('assets/mods/AEIII/s6.js')).toEqual(expect.objectContaining({
            syncSetGoldValues: [500],
            syncDisableTeamIds: [3],
            syncSetAllianceCalls: [
                { teamId: 1, allianceId: 2 },
                { teamId: 2, allianceId: 2 },
                { teamId: 3, allianceId: 2 },
                { teamId: 4, allianceId: 2 },
                { teamId: 5, allianceId: 2 }
            ]
        }));
        expect(getApkScriptLiteralRuleConfig('assets/mods/Missing/s1.js')).toBeNull();

        expect(APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS).toHaveLength(4);
        expect(getApkScriptLiteralStageStateConfig('assets/mods/AEII/s5.js')).toEqual({
            resourcePath: 'assets/mods/AEII/s5.js',
            syncOverrideMovCalls: [
                { code: 'crystal', tileType: 1, mov: 99 }
            ]
        });
        expect(getApkScriptLiteralStageStateConfig('assets/mods/AEIII/s4.js')?.syncOverrideMovCalls).toEqual([
            { code: 'g1', tileType: 0, mov: 1 },
            { code: 'g2', tileType: 0, mov: 1 },
            { code: 'g3', tileType: 0, mov: 1 },
            { code: 'g4', tileType: 0, mov: 1 },
            { code: 'g5', tileType: 0, mov: 1 }
        ]);
        expect(getApkScriptLiteralStageStateConfig('assets/mods/AEIII/s6.js')?.syncOverrideMovCalls).toEqual([
            { code: 'g1', tileType: 0, mov: 99 },
            { code: 's1', tileType: 0, mov: 99 },
            { code: 's2', tileType: 0, mov: 99 }
        ]);
        expect(getApkScriptLiteralStageStateConfig('assets/mods/AEIII/s7.js')).toEqual({
            resourcePath: 'assets/mods/AEIII/s7.js',
            syncSetUnitStatusCalls: [
                { x: 6, y: 9, statusId: 2, rounds: 2, replaceExisting: true }
            ]
        });
        expect(getApkScriptLiteralStageStateConfig('assets/mods/Missing/s1.js')).toBeNull();
    });

    it('APK mods 字面量规则配置可以生成项目 RuleConfig', () => {
        const mapApkUnitIds = (...apkUnitIds: number[]) => apkUnitIds.map(apkUnitId => APK_UNIT_ID_TO_CLASS[apkUnitId]);

        const soResult = buildApkScriptRuleConfig('assets/mods/SO/controller.js')!;
        expect(soResult.rules.recruitableUnits).toEqual(mapApkUnitIds(0, 1, 2, 3, 4, 5, 6, 7, 8));
        expect(soResult.ignoredLifecycleCalls).toEqual({
            syncRestoreTeamIds: [],
            syncGameOverAllianceIds: []
        });
        expect(soResult.warnings).toEqual([]);

        const aei1Result = buildApkScriptRuleConfig('assets/mods/AEI/s1.js')!;
        expect(aei1Result.rules).toEqual(expect.objectContaining({
            unitLimit: 10,
            disabledTeams: [1],
            incomeVillage: 0,
            incomeCastle: 0,
            incomeCommanderBase: 0,
            incomeCommanderGrowth: 0
        }));
        expect(aei1Result.ignoredLifecycleCalls).toEqual({
            syncRestoreTeamIds: [1],
            syncGameOverAllianceIds: [1, 2]
        });

        const aeiii6Rules = getApkScriptRuleConfig('assets/mods/AEIII/s6.js')!;
        expect(aeiii6Rules.initialGold).toBe(500);
        expect(aeiii6Rules.unitLimit).toBe(50);
        expect(aeiii6Rules.disabledTeams).toEqual([3]);
        expect(aeiii6Rules.alliances).toEqual({
            1: 2,
            2: 2,
            3: 2,
            4: 2,
            5: 2
        });
        expect(aeiii6Rules.teams?.[0].recruitableUnits).toEqual(mapApkUnitIds(0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 16, 17, 19, 20));
        expect(aeiii6Rules.teams?.[1].recruitableUnits).toEqual(mapApkUnitIds(0, 1, 3, 4, 5, 6, 7, 8, 14, 18));
        expect(aeiii6Rules.teams?.[4].recruitableUnits).toEqual(mapApkUnitIds(0, 1, 3, 4, 5, 6, 7, 8, 14, 18));
        expect(aeiii6Rules.teams?.[5].recruitableUnits).toEqual(mapApkUnitIds(0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 18, 19));

        const aei5Rules = getApkScriptRuleConfig('assets/mods/AEI/s5.js')!;
        expect(aei5Rules.initialGold).toBe(800);
        expect(aei5Rules.teams?.[0].initialGold).toBe(900);

        const state = createDemoState({
            alliances: { 0: 1 },
            teams: { 0: { unitLimit: 5 } }
        });
        const appliedResult = applyApkScriptRuleConfig(state, 'assets/mods/AEI/s5.js');
        expect(appliedResult?.resourcePath).toBe('assets/mods/AEI/s5.js');
        expect(state.rules?.initialGold).toBe(800);
        expect(state.rules?.alliances?.[0]).toBe(1);
        expect(state.rules?.teams?.[0].unitLimit).toBe(5);
        expect(state.rules?.teams?.[0].initialGold).toBe(900);
        expect(state.players.find(player => player.id === 0)?.gold).toBe(900);
        expect(state.players.find(player => player.id === 1)?.gold).toBe(800);
        expect(state.metadata).toEqual(expect.objectContaining({
            apkRuleScriptResourcePath: 'assets/mods/AEI/s5.js',
            apkRuleScriptIgnoredRestoreTeamIds: [],
            apkRuleScriptIgnoredGameOverAllianceIds: [1, 2],
            apkRuleScriptWarnings: []
        }));

        const env = new AncientEmpiresEnv({ initialState: state });
        const observation = env.getObservation();
        expect(observation.metadata).toEqual(expect.objectContaining({
            apkRuleScriptResourcePath: 'assets/mods/AEI/s5.js',
            apkRuleScriptIgnoredGameOverAllianceIds: [1, 2]
        }));
        observation.metadata!.apkRuleScriptIgnoredGameOverAllianceIds!.push(9);
        expect(env.getObservation().metadata?.apkRuleScriptIgnoredGameOverAllianceIds).toEqual([1, 2]);
        expect(buildApkScriptRuleConfig('assets/mods/Missing/s1.js')).toBeNull();
    });

    it('APK mods 字面量单位/坐标状态配置可以应用到 GameState', () => {
        const moveState = createDemoState();
        moveState.units[0].apkUnitCode = 'g1';

        const moveResult = applyApkScriptStageStateConfig(moveState, 'assets/mods/AEIII/s4.js')!;
        expect(moveResult.resourcePath).toBe('assets/mods/AEIII/s4.js');
        expect(moveResult.appliedSyncOverrideMovCount).toBe(1);
        expect(moveResult.appliedSyncSetUnitStatusCount).toBe(0);
        expect(moveResult.warnings).toHaveLength(4);
        expect(moveState.units[0].apkMoveOverrides).toEqual({ 0: 1 });
        expect(moveState.metadata).toEqual(expect.objectContaining({
            apkStageStateScriptResourcePath: 'assets/mods/AEIII/s4.js',
            apkStageStateAppliedSyncOverrideMovCount: 1,
            apkStageStateAppliedSyncSetUnitStatusCount: 0,
            apkStageStateScriptWarnings: moveResult.warnings
        }));

        const moveEnv = new AncientEmpiresEnv({ initialState: moveState });
        const moveObservation = moveEnv.getObservation();
        expect(moveObservation.metadata?.apkStageStateScriptWarnings).toEqual(moveResult.warnings);
        moveObservation.metadata!.apkStageStateScriptWarnings!.push('mutated');
        expect(moveEnv.getObservation().metadata?.apkStageStateScriptWarnings).toEqual(moveResult.warnings);

        const statusState = createDemoState();
        const statusTarget = statusState.units[0];
        statusTarget.pos = { x: 6, y: 9 };
        statusTarget.status = { type: 'poisoned', remainingTicks: 2 };

        const statusResult = applyApkScriptStageStateConfig(statusState, 'assets/mods/AEIII/s7.js')!;
        expect(statusResult).toEqual({
            resourcePath: 'assets/mods/AEIII/s7.js',
            appliedSyncOverrideMovCount: 0,
            appliedSyncSetUnitStatusCount: 1,
            warnings: []
        });
        expect(statusTarget.status).toEqual({ type: 'inspired', remainingTurns: 2 });
        expect(statusState.metadata).toEqual(expect.objectContaining({
            apkStageStateScriptResourcePath: 'assets/mods/AEIII/s7.js',
            apkStageStateAppliedSyncOverrideMovCount: 0,
            apkStageStateAppliedSyncSetUnitStatusCount: 1,
            apkStageStateScriptWarnings: []
        }));

        expect(applyApkScriptStageStateConfig(statusState, 'assets/mods/Missing/s1.js')).toBeNull();
    });

    it('APK AEM 明文地图解析可以读取头部、玩家、地形归属和单位', () => {
        const bytes: number[] = [];
        const pushUInt32BE = (value: number) => {
            bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
        };
        const pushInt32BE = pushUInt32BE;
        const pushUInt32LE = (value: number) => {
            bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
        };
        const pushUInt40BE = (value: number) => {
            bytes.push(
                Math.floor(value / 0x100000000) & 0xff,
                (value >>> 24) & 0xff,
                (value >>> 16) & 0xff,
                (value >>> 8) & 0xff,
                value & 0xff
            );
        };
        const pushTerrainRecord = (apkTerrainId: number, ownerCode: number) => {
            pushUInt32BE((apkTerrainId << 12) | ownerCode);
        };
        const parseHex = (hex: string): number[] => hex.split(' ').map(part => parseInt(part, 16));

        pushUInt32BE(APK_AEM_MAGIC);
        pushUInt32LE(0);
        pushUInt32LE(2);
        bytes.push(3);
        // null 作者字段，来自 APK AEM 中无作者地图的头部形态。
        bytes.push(1, 0, 0, 0, 0);
        bytes.push(2);
        pushUInt32BE(0);
        pushUInt32BE(1);
        pushUInt40BE(6);
        // AEM 地形矩阵按列优先存储：(0,0)(0,1)(0,2)(1,0)(1,1)(1,2)。
        pushTerrainRecord(37, 0);
        pushTerrainRecord(36, 0xfe);
        pushTerrainRecord(72, 1);
        pushTerrainRecord(27, 0xff);
        pushTerrainRecord(2, 0xff);
        pushTerrainRecord(37, 1);
        // 单位块：marker=0，字段数=10，两条 5 字段单位记录。
        pushUInt32LE(0);
        pushUInt32LE(10);
        pushUInt32LE(9);
        pushUInt32LE(0);
        pushUInt32LE(0);
        pushUInt32LE(0);
        pushUInt32LE(0);
        pushUInt32LE(9);
        pushUInt32LE(1);
        pushUInt32LE(2);
        pushUInt32LE(1);
        // 最后一条单位的 y 在 APK 明文中只占 1 字节，随后直接接推荐金币。
        bytes.push(2);
        pushInt32BE(300);

        const map = parseApkAemMap(new Uint8Array(bytes));

        expect(map.width).toBe(2);
        expect(map.height).toBe(3);
        expect(map.author).toBeNull();
        expect(map.playerIds).toEqual([0, 1]);
        expect(map.terrainCount).toBe(6);
        expect(map.terrain[0][0].apkTerrainId).toBe(37);
        expect(map.terrain[0][0].ownerId).toBe(0);
        expect(map.terrain[0][0].projectTerrainId).toBe(10);
        expect(map.terrain[0][1].ownerId).toBeNull();
        expect(map.terrain[2][0].apkTerrainId).toBe(72);
        expect(map.terrain[2][0].projectTerrainId).toBe(17);
        expect(map.terrain[0][1].apkTerrainId).toBe(27);
        expect(map.terrain[2][1].ownerId).toBe(1);
        expect(map.unitValueCount).toBe(10);
        expect(map.recommendedGold).toBe(300);
        expect(map.tail.template).toBe('none');
        expect(map.tail.length).toBe(0);
        expect(map.units).toEqual([
            { apkUnitId: 9, teamId: 0, extra: 0, x: 0, y: 0, unitClass: 'commander' },
            { apkUnitId: 9, teamId: 1, extra: 2, x: 1, y: 2, unitClass: 'commander' },
        ]);
        expect(getApkAemTerrainUsage(map)).toEqual({ 2: 1, 27: 1, 36: 1, 37: 2, 72: 1 });
        expect(getApkAemTerrainConfidenceUsage(map)).toEqual({
            approximateTerrainIds: [],
            approximateTileCount: 0,
            unmappedTerrainIds: [],
            unmappedTileCount: 0
        });
        expect(getUnmappedSkirmishApkTerrainIds(map)).toEqual([]);

        const state = createGameStateFromApkAemMap(map, { mapName: '(2) Unit Test.aem' });
        expect(state.map.width).toBe(2);
        expect(state.map.height).toBe(3);
        expect(state.map.tiles[0][0]).toEqual(expect.objectContaining({ terrainId: 10, ownerId: 0, apkTerrainId: 37, apkOwnerCode: 0 }));
        expect(state.map.tiles[0][1]).toEqual(expect.objectContaining({ terrainId: 8, ownerId: null, apkTerrainId: 27, apkOwnerCode: 0xff }));
        expect(state.map.tiles[1][0]).toEqual(expect.objectContaining({ terrainId: 9, ownerId: null, apkTerrainId: 36, apkOwnerCode: 0xfe }));
        expect(state.map.tiles[1][1]).toEqual(expect.objectContaining({ terrainId: 2, ownerId: null, apkTerrainId: 2, apkOwnerCode: 0xff }));
        expect(state.map.tiles[2][0]).toEqual(expect.objectContaining({ terrainId: 17, ownerId: 1, apkTerrainId: 72, apkOwnerCode: 1 }));
        expect(state.players.map(player => player.gold)).toEqual([300, 300]);
        expect(state.units.map(unit => `${unit.ownerId}:${unit.unitClass}@${unit.pos.x},${unit.pos.y}`)).toEqual([
            '0:commander@0,0',
            '1:commander@1,2'
        ]);
        expect(state.units.map(unit => ({ id: unit.id, apkUnitId: unit.apkUnitId, apkUnitExtra: unit.apkUnitExtra }))).toEqual([
            { id: 'apk_u0', apkUnitId: 9, apkUnitExtra: 0 },
            { id: 'apk_u1', apkUnitId: 9, apkUnitExtra: 2 }
        ]);
        expect(state.rules?.defeatOnNoUnitsAndNoCastles).toBe(true);
        expect(state.metadata).toEqual({
            source: 'apk_aem',
            apkMapName: '(2) Unit Test.aem',
            recommendedGold: 300,
            apkTailTemplate: 'none',
            apkApproximateTerrainIds: [],
            apkApproximateTileCount: 0,
            apkUnmappedTerrainIds: [],
            apkUnmappedTileCount: 0
        });

        const tracedState = createGameStateFromApkAemMap(map, {
            mapName: '(2) Unit Test.aem',
            apkVersion: 'aer-release-4.2.5.1',
            apkSha256: '51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B',
            apkResourcePath: 'assets/maps/(2) Unit Test.aem'
        });
        expect(tracedState.metadata).toEqual({
            source: 'apk_aem',
            apkVersion: 'aer-release-4.2.5.1',
            apkSha256: '51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B',
            apkResourcePath: 'assets/maps/(2) Unit Test.aem',
            apkMapName: '(2) Unit Test.aem',
            recommendedGold: 300,
            apkTailTemplate: 'none',
            apkApproximateTerrainIds: [],
            apkApproximateTileCount: 0,
            apkUnmappedTerrainIds: [],
            apkUnmappedTileCount: 0
        });
        const approximateMap = JSON.parse(JSON.stringify(map)) as typeof map;
        approximateMap.terrain[0][1].apkTerrainId = 31;
        approximateMap.terrain[0][1].raw = (31 << 12) | 0xff;
        const approximateState = createGameStateFromApkAemMap(approximateMap);
        expect(approximateState.metadata).toEqual(expect.objectContaining({
            apkApproximateTerrainIds: [31],
            apkApproximateTileCount: 1,
            apkUnmappedTerrainIds: [],
            apkUnmappedTileCount: 0
        }));
        const approximateEnv = new AncientEmpiresEnv({ initialState: approximateState });
        const approximateObservation = approximateEnv.getObservation();
        approximateObservation.metadata!.apkApproximateTerrainIds!.push(80);
        expect(approximateEnv.getObservation().metadata?.apkApproximateTerrainIds).toEqual([31]);
        const configuredGoldState = createGameStateFromApkAemMap(map, {
            rules: {
                initialGold: 700,
                teams: {
                    1: { initialGold: 900 }
                }
            }
        });
        expect(configuredGoldState.players.map(player => player.gold)).toEqual([700, 900]);
        expect(configuredGoldState.rules?.defeatOnNoUnitsAndNoCastles).toBe(true);
        expect(configuredGoldState.rules?.initialGold).toBe(700);
        expect(configuredGoldState.rules?.teams?.[1].initialGold).toBe(900);
        const tracedEnv = new AncientEmpiresEnv({ initialState: tracedState });
        expect(tracedEnv.getObservation().metadata).toEqual(tracedState.metadata);

        const mapWithSkirmishTail = parseApkAemMap(new Uint8Array([...bytes, ...parseHex(APK_AEM_ZERO_SUFFIX_TAIL_HEX)]));
        expect(mapWithSkirmishTail.tail.template).toBe('zero_suffix_58');
        expect(mapWithSkirmishTail.tail.length).toBe(58);

        expect(getApkSkirmishRuleConfig('SD')).toEqual(expect.objectContaining({
            initialGold: 300,
            unitLimit: 30,
            levelCap: 3,
            commanderRecruitBaseCost: 400,
            commanderRecruitCostGrowth: 0,
            allowPendingRecruitEndTurn: true,
            allowPendingRecruitSurrender: true
        }));
        expect(getApkSkirmishRuleConfig('SD').recruitableUnits).toEqual([
            'commander',
            'soldier',
            'ghost',
            'mermaid',
            'archer',
            'slime',
            'dark_mage',
            'water_elemental',
            'paladin',
            'witch',
            'berserker',
            'elf',
            'wolf',
            'ice_elemental',
            'golem',
            'druid',
            'catapult',
            'wolf_archer',
            'dragon'
        ]);
        expect(getApkSkirmishRuleConfig('SD').allowSurrender).toBe(true);
        expect(getApkSkirmishRuleConfig('SO').allowSurrender).toBe(true);
        expect(getApkSkirmishRuleConfig('SO').commanderRecruitBaseCost).toBeNull();
        expect(getApkSkirmishRuleConfig('SO').recruitableUnits).toEqual([
            'soldier',
            'archer',
            'water_elemental',
            'witch',
            'elf',
            'wolf',
            'golem',
            'catapult',
            'dragon'
        ]);
        expect(resolveApkSkirmishSetupSelection({
            initialGold: 450,
            unitLimit: 40,
            levelCap: 9
        })).toEqual({
            initialGold: 450,
            unitLimit: 40,
            levelCap: 9
        });
        expect(getApkSkirmishRuleConfig('SD', {
            initialGold: 450,
            unitLimit: 40,
            levelCap: 9
        })).toEqual(expect.objectContaining({
            initialGold: 450,
            unitLimit: 40,
            levelCap: 9
        }));
        expect(() => resolveApkSkirmishSetupSelection({ initialGold: 425 })).toThrow(
            'APK skirmish 起始金币 必须按 50 递增'
        );
        expect(() => resolveApkSkirmishSetupSelection({ unitLimit: 10 })).toThrow(
            'APK skirmish 单位上限 必须在 20-100 范围内'
        );
        expect(() => resolveApkSkirmishSetupSelection({ levelCap: 10 as never })).toThrow(
            'APK skirmish 等级上限 必须在 0-9 范围内'
        );
        const soState = createApkSkirmishGameState(mapWithSkirmishTail, { mode: 'SO', mapName: '(2) Unit Test.aem' });
        expect(soState.rules?.recruitableUnits).toEqual(getApkSkirmishRuleConfig('SO').recruitableUnits);
        expect(soState.metadata).toEqual({
            source: 'apk_aem',
            apkMapName: '(2) Unit Test.aem',
            apkSkirmishMode: 'SO',
            apkSkirmishSetupOptions: getApkSkirmishSetupOptions(),
            recommendedGold: 300,
            apkTailTemplate: 'zero_suffix_58',
            apkApproximateTerrainIds: [],
            apkApproximateTileCount: 0,
            apkUnmappedTerrainIds: [],
            apkUnmappedTileCount: 0
        });
        const configuredSkirmishState = createApkSkirmishGameState(mapWithSkirmishTail, {
            mode: 'SD',
            mapName: '(2) Unit Test.aem',
            setup: {
                initialGold: 450,
                unitLimit: 40,
                levelCap: 9
            }
        });
        expect(configuredSkirmishState.players.map(player => player.gold)).toEqual([450, 450]);
        expect(configuredSkirmishState.rules).toEqual(expect.objectContaining({
            initialGold: 450,
            unitLimit: 40,
            levelCap: 9
        }));

        const env = new AncientEmpiresEnv({ initialState: soState });
        expect(env.getObservation().metadata).toEqual(soState.metadata);
        expect(env.getObservation().units.map(unit => ({ id: unit.id, apkUnitId: unit.apkUnitId, apkUnitExtra: unit.apkUnitExtra }))).toEqual([
            { id: 'apk_u0', apkUnitId: 9, apkUnitExtra: 0 },
            { id: 'apk_u1', apkUnitId: 9, apkUnitExtra: 2 }
        ]);
    });

    it('AI Observation 暴露 APK 单位 code 和脚本变量', () => {
        const state = createDemoState();
        expect(syncSetUnitCode(state, state.units[0].pos, 'galamar')).toBe(true);
        expect(syncSetUnitStaticWithCode(state, 'galamar', true)).toBe(true);
        expect(syncSetUnitTargetedWithCode(state, 'galamar', true)).toBe(true);
        expect(syncSetUnitHeadWithCode(state, 'galamar', 4)).toBe(true);
        expect(syncOverrideMov(state, 'galamar', 2, 1)).toBe(true);
        expect(putBoolean(state, 'stolen', true)).toBe(true);
        expect(putInteger(state, 'reinforced', 2)).toBe(true);

        const env = new AncientEmpiresEnv({ initialState: state });
        const observation = env.getObservation();

        expect(observation.units.find(unit => unit.id === state.units[0].id)).toEqual(expect.objectContaining({
            apkUnitCode: 'galamar',
            apkStatic: true,
            apkTargeted: true,
            apkUnitHead: 4,
            apkMoveOverrides: { 2: 1 }
        }));
        expect(observation.apkScriptState).toEqual({
            booleans: { stolen: true },
            integers: { reinforced: 2 }
        });

        observation.apkScriptState!.booleans!.stolen = false;
        observation.units.find(unit => unit.id === state.units[0].id)!.apkMoveOverrides![2] = 3;
        expect(env.getObservation().apkScriptState?.booleans?.stolen).toBe(true);
        expect(env.getObservation().units.find(unit => unit.id === state.units[0].id)!.apkMoveOverrides).toEqual({ 2: 1 });
    });

    it('APK 导入地图优先使用 data.bin 的原始 tile 数值', () => {
        const state = createDemoState();
        state.map.width = 4;
        state.map.height = 1;
        state.map.tiles = [[
            { terrainId: 6, ownerId: null },
            { terrainId: 2, ownerId: null, apkTerrainId: 0 },
            { terrainId: 12, ownerId: null, apkTerrainId: 31 },
            { terrainId: 16, ownerId: null, apkTerrainId: 81 }
        ]];
        state.units = [{
            id: 'u_apk_move',
            ownerId: 0,
            unitClass: 'soldier',
            pos: { x: 0, y: 0 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: 0,
            exp: 0
        }];

        expect(getTileMoveCost(state.map.tiles[0][1])).toBe(16777215);
        expect(getTileHealPerTurn(state.map.tiles[0][1])).toBe(3);
        expect(getReachablePositions(state, 'u_apk_move')).toEqual([{ x: 0, y: 0 }]);

        const apkHighDefenseTile = { terrainId: 6 as const, ownerId: null, apkTerrainId: 33 };
        expect(getTileDefenseBonus(apkHighDefenseTile)).toBe(20);

        const env = new AncientEmpiresEnv({ initialState: state });
        const observation = env.getObservation();
        expect(observation.terrainMappingSummary).toEqual({
            apkTileCount: 3,
            byConfidence: {
                confirmed: 0,
                atlas: 1,
                approximate: 2,
                unmapped: 0
            },
            apkTerrainUsage: {
                0: 1,
                31: 1,
                81: 1
            },
            approximateApkTerrainIds: [31, 81],
            unmappedApkTerrainIds: []
        });

        const apkTileObservation = observation.tiles.find(tile => tile.x === 1 && tile.y === 0)!;
        expect(apkTileObservation).toEqual(expect.objectContaining({
            terrainId: 2,
            ruleTerrainId: 2,
            terrainKey: 'deep_water',
            terrainTags: expect.arrayContaining(['water']),
            apkTerrainId: 0,
            apkTerrainConfig: {
                id: 0,
                kind: 0,
                flagA: 0,
                variant: -1,
                linkedA: 0,
                defenseBonus: 0,
                healPerTurn: 3,
                moveCost: 16777215,
                flagB: 255,
                linkedB: -1,
                linkedC: 0,
                flagC: 0,
                tail: '0x00000001'
            },
            apkTerrainMappingConfidence: 'atlas',
            apkTerrainMappingEvidence: ['data_bin_values', 'texture_atlas', 'skirmish_map_context'],
            moveCost: 16777215,
            defenseBonus: 0,
            healPerTurn: 3
        }));
        const apkApproximateTileObservation = observation.tiles.find(tile => tile.x === 2 && tile.y === 0)!;
        expect(apkApproximateTileObservation).toEqual(expect.objectContaining({
            terrainId: 12,
            ruleTerrainId: 12,
            terrainKey: 'temple',
            terrainTags: expect.arrayContaining(['temple', 'healing', 'cleanse']),
            apkTerrainId: 31,
            apkTerrainConfig: {
                id: 31,
                kind: 8,
                flagA: 1,
                variant: 5,
                linkedA: -1,
                defenseBonus: 10,
                healPerTurn: 20,
                moveCost: 1,
                flagB: 0,
                linkedB: -1,
                linkedC: -1,
                flagC: 0,
                tail: '0x00000000'
            },
            apkTerrainMappingConfidence: 'approximate',
            apkTerrainMappingEvidence: ['data_bin_values', 'texture_atlas', 'language_table_temple_description', 'low_confidence_temple_semantics'],
            moveCost: 1,
            defenseBonus: 10,
            healPerTurn: 20
        }));
        const apkWaterObstacleTileObservation = observation.tiles.find(tile => tile.x === 3 && tile.y === 0)!;
        expect(apkWaterObstacleTileObservation).toEqual(expect.objectContaining({
            terrainId: 16,
            ruleTerrainId: 2,
            terrainKey: 'deep_water',
            terrainTags: expect.arrayContaining(['water']),
            apkTerrainId: 81,
            apkTerrainMappingConfidence: 'approximate',
            apkTerrainMappingEvidence: ['data_bin_values', 'texture_atlas', 'low_confidence_water_obstacle_semantics'],
            moveCost: 3,
            defenseBonus: 10,
            healPerTurn: 0
        }));
        expect(apkWaterObstacleTileObservation.terrainTags).toEqual(expect.not.arrayContaining(['cleanse']));

        const unmappedState = createDemoState();
        unmappedState.map.tiles[0][0] = { terrainId: 6, ownerId: null, apkTerrainId: 999 };
        expect(new AncientEmpiresEnv({ initialState: unmappedState }).getObservation().terrainMappingSummary).toEqual({
            apkTileCount: 1,
            byConfidence: {
                confirmed: 0,
                atlas: 0,
                approximate: 0,
                unmapped: 1
            },
            apkTerrainUsage: {
                999: 1
            },
            approximateApkTerrainIds: [],
            unmappedApkTerrainIds: [999]
        });

        const apkWaterTileAsRoad = { terrainId: 6 as const, ownerId: null, apkTerrainId: 2 };
        const apkForestTileAsRoad = { terrainId: 6 as const, ownerId: null, apkTerrainId: 15 };
        const apkMountainTileAsRoad = { terrainId: 6 as const, ownerId: null, apkTerrainId: 17 };
        expect(isWaterTerrain(apkWaterTileAsRoad)).toBe(true);
        expect(isForestTerrain(apkForestTileAsRoad)).toBe(true);
        expect(isMountainTerrain(apkMountainTileAsRoad)).toBe(true);
        expect(getMoveCostForUnit(state, { ...state.units[0], unitClass: 'water_elemental' }, apkWaterTileAsRoad)).toBe(1);
        expect(getMoveCostForUnit(state, { ...state.units[0], unitClass: 'wolf' }, apkWaterTileAsRoad)).toBe(2);
        expect(getMoveCostForUnit(state, { ...state.units[0], unitClass: 'wolf_archer' }, apkForestTileAsRoad)).toBe(1);
        expect(getMoveCostForUnit(state, { ...state.units[0], unitClass: 'golem' }, apkMountainTileAsRoad)).toBe(1);

        const apkAbilityState = createDemoState();
        apkAbilityState.map.width = 2;
        apkAbilityState.map.height = 1;
        apkAbilityState.map.tiles = [[apkWaterTileAsRoad, { terrainId: 6, ownerId: null }]];
        apkAbilityState.units = [
            { ...state.units[0], id: 'apk_water_child', unitClass: 'water_elemental', ownerId: 0, pos: { x: 0, y: 0 } },
            { ...state.units[0], id: 'apk_target', unitClass: 'soldier', ownerId: 1, pos: { x: 1, y: 0 } }
        ];
        expect(getAttackBonus(apkAbilityState, apkAbilityState.units[0], apkAbilityState.units[1])).toBe(10);
        apkAbilityState.units[0].pos = { x: 1, y: 0 };
        apkAbilityState.units[1].unitClass = 'water_elemental';
        apkAbilityState.units[1].pos = { x: 0, y: 0 };
        expect(getDefenseBonus(apkAbilityState, apkAbilityState.units[0], apkAbilityState.units[1])).toBe(10);

        apkAbilityState.units[0].unitClass = 'dragon';
        apkAbilityState.units[0].pos = { x: 1, y: 0 };
        apkAbilityState.units[1].unitClass = 'soldier';
        apkAbilityState.units[1].pos = { x: 0, y: 0 };
        const flyingAttackWaterDamage = calculateDamage(apkAbilityState, 'apk_water_child', 'apk_target');
        apkAbilityState.map.tiles[0][0] = { terrainId: 6, ownerId: null };
        const flyingAttackRoadDamage = calculateDamage(apkAbilityState, 'apk_water_child', 'apk_target');
        expect(flyingAttackWaterDamage - flyingAttackRoadDamage).toBe(15);

        const apkCastleAsRoad = { terrainId: 6 as const, ownerId: 0, apkTerrainId: 37 };
        const apkTownAsRoad = { terrainId: 6 as const, ownerId: 1, apkTerrainId: 36 };
        expect(getTileTerrainKey(apkCastleAsRoad)).toBe('castle');
        expect(getTileTerrainKey(apkTownAsRoad)).toBe('town');

        const apkSemanticState = createDemoState({ recruitableUnits: ['soldier'] });
        apkSemanticState.map.tiles[0][2] = apkCastleAsRoad;
        apkSemanticState.map.tiles[1][0] = apkTownAsRoad;
        expect(checkCastle(apkSemanticState, { x: 2, y: 0 }, 0)).toBe(true);
        expect(checkVillage(apkSemanticState, { x: 0, y: 1 }, 1)).toBe(true);
        expect(countCastle(apkSemanticState, 0)).toBe(2);
        expect(countVillage(apkSemanticState, 1)).toBe(1);
        expect(getLegalActions(apkSemanticState, 0).some(action => (
            action.type === 'recruit_to_castle'
            && action.castlePos.x === 2
            && action.castlePos.y === 0
        ))).toBe(true);
        apkSemanticState.units[0].pos = { x: 2, y: 0 };
        const apkSemanticObservation = new AncientEmpiresEnv({ initialState: apkSemanticState }).getObservation();
        expect(apkSemanticObservation.tiles.find(tile => tile.x === 2 && tile.y === 0)).toEqual(expect.objectContaining({
            terrainId: 6,
            ruleTerrainId: 10,
            terrainKey: 'castle',
            terrainTags: expect.arrayContaining(['castle', 'recruit_source']),
            apkTerrainId: 37,
            apkTerrainMappingConfidence: 'confirmed',
            apkTerrainMappingEvidence: ['data_bin_values', 'language_table_building_description', 'texture_atlas']
        }));
        expect(apkSemanticObservation.units.find(unit => unit.id === 'u1')).toEqual(expect.objectContaining({
            tileTerrainId: 6,
            tileRuleTerrainId: 10,
            tileTerrainKey: 'castle',
            tileTerrainTags: expect.arrayContaining(['castle', 'recruit_source']),
            tileOwnerId: 0,
            tileApkTerrainId: 37,
            tileApkTerrainMappingConfidence: 'confirmed',
            tileApkTerrainMappingEvidence: ['data_bin_values', 'language_table_building_description', 'texture_atlas'],
            tileApkTerrainConfig: {
                id: 37,
                kind: 6,
                flagA: 1,
                variant: 3,
                linkedA: 0,
                defenseBonus: 15,
                healPerTurn: 20,
                moveCost: 1,
                flagB: 1,
                linkedB: -1,
                linkedC: -1,
                flagC: 0,
                tail: '0x00000000'
            },
            tileDefenseBonus: 15,
            tileHealPerTurn: 20,
            tileMoveCost: 1
        }));
        expect(apkSemanticObservation.tiles.find(tile => tile.x === 0 && tile.y === 1)).toEqual(expect.objectContaining({
            terrainId: 6,
            ruleTerrainId: 9,
            terrainKey: 'town',
            terrainTags: expect.arrayContaining(['town', 'income', 'capturable']),
            apkTerrainId: 36,
            apkTerrainMappingConfidence: 'confirmed',
            apkTerrainMappingEvidence: ['data_bin_values', 'language_table_building_description', 'texture_atlas']
        }));
        apkSemanticObservation.tiles.find(tile => tile.x === 2 && tile.y === 0)!.apkTerrainMappingEvidence!.push('mutated');
        expect(new AncientEmpiresEnv({ initialState: apkSemanticState }).getObservation().tiles.find(tile => tile.x === 2 && tile.y === 0)!.apkTerrainMappingEvidence).toEqual([
            'data_bin_values',
            'language_table_building_description',
            'texture_atlas'
        ]);

        const incomeBefore = apkSemanticState.players.find(player => player.id === 1)!.gold;
        const apkSemanticEngine = new GameEngine(apkSemanticState);
        apkSemanticEngine.step({ type: 'end_turn' });
        expect(apkSemanticEngine.getState().players.find(player => player.id === 1)!.gold).toBe(incomeBefore + 150);

        const apkDestroyState = createDemoState();
        apkDestroyState.map.tiles[0][0] = {
            terrainId: 6,
            ownerId: 1,
            apkTerrainId: 36,
            apkTerrainRaw: (36 << 12) | 1,
            apkOwnerCode: 1
        };
        apkDestroyState.units[0].unitClass = 'catapult';
        apkDestroyState.units[0].pos = { x: 0, y: 0 };
        const apkDestroyEngine = new GameEngine(apkDestroyState);
        expect(apkDestroyEngine.getLegalActions(0).some(action => action.type === 'destroy_town' && action.unitId === 'u1')).toBe(true);
        apkDestroyEngine.step({ type: 'destroy_town', unitId: 'u1' });
        const destroyedTile = apkDestroyEngine.getState().map.tiles[0][0];
        expect(destroyedTile).toEqual(expect.objectContaining({
            terrainId: 8,
            ownerId: null,
            apkTerrainId: 27,
            apkTerrainRaw: (27 << 12) | 0xff,
            apkOwnerCode: 0xff
        }));
        expect(getTileTerrainKey(destroyedTile)).toBe('damaged_town');

        const apkRepairState = createDemoState();
        apkRepairState.map.tiles[0][0] = {
            terrainId: 6,
            ownerId: null,
            apkTerrainId: 27,
            apkTerrainRaw: (27 << 12) | 0xff,
            apkOwnerCode: 0xff
        };
        apkRepairState.units[0].pos = { x: 0, y: 0 };
        const apkRepairEngine = new GameEngine(apkRepairState);
        expect(apkRepairEngine.getLegalActions(0).some(action => action.type === 'repair' && action.unitId === 'u1')).toBe(true);
        apkRepairEngine.step({ type: 'repair', unitId: 'u1' });
        const repairedTile = apkRepairEngine.getState().map.tiles[0][0];
        expect(repairedTile).toEqual(expect.objectContaining({
            terrainId: 9,
            ownerId: 0,
            apkTerrainId: 36,
            apkTerrainRaw: 36 << 12,
            apkOwnerCode: 0
        }));
        expect(getTileTerrainKey(repairedTile)).toBe('town');

        const apkCaptureState = createDemoState();
        apkCaptureState.map.tiles[0][0] = {
            terrainId: 6,
            ownerId: null,
            apkTerrainId: 37,
            apkTerrainRaw: (37 << 12) | 0xff,
            apkOwnerCode: 0xff
        };
        apkCaptureState.units[0].pos = { x: 0, y: 0 };
        const apkCaptureEngine = new GameEngine(apkCaptureState);
        expect(apkCaptureEngine.getLegalActions(0).some(action => action.type === 'capture' && action.unitId === 'u1')).toBe(true);
        apkCaptureEngine.step({ type: 'capture', unitId: 'u1' });
        expect(apkCaptureEngine.getState().map.tiles[0][0]).toEqual(expect.objectContaining({
            terrainId: 6,
            ownerId: 0,
            apkTerrainId: 37,
            apkTerrainRaw: 37 << 12,
            apkOwnerCode: 0
        }));
    });

    it('初始化与状态克隆不影响原状态', () => {
        const state = createDemoState();
        const engine = new GameEngine(state);
        const cloneFn = engine.clone();
        
        const act = cloneFn.getLegalActions(0)[0];
        cloneFn.step(act);

        expect(cloneFn.getState().turn).not.toBeUndefined();
        
        const origState = engine.getState();
        expect(origState.currentPlayer).toBe(0);
        expect(origState.units[0].hasMoved).toBe(false);
    });

    it('野外营地回血 20，不能招募，不能占领', () => {
        const state = createDemoState();
        // Give P0 a camp holding by commander
        state.map.tiles[0][0].terrainId = 11; // camp
        state.map.tiles[0][0].ownerId = null; // neutral explicitly
        state.units[0].hp = 50; 
        
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        
        // Cannot recruit
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBe(0);
        
        // Cannot capture
        const captureActions = actions.filter(a => a.type === 'capture');
        expect(captureActions.length).toBe(0);
        
        // Check healing mechanics via turn change (P0 -> P1 -> P0)
        engine.step({ type: 'end_turn' });
        engine.step({ type: 'end_turn' });
        const finalState = engine.getState();
        expect(finalState.units.find(u => u.id === 'u1')!.hp).toBe(70);
    });

    it('城镇和城堡会产生金币收益，营地不会，且切换回合兵力回血不超过最大血量', () => {
        const state = createDemoState();
        // 赋予P1一个城镇(9), 城堡(10已经在7,7)
        state.map.tiles[6][6].terrainId = 9;
        state.map.tiles[6][6].ownerId = 1;

        // 让P1的 commander 在己方城堡受损，但伤害很小
        state.units[1].hp = 140; 
        state.units[1].maxHp = 150;
        
        const engine = new GameEngine(state);
        let currentP1Gold = engine.getState().players[1].gold;
        
        // P0 end turn -> P1 turn starts
        engine.step({ type: 'end_turn' });
        
        const finalState = engine.getState();
        expect(finalState.currentPlayer).toBe(1);
        
        // Income = 100 (from 7,7 P1 Castle) + 50 (from 6,6 P1 Town) = 150
        expect(finalState.players[1].gold).toBe(currentP1Gold + 150);
        
        // Healing = +20 (standing on castle), but maxHp is 150
        expect(finalState.units.find(u => u.id === 'u2')!.hp).toBe(150);
    });

    it('非指挥官站在城堡时不生成 recruit_and_deploy 动作，但如果城堡己方可以生成 recruit_to_castle (如果原本为空，这里由于有人而不会生成空堡招募)', () => {
        const state = createDemoState();
        // Replace P0 commander with infantry on the castle
        state.units[0].unitClass = 'soldier';
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        // 不应该有任何招募行为，因为被自己的普通士兵占了
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBe(0);
    });

    it('指挥官站在己方城堡可产生 recruit_and_deploy 动作且生成不在城堡原地', () => {
        const engine = new GameEngine(createDemoState());
        const actions = engine.getLegalActions(0);
        const recruitActions = actions.filter(a => a.type === 'recruit_and_deploy');
        expect(recruitActions.length).toBeGreaterThan(0);
        
        const act = recruitActions[0];
        if (act.type === 'recruit_and_deploy') {
            // 生成格子必须与城堡不处于同一格
            expect(act.to.x !== act.castlePos.x || act.to.y !== act.castlePos.y).toBe(true);
            engine.step(act);
            // 新兵已处于目标格子且不能移动
            const newUnits = engine.getState().units.filter(u => u.pos.x === act.to.x && u.pos.y === act.to.y);
            expect(newUnits.length).toBe(1);
            expect(newUnits[0].hasMoved).toBe(true);
            expect(newUnits[0].movementRemaining).toBe(0);
            expect(newUnits[0].hasActed).toBe(false);
            expect(engine.getState().pendingUnitId).toBe(newUnits[0].id);

            // pending 状态下，合法动作只能是该单位的动作；APK stacked 文案禁止结束回合。
            const subsequentActions = engine.getLegalActions(0);
            
            // 没有其他单位的动作
            const otherUnitsActions = subsequentActions.filter(a => (a as any).unitId && (a as any).unitId !== newUnits[0].id);
            expect(otherUnitsActions.length).toBe(0);

            // 没有招募的动作
            const recruitAgain = subsequentActions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitAgain.length).toBe(0);
            expect(subsequentActions.some(a => a.type === 'end_turn')).toBe(false);

            // 让这个新兵 wait
            const waitAct = subsequentActions.find(a => a.type === 'wait');
            expect(waitAct).toBeDefined();
            engine.step(waitAct!);

            // pending 应该清除了
            expect(engine.getState().pendingUnitId).toBeUndefined();
        }
    });

    it('空城堡可产生 recruit_to_castle 动作，生成的单位可以马上移动和行动', () => {
        const state = createDemoState();
        // 让 P0 城堡上的人走开 (Commander 走到旁边)
        state.units[0].pos = { x: 2, y: 2 };
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        const recruitActions = actions.filter(a => a.type === 'recruit_to_castle');
        expect(recruitActions.length).toBeGreaterThan(0);

        const act = recruitActions[0];
        if (act.type === 'recruit_to_castle') {
            engine.step(act);
            const newState = engine.getState();
            const newUnits = newState.units.filter(u => u.pos.x === act.castlePos.x && u.pos.y === act.castlePos.y);
            expect(newUnits.length).toBe(1);
            expect(newUnits[0].hasMoved).toBe(false);
            expect(newUnits[0].hasActed).toBe(false);
            expect(newState.pendingUnitId).toBe(newUnits[0].id);

            // 具有 pendingUnitId，只能该单位动
            const subActions = engine.getLegalActions(0);
            const canMove = subActions.some(a => a.type === 'move' && a.unitId === newUnits[0].id);
            expect(canMove).toBe(true);
            expect(subActions.some(a => a.type === 'end_turn')).toBe(false);

            // 执行移动，然后依然 pending (因为移动没有 hasActed)？
            // 移动以后 pending 还会在吗？
            // 引擎里面 step(move) 并未改变 hasActed, 而且因为 action 不是 end_turn, pendingUnit 依然有，所以依然锁住! 这是正确的，符合要求。
            const moveAct = subActions.find(a => a.type === 'move')!;
            engine.step(moveAct);
            expect(engine.getState().pendingUnitId).toBe(newUnits[0].id);
        }
    });

    it('修理者可修理损坏城镇', () => {
        const state = createDemoState();
        state.map.tiles[0][0].terrainId = 8; // Commander is standing on damaged_town (8)
        state.map.tiles[0][0].ownerId = null;
        
        const engine = new GameEngine(state);
        const actions = engine.getLegalActions(0);
        const repairActions = actions.filter(a => a.type === 'repair');
        expect(repairActions.length).toBe(1);

        engine.step(repairActions[0]);
        const tile = engine.getState().map.tiles[0][0];
        
        expect(tile.terrainId).toBe(9); // 变为城镇
        expect(tile.ownerId).toBe(0); // 属于修理者
    });

    it('APK 21 个单位配置和 ID 映射存在', () => {
        expect(Object.keys(UNIT_CONFIGS).length).toBe(21);
        expect(UNIT_CONFIGS.crystal.name).toBe('水晶');
        expect(UNIT_CONFIGS.crystal.cost).toBeNull();
        expect(UNIT_CONFIGS.dark_mage.attack).toBe(50);
        expect(UNIT_CONFIGS.dark_mage.maxRange).toBe(2);
        expect(UNIT_CONFIGS.slime.magicDefense).toBe(-10);
        expect(UNIT_CONFIGS.golem.maxHpGrowth).toBe(25);
        expect(UNIT_CONFIGS.ice_elemental.maxHpGrowth).toBe(10);
        expect(UNIT_CONFIGS.druid.moveGrowth).toBe(1);
        expect(APK_UNIT_ID_TO_CLASS[11]).toBe('crystal');
        expect(APK_UNIT_CLASS_TO_ID.crystal).toBe(11);
        expect(APK_STATUS_ID_TO_TYPE[2]).toBe('inspired');
        expect(APK_STATUS_TYPE_TO_ID.inspired).toBe(2);
        expect(APK_ABILITY_ID_TO_TYPE[18]).toBe('attack_aura');
        expect(APK_ABILITY_TYPE_TO_ID.attack_aura).toBe(18);
    });

    it('伤害公式: 士兵攻击史莱姆时，按物理防御计算', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'slime';   // P1 slime

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 6; // road, 0 defense

        // soldier ATK: 55, physical. slime physical DEF: 40
        // Expected damage: (55 - 40 - 0) * (100/100) = 15
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(15);
    });

    it('伤害公式: 幽灵攻击史莱姆时，按魔法防御计算', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'ghost'; // P0 ghost
        state.units[1].unitClass = 'slime';   // P1 slime

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 6; // road, 0 defense

        // ghost ATK: 50, magic. APK 元素防御公式下，史莱姆魔法防御为 -10。
        // Expected damage: (50 - (-10) - 0) * (100/100) = 60
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(60);
    });

    it('伤害公式: 地形防御会减少伤害', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'soldier';   // P1 soldier

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 9; // town, 15 defense bonus

        // soldier ATK: 55, soldier phys DEF: 5. Town def: +15
        // Expected dmg: 55 - 5 - 15 = 35
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(35);
    });

    it('伤害公式: 空军不享受地形防御', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier'; // P0 soldier
        state.units[1].unitClass = 'ghost';   // P1 ghost (flying)

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        
        state.map.tiles[2][1].terrainId = 9; // town, 15 defense bonus

        // soldier ATK: 55. ghost phys DEF: 5. Town def +15 ignored because ghost is flying
        // Expected dmg: 55 - 5 = 50
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(50);
    });

    it('伤害公式: 战意单位低血量时伤害不下降', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'berserker'; // P0 berserker (fighting_spirit)
        state.units[1].unitClass = 'soldier';   // P1 soldier

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 6;
        
        state.units[0].hp = 10; // Low hp

        // berserker ATK: 70, soldier phys DEF: 5
        // Expected damage with fighting_spirit ignores hpRatio: 70 - 5 = 65
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(65);
    });

    it('伤害公式: 近战大师近战最终伤害 ×1.5', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'dragon'; // P0 dragon (melee_master)
        state.units[1].unitClass = 'soldier';

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 }; // melee (distance 1)
        state.map.tiles[2][1].terrainId = 6;

        // dragon ATK: 70 magic. soldier magic DEF: 5
        // rawDmg = 70 - 5 = 65
        // melee_master: 65 * 1.5 = 97.5 -> 97
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(97);
    });

    it('伤害公式: 远程防御对远程攻击减半', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'archer'; // P0 archer (range 2-3)
        state.units[1].unitClass = 'golem'; // P1 golem (ranged_defense)

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 3 }; // range 2
        state.map.tiles[3][1].terrainId = 6; 

        // archer phys ATK: 45. golem phys DEF: 30.
        // rawDmg = 45 - 30 = 15
        // ranged_defense (not melee): 15 * 0.5 = 7.5 -> Math.floor -> 7
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(7);
    });

    it('伤害公式: 空军攻击水中非空军单位攻击 +10，同为空军不触发', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'ghost';
        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].unitClass = 'soldier';
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 2;

        expect(calculateDamage(state, 'u1', 'u2')).toBe(55);

        state.units[1].unitClass = 'ghost';
        expect(calculateDamage(state, 'u1', 'u2')).toBe(35);
    });

    it('伤害公式: 最终伤害向下取整', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'soldier';
        state.units[1].unitClass = 'soldier';

        state.units[0].pos = { x: 1, y: 1 };
        state.units[1].pos = { x: 1, y: 2 };
        state.map.tiles[2][1].terrainId = 6;
        
        state.units[0].hp = 51; // 51/100
        // atk = 55, def = 5. rawDmg = 50. 
        // 50 * 0.51 = 25.5
        // Floor should be 25.
        const dmg = calculateDamage(state, 'u1', 'u2');
        expect(dmg).toBe(25);
    });

    it('能力测试: 空军在深水和山脉上移动消耗均为 1', () => {
        const state = createDemoState();
        const unit = state.units[0]; 
        unit.unitClass = 'ghost';
        
        const deepWaterTile = { terrainId: 2, ownerId: null };
        const mountainTile = { terrainId: 3, ownerId: null };
        
        expect(getMoveCostForUnit(state, unit, deepWaterTile as any)).toBe(1);
        expect(getMoveCostForUnit(state, unit, mountainTile as any)).toBe(1);
    });

    it('能力测试: 空军不享受地形防御加成', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'ghost' };
        expect(isFlying(unit as any)).toBe(true);
    });

    it('能力测试: 水之子在深水、水中神庙、孤岛、桥移动消耗均为 1', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'mermaid' }; 
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 2, ownerId: null } as any)).toBe(1); 
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 16, ownerId: null } as any)).toBe(1); 
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 5, ownerId: null } as any)).toBe(1); 
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 17, ownerId: null } as any)).toBe(1); 
    });

    it('能力测试: 水之子在水地形攻防 +10', () => {
        const state = createDemoState();
        const attacker = { ...state.units[0], unitClass: 'mermaid', pos: { x: 1, y: 1 } };
        state.units[0] = attacker as any;
        state.map.tiles[1][1].terrainId = 2; 
        
        const defender = { ...state.units[1], unitClass: 'soldier', pos: { x: 1, y: 2 } };
        
        expect(getAttackBonus(state, attacker as any, defender as any)).toBe(10);
        
        const defenderMermaid = { ...state.units[1], unitClass: 'mermaid', pos: { x: 1, y: 2 } };
        state.units[1] = defenderMermaid as any;
        state.map.tiles[2][1].terrainId = 16; 
        expect(getDefenseBonus(state, attacker as any, defenderMermaid as any)).toBe(10);
    });

    it('能力测试: 山之子匹配山脉、丘陵，不匹配孤岛', () => {
        expect(isMountainTerrain(3)).toBe(true); 
        expect(isMountainTerrain(4)).toBe(true); 
        expect(isMountainTerrain(5)).toBe(false); 
    });

    it('能力测试: 桥按 APK 文案归类为水面地形', () => {
        expect(isWaterTerrain(17)).toBe(true);
        expect(isMountainTerrain(17)).toBe(false);
        expect(isForestTerrain(17)).toBe(false);
    });

    it('能力测试: 森林之子匹配森林', () => {
        expect(isForestTerrain(7)).toBe(true); 
        expect(isForestTerrain(3)).toBe(false); 
    });

    it('能力测试: 大地之子陆地移动消耗 1，水地形移动消耗 2', () => {
        const state = createDemoState();
        const unit = { ...state.units[0], unitClass: 'berserker' }; 
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 1, ownerId: null } as any)).toBe(1);
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 3, ownerId: null } as any)).toBe(1);
        
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 2, ownerId: null } as any)).toBe(2);
        expect(getMoveCostForUnit(state, unit as any, { terrainId: 17, ownerId: null } as any)).toBe(2);
    });

    it('能力测试: 自我修复回合开始回复最大生命值 25%', () => {
        const state = createDemoState();
        state.units[0].unitClass = 'slime';
        state.units[0].hp = 50;
        state.units[0].maxHp = 100;
        state.map.tiles[0][0].terrainId = 6; 
        
        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' }); 
        engine.step({ type: 'end_turn' }); 
        
        const finalState = engine.getState();
        expect(finalState.units[0].hp).toBe(75);
    });

    it('能力测试: 自我修复在中毒致死边界仍会生效', () => {
        const state = createDemoState();
        const slime = state.units[0];
        slime.unitClass = 'slime';
        slime.hp = 5;
        slime.maxHp = 100;
        slime.status = { type: 'poisoned', remainingTicks: 2 };
        state.map.tiles[slime.pos.y][slime.pos.x].terrainId = 6;

        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' });
        engine.step({ type: 'end_turn' });

        const repaired = engine.getState().units.find(item => item.id === slime.id)!;
        expect(repaired.hp).toBe(20);
        expect(repaired.status).toEqual({ type: 'poisoned', remainingTicks: 1 });
    });

    it('状态系统测试: 单位已有中毒时，致盲不会替换中毒', () => {
        const state = createDemoState();
        // 给 targetA (P1) 手动加上 poisoned 状态
        state.units[1].status = { type: 'poisoned', remainingTicks: 2 };
        // 给 attacker (P0) 配成 blinder (黑巫师 dark_mage 带有 blinder 能力)
        state.units[0].unitClass = 'dark_mage'; 
        
        const engine = new GameEngine(state);
        // 主动攻击
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status?.type).toBe('poisoned'); // 应当不替换
    });

    it('状态系统测试: 投毒者攻击目标后附加中毒', () => {
        const state = createDemoState();
        // 设置 attacker (P0) 是投毒者 (使用 wolf 带有 poisoner 能力)
        state.units[0].unitClass = 'wolf';
        state.units[1].unitClass = 'soldier'; // 确保无 poisoner 
        
        const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status?.type).toBe('poisoned');
        expect(target.status?.remainingTicks).toBe(2);
    });

    it('状态系统测试: 被投毒者能力单位不会被投毒', () => {
        const state = createDemoState();
        // 设定双方都有投毒者能力 (wolf 具有 poisoner)
        state.units[0].unitClass = 'wolf';
        state.units[1].unitClass = 'wolf'; 
        
        const engine = new GameEngine(state);
        engine.step({ type: 'attack', attackerId: state.units[0].id, targetId: state.units[1].id });
        
        const target = engine.getState().units.find(u => u.id === state.units[1].id)!;
        expect(target.status).toBeUndefined(); // 此时不该附加上毒
    });

    it('状态系统测试: 中毒回合开始先扣 10 血与状态完结', () => {
        const state = createDemoState();
        // 给 P0 的 soldier 置于 6 号平地（没有基础 heal，也没有任何 self_repair 地带干扰）并设置中毒
        const soldier = state.units[0];
        soldier.unitClass = 'soldier';
        soldier.hp = 50;
        soldier.status = { type: 'poisoned', remainingTicks: 2 };
        state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 6;
        
        const engine = new GameEngine(state);
        // 经过一轮（P0 -> P1 -> P0），使 P0 的回合重新开始
        engine.step({ type: 'end_turn' }); // 切到 P1
        engine.step({ type: 'end_turn' }); // 重新切到 P0
        
        let u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(40); // 第一次少 10
        expect(u.status?.remainingTicks).toBe(1);
        
        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0
        
        u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(30); // 第二次少 10
        expect(u.status?.remainingTicks).toBe(0);

        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0
        
        u = engine.getState().units.find(item => item.id === soldier.id)!;
        expect(u.hp).toBe(30); // 第三次回合不扣血并且中毒消除
        expect(u.status).toBeUndefined();
    });

    it('状态系统测试: 中毒扣血致死后不再触发地形回血', () => {
        const state = createDemoState();
        const soldier = state.units[0];
        soldier.unitClass = 'soldier';
        soldier.hp = 5; // 低保生命 5
        soldier.status = { type: 'poisoned', remainingTicks: 2 };
        // 放置于 11 号地块（城堡且 owner 是 P0 自行势力，有极高的地形回血）
        state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 11;
        state.map.tiles[soldier.pos.y][soldier.pos.x].ownerId = 0;
        
        const engine = new GameEngine(state);
        engine.step({ type: 'end_turn' }); // P1
        engine.step({ type: 'end_turn' }); // P0。回合开始，中毒应扣 10 血，导致归零并排除
        
        const u = engine.getState().units.find(item => item.id === soldier.id);
        expect(u).toBeUndefined(); // 该单位应该已经致死退场
    });

    it('状态系统测试: 致盲后攻击范围为 0', () => {
        const state = createDemoState();
        const attacker = state.units[0];
        attacker.status = { type: 'blinded' };
        
        const actions = getLegalActions(state, 0);
        // 合法操作中，由于致盲，一定不可以包含对 defender 发起的攻击动作
        const hasAttack = actions.some((act: any) => act.type === 'attack');
        expect(hasAttack).toBe(false);
    });

    it('状态系统测试: 虚弱后移动力为 1，近战防御 -10，远程减半', () => {
        const state = createDemoState();
        // P0 (x:0, y:0) 位置的 soldier 手动加上 weakened
        const soldier = state.units[0];
        soldier.unitClass = 'soldier'; // 保证防御
        soldier.status = { type: 'weakened', remainingTurns: 1 };
        
        // 1. 测试移动力变成 1
        const reachable = getReachablePositions(state, soldier.id);
        // 仅在原地 1 步范围 (x:0,y:0),(1,0),(0,1) 等
        reachable.forEach((pos: any) => {
            const dist = Math.abs(pos.x - soldier.pos.x) + Math.abs(pos.y - soldier.pos.y);
            expect(dist).toBeLessThanOrEqual(1);
        });

        // 2. 远程攻击时虚弱防御惩罚减半为 -5
        const attacker = state.units[1]; // P1 攻击方
        attacker.unitClass = 'archer'; 
        
        // 我们计算当无 weakened 状态和有 weakened 状态时的防御伤害对比
        const stateNormal = JSON.parse(JSON.stringify(state));
        delete stateNormal.units[0].status; // 正常防御测试
        const normalDmg = calculateDamage(stateNormal, attacker.id, soldier.id);
        const weakenedDmg = calculateDamage(state, attacker.id, soldier.id);
        
        expect(weakenedDmg - normalDmg).toBe(5);

        // 3. 近战攻击时虚弱防御惩罚为 -10
        attacker.unitClass = 'soldier';
        attacker.pos = { x: 0, y: 1 };
        const meleeStateNormal = JSON.parse(JSON.stringify(state));
        delete meleeStateNormal.units[0].status;
        const normalMeleeDmg = calculateDamage(meleeStateNormal, attacker.id, soldier.id);
        const weakenedMeleeDmg = calculateDamage(state, attacker.id, soldier.id);
        expect(weakenedMeleeDmg - normalMeleeDmg).toBe(10);
    });

    it('状态系统测试: 净化函数可以清除中毒、致盲、虚弱', () => {
        const unit = { ...createDemoState().units[0] };
        
        unit.status = { type: 'poisoned', remainingTicks: 2 };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();

        unit.status = { type: 'blinded' };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();

        unit.status = { type: 'weakened', remainingTurns: 1 };
        clearNegativeStatus(unit);
        expect(unit.status).toBeUndefined();
    });

    it('状态系统测试: 反击不会附加中毒或致盲', () => {
        const state = createDemoState();
        // attacker (P0) 是普通兵种 (soldier) 无任何状态
        const attacker = state.units[0];
        attacker.unitClass = 'soldier'; 
        // target (P1) 是投毒者 (wolf)
        const target = state.units[1];
        target.unitClass = 'wolf';
        
        const engine = new GameEngine(state);
        // 主动攻击，期待 target 会由于存活并在射程内进行反击
        engine.step({ type: 'attack', attackerId: attacker.id, targetId: target.id });
        
        const finalAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
        expect(finalAttacker.status).toBeUndefined(); // 被反击的一方绝对不能被附加中毒 or 致盲
    });

    describe('第 5 步：主动技能、光环、墓碑与二次移动测试', () => {
        it('5.1 治疗师治疗普通友军 +40，且可突破最大血量', () => {
            const state = createDemoState();
            // 在 (0,0) 放一个 paladin (治疗师)，在相邻 (0,1) 放一个 soldier (友军，受伤状态且 maxHp 为 100)
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };
            paladin.hasActed = false;

            // 构造受伤友军
            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hp = 90;
            friend.maxHp = 100;
            
            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(130); // APK：治疗师治疗可以突破最大血量
            expect(resFriend.hasBeenHealedThisTurn).toBe(true);
        });

        it('5.1b 治疗师可以继续治疗已经超过最大血量的友军', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };
            paladin.hasActed = false;

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hp = 130;
            friend.maxHp = 100;

            const healAction = getLegalActions(state, 0).find(action =>
                action.type === 'heal'
                && action.healerId === paladin.id
                && action.targetId === friend.id
            );
            expect(healAction).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(healAction!);

            const resFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(170);
            expect(resFriend.hasBeenHealedThisTurn).toBe(true);
        });

        it('5.1c 普通回合回血不会压低治疗师造成的超上限生命', () => {
            const state = createDemoState();
            state.currentPlayer = 1;
            const unit = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            unit.hp = 130;
            unit.maxHp = 100;
            unit.pos = { x: 0, y: 0 };

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });

            const resUnit = engine.getState().units.find(u => u.id === unit.id)!;
            expect(resUnit.hp).toBe(130);
        });

        it('5.1d 亡灵中毒回血不会压低已有超上限生命', () => {
            const state = createDemoState();
            state.currentPlayer = 1;
            const ghost = state.units.find(u => u.ownerId === 0)!;
            ghost.unitClass = 'ghost';
            ghost.hp = 130;
            ghost.maxHp = 100;
            ghost.status = { type: 'poisoned', remainingTicks: 2 };

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });

            const resGhost = engine.getState().units.find(u => u.id === ghost.id)!;
            expect(resGhost.hp).toBe(130);
            expect(resGhost.status).toEqual({ type: 'poisoned', remainingTicks: 1 });
        });

        it('5.2 治疗师治疗骷髅/幽灵造成 40 伤害', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };

            // 构造友军幽灵 (具有 undead 属性)
            const ghostFriend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            ghostFriend.unitClass = 'ghost';
            ghostFriend.pos = { x: 0, y: 1 };
            ghostFriend.hp = 80;
            ghostFriend.maxHp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'heal', healerId: paladin.id, targetId: ghostFriend.id });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghostFriend.id)!;
            expect(resGhost.hp).toBe(40); // 80 - 40 = 40 (变为伤害)
        });

        it('5.2b 亡灵受到治疗伤害后也会消耗本回合被治疗次数', () => {
            const state = createDemoState();
            const firstPaladin = state.units.find(u => u.ownerId === 0)!;
            firstPaladin.unitClass = 'paladin';
            firstPaladin.pos = { x: 0, y: 0 };

            const skeletonFriend = state.units.find(u => u.ownerId === 0 && u.id !== firstPaladin.id)!;
            skeletonFriend.unitClass = 'skeleton';
            skeletonFriend.pos = { x: 0, y: 1 };
            skeletonFriend.hp = 100;

            state.units.push({
                id: 'u_second_paladin',
                ownerId: 0,
                unitClass: 'paladin',
                pos: { x: 1, y: 1 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 0,
                exp: 0
            });

            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: firstPaladin.id, targetId: skeletonFriend.id });

            const afterHeal = engine.getState();
            const resSkeleton = afterHeal.units.find(u => u.id === skeletonFriend.id)!;
            expect(resSkeleton.hp).toBe(60);
            expect(resSkeleton.hasBeenHealedThisTurn).toBe(true);
            expect(engine.getLegalActions(0).some(action =>
                action.type === 'heal'
                && action.healerId === 'u_second_paladin'
                && action.targetId === skeletonFriend.id
            )).toBe(false);
        });

        it('5.3 中毒单位不能被治疗师治疗', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hp = 50;
            friend.status = { type: 'poisoned', remainingTicks: 2 };

            const actions = getLegalActions(state, 0);
            const hasHealFriend = actions.some(a => a.type === 'heal' && a.targetId === friend.id);
            expect(hasHealFriend).toBe(false); // 中毒单位不应生成治疗动作
        });

        it('5.4 墓碑按中立对象存在', () => {
            const state = createDemoState();
            state.graves = [
                { id: 'grave1', pos: { x: 3, y: 3 }, remainingTurns: 2 }
            ];
            expect(state.graves.length).toBe(1);
            expect(state.graves[0].pos.x).toBe(3);
        });

        it('5.5 普通单位踩墓碑扣 10 且墓碑消失', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];
            const soldier = state.units.find(u => u.ownerId === 0)!;
            soldier.unitClass = 'soldier';
            soldier.pos = { x: 0, y: 0 };
            soldier.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: soldier.id, to: { x: 0, y: 1 } });

            const finalState = engine.getState();
            const resSoldier = finalState.units.find(u => u.id === soldier.id)!;
            expect(resSoldier.hp).toBe(70); // 80 - 10 = 70
            expect(finalState.graves?.length).toBe(0); // 墓碑消失了
        });

        it('5.6 骷髅/幽灵踩墓碑回复 10 且墓碑消失', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];
            const ghost = state.units.find(u => u.ownerId === 0)!;
            ghost.unitClass = 'ghost'; // undead
            ghost.pos = { x: 0, y: 0 };
            ghost.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: ghost.id, to: { x: 0, y: 1 } });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghost.id)!;
            expect(resGhost.hp).toBe(90); // 80 + 10 = 90
            expect(finalState.graves?.length).toBe(0); // 墓碑消失
        });

        it('5.6.1 召唤师踩墓碑不损失生命且墓碑消失', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];
            const witch = state.units.find(u => u.ownerId === 0)!;
            witch.unitClass = 'witch';
            witch.pos = { x: 0, y: 0 };
            witch.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'move', unitId: witch.id, to: { x: 0, y: 1 } });

            const finalState = engine.getState();
            const resWitch = finalState.units.find(u => u.id === witch.id)!;
            expect(resWitch.hp).toBe(80);
            expect(finalState.graves?.length).toBe(0);
        });

        it('5.7 召唤师可在 2 格范围内用墓碑召唤骷髅', () => {
            const state = createDemoState();
            const witch = state.units.find(u => u.ownerId === 0)!;
            witch.unitClass = 'witch'; // summoner
            witch.pos = { x: 0, y: 0 };

            state.graves = [
                { id: 'grave1', pos: { x: 0, y: 2 }, remainingTurns: 2 }
            ];

            // 检查合法动作应当产生召唤
            const actions = getLegalActions(state, 0);
            const summonAct = actions.find(a => a.type === 'summon');
            expect(summonAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(summonAct!);

            const finalState = engine.getState();
            expect(finalState.graves?.length).toBe(0); // 墓碑被用于召唤而消失
            const newSkeleton = finalState.units.find(u => u.unitClass === 'skeleton')!;
            expect(newSkeleton).toBeDefined();
            expect(newSkeleton.pos.x).toBe(0);
            expect(newSkeleton.pos.y).toBe(2);
        });

        it('5.8 支援者可重置合法友军行动状态', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid'; // supporter
            druid.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 2 }; // 相距 2 格
            friend.hasActed = true; // 已行动
            friend.hasMoved = true;
            friend.movementRemaining = 1;

            const actions = getLegalActions(state, 0);
            const supportAct = actions.find(a => a.type === 'support' && a.targetId === friend.id);
            expect(supportAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(supportAct!);

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hasActed).toBe(false); // 被重置可再次移动和行动
            expect(resFriend.hasMoved).toBe(false);
            expect(resFriend.movementRemaining).toBe(getEffectiveStats(resFriend).move);
            expect(resFriend.hasBeenSupportedThisTurn).toBe(true);
        });

        it('5.9 支援者不能支援突击部队、城堡捕获者、支援者', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.pos = { x: 0, y: 0 };

            // 它是它的本家突击/城堡捕获/支援友军，哪怕它们已经待机，也不能产生支援动作
            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'wolf'; // 属于突击部队 assault_troop 
            friend.pos = { x: 0, y: 1 };
            friend.hasActed = true;

            const actions = getLegalActions(state, 0);
            const hasSupport = actions.some(a => a.type === 'support');
            expect(hasSupport).toBe(false);
        });

        it('5.10 破坏者可将无人守护城镇变为损坏城镇，不能破坏城堡', () => {
            const state = createDemoState();
            const catapult = state.units.find(u => u.ownerId === 0)!;
            catapult.unitClass = 'catapult'; // destroyer
            catapult.pos = { x: 1, y: 1 };

            // 设当前格为城镇
            state.map.tiles[1][1].terrainId = 9; // town
            state.map.tiles[1][1].ownerId = null;

            const actions = getLegalActions(state, 0);
            const destroyAct = actions.find(a => a.type === 'destroy_town' && a.unitId === catapult.id);
            expect(destroyAct).toBeDefined();

            const engine = new GameEngine(state);
            engine.step(destroyAct!);

            const finalState = engine.getState();
            expect(finalState.map.tiles[1][1].terrainId).toBe(8); // 变为损坏城镇 (8)
        });

        it('5.11 攻击光环附加鼓舞状态，且不覆盖已有状态', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 };

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: druid.id });

            const inspiredFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(inspiredFriend.status?.type).toBe('inspired');

            const blockedState = createDemoState();
            const blockedDruid = blockedState.units.find(u => u.ownerId === 0)!;
            blockedDruid.unitClass = 'druid';
            blockedDruid.pos = { x: 1, y: 1 };
            const poisonedFriend = blockedState.units.find(u => u.ownerId === 0 && u.id !== blockedDruid.id)!;
            poisonedFriend.pos = { x: 1, y: 2 };
            poisonedFriend.status = { type: 'poisoned', remainingTicks: 2 };

            const blockedEngine = new GameEngine(blockedState);
            blockedEngine.step({ type: 'wait', unitId: blockedDruid.id });

            const resFriend = blockedEngine.getState().units.find(u => u.id === poisonedFriend.id)!;
            expect(resFriend.status?.type).toBe('poisoned');
        });

        it('5.11b 光环只在待机时触发，攻击后不会触发', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.id === 'u1')!;
            const friend = state.units.find(u => u.id === 'u3')!;
            const enemy = state.units.find(u => u.ownerId === 1)!;

            druid.unitClass = 'druid';
            druid.pos = { x: 1, y: 1 };
            friend.unitClass = 'soldier';
            friend.pos = { x: 2, y: 1 };
            enemy.unitClass = 'soldier';
            enemy.pos = { x: 1, y: 2 };

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: druid.id, targetId: enemy.id });

            const resultFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resultFriend.status).toBeUndefined();
        });

        it('5.12 鼓舞近战攻击 +10，远程攻击加成减半', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            const defender = state.units[1];
            attacker.unitClass = 'soldier';
            attacker.status = { type: 'inspired', remainingTurns: 1 };
            attacker.pos = { x: 1, y: 1 };
            defender.unitClass = 'soldier';
            defender.pos = { x: 1, y: 2 };
            state.map.tiles[2][1].terrainId = 6;

            expect(calculateDamage(state, attacker.id, defender.id)).toBe(60);

            attacker.unitClass = 'archer';
            attacker.pos = { x: 1, y: 0 };
            defender.pos = { x: 1, y: 2 };
            expect(calculateDamage(state, attacker.id, defender.id)).toBe(45);
        });

        it('5.13 净化光环结束回合后触发，清除 debuff 并回血', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf'; // cleansing_aura
            elf.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 }; // 相距 1 格
            friend.hp = 80;
            friend.maxHp = 100;
            friend.status = { type: 'poisoned', remainingTicks: 2 };

            // 待机
            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const finalState = engine.getState();
            const resFriend = finalState.units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(90); // 80 + 10 = 90
            expect(resFriend.status).toBeUndefined(); // Poisoned 状态被净化清除
        });

        it('5.14 净化光环对骷髅/幽灵造成 10 伤害', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf';
            elf.pos = { x: 1, y: 1 };

            const ghost = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            ghost.unitClass = 'ghost'; // undead
            ghost.pos = { x: 1, y: 2 };
            ghost.hp = 80;

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const finalState = engine.getState();
            const resGhost = finalState.units.find(u => u.id === ghost.id)!;
            expect(resGhost.hp).toBe(70); // 80 - 10 = 70 (变成伤害)
        });

        it('5.15 虚弱光环不覆盖已有状态', () => {
            const state = createDemoState();
            const golem = state.units.find(u => u.ownerId === 0)!;
            golem.unitClass = 'golem'; // weakness_aura
            golem.pos = { x: 1, y: 1 };

            const enemy = state.units.find(u => u.ownerId === 1)!;
            enemy.unitClass = 'soldier';
            enemy.pos = { x: 1, y: 2 };
            enemy.status = { type: 'blinded' }; // 已经拥有一种状态

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: golem.id });

            const finalState = engine.getState();
            const resEnemy = finalState.units.find(u => u.id === enemy.id)!;
            expect(resEnemy.status?.type).toBe('blinded'); // 不应该变更状态为 weakened
        });

        it('5.16 突击部队攻击后可以使用攻击前剩余移动力移动', () => {
            const state = createDemoState();
            state.currentPlayer = 0;
            const wolf = state.units.find(u => u.ownerId === 0)!;
            wolf.unitClass = 'wolf'; // assault_troop, move=6
            wolf.pos = { x: 2, y: 2 };
            wolf.hasMoved = false;
            wolf.hasActed = false;
            wolf.movementRemaining = 6;

            const enemy = state.units.find(u => u.ownerId === 1)!;
            enemy.unitClass = 'slime';
            enemy.pos = { x: 2, y: 3 }; // 让它们相邻

            // 就地攻击，
            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: wolf.id, targetId: enemy.id });

            const midState = engine.getState();
            const resWolf = midState.units.find(u => u.id === wolf.id)!;
            expect(resWolf.movementRemaining).toBe(6);

            // 合法动作应该含 post_attack_move
            const actions = getLegalActions(midState, 0);
            const hasPostMove = actions.some(a => a.type === 'post_attack_move' && a.unitId === wolf.id);
            expect(hasPostMove).toBe(true);
        });
    });

    describe('第 6 步：经验、等级与升级测试', () => {
        it('6.1 攻击后攻击者 +30 经验', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.exp = 0;
            attacker.level = 0;

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.hp = 100; // 确保不被打死

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
            expect(resAttacker.exp).toBe(30);
        });

        it('6.2 反击后反击者 +10 经验', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.exp = 0;
            defender.level = 0;
            defender.hp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resDefender = engine.getState().units.find(u => u.id === defender.id)!;
            expect(resDefender.exp).toBe(10); // 反击获得 10 经验
        });

        it('6.3 主动攻击击杀额外 +60', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.exp = 0;
            attacker.level = 0;

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.hp = 5; // 脆皮血量，必定能被一击击杀

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resAttacker = engine.getState().units.find(u => u.id === attacker.id)!;
            // 攻击 30 + 击杀 60 = 90
            expect(resAttacker.exp).toBe(90);
        });

        it('6.4 反击击杀额外 +60', () => {
            const state = createDemoState();
            const attacker = state.units[0];
            attacker.unitClass = 'soldier';
            attacker.pos = { x: 0, y: 0 };
            attacker.hp = 5; // 一击致命

            const defender = state.units[1];
            defender.unitClass = 'soldier';
            defender.pos = { x: 0, y: 1 };
            defender.exp = 0;
            defender.level = 0;
            defender.hp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: defender.id });

            const resDefender = engine.getState().units.find(u => u.id === defender.id)!;
            // 反击 10 + 击杀 60 = 70
            expect(resDefender.exp).toBe(70);
        });

        it('6.5 治疗后治疗者 +30', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.exp = 0;
            paladin.level = 0;
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.pos = { x: 0, y: 1 };
            friend.hp = 50;

            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const resPaladin = engine.getState().units.find(u => u.id === paladin.id)!;
            expect(resPaladin.exp).toBe(30);
        });

        it('6.6 支援后支援者 +10', () => {
            const state = createDemoState();
            const druid = state.units.find(u => u.ownerId === 0)!;
            druid.unitClass = 'druid';
            druid.exp = 0;
            druid.level = 0;
            druid.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== druid.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 0, y: 1 };
            friend.hasActed = true;

            const engine = new GameEngine(state);
            engine.step({ type: 'support', supporterId: druid.id, targetId: friend.id });

            const resDruid = engine.getState().units.find(u => u.id === druid.id)!;
            expect(resDruid.exp).toBe(10);
        });

        it('6.7 召唤后召唤者 +10', () => {
            const state = createDemoState();
            const witch = state.units.find(u => u.ownerId === 0)!;
            witch.unitClass = 'witch';
            witch.exp = 0;
            witch.level = 0;
            witch.pos = { x: 0, y: 0 };

            state.graves = [
                { id: 'g1', pos: { x: 0, y: 1 }, remainingTurns: 2 }
            ];

            const engine = new GameEngine(state);
            engine.step({ type: 'summon', summonerId: witch.id, graveId: 'g1', spawnPos: { x: 0, y: 1 } });

            const resWitch = engine.getState().units.find(u => u.id === witch.id)!;
            expect(resWitch.exp).toBe(10);
        });

        it('6.8 破坏城镇后破坏者 +30', () => {
            const state = createDemoState();
            const catapult = state.units.find(u => u.ownerId === 0)!;
            catapult.unitClass = 'catapult';
            catapult.exp = 0;
            catapult.level = 0;
            catapult.pos = { x: 1, y: 1 };

            state.map.tiles[1][1].terrainId = 9; // town
            state.map.tiles[1][1].ownerId = null;

            const engine = new GameEngine(state);
            engine.step({ type: 'destroy_town', unitId: catapult.id });

            const resCatapult = engine.getState().units.find(u => u.id === catapult.id)!;
            expect(resCatapult.exp).toBe(30);
        });

        it('6.9 经验达到 100 后升到 1 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 90;
            soldier.level = 0;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 120

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(1);
            expect(resSoldier.hp).toBe(100); // 升级回满血（基准100）
        });

        it('6.9b 升级回满血但不裁剪治疗师造成的超上限生命', () => {
            const state = createDemoState();
            const wounded = state.units[0];
            wounded.unitClass = 'soldier';
            wounded.exp = 90;
            wounded.level = 0;
            wounded.hp = 50;

            expect(addExp(wounded, 10)).toBe(true);
            expect(wounded.level).toBe(1);
            expect(wounded.hp).toBe(100);

            const overhealed = state.units[1];
            overhealed.unitClass = 'soldier';
            overhealed.exp = 90;
            overhealed.level = 0;
            overhealed.hp = 130;

            expect(addExp(overhealed, 10)).toBe(true);
            expect(overhealed.level).toBe(1);
            expect(overhealed.hp).toBe(130);
        });

        it('6.10 经验达到 300 后升到 2 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 280;
            soldier.level = 1;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 310

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(2);
        });

        it('6.11 经验达到 600 后升到 3 级', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 580;
            soldier.level = 2;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id }); // +30 exp, total 610

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(3);
        });

        it('6.11b APK 经验阈值公式支持 9 级内部上限', () => {
            expect(getExpThresholdForLevel(1)).toBe(100);
            expect(getExpThresholdForLevel(2)).toBe(300);
            expect(getExpThresholdForLevel(3)).toBe(600);
            expect(getExpThresholdForLevel(9)).toBe(4500);
        });

        it('6.12 一般单位升级后攻击 +10、防御 +5', () => {
            const state = createDemoState();
            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.level = 1;

            const eff = getEffectiveStats(soldier);
            expect(eff.attack).toBe(65);
            expect(eff.physicalDefense).toBe(10);
            expect(eff.magicDefense).toBe(10);
        });

        it('6.12b APK 单位成长配置会驱动有效属性', () => {
            const druid = {
                id: 'u_druid',
                ownerId: 0,
                unitClass: 'druid' as const,
                pos: { x: 1, y: 1 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 2 as const,
                exp: 0
            };

            const iceElemental = {
                ...druid,
                id: 'u_ice',
                unitClass: 'ice_elemental' as const
            };

            const druidEff = getEffectiveStats(druid);
            const iceEff = getEffectiveStats(iceElemental);

            expect(druidEff.attack).toBe(50);
            expect(druidEff.physicalDefense).toBe(10);
            expect(druidEff.magicDefense).toBe(40);
            expect(druidEff.move).toBe(6);
            expect(iceEff.maxHp).toBe(120);
        });

        it('6.13 圣骑士升级后治疗量 +10', () => {
            const state = createDemoState();
            const paladin = state.units.find(u => u.ownerId === 0)!;
            paladin.unitClass = 'paladin';
            paladin.level = 1; // 1级
            paladin.pos = { x: 0, y: 0 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== paladin.id)!;
            friend.pos = { x: 0, y: 1 };
            friend.hp = 40;
            friend.maxHp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'heal', healerId: paladin.id, targetId: friend.id });

            const resFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(90);
        });

        it('6.14 精灵升级后净化光环回血 +5', () => {
            const state = createDemoState();
            const elf = state.units.find(u => u.ownerId === 0)!;
            elf.unitClass = 'elf';
            elf.level = 1; // 1级
            elf.pos = { x: 1, y: 1 };

            const friend = state.units.find(u => u.ownerId === 0 && u.id !== elf.id)!;
            friend.unitClass = 'soldier';
            friend.pos = { x: 1, y: 2 };
            friend.hp = 80;
            friend.maxHp = 100;

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: elf.id });

            const resFriend = engine.getState().units.find(u => u.id === friend.id)!;
            expect(resFriend.hp).toBe(95);
        });

        it('6.15 石头人升级后最大血量 +25', () => {
            const golem = {
                id: 'u_golem',
                ownerId: 0,
                unitClass: 'golem' as any,
                pos: { x: 1, y: 1 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false,
                level: 1 as any,
                exp: 0
            };

            const eff = getEffectiveStats(golem);
            expect(eff.maxHp).toBe(125);
        });

        it('6.16 指挥官升级后移动 +1，并在回合收入中体现额外金币', () => {
            const state = createDemoState();
            const cmd = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            cmd.level = 1; // 1级
            
            const eff = getEffectiveStats(cmd);
            expect(eff.move).toBe(5);

            const engine = new GameEngine(state);
            const prevGold = state.players[0].gold;
            
            state.map.tiles[0][0].terrainId = 10; // castle
            state.map.tiles[0][0].ownerId = 0;

            engine.step({ type: 'end_turn' }); // 变为 P1
            engine.step({ type: 'end_turn' }); // 回到 P0

            const finalState = engine.getState();
            const diffG = finalState.players[0].gold - prevGold;
            expect(diffG).toBe(125);
        });

        it('6.17 单位升级后的移动成长会进入合法移动范围', () => {
            const state = createDemoState();
            state.map.tiles = Array.from({ length: 8 }, () => (
                Array.from({ length: 8 }, () => ({ terrainId: 6 as const, ownerId: null }))
            ));
            state.units = [
                {
                    id: 'cmd_lv1',
                    ownerId: 0,
                    unitClass: 'commander',
                    pos: { x: 0, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false,
                    level: 1,
                    exp: 100
                }
            ];

            const reachable = getReachablePositions(state, 'cmd_lv1');
            expect(reachable).toContainEqual({ x: 5, y: 0 });
            expect(getMoveCostTo(state, 'cmd_lv1', { x: 5, y: 0 })).toBe(5);

            const actions = getLegalActions(state, 0);
            expect(actions).toContainEqual({ type: 'move', unitId: 'cmd_lv1', to: { x: 5, y: 0 } });
        });

        it('6.18 RuleConfig 可以限制等级上限', () => {
            const state = createDemoState();
            state.rules = { levelCap: 1 };

            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 580;
            soldier.level = 0;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id });

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(1);
            expect(resSoldier.exp).toBe(610);
        });

        it('6.18 RuleConfig 可以扩展到 APK 内部 9 级范围', () => {
            const state = createDemoState();
            state.rules = { levelCap: 4 };

            const soldier = state.units[0];
            soldier.unitClass = 'soldier';
            soldier.exp = 990;
            soldier.level = 3;
            soldier.hp = 50;

            const defender = state.units[1];
            defender.hp = 100;

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: soldier.id, targetId: defender.id });

            const resSoldier = engine.getState().units.find(u => u.id === soldier.id)!;
            expect(resSoldier.level).toBe(4);
            expect(resSoldier.exp).toBe(1020);
        });
    });

    describe('RuleConfig 对战配置测试', () => {
        it('全局初始金币配置会应用到所有队伍，队伍配置可覆盖', () => {
            const state = createDemoState({
                initialGold: 300,
                teams: {
                    1: { initialGold: 450 }
                }
            });

            expect(state.players[0].gold).toBe(300);
            expect(state.players[1].gold).toBe(450);
        });

        it('队伍初始金币配置会在创建初始状态时生效', () => {
            const defaultState = createDemoState();
            expect(defaultState.players[0].gold).toBe(500);
            expect(defaultState.players[1].gold).toBe(500);

            const configuredState = createDemoState({
                teams: {
                    0: { initialGold: 700 },
                    1: { initialGold: 900 }
                }
            });

            expect(configuredState.players[0].gold).toBe(700);
            expect(configuredState.players[1].gold).toBe(900);
            expect(configuredState.rules?.teams?.[0].initialGold).toBe(700);
        });

        it('可招募列表会限制合法招募动作', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');

            expect(recruitActions.length).toBeGreaterThan(0);
            for (const action of recruitActions) {
                if (action.type === 'recruit_to_castle' || action.type === 'recruit_and_deploy') {
                    expect(action.unitClass).toBe('soldier');
                }
            }
        });

        it('全局可招募列表会限制所有队伍，队伍配置可覆盖', () => {
            const state = createDemoState();
            state.rules = {
                recruitableUnits: ['soldier'],
                teams: {
                    0: { recruitableUnits: ['archer'] }
                }
            };

            const player0Actions = getLegalActions(state, 0)
                .filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            const player1Actions = getLegalActions(state, 1)
                .filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');

            expect(player0Actions.length).toBeGreaterThan(0);
            expect(player1Actions.length).toBeGreaterThan(0);
            expect(player0Actions.every(a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && a.unitClass === 'archer')).toBe(true);
            expect(player1Actions.every(a => (a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy') && a.unitClass === 'soldier')).toBe(true);
        });

        it('投降动作由规则开关控制并按联盟胜负结算', () => {
            expect(getLegalActions(createDemoState(), 0).some(action => action.type === 'surrender')).toBe(false);

            const state = createDemoState({ allowSurrender: true });
            state.map.tiles[6][6].ownerId = 0;
            const actions = getLegalActions(state, 0);
            expect(actions.some(action => action.type === 'surrender')).toBe(true);

            const env = new AncientEmpiresEnv({ initialState: state });
            const result = env.stepAction({ type: 'surrender' });

            expect(result.done).toBe(true);
            expect(result.reward).toBe(-1);
            expect(result.state.players.find(player => player.id === 0)?.isAlive).toBe(false);
            expect(result.state.units.some(unit => unit.ownerId === 0)).toBe(false);
            expect(result.state.map.tiles.flat().some(tile => tile.ownerId === 0)).toBe(false);
            expect(result.state.winner).toBe(1);
        });

        it('APK skirmish 空城堡招募 pending 时允许结束回合或投降，但指挥官城堡堆叠招募不允许', () => {
            const emptyCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
            emptyCastleState.units.find(unit => unit.id === 'u1')!.pos = { x: 2, y: 2 };
            emptyCastleState.players[0].gold = 1000;
            const emptyCastleEngine = new GameEngine(emptyCastleState);
            const recruitToCastle = emptyCastleEngine.getLegalActions(0).find(action => (
                action.type === 'recruit_to_castle' && action.unitClass === 'soldier'
            ))!;

            emptyCastleEngine.step(recruitToCastle);
            const emptyCastleActions = emptyCastleEngine.getLegalActions(0);
            expect(emptyCastleActions.some(action => action.type === 'end_turn')).toBe(true);
            expect(emptyCastleActions.some(action => action.type === 'surrender')).toBe(true);
            expect(emptyCastleActions.some(action => (
                ('unitId' in action && action.unitId !== emptyCastleEngine.getState().pendingUnitId)
            ))).toBe(false);

            const commanderCastleState = createDemoState(getApkSkirmishRuleConfig('SD'));
            commanderCastleState.players[0].gold = 1000;
            const commanderCastleEngine = new GameEngine(commanderCastleState);
            const recruitAndDeploy = commanderCastleEngine.getLegalActions(0).find(action => (
                action.type === 'recruit_and_deploy' && action.unitClass === 'soldier'
            ))!;

            commanderCastleEngine.step(recruitAndDeploy);
            const commanderCastleActions = commanderCastleEngine.getLegalActions(0);
            expect(commanderCastleActions.some(action => action.type === 'end_turn')).toBe(false);
            expect(commanderCastleActions.some(action => action.type === 'surrender')).toBe(false);
        });

        it('单位数量上限会阻止继续招募', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { unitLimit: 2 }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitActions.length).toBe(0);
        });

        it('全局单位数量上限会阻止继续招募，队伍配置可覆盖', () => {
            const state = createDemoState();
            state.rules = {
                unitLimit: 2,
                teams: {
                    1: { unitLimit: 10 }
                }
            };

            const player0RecruitActions = getLegalActions(state, 0)
                .filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            const player1RecruitActions = getLegalActions(state, 1)
                .filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');

            expect(player0RecruitActions.length).toBe(0);
            expect(player1RecruitActions.length).toBeGreaterThan(0);
        });

        it('人口上限会阻止超出人口的招募', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { populationLimit: 1 }
                }
            };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitActions.length).toBe(0);
        });

        it('全局人口上限会阻止超出人口的招募', () => {
            const state = createDemoState();
            state.rules = { populationLimit: 1 };

            const actions = getLegalActions(state, 0);
            const recruitActions = actions.filter(a => a.type === 'recruit_to_castle' || a.type === 'recruit_and_deploy');
            expect(recruitActions.length).toBe(0);
        });

        it('收入配置会覆盖城镇、城堡与指挥官收入', () => {
            const state = createDemoState();
            state.rules = {
                incomeVillage: 70,
                incomeCastle: 120,
                incomeCommanderBase: 40,
                incomeCommanderGrowth: 10
            };

            const commander = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            commander.level = 2;
            state.map.tiles[1][1].terrainId = 9;
            state.map.tiles[1][1].ownerId = 0;

            const prevGold = state.players[0].gold;
            const engine = new GameEngine(state);

            engine.step({ type: 'end_turn' });
            engine.step({ type: 'end_turn' });

            const finalState = engine.getState();
            expect(finalState.players[0].gold - prevGold).toBe(250);
        });

        it('脚本指定的普通单位会成为队伍指挥官并用于收入结算', () => {
            const state = createDemoState();
            state.rules = {
                incomeVillage: 0,
                incomeCastle: 0,
                incomeCommanderBase: 40,
                incomeCommanderGrowth: 10
            };

            const soldier = state.units.find(u => u.id === 'u3')!;
            soldier.level = 3;
            expect(syncSetCommander(state, 0, soldier.pos)).toBe(true);

            expect(getCommander(state, 0)?.id).toBe('u3');
            expect(checkCommander(state, 'u3', 0)).toBe(true);
            expect(checkCommander(state, 'u1', 0)).toBe(false);

            const originalCommander = state.units.find(u => u.id === 'u1')!;
            originalCommander.level = 3;
            expect(syncSetCommander(state, originalCommander.pos.x, originalCommander.pos.y)).toBe(true);
            expect(getCommander(state, 0)?.id).toBe('u1');
            expect(checkCommander(state, 'u1', 0)).toBe(true);

            const prevGold = state.players[0].gold;
            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });
            engine.step({ type: 'end_turn' });

            expect(engine.getState().players[0].gold - prevGold).toBe(70);
        });

        it('脚本指定的指挥官站在城堡时允许招募并部署单位', () => {
            const state = createDemoState();
            const originalCommander = state.units.find(u => u.id === 'u1')!;
            const soldier = state.units.find(u => u.id === 'u3')!;
            originalCommander.pos = { x: 2, y: 2 };
            soldier.pos = { x: 0, y: 0 };

            expect(syncSetCommander(state, 0, soldier.pos)).toBe(true);
            const actions = getLegalActions(state, 0);

            expect(actions.some(action => (
                action.type === 'recruit_and_deploy'
                && action.castlePos.x === 0
                && action.castlePos.y === 0
            ))).toBe(true);
        });

        it('价格配置会覆盖招募扣费', () => {
            const state = createDemoState();
            state.players[0].gold = 100;
            state.rules = {
                prices: { soldier: 50 },
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const engine = new GameEngine(state);
            const recruitAction = engine.getLegalActions(0).find(a => a.type === 'recruit_and_deploy');
            expect(recruitAction).toBeDefined();

            engine.step(recruitAction!);
            expect(engine.getState().players[0].gold).toBe(50);
        });

        it('指挥官死亡会记录死亡次数，但不直接淘汰仍有单位的玩家', () => {
            const state = createDemoState();
            const attacker = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
            attacker.unitClass = 'dragon';
            attacker.pos = { x: 6, y: 6 };

            const commander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            commander.pos = { x: 6, y: 7 };
            commander.hp = 5;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id });

            const finalState = engine.getState();
            expect(finalState.players[1].commanderDeathCount).toBe(1);
            expect(finalState.players[1].isAlive).toBe(true);
            expect(finalState.units.some(u => u.ownerId === 1 && u.unitClass === 'commander')).toBe(false);
        });

        it('APK skirmish 默认：无单位但仍有城堡时不淘汰队伍', () => {
            const state = createDemoState();
            state.units = state.units.filter(unit => unit.ownerId !== 1);

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: 'u3' });

            const finalState = engine.getState();
            expect(finalState.players[1].isAlive).toBe(true);
            expect(finalState.winner).toBeNull();
        });

        it('APK skirmish：敌军站在己方城堡上时回合开始扣 50 且无可操作对象会跳过', () => {
            const state = createDemoState(getApkSkirmishRuleConfig('SD'));
            state.units = state.units.filter(unit => unit.ownerId !== 1);
            const intruder = state.units.find(unit => unit.ownerId === 0 && unit.unitClass === 'soldier')!;
            intruder.pos = { x: 7, y: 7 };
            intruder.hp = 100;
            state.currentPlayer = 0;

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });

            const finalState = engine.getState();
            expect(finalState.units.find(unit => unit.id === intruder.id)?.hp).toBe(50);
            expect(finalState.players[1].isAlive).toBe(true);
            expect(finalState.players[0].gold).toBeGreaterThan(300);
            expect(finalState.players[1].gold).toBeGreaterThan(300);
            expect(finalState.currentPlayer).toBe(0);
        });

        it('APK skirmish 默认：同时无单位且无城堡时淘汰队伍', () => {
            const state = createDemoState();
            state.units = state.units.filter(unit => unit.ownerId !== 1);
            state.map.tiles[7][7].ownerId = null;

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: 'u3' });

            const finalState = engine.getState();
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('APK skirmish 当前队伍被摧毁且未终局时自动交给下一存活队伍', () => {
            const state = createDemoState();
            state.map.width = 3;
            state.map.height = 3;
            state.map.tiles = Array.from({ length: 3 }, () => (
                Array.from({ length: 3 }, () => ({ terrainId: 6 as const, ownerId: null }))
            ));
            state.players = [
                { id: 0, gold: 0, isAlive: true, commanderDeathCount: 0 },
                { id: 1, gold: 0, isAlive: true, commanderDeathCount: 0 },
                { id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 }
            ];
            state.units = [
                { id: 'p0_last', ownerId: 0, unitClass: 'soldier', pos: { x: 0, y: 1 }, hp: 5, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 },
                { id: 'p1_guard', ownerId: 1, unitClass: 'dragon', pos: { x: 1, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 },
                { id: 'p2_alive', ownerId: 2, unitClass: 'soldier', pos: { x: 2, y: 1 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false, level: 0, exp: 0 }
            ];
            state.currentPlayer = 0;
            state.rules = { defeatOnNoUnitsAndNoCastles: true };

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: 'p0_last', targetId: 'p1_guard' });

            const finalState = engine.getState();
            expect(finalState.players.find(player => player.id === 0)?.isAlive).toBe(false);
            expect(finalState.units.some(unit => unit.ownerId === 0)).toBe(false);
            expect(finalState.winner).toBeNull();
            expect(finalState.currentPlayer).toBe(1);
            expect(engine.getLegalActions(finalState.currentPlayer).length).toBeGreaterThan(0);
        });

        it('目标配置仍可启用无单位即淘汰', () => {
            const state = createDemoState({ defeatOnNoUnits: true });
            state.units = state.units.filter(unit => unit.ownerId !== 1);

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: 'u3' });

            const finalState = engine.getState();
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('配置开启后指挥官阵亡会直接淘汰玩家', () => {
            const state = createDemoState();
            state.rules = { defeatOnCommanderDeath: true };

            const attacker = state.units.find(u => u.ownerId === 0 && u.unitClass === 'soldier')!;
            attacker.unitClass = 'dragon';
            attacker.pos = { x: 6, y: 6 };

            const commander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            commander.pos = { x: 6, y: 7 };
            commander.hp = 5;

            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id });

            const finalState = engine.getState();
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('脚本指定的指挥官阵亡会记录死亡次数并触发指挥官阵亡失败', () => {
            const state = createDemoState({
                defeatOnCommanderDeath: true
            });
            const attacker = state.units.find(u => u.id === 'u4')!;
            attacker.unitClass = 'dragon';
            attacker.pos = { x: 1, y: 1 };

            const scriptedCommander = state.units.find(u => u.id === 'u3')!;
            scriptedCommander.pos = { x: 1, y: 0 };
            scriptedCommander.hp = 5;
            expect(syncSetCommander(state, 0, scriptedCommander.pos)).toBe(true);

            state.currentPlayer = 1;
            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: attacker.id, targetId: scriptedCommander.id });

            const finalState = engine.getState();
            expect(finalState.players[0].commanderDeathCount).toBe(1);
            expect(finalState.players[0].isAlive).toBe(false);
            expect(finalState.winner).toBe(1);
            expect(finalState.units.some(u => u.id === 'u1')).toBe(true);
        });

        it('配置开启后失去最后城堡会淘汰玩家', () => {
            const state = createDemoState();
            state.rules = { defeatOnNoCastles: true };

            const commander = state.units.find(u => u.ownerId === 0 && u.unitClass === 'commander')!;
            commander.pos = { x: 7, y: 7 };
            commander.hasMoved = false;
            commander.hasActed = false;
            const enemyCommander = state.units.find(u => u.ownerId === 1 && u.unitClass === 'commander')!;
            enemyCommander.pos = { x: 6, y: 6 };

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'capture', unitId: commander.id });

            const finalState = engine.getState();
            expect(finalState.map.tiles[7][7].ownerId).toBe(0);
            expect(finalState.players[1].isAlive).toBe(false);
            expect(finalState.winner).toBe(0);
        });

        it('配置开启后可按死亡次数递增价格重招募指挥官', () => {
            const state = createDemoState();
            state.units = state.units.filter(u => !(u.ownerId === 0 && u.unitClass === 'commander'));
            state.players[0].gold = 1000;
            state.players[0].commanderDeathCount = 2;
            state.rules = {
                commanderRecruitBaseCost: 400,
                commanderRecruitCostGrowth: 100,
                teams: {
                    0: { recruitableUnits: ['commander'] }
                }
            };

            const engine = new GameEngine(state);
            const recruitAction = engine.getLegalActions(0).find(a => a.type === 'recruit_to_castle' && a.unitClass === 'commander');
            expect(recruitAction).toBeDefined();

            engine.step(recruitAction!);
            const finalState = engine.getState();
            expect(finalState.players[0].gold).toBe(400);
            expect(finalState.units.some(u => u.ownerId === 0 && u.unitClass === 'commander')).toBe(true);
        });

        it('联盟配置会阻止同盟单位互相攻击', () => {
            const state = createDemoState({
                alliances: { 0: 7, 1: 7 }
            });
            const unit = state.units.find(u => u.id === 'u3')!;
            const ally = state.units.find(u => u.id === 'u4')!;
            unit.pos = { x: 3, y: 3 };
            ally.pos = { x: 3, y: 4 };

            const actions = getLegalActions(state, 0);
            expect(actions.some(a => a.type === 'attack' && a.attackerId === unit.id && a.targetId === ally.id)).toBe(false);
        });

        it('联盟单位会按友军接受治疗和攻击光环', () => {
            const state = createDemoState({
                alliances: { 0: 3, 1: 3 }
            });
            const actor = state.units.find(u => u.id === 'u3')!;
            const ally = state.units.find(u => u.id === 'u4')!;
            actor.unitClass = 'paladin';
            actor.pos = { x: 3, y: 3 };
            ally.pos = { x: 4, y: 3 };
            ally.hp = 80;
            ally.maxHp = 100;

            const actions = getLegalActions(state, 0);
            expect(actions.some(a => a.type === 'heal' && a.healerId === actor.id && a.targetId === ally.id)).toBe(true);

            actor.unitClass = 'druid';
            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: actor.id });
            const inspiredAlly = engine.getState().units.find(u => u.id === ally.id)!;
            expect(inspiredAlly.status?.type).toBe('inspired');
        });

        it('同盟单位可被穿过但不能被停留', () => {
            const alliedState = createDemoState({
                alliances: { 0: 1, 1: 1 }
            });
            alliedState.units = [
                { id: 'p0', ownerId: 0, unitClass: 'soldier', pos: { x: 0, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false },
                { id: 'p1', ownerId: 1, unitClass: 'soldier', pos: { x: 1, y: 0 }, hp: 100, maxHp: 100, hasMoved: false, hasActed: false }
            ];

            const alliedReachable = getReachablePositions(alliedState, 'p0');
            expect(alliedReachable.some(pos => pos.x === 1 && pos.y === 0)).toBe(false);
            expect(alliedReachable.some(pos => pos.x === 2 && pos.y === 0)).toBe(true);

            const enemyState = createDemoState();
            enemyState.units = JSON.parse(JSON.stringify(alliedState.units));
            const enemyReachable = getReachablePositions(enemyState, 'p0');
            expect(enemyReachable.some(pos => pos.x === 2 && pos.y === 0)).toBe(false);
        });

        it('只剩同一联盟存活时会以联盟 ID 结束对局', () => {
            const state = createDemoState({
                alliances: { 0: 9, 1: 9, 2: 2 }
            });
            state.players.push({ id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 });

            const engine = new GameEngine(state);
            engine.step({ type: 'wait', unitId: 'u3' });

            const finalState = engine.getState();
            expect(finalState.players.find(p => p.id === 2)?.isAlive).toBe(false);
            expect(finalState.winner).toBe(9);
        });

        it('多队伍回合会按队伍 ID 顺序轮转，并跳过禁用队伍', () => {
            const state = createDemoState({
                disabledTeams: [2]
            });
            state.players.push(
                { id: 2, gold: 0, isAlive: true, commanderDeathCount: 0 },
                { id: 3, gold: 0, isAlive: true, commanderDeathCount: 0 }
            );
            state.units.push({
                id: 'u_team3',
                ownerId: 3,
                unitClass: 'soldier',
                pos: { x: 3, y: 3 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            });

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });
            expect(engine.getState().currentPlayer).toBe(1);
            expect(engine.getState().turn).toBe(1);

            engine.step({ type: 'end_turn' });
            expect(engine.getState().currentPlayer).toBe(3);
            expect(engine.getState().turn).toBe(1);

            engine.step({ type: 'end_turn' });
            expect(engine.getState().currentPlayer).toBe(0);
            expect(engine.getState().turn).toBe(2);
        });

        it('初始当前队伍被禁用时会切到下一个可行动队伍', () => {
            const state = createDemoState({
                disabledTeams: [0]
            });
            state.currentPlayer = 0;

            const engine = new GameEngine(state);
            expect(engine.getState().currentPlayer).toBe(1);
        });

        it('APK Stage 适配器可以设置金币、当前队伍和队伍状态', () => {
            const state = createDemoState();

            expect(syncSetGold(state, 300)).toBe(true);
            expect(state.players.map(player => player.gold)).toEqual([300, 300]);

            expect(syncSetGoldForTeam(state, 1, 450)).toBe(true);
            expect(syncChangeGold(state, 1, -50)).toBe(true);
            expect(state.players[1].gold).toBe(400);

            expect(syncSetAlliance(state, 1, 0)).toBe(true);
            expect(state.rules?.alliances?.[1]).toBe(0);

            expect(syncSetCurrentTeam(state, 1)).toBe(true);
            expect(state.currentPlayer).toBe(1);

            expect(syncDisableTeam(state, 1)).toBe(true);
            expect(state.rules?.disabledTeams).toEqual([1]);
            expect(state.currentPlayer).toBe(0);

            expect(syncRestoreTeam(state, 1)).toBe(true);
            expect(state.rules?.disabledTeams).toEqual([]);

            expect(syncDestroyTeam(state, 1)).toBe(true);
            expect(state.players[1].isAlive).toBe(false);
        });

        it('APK Stage 适配器可以把 APK 招募 ID 和单位上限写入规则配置', () => {
            const state = createDemoState();

            expect(syncSetUnitLimit(state, 6)).toBe(true);
            expect(syncSetUnitLimitForTeam(state, 1, 4)).toBe(true);
            expect(syncSetRecruitUnits(state, [0, 1, 2])).toBe(true);
            expect(syncSetRecruitUnitsForTeam(state, 1, [8, 20])).toBe(true);

            expect(state.rules?.unitLimit).toBe(6);
            expect(state.rules?.teams?.[1].unitLimit).toBe(4);
            expect(state.rules?.recruitableUnits).toEqual(['soldier', 'archer', 'water_elemental']);
            expect(state.rules?.teams?.[1].recruitableUnits).toEqual(['dragon', 'druid']);
            expect(syncSetRecruitUnits(state, [999])).toBe(false);
        });

        it('APK Stage 适配器可以按坐标设置单位等级和状态', () => {
            const state = createDemoState();
            const soldier = state.units.find(unit => unit.id === 'u3')!;
            soldier.pos = { x: 2, y: 2 };
            soldier.hp = 50;

            expect(syncSetUnitLevel(state, { x: 2, y: 2 }, 2)).toBe(true);
            expect(soldier.level).toBe(2);
            expect(soldier.exp).toBe(300);
            expect(soldier.hp).toBe(getEffectiveStats(soldier).maxHp);

            soldier.hp = 130;
            expect(syncSetUnitLevel(state, { x: 2, y: 2 }, 1)).toBe(true);
            expect(soldier.level).toBe(1);
            expect(soldier.exp).toBe(100);
            expect(soldier.hp).toBe(130);

            expect(syncSetUnitLevel(state, 2, 2, 3)).toBe(true);
            expect(soldier.level).toBe(3);
            expect(soldier.exp).toBe(600);
            expect(soldier.hp).toBe(130);

            expect(syncSetUnitStatus(state, 2, 2, 1, 2, true)).toBe(true);
            expect(soldier.status).toEqual({ type: 'poisoned', remainingTicks: 2 });

            expect(syncSetUnitStatus(state, { x: 2, y: 2 }, 3, 1, false)).toBe(false);
            expect(soldier.status).toEqual({ type: 'poisoned', remainingTicks: 2 });

            expect(syncSetUnitStatus(state, 2, 2, 2, 2, true)).toBe(true);
            expect(soldier.status).toEqual({ type: 'inspired', remainingTurns: 2 });

            expect(syncSetUnitStatus(state, { x: 2, y: 2 }, 3, 1)).toBe(true);
            expect(soldier.status).toEqual({ type: 'blinded', remainingTurns: 1 });

            const engine = new GameEngine(state);
            engine.step({ type: 'end_turn' });
            const after = engine.getState().units.find(unit => unit.id === soldier.id)!;
            expect(after.status).toBeUndefined();
        });

        it('APK Stage 查询适配器可以统计单位和建筑', () => {
            const state = createDemoState();
            state.map.tiles[1][1].terrainId = 9;
            state.map.tiles[1][1].ownerId = 0;
            state.map.tiles[2][2].terrainId = 10;
            state.map.tiles[2][2].ownerId = 0;

            expect(countUnit(state, 0)).toBe(2);
            expect(countUnit(state, 0, 0)).toBe(1);
            expect(countUnit(state, 0, 9)).toBe(1);
            expect(countUnit(state, 0, 999)).toBe(0);
            expect(countVillage(state, 0)).toBe(1);
            expect(countCastle(state, 0)).toBe(2);
        });

        it('APK Stage 查询适配器可以按坐标检查建筑和地块队伍', () => {
            const state = createDemoState();
            state.map.tiles[1][1].terrainId = 9;
            state.map.tiles[1][1].ownerId = 0;
            state.map.tiles[2][2].terrainId = 10;
            state.map.tiles[2][2].ownerId = 1;
            state.map.tiles[3][3].terrainId = 6;
            state.map.tiles[3][3].ownerId = null;

            expect(checkVillage(state, { x: 1, y: 1 })).toBe(true);
            expect(checkVillage(state, { x: 1, y: 1 }, 0)).toBe(true);
            expect(checkVillage(state, { x: 1, y: 1 }, 1)).toBe(false);
            expect(checkVillage(state, 1, 1)).toBe(true);
            expect(checkVillage(state, 1, 1, 0)).toBe(true);
            expect(checkCastle(state, { x: 2, y: 2 })).toBe(true);
            expect(checkCastle(state, { x: 2, y: 2 }, 1)).toBe(true);
            expect(checkCastle(state, { x: 2, y: 2 }, 0)).toBe(false);
            expect(checkCastle(state, 2, 2)).toBe(true);
            expect(checkCastle(state, 2, 2, 1)).toBe(true);
            expect(getTileTeam(state, { x: 1, y: 1 })).toBe(0);
            expect(getTileTeam(state, { x: 2, y: 2 })).toBe(1);
            expect(getTileTeam(state, { x: 3, y: 3 })).toBeNull();
            expect(getTileTeam(state, 1, 1)).toBe(0);
            expect(getTileTeam(state, 3, 3)).toBeNull();
            expect(checkCastle(state, { x: -1, y: 0 })).toBe(false);
            expect(getTileTeam(state, { x: 99, y: 99 })).toBeNull();
        });

        it('APK Stage 查询适配器可以保存脚本变量并计算距离', () => {
            const state = createDemoState();

            expect(getBoolean(state, 'reinforced', false)).toBe(false);
            expect(putBoolean(state, ' reinforced ', true)).toBe(true);
            expect(getBoolean(state, 'reinforced', false)).toBe(true);
            expect(putBoolean(state, '', true)).toBe(false);

            expect(getInteger(state, 'counter', 7)).toBe(7);
            expect(putInteger(state, ' counter ', 2)).toBe(true);
            expect(getInteger(state, 'counter', 0)).toBe(2);
            expect(putInteger(state, 'counter', 1.5)).toBe(false);

            expect(getStageDistance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7);
            expect(getStageDistance(1, 2, 4, 6)).toBe(7);
        });

        it('APK Stage 查询适配器可以设置 code 并按 code、坐标或队伍查询单位', () => {
            const state = createDemoState();
            const commander = state.units.find(unit => unit.id === 'u1')!;
            const soldier = state.units.find(unit => unit.id === 'u3')!;

            expect(syncSetUnitCode(state, commander.pos, ' galamar ')).toBe(true);
            expect(commander.apkUnitCode).toBe('galamar');
            expect(getUnit(state, 'galamar')?.id).toBe(commander.id);
            expect(getUnit(state, commander.pos)?.id).toBe(commander.id);
            expect(getUnit(state, commander.pos.x, commander.pos.y)?.id).toBe(commander.id);
            expect(getUnit(state, 'missing')).toBeNull();
            expect(syncSetUnitCode(state, soldier.pos, 'galamar')).toBe(false);
            expect(syncSetUnitCode(state, soldier.pos.x, soldier.pos.y, 'soldier_code')).toBe(true);
            expect(getUnit(state, 'soldier_code')?.id).toBe(soldier.id);
            expect(syncSetUnitCode(state, { x: 99, y: 99 }, 'ghost')).toBe(false);

            const team0Units = getUnits(state, 0).map(unit => unit.id).sort();
            expect(team0Units).toEqual(['u1', 'u3']);

            soldier.hp = 0;
            expect(getUnit(state, soldier.pos)).toBeNull();
            expect(getUnit(state, soldier.pos.x, soldier.pos.y)).toBeNull();
            expect(getUnits(state, 0).map(unit => unit.id)).toEqual(['u1']);
            expect(getUnits(state, 99)).toEqual([]);
        });

        it('APK Stage 查询适配器可以设置静态、目标和 head 元数据', () => {
            const state = createDemoState();
            const commander = state.units.find(unit => unit.id === 'u1')!;
            const soldier = state.units.find(unit => unit.id === 'u3')!;

            expect(syncSetUnitCode(state, commander.pos, ' galamar ')).toBe(true);
            expect(syncSetUnitStaticWithCode(state, ' galamar ', true)).toBe(true);
            expect(syncSetUnitTargetedWithCode(state, 'galamar', true)).toBe(true);
            expect(syncSetUnitHeadWithCode(state, 'galamar', 5)).toBe(true);
            expect(commander.apkStatic).toBe(true);
            expect(commander.apkTargeted).toBe(true);
            expect(commander.apkUnitHead).toBe(5);

            expect(syncSetUnitStatic(state, soldier.pos, true)).toBe(true);
            expect(syncSetUnitTargeted(state, soldier.pos.x, soldier.pos.y, true)).toBe(true);
            expect(syncSetUnitHead(state, soldier.pos.x, soldier.pos.y, 2)).toBe(true);
            expect(soldier.apkStatic).toBe(true);
            expect(soldier.apkTargeted).toBe(true);
            expect(soldier.apkUnitHead).toBe(2);

            expect(syncSetUnitStaticWithCode(state, 'missing', true)).toBe(false);
            expect(syncSetUnitTargetedWithCode(state, 'missing', true)).toBe(false);
            expect(syncSetUnitHeadWithCode(state, 'missing', 1)).toBe(false);
            expect(syncSetUnitHead(state, soldier.pos, -1)).toBe(false);

            const commanderActions = getLegalActions(state, 0).filter(action =>
                ('unitId' in action && action.unitId === commander.id)
                || ('attackerId' in action && action.attackerId === commander.id)
                || ('healerId' in action && action.healerId === commander.id)
                || ('summonerId' in action && action.summonerId === commander.id)
                || ('supporterId' in action && action.supporterId === commander.id)
            );
            expect(commanderActions).toEqual([]);

            expect(syncSetUnitStaticWithCode(state, 'galamar', false)).toBe(true);
            expect(getLegalActions(state, 0).some(action =>
                action.type === 'wait' && action.unitId === commander.id
            )).toBe(true);
        });

        it('APK Stage SyncOverrideMov 按单位 code 和 APK tile type 覆盖移动消耗', () => {
            const createOverrideState = () => {
                const state = createDemoState();
                state.map.width = 5;
                state.map.height = 1;
                state.map.tiles = [[
                    { terrainId: 6, ownerId: null, apkTerrainId: 2 },
                    { terrainId: 6, ownerId: null, apkTerrainId: 2 },
                    { terrainId: 6, ownerId: null, apkTerrainId: 2 },
                    { terrainId: 6, ownerId: null, apkTerrainId: 2 },
                    { terrainId: 6, ownerId: null, apkTerrainId: 2 }
                ]];
                state.units = [{
                    id: 'u_carrier',
                    ownerId: 0,
                    unitClass: 'commander',
                    pos: { x: 0, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                }];
                expect(syncSetUnitCode(state, { x: 0, y: 0 }, 'carrier')).toBe(true);
                return state;
            };

            const state = createOverrideState();
            expect(getReachablePositions(state, 'u_carrier').some(pos => pos.x === 2 && pos.y === 0)).toBe(false);

            expect(syncOverrideMov(state, ' carrier ', 2, 1)).toBe(true);
            expect(state.units[0].apkMoveOverrides).toEqual({ 2: 1 });
            expect(getReachablePositions(state, 'u_carrier')).toEqual([
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 2, y: 0 },
                { x: 3, y: 0 },
                { x: 4, y: 0 }
            ]);
            expect(getMoveCostTo(state, 'u_carrier', { x: 4, y: 0 })).toBe(4);

            const kindState = createOverrideState();
            expect(syncOverrideMov(kindState, 'carrier', 1, 1)).toBe(true);
            expect(getReachablePositions(kindState, 'u_carrier').some(pos => pos.x === 4 && pos.y === 0)).toBe(true);

            expect(syncOverrideMov(state, 'missing', 2, 1)).toBe(false);
            expect(syncOverrideMov(state, 'carrier', -1, 1)).toBe(false);
            expect(syncOverrideMov(state, 'carrier', APK_TERRAIN_COUNT, 1)).toBe(false);
            expect(syncOverrideMov(state, 'carrier', 2, 0)).toBe(false);
        });

        it('APK Stage SyncOverrideMov 可以在无 APK 原始 tile 时按项目 terrainId 兜底', () => {
            const state = createDemoState();
            state.map.width = 5;
            state.map.height = 1;
            state.map.tiles = [[
                { terrainId: 2, ownerId: null },
                { terrainId: 2, ownerId: null },
                { terrainId: 2, ownerId: null },
                { terrainId: 2, ownerId: null },
                { terrainId: 2, ownerId: null }
            ]];
            state.units = [{
                id: 'u_carrier',
                ownerId: 0,
                unitClass: 'commander',
                pos: { x: 0, y: 0 },
                hp: 100,
                maxHp: 100,
                hasMoved: false,
                hasActed: false
            }];
            expect(syncSetUnitCode(state, { x: 0, y: 0 }, 'carrier')).toBe(true);
            expect(getReachablePositions(state, 'u_carrier').some(pos => pos.x === 2 && pos.y === 0)).toBe(false);
            expect(syncOverrideMov(state, 'carrier', 2, 1)).toBe(true);
            expect(getReachablePositions(state, 'u_carrier').some(pos => pos.x === 4 && pos.y === 0)).toBe(true);
        });

        it('APK Stage 查询适配器可以检查指挥官、队伍摧毁和强制终局', () => {
            const state = createDemoState({
                alliances: { 0: 4, 1: 8 }
            });

            expect(checkGameOver(state)).toBe(false);
            expect(checkCommander(state, 'u1')).toBe(true);
            expect(checkCommander(state, 'u1', 0)).toBe(true);
            expect(checkCommander(state, 'u1', 1)).toBe(false);
            expect(getCommander(state, 0)?.id).toBe('u1');
            expect(getCurrentTeam(state)).toBe(0);
            expect(checkPlayerTeam(state, 0)).toBe(true);
            expect(getAliveAlliances(state)).toEqual([4, 8]);

            expect(syncGameOver(state, 4)).toBe(true);
            expect(checkGameOver(state)).toBe(true);
            expect(state.winner).toBe(4);
            expect(syncGameOver(state, 999)).toBe(false);

            expect(checkTeamDestroyed(state, 1)).toBe(false);
            expect(syncDestroyTeam(state, 1)).toBe(true);
            expect(checkTeamDestroyed(state, 1)).toBe(true);
            expect(checkPlayerTeam(state, 1)).toBe(false);
            expect(getAliveAlliances(state)).toEqual([4]);
        });

        it('APK Rule 适配器可以设置收入和等级上限', () => {
            const state = createDemoState();

            expect(ruleSetIncomeVillage(state, 30)).toBe(true);
            expect(ruleSetIncomeCastle(state, 80)).toBe(true);
            expect(ruleSetIncomeCommanderBase(state, 20)).toBe(true);
            expect(ruleSetIncomeCommanderGrowth(state, 5)).toBe(true);
            expect(ruleSetLevelCap(state, 9)).toBe(true);

            expect(state.rules?.incomeVillage).toBe(30);
            expect(state.rules?.incomeCastle).toBe(80);
            expect(state.rules?.incomeCommanderBase).toBe(20);
            expect(state.rules?.incomeCommanderGrowth).toBe(5);
            expect(state.rules?.levelCap).toBe(9);

            expect(ruleSetIncomeVillage(state, -1)).toBe(false);
            expect(ruleSetLevelCap(state, 10)).toBe(false);
        });

        it('APK Rule 适配器可以按 APK 单位 ID 设置价格', () => {
            const state = createDemoState();

            expect(ruleSetUnitPrice(state, 0, 175)).toBe(true);
            expect(ruleSetPrices(state, { 1: 260, 8: 1100, 20: 650 })).toBe(true);

            expect(state.rules?.prices?.soldier).toBe(175);
            expect(state.rules?.prices?.archer).toBe(260);
            expect(state.rules?.prices?.dragon).toBe(1100);
            expect(state.rules?.prices?.druid).toBe(650);

            expect(ruleSetUnitPrice(state, 999, 100)).toBe(false);
            expect(ruleSetPrices(state, { 0: -10 })).toBe(false);
        });

        it('招募执行阶段也会拒绝不满足配置的单位', () => {
            const state = createDemoState();
            state.rules = {
                teams: {
                    0: { recruitableUnits: ['soldier'] }
                }
            };

            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            const before = engine.getState();
            const result = engine.step({
                type: 'recruit_and_deploy',
                unitClass: 'dragon',
                castlePos: { x: 0, y: 0 },
                to: { x: 1, y: 1 }
            });

            const after = engine.getState();
            expect(result.info).toContain('招募失败');
            expect(after.players[0].gold).toBe(before.players[0].gold);
            expect(after.units.length).toBe(before.units.length);
        });
    });

    describe('AI 训练环境评估测试', () => {
        it('军力价值按金币、单位价格和剩余血量计算', () => {
            const state = createDemoState();
            state.players[0].gold = 25;
            state.units = [
                {
                    id: 'u_soldier',
                    ownerId: 0,
                    unitClass: 'soldier',
                    pos: { x: 0, y: 0 },
                    hp: 50,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                }
            ];

            expect(calculateArmyValue(state, 0)).toBe(101);
        });

        it('军力价值和 Observation 使用 APK 有效最大生命成长', () => {
            const state = createDemoState();
            state.players[0].gold = 0;
            state.units = [
                {
                    id: 'u_golem',
                    ownerId: 0,
                    unitClass: 'golem',
                    pos: { x: 0, y: 0 },
                    hp: 125,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false,
                    level: 1,
                    exp: 100
                }
            ];

            expect(calculateArmyValue(state, 0)).toBe(601);

            const env = new AncientEmpiresEnv({ initialState: state });
            expect(env.getObservation().units[0]).toEqual(expect.objectContaining({
                hp: 125,
                maxHp: 125,
                level: 1
            }));
        });

        it('Observation 输出 APK 等级成长和状态修正后的有效单位数值', () => {
            const state = createDemoState();
            state.units = [
                {
                    id: 'u_commander',
                    ownerId: 0,
                    unitClass: 'commander',
                    pos: { x: 0, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: true,
                    hasActed: false,
                    level: 1,
                    exp: 100,
                    movementRemaining: 3
                },
                {
                    id: 'u_archer',
                    ownerId: 0,
                    unitClass: 'archer',
                    pos: { x: 1, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false,
                    status: { type: 'blinded' },
                    hasBeenHealedThisTurn: true
                },
                {
                    id: 'u_golem',
                    ownerId: 0,
                    unitClass: 'golem',
                    pos: { x: 2, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false,
                    status: { type: 'weakened', remainingTurns: 1 },
                    hasPostAttackMoved: true,
                    hasBeenSupportedThisTurn: true
                },
                {
                    id: 'u_poisoned',
                    ownerId: 0,
                    unitClass: 'soldier',
                    pos: { x: 3, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false,
                    status: { type: 'poisoned', remainingTicks: 2 }
                }
            ];

            const observation = new AncientEmpiresEnv({ initialState: state }).getObservation();
            expect(observation.units.find(unit => unit.id === 'u_commander')).toEqual(expect.objectContaining({
                apkUnitClassId: 9,
                attack: 70,
                physicalDefense: 25,
                magicDefense: 25,
                minRange: 1,
                maxRange: 1,
                move: 5,
                movementRemaining: 3,
                hasMoved: true,
                hasPostAttackMoved: false,
                hasBeenHealedThisTurn: false,
                hasBeenSupportedThisTurn: false,
                baseAttack: 60,
                basePhysicalDefense: 20,
                baseMagicDefense: 20,
                baseMinRange: 1,
                baseMaxRange: 1,
                baseMove: 4,
                attackGrowth: 10,
                defenseGrowth: 5,
                maxHpGrowth: 0,
                moveGrowth: 1,
                tileTerrainId: 10,
                tileRuleTerrainId: 10,
                tileTerrainKey: 'castle',
                tileTerrainTags: expect.arrayContaining(['castle', 'recruit_source']),
                tileOwnerId: 0,
                tileDefenseBonus: 15,
                tileHealPerTurn: 20,
                tileMoveCost: 1,
                apkAbilityIds: [1, 0, 2],
                apkStatusId: null,
                statusRemainingTicks: null,
                statusRemainingTurns: null
            }));
            expect(observation.units.find(unit => unit.id === 'u_archer')).toEqual(expect.objectContaining({
                minRange: 0,
                maxRange: 0,
                move: 4,
                hasBeenHealedThisTurn: true,
                statusRemainingTicks: null,
                statusRemainingTurns: null
            }));
            expect(observation.units.find(unit => unit.id === 'u_golem')).toEqual(expect.objectContaining({
                physicalDefense: 20,
                magicDefense: 0,
                move: 1,
                basePhysicalDefense: 30,
                baseMagicDefense: 10,
                baseMove: 5,
                maxHpGrowth: 25,
                hasPostAttackMoved: true,
                hasBeenSupportedThisTurn: true,
                statusRemainingTicks: null,
                statusRemainingTurns: 1
            }));
            expect(observation.units.find(unit => unit.id === 'u_poisoned')).toEqual(expect.objectContaining({
                apkUnitClassId: 0,
                apkAbilityIds: [0, 2],
                status: 'poisoned',
                apkStatusId: 1,
                statusRemainingTicks: 2,
                statusRemainingTurns: null
            }));
        });

        it('Observation 输出 APK 单位静态配置和当前规则价格', () => {
            const state = createDemoState();
            state.players[0].commanderDeathCount = 2;
            state.rules = {
                prices: { dragon: 900 },
                commanderRecruitBaseCost: 500,
                commanderRecruitCostGrowth: 100
            };
            state.units = [
                {
                    id: 'u_dragon',
                    ownerId: 0,
                    unitClass: 'dragon',
                    pos: { x: 0, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                },
                {
                    id: 'u_commander',
                    ownerId: 0,
                    unitClass: 'commander',
                    pos: { x: 1, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                }
            ];

            const env = new AncientEmpiresEnv({ initialState: state });
            const observation = env.getObservation();
            const dragon = observation.units.find(unit => unit.id === 'u_dragon')!;
            const commander = observation.units.find(unit => unit.id === 'u_commander')!;

            expect(dragon).toEqual(expect.objectContaining({
                attackType: 'magic',
                population: 5,
                cost: 900,
                isCommander: false,
                abilities: UNIT_CONFIGS.dragon.abilities
            }));
            expect(dragon.abilities).not.toBe(UNIT_CONFIGS.dragon.abilities);
            dragon.abilities.push('repairer');
            expect(env.getObservation().units.find(unit => unit.id === 'u_dragon')!.abilities).toEqual(UNIT_CONFIGS.dragon.abilities);

            expect(commander).toEqual(expect.objectContaining({
                attackType: 'physical',
                population: 0,
                cost: 700,
                isCommander: true,
                abilities: UNIT_CONFIGS.commander.abilities
            }));
        });

        it('Observation 输出脚本指定的队伍指挥官', () => {
            const state = createDemoState();
            const originalCommander = state.units.find(unit => unit.id === 'u1')!;
            const scriptedCommander = state.units.find(unit => unit.id === 'u3')!;
            originalCommander.pos = { x: 2, y: 2 };

            expect(syncSetCommander(state, 0, scriptedCommander.pos)).toBe(true);

            const observation = new AncientEmpiresEnv({ initialState: state }).getObservation();
            const player0 = observation.players.find(player => player.id === 0)!;
            const originalCommanderObservation = observation.units.find(unit => unit.id === 'u1')!;
            const scriptedCommanderObservation = observation.units.find(unit => unit.id === 'u3')!;

            expect(player0.commanderUnitId).toBe('u3');
            expect(originalCommanderObservation.isCommander).toBe(false);
            expect(scriptedCommanderObservation).toEqual(expect.objectContaining({
                unitClass: 'soldier',
                isCommander: true
            }));
        });

        it('Observation 输出 APK 队伍规则约束和联盟状态', () => {
            const state = createDemoState({
                initialGold: 250,
                incomeVillage: 70,
                incomeCastle: 120,
                incomeCommanderBase: 10,
                incomeCommanderGrowth: 30,
                levelCap: 5,
                alliances: { 0: 5, 1: 5 },
                disabledTeams: [1],
                unitLimit: 6,
                populationLimit: 8,
                recruitableUnits: ['soldier', 'dragon'],
                prices: { archer: 130, dragon: 800 },
                commanderRecruitBaseCost: 500,
                commanderRecruitCostGrowth: 90,
                allowSurrender: true,
                allowPendingRecruitEndTurn: false,
                allowPendingRecruitSurrender: false,
                defeatOnNoUnitsAndNoCastles: false,
                defeatOnNoUnits: true,
                defeatOnCommanderDeath: true,
                defeatOnNoCastles: true,
                teams: {
                    0: {
                        unitLimit: 2,
                        populationLimit: 3,
                        recruitableUnits: ['soldier', 'archer']
                    }
                }
            });

            const observation = new AncientEmpiresEnv({ initialState: state }).getObservation();
            const player0 = observation.players.find(player => player.id === 0)!;
            const player1 = observation.players.find(player => player.id === 1)!;

            expect(observation.rules).toEqual({
                initialGold: 250,
                incomeVillage: 70,
                incomeCastle: 120,
                incomeCommanderBase: 10,
                incomeCommanderGrowth: 30,
                levelCap: 5,
                unitLimit: 6,
                populationLimit: 8,
                recruitableUnits: ['soldier', 'dragon'],
                priceOverrides: { archer: 130, dragon: 800 },
                commanderRecruitBaseCost: 500,
                commanderRecruitCostGrowth: 90,
                allowSurrender: true,
                allowPendingRecruitEndTurn: false,
                allowPendingRecruitSurrender: false,
                defeatOnNoUnitsAndNoCastles: false,
                defeatOnNoUnits: true,
                defeatOnCommanderDeath: true,
                defeatOnNoCastles: true,
                alliances: { 0: 5, 1: 5 },
                disabledTeams: [1],
                commanderUnitIds: {},
                teams: {
                    0: {
                        initialGold: null,
                        unitLimit: 2,
                        populationLimit: 3,
                        recruitableUnits: ['soldier', 'archer']
                    }
                }
            });
            expect(observation.turnPlayerIds).toEqual([0]);
            expect(player0).toEqual(expect.objectContaining({
                isAlive: true,
                isEnabled: true,
                allianceId: 5,
                unitCount: 2,
                population: 1,
                unitLimit: 2,
                populationLimit: 3,
                recruitableUnits: ['soldier', 'archer'],
                recruitCosts: {
                    soldier: UNIT_CONFIGS.soldier.cost,
                    archer: 130
                },
                commanderUnitId: 'u1'
            }));
            expect(player1).toEqual(expect.objectContaining({
                isAlive: true,
                isEnabled: false,
                allianceId: 5,
                unitCount: 2,
                population: 1,
                unitLimit: 6,
                populationLimit: 8,
                recruitableUnits: ['soldier', 'dragon'],
                recruitCosts: {
                    soldier: UNIT_CONFIGS.soldier.cost,
                    dragon: 800
                },
                commanderUnitId: 'u2'
            }));
        });

        it('Observation 输出 APK stacked/pending 招募状态', () => {
            const state = createDemoState({
                allowSurrender: true,
                recruitableUnits: ['soldier']
            });
            state.units.find(unit => unit.id === 'u1')!.pos = { x: 2, y: 2 };

            const env = new AncientEmpiresEnv({ initialState: state });
            const recruitAction = env.getLegalActions().find(action => action.type === 'recruit_to_castle' && action.unitClass === 'soldier')!;
            const recruitResult = env.stepAction(recruitAction);
            const pendingUnit = recruitResult.state.units.find(unit => unit.id === recruitResult.state.pendingUnitId)!;

            expect(recruitResult.observation.pendingUnitId).toBe(pendingUnit.id);
            expect(recruitResult.observation.units.find(unit => unit.id === pendingUnit.id)).toEqual(expect.objectContaining({
                isPending: true,
                hasActed: false
            }));
            expect(recruitResult.legalActions.some(action => action.type === 'end_turn')).toBe(false);
            expect(recruitResult.legalActions.some(action => action.type === 'surrender')).toBe(false);
            expect(recruitResult.legalActions.every(action => (
                action.type === 'wait'
                || ('unitId' in action && action.unitId === pendingUnit.id)
            ))).toBe(true);

            const waitAction = recruitResult.legalActions.find(action => action.type === 'wait' && action.unitId === pendingUnit.id)!;
            const waitResult = env.stepAction(waitAction);

            expect(waitResult.observation.pendingUnitId).toBeUndefined();
            expect(waitResult.observation.units.find(unit => unit.id === pendingUnit.id)?.isPending).toBe(false);
        });

        it('超时结算按军力价值而不是单纯单位数量判断胜负', () => {
            const state = createDemoState();
            state.players[0].gold = 0;
            state.players[1].gold = 0;
            state.units = [
                {
                    id: 'u_dragon',
                    ownerId: 0,
                    unitClass: 'dragon',
                    pos: { x: 0, y: 0 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                },
                {
                    id: 'u_soldier',
                    ownerId: 1,
                    unitClass: 'soldier',
                    pos: { x: 7, y: 7 },
                    hp: 100,
                    maxHp: 100,
                    hasMoved: false,
                    hasActed: false
                }
            ];

            const env = new AncientEmpiresEnv({ initialState: state, maxPlies: 2 });
            const result = env.stepAction({ type: 'end_turn' });

            expect(result.done).toBe(true);
            expect(result.reward).toBe(1);
        });

        it('动作空间 schema 暴露当前训练动作编码模板', () => {
            const expectedSchema = [
                'move:<unitId>:<x>,<y>',
                'post_attack_move:<unitId>:<x>,<y>',
                'attack:<attackerId>:<targetId>',
                'heal:<healerId>:<targetId>',
                'support:<supporterId>:<targetId>',
                'summon:<summonerId>:<graveId>:<x>,<y>',
                'recruit_to_castle:<unitClass>:<castleX>,<castleY>',
                'recruit_and_deploy:<unitClass>:<castleX>,<castleY>:<toX>,<toY>',
                'capture:<unitId>',
                'repair:<unitId>',
                'destroy_town:<unitId>',
                'wait:<unitId>',
                'surrender',
                'end_turn'
            ];

            expect(getActionSpaceSchema()).toEqual(expectedSchema);

            const schema = getActionSpaceSchema();
            schema.push('mutated');
            expect(getActionSpaceSchema()).toEqual(expectedSchema);
        });

        it('训练动作编码和解码覆盖当前所有动作类型', () => {
            const roundTripActions: Action[] = [
                { type: 'move', unitId: 'u1', to: { x: 2, y: 3 } },
                { type: 'post_attack_move', unitId: 'u1', to: { x: 4, y: 5 } },
                { type: 'attack', attackerId: 'u1', targetId: 'u2' },
                { type: 'heal', healerId: 'u3', targetId: 'u1' },
                { type: 'support', supporterId: 'u4', targetId: 'u1' },
                { type: 'summon', summonerId: 'u5', graveId: 'g1', spawnPos: { x: 6, y: 7 } },
                { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 1, y: 1 } },
                { type: 'recruit_and_deploy', unitClass: 'archer', castlePos: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
                { type: 'capture', unitId: 'u1' },
                { type: 'repair', unitId: 'u1' },
                { type: 'destroy_town', unitId: 'u1' },
                { type: 'wait', unitId: 'u1' },
                { type: 'surrender' },
                { type: 'end_turn' }
            ];

            for (const action of roundTripActions) {
                expect(decodeAction(encodeAction(action))).toEqual(action);
            }
        });

        it('投降动作可序列化，内置 AI 不会把投降当成普通可选动作', () => {
            expect(encodeAction({ type: 'surrender' })).toBe('surrender');
            expect(decodeAction('surrender')).toEqual({ type: 'surrender' });

            const state = createDemoState({ allowSurrender: true });
            state.players[0].gold = 0;
            state.units
                .filter(unit => unit.ownerId === 0)
                .forEach(unit => {
                    unit.hasMoved = true;
                    unit.hasActed = true;
                });

            const engine = new GameEngine(state);
            expect(engine.getLegalActions(0).map(action => action.type).sort()).toEqual(['end_turn', 'surrender']);
            expect(new RandomAI(() => 0.99).getAction(engine, 0)).toEqual({ type: 'end_turn' });
            expect(new HeuristicAI(() => 0).getAction(engine, 0)).toEqual({ type: 'end_turn' });
        });
    });

    describe('核心规则回归测试', () => {
        it('1. 非法动作 - 非当前玩家单位不能行动', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const enemyUnit = state.units.find(u => u.ownerId === 1)!;
            const res = engine.step({ type: 'move', unitId: enemyUnit.id, to: { x: enemyUnit.pos.x + 1, y: enemyUnit.pos.y } });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('2. 非法动作 - 已行动单位不能再次普通行动', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!;
            // 第一次普通行动：wait
            engine.step({ type: 'wait', unitId: unit.id });
            const stateAfterMove = engine.getState();
            // 第二次想普通行动
            const res = engine.step({ type: 'wait', unitId: unit.id });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(stateAfterMove);
        });

        it('3-4. 非法动作 - 非法移动/越界不改变坐标和状态', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!;
            const res1 = engine.step({ type: 'move', unitId: unit.id, to: { x: 999, y: 999 } });
            expect(res1.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('5. 非法动作 - 非法招募', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const res = engine.step({ type: 'recruit_to_castle', unitClass: 'dragon', castlePos: {x:0, y:0} });
            expect(res.info).toContain('非法动作');
            expect(engine.getState()).toEqual(state);
        });

        it('6-10. 非法动作 - 非对应能力不能执行特殊动作', () => {
            const state = createDemoState();
            const engine = new GameEngine(state);
            const unit = state.units.find(u => u.ownerId === 0)!; 
            const target = state.units.find(u => u.ownerId === 1)!;
            
            expect(engine.step({ type: 'heal', healerId: unit.id, targetId: unit.id }).info).toContain('非法动作');
            expect(engine.step({ type: 'summon', summonerId: unit.id, graveId: 'g1', spawnPos: {x:0,y:0} }).info).toContain('非法动作');
            expect(engine.step({ type: 'support', supporterId: unit.id, targetId: unit.id }).info).toContain('非法动作');
        });

        it('11. 投石车不能破坏城堡', () => {
            const state = createDemoState();
            const catapult = state.units[0];
            catapult.unitClass = 'catapult';
            state.map.tiles[catapult.pos.y][catapult.pos.x].terrainId = 10; // 城堡
            const engine = new GameEngine(state);
            const res = engine.step({ type: 'destroy_town', unitId: catapult.id });
            expect(res.info).toContain('非法动作');
        });

        it('确定性 - 同一初始状态和合法动作产生同样结果', () => {
            const state = createDemoState();
            const e1 = new GameEngine(state);
            const e2 = new GameEngine(state);
            const a = { type: 'move', unitId: state.units[0].id, to: { x: state.units[0].pos.x, y: state.units[0].pos.y+1 } } as any;
            e1.step(a);
            e2.step(a);
            expect(e1.getState()).toEqual(e2.getState());
        });

        it('能力规则 - counter_storm 和反击', () => {
            const state = createDemoState();
            const b = state.units[0];
            b.unitClass = 'berserker'; 
            const a = state.units[1];
            a.unitClass = 'archer'; 
            a.pos = { x: b.pos.x + 2, y: b.pos.y };
            
            const engine = new GameEngine(state, { unsafeBypassValidationForTests: true });
            engine.step({ type: 'attack', attackerId: a.id, targetId: b.id });
            const finalA = engine.getState().units.find(u => u.id === a.id);
            if (finalA) {
               expect(finalA.hp).toBeLessThan(100);
            }
        });

        it('突击部队 - 移动力等于有效移动力', () => {
            const state = createDemoState();
            const wolf = state.units[0];
            wolf.unitClass = 'wolf';
            const enemy = state.units[1];
            enemy.pos = { x: wolf.pos.x + 1, y: wolf.pos.y };
            
            const engine = new GameEngine(state);
            engine.step({ type: 'attack', attackerId: wolf.id, targetId: enemy.id });
            const finalWolf = engine.getState().units.find(u=>u.id === wolf.id)!;
            expect(finalWolf.movementRemaining).toBe(6); 
        });

        it('神庙结算 - 回血机制', () => {
             const state = createDemoState();
             const soldier = state.units[0];
             soldier.hp = 20;
             soldier.status = { type: 'poisoned', remainingTicks: 2 };
             state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 12; 
             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });
             engine.step({ type: 'end_turn' }); 

             const s = engine.getState().units.find(u => u.id === soldier.id);
             expect(s!.status).toBeUndefined(); 
             expect(s!.hp).toBe(10 + 20); 
        });

        it('APK 地形语义 - 神庙候选清毒回血，营地和水障碍不清毒', () => {
             const state = createDemoState();
             state.currentPlayer = 1;
             state.map.width = 6;
             state.map.height = 1;
             state.map.tiles = [[
                 { terrainId: 6, ownerId: null, apkTerrainId: 31 },
                 { terrainId: 6, ownerId: null, apkTerrainId: 80 },
                 { terrainId: 6, ownerId: null, apkTerrainId: 83 },
                 { terrainId: 6, ownerId: null, apkTerrainId: 30 },
                 { terrainId: 6, ownerId: null, apkTerrainId: 81 },
                 { terrainId: 6, ownerId: null }
             ]];

             const base = state.units[0];
             const createPoisonedSoldier = (id: string, x: number) => ({
                 ...base,
                 id,
                 ownerId: 0,
                 unitClass: 'soldier' as const,
                 pos: { x, y: 0 },
                 hp: 50,
                 maxHp: 100,
                 hasMoved: true,
                 hasActed: true,
                 status: { type: 'poisoned' as const, remainingTicks: 2 }
             });

             state.units = [
                 createPoisonedSoldier('u_temple_31', 0),
                 createPoisonedSoldier('u_temple_80', 1),
                 createPoisonedSoldier('u_water_temple_83', 2),
                 createPoisonedSoldier('u_camp_30', 3),
                 createPoisonedSoldier('u_water_obstacle_81', 4),
                 {
                     ...base,
                     id: 'u_enemy',
                     ownerId: 1,
                     unitClass: 'soldier',
                     pos: { x: 5, y: 0 },
                     hp: 100,
                     maxHp: 100,
                     hasMoved: false,
                     hasActed: false,
                     status: undefined
                 }
             ];

             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });

             const unitsById = Object.fromEntries(engine.getState().units.map(unit => [unit.id, unit]));
             expect(unitsById.u_temple_31.status).toBeUndefined();
             expect(unitsById.u_temple_31.hp).toBe(60);
             expect(unitsById.u_temple_80.status).toBeUndefined();
             expect(unitsById.u_temple_80.hp).toBe(60);
             expect(unitsById.u_water_temple_83.status).toBeUndefined();
             expect(unitsById.u_water_temple_83.hp).toBe(60);
             expect(unitsById.u_camp_30.status).toEqual({ type: 'poisoned', remainingTicks: 1 });
             expect(unitsById.u_camp_30.hp).toBe(40);
             expect(unitsById.u_water_obstacle_81.status).toEqual({ type: 'poisoned', remainingTicks: 1 });
             expect(unitsById.u_water_obstacle_81.hp).toBe(40);
        });
        
        it('神庙结算 - 虚弱单位在神庙消除虚弱', () => {
             const state = createDemoState();
             const soldier = state.units[0];
             soldier.status = { type: 'weakened', remainingTurns: 1 };
             state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 12; 
             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });
             engine.step({ type: 'end_turn' }); 

             const s = engine.getState().units.find(u => u.id === soldier.id);
             expect(s!.status).toBeUndefined(); 
        });

        it('神庙结算 - 水中神庙同样清除负面状态', () => {
             const state = createDemoState();
             const soldier = state.units[0];
             soldier.status = { type: 'blinded' };
             state.map.tiles[soldier.pos.y][soldier.pos.x].terrainId = 16;

             const engine = new GameEngine(state);
             engine.step({ type: 'end_turn' });
             engine.step({ type: 'end_turn' });

             const s = engine.getState().units.find(u => u.id === soldier.id);
             expect(s!.status).toBeUndefined();
        });
    });
});
