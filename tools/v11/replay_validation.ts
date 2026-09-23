/**
 * V11 T11-01: real-initial-state replay validation and dataset accounting.
 *
 * Answers, per recorded episode, three questions the V10 pipeline conflated:
 *   1. Can the initial state be *proven* (recorded snapshot, or a reconstruction
 *      whose hash matches the hash computed at collection time)?
 *   2. Does the recorded action history replay legally, step by step, with
 *      engine acceptance checked?
 *   3. Which samples may keep a policy label, and which may carry a value label?
 *
 * Outputs under v11/out/: replay_validation.json, invalid_episodes.jsonl,
 * dataset_v11_manifest.json, split_v11.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT_DIR, RUN_ID, ensureDir, readJsonl, sha256, writeJson, writeJsonl } from './common';
import {
    V11_ENCODER_SCHEMA,
    type EpisodeFileRecord,
    readTrajectory,
    replayEpisode,
    resolveInitialSnapshot,
    v10SetupForSeed,
} from './replay';
import type { ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';

export interface ReplayValidationReport {
    schema: 'v11_replay_validation_1';
    runId: string;
    generatedAt: string;
    episodesFile: string;
    counts: {
        episodesInPool: number;
        trajectoriesMissing: number;
        snapshotUnproven: number;
        replayValidated: number;
        replayFailed: number;
        naturalTerminal: number;
        truncated: number;
        droppedForPerformanceCap: number;
    };
    failureBreakdown: Record<string, number>;
    provenanceBreakdown: Record<string, number>;
    coverage: {
        totalRecordedSteps: number;
        totalStepsReplayed: number;
        hashChecksPerformed: number;
        meanReplayCompletion: number;
    };
    naturalTerminalValidated: number;
    sampledEpisodes: Array<{
        episodeId: string;
        ok: boolean;
        provenance: string;
        stepsReplayed: number;
        totalSteps: number;
        failureCode: string | null;
        failureStep: number | null;
        naturalTerminal: boolean;
    }>;
    notes: string[];
}

export interface DatasetV11Manifest {
    schema: 'v11_dataset_manifest_1';
    runId: string;
    generatedAt: string;
    encoderSchema: string;
    rowSchema: string[];
    masks: { policyLossMask: string; valueLossMask: string; rule: string };
    accounting: {
        episodesTotal: number;
        episodesReplayValidated: number;
        episodesQuarantined: number;
        stepsReplayed: number;
        hashChecksPerformed: number;
        uniqueStateHashes: number;
        policyLabelledSamples: number;
        valueLabelledSamples: number;
        valueNullSamples: number;
        naturalTerminalEpisodes: number;
    };
    provenance: { recordedSnapshot: number; reconstructedHashVerified: number; unproven: number };
    partitions: Record<string, { rootFamilies: number; episodes: number; naturalTerminalEpisodes: number }>;
    v10PoolDisposition: { dataset: string; disposition: 'QUARANTINED_INPUT_ALIGNMENT'; reason: string };
    notes: string[];
}

export interface SplitV11 {
    schema: 'v11_split_1';
    generatedAt: string;
    runId: string;
    source: string;
    rules: {
        rootIsolation: true;
        testRootsReserved: true;
        reservedTestSeeds: number[];
        oodMaps: string[];
        partitionFunction: string;
    };
    train: { rootFamilies: string[]; episodes: number; naturalTerminalEpisodes: number };
    val_id: { rootFamilies: string[]; episodes: number; naturalTerminalEpisodes: number };
    val_ood: { rootFamilies: string[]; episodes: number; naturalTerminalEpisodes: number };
    test: { rootFamilies: string[]; episodes: number; naturalTerminalEpisodes: number };
    notes: string[];
}

export const RESERVED_TEST_SEEDS: number[] = [];
for (let s = 9001; s <= 9020; s += 1) RESERVED_TEST_SEEDS.push(s);

export const OOD_MAPS = ['(2) Liberty Port.aem'];

export function partitionRootFamily(rootFamilyId: string): 'train' | 'val_id' | 'val_ood' | 'test' {
    const seedMatch = /_s(\d+)$/.exec(rootFamilyId);
    if (seedMatch && RESERVED_TEST_SEEDS.includes(Number(seedMatch[1]))) return 'test';
    const bucket = parseInt(sha256(rootFamilyId).slice(0, 8), 16) % 10;
    return bucket < 7 ? 'train' : 'val_id';
}

export function isOodMap(mapName: string): boolean {
    return OOD_MAPS.includes(mapName);
}

/**
 * The V10 collectors did not persist the setup selection, but it is a total
 * function of the episode seed. Recomputing it is provenance, not a guess: the
 * reconstruction still has to match the hash recorded at collection time.
 */
export function setupForEpisode(ep: EpisodeFileRecord): ApkSkirmishSetupSelection {
    return v10SetupForSeed(Number(ep.seed));
}

export interface T11_01Options {
    episodesFile?: string;
    maxEpisodes?: number;
    hashEveryNSteps?: number;
}

/**
 * Default validation pool: prefer a V11 collection (replay-provable) and fall
 * back to the quarantined V10 pool only when no V11 run exists.
 */
export function defaultEpisodesFile(): string {
    if (process.env.V11_EPISODES_FILE) return process.env.V11_EPISODES_FILE;
    const candidates = [
        `training_runs/${RUN_ID}/episodes.jsonl`,
        'training_runs/agent_upgrade_v11_b2_main/episodes.jsonl',
        'training_runs/agent_upgrade_v11_b2_pilot/episodes.jsonl',
        'v10/fix_01/episodes.jsonl',
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return 'v10/fix_01/episodes.jsonl';
}

export function runT11_01(options: T11_01Options = {}): {
    replayValidation: ReplayValidationReport;
    datasetManifest: DatasetV11Manifest;
    split: SplitV11;
    invalid: Array<Record<string, unknown>>;
    files: string[];
} {
    const episodesFile = options.episodesFile ?? defaultEpisodesFile();
    const maxEpisodes = options.maxEpisodes ?? Number(process.env.V11_MAX_EPISODES ?? 40);
    const hashEveryNSteps = options.hashEveryNSteps ?? 10;

    const episodes = readJsonl<EpisodeFileRecord>(episodesFile);
    ensureDir(OUT_DIR);

    const invalid: Array<Record<string, unknown>> = [];
    const stateHashes = new Set<string>();
    let trajectoriesMissing = 0;
    let snapshotUnproven = 0;
    let totalRecordedSteps = 0;
    let totalStepsReplayed = 0;
    let hashChecks = 0;
    let naturalTerminalValidated = 0;
    let recordedSnapshots = 0;
    let policyLabelled = 0;
    let valueLabelled = 0;
    let valueNull = 0;
    let truncated = 0;
    const failureBreakdown: Record<string, number> = {};
    const provenanceBreakdown: Record<string, number> = {};
    const sampled: ReplayValidationReport['sampledEpisodes'] = [];
    const splitBuckets: Record<string, { roots: Set<string>; episodes: number; natural: number }> = {
        train: { roots: new Set(), episodes: 0, natural: 0 },
        val_id: { roots: new Set(), episodes: 0, natural: 0 },
        val_ood: { roots: new Set(), episodes: 0, natural: 0 },
        test: { roots: new Set(), episodes: 0, natural: 0 },
    };

    for (let i = 0; i < episodes.length; i += 1) {
        const ep = episodes[i];
        if (i >= maxEpisodes) break;

        const trajectory = (() => {
            try { return readTrajectory(ep.trajectoryLogPath); } catch { return null; }
        })();
        if (!trajectory) {
            trajectoriesMissing += 1;
            invalid.push({
                episodeId: ep.episodeId, rootFamilyId: ep.rootFamilyId, mapName: ep.mapName, seed: ep.seed,
                quarantineReason: 'TRAJECTORY_MISSING', detail: ep.trajectoryLogPath,
            });
            continue;
        }
        const actions = trajectory.actions;

        const setup = trajectory.setupSelection ?? setupForEpisode(ep);
        const resolution = resolveInitialSnapshot({
            mapName: ep.mapName,
            recordedSnapshot: trajectory.initialSnapshot,
            recordedInitialStateHash: trajectory.recordedInitialStateHash ?? (ep as any).initialStateHash ?? null,
            setup,
            subjectSeat: trajectory.candidateSeat ?? ep.candidateSeat ?? 0,
        });
        const provenance = resolution.provenance;
        provenanceBreakdown[provenance] = (provenanceBreakdown[provenance] ?? 0) + 1;
        if (trajectory.initialSnapshot) recordedSnapshots += 1;

        if (!resolution.snapshot) {
            snapshotUnproven += 1;
            invalid.push({
                episodeId: ep.episodeId, rootFamilyId: ep.rootFamilyId, mapName: ep.mapName, seed: ep.seed,
                quarantineReason: 'INITIAL_SNAPSHOT_UNPROVEN', detail: resolution.reason,
                expectedHash: resolution.expectedHash, observedHash: resolution.observedHash,
            });
            continue;
        }

        const validation = replayEpisode(ep.episodeId, ep.mapName, actions, resolution.snapshot, provenance, { hashEveryNSteps });
        totalRecordedSteps += validation.totalRecordedSteps;
        totalStepsReplayed += validation.stepsReplayed;
        hashChecks += validation.hashChecksPerformed;
        for (const s of validation.steps) stateHashes.add(s.stateHash);

        const isTruncated = /TRUNCATION/.test(String(ep.terminationReason));
        if (validation.ok) {
            policyLabelled += 1;
            if (!isTruncated && !ep.isCensored) {
                naturalTerminalValidated += 1;
                valueLabelled += 1;
            } else {
                valueNull += 1;
                if (isTruncated) truncated += 1;
            }
            const part = isOodMap(ep.mapName) ? 'val_ood' : partitionRootFamily(ep.rootFamilyId);
            const bucket = splitBuckets[part];
            bucket.roots.add(ep.rootFamilyId);
            bucket.episodes += 1;
            if (!isTruncated && !ep.isCensored) bucket.natural += 1;
        } else {
            const code = validation.failureCode ?? 'UNKNOWN';
            failureBreakdown[code] = (failureBreakdown[code] ?? 0) + 1;
            invalid.push({
                episodeId: ep.episodeId, rootFamilyId: ep.rootFamilyId, mapName: ep.mapName, seed: ep.seed,
                setupId: resolution.snapshot.setupId, quarantineReason: code,
                failureStep: validation.failureStep, totalSteps: validation.totalRecordedSteps,
                detail: validation.failureDetail,
            });
        }

        if (sampled.length < 25) {
            sampled.push({
                episodeId: ep.episodeId,
                ok: validation.ok,
                provenance,
                stepsReplayed: validation.stepsReplayed,
                totalSteps: validation.totalRecordedSteps,
                failureCode: validation.failureCode,
                failureStep: validation.failureStep,
                naturalTerminal: validation.naturalTerminal,
            });
        }
    }

    const validated = Object.values(splitBuckets).reduce((n, b) => n + b.episodes, 0);
    const naturalInPool = episodes.filter(e => !/TRUNCATION/.test(String(e.terminationReason)) && !e.isCensored).length;

    const replayValidation: ReplayValidationReport = {
        schema: 'v11_replay_validation_1',
        runId: RUN_ID,
        generatedAt: new Date().toISOString(),
        episodesFile,
        counts: {
            episodesInPool: episodes.length,
            trajectoriesMissing,
            snapshotUnproven,
            replayValidated: validated,
            replayFailed: Object.values(failureBreakdown).reduce((a, b) => a + b, 0),
            naturalTerminal: naturalTerminalValidated,
            truncated,
            droppedForPerformanceCap: Math.max(0, episodes.length - maxEpisodes),
        },
        failureBreakdown,
        provenanceBreakdown,
        coverage: {
            totalRecordedSteps,
            totalStepsReplayed,
            hashChecksPerformed: hashChecks,
            meanReplayCompletion: totalRecordedSteps > 0 ? Number((totalStepsReplayed / totalRecordedSteps).toFixed(4)) : 0,
        },
        naturalTerminalValidated,
        sampledEpisodes: sampled,
        notes: [
            'Replay legality is checked per step against the engine legal set, and the engine acceptance result is inspected.',
            'A reconstruction from map+setup is trusted only when its behavioural hash equals the hash recorded at collection time.',
            'The V10 trajectory logs did not persist the setup selection; it is recomputed from the episode seed and still hash-verified.',
            'Natural-terminal episodes replayed clean keep their z value label; truncated or censored episodes keep a policy label and a null value label.',
            `Recorded-snapshot provenance: ${recordedSnapshots}/${Math.min(episodes.length, maxEpisodes)} inspected trajectories carried an ` +
            'initial snapshot (F07). The V10 collectors never persisted one, so that pool is quarantined as UNPROVEN instead of being ' +
            'replayed under guessed settings. Recordings made after the T11-01 fix do carry a provable snapshot.',
        ],
    };

    const partitions: DatasetV11Manifest['partitions'] = {};
    for (const part of Object.keys(splitBuckets)) {
        partitions[part] = {
            rootFamilies: splitBuckets[part].roots.size,
            episodes: splitBuckets[part].episodes,
            naturalTerminalEpisodes: splitBuckets[part].natural,
        };
    }

    const datasetManifest: DatasetV11Manifest = {
        schema: 'v11_dataset_manifest_1',
        runId: RUN_ID,
        generatedAt: new Date().toISOString(),
        encoderSchema: V11_ENCODER_SCHEMA,
        rowSchema: [
            'sampleId', 'rootFamilyId', 'episodeId', 'step', 'mapName', 'stage', 'turn',
            'subjectPlayer', 'currentPlayer', 'stateHash', 'encoderSchema', 'actionListHash',
            'terminationReason', 'policyLossMask', 'valueLossMask',
        ],
        masks: {
            policyLossMask: 'true when the episode replayed legally and its recorded behaviour may be imitated',
            valueLossMask: 'true only when the episode reached a natural terminal with a known z',
            rule: 'A real value label never implies the played action was good; a truncated episode teaches policy but not value.',
        },
        accounting: {
            episodesTotal: episodes.length,
            episodesReplayValidated: validated,
            episodesQuarantined: invalid.length,
            stepsReplayed: totalStepsReplayed,
            hashChecksPerformed: hashChecks,
            uniqueStateHashes: stateHashes.size,
            policyLabelledSamples: policyLabelled,
            valueLabelledSamples: valueLabelled,
            valueNullSamples: valueNull,
            naturalTerminalEpisodes: naturalTerminalValidated,
        },
        provenance: {
            recordedSnapshot: provenanceBreakdown.RECORDED_SNAPSHOT ?? 0,
            reconstructedHashVerified: provenanceBreakdown.RECONSTRUCTED_HASH_VERIFIED ?? 0,
            unproven: provenanceBreakdown.UNKNOWN_NOT_PROVEN ?? 0,
        },
        partitions,
        v10PoolDisposition: {
            dataset: 'training_runs/agent_upgrade_20260923_v10_fix_01/value_learning_fix/datasets/d_v10_value_dataset.jsonl',
            disposition: 'QUARANTINED_INPUT_ALIGNMENT',
            reason:
                'Rows were produced by the F01-misaligned extractor: tensors described the opening board while ' +
                'action indices described the current legal set. The file is retained unmodified for provenance but ' +
                'must not be used for training or architecture selection.',
        },
        notes: [
            `Pool natural-terminal episodes: ${naturalInPool}; replay-validated natural terminal: ${naturalTerminalValidated}.`,
            'Counts with the probe schema above are produced by extractAlignedValueSamples, not by this accounting pass.',
        ],
    };

    const split: SplitV11 = {
        schema: 'v11_split_1',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        source: episodesFile,
        rules: {
            rootIsolation: true,
            testRootsReserved: true,
            reservedTestSeeds: RESERVED_TEST_SEEDS,
            oodMaps: OOD_MAPS,
            partitionFunction: 'sha256(rootFamilyId) % 10 => <7 train, else val_id',
        },
        train: { rootFamilies: Array.from(splitBuckets.train.roots).sort(), episodes: splitBuckets.train.episodes, naturalTerminalEpisodes: splitBuckets.train.natural },
        val_id: { rootFamilies: Array.from(splitBuckets.val_id.roots).sort(), episodes: splitBuckets.val_id.episodes, naturalTerminalEpisodes: splitBuckets.val_id.natural },
        val_ood: { rootFamilies: Array.from(splitBuckets.val_ood.roots).sort(), episodes: splitBuckets.val_ood.episodes, naturalTerminalEpisodes: splitBuckets.val_ood.natural },
        test: { rootFamilies: Array.from(splitBuckets.test.roots).sort(), episodes: splitBuckets.test.episodes, naturalTerminalEpisodes: splitBuckets.test.natural },
        notes: [
            'Partitions are computed over replay-validated episodes only; a quarantined episode contributes to no partition.',
            'Confirmation roots (reserved seeds) never enter the training pool.',
        ],
    };

    const files = {
        replay: path.join(OUT_DIR, 'replay_validation.json'),
        invalid: path.join(OUT_DIR, 'invalid_episodes.jsonl'),
        dataset: path.join(OUT_DIR, 'dataset_v11_manifest.json'),
        split: path.join(OUT_DIR, 'split_v11.json'),
    };
    writeJson(files.replay, replayValidation);
    writeJsonl(files.invalid, invalid);
    writeJson(files.dataset, datasetManifest);
    writeJson(files.split, split);

    return { replayValidation, datasetManifest, split, invalid, files: Object.values(files) };
}

export function hasEpisodePool(file = 'v10/fix_01/episodes.jsonl'): boolean {
    return fs.existsSync(file);
}
