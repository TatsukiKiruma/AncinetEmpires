/**
 * V11 T11-04 batch-2 step 1: collect replay-provable data.
 *
 * Every match goes through `runFullV7BenchmarkSuite` -> `runBenchmarkMatch`,
 * which (since the T11-01 fix) writes the initial snapshot into the trajectory
 * log. That is what makes the resulting dataset verifiable instead of guessed.
 *
 * Outputs, all under a NEW runId:
 *   training_runs/<runId>/trajectories/*.json
 *   training_runs/<runId>/episodes.jsonl
 *   v11/out/dataset_v11_source.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR, RUN_DIR, RUN_ID, ensureDir, writeJson, writeJsonl } from './common';
import { BENCHMARK_MAPS, runFullV7BenchmarkSuite, type PolicyType } from '../v7_unified_evaluation';
import { v10SetupForSeed } from './replay';
import { verifyInitialSnapshot } from '../../src/game/state_snapshot';

const ALL_MAPS = BENCHMARK_MAPS.map(m => m.name);
const OOD_MAPS = ['(2) Liberty Port.aem'];
const TRAIN_MAPS = ALL_MAPS.filter(m => !OOD_MAPS.includes(m));

export interface DatasetCollectionPlan {
    runId: string;
    seeds: number[];
    maps: string[];
    oodMaps: string[];
    maxTurns: number;
    maxAtomicSteps: number;
    policies: PolicyType[];
}

export function defaultPlan(): DatasetCollectionPlan {
    return {
        runId: RUN_ID,
        seeds: [42, 1337, 2026, 4242],
        maps: TRAIN_MAPS,
        oodMaps: OOD_MAPS,
        maxTurns: Number(process.env.V11_MAX_TURNS ?? 50),
        maxAtomicSteps: Number(process.env.V11_MAX_ATOMIC_STEPS ?? 1000),
        policies: ['HEURISTIC'],
    };
}

export interface CollectedEpisode {
    episodeId: string;
    rootFamilyId: string;
    mapName: string;
    mapLabel: string;
    seed: number;
    candidateSeat: number;
    candidatePolicy: string;
    opponentPolicy: string;
    engineStepCount: number;
    turns: number;
    terminationReason: string;
    winnerSeat: number | null;
    candidateOutcome: string;
    z: number | null;
    isCensored: boolean;
    rehireOpportunityCount: number;
    rehireSuccessCount: number;
    trajectoryLogPath: string;
    initialStateHash: string | null;
    setupId: string;
}

function slugMap(mapName: string): string {
    return mapName.replace(/[^a-zA-Z0-9]/g, '_');
}

export async function collectDataset(plan: DatasetCollectionPlan): Promise<{
    episodes: CollectedEpisode[];
    sourceReport: Record<string, unknown>;
    files: string[];
}> {
    const runDir = path.resolve(`training_runs/${plan.runId}`);
    const trajectoryDir = path.join(runDir, 'trajectories');
    const reportDir = path.resolve(`docs/training/reports/${plan.runId}`);
    ensureDir(runDir); ensureDir(trajectoryDir); ensureDir(reportDir); ensureDir(OUT_DIR);

    const started = Date.now();
    const { outcomes } = await runFullV7BenchmarkSuite({
        policiesToEvaluate: plan.policies,
        maps: BENCHMARK_MAPS.filter(m => plan.maps.includes(m.name)),
        seeds: plan.seeds,
        maxTurns: plan.maxTurns,
        maxAtomicSteps: plan.maxAtomicSteps,
        directories: {
            runId: plan.runId, runDir, reportDir, trajectoryDir,
            checkpointDir: path.join(runDir, 'checkpoints'),
        },
        // Deterministic setup per seed: the same variation the V10 collectors
        // applied, now actually recorded in each trajectory.
        setupForSeed: (seed: number) => v10SetupForSeed(seed),
        protocol: { deterministicReplay: false },
    });
    const elapsedMs = Date.now() - started;

    const episodes: CollectedEpisode[] = outcomes.map(o => {
        const isWin = o.terminationReason === 'NATURAL_WIN';
        const isLoss = o.terminationReason === 'NATURAL_LOSS';
        const isDraw = o.terminationReason === 'NATURAL_DRAW';
        const isCensored = !isWin && !isLoss && !isDraw;
        const setup = v10SetupForSeed(o.seed);
        return {
            episodeId: o.matchId,
            rootFamilyId: `root_${slugMap(o.mapName)}_s${o.seed}`,
            mapName: o.mapName,
            mapLabel: (BENCHMARK_MAPS.find(m => m.name === o.mapName) as any)?.label ?? o.mapName,
            seed: o.seed,
            candidateSeat: o.candidateSeat,
            candidatePolicy: o.candidatePolicy,
            opponentPolicy: o.opponentPolicy,
            engineStepCount: o.steps,
            turns: o.turns,
            terminationReason: o.terminationReason,
            winnerSeat: isWin ? o.candidateSeat : isLoss ? (1 - o.candidateSeat) : null,
            candidateOutcome: isWin ? 'WIN' : isLoss ? 'LOSS' : isDraw ? 'DRAW' : 'CENSORED',
            z: isWin ? 1 : isLoss ? -1 : isDraw ? 0 : null,
            isCensored,
            rehireOpportunityCount: o.rehireOpportunities ?? 0,
            rehireSuccessCount: o.rehireSuccesses ?? 0,
            trajectoryLogPath: path.relative(process.cwd(), o.trajectoryLogPath).split(path.sep).join('/'),
            initialStateHash: (o as any).initialStateHash ?? null,
            setupId: `g${setup.initialGold}_u${setup.unitLimit}_c${setup.levelCap}`,
        };
    });

    const episodesFile = path.join(runDir, 'episodes.jsonl');
    writeJsonl(episodesFile, episodes);

    const sourceReport = {
        schema: 'v11_dataset_source_1',
        runId: plan.runId,
        generatedAt: new Date().toISOString(),
        plan, elapsedMs,
        matchCount: episodes.length,
        naturalTerminals: episodes.filter(e => e.z !== null).length,
        truncations: episodes.filter(e => e.isCensored).length,
        byMap: Object.fromEntries(plan.maps.map(m => [m, episodes.filter(e => e.mapName === m).length])),
        bySetup: Object.fromEntries(
            Array.from(new Set(episodes.map(e => e.setupId))).map(s => [s, episodes.filter(e => e.setupId === s).length])
        ),
        episodesFile: path.relative(process.cwd(), episodesFile).split(path.sep).join('/'),
        note:
            'Every trajectory carries an initialSnapshot written by runBenchmarkMatch, so the pool is ' +
            'replay-provable. No neural network participated: the candidate policy is the frozen Heuristic baseline.',
    };
    writeJson(path.join(OUT_DIR, 'dataset_v11_source.json'), sourceReport);

    return { episodes, sourceReport, files: [episodesFile, path.join(OUT_DIR, 'dataset_v11_source.json')] };
}

/** Post-collection integrity spot check: are the recorded snapshots self-consistent? */
export function verifyCollectedSnapshots(episodesFile: string, sampleSize = 8): {
    checked: number; valid: number; missing: number;
    failures: Array<{ episodeId: string; reason: string }>;
} {
    const lines = fs.readFileSync(episodesFile, 'utf8').split('\n').filter(l => l.trim());
    const failures: Array<{ episodeId: string; reason: string }> = [];
    let checked = 0, valid = 0, missing = 0;
    const stride = Math.max(1, Math.floor(lines.length / sampleSize));
    for (let i = 0; i < lines.length; i += stride) {
        const ep = JSON.parse(lines[i]);
        const trajPath = path.isAbsolute(ep.trajectoryLogPath) ? ep.trajectoryLogPath : path.resolve(ep.trajectoryLogPath);
        if (!fs.existsSync(trajPath)) {
            missing += 1; failures.push({ episodeId: ep.episodeId, reason: 'trajectory missing' }); continue;
        }
        const traj = JSON.parse(fs.readFileSync(trajPath, 'utf8'));
        if (!traj.initialSnapshot) {
            missing += 1; failures.push({ episodeId: ep.episodeId, reason: 'no initialSnapshot in trajectory' }); continue;
        }
        checked += 1;
        const result = verifyInitialSnapshot(traj.initialSnapshot, {
            sha256Hex: (text: string) => createHash('sha256').update(text, 'utf8').digest('hex'),
        });
        if (result.ok) valid += 1;
        else failures.push({ episodeId: ep.episodeId, reason: result.reason ?? 'unknown' });
    }
    return { checked, valid, missing, failures };
}