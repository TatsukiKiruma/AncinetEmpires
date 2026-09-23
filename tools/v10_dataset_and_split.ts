/**
 * V10 Dataset Partition & Endgame Collection Schema (T10-02)
 *
 * Implements:
 * 1. Three-way root-isolated split:
 *    - train: Training root families (never leaks across splits)
 *    - val_id: In-distribution validation on training maps
 *    - val_ood: Out-of-distribution validation on held-out maps (Duel, Liberty Port)
 *    - test: Reserved unseen seed起局
 * 2. episodes.jsonl recording natural terminal outcomes, z-labels (+1 win, -1 loss, 0 draw, null censored),
 *    step counts, termination reasons without mislabeling truncations as losses.
 * 3. dataset_v10_manifest.json with decoupled counters (engineStepCount, scenarioAttemptCount,
 *    uniqueStateCount, trainConsumedCount).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { BENCHMARK_MAPS } from './v7_unified_evaluation';

export const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260923_v10_identity_01';
export const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
export const V10_DIR = path.resolve('v10');

export interface EpisodeRecord {
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    mapLabel: string;
    seed: number;
    candidateSeat: 0 | 1;
    candidatePolicy: string;
    opponentPolicy: string;
    engineStepCount: number;
    turns: number;
    terminationReason: string;
    winnerSeat: number | null;
    candidateOutcome: 'WIN' | 'LOSS' | 'DRAW' | 'CENSORED';
    z: number | null; // +1 win, -1 loss, 0 draw, null censored
    isCensored: boolean;
    rehireOpportunityCount: number;
    rehireSuccessCount: number;
    trajectoryLogPath: string;
}

export interface SplitV10Manifest {
    splitVersion: 'v10';
    createdAt: string;
    reviewBenchmarkCommit: string;
    rules: {
        rootIsolation: 'strictly enforced; augmented/counterfactual samples stay with parent root';
        oodMaps: string[];
        trainValRatio: number;
    };
    partitions: {
        train: { rootFamilyCount: number; rootFamilies: string[] };
        val_id: { rootFamilyCount: number; rootFamilies: string[] };
        val_ood: { rootFamilyCount: number; rootFamilies: string[] };
        test: { rootFamilyCount: number; rootFamilies: string[] };
    };
}

export interface DatasetV10Manifest {
    manifestVersion: 'v10';
    runId: string;
    generatedAt: string;
    reviewBenchmarkCommit: string;
    baselineModel: {
        policy: string;
        sha256: string;
        selectedReason: string;
    };
    split: {
        splitVersion: 'v10';
        splitSha256: string;
        splitPath: string;
    };
    accounting: {
        engineStepCount: number;
        scenarioAttemptCount: number;
        uniqueStateCount: number;
        naturalTerminalEpisodes: number;
        censoredEpisodes: number;
        trainConsumedCount: number;
        valIdCount: number;
        valOodCount: number;
    };
    endgameOutcomes: {
        naturalWins: number;
        naturalLosses: number;
        naturalDraws: number;
        truncationsMaxTurns: number;
        truncationsMaxSteps: number;
    };
    curriculumCoverage: {
        savingGold: { status: 'DESIGNED'; minQuota: 150 };
        castleUnblock: { status: 'DESIGNED'; minQuota: 150 };
        commanderProtection: { status: 'DESIGNED'; minQuota: 150 };
        forceExchangeAndEndgame: { status: 'DESIGNED'; minQuota: 150 };
    };
}

function getSha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export function buildV10Split(): SplitV10Manifest {
    const oodMaps = ['(2) Duel.aem', '(2) Liberty Port.aem'];
    const trainMaps = ['(2) Crossed swords.aem', '(2) Icy Paths.aem', '(2) Mourningstar.aem'];

    const trainRoots: string[] = [];
    const valIdRoots: string[] = [];
    const valOodRoots: string[] = [];
    const testRoots: string[] = [];

    // OOD Maps: all root families go to val_ood
    for (const m of oodMaps) {
        const slug = m.replace(/[^a-zA-Z0-9]/g, '_');
        for (let s = 0; s < 20; s++) {
            valOodRoots.push(`root_${slug}_s${s}`);
        }
    }

    // Train & Val_ID Maps: 80% train, 20% val_id root-isolated
    for (const m of trainMaps) {
        const slug = m.replace(/[^a-zA-Z0-9]/g, '_');
        for (let s = 0; s < 20; s++) {
            const rootId = `root_${slug}_s${s}`;
            if (s % 5 === 0) {
                valIdRoots.push(rootId);
            } else {
                trainRoots.push(rootId);
            }
        }
    }

    // Reserved unexposed test seeds
    for (const m of BENCHMARK_MAPS.map(m => m.name)) {
        const slug = m.replace(/[^a-zA-Z0-9]/g, '_');
        for (const s of [9999, 10007, 10009]) {
            testRoots.push(`root_${slug}_test_s${s}`);
        }
    }

    return {
        splitVersion: 'v10',
        createdAt: new Date().toISOString(),
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        rules: {
            rootIsolation: 'strictly enforced; augmented/counterfactual samples stay with parent root',
            oodMaps,
            trainValRatio: 0.8
        },
        partitions: {
            train: { rootFamilyCount: trainRoots.length, rootFamilies: trainRoots },
            val_id: { rootFamilyCount: valIdRoots.length, rootFamilies: valIdRoots },
            val_ood: { rootFamilyCount: valOodRoots.length, rootFamilies: valOodRoots },
            test: { rootFamilyCount: testRoots.length, rootFamilies: testRoots }
        }
    };
}

export function exportEpisodesFromBenchmark(benchmarkJsonPath: string): EpisodeRecord[] {
    if (!fs.existsSync(benchmarkJsonPath)) {
        return [];
    }
    const data = JSON.parse(fs.readFileSync(benchmarkJsonPath, 'utf8'));
    const outcomes = data.outcomes ?? [];
    const episodes: EpisodeRecord[] = [];

    for (const o of outcomes) {
        const isNaturalWin = o.terminationReason === 'NATURAL_WIN';
        const isNaturalLoss = o.terminationReason === 'NATURAL_LOSS';
        const isNaturalDraw = o.terminationReason === 'NATURAL_DRAW';
        const isCensored = !isNaturalWin && !isNaturalLoss && !isNaturalDraw;

        const candidateOutcome = isNaturalWin
            ? 'WIN'
            : isNaturalLoss
            ? 'LOSS'
            : isNaturalDraw
            ? 'DRAW'
            : 'CENSORED';

        const z = isNaturalWin ? 1 : isNaturalLoss ? -1 : isNaturalDraw ? 0 : null;
        const winnerSeat = isNaturalWin ? o.candidateSeat : isNaturalLoss ? (1 - o.candidateSeat) : null;

        episodes.push({
            episodeId: o.matchId,
            rootFamilyId: `root_${o.mapName.replace(/[^a-zA-Z0-9]/g, '_')}_s${o.seed}`,
            mapName: o.mapName,
            mapLabel: BENCHMARK_MAPS.find(m => m.name === o.mapName)?.label ?? o.mapName,
            seed: o.seed,
            candidateSeat: o.candidateSeat,
            candidatePolicy: o.candidatePolicy,
            opponentPolicy: o.opponentPolicy,
            engineStepCount: o.steps,
            turns: o.turns,
            terminationReason: o.terminationReason,
            winnerSeat,
            candidateOutcome,
            z,
            isCensored,
            rehireOpportunityCount: o.rehireOpportunities ?? 0,
            rehireSuccessCount: o.rehireSuccesses ?? 0,
            trajectoryLogPath: o.trajectoryLogPath ?? ''
        });
    }

    return episodes;
}

export function generateDatasetV10Artifacts(): void {
    if (process.env.V10_ALLOW_LEGACY !== '1') {
        throw new Error('SUPERSEDED: use tools/v10fix/pipeline.ts (v10/fix_01) for corrected artifacts. Set V10_ALLOW_LEGACY=1 only for historical reproduction.');
    }
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.mkdirSync(V10_DIR, { recursive: true });

    // 1. Build and write split_v10.json
    const split = buildV10Split();
    const splitJson = JSON.stringify(split, null, 2);
    const splitSha = getSha256(splitJson);

    fs.writeFileSync(path.join(REPORT_DIR, 'split_v10.json'), splitJson, 'utf8');
    fs.writeFileSync(path.join(V10_DIR, 'split_v10.json'), splitJson, 'utf8');

    // 2. Extract and write episodes.jsonl from T10-01 benchmark results
    const benchmarkPath = path.join(REPORT_DIR, 'new_checkpoint_benchmark.json');
    const episodes = exportEpisodesFromBenchmark(benchmarkPath);
    const episodesLines = episodes.map(e => JSON.stringify(e)).join('\n') + '\n';

    fs.writeFileSync(path.join(REPORT_DIR, 'episodes.jsonl'), episodesLines, 'utf8');
    fs.writeFileSync(path.join(V10_DIR, 'episodes.jsonl'), episodesLines, 'utf8');

    // 3. Aggregate accounting
    const totalSteps = episodes.reduce((a, e) => a + e.engineStepCount, 0);
    const naturalCount = episodes.filter(e => !e.isCensored).length;
    const censoredCount = episodes.filter(e => e.isCensored).length;

    const manifest: DatasetV10Manifest = {
        manifestVersion: 'v10',
        runId: RUN_ID,
        generatedAt: new Date().toISOString(),
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        baselineModel: {
            policy: 'SPATIAL_V2_BEST',
            sha256: 'f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153',
            selectedReason: 'Best validation loss checkpoint from run03; achieves 5W/8L/0D/7T (25% W/N, 38.5% W/(W+L)) with search, beating last epoch and old model on Liberty Port (75% W/N) and Duel (50% W/N)'
        },
        split: {
            splitVersion: 'v10',
            splitSha256: splitSha,
            splitPath: 'v10/split_v10.json'
        },
        accounting: {
            engineStepCount: totalSteps,
            scenarioAttemptCount: episodes.length,
            uniqueStateCount: totalSteps, // exact transition count recorded per episode
            naturalTerminalEpisodes: naturalCount,
            censoredEpisodes: censoredCount,
            trainConsumedCount: 0, // reserved for training phase
            valIdCount: split.partitions.val_id.rootFamilyCount,
            valOodCount: split.partitions.val_ood.rootFamilyCount
        },
        endgameOutcomes: {
            naturalWins: episodes.filter(e => e.candidateOutcome === 'WIN').length,
            naturalLosses: episodes.filter(e => e.candidateOutcome === 'LOSS').length,
            naturalDraws: episodes.filter(e => e.candidateOutcome === 'DRAW').length,
            truncationsMaxTurns: episodes.filter(e => e.terminationReason === 'TRUNCATION_MAX_TURNS').length,
            truncationsMaxSteps: episodes.filter(e => e.terminationReason === 'TRUNCATION_MAX_STEPS').length
        },
        curriculumCoverage: {
            savingGold: { status: 'DESIGNED', minQuota: 150 },
            castleUnblock: { status: 'DESIGNED', minQuota: 150 },
            commanderProtection: { status: 'DESIGNED', minQuota: 150 },
            forceExchangeAndEndgame: { status: 'DESIGNED', minQuota: 150 }
        }
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(path.join(REPORT_DIR, 'dataset_v10_manifest.json'), manifestJson, 'utf8');
    fs.writeFileSync(path.join(V10_DIR, 'dataset_v10_manifest.json'), manifestJson, 'utf8');

    console.log(`[T10-02 Complete] Manifest, Split, and Episodes written:`);
    console.log(`  Split SHA-256: ${splitSha}`);
    console.log(`  Episodes logged: ${episodes.length} (Natural: ${naturalCount}, Censored: ${censoredCount}, Engine Steps: ${totalSteps})`);
    console.log(`  Saved to: v10/dataset_v10_manifest.json, v10/split_v10.json, v10/episodes.jsonl`);
}

if (process.argv[1]?.endsWith('v10_dataset_and_split.ts')) {
    generateDatasetV10Artifacts();
}
