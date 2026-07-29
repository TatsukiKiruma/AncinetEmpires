import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AncientEmpiresEnv,
    type EnvStepResult,
    type FixedActionSpaceDescriptor,
    type Observation
} from '../src/game/env';
import {
    createApkSkirmishTrainingEnv,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import type { Action } from '../src/game/types';
import type { ApkAemMap } from '../src/game/apk_map';
import {
    createSdTrainingGameState,
    getSdTrainingPlanEntry,
    loadSdTrainingPlanConfig,
    parseSdPlanScenarioId,
    type SdTrainingPlanConfig
} from './sd_training_state_generator';
import { parseEpisodeJsonl } from './skirmish_training_eval';
import {
    readApkSkirmishTrainingMap,
    type SkirmishEpisodeRecord,
    type SkirmishEpisodeScenario,
    type SkirmishEpisodeStep
} from './skirmish_training_runner';

export type DatasetObservationMode = 'full' | 'none';

export interface SkirmishDatasetExportOptions {
    inputFiles: string[];
    outFile: string;
    unpackDir: string;
    sdTrainingPlanFile?: string | null;
    excludeTimeout: boolean;
    excludeStoppedByMaxSteps: boolean;
    excludeIllegal: boolean;
    includeScenarioIds: string[];
    excludeScenarioIds: string[];
    limitEpisodes: number | null;
    limitSamples: number | null;
    observationMode: DatasetObservationMode;
    json: boolean;
    envFactory?: SkirmishDatasetEnvFactory;
}

export interface SkirmishDatasetEnvFactory {
    createEnv(episode: SkirmishEpisodeRecord): Promise<AncientEmpiresEnv> | AncientEmpiresEnv;
}

export interface SkirmishDatasetSample {
    kind: 'skirmish_dataset_sample';
    version: 1;
    source: {
        inputFile?: string;
        episodeIndex?: number;
        stepIndex: number;
    };
    scenario: SkirmishEpisodeScenario;
    seed: number;
    maxPlies: number;
    maxSteps: number;
    initialObservationHash: string;
    fixedActionSpaceSize: number;
    step: number;
    turn: number;
    playerId: number;
    policy: string;
    legalActionCount: number;
    fixedLegalActionCount: number;
    fixedActionSpaceDescriptor: FixedActionSpaceDescriptor;
    fixedLegalActionIndexes: number[];
    legalActionCodes: string[];
    observation?: Observation;
    label: {
        fixedActionIndex: number;
        actionCode: string;
        action: Action;
    };
    outcome: {
        reward: number;
        done: boolean;
        winnerAfter: number | null;
        illegal: boolean;
    };
}

export interface ReplayDatasetOptions {
    observationMode?: DatasetObservationMode;
    inputFile?: string;
    episodeIndex?: number;
}

export interface ReplayedDatasetItem {
    sample: SkirmishDatasetSample;
    result: EnvStepResult;
}

export interface SkirmishDatasetScenarioSummary {
    episodes: number;
    samples: number;
}

export interface SkirmishDatasetExportSummary {
    inputFiles: string[];
    outputFile: string;
    observationMode: DatasetObservationMode;
    inputEpisodes: number;
    exportedEpisodes: number;
    skippedEpisodes: number;
    exportedSamples: number;
    skippedByReason: Record<string, number>;
    byScenario: Record<string, SkirmishDatasetScenarioSummary>;
    sampleLimitReached: boolean;
}

interface LoadedEpisode {
    episode: SkirmishEpisodeRecord;
    inputFile: string;
    inputIndex: number;
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_DATASET_DIR = path.resolve(process.cwd(), 'training_runs', 'datasets');
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_DATASET_DIR, `skirmish-dataset-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run export:skirmish:dataset -- --input <file> --out <file> [选项]

选项:
  --input <file>            skirmish baseline episode JSONL，可重复
  --out <file>              dataset JSONL 输出文件，默认 training_runs/datasets/skirmish-dataset-时间戳.jsonl
  --unpack <dir>            APK 解包目录，默认 APK/_analysis/unpack
  --sd-training-plan <file>  SD 训练计划 JSON；用于复现 SDPLAN 派生局面 episode
  --scenario <id>           只导出指定场景，可重复
  --exclude-scenario <id>   排除指定场景，可重复
  --exclude-timeout         跳过超时裁定 episode，默认开启
  --include-timeout         保留超时裁定 episode
  --exclude-stopped         跳过 runner 步数保护停止 episode，默认开启
  --include-stopped         保留 runner 步数保护停止 episode
  --limit-episodes <n>      最多导出 n 个通过过滤的 episode
  --limit-samples <n>       最多导出 n 条 step 样本
  --observation <full|none> observation 导出模式，默认 full
  --json                    摘要输出 JSON
  --help                    显示帮助
`);
}

function parseInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${label} 必须是整数`);
    return parsed;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    const parsed = parseInteger(value, label);
    if (parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

function parseObservationMode(value: string | undefined): DatasetObservationMode {
    if (value === 'full' || value === 'none') return value;
    throw new Error('--observation 只能是 full 或 none');
}

export function parseDatasetExportArgs(argv: readonly string[]): SkirmishDatasetExportOptions {
    const options: SkirmishDatasetExportOptions = {
        inputFiles: [],
        outFile: defaultOutFile(),
        unpackDir: DEFAULT_UNPACK_DIR,
        sdTrainingPlanFile: null,
        excludeTimeout: true,
        excludeStoppedByMaxSteps: true,
        excludeIllegal: true,
        includeScenarioIds: [],
        excludeScenarioIds: [],
        limitEpisodes: null,
        limitSamples: null,
        observationMode: 'full',
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--input') {
            const value = argv[++i];
            if (!value) throw new Error('--input 缺少文件参数');
            options.inputFiles.push(path.resolve(value));
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--unpack') {
            const value = argv[++i];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--sd-training-plan') {
            const value = argv[++i];
            if (!value) throw new Error('--sd-training-plan 缺少文件参数');
            options.sdTrainingPlanFile = path.resolve(value);
        } else if (arg === '--scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--scenario 缺少场景 ID');
            options.includeScenarioIds.push(value);
        } else if (arg === '--exclude-scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--exclude-scenario 缺少场景 ID');
            options.excludeScenarioIds.push(value);
        } else if (arg === '--exclude-timeout') {
            options.excludeTimeout = true;
        } else if (arg === '--include-timeout') {
            options.excludeTimeout = false;
        } else if (arg === '--exclude-stopped') {
            options.excludeStoppedByMaxSteps = true;
        } else if (arg === '--include-stopped') {
            options.excludeStoppedByMaxSteps = false;
        } else if (arg === '--limit-episodes') {
            options.limitEpisodes = parsePositiveInteger(argv[++i], '--limit-episodes');
        } else if (arg === '--limit-samples') {
            options.limitSamples = parsePositiveInteger(argv[++i], '--limit-samples');
        } else if (arg === '--observation') {
            options.observationMode = parseObservationMode(argv[++i]);
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.inputFiles.length === 0) {
        throw new Error('请用 --input 指定至少一个 episode JSONL 文件');
    }

    return options;
}

function hashJson(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertReplayState(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    result: EnvStepResult,
    stepIndex: number
) {
    if (result.done) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步前环境已终局`);
    }
    if (step.illegal) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步是非法动作，不能导出为监督标签`);
    }
    if (result.observation.currentPlayer !== step.playerId) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步玩家错位：日志 P${step.playerId}，重放 P${result.observation.currentPlayer}`);
    }
    if (result.observation.turn !== step.turnBefore) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步回合错位：日志 ${step.turnBefore}，重放 ${result.observation.turn}`);
    }
    if (result.legalActions.length !== step.legalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步合法动作数错位：日志 ${step.legalActionCount}，重放 ${result.legalActions.length}`);
    }
    if (result.fixedLegalActionIndexes.length !== step.fixedLegalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步固定合法动作数错位：日志 ${step.fixedLegalActionCount}，重放 ${result.fixedLegalActionIndexes.length}`);
    }
    if (stepIndex + 1 !== step.step) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} step 序号不连续：期望 ${stepIndex + 1}，实际 ${step.step}`);
    }
}

function assertNextResult(
    episode: SkirmishEpisodeRecord,
    step: SkirmishEpisodeStep,
    nextResult: EnvStepResult
) {
    if (nextResult.reward !== step.reward) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 reward 错位：日志 ${step.reward}，重放 ${nextResult.reward}`);
    }
    if (nextResult.done !== step.done) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 done 错位：日志 ${step.done}，重放 ${nextResult.done}`);
    }
    if (nextResult.state.winner !== step.winnerAfter) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步 winner 错位：日志 ${step.winnerAfter}，重放 ${nextResult.state.winner}`);
    }
}

export function* replayEpisodeDatasetItems(
    episode: SkirmishEpisodeRecord,
    env: AncientEmpiresEnv,
    options: ReplayDatasetOptions = {}
): Generator<ReplayedDatasetItem> {
    const observationMode = options.observationMode ?? 'full';
    let result = env.reset(episode.seed);
    const initialObservationHash = hashJson(result.observation);

    if (initialObservationHash !== episode.initialObservationHash) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 初始 observation hash 不一致`);
    }
    if (result.legalActions.length !== episode.initialLegalActionCount) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 初始合法动作数不一致`);
    }
    if (result.fixedActionSpaceDescriptor.size !== episode.fixedActionSpaceSize) {
        throw new Error(`${episode.scenario.id} seed=${episode.seed} 固定动作空间大小不一致`);
    }

    for (let index = 0; index < episode.steps.length; index += 1) {
        const step = episode.steps[index];
        assertReplayState(episode, step, result, index);

        const selectedEntry = result.legalActionEntries.find(entry => entry.fixedActionIndex === step.fixedActionIndex);
        if (!selectedEntry || selectedEntry.fixedActionIndex === null) {
            throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步固定动作索引不合法：${step.fixedActionIndex}`);
        }
        if (selectedEntry.code !== step.actionCode) {
            throw new Error(`${episode.scenario.id} seed=${episode.seed} 第 ${step.step} 步动作编码错位：日志 ${step.actionCode}，重放 ${selectedEntry.code}`);
        }

        const sample: SkirmishDatasetSample = {
            kind: 'skirmish_dataset_sample',
            version: 1,
            source: {
                inputFile: options.inputFile,
                episodeIndex: options.episodeIndex,
                stepIndex: index
            },
            scenario: episode.scenario,
            seed: episode.seed,
            maxPlies: episode.maxPlies,
            maxSteps: episode.maxSteps,
            initialObservationHash: episode.initialObservationHash,
            fixedActionSpaceSize: episode.fixedActionSpaceSize,
            step: step.step,
            turn: step.turnBefore,
            playerId: step.playerId,
            policy: step.policy,
            legalActionCount: step.legalActionCount,
            fixedLegalActionCount: step.fixedLegalActionCount,
            fixedActionSpaceDescriptor: result.fixedActionSpaceDescriptor,
            fixedLegalActionIndexes: result.fixedLegalActionIndexes,
            legalActionCodes: result.legalActionCodes,
            ...(observationMode === 'full' ? { observation: result.observation } : {}),
            label: {
                fixedActionIndex: selectedEntry.fixedActionIndex,
                actionCode: selectedEntry.code,
                action: selectedEntry.action
            },
            outcome: {
                reward: step.reward,
                done: step.done,
                winnerAfter: step.winnerAfter,
                illegal: step.illegal
            }
        };
        yield { sample, result };

        const nextResult = env.stepAction(selectedEntry.action);
        assertNextResult(episode, step, nextResult);
        result = nextResult;
    }
}

export function replayEpisodeToDatasetSamples(
    episode: SkirmishEpisodeRecord,
    env: AncientEmpiresEnv,
    options: ReplayDatasetOptions = {}
): SkirmishDatasetSample[] {
    return [...replayEpisodeDatasetItems(episode, env, options)].map(item => item.sample);
}

function incrementCounter(counters: Record<string, number>, key: string) {
    counters[key] = (counters[key] ?? 0) + 1;
}

function getSkipReason(episode: SkirmishEpisodeRecord, options: SkirmishDatasetExportOptions): string | null {
    const includeScenarios = new Set(options.includeScenarioIds);
    const excludeScenarios = new Set(options.excludeScenarioIds);

    if (includeScenarios.size > 0 && !includeScenarios.has(episode.scenario.id)) return 'scenario-not-included';
    if (excludeScenarios.has(episode.scenario.id)) return 'scenario-excluded';
    if (options.excludeTimeout && episode.summary.timeout) return 'timeout';
    if (options.excludeStoppedByMaxSteps && episode.summary.stoppedByMaxSteps) return 'stopped-by-max-steps';
    if (options.excludeIllegal && (episode.summary.illegalActionCount > 0 || episode.steps.some(step => step.illegal))) return 'illegal-action';
    return null;
}

async function readEpisodes(inputFiles: readonly string[]): Promise<LoadedEpisode[]> {
    const groups = await Promise.all(inputFiles.map(async inputFile => {
        const episodes = parseEpisodeJsonl(await readFile(inputFile, 'utf8'), inputFile);
        return episodes.map((episode, inputIndex) => ({ episode, inputFile, inputIndex }));
    }));
    return groups.flat();
}

export async function createDefaultEnvFactory(
    unpackDir: string,
    sdTrainingPlanFile: string | null
): Promise<SkirmishDatasetEnvFactory> {
    const scenarioById = new Map<string, ApkSkirmishTrainingScenario>(
        getApkSkirmishTrainingScenarios().map(scenario => [scenario.id, scenario])
    );
    const mapCache = new Map<string, ApkAemMap>();
    const sdTrainingPlan = sdTrainingPlanFile ? await loadSdTrainingPlanConfig(sdTrainingPlanFile) : null;

    return {
        async createEnv(episode) {
            const derivedScenario = parseSdPlanScenarioId(episode.scenario.id);
            if (derivedScenario) {
                if (!sdTrainingPlan) {
                    throw new Error(`episode ${episode.scenario.id} 是 SD 派生局面，请提供 --sd-training-plan`);
                }
                return createSdPlanEpisodeEnv(episode, unpackDir, scenarioById, mapCache, sdTrainingPlan, derivedScenario);
            }

            const scenario = scenarioById.get(episode.scenario.id);
            if (!scenario) {
                throw new Error(`未知 APK skirmish 训练场景，无法重放: ${episode.scenario.id}`);
            }
            const cachedMap = mapCache.get(scenario.resourcePath);
            const map = cachedMap ?? await readApkSkirmishTrainingMap(unpackDir, scenario);
            mapCache.set(scenario.resourcePath, map);
            return createApkSkirmishTrainingEnv(map, scenario, {
                seed: episode.seed,
                maxPlies: episode.maxPlies
            });
        }
    };
}

async function createSdPlanEpisodeEnv(
    episode: SkirmishEpisodeRecord,
    unpackDir: string,
    scenarioById: Map<string, ApkSkirmishTrainingScenario>,
    mapCache: Map<string, ApkAemMap>,
    sdTrainingPlan: SdTrainingPlanConfig,
    derivedScenario: { planId: string; mapName: string }
): Promise<AncientEmpiresEnv> {
    const plan = getSdTrainingPlanEntry(sdTrainingPlan, derivedScenario.planId);
    const scenarioId = `SD:${derivedScenario.mapName}`;
    const scenario = scenarioById.get(scenarioId);
    if (!scenario) {
        throw new Error(`未知 SD 训练地图场景，无法重放派生局面: ${scenarioId}`);
    }
    const cachedMap = mapCache.get(scenario.resourcePath);
    const map = cachedMap ?? await readApkSkirmishTrainingMap(unpackDir, scenario);
    mapCache.set(scenario.resourcePath, map);
    return new AncientEmpiresEnv({
        initialState: createSdTrainingGameState(map, scenario, sdTrainingPlan, plan, episode.seed),
        seed: episode.seed,
        maxPlies: episode.maxPlies
    });
}

function ensureScenarioSummary(
    byScenario: Record<string, SkirmishDatasetScenarioSummary>,
    scenarioId: string
): SkirmishDatasetScenarioSummary {
    byScenario[scenarioId] ??= { episodes: 0, samples: 0 };
    return byScenario[scenarioId];
}

export async function exportSkirmishDataset(options: SkirmishDatasetExportOptions): Promise<SkirmishDatasetExportSummary> {
    const loadedEpisodes = await readEpisodes(options.inputFiles);
    const skippedByReason: Record<string, number> = {};
    const envFactory = options.envFactory ?? await createDefaultEnvFactory(options.unpackDir, options.sdTrainingPlanFile ?? null);
    const byScenario: Record<string, SkirmishDatasetScenarioSummary> = {};
    let exportedEpisodes = 0;
    let skippedEpisodes = 0;
    let exportedSamples = 0;
    let sampleLimitReached = false;

    await mkdir(path.dirname(options.outFile), { recursive: true });
    const output = await open(options.outFile, 'w');
    try {
        for (const loaded of loadedEpisodes) {
            const skipReason = getSkipReason(loaded.episode, options);
            if (skipReason) {
                skippedEpisodes += 1;
                incrementCounter(skippedByReason, skipReason);
                continue;
            }
            if (options.limitEpisodes !== null && exportedEpisodes >= options.limitEpisodes) {
                skippedEpisodes += 1;
                incrementCounter(skippedByReason, 'episode-limit');
                continue;
            }
            if (sampleLimitReached) {
                skippedEpisodes += 1;
                incrementCounter(skippedByReason, 'sample-limit');
                continue;
            }

            const env = await envFactory.createEnv(loaded.episode);
            const samples = replayEpisodeToDatasetSamples(loaded.episode, env, {
                observationMode: options.observationMode,
                inputFile: loaded.inputFile,
                episodeIndex: loaded.inputIndex
            });
            const scenarioSummary = ensureScenarioSummary(byScenario, loaded.episode.scenario.id);
            scenarioSummary.episodes += 1;
            exportedEpisodes += 1;

            for (const sample of samples) {
                if (options.limitSamples !== null && exportedSamples >= options.limitSamples) {
                    sampleLimitReached = true;
                    break;
                }
                await output.write(`${JSON.stringify(sample)}\n`, undefined, 'utf8');
                exportedSamples += 1;
                scenarioSummary.samples += 1;
            }
        }
    } finally {
        await output.close();
    }

    return {
        inputFiles: options.inputFiles,
        outputFile: options.outFile,
        observationMode: options.observationMode,
        inputEpisodes: loadedEpisodes.length,
        exportedEpisodes,
        skippedEpisodes,
        exportedSamples,
        skippedByReason,
        byScenario,
        sampleLimitReached
    };
}

export function formatSkirmishDatasetExportSummary(summary: SkirmishDatasetExportSummary): string {
    const lines = [
        '# Skirmish dataset 导出摘要',
        '',
        `- 输出文件：\`${summary.outputFile}\``,
        `- 输入 episode：${summary.inputEpisodes}`,
        `- 导出 episode：${summary.exportedEpisodes}`,
        `- 跳过 episode：${summary.skippedEpisodes}`,
        `- 导出样本：${summary.exportedSamples}`,
        `- observation 模式：${summary.observationMode}`,
        `- 样本上限触发：${summary.sampleLimitReached ? '是' : '否'}`
    ];

    if (Object.keys(summary.skippedByReason).length > 0) {
        lines.push('', '| 跳过原因 | Episode |', '| --- | ---: |');
        for (const [reason, count] of Object.entries(summary.skippedByReason).sort()) {
            lines.push(`| ${reason} | ${count} |`);
        }
    }

    lines.push('', '| 场景 | Episode | 样本 |', '| --- | ---: | ---: |');
    for (const [scenarioId, item] of Object.entries(summary.byScenario).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| \`${scenarioId}\` | ${item.episodes} | ${item.samples} |`);
    }

    return `${lines.join('\n')}\n`;
}

async function main() {
    const options = parseDatasetExportArgs(process.argv.slice(2));
    const summary = await exportSkirmishDataset(options);

    if (options.json) {
        console.log(JSON.stringify({ summary }, null, 2));
    } else {
        console.log(formatSkirmishDatasetExportSummary(summary));
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
