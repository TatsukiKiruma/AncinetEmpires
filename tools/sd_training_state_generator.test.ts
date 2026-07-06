import { describe, expect, it } from 'vitest';
import {
    buildSdTrainingJobs,
    getSdTrainingMapPlayerCount,
    type SdTrainingPlanConfig
} from './sd_training_state_generator';

function createTestConfig(): SdTrainingPlanConfig {
    return {
        version: 1,
        name: 'test-sd-plan',
        mode: 'SD',
        mapNames: [
            '(2) Duel.aem',
            '(3) Frozen fields.aem',
            '(4) Crossroads.aem',
            'Custom without count.aem'
        ],
        defaults: {
            seedBase: 1000,
            maxTurns: 200,
            preset: 'heuristic-apk-like-balanced',
            setup: {
                initialGold: 300,
                unitLimit: 30,
                levelCap: 3
            }
        },
        feature: {
            featureDim: 4096,
            maxCandidates: 64,
            featureExtractor: 'hashed-action-v2'
        },
        paths: {
            jobManifest: 'training_runs/test/jobs.jsonl',
            prepareReport: 'training_runs/test/prepare_report.md',
            episodeDir: 'training_runs/test/episodes',
            datasetDir: 'training_runs/test/datasets',
            featureDir: 'training_runs/test/features',
            modelDir: 'training_runs/test/models'
        },
        replayCleaning: {
            rootDir: 'captures',
            outDir: 'training_runs/test/replay_cleaning',
            mode: 'SD',
            blacklistOrdinals: [],
            blacklistFileNames: []
        },
        plans: [
            {
                id: 'all-maps',
                label: '全部地图',
                kind: 'normal',
                episodesPerMap: 2
            },
            {
                id: 'three-player-only',
                label: '三阵营地图',
                kind: 'normal',
                episodesPerMap: 3,
                mapPlayerCounts: [3]
            }
        ]
    };
}

describe('sd training state generator', () => {
    it('可以从地图名解析阵营数', () => {
        expect(getSdTrainingMapPlayerCount('(2) Duel.aem')).toBe(2);
        expect(getSdTrainingMapPlayerCount('(4) Crossroads.aem')).toBe(4);
        expect(getSdTrainingMapPlayerCount('Custom without count.aem')).toBeNull();
    });

    it('按 mapPlayerCounts 筛选训练 job', () => {
        const jobs = buildSdTrainingJobs(createTestConfig());

        expect(jobs).toHaveLength(11);
        expect(jobs.filter(job => job.planId === 'all-maps')).toHaveLength(8);
        expect(jobs.filter(job => job.planId === 'three-player-only')).toHaveLength(3);
        expect(jobs.filter(job => job.planId === 'three-player-only').every(job => job.mapName.startsWith('(3)'))).toBe(true);
    });
});
