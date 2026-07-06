import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clearScreenDown, moveCursor } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { AncientEmpiresEnv } from '../src/game/env';
import { getTurnPlayerIds } from '../src/game/rule_config';
import {
    getApkSkirmishTrainingScenario,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import type { ApkAemMap } from '../src/game/apk_map';
import { loadBcModel, type SkirmishBcModel } from './skirmish_bc_train';
import {
    createPresetPolicyFactory,
    readApkSkirmishTrainingMap,
    runSkirmishEpisode,
    summarizeSkirmishEpisodes,
    type BaselinePolicyPreset,
    type SkirmishEpisodeProgress,
    type SkirmishEpisodeRecord
} from './skirmish_training_runner';
import {
    buildSdTrainingJobs,
    createSdTrainingGameState,
    getSdTrainingPlanEntry,
    isDerivedSdPlan,
    loadSdTrainingPlanConfig,
    type SdTrainingJobSpec,
    type SdTrainingPlanConfig,
    type SdTrainingPlanEntry
} from './sd_training_state_generator';

interface SdTrainingPlanRunnerOptions {
    planFile: string;
    unpackDir: string;
    planIds: string[];
    limitJobs: number | null;
    run: boolean;
    preset: BaselinePolicyPreset | null;
    modelFile: string | null;
    maxTurns: number | null;
    outDir: string | null;
    workers: number;
    progress: boolean;
    progressTurnInterval: number;
    json: boolean;
}

type SdTrainingEnvOptions = Pick<SdTrainingPlanRunnerOptions, 'unpackDir' | 'maxTurns'>;

interface SdTrainingWorkerJob {
    index: number;
    job: SdTrainingJobSpec;
}

interface SdTrainingWorkerData {
    workerId: number;
    config: SdTrainingPlanConfig;
    options: Pick<
        SdTrainingPlanRunnerOptions,
        'unpackDir' | 'preset' | 'modelFile' | 'maxTurns' | 'progress' | 'progressTurnInterval'
    >;
}

type SdTrainingWorkerMessage =
    | { type: 'ready'; workerId: number }
    | { type: 'progress'; progress: SkirmishEpisodeProgress }
    | { type: 'episode'; workerId: number; index: number; episode: SkirmishEpisodeRecord }
    | { type: 'done'; workerId: number }
    | { type: 'error'; workerId: number; message: string; stack?: string };

type SdTrainingWorkerCommand =
    | { type: 'job'; item: SdTrainingWorkerJob }
    | { type: 'shutdown' };

interface PreparedJobSummary {
    job: SdTrainingJobSpec;
    legalActionCount: number;
    fixedActionSpaceSize: number;
    playerCount: number;
    error: string | null;
}

interface PlanRunnerSummary {
    generatedAt: string;
    planFile: string;
    jobManifest: string;
    prepareReport: string;
    selectedJobs: number;
    smokeChecked: number;
    smokeFailed: number;
    run: {
        enabled: boolean;
        workers: number;
        episodeFiles: string[];
        episodes: number;
    };
    byPlan: Record<string, {
        label: string;
        kind: string;
        jobs: number;
        smokeFailed: number;
    }>;
}

const DEFAULT_PLAN_FILE = path.resolve(process.cwd(), 'training_configs', 'sd_training_plan_20260705.json');
const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);
const SD_TRAINING_PRESETS: BaselinePolicyPreset[] = [
    'heuristic',
    'apk-like',
    'apk-like-vs-heuristic',
    'heuristic-vs-apk-like',
    'heuristic-apk-like-balanced',
    'bc',
    'bc-vs-heuristic',
    'bc-hybrid',
    'bc-hybrid-vs-heuristic',
    'bc-blend',
    'bc-blend-vs-heuristic'
];

function printHelp() {
    console.log(`用法: npm run sd:training-plan -- [选项]

选项:
  --plan <file>        SD 训练计划 JSON，默认 training_configs/sd_training_plan_20260705.json
  --unpack <dir>       APK 解包目录，默认 APK/_analysis/unpack
  --plan-id <id>       只处理指定方案，可重复
  --limit-jobs <n>     最多处理 n 个 job，用于 smoke
  --run                生成 episode；默认只生成 job manifest 和 smoke 报告
  --preset <name>      覆盖计划默认 preset；SD 正式训练不允许 random。
                       可选值：heuristic、apk-like、apk-like-vs-heuristic、heuristic-vs-apk-like、
                       heuristic-apk-like-balanced、bc、bc-vs-heuristic、bc-hybrid、
                       bc-hybrid-vs-heuristic、bc-blend、bc-blend-vs-heuristic
  --model <file>       使用 bc 相关 preset 时指定模型
  --max-turns <n>      覆盖计划默认最大回合数，当前计划默认 200
  --out-dir <dir>      episode 输出目录，默认使用计划 paths.episodeDir
  --workers <n>        并行 worker 数，默认 1；例如 --workers 5
  --progress-turn-interval <n>  每 n 回合输出一次 worker 进度，默认 5
  --no-progress        关闭训练进度显示
  --json               输出 JSON 摘要
  --help               显示帮助
`);
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

function parsePreset(value: string | undefined): BaselinePolicyPreset {
    if (value && SD_TRAINING_PRESETS.includes(value as BaselinePolicyPreset)) return value as BaselinePolicyPreset;
    throw new Error(`SD 正式训练不允许 random 相关 preset，未知或不可用 preset: ${value}`);
}

function resolveTrainingPreset(preset: string | null | undefined): BaselinePolicyPreset {
    if (preset && SD_TRAINING_PRESETS.includes(preset as BaselinePolicyPreset)) {
        return preset as BaselinePolicyPreset;
    }
    throw new Error(`SD 正式训练 preset 必须排除 random，当前值不可用: ${preset ?? 'null'}`);
}

function parseArgs(argv: readonly string[]): SdTrainingPlanRunnerOptions {
    const options: SdTrainingPlanRunnerOptions = {
        planFile: DEFAULT_PLAN_FILE,
        unpackDir: DEFAULT_UNPACK_DIR,
        planIds: [],
        limitJobs: null,
        run: false,
        preset: null,
        modelFile: null,
        maxTurns: null,
        outDir: null,
        workers: 1,
        progress: true,
        progressTurnInterval: 5,
        json: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--plan') {
            const value = argv[++index];
            if (!value) throw new Error('--plan 缺少文件参数');
            options.planFile = path.resolve(value);
        } else if (arg === '--unpack') {
            const value = argv[++index];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--plan-id') {
            const value = argv[++index];
            if (!value) throw new Error('--plan-id 缺少方案 ID');
            options.planIds.push(value);
        } else if (arg === '--limit-jobs') {
            options.limitJobs = parsePositiveInteger(argv[++index], '--limit-jobs');
        } else if (arg === '--run') {
            options.run = true;
        } else if (arg === '--preset') {
            options.preset = parsePreset(argv[++index]);
        } else if (arg === '--model') {
            const value = argv[++index];
            if (!value) throw new Error('--model 缺少文件参数');
            options.modelFile = path.resolve(value);
        } else if (arg === '--max-turns') {
            options.maxTurns = parsePositiveInteger(argv[++index], '--max-turns');
        } else if (arg === '--out-dir') {
            const value = argv[++index];
            if (!value) throw new Error('--out-dir 缺少目录参数');
            options.outDir = path.resolve(value);
        } else if (arg === '--workers') {
            options.workers = parsePositiveInteger(argv[++index], '--workers');
        } else if (arg === '--progress-turn-interval') {
            options.progressTurnInterval = parsePositiveInteger(argv[++index], '--progress-turn-interval');
        } else if (arg === '--no-progress') {
            options.progress = false;
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
}

function selectJobs(config: SdTrainingPlanConfig, options: SdTrainingPlanRunnerOptions): SdTrainingJobSpec[] {
    const requested = new Set(options.planIds);
    let jobs = buildSdTrainingJobs(config).filter(job => requested.size === 0 || requested.has(job.planId));
    if (options.limitJobs !== null) jobs = jobs.slice(0, options.limitJobs);
    return jobs;
}

function ensureScenario(job: SdTrainingJobSpec): ApkSkirmishTrainingScenario {
    const scenario = getApkSkirmishTrainingScenario(`SD:${job.mapName}`);
    if (!scenario) throw new Error(`找不到 SD 训练地图场景: ${job.mapName}`);
    return scenario;
}

async function getMap(
    cache: Map<string, ApkAemMap>,
    unpackDir: string,
    scenario: ApkSkirmishTrainingScenario
): Promise<ApkAemMap> {
    const cached = cache.get(scenario.resourcePath);
    if (cached) return cached;
    const map = await readApkSkirmishTrainingMap(unpackDir, scenario);
    cache.set(scenario.resourcePath, map);
    return map;
}

async function createEnvForJob(
    config: SdTrainingPlanConfig,
    options: SdTrainingEnvOptions,
    job: SdTrainingJobSpec,
    mapCache: Map<string, ApkAemMap>
): Promise<{ env: AncientEmpiresEnv; plan: SdTrainingPlanEntry; scenario: ApkSkirmishTrainingScenario; maxPlies: number; maxSteps: number }> {
    const plan = getSdTrainingPlanEntry(config, job.planId);
    const scenario = ensureScenario(job);
    const map = await getMap(mapCache, options.unpackDir, scenario);
    const state = createSdTrainingGameState(map, scenario, config, plan, job.seed);
    const maxTurns = options.maxTurns ?? job.maxTurns;
    const maxPlies = maxTurns * Math.max(1, getTurnPlayerIds(state).length);
    const maxSteps = maxPlies * 64;
    return {
        env: new AncientEmpiresEnv({
            initialState: state,
            seed: job.seed,
            maxPlies
        }),
        plan,
        scenario,
        maxPlies,
        maxSteps
    };
}

async function smokeCheckJobs(
    config: SdTrainingPlanConfig,
    options: SdTrainingEnvOptions,
    jobs: readonly SdTrainingJobSpec[]
): Promise<PreparedJobSummary[]> {
    const mapCache = new Map<string, ApkAemMap>();
    const seenPlanMap = new Set<string>();
    const summaries: PreparedJobSummary[] = [];
    for (const job of jobs) {
        const key = `${job.planId}|${job.mapName}`;
        if (seenPlanMap.has(key)) continue;
        seenPlanMap.add(key);
        try {
            const { env } = await createEnvForJob(config, options, job, mapCache);
            const result = env.reset(job.seed);
            summaries.push({
                job,
                legalActionCount: result.legalActions.length,
                fixedActionSpaceSize: result.fixedActionSpaceDescriptor.size,
                playerCount: result.observation.players.filter(player => player.isAlive && player.isEnabled).length,
                error: result.legalActions.length > 0 ? null : '初始合法动作为空'
            });
        } catch (error) {
            summaries.push({
                job,
                legalActionCount: 0,
                fixedActionSpaceSize: 0,
                playerCount: 0,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    return summaries;
}

function formatPrepareReport(config: SdTrainingPlanConfig, jobs: readonly SdTrainingJobSpec[], smoke: readonly PreparedJobSummary[]): string {
    const byPlan = new Map<string, { plan: SdTrainingPlanEntry; jobs: number; smoke: number; failed: number }>();
    for (const plan of config.plans) {
        byPlan.set(plan.id, { plan, jobs: 0, smoke: 0, failed: 0 });
    }
    for (const job of jobs) {
        const item = byPlan.get(job.planId);
        if (item) item.jobs += 1;
    }
    for (const item of smoke) {
        const plan = byPlan.get(item.job.planId);
        if (!plan) continue;
        plan.smoke += 1;
        if (item.error) plan.failed += 1;
    }

    const lines = [
        '# SD 训练计划准备报告',
        '',
        `- 计划：\`${config.name}\``,
        `- 模式：${config.mode}`,
        `- 地图数：${config.mapNames.length}`,
        `- job 数：${jobs.length}`,
        `- smoke 检查：${smoke.length}`,
        `- smoke 失败：${smoke.filter(item => item.error).length}`,
        `- feature：f${config.feature.featureDim}/c${config.feature.maxCandidates}/${config.feature.featureExtractor}`,
        '',
        '| 方案 | 类型 | Job | Smoke | 失败 |',
        '| --- | --- | ---: | ---: | ---: |'
    ];
    for (const item of [...byPlan.values()].filter(item => item.jobs > 0)) {
        lines.push(`| ${item.plan.label} (\`${item.plan.id}\`) | ${item.plan.kind} | ${item.jobs} | ${item.smoke} | ${item.failed} |`);
    }

    const failures = smoke.filter(item => item.error);
    if (failures.length > 0) {
        lines.push('', '## Smoke 失败', '', '| 方案 | 地图 | 错误 |', '| --- | --- | --- |');
        for (const item of failures) {
            lines.push(`| \`${item.job.planId}\` | \`${item.job.mapName}\` | ${item.error} |`);
        }
    }
    return `${lines.join('\n')}\n`;
}

async function writeJobManifest(filePath: string, jobs: readonly SdTrainingJobSpec[]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, jobs.map(job => JSON.stringify(job)).join('\n') + '\n', 'utf8');
}

function formatProgressBar(current: number, total: number): string {
    const width = 18;
    const ratio = total > 0 ? Math.min(1, current / total) : 0;
    const filled = Math.max(0, Math.min(width, Math.floor(ratio * width)));
    return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function getDisplayWidth(text: string): number {
    let width = 0;
    for (const char of text) {
        const codePoint = char.codePointAt(0) ?? 0;
        width += codePoint >= 0x1100 ? 2 : 1;
    }
    return width;
}

function truncateDisplayLine(text: string, maxWidth: number): string {
    if (getDisplayWidth(text) <= maxWidth) return text;
    let width = 0;
    let result = '';
    for (const char of text) {
        const codePoint = char.codePointAt(0) ?? 0;
        const charWidth = codePoint >= 0x1100 ? 2 : 1;
        if (width + charWidth > Math.max(0, maxWidth - 1)) break;
        result += char;
        width += charWidth;
    }
    return `${result}…`;
}

function formatProgressEconomyParts(progress: SkirmishEpisodeProgress): string[] {
    return Object.entries(progress.economyByPlayer)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([playerId, economy]) => (
            `P${playerId} 收入${economy.incomeValue ?? 0} 招募${economy.spentValue} 击杀${economy.killValue} 损失${economy.lostValue}`
        ));
}

function createSdProgressReporter(totalJobs: number, workerCount: number) {
    const statuses = new Map<number, SkirmishEpisodeProgress>();
    let completedJobs = 0;
    let lastRenderedLines = 0;

    const writeFrame = (lines: readonly string[]) => {
        const columns = Math.max(60, (process.stderr.columns ?? process.stdout.columns ?? 120) - 1);
        const frameLines = lines.map(line => truncateDisplayLine(line, columns));
        if (lastRenderedLines > 0) {
            moveCursor(process.stderr, 0, -lastRenderedLines);
            clearScreenDown(process.stderr);
        }
        process.stderr.write(`${frameLines.join('\n')}\n`);
        lastRenderedLines = frameLines.length;
    };

    const render = () => {
        const lines = [
            `[进度] 已训练 ${completedJobs}/${totalJobs} 局，workers=${workerCount}`
        ];
        for (let workerId = 1; workerId <= workerCount; workerId += 1) {
            const status = statuses.get(workerId);
            if (!status) {
                lines.push(`W${workerId} 空闲`);
                continue;
            }
            const economyParts = formatProgressEconomyParts(status);
            lines.push(
                `W${workerId} 局 ${status.jobId + 1}/${totalJobs} ${formatProgressBar(status.turn, status.maxTurns)} `
                + `回合 ${status.turn}/${status.maxTurns} 动作 ${status.step} 当前阵营 ${status.currentPlayer} `
                + `${status.scenario.id} seed=${status.seed}`
            );
            lines.push(`   ${economyParts.slice(0, 2).join(' | ')}`);
            if (economyParts.length > 2) lines.push(`   ${economyParts.slice(2).join(' | ')}`);
        }
        writeFrame(lines);
    };

    return {
        update(progress: SkirmishEpisodeProgress) {
            statuses.set(progress.workerId, progress);
            render();
        },
        completeEpisode(workerId: number) {
            completedJobs += 1;
            statuses.delete(workerId);
            render();
        },
        finish() {
            if (completedJobs < totalJobs) render();
        }
    };
}

async function runTrainingJob(
    config: SdTrainingPlanConfig,
    options: SdTrainingEnvOptions,
    job: SdTrainingJobSpec,
    mapCache: Map<string, ApkAemMap>,
    policyFactory: ReturnType<typeof createPresetPolicyFactory>,
    workerId = 1,
    jobId = 0,
    onProgress?: (progress: SkirmishEpisodeProgress) => void,
    progressTurnInterval = 5
): Promise<SkirmishEpisodeRecord> {
    const { env, maxPlies, maxSteps } = await createEnvForJob(config, options, job, mapCache);
    return runSkirmishEpisode({
        env,
        scenario: {
            id: job.scenarioId,
            mode: 'SD',
            mapName: job.mapName,
            resourcePath: ensureScenario(job).resourcePath
        },
        seed: job.seed,
        maxPlies,
        maxSteps,
        policyFactory,
        workerId,
        jobId,
        progressIntervalTurns: progressTurnInterval,
        onProgress
    });
}

async function writeEpisodesByPlan(
    config: SdTrainingPlanConfig,
    options: SdTrainingPlanRunnerOptions,
    jobs: readonly SdTrainingJobSpec[],
    episodesByIndex: readonly SkirmishEpisodeRecord[]
): Promise<{ episodeFiles: string[]; episodes: SkirmishEpisodeRecord[] }> {
    const outDir = options.outDir ?? path.resolve(config.paths.episodeDir);
    const episodeFilesByPlan = new Map<string, string>();
    const initializedEpisodeFiles = new Set<string>();
    const episodes: SkirmishEpisodeRecord[] = [];

    await mkdir(outDir, { recursive: true });
    for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        const episode = episodesByIndex[index];
        if (!episode) throw new Error(`job ${index} 未生成 episode: ${job.planId}/${job.mapName}`);
        const episodeFile = episodeFilesByPlan.get(job.planId) ?? path.join(outDir, `${job.planId}-episodes.jsonl`);
        episodeFilesByPlan.set(job.planId, episodeFile);
        if (!initializedEpisodeFiles.has(episodeFile)) {
            await writeFile(episodeFile, '', 'utf8');
            initializedEpisodeFiles.add(episodeFile);
        }
        await appendFile(episodeFile, `${JSON.stringify(episode)}\n`, 'utf8');
        episodes.push(episode);
    }

    return { episodeFiles: [...episodeFilesByPlan.values()], episodes };
}

function createSdTrainingWorker(payload: SdTrainingWorkerData): Worker {
    const bridge = `
        const { parentPort, workerData } = require('node:worker_threads');
        (async () => {
            const { register } = await import('tsx/esm/api');
            register();
            const mod = await import(workerData.moduleUrl);
            await mod.runSdTrainingPlanWorker(workerData.payload);
        })().catch(error => {
            parentPort.postMessage({
                type: 'error',
                workerId: workerData.payload?.workerId ?? 0,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            process.exit(1);
        });
    `;

    return new Worker(bridge, {
        eval: true,
        workerData: {
            moduleUrl: import.meta.url,
            payload
        }
    });
}

async function runJobsInWorkers(
    config: SdTrainingPlanConfig,
    options: SdTrainingPlanRunnerOptions,
    jobs: readonly SdTrainingJobSpec[],
    workerCount: number,
    progressReporter: ReturnType<typeof createSdProgressReporter> | null
): Promise<{ episodeFiles: string[]; episodes: SkirmishEpisodeRecord[] }> {
    const episodesByIndex: SkirmishEpisodeRecord[] = [];
    let nextJobIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, (_, index) => (
        new Promise<void>((resolve, reject) => {
            const workerId = index + 1;
            const worker = createSdTrainingWorker({
                workerId,
                config,
                options: {
                    unpackDir: options.unpackDir,
                    preset: options.preset,
                    modelFile: options.modelFile,
                    maxTurns: options.maxTurns,
                    progress: options.progress,
                    progressTurnInterval: options.progressTurnInterval
                }
            });

            const assignNextJob = () => {
                const job = jobs[nextJobIndex];
                const jobIndex = nextJobIndex;
                nextJobIndex += 1;
                if (job) {
                    worker.postMessage({
                        type: 'job',
                        item: { index: jobIndex, job }
                    } satisfies SdTrainingWorkerCommand);
                } else {
                    worker.postMessage({ type: 'shutdown' } satisfies SdTrainingWorkerCommand);
                }
            };

            worker.on('message', (message: SdTrainingWorkerMessage) => {
                if (message.type === 'ready') {
                    assignNextJob();
                } else if (message.type === 'progress') {
                    progressReporter?.update(message.progress);
                } else if (message.type === 'episode') {
                    episodesByIndex[message.index] = message.episode;
                    progressReporter?.completeEpisode(message.workerId);
                    assignNextJob();
                } else if (message.type === 'error') {
                    reject(new Error(message.stack ?? message.message));
                }
            });

            worker.on('error', reject);
            worker.on('exit', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`worker ${workerId} 退出码 ${code}`));
                }
            });
        })
    )));

    progressReporter?.finish();
    return writeEpisodesByPlan(config, options, jobs, episodesByIndex);
}

async function runJobs(
    config: SdTrainingPlanConfig,
    options: SdTrainingPlanRunnerOptions,
    jobs: readonly SdTrainingJobSpec[],
    model: SkirmishBcModel | null
): Promise<{ episodeFiles: string[]; episodes: SkirmishEpisodeRecord[] }> {
    const workerCount = Math.max(1, Math.min(options.workers, jobs.length || 1));
    const progressReporter = options.run && options.progress
        ? createSdProgressReporter(jobs.length, workerCount)
        : null;
    if (workerCount > 1) {
        return runJobsInWorkers(config, options, jobs, workerCount, progressReporter);
    }

    const mapCache = new Map<string, ApkAemMap>();
    const preset = resolveTrainingPreset(options.preset ?? config.defaults.preset);
    const policyFactory = createPresetPolicyFactory(preset, model);
    const episodesByIndex: SkirmishEpisodeRecord[] = [];

    for (let index = 0; index < jobs.length; index += 1) {
        episodesByIndex[index] = await runTrainingJob(
            config,
            options,
            jobs[index],
            mapCache,
            policyFactory,
            1,
            index,
            progress => progressReporter?.update(progress),
            options.progressTurnInterval
        );
        progressReporter?.completeEpisode(1);
    }
    progressReporter?.finish();
    return writeEpisodesByPlan(config, options, jobs, episodesByIndex);
}

export async function runSdTrainingPlanWorker(data: SdTrainingWorkerData = workerData as SdTrainingWorkerData) {
    if (!parentPort) return;

    const mapCache = new Map<string, ApkAemMap>();
    const preset = resolveTrainingPreset(data.options.preset ?? data.config.defaults.preset);
    const model = data.options.modelFile ? await loadBcModel(data.options.modelFile) : null;
    const policyFactory = createPresetPolicyFactory(preset, model);

    const postError = (error: unknown) => {
        parentPort?.postMessage({
            type: 'error',
            workerId: data.workerId,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        } satisfies SdTrainingWorkerMessage);
    };

    const runWorkerJob = async (item: SdTrainingWorkerJob) => {
        const episode = await runTrainingJob(
            data.config,
            data.options,
            item.job,
            mapCache,
            policyFactory,
            data.workerId,
            item.index,
            data.options.progress
                ? progress => parentPort?.postMessage({
                    type: 'progress',
                    progress
                } satisfies SdTrainingWorkerMessage)
                : undefined,
            data.options.progressTurnInterval
        );
        parentPort?.postMessage({
            type: 'episode',
            workerId: data.workerId,
            index: item.index,
            episode
        } satisfies SdTrainingWorkerMessage);
    };

    parentPort.on('message', (message: SdTrainingWorkerCommand) => {
        void (async () => {
            if (message.type === 'job') {
                await runWorkerJob(message.item);
            } else {
                parentPort?.postMessage({
                    type: 'done',
                    workerId: data.workerId
                } satisfies SdTrainingWorkerMessage);
                parentPort?.close();
            }
        })().catch(error => {
            postError(error);
            process.exit(1);
        });
    });

    parentPort.postMessage({
        type: 'ready',
        workerId: data.workerId
    } satisfies SdTrainingWorkerMessage);
}

export async function runSdTrainingPlanRunner(options: SdTrainingPlanRunnerOptions): Promise<PlanRunnerSummary> {
    const config = await loadSdTrainingPlanConfig(options.planFile);
    const jobs = selectJobs(config, options);
    const jobManifest = path.resolve(config.paths.jobManifest);
    const prepareReport = path.resolve(config.paths.prepareReport);
    await writeJobManifest(jobManifest, jobs);
    const smoke = await smokeCheckJobs(config, options, jobs);
    await mkdir(path.dirname(prepareReport), { recursive: true });
    await writeFile(prepareReport, formatPrepareReport(config, jobs, smoke), 'utf8');

    const model = options.modelFile ? await loadBcModel(options.modelFile) : null;
    const runResult = options.run
        ? await runJobs(config, options, jobs, model)
        : { episodeFiles: [], episodes: [] };
    const byPlan: PlanRunnerSummary['byPlan'] = {};
    for (const plan of config.plans) {
        const planJobs = jobs.filter(job => job.planId === plan.id);
        if (planJobs.length === 0) continue;
        byPlan[plan.id] = {
            label: plan.label,
            kind: plan.kind,
            jobs: planJobs.length,
            smokeFailed: smoke.filter(item => item.job.planId === plan.id && item.error).length
        };
    }

    return {
        generatedAt: new Date().toISOString(),
        planFile: path.resolve(options.planFile),
        jobManifest,
        prepareReport,
        selectedJobs: jobs.length,
        smokeChecked: smoke.length,
        smokeFailed: smoke.filter(item => item.error).length,
        run: {
            enabled: options.run,
            workers: options.run ? Math.max(1, Math.min(options.workers, jobs.length || 1)) : 0,
            episodeFiles: runResult.episodeFiles,
            episodes: runResult.episodes.length
        },
        byPlan
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const summary = await runSdTrainingPlanRunner(options);
    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
        return;
    }
    console.log(`已生成 job manifest：${summary.jobManifest}`);
    console.log(`已生成准备报告：${summary.prepareReport}`);
    if (summary.run.enabled) {
        console.log(`已生成 episode：${summary.run.episodes}，workers=${summary.run.workers}`);
        for (const file of summary.run.episodeFiles) console.log(`- ${file}`);
    }
}

const isDirectRun = DIRECT_RUN_PATH === THIS_FILE_PATH;
if (isMainThread && isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
