import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    exportSkirmishCuratedFeatures,
    parseCuratedFeatureExportArgs
} from './skirmish_curated_feature_export';
import type { SkirmishDatasetSample } from './skirmish_dataset_export';

function makeCuratedSample(): SkirmishDatasetSample {
    const observation = {
        currentPlayer: 0,
        turn: 100,
        turnPlayerIds: [0, 1],
        mapWidth: 3,
        mapHeight: 3,
        players: [
            {
                id: 0,
                gold: 2000,
                isAlive: true,
                isEnabled: true,
                allianceId: 0,
                unitCount: 1,
                population: 0,
                unitLimit: 30,
                populationLimit: null,
                recruitableUnits: ['dragon'],
                recruitCosts: { dragon: 1000 },
                commanderUnitId: 'u1',
                commanderDeathCount: 0,
                commanderReserveLevel: null,
                commanderReserveExp: null
            },
            {
                id: 1,
                gold: 100,
                isAlive: true,
                isEnabled: true,
                allianceId: 1,
                unitCount: 0,
                population: 0,
                unitLimit: 30,
                populationLimit: null,
                recruitableUnits: [],
                recruitCosts: {},
                commanderUnitId: null,
                commanderDeathCount: 0,
                commanderReserveLevel: null,
                commanderReserveExp: null
            }
        ],
        tiles: [
            {
                x: 0,
                y: 0,
                terrainId: 10,
                ruleTerrainId: 10,
                terrainKey: 'castle',
                terrainTags: ['building', 'castle'],
                ownerId: 0,
                defenseBonus: 15,
                healPerTurn: 20,
                moveCost: 1
            },
            {
                x: 2,
                y: 2,
                terrainId: 10,
                ruleTerrainId: 10,
                terrainKey: 'castle',
                terrainTags: ['building', 'castle'],
                ownerId: 1,
                defenseBonus: 15,
                healPerTurn: 20,
                moveCost: 1
            }
        ],
        units: [
            {
                id: 'u1',
                ownerId: 0,
                unitClass: 'commander',
                attackType: 'physical',
                population: 0,
                cost: 400,
                abilities: ['castle_capturer', 'village_capturer'],
                apkAbilityIds: [],
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
                tileTerrainTags: ['building', 'castle'],
                tileOwnerId: 0,
                tileDefenseBonus: 15,
                tileHealPerTurn: 20,
                tileMoveCost: 1,
                isCommander: true,
                x: 0,
                y: 0,
                hp: 100,
                maxHp: 100,
                attack: 60,
                physicalDefense: 20,
                magicDefense: 20,
                minRange: 1,
                maxRange: 1,
                move: 4,
                level: 0,
                exp: 0,
                movementRemaining: 4,
                hasMoved: false,
                hasActed: false,
                hasPostAttackMoved: false,
                hasBeenHealedThisTurn: false,
                hasBeenSupportedThisTurn: false,
                isPending: false,
                status: null,
                apkStatusId: null,
                statusRemainingTicks: null,
                statusRemainingTurns: null
            }
        ],
        graves: []
    };

    return {
        kind: 'skirmish_dataset_sample',
        version: 1,
        source: { stepIndex: 0 },
        scenario: {
            id: 'TEST:curated',
            mode: 'SD',
            mapName: 'curated',
            resourcePath: 'demo'
        },
        seed: 1,
        maxPlies: 20,
        maxSteps: 100,
        initialObservationHash: 'hash',
        fixedActionSpaceSize: 10,
        step: 1,
        turn: 100,
        playerId: 0,
        policy: 'heuristic',
        legalActionCount: 3,
        fixedLegalActionCount: 3,
        fixedActionSpaceDescriptor: {
            width: 3,
            height: 3,
            tileCount: 9,
            unitClasses: [],
            blocks: [],
            size: 10
        },
        fixedLegalActionIndexes: [0, 1, 2],
        legalActionCodes: ['recruit_to_castle:dragon:0,0', 'move:u1:1,0', 'wait:u1'],
        observation: observation as SkirmishDatasetSample['observation'],
        label: {
            fixedActionIndex: 2,
            actionCode: 'wait:u1',
            action: { type: 'wait', unitId: 'u1' }
        },
        outcome: {
            reward: 0,
            done: false,
            winnerAfter: null,
            illegal: false
        }
    };
}

describe('skirmish curated feature export', () => {
    it('解析 curated 导出参数', () => {
        const options = parseCuratedFeatureExportArgs([
            '--input',
            'dataset.jsonl',
            '--out',
            'curated.jsonl',
            '--feature-dim',
            '512',
            '--max-candidates',
            '8',
            '--endgame-samples',
            '2',
            '--high-tier-samples',
            '3',
            '--summon-samples',
            '1',
            '--max-read-samples',
            '20',
            '--json'
        ]);

        expect(options.inputFiles[0]).toContain('dataset.jsonl');
        expect(options.outFile).toContain('curated.jsonl');
        expect(options.featureExtractor).toBe('hashed-action-v3');
        expect(options.featureDim).toBe(512);
        expect(options.maxCandidates).toBe(8);
        expect(options.maxEndgameSamples).toBe(2);
        expect(options.maxHighTierSamples).toBe(3);
        expect(options.maxSummonSamples).toBe(1);
        expect(options.maxReadSamples).toBe(20);
        expect(options.json).toBe(true);
    });

    it('导出 curated compact feature 样本', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skirmish-curated-'));
        const inputFile = path.join(tempDir, 'dataset.jsonl');
        const outFile = path.join(tempDir, 'curated.jsonl');
        await writeFile(inputFile, `${JSON.stringify(makeCuratedSample())}\n`, 'utf8');

        const summary = await exportSkirmishCuratedFeatures({
            inputFiles: [inputFile],
            outFile,
            featureDim: 512,
            featureExtractor: 'hashed-action-v3',
            maxCandidates: 8,
            maxEndgameSamples: 1,
            maxHighTierSamples: 1,
            maxSummonSamples: 0,
            maxReadSamples: null,
            minEndgameTurn: 80,
            json: false
        });
        const first = JSON.parse((await readFile(outFile, 'utf8')).trim()) as Record<string, unknown>;

        expect(summary.exportedSamples).toBe(1);
        expect(summary.highTierSamples).toBe(1);
        expect(first.kind).toBe('skirmish_feature_sample');
        expect(first.featureExtractor).toBe('hashed-action-v3');
    });
});
