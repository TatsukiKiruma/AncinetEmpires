import * as fs from 'node:fs';
import * as path from 'node:path';
import { RUN_ID, RUN_DIR, REPORT_DIR, V10_DIR, ensureDir, getSha256, readJson, writeJson, appendJsonlSync, readJsonl } from '../v10_common';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS, computeWilsonScoreInterval, type PolicyType } from '../v7_unified_evaluation';
import { collectOnPolicySamples, buildArmDatasets } from '../v10_dagger_controlled';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import type { ApkSkirmishSetupSelection } from '../../src/game/apk_skirmish';

const BASE_MODEL_PATH = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json');
const OLD_MODEL_PATH = path.resolve('src/game/ai/models/spatial_resnet_v2_checkpoint.json');
const CONFIRM_DIR = path.join(RUN_DIR, 'confirmation');
const T1004_DIR = path.join(RUN_DIR, 't10_04_formal');
const DAGGER_EXTRA_DIR = path.join(RUN_DIR, 'dagger_extra');

const SETUP_VARIANTS: ApkSkirmishSetupSelection[] = [
    { initialGold: 300, unitLimit: 30, levelCap: 3 },
    { initialGold: 400, unitLimit: 40, levelCap: 4 },
    { initialGold: 500, unitLimit: 50, levelCap: 5 },
    { initialGold: 600, unitLimit: 60, levelCap: 6 },
    { initialGold: 700, unitLimit: 70, levelCap: 7 }
];

function setupForSeed(seed: number): ApkSkirmishSetupSelection {
    const idx = Math.abs(seed - 9001) % SETUP_VARIANTS.length;
    return SETUP_VARIANTS[idx];
}

function safeKey(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function parseSeedList(value: string, fallback: number[]): number[] {
    const parsed = value.split(',').map(s => Number(s.trim())).filter(Number.isFinite);
    return parsed.length > 0 ? parsed : fallback;
}

function loadProgress(file: string): Map<string, any> {
    const map = new Map<string, any>();
    for (const rec of readJsonl<any>(file)) map.set(rec.chunkKey, rec);
    return map;
}

function appendProgress(file: string, rec: any): void {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, JSON.stringify(rec) + '\n', 'utf8');
}

function readAllProgress(file: string): any[] {
    return readJsonl<any>(file);
}

function readUniqueProgress(file: string): any[] {
    const map = new Map<string, any>();
    for (const rec of readAllProgress(file)) map.set(rec.chunkKey, rec);
    return Array.from(map.values());
}

function uniqueOutcomes(records: any[]): any[] {
    const map = new Map<string, any>();
    for (const rec of records) for (const o of (rec.outcomes || [])) map.set(o.matchId, o);
    return Array.from(map.values());
}

function outcomeStats(outcomes: any[], label: string) {
    const wins = outcomes.filter(o => o.terminationReason === 'NATURAL_WIN').length;
    const losses = outcomes.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
    const draws = outcomes.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
    const truncations = outcomes.length - wins - losses - draws;
    const naturalTotal = wins + losses;
    return {
        label,
        matches: outcomes.length,
        wins, losses, draws, truncations,
        naturalWinRate: naturalTotal > 0 ? Number(((wins / naturalTotal) * 100).toFixed(1)) : null,
        winRateAllMatches: outcomes.length > 0 ? Number(((wins / outcomes.length) * 100).toFixed(1)) : null,
        ci95Natural: computeWilsonScoreInterval(wins, Math.max(1, naturalTotal)),
        ci95All: computeWilsonScoreInterval(wins, outcomes.length),
        truncationRate: outcomes.length > 0 ? Number(((truncations / outcomes.length) * 100).toFixed(1)) : null
    };
}

const CONFIRM_CHECKPOINTS: Partial<Record<PolicyType, string>> = {
    SPATIAL_V2_OLD: OLD_MODEL_PATH,
    SPATIAL_V2_BEST: BASE_MODEL_PATH,
    S10_SEARCH_BEST: BASE_MODEL_PATH
};

async function t1001Confirm(): Promise<void> {
    ensureDir(CONFIRM_DIR);
    const seeds = parseSeedList(process.env.V10_T10_01_SEEDS || '9001,9002,9003,9004', [9001, 9002, 9003, 9004]);
    const policies = (process.env.V10_T10_01_POLICIES || 'SPATIAL_V2_BEST,SPATIAL_V2_OLD,S00_SEARCH,S10_SEARCH_BEST')
        .split(',').map(s => s.trim()).filter(Boolean) as PolicyType[];
    const progressPath = path.join(CONFIRM_DIR, 'progress.jsonl');
    const done = loadProgress(progressPath);
    const t0 = Date.now();
    const maxMs = Number(process.env.V10_COLLECT_MAX_MS || 0);

    for (const policy of policies) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of seeds) {
                const chunkKey = `${policy}|${map.name}|${seed}`;
                if (done.has(chunkKey)) continue;
                if (maxMs > 0 && Date.now() - t0 > maxMs) {
                    console.log('[t10-01-confirm] budget stop; rerun to resume');
                    return;
                }
                console.log('[t10-01-confirm] chunk', chunkKey);
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: 45,
                    maxAtomicSteps: 800,
                    checkpointMap: CONFIRM_CHECKPOINTS,
                    setupForSeed: (s, m) => (s === seed && m === map.name) ? setupForSeed(seed) : undefined,
                    reportPath: path.join(CONFIRM_DIR, 'chunks', `${safeKey(chunkKey)}.json`),
                    directories: { runId: RUN_ID, trajectoryDir: path.join(CONFIRM_DIR, 'trajectories') }
                });
                appendProgress(progressPath, { chunkKey, policy, map: map.name, seed, setup: setupForSeed(seed), outcomes: res.outcomes });
                done.set(chunkKey, true);
            }
        }
    }
    console.log('[t10-01-confirm] complete');
}

function mergeT1001Confirm(): void {
    const records = readUniqueProgress(path.join(CONFIRM_DIR, 'progress.jsonl'));
    const byPolicy: Record<string, any[]> = {};
    for (const o of uniqueOutcomes(records)) (byPolicy[o.candidatePolicy] ||= []).push(o);
    const stats: Record<string, any> = {};
    for (const [policy, outcomes] of Object.entries(byPolicy)) stats[policy] = outcomeStats(outcomes, policy);
    const report = {
        task: 'T10-01-confirmation',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        seedSet: Array.from(new Set(records.map(r => r.seed))).sort((a, b) => a - b),
        setupVariants: SETUP_VARIANTS,
        stats,
        conclusions: {
            purePolicy: (stats['SPATIAL_V2_BEST']?.naturalWinRate ?? 0) > (stats['SPATIAL_V2_OLD']?.naturalWinRate ?? 0)
                ? 'SPATIAL_V2_BEST point-estimate above old model in confirmation.'
                : 'NO confirmed pure-policy improvement: SPATIAL_V2_BEST is not above the old model.',
            search: (stats['S10_SEARCH_BEST']?.naturalWinRate ?? 0) > (stats['S00_SEARCH']?.naturalWinRate ?? 0)
                ? 'S10 point-estimate above S00 in confirmation.'
                : 'NO confirmed search improvement: S10 is not above S00.'
        }
    };
    writeJson(path.join(V10_DIR, 'T10-01_confirmation.json'), report);
    writeJson(path.join(REPORT_DIR, 'T10-01_confirmation.json'), report);
    writeJson(path.join(CONFIRM_DIR, 'outcomes.json'), records.flatMap(r => r.outcomes || []));
    console.log('[t10-01-confirm merge]', JSON.stringify(stats));
}

async function t1003Chunk(): Promise<void> {
    ensureDir(DAGGER_EXTRA_DIR);
    const offset = Number(process.env.V10_DAGGER_CHUNK_OFFSET || 0);
    const count = Number(process.env.V10_DAGGER_CHUNK_COUNT || 64);
    const maxSteps = Number(process.env.V10_DAGGER_MAX_STEPS || 400);
    process.env.V10_DAGGER_MATCH_OFFSET = String(offset);
    process.env.V10_DAGGER_KEEP_ALL = process.env.V10_DAGGER_KEEP_ALL || '1';
    process.env.V10_DAGGER_DIVERGENCE_RATE = process.env.V10_DAGGER_DIVERGENCE_RATE || '1.0';
    process.env.V10_DAGGER_AUDIT_RATE = process.env.V10_DAGGER_AUDIT_RATE || '1.0';
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(BASE_MODEL_PATH, 'utf8')));
    console.log(`[t10-03-chunk] offset=${offset} count=${count} maxSteps=${maxSteps}`);
    const samples = await collectOnPolicySamples(predictor, count, maxSteps);
    const out = path.join(DAGGER_EXTRA_DIR, `chunk_${offset}_${count}.json`);
    writeJson(out, samples);
    console.log(`[t10-03-chunk] wrote ${samples.length} samples -> ${out}`);
}

function mergeT1003Chunks(): void {
    if (!fs.existsSync(DAGGER_EXTRA_DIR)) throw new Error('no dagger_extra directory');
    const files = fs.readdirSync(DAGGER_EXTRA_DIR).filter(f => /^chunk_\d+_\d+\.json$/.test(f)).sort();
    const cap = Number(process.env.V10_DAGGER_MAX_STATES || 4000);
    const byHash = new Map<string, any>();
    let rawSamples = 0;
    for (const file of files) {
        const arr = readJson<any[]>(path.join(DAGGER_EXTRA_DIR, file));
        rawSamples += arr.length;
        console.log(`[t10-03-merge] ${file}: ${arr.length} (raw ${rawSamples}, unique ${byHash.size})`);
        for (const sample of arr) {
            if (!byHash.has(sample.stateHash)) byHash.set(sample.stateHash, sample);
            if (byHash.size >= cap) break;
        }
        if (byHash.size >= cap) break;
    }
    const samples = Array.from(byHash.values());
    const datasetDir = path.join(RUN_DIR, 'dagger_extra/datasets');
    const ckptDir = path.join(RUN_DIR, 'dagger_extra/checkpoints');
    ensureDir(datasetDir); ensureDir(ckptDir);
    const built = buildArmDatasets(samples as any, datasetDir);
    const baseTrainRows = 11011;
    const maxTrainSteps = Number(process.env.V10_DAGGER_MAX_TRAIN_STEPS || Math.max(1, Math.ceil(baseTrainRows / 128)));
    const bModel = path.join(ckptDir, 'spatial_resnet_b_best.json');
    const cModel = path.join(ckptDir, 'spatial_resnet_c_best.json');
    const bMetrics = path.join(ckptDir, 'spatial_resnet_b_metrics.json');
    const cMetrics = path.join(ckptDir, 'spatial_resnet_c_metrics.json');
    const bConsumed = path.join(ckptDir, 'spatial_resnet_b_consumed_samples_manifest.json');
    const cConsumed = path.join(ckptDir, 'spatial_resnet_c_consumed_samples_manifest.json');
    const baseSplit = path.resolve('training_runs/agent_upgrade_20260922_v9_identity_03/split_manifest.json');
    const commonArgs = (dataset: string, outModel: string, outMetrics: string, consumed: string) => [
        '--dataset', dataset,
        '--init-checkpoint', BASE_MODEL_PATH,
        '--split-manifest', baseSplit,
        '--epochs', '1',
        '--batch-size', '128',
        '--lr', '0.0005',
        '--value-weight', '0.0',
        '--seed', '42',
        '--max-steps', String(maxTrainSteps),
        '--model-version', 'spatial-resnet-v2',
        '--num-blocks', '2',
        '--out-model', outModel,
        '--out-metrics', outMetrics,
        '--consumed-manifest', consumed
    ];
    const totalMatches = files.reduce((sum, file) => {
        const match = /^chunk_\d+_(\d+)\.json$/.exec(file);
        return sum + (match ? Number(match[1]) : 0);
    }, 0);
    const sampleBreakdown = {
        critical: samples.filter((s: any) => s.category === 'CRITICAL_TACTICAL').length,
        divergence: samples.filter((s: any) => s.category === 'POLICY_DIVERGENCE').length,
        audit: samples.filter((s: any) => s.category === 'AUDIT_STABILITY').length
    };
    const meta = {
        task: 'T10-03-extra',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        chunkFiles: files,
        rawSamples,
        uniqueSamples: samples.length,
        cap,
        matches: totalMatches,
        maxSteps: Number(process.env.V10_DAGGER_MAX_STEPS || 400),
        samplesCollected: samples.length,
        sampleBreakdown,
        stats: sampleBreakdown,
        datasets: built,
        maxTrainSteps,
        baseModelPath: BASE_MODEL_PATH,
        baseModelSha: getSha256(fs.readFileSync(BASE_MODEL_PATH)),
        baseSplitPath: baseSplit,
        models: { b: bModel, c: cModel },
        metrics: { b: bMetrics, c: cMetrics },
        consumed: { b: bConsumed, c: cConsumed },
        newSampleIdsFile: path.join(datasetDir, 'new_sample_ids.json'),
        jobs: [
            { label: 't10-03-extra-b', script: 'python/train_spatial_resnet.py', args: commonArgs(built.armBPath, bModel, bMetrics, bConsumed), outputs: [bModel, bMetrics, bConsumed] },
            { label: 't10-03-extra-c', script: 'python/train_spatial_resnet.py', args: commonArgs(built.armCPath, cModel, cMetrics, cConsumed), outputs: [cModel, cMetrics, cConsumed] }
        ]
    };
    writeJson(meta.newSampleIdsFile, samples.map((s: any) => s.sampleId));
    writeJson(path.join(V10_DIR, 'T10-03_extra_prepare.json'), meta);
    writeJson(path.join(datasetDir, 't10_03_extra_jobs.json'), meta.jobs);
    console.log('[t10-03-merge]', JSON.stringify({ raw: rawSamples, unique: samples.length, repeat: built.newSampleRepeat, jobs: path.join(datasetDir, 't10_03_extra_jobs.json') }));
}


async function t1004Formal(): Promise<void> {
    ensureDir(T1004_DIR);
    const seeds = parseSeedList(process.env.V10_T10_04_SEEDS || '42,1337,2026,4242', [42, 1337, 2026, 4242]);
    const policies = (process.env.V10_T10_04_POLICIES || 'S00_SEARCH,T10_TURN_SEARCH').split(',').map(s => s.trim()).filter(Boolean) as PolicyType[];
    const progressPath = path.join(T1004_DIR, 'progress.jsonl');
    const done = loadProgress(progressPath);
    const t0 = Date.now();
    const maxMs = Number(process.env.V10_COLLECT_MAX_MS || 0);
    for (const policy of policies) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of seeds) {
                const chunkKey = `${policy}|${map.name}|${seed}|${process.env.V10_T04_PRIOR_MODE || 'off'}`;
                if (done.has(chunkKey)) continue;
                if (maxMs > 0 && Date.now() - t0 > maxMs) {
                    console.log('[t10-04-formal] budget stop; rerun to resume');
                    return;
                }
                console.log('[t10-04-formal] chunk', chunkKey);
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: 45,
                    maxAtomicSteps: 800,
                    setupForSeed: (s, m) => (s === seed && m === map.name) ? setupForSeed(seed) : undefined,
                    reportPath: path.join(T1004_DIR, 'chunks', `${safeKey(chunkKey)}.json`),
                    directories: { runId: RUN_ID, trajectoryDir: path.join(T1004_DIR, 'trajectories') }
                });
                appendProgress(progressPath, { chunkKey, policy, map: map.name, seed, priorMode: process.env.V10_T04_PRIOR_MODE || 'off', outcomes: res.outcomes });
                done.set(chunkKey, true);
            }
        }
    }
    console.log('[t10-04-formal] complete');
}

function mergeT1004Formal(): void {
    const records = readUniqueProgress(path.join(T1004_DIR, 'progress.jsonl'));
    const byPolicy: Record<string, any[]> = {};
    for (const o of uniqueOutcomes(records)) (byPolicy[o.candidatePolicy] ||= []).push(o);
    const stats: Record<string, any> = {};
    for (const [policy, outcomes] of Object.entries(byPolicy)) stats[policy] = outcomeStats(outcomes, policy);
    const report = {
        task: 'T10-04-formal',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        seeds: Array.from(new Set(records.map(r => r.seed))).sort((a, b) => a - b),
        matchesPerArm: stats['S00_SEARCH']?.matches ?? null,
        priorMode: process.env.V10_T04_PRIOR_MODE || 'off',
        stats,
        verdict: (stats['T10_TURN_SEARCH']?.naturalWinRate ?? 0) > (stats['S00_SEARCH']?.naturalWinRate ?? 0)
            ? 'Turn-aware search point-estimate is above S00; check CI and truncation before claiming.'
            : 'Turn-aware search did not beat S00 on this formal development run.'
    };
    writeJson(path.join(V10_DIR, 'T10-04_formal_comparison.json'), report);
    writeJson(path.join(REPORT_DIR, 'T10-04_formal_comparison.json'), report);
    console.log('[t10-04-formal merge]', JSON.stringify(stats));
}

const VALUE_SEARCH_DIR = path.join(RUN_DIR, 'value_search');

async function t1006ValueSearch(): Promise<void> {
    ensureDir(VALUE_SEARCH_DIR);
    const valueModelPath = path.resolve(process.env.V10_VALUE_MODEL_PATH || `training_runs/${RUN_ID}/value_learning_fix/checkpoints/spatial_resnet_cv01.json`);
    if (!fs.existsSync(valueModelPath)) throw new Error(`value search model not found: ${valueModelPath}`);
    const policies = (process.env.V10_T10_06_POLICIES || 'T10_TURN_SEARCH,T10_TURN_SEARCH_VALUE').split(',').map(s => s.trim()).filter(Boolean) as PolicyType[];
    const seeds = parseSeedList(process.env.V10_T10_06_SEEDS || '42,1337', [42, 1337]);
    const progressPath = path.join(VALUE_SEARCH_DIR, 'progress.jsonl');
    const done = loadProgress(progressPath);
    for (const policy of policies) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of seeds) {
                const chunkKey = `${policy}|${map.name}|${seed}`;
                if (done.has(chunkKey)) continue;
                console.log('[t10-06-value-search] chunk', chunkKey);
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: 45,
                    maxAtomicSteps: 800,
                    checkpointMap: { T10_TURN_SEARCH_VALUE: valueModelPath },
                    setupForSeed: (s, m) => (s === seed && m === map.name) ? setupForSeed(seed) : undefined,
                    reportPath: path.join(VALUE_SEARCH_DIR, 'chunks', `${safeKey(chunkKey)}.json`),
                    directories: { runId: RUN_ID, trajectoryDir: path.join(VALUE_SEARCH_DIR, 'trajectories') }
                });
                appendProgress(progressPath, { chunkKey, policy, map: map.name, seed, valueModelPath, outcomes: res.outcomes });
                done.set(chunkKey, true);
            }
        }
    }
    console.log('[t10-06-value-search] complete');
}

function mergeT1006ValueSearch(): void {
    const records = readUniqueProgress(path.join(VALUE_SEARCH_DIR, 'progress.jsonl'));
    const byPolicy: Record<string, any[]> = {};
    for (const o of uniqueOutcomes(records)) (byPolicy[o.candidatePolicy] ||= []).push(o);
    const stats: Record<string, any> = {};
    for (const [policy, outcomes] of Object.entries(byPolicy)) stats[policy] = outcomeStats(outcomes, policy);
    const off = stats['T10_TURN_SEARCH'];
    const on = stats['T10_TURN_SEARCH_VALUE'];
    const report = {
        task: 'T10-06-value-search',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        seeds: Array.from(new Set(records.map(r => r.seed))).sort((a, b) => a - b),
        matchesPerArm: off?.matches ?? null,
        model: records[0]?.valueModelPath ?? null,
        stats,
        verdict: on && off && (on.naturalWinRate ?? 0) > (off.naturalWinRate ?? 0)
            ? 'Value-in-search point-estimate above search-off; diagnostic only because value head is unqualified.'
            : 'Value-in-search did not beat search-off in this diagnostic run; keep value out of production search.'
    };
    writeJson(path.join(V10_DIR, 'T10-06_search_value_comparison.json'), report);
    writeJson(path.join(REPORT_DIR, 'T10-06_search_value_comparison.json'), report);
    console.log('[t10-06-value-search merge]', JSON.stringify(stats));
}

const VALUE_EXTRA_DIR = path.join(RUN_DIR, 'value_extra');

async function t1002ValueExtra(): Promise<void> {
    ensureDir(VALUE_EXTRA_DIR);
    const policies = (process.env.V10_VALUE_EXTRA_POLICIES || 'SPATIAL_V2_BEST').split(',').map(s => s.trim()).filter(Boolean) as PolicyType[];
    const seeds = parseSeedList(process.env.V10_VALUE_EXTRA_SEEDS || '1010,1011,1012,1013,1014,1015,1016,1017,1018,1019', [1010]);
    const progressPath = process.env.V10_VALUE_EXTRA_PROGRESS || path.join(VALUE_EXTRA_DIR, 'progress.jsonl');
    const done = loadProgress(progressPath);
    const t0 = Date.now();
    const maxMs = Number(process.env.V10_COLLECT_MAX_MS || 0);
    for (const policy of policies) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of seeds) {
                const chunkKey = `${policy}|${map.name}|${seed}`;
                if (done.has(chunkKey)) continue;
                if (maxMs > 0 && Date.now() - t0 > maxMs) {
                    console.log('[t10-02-value-extra] budget stop');
                    return;
                }
                console.log('[t10-02-value-extra] chunk', chunkKey);
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: 45,
                    maxAtomicSteps: 800,
                    checkpointMap: CONFIRM_CHECKPOINTS,
                    // Deliberately no setup variants: these episodes must be
                    // reconstructable by the value extractor with default setup.
                    reportPath: path.join(VALUE_EXTRA_DIR, 'chunks', `${safeKey(chunkKey)}.json`),
                    directories: { runId: RUN_ID, trajectoryDir: path.join(VALUE_EXTRA_DIR, 'trajectories') }
                });
                appendProgress(progressPath, { chunkKey, policy, map: map.name, seed, outcomes: res.outcomes });
                done.set(chunkKey, true);
            }
        }
    }
    console.log('[t10-02-value-extra] complete');
}

async function main(): Promise<void> {
    const cmd = process.argv[2];
    if (cmd === 't10-01-confirm') return t1001Confirm();
    if (cmd === 'merge-t10-01-confirm') return mergeT1001Confirm();
    if (cmd === 't10-03-chunk') return t1003Chunk();
    if (cmd === 'merge-t10-03-chunks') return mergeT1003Chunks();
    if (cmd === 't10-04-formal') return t1004Formal();
    if (cmd === 'merge-t10-04-formal') return mergeT1004Formal();
    if (cmd === 't10-06-value-search') return t1006ValueSearch();
    if (cmd === 'merge-t10-06-value-search') return mergeT1006ValueSearch();
    if (cmd === 't10-02-value-extra') return t1002ValueExtra();
    throw new Error(`Unknown collector command: ${cmd}`);
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
