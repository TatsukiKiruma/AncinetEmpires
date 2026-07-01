import { describe, expect, it } from 'vitest';
import { getApkSkirmishTrainingScenarios } from '../src/game/apk_skirmish';
import { getUnverifiedSkirmishApproximateTerrainIds } from './apk_training_report';

describe('APK training report', () => {
    it('默认训练场景只包含已实测 approximate 地形', () => {
        const scenarios = getApkSkirmishTrainingScenarios({
            allowApproximateTerrain: false
        });
        const approximateTerrainIds = [...new Set(
            scenarios.flatMap(scenario => scenario.terrainConfidence.approximateTerrainIds)
        )].sort((left, right) => left - right);
        const unverifiedApproximateTerrainIds = getUnverifiedSkirmishApproximateTerrainIds(
            approximateTerrainIds
        );

        expect(scenarios).toHaveLength(40);
        expect(approximateTerrainIds).toEqual([30, 31]);
        expect(unverifiedApproximateTerrainIds).toEqual([]);
        expect(scenarios.every(scenario => (
            getUnverifiedSkirmishApproximateTerrainIds(
                scenario.terrainConfidence.approximateTerrainIds
            ).length === 0
        ))).toBe(true);
    });
});
