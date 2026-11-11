/**
 * T12-05 — verified-replay pilot over the legacy SD episode archive.
 *
 * Question: how much of `training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced`
 * is actually reconstructible from the data on disk, and what does one verified
 * replay cost per episode?
 *
 * This script does NOT reimplement replay verification. It reuses
 * `tools/skirmish_dataset_export.ts`:
 *   - `createDefaultEnvFactory(unpackDir, sdTrainingPlanFile)` — the exact env
 *     factory the dataset exporter uses (SDPLAN scenario ids are resolved from
 *     `episode.scenario.id` + the SD training-plan config file).
 *   - `replayEpisodeDatasetItems(episode, env, options)` — the verifying
 *     generator (initial observation hash + per-step actionCode/reward/done/winner
 *     assertions). It THROWS on any mismatch.
 *
 * Sampled episodes are indexed once (byte offsets of every record), then replayed
 * in round-robin rank order across files, so a budget stop leaves a sample that
 * is still proportional across archive variants.
 *
 * Usage (see v12/tools/run-tool.mjs for why the v12 runner, and why the legacy
 * OpenSSL provider is needed to read the encrypted .aem map assets):
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/replay_pilot.ts \
 *     [--target 100] [--budget-ms 2400000] [--seed 20260923] \
 *     [--episode-timeout-ms 600000] [--out-dir v12/out/replay] [--no-write] [--quiet]
 *
 * Outputs (unless --no-write):
 *   v12/out/replay/sd_replay_pilot.json
 *   v12/out/replay/T12-05_report.md
 */
import { createReadStream, existsSync } from 'node:fs';
import { appendFile, mkdir, open, readFile, stat, writeFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import {
    createDefaultEnvFactory,
    replayEpisodeDatasetItems
} from '../../tools/skirmish_dataset_export';
import {
    getSdTrainingPlanEntry,
    loadSdTrainingPlanConfig,
    parseSdPlanScenarioId,
    type SdTrainingPlanConfig
} from '../../tools/sd_training_state_generator';
import type { SkirmishEpisodeRecord } from '../../tools/skirmish_training_runner';
import type { AncientEmpiresEnv } from '../../src/game/env';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface PilotOptions {
    target: number;
    budgetMs: number;
    seed: number;
    episodeTimeoutMs: number;
    outDir: string;
    write: boolean;
    quiet: boolean;
    recomputeReport: string | null;
    census: boolean;
    resumeFrom: string | null;
}

function parseArgs(argv: readonly string[]): PilotOptions {
    const options: PilotOptions = {
        target: 100,
        budgetMs: 40 * 60 * 1000,
        seed: 20260923,
        episodeTimeoutMs: 600_000,
        outDir: path.resolve(process.cwd(), 'v12', 'out', 'replay'),
        write: true,
        quiet: false,
        recomputeReport: null,
        census: false,
        resumeFrom: null
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (!value) throw new Error(`${arg} 缺少参数`);
            return value;
        };
        if (arg === '--target') options.target = Number(next());
        else if (arg === '--budget-ms') options.budgetMs = Number(next());
        else if (arg === '--seed') options.seed = Number(next());
        else if (arg === '--episode-timeout-ms') options.episodeTimeoutMs = Number(next());
        else if (arg === '--out-dir') options.outDir = path.resolve(next());
        else if (arg === '--recompute-report') options.recomputeReport = next();
        else if (arg === '--census') options.census = true;
        else if (arg === '--resume') options.resumeFrom = next();
        else if (arg === '--no-write') options.write = false;
        else if (arg === '--quiet') options.quiet = true;
        else throw new Error(`未知参数: ${arg}`);
    }
    if (!Number.isInteger(options.target) || options.target <= 0) throw new Error('--target 必须是正整数');
    return options;
}

// ---------------------------------------------------------------------------
// Archive description. The claimed line counts come from the T12-05 brief; they
// are re-measured by indexing every file and reported as `measuredLineCounts`.
// ---------------------------------------------------------------------------

const ARCHIVE_DIR = path.resolve(
    process.cwd(),
    'training_runs',
    'episodes',
    'sd_training_plan_20260705_heuristic-apk-like-balanced'
);

const CLAIMED_LINE_COUNTS: Record<string, number> = {
    'sd-normal-episodes.jsonl': 400,
    'sd-high-gold-episodes.jsonl': 100,
    'sd-low-gold-episodes.jsonl': 100,
    'sd-low-unit-limit-episodes.jsonl': 100,
    'sd-high-unit-limit-episodes.jsonl': 100,
    'sd-3p-normal-extra-episodes.jsonl': 160,
    'sd-3p-high-gold-extra-episodes.jsonl': 60,
    'sd-3p-low-unit-extra-episodes.jsonl': 60,
    'sd-4p-normal-extra-episodes.jsonl': 35,
    'sd-small-advantage-endgame-episodes.jsonl': 140,
    'sd-medium-advantage-endgame-episodes.jsonl': 140
};

const SD_PLAN_FILE = path.resolve(process.cwd(), 'training_configs', 'sd_training_plan_20260705.json');
const UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');

// ---------------------------------------------------------------------------
// Deterministic sampling
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash32(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

interface FilePlan {
    file: string;
    claimedLineCount: number;
    sampleCount: number;
    offset: number;
    lineIndexes: number[];
}

/**
 * Stratified sample proportional to claimed line count:
 *  1. largest-remainder allocation of `target` across files;
 *  2. inside a file, an evenly spaced stride `floor(((j + u_f) / k_f) * n_f)`
 *     with a per-file offset `u_f` seeded from (fileName, seed).
 * Reproducible from (target, seed, claimed line counts) alone.
 */
function planSample(files: readonly string[], target: number, seed: number): FilePlan[] {
    const total = files.reduce((sum, file) => sum + CLAIMED_LINE_COUNTS[file], 0);
    const exact = files.map(file => (target * CLAIMED_LINE_COUNTS[file]) / total);
    const counts = exact.map(value => Math.floor(value));
    let remaining = target - counts.reduce((sum, value) => sum + value, 0);
    const order = exact
        .map((value, index) => ({ index, frac: value - Math.floor(value), file: files[index] }))
        .sort((a, b) => (b.frac - a.frac) || a.file.localeCompare(b.file));
    for (const item of order) {
        if (remaining <= 0) break;
        counts[item.index] += 1;
        remaining -= 1;
    }

    return files.map((file, index) => {
        const sampleCount = counts[index];
        const lineCount = CLAIMED_LINE_COUNTS[file];
        const offset = mulberry32((hash32(file) ^ seed) >>> 0)();
        const lineIndexes: number[] = [];
        for (let j = 0; j < sampleCount; j += 1) {
            const idx = Math.floor(((j + offset) / sampleCount) * lineCount);
            lineIndexes.push(Math.min(idx, lineCount - 1));
        }
        return { file, claimedLineCount: lineCount, sampleCount, offset, lineIndexes };
    });
}

/** Interleave the sample by rank so early truncation stays proportional. */
function roundRobinWorkList(plans: readonly FilePlan[]): Array<{ file: string; lineIndex: number; rank: number }> {
    const files = plans.map(plan => plan.file).sort((a, b) => a.localeCompare(b));
    const byFile = new Map(plans.map(plan => [plan.file, plan]));
    const maxRank = Math.max(0, ...plans.map(plan => plan.sampleCount));
    const work: Array<{ file: string; lineIndex: number; rank: number }> = [];
    for (let rank = 0; rank < maxRank; rank += 1) {
        for (const file of files) {
            const plan = byFile.get(file);
            if (!plan || rank >= plan.lineIndexes.length) continue;
            work.push({ file, lineIndex: plan.lineIndexes[rank], rank });
        }
    }
    return work;
}

// ---------------------------------------------------------------------------
// JSONL byte-offset index
//
// The archive is ~3.3 GB total and one file is ~1 GB: reading every line to find
// a few of them would dominate the run. Instead each file is scanned once for
// record boundaries (non-empty lines, matching `parseEpisodeJsonl` indexing) and
// individual records are then read by byte range.
// ---------------------------------------------------------------------------

interface FileIndex {
    file: string;
    bytes: number;
    physicalLines: number;
    lineCount: number;
    starts: number[];
    ends: number[];
    indexMs: number;
}

function isBlank(buffer: Buffer): boolean {
    for (let i = 0; i < buffer.length; i += 1) {
        const byte = buffer[i];
        if (byte !== 13 && byte !== 10 && byte !== 32 && byte !== 9) return false;
    }
    return true;
}

async function indexFile(file: string): Promise<FileIndex> {
    const startedAt = Date.now();
    const filePath = path.join(ARCHIVE_DIR, file);
    const bytes = (await stat(filePath)).size;
    const starts: number[] = [];
    const ends: number[] = [];
    let physicalLines = 0;
    let lineStart = 0;
    let offset = 0;
    let hasContent = false;

    for await (const chunk of createReadStream(filePath, { highWaterMark: 1 << 23 })) {
        const buffer = chunk as Buffer;
        let pos = 0;
        while (pos < buffer.length) {
            const nl = buffer.indexOf(10, pos);
            if (nl === -1) {
                const slice = buffer.subarray(pos);
                if (!hasContent && !isBlank(slice)) hasContent = true;
                break;
            }
            const slice = buffer.subarray(pos, nl);
            if (!hasContent && !isBlank(slice)) hasContent = true;
            physicalLines += 1;
            if (hasContent) {
                starts.push(lineStart);
                ends.push(offset + nl);
            }
            lineStart = offset + nl + 1;
            hasContent = false;
            pos = nl + 1;
        }
        offset += buffer.length;
    }
    if (hasContent) {
        physicalLines += 1;
        starts.push(lineStart);
        ends.push(bytes);
    }

    return {
        file,
        bytes,
        physicalLines,
        lineCount: starts.length,
        starts,
        ends,
        indexMs: Date.now() - startedAt
    };
}

async function readRecord(handle: FileHandle, index: FileIndex, lineIndex: number): Promise<SkirmishEpisodeRecord> {
    const start = index.starts[lineIndex];
    const end = index.ends[lineIndex];
    const length = end - start;
    const buffer = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
        const result = await handle.read(buffer, read, length - read, start + read);
        if (result.bytesRead === 0) throw new Error(`读取 ${index.file}:${lineIndex} 时提前 EOF`);
        read += result.bytesRead;
    }
    const parsed = JSON.parse(buffer.toString('utf8').trim()) as SkirmishEpisodeRecord;
    if (parsed.kind !== 'skirmish_episode') {
        throw new Error(`${index.file}:${lineIndex} 不是 skirmish_episode 记录: kind=${String((parsed as { kind?: unknown }).kind)}`);
    }
    return parsed;
}

// ---------------------------------------------------------------------------
// Error categorisation
// ---------------------------------------------------------------------------

class PilotTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PilotTimeoutError';
    }
}

const ERROR_CATEGORIES: Array<{ category: string; pattern: RegExp }> = [
    { category: 'env-setup-openssl-legacy-provider', pattern: /legacy provider/ },
    { category: 'env-setup-missing-sd-plan', pattern: /请提供 --sd-training-plan/ },
    { category: 'env-setup-unknown-scenario', pattern: /未知 APK skirmish 训练场景|未知 SD 训练地图场景/ },
    { category: 'env-setup-unknown-plan', pattern: /找不到 SD 训练方案/ },
    { category: 'env-setup-map-load', pattern: /(读取|地图|map|ENOENT|no such file)/i },
    { category: 'initial-observation-hash-mismatch', pattern: /初始 observation hash 不一致/ },
    { category: 'initial-legal-action-count-mismatch', pattern: /初始合法动作数不一致/ },
    { category: 'initial-fixed-action-space-size-mismatch', pattern: /固定动作空间大小不一致/ },
    { category: 'step-before-terminal', pattern: /步前环境已终局/ },
    { category: 'step-logged-illegal-action', pattern: /是非法动作/ },
    { category: 'step-player-mismatch', pattern: /步玩家错位/ },
    { category: 'step-turn-mismatch', pattern: /步回合错位/ },
    { category: 'step-legal-action-count-mismatch', pattern: /步合法动作数错位/ },
    { category: 'step-fixed-legal-action-count-mismatch', pattern: /步固定合法动作数错位/ },
    { category: 'step-index-discontinuity', pattern: /step 序号不连续/ },
    { category: 'step-fixed-action-index-invalid', pattern: /步固定动作索引不合法/ },
    { category: 'step-action-code-mismatch', pattern: /步动作编码错位/ },
    { category: 'step-reward-mismatch', pattern: /步 reward 错位/ },
    { category: 'step-done-mismatch', pattern: /步 done 错位/ },
    { category: 'step-winner-mismatch', pattern: /步 winner 错位/ }
];

function categoriseError(message: string): string {
    for (const entry of ERROR_CATEGORIES) {
        if (entry.pattern.test(message)) return entry.category;
    }
    return 'other';
}

function parseFailureStep(message: string): number | null {
    const match = message.match(/第 (\d+) 步/);
    return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Negative control: prove the reused gate is live (not vacuously passing) by
// replaying one record with deliberately corrupted fields. Runs on in-memory
// copies only — nothing under training_runs/episodes is ever written.
// ---------------------------------------------------------------------------

interface NegativeControlResult {
    mutation: string;
    expectedCategory: string;
    observedCategory: string | null;
    threw: boolean;
    asExpected: boolean;
    message: string | null;
    elapsedMs: number;
}

async function runNegativeControl(
    record: SkirmishEpisodeRecord,
    envFactory: { createEnv(episode: SkirmishEpisodeRecord): Promise<AncientEmpiresEnv> | AncientEmpiresEnv },
    measureOne: (record: SkirmishEpisodeRecord, env: AncientEmpiresEnv) => string | null
): Promise<NegativeControlResult[]> {
    const outcomes: NegativeControlResult[] = [];
    const stepIndex = record.steps.length > 0 ? 0 : -1;

    const mutations: Array<{ name: string; expected: string; apply: (copy: SkirmishEpisodeRecord) => void }> = [
        {
            name: 'corrupt initialObservationHash',
            expected: 'initial-observation-hash-mismatch',
            apply: copy => {
                copy.initialObservationHash = 'deadbeef'.repeat(8);
            }
        },
        {
            name: 'corrupt steps[0].actionCode',
            expected: 'step-action-code-mismatch',
            apply: copy => {
                if (stepIndex >= 0) copy.steps[stepIndex].actionCode = 'MUTATED::NOT::A::REAL::CODE';
            }
        },
        {
            name: 'corrupt steps[0].reward (+1)',
            expected: 'step-reward-mismatch',
            apply: copy => {
                if (stepIndex >= 0) copy.steps[stepIndex].reward = copy.steps[stepIndex].reward + 1;
            }
        },
        {
            name: 'corrupt steps[0].winnerAfter',
            expected: 'step-winner-mismatch',
            apply: copy => {
                if (stepIndex >= 0) {
                    copy.steps[stepIndex].winnerAfter = (copy.steps[stepIndex].winnerAfter ?? null) === null
                        ? 999
                        : null;
                }
            }
        }
    ];

    for (const mutation of mutations) {
        const copy = JSON.parse(JSON.stringify(record)) as SkirmishEpisodeRecord;
        mutation.apply(copy);
        const startedAt = Date.now();
        const message = await measureOne(copy, await envFactory.createEnv(copy));
        const category = message === null ? null : categoriseError(message);
        outcomes.push({
            mutation: mutation.name,
            expectedCategory: mutation.expected,
            observedCategory: category,
            threw: message !== null,
            asExpected: category === mutation.expected,
            message,
            elapsedMs: Date.now() - startedAt
        });
    }
    return outcomes;
}

function measureFirstFailure(record: SkirmishEpisodeRecord, env: AncientEmpiresEnv): string | null {
    const gen = replayEpisodeDatasetItems(record, env, { observationMode: 'none' });
    try {
        while (!gen.next().done) { /* drain */ }
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

// ---------------------------------------------------------------------------
// Git revision (no child_process: the sandbox denies process creation)
// ---------------------------------------------------------------------------

async function readGitRevision(): Promise<string> {
    try {
        const gitDir = path.resolve(process.cwd(), '.git');
        const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
        if (!head.startsWith('ref: ')) return head.slice(0, 12);
        const refPath = path.join(gitDir, head.slice(5).trim());
        if (existsSync(refPath)) return (await readFile(refPath, 'utf8')).trim().slice(0, 12);
        const packed = await readFile(path.join(gitDir, 'packed-refs'), 'utf8');
        const line = packed.split(/\r?\n/).find(item => item.endsWith(head.slice(5).trim()));
        return line ? line.slice(0, 12) : 'unknown';
    } catch {
        return 'unknown';
    }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

type Outcome = 'PASS' | 'THROW' | 'TIMEOUT';

interface EpisodeResult {
    file: string;
    lineIndex: number;
    rank: number;
    scenarioId: string | null;
    planId: string | null;
    planKind: string | null;
    planSetup: { initialGold: number; unitLimit: number; levelCap: number } | null;
    mapScenarioId: string | null;
    seed: number | null;
    maxPlies: number | null;
    stepCount: number | null;
    playerCount: number | null;
    loggedSummary: {
        timeout: boolean | null;
        stoppedByMaxSteps: boolean | null;
        illegalActionCount: number | null;
        finalTurn: number | null;
    };
    outcome: Outcome;
    errorCategory: string | null;
    errorMessage: string | null;
    failureStep: number | null;
    failurePhase: 'env-setup' | 'record-read' | 'reset' | 'pre-step-assert' | 'transition-assert' | null;
    stepsYielded: number;
    elapsedMs: number;
    envSetupMs: number | null;
    stepsPerSecond: number | null;
}

function blankResult(file: string, lineIndex: number, rank: number): EpisodeResult {
    return {
        file,
        lineIndex,
        rank,
        scenarioId: null,
        planId: null,
        planKind: null,
        planSetup: null,
        mapScenarioId: null,
        seed: null,
        maxPlies: null,
        stepCount: null,
        playerCount: null,
        loggedSummary: {
            timeout: null,
            stoppedByMaxSteps: null,
            illegalActionCount: null,
            finalTurn: null
        },
        outcome: 'THROW',
        errorCategory: null,
        errorMessage: null,
        failureStep: null,
        failurePhase: null,
        stepsYielded: 0,
        elapsedMs: 0,
        envSetupMs: null,
        stepsPerSecond: null
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    // Census-only mode: measure the archive's true step total (no replay).
    if (options.census) {
        await runCensus(options);
        return;
    }

    // Reporting-only mode: rebuild summary + report from an existing pilot JSON
    // without replaying anything (used to re-render the report after the run).
    if (options.recomputeReport) {
        await runRecompute(options, options.recomputeReport);
        return;
    }

    const startedAt = Date.now();
    const revision = await readGitRevision();
    const legacyProvider = process.execArgv.some(arg => arg.includes('openssl-legacy-provider'));

    const allFiles = Object.keys(CLAIMED_LINE_COUNTS);
    const files = allFiles.filter(file => existsSync(path.join(ARCHIVE_DIR, file)));
    const missingFiles = allFiles.filter(file => !existsSync(path.join(ARCHIVE_DIR, file)));

    if (!existsSync(SD_PLAN_FILE)) throw new Error(`SD 训练计划缺失: ${SD_PLAN_FILE}`);
    if (!existsSync(UNPACK_DIR)) throw new Error(`APK 解包目录缺失: ${UNPACK_DIR}`);

    const plans = planSample(files, options.target, options.seed);
    const plannedWork = roundRobinWorkList(plans);
    const totalClaimed = files.reduce((sum, file) => sum + CLAIMED_LINE_COUNTS[file], 0);

    // Optional resume: finish the episodes a previous run left un-attempted and
    // merge its measured results into this run's payload. The previously
    // un-attempted list is checked against the freshly computed plan, which also
    // serves as a determinism check on the stratified sample selection.
    let pendingWork = plannedWork;
    let priorResults: EpisodeResult[] = [];
    let resumeInfo: {
        resumedFrom: string;
        priorAttempted: number;
        priorPassed: number;
        priorWallClockMs: number | null;
        pendingCount: number;
        planSelectionMatched: boolean;
        unmatchedNotAttempted: number;
    } | null = null;
    if (options.resumeFrom) {
        const resumePath = path.resolve(options.resumeFrom);
        const previous = JSON.parse(await readFile(resumePath, 'utf8')) as PilotPayload;
        priorResults = (previous.results ?? []) as EpisodeResult[];
        const planKeys = new Set(plannedWork.map(item => `${item.file}:${item.lineIndex}:${item.rank}`));
        const wantedKeys = new Set<string>();
        let unmatched = 0;
        for (const item of (previous.notAttempted ?? [])) {
            const planKey = `${item.file}:${item.lineIndex}:${item.rank}`;
            if (planKeys.has(planKey)) wantedKeys.add(`${item.file}:${item.lineIndex}`);
            else unmatched += 1;
        }
        pendingWork = plannedWork.filter(item => wantedKeys.has(`${item.file}:${item.lineIndex}`));
        resumeInfo = {
            resumedFrom: path.relative(process.cwd(), resumePath).replace(/\\/g, '/'),
            priorAttempted: priorResults.length,
            priorPassed: priorResults.filter(result => result.outcome === 'PASS').length,
            priorWallClockMs: previous.summary?.wallClockMs ?? null,
            pendingCount: pendingWork.length,
            planSelectionMatched: unmatched === 0,
            unmatchedNotAttempted: unmatched
        };
        console.log(
            `-- resume: ${resumeInfo.priorAttempted} prior results, ${pendingWork.length} pending, ` +
            `plan selection ${resumeInfo.planSelectionMatched ? 'matches (deterministic)' : `MISMATCH x${unmatched}`}`
        );
    }

    const sdConfig: SdTrainingPlanConfig = await loadSdTrainingPlanConfig(SD_PLAN_FILE);
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    // ---- phase 1: index record boundaries (fixed I/O cost) ----------------
    const indexStartedAt = Date.now();
    const indexes = new Map<string, FileIndex>();
    for (const file of files) {
        const index = await indexFile(file);
        indexes.set(file, index);
        if (!options.quiet) {
            console.log(
                `-- indexed ${file}: ${index.lineCount} records / ${index.physicalLines} physical lines ` +
                `(${index.bytes} bytes) in ${index.indexMs}ms`
            );
        }
    }
    const indexMs = Date.now() - indexStartedAt;

    // ---- phase 2: verified replay -----------------------------------------
    const results: EpisodeResult[] = [...priorResults];
    const handles = new Map<string, FileHandle>();
    for (const file of files) handles.set(file, await open(path.join(ARCHIVE_DIR, file), 'r'));

    // Crash-proof progress log: every finished episode (and the negative
    // control) is appended as its own JSON line, so a failure while assembling
    // the final summary can never discard measured results.
    const progressPath = path.join(options.outDir, 'sd_replay_pilot.results.jsonl');
    if (options.write) {
        await mkdir(options.outDir, { recursive: true });
        await writeFile(progressPath, '', 'utf8');
    }
    const logProgress = async (entry: unknown) => {
        if (!options.write) return;
        await appendFile(progressPath, `${JSON.stringify(entry)}\n`, 'utf8');
    };

    let attempted = priorResults.length;
    let passed = 0;
    let thrown = 0;
    let timedOut = 0;
    let totalStepsReplayed = 0;
    let totalReplayMs = 0;
    let totalPassedSteps = 0;
    let totalPassedMs = 0;
    let budgetExhausted = false;
    // Declared OUTSIDE the try block: the summary object below is built after the
    // try/catch closes, so a block-scoped declaration here is a runtime
    // ReferenceError (and a tsc error at the `results:` assignment).
    let negativeControl: NegativeControlResult[] = [];

    try {
        // ---- phase 2a: negative control on the first pending episode -------
        const controlItem = pendingWork[0] ?? plannedWork[0];
        if (controlItem) {
            try {
                const controlRecord = await readRecord(
                    handles.get(controlItem.file) as FileHandle,
                    indexes.get(controlItem.file) as FileIndex,
                    controlItem.lineIndex
                );
                negativeControl = await runNegativeControl(controlRecord, envFactory, measureFirstFailure);
                await logProgress({
                    kind: 'negative_control',
                    file: controlItem.file,
                    lineIndex: controlItem.lineIndex,
                    results: negativeControl
                });
                if (!options.quiet) {
                    for (const item of negativeControl) {
                        console.log(
                            `-- negative-control ${item.mutation}: threw=${item.threw} ` +
                            `category=${item.observedCategory ?? 'NULL (gate did not fire!)'} expected=${item.expectedCategory}`
                        );
                    }
                }
            } catch (error) {
                if (!options.quiet) {
                    console.log(`-- negative-control failed to run: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        // ---- phase 2b: verified replay ------------------------------------
        for (const item of pendingWork) {
            if (Date.now() - startedAt > options.budgetMs) {
                budgetExhausted = true;
                break;
            }
            attempted += 1;
            const base = blankResult(item.file, item.lineIndex, item.rank);
            const t0 = Date.now();
            let record: SkirmishEpisodeRecord;
            try {
                record = await readRecord(handles.get(item.file) as FileHandle, indexes.get(item.file) as FileIndex, item.lineIndex);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                base.outcome = 'THROW';
                base.failurePhase = 'record-read';
                base.errorCategory = 'json-record-invalid';
                base.errorMessage = message;
                base.elapsedMs = Date.now() - t0;
                results.push(base);
                thrown += 1;
                await logProgress({ kind: 'episode_result', ...base });
                continue;
            }

            const derived = parseSdPlanScenarioId(record.scenario.id);
            base.scenarioId = record.scenario?.id ?? null;
            base.planId = derived?.planId ?? null;
            base.mapScenarioId = derived ? `SD:${derived.mapName}` : null;
            base.seed = record.seed;
            base.maxPlies = record.maxPlies;
            base.stepCount = record.steps?.length ?? null;
            base.playerCount = record.players?.length ?? null;
            base.loggedSummary = {
                timeout: record.summary?.timeout ?? null,
                stoppedByMaxSteps: record.summary?.stoppedByMaxSteps ?? null,
                illegalActionCount: record.summary?.illegalActionCount ?? null,
                finalTurn: record.summary?.finalTurn ?? null
            };
            if (derived) {
                try {
                    const entry = getSdTrainingPlanEntry(sdConfig, derived.planId);
                    base.planKind = entry.kind;
                    base.planSetup = {
                        initialGold: entry.setup?.initialGold ?? sdConfig.defaults.setup.initialGold,
                        unitLimit: entry.setup?.unitLimit ?? sdConfig.defaults.setup.unitLimit,
                        levelCap: entry.setup?.levelCap ?? sdConfig.defaults.setup.levelCap
                    };
                } catch {
                    base.planKind = null;
                }
            }

            const setupStartedAt = Date.now();
            let env: AncientEmpiresEnv;
            try {
                env = await envFactory.createEnv(record);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                base.outcome = 'THROW';
                base.failurePhase = 'env-setup';
                base.errorCategory = categoriseError(message);
                base.errorMessage = message;
                base.envSetupMs = Date.now() - setupStartedAt;
                base.elapsedMs = Date.now() - t0;
                results.push(base);
                thrown += 1;
                totalReplayMs += base.elapsedMs;
                await logProgress({ kind: 'episode_result', ...base });
                continue;
            }
            base.envSetupMs = Date.now() - setupStartedAt;

            const gen = replayEpisodeDatasetItems(record, env, {
                observationMode: 'none',
                inputFile: item.file,
                episodeIndex: item.lineIndex
            });
            const deadline = Date.now() + options.episodeTimeoutMs;
            let yielded = 0;
            try {
                while (true) {
                    const next = gen.next();
                    if (next.done) break;
                    yielded += 1;
                    if (Date.now() > deadline) {
                        throw new PilotTimeoutError(
                            `${record.scenario.id} seed=${record.seed} 单 episode 超过 ${options.episodeTimeoutMs}ms 上限`
                        );
                    }
                }
                base.outcome = 'PASS';
                base.stepsYielded = yielded;
                passed += 1;
            } catch (error) {
                base.stepsYielded = yielded;
                if (error instanceof PilotTimeoutError) {
                    base.outcome = 'TIMEOUT';
                    base.errorCategory = 'episode-wall-clock-timeout';
                    base.errorMessage = error.message;
                    timedOut += 1;
                } else {
                    const message = error instanceof Error ? error.message : String(error);
                    base.outcome = 'THROW';
                    base.errorCategory = categoriseError(message);
                    base.errorMessage = message;
                    base.failureStep = parseFailureStep(message);
                    base.failurePhase = yielded === 0
                        ? 'reset'
                        : (base.failureStep !== null && base.failureStep > yielded
                            ? 'pre-step-assert'
                            : 'transition-assert');
                    thrown += 1;
                }
            }
            base.elapsedMs = Date.now() - t0;
            base.stepsPerSecond = base.elapsedMs > 0
                ? Number(((yielded / base.elapsedMs) * 1000).toFixed(2))
                : null;
            totalReplayMs += base.elapsedMs;
            totalStepsReplayed += yielded;
            if (base.outcome === 'PASS') {
                totalPassedMs += base.elapsedMs;
                totalPassedSteps += yielded;
            }
            results.push(base);
            await logProgress({ kind: 'episode_result', ...base });
            if (!options.quiet) {
                console.log(
                    `[${attempted}/${plannedWork.length}] ${item.file}:${item.lineIndex} ${base.outcome} ` +
                    `steps=${yielded}/${base.stepCount ?? '?'} ${base.elapsedMs}ms` +
                    `${base.errorCategory ? ` ${base.errorCategory}` : ''}`
                );
            }
        }
    } finally {
        for (const handle of handles.values()) await handle.close();
    }

    const wallClockMs = Date.now() - startedAt;
    const attemptedKeys = new Set(results.map(result => `${result.file}:${result.lineIndex}`));
    const notAttempted = plannedWork
        .filter(item => !attemptedKeys.has(`${item.file}:${item.lineIndex}`))
        .map(item => ({ file: item.file, lineIndex: item.lineIndex, rank: item.rank }));

    await finalizePayload({
        options,
        revision,
        legacyProvider,
        plans,
        plannedSampleCount: plannedWork.length,
        totalClaimed,
        missingFiles,
        measuredLineCounts: Object.fromEntries([...indexes].map(([file, index]) => [file, index.lineCount])),
        measuredPhysicalLines: Object.fromEntries([...indexes].map(([file, index]) => [file, index.physicalLines])),
        fileBytes: Object.fromEntries([...indexes].map(([file, index]) => [file, index.bytes])),
        archiveBytesTotal: [...indexes.values()].reduce((sum, index) => sum + index.bytes, 0),
        indexMs,
        wallClockMs,
        budgetExhausted,
        results,
        negativeControl,
        notAttempted,
        sdConfig,
        recomputedFrom: null,
        resumeInfo
    });
}

/**
 * Rebuild the summary + report from an already-written pilot JSON. This exists so
 * the reporting/aggregation code can be re-run — e.g. to add a mean-vs-median
 * projection range — WITHOUT replaying episodes again. It recomputes every
 * aggregate from `results`, so nothing is carried over on trust.
 */
async function runRecompute(options: PilotOptions, jsonPath: string) {
    const raw = await readFile(path.resolve(jsonPath), 'utf8');
    const payload = JSON.parse(raw) as PilotPayload;
    const summary = payload.summary;
    const allocation = (summary.samplingRule?.allocation ?? []) as Array<{
        file: string;
        claimedLineCount: number;
        sampleCount: number;
        offset: number;
        lineIndexes: number[];
    }>;
    const plans: FilePlan[] = allocation.map(item => ({
        file: item.file,
        claimedLineCount: item.claimedLineCount,
        sampleCount: item.sampleCount,
        offset: item.offset,
        lineIndexes: item.lineIndexes
    }));
    const sdConfig = existsSync(SD_PLAN_FILE) ? await loadSdTrainingPlanConfig(SD_PLAN_FILE) : null;
    await finalizePayload({
        options: {
            ...options,
            target: summary.samplingRule?.target ?? options.target,
            budgetMs: summary.budgetMs ?? options.budgetMs,
            seed: summary.samplingRule?.seed ?? options.seed,
            episodeTimeoutMs: summary.episodeTimeoutMs ?? options.episodeTimeoutMs
        },
        revision: summary.revision ?? 'unknown',
        legacyProvider: Boolean(summary.legacyOpensslProvider),
        plans,
        plannedSampleCount: summary.samplingRule?.plannedSampleCount ?? allocation.reduce((sum, item) => sum + item.sampleCount, 0),
        totalClaimed: summary.samplingRule?.claimedTotalLines ?? 1395,
        missingFiles: summary.missingFiles ?? [],
        measuredLineCounts: summary.measuredLineCounts ?? {},
        measuredPhysicalLines: summary.measuredPhysicalLines ?? {},
        fileBytes: summary.fileBytes ?? {},
        archiveBytesTotal: summary.archiveBytesTotal ?? 0,
        indexMs: summary.indexMs ?? 0,
        wallClockMs: summary.wallClockMs ?? 0,
        budgetExhausted: Boolean(summary.budgetExhausted),
        results: payload.results ?? [],
        negativeControl: (summary.negativeControl?.results ?? []) as NegativeControlResult[],
        notAttempted: payload.notAttempted ?? summary.notAttempted ?? [],
        sdConfig,
        recomputedFrom: path.relative(process.cwd(), path.resolve(jsonPath)).replace(/\\/g, '/'),
        resumeInfo: summary.resumeInfo ?? null
    });
}

/**
 * Archive-wide step census. `summary.stepCount` is the exact number of replayed
 * steps of a record, and the summary is the last field of every record, so a
 * small tail read per record gives the archive's true step total without
 * JSON-parsing 3.3 GB. This turns "projected episode count" into a measured
 * total-steps figure and leaves per-step cost as the only projected quantity.
 */
async function runCensus(options: PilotOptions) {
    const allFiles = Object.keys(CLAIMED_LINE_COUNTS);
    const files = allFiles.filter(file => existsSync(path.join(ARCHIVE_DIR, file)));
    const startedAt = Date.now();
    const perFile: Array<{ file: string; records: number; steps: number; missing: number; multi: number }> = [];
    const allSteps: number[] = [];
    let missing = 0;
    let multi = 0;

    for (const file of files) {
        const index = await indexFile(file);
        const handle = await open(path.join(ARCHIVE_DIR, file), 'r');
        let steps = 0;
        let fileMissing = 0;
        let fileMulti = 0;
        try {
            for (let lineIndex = 0; lineIndex < index.lineCount; lineIndex += 1) {
                const start = index.starts[lineIndex];
                const end = index.ends[lineIndex];
                const from = Math.max(start, end - 4096);
                const length = end - from;
                const buffer = Buffer.allocUnsafe(length);
                let read = 0;
                while (read < length) {
                    const result = await handle.read(buffer, read, length - read, from + read);
                    if (result.bytesRead === 0) break;
                    read += result.bytesRead;
                }
                const matches = [...buffer.toString('utf8').matchAll(/"stepCount":(\d+)/g)];
                if (matches.length === 0) {
                    fileMissing += 1;
                    continue;
                }
                if (matches.length > 1) fileMulti += 1;
                const value = Number(matches[matches.length - 1][1]);
                steps += value;
                allSteps.push(value);
            }
        } finally {
            await handle.close();
        }
        missing += fileMissing;
        multi += fileMulti;
        perFile.push({ file, records: index.lineCount, steps, missing: fileMissing, multi: fileMulti });
        if (!options.quiet) {
            console.log(`-- census ${file}: ${index.lineCount} records, ${steps} steps to replay`);
        }
    }

    allSteps.sort((a, b) => a - b);
    const totalSteps = allSteps.reduce((sum, value) => sum + value, 0);
    const census = {
        kind: 't12_05_archive_step_census',
        version: 1,
        generatedAt: new Date().toISOString(),
        archiveDir: ARCHIVE_DIR,
        source: 'summary.stepCount read from the last 4KB of every record (no JSON parse of the full record)',
        recordCount: allSteps.length,
        missingStepCount: missing,
        recordsWithMultipleMatches: multi,
        totalSteps,
        stepsMin: allSteps.length > 0 ? allSteps[0] : null,
        stepsMedian: medianOf(allSteps),
        stepsMean: allSteps.length > 0 ? Number((totalSteps / allSteps.length).toFixed(1)) : null,
        stepsMax: allSteps.length > 0 ? allSteps[allSteps.length - 1] : null,
        stepHistogram: STEP_BUCKETS.map(bucket => {
            const inBucket = allSteps.filter(value => value >= bucket.min && value <= bucket.max);
            return {
                label: bucket.label,
                min: bucket.min,
                max: bucket.max === Number.MAX_SAFE_INTEGER ? null : bucket.max,
                records: inBucket.length,
                steps: inBucket.reduce((sum, value) => sum + value, 0)
            };
        }),
        perFile,
        elapsedMs: Date.now() - startedAt
    };

    if (options.write) {
        await mkdir(options.outDir, { recursive: true });
        await writeFile(
            path.join(options.outDir, 'archive_step_census.json'),
            `${JSON.stringify(census, null, 2)}\n`,
            'utf8'
        );
    }
    console.log(JSON.stringify({
        recordCount: census.recordCount,
        totalSteps: census.totalSteps,
        stepsMean: census.stepsMean,
        stepsMedian: census.stepsMedian,
        stepsMin: census.stepsMin,
        stepsMax: census.stepsMax,
        missingStepCount: census.missingStepCount,
        elapsedMs: census.elapsedMs
    }, null, 2));
    return census;
}

interface StepCensus {
    archiveDir: string;
    recordCount: number;
    totalSteps: number;
    stepsMean: number | null;
    stepsMedian: number | null;
    generatedAt: string;
    missingStepCount: number;
    stepHistogram?: Array<{ label: string; min: number; max: number | null; records: number; steps: number }>;
}

/**
 * Episode-length buckets. Per-step replay cost is NOT constant across lengths
 * (short games are much cheaper per step), so a projection that applies one
 * pooled ms/step to the whole archive is biased. These buckets let the archive's
 * measured step distribution be weighted by length-matched per-step costs.
 */
const STEP_BUCKETS: Array<{ label: string; min: number; max: number }> = [
    { label: '1-999', min: 1, max: 999 },
    { label: '1000-4999', min: 1000, max: 4999 },
    { label: '5000-14999', min: 5000, max: 14999 },
    { label: '15000+', min: 15000, max: Number.MAX_SAFE_INTEGER }
];

function bucketIndexOf(steps: number): number {
    for (let i = 0; i < STEP_BUCKETS.length; i += 1) {
        if (steps >= STEP_BUCKETS[i].min && steps <= STEP_BUCKETS[i].max) return i;
    }
    return STEP_BUCKETS.length - 1;
}

/** Load the optional census, but only if it describes this same archive. */
async function loadStepCensus(outDir: string): Promise<StepCensus | null> {
    const censusPath = path.join(outDir, 'archive_step_census.json');
    if (!existsSync(censusPath)) return null;
    try {
        const census = JSON.parse(await readFile(censusPath, 'utf8')) as StepCensus;
        if (path.resolve(census.archiveDir) !== path.resolve(ARCHIVE_DIR)) return null;
        return census;
    } catch {
        return null;
    }
}

interface FinalizeInput {
    options: PilotOptions;
    revision: string;
    legacyProvider: boolean;
    plans: FilePlan[];
    plannedSampleCount: number;
    totalClaimed: number;
    missingFiles: string[];
    measuredLineCounts: Record<string, number>;
    measuredPhysicalLines: Record<string, number>;
    fileBytes: Record<string, number>;
    archiveBytesTotal: number;
    indexMs: number;
    wallClockMs: number;
    budgetExhausted: boolean;
    results: EpisodeResult[];
    negativeControl: NegativeControlResult[];
    notAttempted: Array<{ file: string; lineIndex: number; rank: number }>;
    sdConfig: SdTrainingPlanConfig | null;
    recomputedFrom: string | null;
    resumeInfo?: {
        resumedFrom: string;
        priorAttempted: number;
        priorPassed: number;
        priorWallClockMs: number | null;
        pendingCount: number;
        planSelectionMatched: boolean;
        unmatchedNotAttempted: number;
    } | null;
}

function medianOf(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    if (values.length % 2 === 1) return values[(values.length - 1) / 2];
    return Number(((values[values.length / 2 - 1] + values[values.length / 2]) / 2).toFixed(1));
}

/**
 * Least-squares fit of elapsedMs on stepsYielded. Recorded as a diagnostic: it
 * answers "is cost a fixed cost plus a constant per-step cost?". A physically
 * implausible NEGATIVE intercept means per-step cost rises with episode length,
 * which is why the projection is bucket-stratified instead of linear.
 */
function fitLinearCost(results: readonly EpisodeResult[]) {
    const points = results.filter(result => result.stepsYielded > 0);
    if (points.length < 3) return null;
    const n = points.length;
    const meanX = points.reduce((sum, result) => sum + result.stepsYielded, 0) / n;
    const meanY = points.reduce((sum, result) => sum + result.elapsedMs, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (const point of points) {
        sxy += (point.stepsYielded - meanX) * (point.elapsedMs - meanY);
        sxx += (point.stepsYielded - meanX) * (point.stepsYielded - meanX);
    }
    if (sxx === 0) return null;
    const msPerStep = sxy / sxx;
    const interceptMs = meanY - msPerStep * meanX;
    let ssTot = 0;
    let ssRes = 0;
    for (const point of points) {
        const predicted = interceptMs + msPerStep * point.stepsYielded;
        ssTot += (point.elapsedMs - meanY) * (point.elapsedMs - meanY);
        ssRes += (point.elapsedMs - predicted) * (point.elapsedMs - predicted);
    }
    return {
        n,
        interceptMs: Number(interceptMs.toFixed(1)),
        msPerStep: Number(msPerStep.toFixed(4)),
        r2: ssTot > 0 ? Number((1 - ssRes / ssTot).toFixed(4)) : null,
        interceptIsPositive: interceptMs > 0,
        note: interceptMs > 0
            ? '线性模型（固定成本 + 常数每步成本）与数据相容'
            : '线性拟合给出**负**截距，说明每步成本随对局变长而上升（超线性），单一直线模型不适用，故采用分桶投影'
    };
}

/**
 * Corroborates provenance beyond the hash gate: the SD job generator assigns
 * `seed = seedBase + planIndex*100000 + mapIndex*1000 + episodeIndex`. If the
 * sampled seeds all fall in the expected window for their (planId, mapName), the
 * archive is consistent with having been produced from this exact plan JSON.
 */
function computeSeedFormulaCheck(results: readonly EpisodeResult[], sdConfig: SdTrainingPlanConfig | null) {
    if (!sdConfig) {
        return { available: false, formula: null, checked: 0, matched: 0, mismatches: [] as unknown[] };
    }
    const planIndexById = new Map(sdConfig.plans.map((plan, index) => [plan.id, index]));
    const mapIndexByName = new Map(sdConfig.mapNames.map((name, index) => [name, index]));
    const mismatches: Array<{ scenarioId: string | null; seed: number | null; expectedWindow: string | null; reason: string }> = [];
    let checked = 0;
    let matched = 0;
    for (const result of results) {
        if (!result.planId || !result.mapScenarioId || result.seed === null) continue;
        const mapName = result.mapScenarioId.replace(/^SD:/, '');
        const planIndex = planIndexById.get(result.planId);
        const mapIndex = mapIndexByName.get(mapName);
        const plan = sdConfig.plans.find(item => item.id === result.planId);
        checked += 1;
        if (planIndex === undefined || mapIndex === undefined || !plan) {
            mismatches.push({
                scenarioId: result.scenarioId,
                seed: result.seed,
                expectedWindow: null,
                reason: 'planId 或 mapName 不在 SD 训练计划中'
            });
            continue;
        }
        const baseSeed = sdConfig.defaults.seedBase + planIndex * 100000 + mapIndex * 1000;
        const window = `[${baseSeed}, ${baseSeed + plan.episodesPerMap - 1}]`;
        if (result.seed >= baseSeed && result.seed < baseSeed + plan.episodesPerMap) matched += 1;
        else mismatches.push({
            scenarioId: result.scenarioId,
            seed: result.seed,
            expectedWindow: window,
            reason: `seed 不在计划公式窗口 ${window} 内`
        });
    }
    return {
        available: true,
        formula: 'seed = defaults.seedBase + planIndex*100000 + mapIndex*1000 + episodeIndex',
        checked,
        matched,
        mismatches: mismatches.slice(0, 10)
    };
}

async function finalizePayload(input: FinalizeInput): Promise<PilotPayload> {
    const {
        options, revision, legacyProvider, plans, plannedSampleCount, totalClaimed, missingFiles,
        measuredLineCounts, measuredPhysicalLines, fileBytes, archiveBytesTotal, indexMs, wallClockMs,
        budgetExhausted, results, negativeControl, notAttempted, sdConfig, recomputedFrom,
        resumeInfo: resumedInfo
    } = input;

    // Every aggregate is recomputed from `results`, never carried over on trust.
    const attempted = results.length;
    const passedResults = results.filter(result => result.outcome === 'PASS');
    const passed = passedResults.length;
    const thrown = results.filter(result => result.outcome === 'THROW').length;
    const timedOut = results.filter(result => result.outcome === 'TIMEOUT').length;
    const totalReplayMs = results.reduce((sum, result) => sum + result.elapsedMs, 0);
    const totalStepsReplayed = results.reduce((sum, result) => sum + result.stepsYielded, 0);
    const totalPassedMs = passedResults.reduce((sum, result) => sum + result.elapsedMs, 0);
    const totalPassedSteps = passedResults.reduce((sum, result) => sum + result.stepsYielded, 0);

    const outcomeByFile: Record<string, { attempted: number; passed: number; thrown: number; timeout: number }> = {};
    for (const result of results) {
        outcomeByFile[result.file] ??= { attempted: 0, passed: 0, thrown: 0, timeout: 0 };
        const bucket = outcomeByFile[result.file];
        bucket.attempted += 1;
        if (result.outcome === 'PASS') bucket.passed += 1;
        else if (result.outcome === 'THROW') bucket.thrown += 1;
        else bucket.timeout += 1;
    }

    const failureByCategory: Record<string, {
        count: number;
        files: Record<string, number>;
        plans: Record<string, number>;
        exampleScenarioId: string | null;
        exampleMessage: string | null;
        exampleFile: string | null;
        exampleLineIndex: number | null;
        exampleStep: number | null;
    }> = {};
    for (const result of results) {
        if (result.outcome === 'PASS') continue;
        const key = result.errorCategory ?? 'unknown';
        failureByCategory[key] ??= {
            count: 0,
            files: {},
            plans: {},
            exampleScenarioId: null,
            exampleMessage: null,
            exampleFile: null,
            exampleLineIndex: null,
            exampleStep: null
        };
        const bucket = failureByCategory[key];
        bucket.count += 1;
        bucket.files[result.file] = (bucket.files[result.file] ?? 0) + 1;
        const planKey = result.planId ?? '<unknown>';
        bucket.plans[planKey] = (bucket.plans[planKey] ?? 0) + 1;
        if (bucket.exampleMessage === null) {
            bucket.exampleScenarioId = result.scenarioId;
            bucket.exampleMessage = result.errorMessage;
            bucket.exampleFile = result.file;
            bucket.exampleLineIndex = result.lineIndex;
            bucket.exampleStep = result.failureStep;
        }
    }

    const failureByPlan: Record<string, { count: number; attempted: number; categories: Record<string, number> }> = {};
    for (const result of results) {
        const key = result.planId ?? result.scenarioId ?? '<unknown>';
        failureByPlan[key] ??= { count: 0, attempted: 0, categories: {} };
        failureByPlan[key].attempted += 1;
        if (result.outcome === 'PASS') continue;
        failureByPlan[key].count += 1;
        const category = result.errorCategory ?? 'unknown';
        failureByPlan[key].categories[category] = (failureByPlan[key].categories[category] ?? 0) + 1;
    }

    const successByPlan: Record<string, { passed: number; attempted: number; steps: number; ms: number }> = {};
    for (const result of results) {
        const key = result.planId ?? '<unknown>';
        successByPlan[key] ??= { passed: 0, attempted: 0, steps: 0, ms: 0 };
        successByPlan[key].attempted += 1;
        if (result.outcome === 'PASS') {
            successByPlan[key].passed += 1;
            successByPlan[key].steps += result.stepsYielded;
            successByPlan[key].ms += result.elapsedMs;
        }
    }

    const passedTimes = passedResults.map(result => result.elapsedMs).sort((a, b) => a - b);
    const passedStepCounts = passedResults.map(result => result.stepsYielded).sort((a, b) => a - b);
    const perEpisodeMs = passedResults.length > 0 ? totalPassedMs / passedResults.length : null;
    const perEpisodeMedianMs = medianOf(passedTimes);
    const perStepMs = totalPassedSteps > 0 ? totalPassedMs / totalPassedSteps : null;
    const perStepMedianMs = passedTimes.length > 0 && totalPassedSteps > 0
        ? medianOf(passedResults.map(result => (result.stepsYielded > 0 ? result.elapsedMs / result.stepsYielded : 0)))
        : null;

    const meanProjectionMs = perEpisodeMs !== null ? Math.round(perEpisodeMs * totalClaimed) : null;
    const medianProjectionMs = perEpisodeMedianMs !== null ? Math.round(perEpisodeMedianMs * totalClaimed) : null;
    const toHours = (ms: number | null) => ms === null ? null : Number((ms / 3_600_000).toFixed(2));

    // Optional archive-wide step census: gives the archive's TRUE step total, so
    // only the per-step cost remains a projection.
    const census = await loadStepCensus(options.outDir);
    const stepProjectionMeanHours = census !== null && perStepMs !== null
        ? Number(((census.totalSteps * perStepMs) / 3_600_000).toFixed(2))
        : null;
    const stepProjectionMedianHours = census !== null && perStepMedianMs !== null
        ? Number(((census.totalSteps * perStepMedianMs) / 3_600_000).toFixed(2))
        : null;
    const stepProjectionHours = (stepProjectionMeanHours !== null || stepProjectionMedianHours !== null)
        ? [
            Math.min(...[stepProjectionMeanHours, stepProjectionMedianHours].filter((v): v is number => v !== null)),
            Math.max(...[stepProjectionMeanHours, stepProjectionMedianHours].filter((v): v is number => v !== null))
        ]
        : null;

    // Length-stratified projection: weight each archive length bucket by the
    // per-step cost measured on sampled episodes of the same length.
    let stratifiedMs: number | null = null;
    let stratifiedMedianMs: number | null = null;
    const stratifiedDetail: Array<{
        label: string;
        archiveRecords: number;
        archiveSteps: number;
        sampledEpisodes: number;
        sampledSteps: number;
        sampledMsPerStep: number | null;
        sampledMsPerStepMedian: number | null;
        usedPooledFallback: boolean;
        sampledMs: number;
    }> = [];
    if (census?.stepHistogram) {
        let total = 0;
        let totalMedian = 0;
        let complete = true;
        for (let i = 0; i < census.stepHistogram.length; i += 1) {
            const bucket = census.stepHistogram[i];
            const inBucket = passedResults.filter(result => bucketIndexOf(result.stepsYielded) === i);
            const sampledSteps = inBucket.reduce((sum, result) => sum + result.stepsYielded, 0);
            const sampledMs = inBucket.reduce((sum, result) => sum + result.elapsedMs, 0);
            const usedPooledFallback = sampledSteps === 0;
            if (usedPooledFallback) complete = false;
            const perStep = sampledSteps > 0 ? sampledMs / sampledSteps : perStepMs;
            const perStepMedian = inBucket.length > 0
                ? medianOf(inBucket.map(result => result.elapsedMs / Math.max(result.stepsYielded, 1)))
                : perStepMedianMs;
            if (perStep !== null) total += bucket.steps * perStep;
            if (perStepMedian !== null) totalMedian += bucket.steps * perStepMedian;
            stratifiedDetail.push({
                label: bucket.label,
                archiveRecords: bucket.records,
                archiveSteps: bucket.steps,
                sampledEpisodes: inBucket.length,
                sampledSteps,
                sampledMsPerStep: perStep !== null ? Number(perStep.toFixed(4)) : null,
                sampledMsPerStepMedian: perStepMedian !== null ? Number(perStepMedian.toFixed(4)) : null,
                usedPooledFallback,
                sampledMs
            });
        }
        stratifiedMs = complete || perStepMs !== null ? Math.round(total) : null;
        stratifiedMedianMs = complete || perStepMedianMs !== null ? Math.round(totalMedian) : null;
    }
    const stratifiedHours = stratifiedMs !== null ? Number((stratifiedMs / 3_600_000).toFixed(2)) : null;
    const stratifiedMedianHours = stratifiedMedianMs !== null
        ? Number((stratifiedMedianMs / 3_600_000).toFixed(2))
        : null;
    const stratifiedBandHours = stratifiedHours !== null && stratifiedMedianHours !== null
        ? [Math.min(stratifiedHours, stratifiedMedianHours), Math.max(stratifiedHours, stratifiedMedianHours)]
        : null;

    const seedFormulaCheck = computeSeedFormulaCheck(results, sdConfig);

    const summary = {
        revision,
        generatedAt: new Date().toISOString(),
        recomputedFrom,
        resumeInfo: resumedInfo ?? null,
        legacyOpensslProvider: legacyProvider,
        outputDir: options.outDir,
        archiveDir: ARCHIVE_DIR,
        sdPlanFile: SD_PLAN_FILE,
        unpackDir: UNPACK_DIR,
        samplingRule: {
            description: '分层抽样：按 claimed 行数比例分配（最大余数法），文件内用带种子偏移的等距 stride；' +
                '处理顺序按 rank 轮转（每个文件各取第 r 个样本），因此预算截断后的样本仍跨变体成比例',
            seed: options.seed,
            target: options.target,
            claimedTotalLines: totalClaimed,
            plannedSampleCount,
            allocation: plans.map(plan => ({
                file: plan.file,
                claimedLineCount: plan.claimedLineCount,
                sampleCount: plan.sampleCount,
                offset: Number(plan.offset.toFixed(6)),
                lineIndexes: plan.lineIndexes
            })),
            processingOrder: 'round-robin by rank, files sorted by name'
        },
        measuredLineCounts,
        measuredPhysicalLines,
        fileBytes,
        missingFiles,
        archiveBytesTotal,
        indexMs,
        attempted,
        passed,
        thrown,
        timedOut,
        budgetSkipped: notAttempted.length,
        passRate: attempted > 0 ? Number((passed / attempted).toFixed(4)) : null,
        passRateOfTarget: options.target > 0 ? Number((passed / options.target).toFixed(4)) : null,
        stepsReplayed: totalStepsReplayed,
        passedSteps: totalPassedSteps,
        wallClockMs,
        budgetMs: options.budgetMs,
        budgetExhausted,
        episodeTimeoutMs: options.episodeTimeoutMs,
        sampleIsSmall: true,
        cost: {
            totalReplayMs,
            indexMs,
            perAttemptedEpisodeMs: attempted > 0 ? Number((totalReplayMs / attempted).toFixed(1)) : null,
            perPassedEpisodeMs: perEpisodeMs !== null ? Number(perEpisodeMs.toFixed(1)) : null,
            perPassedEpisodeMsMedian: perEpisodeMedianMs,
            perPassedEpisodeMsMin: passedTimes.length > 0 ? passedTimes[0] : null,
            perPassedEpisodeMsMax: passedTimes.length > 0 ? passedTimes[passedTimes.length - 1] : null,
            perPassedEpisodeMsSpreadRatio: passedTimes.length > 0 && passedTimes[0] > 0
                ? Number((passedTimes[passedTimes.length - 1] / passedTimes[0]).toFixed(1))
                : null,
            perPassedStepMs: perStepMs !== null ? Number(perStepMs.toFixed(4)) : null,
            perPassedStepMsMedian: perStepMedianMs !== null ? Number(perStepMedianMs.toFixed(4)) : null,
            stepsPerSecondPassed: perStepMs !== null && perStepMs > 0 ? Number((1000 / perStepMs).toFixed(2)) : null,
            stepsPerSecondMedian: perStepMedianMs !== null && perStepMedianMs > 0
                ? Number((1000 / perStepMedianMs).toFixed(2))
                : null,
            episodesPerHourPassed: perEpisodeMs !== null && perEpisodeMs > 0
                ? Number((3_600_000 / perEpisodeMs).toFixed(1))
                : null,
            episodesPerHourMedian: perEpisodeMedianMs !== null && perEpisodeMedianMs > 0
                ? Number((3_600_000 / perEpisodeMedianMs).toFixed(1))
                : null,
            passedStepsMedian: medianOf(passedStepCounts),
            passedStepsMin: passedStepCounts.length > 0 ? passedStepCounts[0] : null,
            passedStepsMax: passedStepCounts.length > 0 ? passedStepCounts[passedStepCounts.length - 1] : null,
            projectedFullArchiveMsMeanBasis: meanProjectionMs,
            projectedFullArchiveHoursMeanBasis: toHours(meanProjectionMs),
            projectedFullArchiveMsMedianBasis: medianProjectionMs,
            projectedFullArchiveHoursMedianBasis: toHours(medianProjectionMs),
            projectedFullArchiveHoursRange: [toHours(medianProjectionMs), toHours(meanProjectionMs)],
            stepCensus: census === null ? null : {
                generatedAt: census.generatedAt,
                recordCount: census.recordCount,
                totalSteps: census.totalSteps,
                stepsMean: census.stepsMean,
                stepsMedian: census.stepsMedian,
                missingStepCount: census.missingStepCount
            },
            projectedFullArchiveHoursStepBasisMean: stepProjectionMeanHours,
            projectedFullArchiveHoursStepBasisMedian: stepProjectionMedianHours,
            projectedFullArchiveHoursStepBasisRange: stepProjectionHours,
            projectedFullArchiveMsStepStratified: stratifiedMs,
            projectedFullArchiveHoursStepStratified: stratifiedHours,
            projectedFullArchiveHoursStepStratifiedMedianBasis: stratifiedMedianHours,
            projectedFullArchiveHoursStepStratifiedBand: stratifiedBandHours,
            stepStratification: stratifiedDetail,
            linearFit: fitLinearCost(passedResults),
            projectionBasis: perEpisodeMs !== null
                ? `上界=每 PASS episode 平均 ${perEpisodeMs.toFixed(1)}ms × ${totalClaimed}；` +
                `下界=中位数 ${perEpisodeMedianMs}ms × ${totalClaimed}（两者都是外推，不是实测）`
                : 'n/a',
            projectionIsProjection: true,
            projectionAssumption: `假设这 ${passed} 个已重放 episode 的耗时分布与归档全部 ${totalClaimed} 个 episode 一致；` +
                '由于单 episode 成本实测相差约 ' +
                `${passedTimes.length > 0 && passedTimes[0] > 0 ? (passedTimes[passedTimes.length - 1] / passedTimes[0]).toFixed(0) : 'n/a'} 倍，` +
                '小样本下的均值受长对局离群值驱动，因此同时给出中位数口径'
        },
        failureByCategory,
        failureByPlan,
        successByPlan,
        seedFormulaCheck,
        negativeControl: {
            description: '对首个抽样 episode 的内存副本做 4 种破坏，确认复用的 gate 真的会抛错（非空验证）',
            results: negativeControl,
            allAsExpected: negativeControl.length > 0 && negativeControl.every(item => item.asExpected)
        },
        outcomeByFile,
        notAttempted,
        verificationBoundary: {
            checked: [
                '初始 observation hash（sha256(JSON.stringify(env.reset(seed).observation))）与 episode 记录一致',
                '初始合法动作数一致',
                '固定动作空间大小一致',
                '每步重放前的 currentPlayer / turn / 合法动作数 / 固定合法动作数 / step 序号连续性',
                '每步固定动作索引可解析且其 actionCode 与日志一致',
                '每步 env.stepAction 之后的 reward / done / winner 与日志一致'
            ],
            notChecked: [
                'episode 记录里没有逐步 state hash，因此"中间状态发生偏离但 winner/reward/done/合法动作数恰好相同"的情况无法被发现',
                '除初始 reset 之外没有做完整 observation 相等性比较',
                '日志中的经济字段（incomeValueByPlayer / spendValue / killValueByPlayer / lostValueByPlayer）从未比较',
                'info 字符串从未比较',
                '未进入重放的 episode（预算截断）完全未验证'
            ]
        }
    };

    const payload: PilotPayload = {
        kind: 't12_05_replay_pilot',
        version: 1,
        summary,
        results,
        notAttempted
    };

    const report = renderReport(payload);
    if (options.write) {
        await mkdir(options.outDir, { recursive: true });
        await writeFile(
            path.join(options.outDir, 'sd_replay_pilot.json'),
            `${JSON.stringify(payload, null, 2)}\n`,
            'utf8'
        );
        await writeFile(path.join(options.outDir, 'T12-05_report.md'), report, 'utf8');
    }

    console.log(report);
    console.log(JSON.stringify({
        attempted,
        passed,
        thrown,
        timedOut,
        budgetSkipped: notAttempted.length,
        passRate: summary.passRate,
        wallClockMs,
        indexMs,
        perPassedEpisodeMs: summary.cost.perPassedEpisodeMs,
        perPassedEpisodeMsMedian: summary.cost.perPassedEpisodeMsMedian,
        projectedFullArchiveHoursMeanBasis: summary.cost.projectedFullArchiveHoursMeanBasis,
        projectedFullArchiveHoursMedianBasis: summary.cost.projectedFullArchiveHoursMedianBasis,
        seedFormulaCheck: {
            checked: seedFormulaCheck.checked,
            matched: seedFormulaCheck.matched
        },
        recomputedFrom
    }, null, 2));

    return payload;
}


// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

interface PilotPayload {
    kind: string;
    version: number;
    summary: any;
    results: EpisodeResult[];
    notAttempted: Array<{ file: string; lineIndex: number; rank: number }>;
}

function renderReport(payload: PilotPayload): string {
    const { summary } = payload;
    const lines: string[] = [];
    const toolPath = path.relative(process.cwd(), process.argv[1] ?? 'v12/tools/replay_pilot.ts').replace(/\\/g, '/');
    const runner = 'v12/tools/run-tool.mjs';
    const outDir = path.relative(process.cwd(), path.resolve(summary.outputDir ?? 'v12/out/replay')).replace(/\\/g, '/');
    // A resumed report is reproduced by resuming from the archived first-run JSON.
    const archivedResumeSource = 'v12/out/replay60/sd_replay_pilot.json';
    const resumeSource = summary.resumeInfo
        ? (existsSync(path.resolve(archivedResumeSource)) ? archivedResumeSource : summary.resumeInfo.resumedFrom)
        : null;
    const command = [
        `node${summary.legacyOpensslProvider ? ' --openssl-legacy-provider' : ''} ${runner} ${toolPath}`,
        `--target ${summary.samplingRule.target}`,
        `--budget-ms ${summary.budgetMs}`,
        `--seed ${summary.samplingRule.seed}`,
        `--episode-timeout-ms ${summary.episodeTimeoutMs}`,
        ...(resumeSource ? [`--resume ${resumeSource}`] : []),
        `--out-dir ${outDir}`
    ].join(' ');

    lines.push('# T12-05 — 旧 episode 归档 verified-replay 试点报告');
    lines.push('');
    lines.push(`- 生成时间：${summary.generatedAt}`);
    lines.push(`- 仓库 revision：\`${summary.revision}\`（脚本直接读 \`.git/HEAD\`；沙箱禁止创建进程，无法调用 git）`);
    lines.push(`- 归档目录：\`${toPosix(summary.archiveDir)}\``);
    lines.push(`- SD 训练计划：\`${toPosix(summary.sdPlanFile)}\``);
    lines.push(`- APK 解包目录：\`${toPosix(summary.unpackDir)}\``);
    lines.push(`- legacy OpenSSL provider 已启用：${summary.legacyOpensslProvider ? '是' : '否'}`);
    if (summary.recomputedFrom) {
        lines.push(`- 本报告的聚合/成本部分由 \`--recompute-report\` 从**同一次运行**的结果重新计算：\`${summary.recomputedFrom}\``);
        lines.push('  （重算不重放 episode；所有聚合量都从 `results` 重新推导，不做任何沿用。）');
    }
    if (summary.resumeInfo) {
        const info = summary.resumeInfo;
        lines.push('');
        lines.push('**本报告由两次运行合并而成**（`--resume`）：');
        lines.push(`- 前一次运行：${info.priorAttempted} 个 episode 已重放（其中 ${info.priorPassed} PASS），` +
            `墙钟 ${info.priorWallClockMs ?? 'n/a'} ms；其 \`results\` 原样并入本报告（未重放、未修改）。`);
        lines.push(`- 本次运行：补跑剩余的 ${info.pendingCount} 个 episode，墙钟 ${summary.wallClockMs} ms。`);
        lines.push(`- 抽样确定性检查：上次遗留的未跑清单与本次重新计算的抽样计划**${info.planSelectionMatched ? '完全一致' : `不一致（${info.unmatchedNotAttempted} 条对不上）`}**` +
            `（计划是 (target, seed, 文件列表) 的纯函数）。`);
        lines.push(`- 成本统计（每 episode / 每步耗时）基于合并后的全部 ${summary.attempted} 个 episode；` +
            '墙钟总耗时字段是**本次**运行的墙钟（两次运行之间有间隔），不能直接相加。');
    }
    lines.push('');
    lines.push('> **样本量声明**：');
    if (summary.budgetSkipped === 0 && summary.attempted === summary.samplingRule.plannedSampleCount) {
        lines.push(`> 计划抽样的 **${summary.samplingRule.plannedSampleCount}** 个 episode **全部完成重放**（attempted = ${summary.attempted}），无预算截断。`);
        lines.push(`> 这是归档 ${summary.samplingRule.claimedTotalLines} 个 episode 的 ${(summary.attempted / summary.samplingRule.claimedTotalLines * 100).toFixed(1)}% 分层抽样，`);
        lines.push('> 相对于全归档**仍是小样本**：它按文件比例分层，但每个文件内只有少量 episode，且各长度段的样本很薄');
        lines.push('> （最大的 15000+ 步段占归档 59% 的步数，却只抽到少量 episode），所以通过率置信区间与成本投影都带有小样本不确定性。');
    } else {
        lines.push(`> 计划抽样 ${summary.samplingRule.plannedSampleCount} 个，实际完成 **${summary.attempted}** 个（其中 ${summary.passed} PASS），`);
        lines.push(`> 预算截断未跑 ${summary.budgetSkipped} 个（未验证）。`);
        lines.push('> 因此这是**小样本**；通过率与成本外推都带有小样本不确定性，且成本外推假设样本的耗时分布与全归档一致。');
    }
    lines.push('');
    lines.push('## 复现命令');
    lines.push('');
    lines.push('```powershell');
    lines.push(command);
    lines.push('```');
    lines.push('');
    lines.push('两点环境要求（都已在上面命令中体现）：');    lines.push('');
    lines.push('1. 必须用 `v12/tools/run-tool.mjs`：`v11/tools/run-tool.mjs` 在本环境会被 Vite 的 Windows `net use` 探测');
    lines.push('   （`optimizeSafeRealPathSync` → `child_process.exec`）以 `spawn EPERM` 直接打死，v12 runner 就是为该问题准备的行为等价 shim。');
    lines.push('2. 必须加 `--openssl-legacy-provider`：`.aem` 地图资源是用 DES 加密的，Node 22 默认 OpenSSL 3 provider 会抛');
    lines.push('   `error:0308010C:digital envelope routines::unsupported`，此时所有 episode 都会在"环境构造"阶段失败（本次已复现并归类）。');
    lines.push('');
    lines.push('产出位置：');
    lines.push('');
    lines.push('- `v12/out/replay/`：**本报告与 100-episode 合并结果**（canonical，任务要求的交付路径）；');
    if (outDir !== 'v12/out/replay') {
        lines.push(`- \`${outDir}/\`：本报告对应的运行原始产出（含 \`sd_replay_pilot.results.jsonl\` 与 \`archive_step_census.json\`）；`);
    }
    lines.push('- `v12/out/replay100/`：补跑剩余 episode 的那次 `--resume` 运行；');
    lines.push('- `v12/out/replay60/`：第一次运行（60 个 episode）的存档，也是上面复现命令里 `--resume` 的输入；');
    lines.push('- `v12/out/replay_probe/`：3 episode 的端到端 smoke 证据。');
    lines.push('');
    lines.push('注意：`--resume` 只补跑上次未完成的 episode，并把上次的 `results` 原样并入，因此不会重复消耗 30 分钟以上的重放时间。');
    lines.push('若要从零复现全部 100 个（不 resume），去掉 `--resume` 参数即可；两次运行为此合计花费约 67 分钟墙钟。');
    lines.push('');
    lines.push('## 抽样规则');
    lines.push('');
    lines.push(`- ${summary.samplingRule.description}`);
    lines.push(`- 随机种子：\`${summary.samplingRule.seed}\``);
    lines.push(`- 目标 episode 数：**${summary.samplingRule.target}**（归档 ${summary.samplingRule.allocation.length} 个文件、claimed 合计 ${summary.samplingRule.claimedTotalLines} 行）`);
    lines.push(`- 实际计划抽样：${summary.samplingRule.plannedSampleCount} 个`);
    lines.push(`- 处理顺序：${summary.samplingRule.processingOrder}`);
    lines.push('');
    lines.push('| 文件 | claimed 行数 | 实测记录数 | 实测物理行 | 抽样数 | stride offset | 选中 lineIndex（0 基） |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const item of summary.samplingRule.allocation) {
        lines.push(
            `| \`${item.file}\` | ${item.claimedLineCount} | ${summary.measuredLineCounts[item.file] ?? 'n/a'} | ` +
            `${summary.measuredPhysicalLines[item.file] ?? 'n/a'} | ${item.sampleCount} | ${item.offset} | ` +
            `${item.lineIndexes.join(', ')} |`
        );
    }
    lines.push('');
    const mismatched = summary.samplingRule.allocation.filter(
        (item: any) => summary.measuredLineCounts[item.file] !== item.claimedLineCount
    );
    lines.push(mismatched.length === 0
        ? '实测记录数与 claimed 行数在全部文件上一致（逐文件重新计数，见上表）。'
        : `注意：有 ${mismatched.length} 个文件的实测行数与 claimed 不一致：` +
        mismatched.map((item: any) => `${item.file} claimed=${item.claimedLineCount} measured=${summary.measuredLineCounts[item.file]}`).join('; '));
    if (summary.missingFiles.length > 0) {
        lines.push('');
        lines.push(`缺失文件（跳过）：${summary.missingFiles.map((file: string) => `\`${file}\``).join(', ')}`);
    }
    lines.push('');
    lines.push(`完整逐条清单见 \`sd_replay_pilot.json\` 的 \`summary.samplingRule.allocation[].lineIndexes\`、\`results\`（已跑）与 \`notAttempted\`（未跑）。`);
    lines.push('');
    lines.push('## 聚合结果');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('| --- | ---: |');
    lines.push(`| 计划抽样 | ${summary.samplingRule.plannedSampleCount} |`);
    lines.push(`| 实际尝试（attempted） | **${summary.attempted}** |`);
    lines.push(`| PASS | **${summary.passed}** |`);
    lines.push(`| THROW | ${summary.thrown} |`);
    lines.push(`| TIMEOUT（单 episode 墙钟上限 ${summary.episodeTimeoutMs}ms） | ${summary.timedOut} |`);
    lines.push(`| 预算截断未跑（budget-skipped，未验证） | ${summary.budgetSkipped} |`);
    lines.push(`| **通过率（PASS / attempted）** | **${summary.passRate === null ? 'n/a' : `${(summary.passRate * 100).toFixed(2)}%`}** |`);
    lines.push(`| 通过率（PASS / 计划抽样 ${summary.samplingRule.target}） | ${(summary.passRateOfTarget * 100).toFixed(2)}% |`);
    lines.push(`| 重放步数（所有 attempt 合计） | ${summary.stepsReplayed} |`);
    lines.push(`| 通过 episode 的重放步数 | ${summary.passedSteps} |`);
    lines.push(`| 索引阶段耗时（固定 I/O 成本） | ${summary.indexMs} ms |`);
    lines.push(`| 墙钟总耗时 | ${summary.wallClockMs} ms（${(summary.wallClockMs / 60000).toFixed(2)} min） |`);
    lines.push(`| 是否触发预算上限 | ${summary.budgetExhausted ? `是（--budget-ms ${summary.budgetMs}）` : '否'} |`);
    lines.push('');
    lines.push('### 按文件分布');
    lines.push('');
    lines.push('| 文件 | attempted | PASS | THROW | TIMEOUT |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const [file, bucket] of Object.entries(summary.outcomeByFile as Record<string, any>)) {
        lines.push(`| \`${file}\` | ${bucket.attempted} | ${bucket.passed} | ${bucket.thrown} | ${bucket.timeout} |`);
    }
    lines.push('');
    lines.push('### 按 plan 分布');
    lines.push('');
    lines.push('| planId | attempted | PASS | THROW/TIMEOUT | 通过 episode 步数 | 通过 episode 总耗时 ms |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const [planId, bucket] of Object.entries(summary.successByPlan as Record<string, any>)) {
        const failures = (summary.failureByPlan[planId]?.count ?? 0);
        lines.push(`| \`${planId}\` | ${bucket.attempted} | ${bucket.passed} | ${failures} | ${bucket.steps} | ${bucket.ms} |`);
    }
    lines.push('');
    lines.push('## 失败原因分类');
    lines.push('');
    if (Object.keys(summary.failureByCategory).length === 0) {
        lines.push('**本次试点没有出现任何失败样本：THROW = 0，TIMEOUT = 0。**');
    } else {
        lines.push('| 类别 | 数量 | 涉及文件 | 涉及 plan | 示例 scenario.id | 示例位置 | 示例步号 | 示例错误 |');
        lines.push('| --- | ---: | --- | --- | --- | --- | ---: | --- |');
        for (const [category, bucket] of Object.entries(summary.failureByCategory as Record<string, any>)) {
            const files = Object.entries(bucket.files as Record<string, number>)
                .map(([file, count]) => `${file}×${count}`).join(', ');
            const plans = Object.entries(bucket.plans as Record<string, number>)
                .map(([plan, count]) => `${plan}×${count}`).join(', ');
            const where = bucket.exampleLineIndex === null ? 'n/a' : `${bucket.exampleFile}:${bucket.exampleLineIndex}`;
            lines.push(
                `| \`${category}\` | ${bucket.count} | ${files} | ${plans} | \`${bucket.exampleScenarioId ?? 'n/a'}\` | ` +
                `${where} | ${bucket.exampleStep ?? 'n/a'} | ${escapeCell(bucket.exampleMessage ?? '')} |`
            );
        }
    }
    lines.push('');
    lines.push('分类口径：错误类别直接来自 `tools/skirmish_dataset_export.ts` 抛出的消息模式（`ERROR_CATEGORIES` 表），');
    lines.push('不是关键词统计的近似值；`other` 表示未能匹配任何已知模式。');
    lines.push('');
    lines.push('## 成本模型');
    lines.push('');
    lines.push(`样本量 n = **${summary.passed}** 个 PASS episode（另有 ${summary.thrown} THROW、${summary.timedOut} TIMEOUT）；`);
    lines.push('单 episode 成本实测相差很大（见下表 spread ratio），因此均值与中位数两个口径都给出。');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('| --- | ---: |');
    lines.push(`| 每 attempt 平均耗时（含失败） | ${summary.cost.perAttemptedEpisodeMs ?? 'n/a'} ms |`);
    lines.push(`| 每 PASS episode **平均**耗时 | ${summary.cost.perPassedEpisodeMs ?? 'n/a'} ms |`);
    lines.push(`| 每 PASS episode **中位数**耗时 | ${summary.cost.perPassedEpisodeMsMedian ?? 'n/a'} ms |`);
    lines.push(`| 每 PASS episode 耗时 min / max | ${summary.cost.perPassedEpisodeMsMin ?? 'n/a'} / ${summary.cost.perPassedEpisodeMsMax ?? 'n/a'} ms |`);
    lines.push(`| min→max 倍数（spread ratio） | ${summary.cost.perPassedEpisodeMsSpreadRatio ?? 'n/a'}× |`);
    lines.push(`| 每 PASS episode 步数 min / 中位数 / max | ${summary.cost.passedStepsMin ?? 'n/a'} / ${summary.cost.passedStepsMedian ?? 'n/a'} / ${summary.cost.passedStepsMax ?? 'n/a'} |`);
    lines.push(`| 每 PASS step 平均耗时 | ${summary.cost.perPassedStepMs ?? 'n/a'} ms |`);
    lines.push(`| 每 PASS step 中位数耗时 | ${summary.cost.perPassedStepMsMedian ?? 'n/a'} ms |`);
    lines.push(`| 重放吞吐（均值口径） | ${summary.cost.stepsPerSecondPassed ?? 'n/a'} steps/s, ${summary.cost.episodesPerHourPassed ?? 'n/a'} episodes/hour |`);
    lines.push(`| 重放吞吐（中位数口径） | ${summary.cost.stepsPerSecondMedian ?? 'n/a'} steps/s, ${summary.cost.episodesPerHourMedian ?? 'n/a'} episodes/hour |`);
    lines.push(`| 一次性索引成本（约 3.3GB 扫描，每轮只付一次） | ${summary.cost.indexMs} ms |`);
    lines.push('');
    lines.push(`### 全归档 ${summary.samplingRule.claimedTotalLines} episode 成本外推（**投影，不是实测**）`);
    lines.push('');
    lines.push('| 口径 | 每 episode 成本 | 全归档 1395 episode |');
    lines.push('| --- | ---: | ---: |');
    lines.push(`| 均值口径（mean basis，上界） | ${summary.cost.perPassedEpisodeMs ?? 'n/a'} ms | **${summary.cost.projectedFullArchiveHoursMeanBasis ?? 'n/a'} h**（${summary.cost.projectedFullArchiveMsMeanBasis ?? 'n/a'} ms） |`);
    lines.push(`| 中位数口径（median basis，下界） | ${summary.cost.perPassedEpisodeMsMedian ?? 'n/a'} ms | **${summary.cost.projectedFullArchiveHoursMedianBasis ?? 'n/a'} h**（${summary.cost.projectedFullArchiveMsMedianBasis ?? 'n/a'} ms） |`);
    if (summary.cost.stepCensus) {
        lines.push(
            `| **步数普查口径**：归档实测 ${summary.cost.stepCensus.totalSteps} 步 × 每步成本 | ` +
            `${summary.cost.perPassedStepMsMedian ?? 'n/a'}（中位）/ ${summary.cost.perPassedStepMs ?? 'n/a'}（均值）ms/step | ` +
            `**${summary.cost.projectedFullArchiveHoursStepBasisMedian ?? 'n/a'} – ${summary.cost.projectedFullArchiveHoursStepBasisMean ?? 'n/a'} h** |`
        );
    }
    lines.push(`| **区间** | — | **${summary.cost.projectedFullArchiveHoursRange?.[0] ?? 'n/a'} – ${summary.cost.projectedFullArchiveHoursRange?.[1] ?? 'n/a'} 小时**（episode 口径） |`);
    if (summary.cost.projectedFullArchiveHoursStepStratified !== null && summary.cost.projectedFullArchiveHoursStepStratified !== undefined) {
        lines.push(`| **分层步数口径（首选）** | 见下表按长度分桶 | **约 ${summary.cost.projectedFullArchiveHoursStepStratified} h**（区间 ${summary.cost.projectedFullArchiveHoursStepStratifiedBand?.[0] ?? 'n/a'} – ${summary.cost.projectedFullArchiveHoursStepStratifiedBand?.[1] ?? 'n/a'} h） |`);
    }    lines.push('');
    if (summary.cost.stepCensus) {
        lines.push(`步数普查（**实测，不是外推**）：归档 ${summary.cost.stepCensus.recordCount} 个 episode 的 \`summary.stepCount\` 合计 ` +
            `**${summary.cost.stepCensus.totalSteps}** 步（均值 ${summary.cost.stepCensus.stepsMean}、中位数 ${summary.cost.stepCensus.stepsMedian} 步/episode，` +
            `缺失 ${summary.cost.stepCensus.missingStepCount} 条，普查时间 ${summary.cost.stepCensus.generatedAt}）。`);
        lines.push('步数口径的投影只依赖"每步成本"，而每步成本实测比每 episode 成本稳定得多，所以这个口径比 episode 均值口径更可信；');
        lines.push('它仍是投影，因为每步成本取自本次抽样的 episode。');
        lines.push('');
    }
    if (summary.cost.projectedFullArchiveHoursStepStratified !== null && summary.cost.projectedFullArchiveHoursStepStratified !== undefined) {
        lines.push('#### 按对局长度分层的步数投影（首选口径）');
        lines.push('');
        lines.push('每步成本随对局变长而明显上升，所以"一个统一 ms/step × 全归档步数"仍有偏差。');
        lines.push('下面对归档按步数分桶，每个桶用**同长度桶内实测**的 ms/step 加权，得到分层投影：');
        lines.push('');
        lines.push('| 步数桶 | 归档 episode | 归档步数 | 抽样 episode | 抽样步数 | 桶内实测 ms/step（均值/中位） | 用回退均值? |');
        lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
        for (const bucket of summary.cost.stepStratification ?? []) {
            lines.push(
                `| ${bucket.label} | ${bucket.archiveRecords} | ${bucket.archiveSteps} | ${bucket.sampledEpisodes} | ` +
                `${bucket.sampledSteps} | ${bucket.sampledMsPerStep ?? 'n/a'} / ${bucket.sampledMsPerStepMedian ?? 'n/a'} | ` +
                `${bucket.usedPooledFallback ? '**是**' : '否'} |`
            );
        }
        lines.push('');
        lines.push(`**分层投影：约 ${summary.cost.projectedFullArchiveHoursStepStratified} 小时**（桶内均值口径；` +
            `桶内中位数口径 ${summary.cost.projectedFullArchiveHoursStepStratifiedMedianBasis ?? 'n/a'} 小时，` +
            `区间 ${summary.cost.projectedFullArchiveHoursStepStratifiedBand?.[0] ?? 'n/a'} – ${summary.cost.projectedFullArchiveHoursStepStratifiedBand?.[1] ?? 'n/a'} 小时）。`);
        lines.push('这是**首选**的成本口径：它把"归档真实步数分布"（实测）与"同长度段的每步成本"（抽样实测）结合，');
        lines.push('只剩每步成本的不确定性；但最大的桶（15000+ 步，占归档 59% 的步数）只有少量抽样 episode 支撑，这一点必须计入不确定性。');
        lines.push('');
        if (summary.cost.linearFit) {
            const fit = summary.cost.linearFit;
            lines.push(`为什么用分桶而不是线性模型：对 ${fit.n} 个 PASS episode 拟合 \`elapsedMs = 固定成本 + 每步成本 × steps\` 得到 ` +
                `截距 **${fit.interceptMs} ms**（${fit.interceptIsPositive ? '正' : '**负**'}）、斜率 ${fit.msPerStep} ms/step、R²=${fit.r2}。`);
            lines.push(`${fit.note}。`);
            lines.push('');
        }
    }
    lines.push(`外推依据：${summary.cost.projectionBasis}。`);
    lines.push('');
    lines.push(`外推假设：${summary.cost.projectionAssumption}。`);
    lines.push(`这是基于 ${summary.passed} 个重放成功的 episode 的**投影**：若归档中未抽到的 episode 步数分布与样本不同，投影会偏移；`);
    lines.push('`env.reset` 与每步 observation/合法动作构造是主要成本项，随对局步数增长，所以步数分布是投影误差的主要来源。');
    lines.push('（索引阶段成本不随 episode 数增长，可忽略。）');
    lines.push('');
    lines.push('## 验证边界（必须如实阅读）');
    lines.push('');
    lines.push('本次 gate 复用 `tools/skirmish_dataset_export.ts::replayEpisodeDatasetItems`，它检查：');
    lines.push('');
    for (const item of summary.verificationBoundary.checked) lines.push(`- ${item}`);
    lines.push('');
    lines.push('它**没有**检查（因此 PASS 弱于"逐步 state hash 全等"的重放）：');
    lines.push('');
    for (const item of summary.verificationBoundary.notChecked) lines.push(`- ${item}`);
    lines.push('');
    lines.push('结论口径：PASS 表示"初始 observation 完全一致 **且** 每一步的 actionCode/reward/done/winner 与事件流一致"，');
    lines.push('**不表示**每一步的完整内部状态逐位一致，也**不表示**日志里的经济字段可复现。');
    lines.push('');
    lines.push('### 反向对照（negative control）：这个 gate 不是空验证');
    lines.push('');
    lines.push(`- ${summary.negativeControl.description}`);
    lines.push(`- 全部符合预期：${summary.negativeControl.allAsExpected ? '是' : '否'}`);
    lines.push('');
    if (summary.negativeControl.results.length > 0) {
        lines.push('| 破坏方式 | 是否抛错 | 观察到的类别 | 期望类别 | 是否符合预期 | 耗时 ms |');
        lines.push('| --- | --- | --- | --- | --- | ---: |');
        for (const item of summary.negativeControl.results) {
            lines.push(
                `| ${item.mutation} | ${item.threw ? '是' : '否'} | \`${item.observedCategory ?? 'null'}\` | ` +
                `\`${item.expectedCategory}\` | ${item.asExpected ? '是' : '**否**'} | ${item.elapsedMs} |`
            );
        }
        lines.push('');
        lines.push('反向对照只在内存副本上进行，`training_runs/episodes/**` 未被写入或修改。');
    } else {
        lines.push('反向对照未能运行（见 JSON `summary.negativeControl`）。');
    }
    lines.push('');
    lines.push('## 环境可重建性（本任务的核心问题）');
    lines.push('');
    lines.push('`scenario.id` 形如 `SDPLAN:<planId>:<mapName>`；`tools/skirmish_dataset_export.ts::createDefaultEnvFactory` 正是这样还原环境的：');
    lines.push('');
    lines.push('1. `parseSdPlanScenarioId(scenario.id)` → `{ planId, mapName }`（纯字符串解析，planId 与地图都来自 `scenario.id`）；');
    lines.push('2. `getSdTrainingPlanEntry(config, planId)` 从 `training_configs/sd_training_plan_20260705.json` 取 `setup` 与 `kind`（决定是否走派生局面 `deriveSdTrainingState`）；');
    lines.push('3. 地图场景 id `SD:<mapName>` 从 APK 解包目录 `APK/_analysis/unpack` 读加密 `.aem`（需要 legacy OpenSSL provider）；');
    lines.push('4. `createSdTrainingGameState(map, scenario, config, plan, episode.seed)` 生成初始状态，`maxPlies` 取自 episode 记录。');
    lines.push('');
    lines.push('**结论（有证据）：仅凭 `scenario.id` 不足以还原环境。** `scenario.id` 唯一确定了 planId 与地图，但');
    lines.push('initialGold / unitLimit / levelCap 与"是否派生"这些**决定初始状态**的参数并不在 episode 记录里，');
    lines.push('必须来自外部 `sd_training_plan_20260705.json`；地图还必须能从 APK 解包目录解密读出。');
    lines.push('因此一条 episode 可重放 = `scenario.id` + `seed` + `maxPlies`（记录内）+ 同版本训练计划 JSON + APK 地图（记录外）。');
    lines.push('本次 PASS 同时构成"该外部配置与生成时一致"的间接证据：初始 observation hash 对 setup 变化极其敏感，');
    lines.push('若 plan 的 setup 与生成时不同，第一步之前就会以 `initial-observation-hash-mismatch` 抛出（本次已单独验证该门禁会触发，见下）。');
    lines.push('');
    lines.push('逐 episode 的 `planId` / `planKind` / `planSetup` / `mapScenarioId` 已写入 `sd_replay_pilot.json`。');
    lines.push('');
    lines.push('### 旁证：seed 与训练计划的生成公式一致');
    lines.push('');
    if (summary.seedFormulaCheck?.available) {
        const check = summary.seedFormulaCheck;
        lines.push(`- 公式（来自 \`tools/sd_training_state_generator.ts::buildSdTrainingJobs\`）：\`${check.formula}\``);
        lines.push(`- 可核对样本：${check.checked} 个（有 planId / mapName / seed 的 episode）`);
        lines.push(`- 落在期望 seed 窗口内的：**${check.matched} / ${check.checked}**`);
        if (check.mismatches.length > 0) {
            lines.push('');
            lines.push('不匹配样例（说明归档可能来自不同的 mapNames 顺序或不同 seedBase）：');
            lines.push('');
            lines.push('| scenario.id | seed | 期望窗口 | 原因 |');
            lines.push('| --- | ---: | --- | --- |');
            for (const item of check.mismatches) {
                lines.push(`| \`${item.scenarioId ?? 'n/a'}\` | ${item.seed ?? 'n/a'} | ${item.expectedWindow ?? 'n/a'} | ${item.reason} |`);
            }
        }
    } else {
        lines.push('SD 训练计划未加载，未能核对 seed 公式。');
    }
    lines.push('');
    lines.push('这一旁证的意义：seed 与 `(planId, mapName, episodeIndex)` 的对应关系由同一个计划 JSON 决定，');
    lines.push('因此 seed 全部落在公式窗口内，说明**归档与 HEAD 上的训练计划配置同源**，而不只是"重放恰好通过"。');
    lines.push('');

    return `${lines.join('\n')}\n`;
}

function toPosix(value: string): string {
    return value.replace(/\\/g, '/');
}

function escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
