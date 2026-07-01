import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { AncientEmpiresEnv, calculateArmyValue, encodeAction, encodeFixedActionIndex, type EnvStepResult } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { RandomAI } from '../src/game/ai/random_ai';
import { parseApkAemMap, type ApkAemMap } from '../src/game/apk_map';
import {
    createApkSkirmishTrainingEnv,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import { UNIT_CONFIGS } from '../src/game/constants';
import { getAllianceId, getTurnPlayerIds, getUnitCost } from '../src/game/rule_config';
import type { Action, ApkSkirmishMode, GameState, Unit } from '../src/game/types';
import { decryptApkResourceBytes } from './apk_resource_crypto';

export type BaselinePolicyPreset = 'random' | 'heuristic' | 'heuristic-vs-random';

export interface SkirmishPolicyContext {
    result: EnvStepResult;
    playerId: number;
    stepNumber: number;
    episodeSeed: number;
    scenario: SkirmishEpisodeScenario;
}

export interface SkirmishPolicy {
    name: string;
    selectFixedActionIndex(context: SkirmishPolicyContext): number;
}

export type SkirmishPolicyFactory = (
    playerId: number,
    playerIds: readonly number[],
    episodeSeed: number
) => SkirmishPolicy;

export interface SkirmishEpisodeScenario {
    id: string;
    mode: string;
    mapName: string;
    resourcePath: string;
}

export interface SkirmishEpisodePlayer {
    id: number;
    allianceId: number;
    policy: string;
}

export interface SkirmishEpisodeStep {
    step: number;
    turnBefore: number;
    playerId: number;
    policy: string;
    legalActionCount: number;
    fixedLegalActionCount: number;
    fixedActionIndex: number;
    actionCode: string | null;
    reward: number;
    done: boolean;
    winnerAfter: number | null;
    info: string;
    illegal: boolean;
    spendValue: number;
    killValueByPlayer: Record<number, number>;
}

export interface SkirmishPlayerEconomy {
    spentValue: number;
    killValue: number;
    lostValue: number;
}

export type SkirmishEconomyByPlayer = Record<number, SkirmishPlayerEconomy>;

export interface SkirmishEpisodeSummary {
    stepCount: number;
    terminal: boolean;
    stoppedByMaxSteps: boolean;
    timeout: boolean;
    illegalActionCount: number;
    totalReward: number;
    winnerAlliance: number | null;
    adjudicatedWinnerAlliance: number | null;
    finalArmyValueByAlliance: Record<number, number>;
    finalTurn: number;
    finalCurrentPlayer: number;
    economyByPlayer: SkirmishEconomyByPlayer;
}

export interface SkirmishEpisodeRecord {
    kind: 'skirmish_episode';
    version: 1;
    scenario: SkirmishEpisodeScenario;
    seed: number;
    maxPlies: number;
    maxSteps: number;
    initialObservationHash: string;
    initialLegalActionCount: number;
    fixedActionSpaceSize: number;
    players: SkirmishEpisodePlayer[];
    policyByPlayer: Record<number, string>;
    steps: SkirmishEpisodeStep[];
    summary: SkirmishEpisodeSummary;
}

export interface SkirmishRunSummary {
    episodeCount: number;
    terminalCount: number;
    timeoutCount: number;
    stoppedByMaxStepsCount: number;
    drawCount: number;
    naturalWinCount: number;
    adjudicatedWinCount: number;
    illegalActionCount: number;
    averageSteps: number;
    economyByPlayer: SkirmishEconomyByPlayer;
    winsByPolicy: Record<string, number>;
    winsByPlayer: Record<number, number>;
    byScenario: Record<string, {
        episodeCount: number;
        terminalCount: number;
        timeoutCount: number;
        stoppedByMaxStepsCount: number;
        illegalActionCount: number;
        averageSteps: number;
        winsByPolicy: Record<string, number>;
    }>;
}

export interface SkirmishRunnerOptions {
    unpackDir: string;
    outFile: string;
    append: boolean;
    episodesPerScenario: number;
    maxPlies: number;
    maxSteps: number | null;
    seed: number;
    preset: BaselinePolicyPreset;
    modes: ApkSkirmishMode[] | null;
    scenarioIds: string[];
    limit: number | null;
    json: boolean;
    workers: number;
    progress: boolean;
    progressIntervalMs: number;
    progressIntervalSteps: number;
}

export interface SkirmishEpisodeProgress {
    workerId: number;
    jobId: number;
    scenario: SkirmishEpisodeScenario;
    seed: number;
    step: number;
    maxSteps: number;
    turn: number;
    currentPlayer: number;
    done: boolean;
    lastActionCode: string | null;
    economyByPlayer: SkirmishEconomyByPlayer;
}

interface SkirmishEpisodeJob {
    jobId: number;
    scenarioId: string;
    scenarioIndex: number;
    episodeIndex: number;
    seed: number;
}

export interface SkirmishWorkerData {
    workerId: number;
    jobs: SkirmishEpisodeJob[];
    options: Pick<
        SkirmishRunnerOptions,
        'unpackDir' | 'preset' | 'maxPlies' | 'maxSteps' | 'progressIntervalSteps'
    >;
}

type SkirmishWorkerMessage =
    | { type: 'ready'; workerId: number }
    | { type: 'progress'; progress: SkirmishEpisodeProgress }
    | { type: 'episode'; jobId: number; episode: SkirmishEpisodeRecord }
    | { type: 'done'; workerId: number }
    | { type: 'error'; workerId: number; message: string; stack?: string };

type SkirmishWorkerCommand =
    | { type: 'job'; job: SkirmishEpisodeJob }
    | { type: 'shutdown' };

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_RUN_DIR = path.resolve(process.cwd(), 'training_runs');
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function nowFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutFile(): string {
    return path.join(DEFAULT_RUN_DIR, `skirmish-baseline-${nowFileStamp()}.jsonl`);
}

function printHelp() {
    console.log(`用法: npm run train:skirmish:baseline -- [选项]

选项:
  --unpack <dir>          APK 解包目录，默认 APK/_analysis/unpack
  --out <file>            episode JSONL 输出文件，默认 training_runs/skirmish-baseline-时间戳.jsonl
  --append                追加写入 --out 文件；默认会覆盖
  --episodes <n>          每个场景跑几局，默认 1
  --max-plies <n>         环境最大 ply 数，默认 1000
  --max-steps <n>         runner 最大动作步数，默认 max-plies * 64
  --seed <n>              起始 seed，默认 1
  --preset <name>         random、heuristic、heuristic-vs-random，默认 heuristic-vs-random
  --workers <n>           并行 worker 数，默认 1；例如 --workers 5
  --mode <SD|SO>          只跑单个模式；可重复
  --scenario <id>         只跑指定场景；可重复
  --limit <n>             只取前 n 个筛选后的场景，便于 smoke test
  --progress-interval-ms <n>     进度刷新间隔毫秒，默认 1000
  --progress-interval-steps <n>  worker 每隔多少步回传一次进度，默认 25
  --no-progress           关闭进度显示
  --json                  摘要输出 JSON
  --help                  显示帮助
`);
}

export function parseRunnerArgs(argv: readonly string[]): SkirmishRunnerOptions {
    const modes: ApkSkirmishMode[] = [];
    const scenarioIds: string[] = [];
    const options: SkirmishRunnerOptions = {
        unpackDir: DEFAULT_UNPACK_DIR,
        outFile: defaultOutFile(),
        append: false,
        episodesPerScenario: 1,
        maxPlies: 1000,
        maxSteps: null,
        seed: 1,
        preset: 'heuristic-vs-random',
        modes: null,
        scenarioIds,
        limit: null,
        json: false,
        workers: 1,
        progress: true,
        progressIntervalMs: 1000,
        progressIntervalSteps: 25
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--unpack') {
            const value = argv[++i];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--append') {
            options.append = true;
        } else if (arg === '--episodes') {
            options.episodesPerScenario = parsePositiveInteger(argv[++i], '--episodes');
        } else if (arg === '--max-plies') {
            options.maxPlies = parsePositiveInteger(argv[++i], '--max-plies');
        } else if (arg === '--max-steps') {
            options.maxSteps = parsePositiveInteger(argv[++i], '--max-steps');
        } else if (arg === '--seed') {
            options.seed = parseInteger(argv[++i], '--seed');
        } else if (arg === '--preset') {
            options.preset = parsePreset(argv[++i]);
        } else if (arg === '--workers') {
            options.workers = parsePositiveInteger(argv[++i], '--workers');
        } else if (arg === '--mode') {
            modes.push(parseMode(argv[++i]));
        } else if (arg === '--scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--scenario 缺少场景 ID');
            scenarioIds.push(value);
        } else if (arg === '--limit') {
            options.limit = parsePositiveInteger(argv[++i], '--limit');
        } else if (arg === '--progress-interval-ms') {
            options.progressIntervalMs = parsePositiveInteger(argv[++i], '--progress-interval-ms');
        } else if (arg === '--progress-interval-steps') {
            options.progressIntervalSteps = parsePositiveInteger(argv[++i], '--progress-interval-steps');
        } else if (arg === '--no-progress') {
            options.progress = false;
        } else if (arg === '--json') {
            options.json = true;
            options.progress = false;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    options.modes = modes.length > 0 ? modes : null;
    options.maxSteps = options.maxSteps ?? options.maxPlies * 64;
    return options;
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

function parsePreset(value: string | undefined): BaselinePolicyPreset {
    if (value === 'random' || value === 'heuristic' || value === 'heuristic-vs-random') {
        return value;
    }
    throw new Error('--preset 只能是 random、heuristic 或 heuristic-vs-random');
}

function parseMode(value: string | undefined): ApkSkirmishMode {
    if (value === 'SD' || value === 'SO') return value;
    throw new Error('--mode 只能是 SD 或 SO');
}

export function createSeededRng(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let next = value;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}

function mixSeed(seed: number, ...parts: number[]): number {
    return parts.reduce((value, part) => (
        Math.imul((value ^ part) >>> 0, 0x45D9F3B) >>> 0
    ), seed >>> 0);
}

function hashJson(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cloneEconomyByPlayer(economyByPlayer: SkirmishEconomyByPlayer): SkirmishEconomyByPlayer {
    return Object.fromEntries(
        Object.entries(economyByPlayer).map(([playerId, economy]) => [
            Number(playerId),
            { ...economy }
        ])
    ) as SkirmishEconomyByPlayer;
}

function createEconomyByPlayer(playerIds: readonly number[]): SkirmishEconomyByPlayer {
    return Object.fromEntries(
        playerIds.map(playerId => [
            playerId,
            {
                spentValue: 0,
                killValue: 0,
                lostValue: 0
            }
        ])
    ) as SkirmishEconomyByPlayer;
}

function ensurePlayerEconomy(economyByPlayer: SkirmishEconomyByPlayer, playerId: number): SkirmishPlayerEconomy {
    economyByPlayer[playerId] ??= {
        spentValue: 0,
        killValue: 0,
        lostValue: 0
    };
    return economyByPlayer[playerId];
}

function getUnitValue(state: GameState, unit: Unit): number {
    return getUnitCost(state, unit.ownerId, unit.unitClass) ?? UNIT_CONFIGS[unit.unitClass].cost ?? 0;
}

function getSpendValue(state: GameState, playerId: number, action: Action | null): number {
    if (!action || (action.type !== 'recruit_to_castle' && action.type !== 'recruit_and_deploy')) return 0;
    return getUnitCost(state, playerId, action.unitClass) ?? UNIT_CONFIGS[action.unitClass].cost ?? 0;
}

function getAliveUnitMap(state: GameState): Map<string, Unit> {
    return new Map(state.units.filter(unit => unit.hp > 0).map(unit => [unit.id, unit]));
}

function resolveKillCreditPlayer(action: Action | null, actingPlayerId: number, deadUnit: Unit, beforeUnits: Map<string, Unit>): number {
    if (action?.type === 'attack') {
        if (deadUnit.id === action.targetId) return actingPlayerId;
        if (deadUnit.id === action.attackerId) {
            return beforeUnits.get(action.targetId)?.ownerId ?? actingPlayerId;
        }
    }
    if (action?.type === 'heal' && deadUnit.id === action.targetId) return actingPlayerId;
    return actingPlayerId;
}

function getKillValueByPlayer(
    beforeState: GameState,
    afterState: GameState,
    actingPlayerId: number,
    action: Action | null
): { killValueByPlayer: Record<number, number>; lostValueByPlayer: Record<number, number> } {
    const beforeUnits = getAliveUnitMap(beforeState);
    const afterUnits = getAliveUnitMap(afterState);
    const killValueByPlayer: Record<number, number> = {};
    const lostValueByPlayer: Record<number, number> = {};

    for (const unit of beforeUnits.values()) {
        if (afterUnits.has(unit.id)) continue;
        const value = getUnitValue(beforeState, unit);
        const creditPlayerId = resolveKillCreditPlayer(action, actingPlayerId, unit, beforeUnits);
        killValueByPlayer[creditPlayerId] = (killValueByPlayer[creditPlayerId] ?? 0) + value;
        lostValueByPlayer[unit.ownerId] = (lostValueByPlayer[unit.ownerId] ?? 0) + value;
    }

    return { killValueByPlayer, lostValueByPlayer };
}

export function getArmyValueByAlliance(state: GameState): Record<number, number> {
    const valuesByAlliance: Record<number, number> = {};
    for (const playerId of getTurnPlayerIds(state)) {
        const allianceId = getAllianceId(state, playerId);
        valuesByAlliance[allianceId] = (valuesByAlliance[allianceId] ?? 0) + calculateArmyValue(state, playerId);
    }
    return valuesByAlliance;
}

export function evaluateAdjudicatedWinnerAlliance(state: GameState): number {
    const valuesByAlliance = getArmyValueByAlliance(state);
    let winnerAlliance = -1;
    let winnerValue = -Infinity;
    let tied = false;

    for (const [allianceIdText, value] of Object.entries(valuesByAlliance)) {
        const allianceId = Number(allianceIdText);
        if (value > winnerValue) {
            winnerAlliance = allianceId;
            winnerValue = value;
            tied = false;
        } else if (value === winnerValue) {
            tied = true;
        }
    }

    return tied ? -1 : winnerAlliance;
}

function createActionBackedPolicy(name: string, selectAction: (engine: GameEngine, playerId: number) => Action): SkirmishPolicy {
    return {
        name,
        selectFixedActionIndex(context) {
            const engine = new GameEngine(context.result.state);
            const action = selectAction(engine, context.playerId);
            const fixedIndex = encodeFixedActionIndex(action, context.result.state, {
                width: context.result.fixedActionSpaceDescriptor.width,
                height: context.result.fixedActionSpaceDescriptor.height,
                unitClasses: context.result.fixedActionSpaceDescriptor.unitClasses
            });
            return fixedIndex ?? -1;
        }
    };
}

export function createRandomBaselinePolicy(seed: number): SkirmishPolicy {
    const ai = new RandomAI(createSeededRng(seed));
    return createActionBackedPolicy('random', (engine, playerId) => ai.getAction(engine, playerId));
}

export function createHeuristicBaselinePolicy(seed: number): SkirmishPolicy {
    const ai = new HeuristicAI(createSeededRng(seed));
    return createActionBackedPolicy('heuristic', (engine, playerId) => ai.getAction(engine, playerId));
}

export function createPresetPolicyFactory(preset: BaselinePolicyPreset): SkirmishPolicyFactory {
    return (playerId, playerIds, episodeSeed) => {
        const sortedPlayerIds = [...playerIds].sort((left, right) => left - right);
        const policySeed = mixSeed(episodeSeed, playerId, sortedPlayerIds.indexOf(playerId) + 1);
        if (preset === 'random') return createRandomBaselinePolicy(policySeed);
        if (preset === 'heuristic') return createHeuristicBaselinePolicy(policySeed);
        return playerId === sortedPlayerIds[0]
            ? createHeuristicBaselinePolicy(policySeed)
            : createRandomBaselinePolicy(policySeed);
    };
}

export function runSkirmishEpisode(options: {
    env: AncientEmpiresEnv;
    scenario: SkirmishEpisodeScenario;
    seed: number;
    maxPlies: number;
    maxSteps: number;
    policyFactory: SkirmishPolicyFactory;
    workerId?: number;
    jobId?: number;
    progressIntervalSteps?: number;
    onProgress?: (progress: SkirmishEpisodeProgress) => void;
}): SkirmishEpisodeRecord {
    const {
        env,
        scenario,
        seed,
        maxPlies,
        maxSteps,
        policyFactory,
        workerId = 1,
        jobId = 0,
        progressIntervalSteps = 25,
        onProgress
    } = options;
    let result = env.reset(seed);
    const initialObservationHash = hashJson(result.observation);
    const initialLegalActionCount = result.legalActions.length;
    const fixedActionSpaceSize = result.fixedActionSpaceDescriptor.size;
    const playerIds = result.observation.players.map(player => player.id);
    const policiesByPlayer = new Map<number, SkirmishPolicy>(
        playerIds.map(playerId => [playerId, policyFactory(playerId, playerIds, seed)])
    );
    const policyByPlayer = Object.fromEntries(
        playerIds.map(playerId => [playerId, policiesByPlayer.get(playerId)!.name])
    ) as Record<number, string>;
    const players = result.observation.players.map(player => ({
        id: player.id,
        allianceId: player.allianceId,
        policy: policyByPlayer[player.id]
    }));
    const steps: SkirmishEpisodeStep[] = [];
    let illegalActionCount = 0;
    const economyByPlayer = createEconomyByPlayer(playerIds);
    const reportProgress = (step: number, done: boolean, lastActionCode: string | null) => {
        onProgress?.({
            workerId,
            jobId,
            scenario,
            seed,
            step,
            maxSteps,
            turn: result.state.turn,
            currentPlayer: result.state.currentPlayer,
            done,
            lastActionCode,
            economyByPlayer: cloneEconomyByPlayer(economyByPlayer)
        });
    };

    reportProgress(0, false, null);

    for (let stepNumber = 1; !result.done && stepNumber <= maxSteps; stepNumber += 1) {
        const playerId = result.observation.currentPlayer;
        const policy = policiesByPlayer.get(playerId) ?? createRandomBaselinePolicy(mixSeed(seed, playerId));
        const fixedActionIndex = policy.selectFixedActionIndex({
            result,
            playerId,
            stepNumber,
            episodeSeed: seed,
            scenario
        });
        const legalFixedAction = result.fixedLegalActionIndexes.includes(fixedActionIndex);
        const selectedEntry = result.legalActionEntries.find(entry => entry.fixedActionIndex === fixedActionIndex);
        const selectedAction = selectedEntry?.action ?? null;
        const turnBefore = result.observation.turn;
        const legalActionCount = result.legalActions.length;
        const fixedLegalActionCount = result.fixedLegalActionIndexes.length;
        const beforeState = result.state;
        const spendValue = getSpendValue(beforeState, playerId, selectedAction);
        const nextResult = env.stepFixedAction(fixedActionIndex);
        const illegal = !legalFixedAction || nextResult.info.includes('非法');
        const { killValueByPlayer, lostValueByPlayer } = illegal
            ? { killValueByPlayer: {}, lostValueByPlayer: {} }
            : getKillValueByPlayer(beforeState, nextResult.state, playerId, selectedAction);

        if (illegal) illegalActionCount += 1;
        if (!illegal && spendValue > 0) {
            ensurePlayerEconomy(economyByPlayer, playerId).spentValue += spendValue;
        }
        for (const [creditPlayerId, value] of Object.entries(killValueByPlayer)) {
            ensurePlayerEconomy(economyByPlayer, Number(creditPlayerId)).killValue += value;
        }
        for (const [lostPlayerId, value] of Object.entries(lostValueByPlayer)) {
            ensurePlayerEconomy(economyByPlayer, Number(lostPlayerId)).lostValue += value;
        }

        steps.push({
            step: stepNumber,
            turnBefore,
            playerId,
            policy: policy.name,
            legalActionCount,
            fixedLegalActionCount,
            fixedActionIndex,
            actionCode: selectedEntry?.code ?? null,
            reward: nextResult.reward,
            done: nextResult.done,
            winnerAfter: nextResult.state.winner,
            info: nextResult.info,
            illegal,
            spendValue: illegal ? 0 : spendValue,
            killValueByPlayer
        });
        result = nextResult;

        if (stepNumber % progressIntervalSteps === 0 || result.done) {
            reportProgress(stepNumber, result.done, selectedEntry?.code ?? null);
        }
    }

    const stoppedByMaxSteps = !result.done;
    const lastInfo = steps.at(-1)?.info ?? '';
    const timeout = result.done && result.state.winner === null && lastInfo.includes('Max plies reached');
    const totalReward = steps.reduce((sum, step) => sum + step.reward, 0);
    const finalArmyValueByAlliance = getArmyValueByAlliance(result.state);
    const adjudicatedWinnerAlliance = result.state.winner ?? (timeout
        ? evaluateAdjudicatedWinnerAlliance(result.state)
        : null);

    return {
        kind: 'skirmish_episode',
        version: 1,
        scenario,
        seed,
        maxPlies,
        maxSteps,
        initialObservationHash,
        initialLegalActionCount,
        fixedActionSpaceSize,
        players,
        policyByPlayer,
        steps,
        summary: {
            stepCount: steps.length,
            terminal: result.done,
            stoppedByMaxSteps,
            timeout,
            illegalActionCount,
            totalReward,
            winnerAlliance: result.state.winner,
            adjudicatedWinnerAlliance,
            finalArmyValueByAlliance,
            finalTurn: result.state.turn,
            finalCurrentPlayer: result.state.currentPlayer,
            economyByPlayer: cloneEconomyByPlayer(economyByPlayer)
        }
    };
}

export async function readApkSkirmishTrainingMap(
    unpackDir: string,
    scenario: ApkSkirmishTrainingScenario
): Promise<ApkAemMap> {
    const encryptedPath = path.join(unpackDir, ...scenario.resourcePath.split('/'));
    const encrypted = await readFile(encryptedPath);
    return parseApkAemMap(decryptApkResourceBytes(encrypted));
}

async function getCachedMap(
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

function selectScenarios(options: SkirmishRunnerOptions): ApkSkirmishTrainingScenario[] {
    let scenarios = getApkSkirmishTrainingScenarios({
        ...(options.modes ? { modes: options.modes } : {})
    });

    if (options.scenarioIds.length > 0) {
        const requested = new Set(options.scenarioIds);
        scenarios = scenarios.filter(scenario => requested.has(scenario.id));
        const missing = [...requested].filter(id => !scenarios.some(scenario => scenario.id === id));
        if (missing.length > 0) {
            throw new Error(`未知训练场景: ${missing.join(', ')}`);
        }
    }

    return options.limit === null ? scenarios : scenarios.slice(0, options.limit);
}

function buildEpisodeJobs(
    scenarios: readonly ApkSkirmishTrainingScenario[],
    options: SkirmishRunnerOptions
): SkirmishEpisodeJob[] {
    return scenarios.flatMap((scenario, scenarioIndex) => (
        Array.from({ length: options.episodesPerScenario }, (_, episodeIndex) => ({
            jobId: scenarioIndex * options.episodesPerScenario + episodeIndex,
            scenarioId: scenario.id,
            scenarioIndex,
            episodeIndex,
            seed: mixSeed(options.seed, scenarioIndex + 1, episodeIndex + 1)
        }))
    ));
}

function partitionJobs(jobs: readonly SkirmishEpisodeJob[], workerCount: number): SkirmishEpisodeJob[][] {
    const partitions = Array.from({ length: workerCount }, () => [] as SkirmishEpisodeJob[]);
    jobs.forEach((job, index) => {
        partitions[index % workerCount].push(job);
    });
    return partitions.filter(partition => partition.length > 0);
}

function formatProgressBar(step: number, maxSteps: number): string {
    const width = 18;
    const ratio = maxSteps > 0 ? Math.min(1, step / maxSteps) : 0;
    const filled = Math.max(0, Math.min(width, Math.floor(ratio * width)));
    return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}]`;
}

function formatEconomy(economyByPlayer: SkirmishEconomyByPlayer): string {
    return Object.entries(economyByPlayer)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([playerId, economy]) => (
            `P${playerId} 花费 ${economy.spentValue} 击杀 ${economy.killValue} 损失 ${economy.lostValue}`
        ))
        .join('；');
}

function createProgressReporter(totalEpisodes: number, workerCount: number, intervalMs: number) {
    const statuses = new Map<number, SkirmishEpisodeProgress>();
    let completedEpisodes = 0;
    let lastRenderedAt = 0;

    const render = (force = false) => {
        const now = Date.now();
        if (!force && now - lastRenderedAt < intervalMs) return;
        lastRenderedAt = now;

        const lines = [
            `[进度] ${completedEpisodes}/${totalEpisodes} 局完成，workers=${workerCount}`
        ];
        for (let workerId = 1; workerId <= workerCount; workerId += 1) {
            const status = statuses.get(workerId);
            if (!status) {
                lines.push(`W${workerId} 空闲`);
                continue;
            }
            lines.push(
                `W${workerId} ${formatProgressBar(status.step, status.maxSteps)} `
                + `${status.step}/${status.maxSteps} `
                + `${status.scenario.id} 回合 ${status.turn} 当前 P${status.currentPlayer} `
                + `${formatEconomy(status.economyByPlayer)}`
            );
        }
        console.log(lines.join('\n'));
    };

    return {
        update(progress: SkirmishEpisodeProgress) {
            statuses.set(progress.workerId, progress);
            render(false);
        },
        completeEpisode(workerId: number) {
            completedEpisodes += 1;
            statuses.delete(workerId);
            render(true);
        },
        finish() {
            if (completedEpisodes < totalEpisodes) {
                render(true);
            }
        }
    };
}

export async function runSkirmishBaseline(options: SkirmishRunnerOptions): Promise<{
    episodes: SkirmishEpisodeRecord[];
    summary: SkirmishRunSummary;
}> {
    const scenarios = selectScenarios(options);
    const jobs = buildEpisodeJobs(scenarios, options);
    const workerCount = Math.max(1, Math.min(options.workers, jobs.length || 1));
    const progressReporter = options.progress
        ? createProgressReporter(jobs.length, workerCount, options.progressIntervalMs)
        : null;

    await mkdir(path.dirname(options.outFile), { recursive: true });
    if (!options.append) {
        await writeFile(options.outFile, '', 'utf8');
    }

    if (workerCount > 1) {
        const { episodes } = await runSkirmishBaselineInWorkers(options, jobs, workerCount, progressReporter);
        progressReporter?.finish();
        return {
            episodes,
            summary: summarizeSkirmishEpisodes(episodes)
        };
    }

    const mapCache = new Map<string, ApkAemMap>();
    const policyFactory = createPresetPolicyFactory(options.preset);
    const episodes: SkirmishEpisodeRecord[] = [];

    for (const job of jobs) {
        const scenario = scenarios[job.scenarioIndex];
        const map = await getCachedMap(mapCache, options.unpackDir, scenario);

        const env = createApkSkirmishTrainingEnv(map, scenario, {
            seed: job.seed,
            maxPlies: options.maxPlies
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: scenario.id,
                mode: scenario.mode,
                mapName: scenario.mapName,
                resourcePath: scenario.resourcePath
            },
            seed: job.seed,
            maxPlies: options.maxPlies,
            maxSteps: options.maxSteps ?? options.maxPlies * 64,
            policyFactory,
            workerId: 1,
            jobId: job.jobId,
            progressIntervalSteps: options.progressIntervalSteps,
            onProgress: progress => progressReporter?.update(progress)
        });

        episodes.push(episode);
        await appendFile(options.outFile, `${JSON.stringify(episode)}\n`, 'utf8');
        progressReporter?.completeEpisode(1);
    }
    progressReporter?.finish();

    return {
        episodes,
        summary: summarizeSkirmishEpisodes(episodes)
    };
}

async function runSkirmishBaselineInWorkers(
    options: SkirmishRunnerOptions,
    jobs: readonly SkirmishEpisodeJob[],
    workerCount: number,
    progressReporter: ReturnType<typeof createProgressReporter> | null
): Promise<{ episodes: SkirmishEpisodeRecord[] }> {
    const episodes: SkirmishEpisodeRecord[] = [];
    let writeQueue = Promise.resolve();
    let nextJobIndex = 0;

    await Promise.all(Array.from({ length: workerCount }, (_, index) => (
        new Promise<void>((resolve, reject) => {
            const workerId = index + 1;
            const worker = createTsWorker({
                workerId,
                jobs: [],
                options: {
                    unpackDir: options.unpackDir,
                    preset: options.preset,
                    maxPlies: options.maxPlies,
                    maxSteps: options.maxSteps,
                    progressIntervalSteps: options.progressIntervalSteps
                }
            });

            const assignNextJob = () => {
                const job = jobs[nextJobIndex];
                nextJobIndex += 1;
                if (job) {
                    worker.postMessage({ type: 'job', job } satisfies SkirmishWorkerCommand);
                } else {
                    worker.postMessage({ type: 'shutdown' } satisfies SkirmishWorkerCommand);
                }
            };

            worker.on('message', (message: SkirmishWorkerMessage) => {
                if (message.type === 'ready') {
                    assignNextJob();
                } else if (message.type === 'progress') {
                    progressReporter?.update(message.progress);
                } else if (message.type === 'episode') {
                    episodes.push(message.episode);
                    writeQueue = writeQueue.then(() => (
                        appendFile(options.outFile, `${JSON.stringify(message.episode)}\n`, 'utf8')
                    ));
                    progressReporter?.completeEpisode(workerId);
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

    await writeQueue;
    return {
        episodes
    };
}

function createTsWorker(payload: SkirmishWorkerData): Worker {
    const bridge = `
        const { parentPort, workerData } = require('node:worker_threads');
        (async () => {
            const { register } = await import('tsx/esm/api');
            register();
            const mod = await import(workerData.moduleUrl);
            await mod.runSkirmishWorker(workerData.payload);
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

export async function runSkirmishWorker(data: SkirmishWorkerData = workerData as SkirmishWorkerData) {
    if (!parentPort) return;

    const scenarios = getApkSkirmishTrainingScenarios();
    const scenarioById = new Map(scenarios.map(scenario => [scenario.id, scenario]));
    const mapCache = new Map<string, ApkAemMap>();
    const policyFactory = createPresetPolicyFactory(data.options.preset);

    const postError = (error: unknown) => {
        parentPort?.postMessage({
            type: 'error',
            workerId: data.workerId,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        } satisfies SkirmishWorkerMessage);
    };

    const runJob = async (job: SkirmishEpisodeJob) => {
        const scenario = scenarioById.get(job.scenarioId);
        if (!scenario) throw new Error(`worker ${data.workerId} 找不到训练场景: ${job.scenarioId}`);
        const map = await getCachedMap(mapCache, data.options.unpackDir, scenario);
        const env = createApkSkirmishTrainingEnv(map, scenario, {
            seed: job.seed,
            maxPlies: data.options.maxPlies
        });
        const episode = runSkirmishEpisode({
            env,
            scenario: {
                id: scenario.id,
                mode: scenario.mode,
                mapName: scenario.mapName,
                resourcePath: scenario.resourcePath
            },
            seed: job.seed,
            maxPlies: data.options.maxPlies,
            maxSteps: data.options.maxSteps ?? data.options.maxPlies * 64,
            policyFactory,
            workerId: data.workerId,
            jobId: job.jobId,
            progressIntervalSteps: data.options.progressIntervalSteps,
            onProgress: progress => parentPort?.postMessage({
                type: 'progress',
                progress
            } satisfies SkirmishWorkerMessage)
        });

        parentPort.postMessage({
            type: 'episode',
            jobId: job.jobId,
            episode
        } satisfies SkirmishWorkerMessage);
    };

    try {
        if (data.jobs.length > 0) {
            for (const job of data.jobs) {
                await runJob(job);
            }

            parentPort.postMessage({
                type: 'done',
                workerId: data.workerId
            } satisfies SkirmishWorkerMessage);
            return;
        }

        parentPort.on('message', (message: SkirmishWorkerCommand) => {
            void (async () => {
                if (message.type === 'job') {
                    await runJob(message.job);
                    parentPort?.postMessage({
                        type: 'ready',
                        workerId: data.workerId
                    } satisfies SkirmishWorkerMessage);
                } else {
                    parentPort?.postMessage({
                        type: 'done',
                        workerId: data.workerId
                    } satisfies SkirmishWorkerMessage);
                    parentPort?.close();
                }
            })().catch(error => {
                postError(error);
                process.exit(1);
            });
        });

        parentPort.postMessage({
            type: 'ready',
            workerId: data.workerId,
        } satisfies SkirmishWorkerMessage);
    } catch (error) {
        postError(error);
    }
}

export function summarizeSkirmishEpisodes(episodes: readonly SkirmishEpisodeRecord[]): SkirmishRunSummary {
    const summary: SkirmishRunSummary = {
        episodeCount: episodes.length,
        terminalCount: 0,
        timeoutCount: 0,
        stoppedByMaxStepsCount: 0,
        drawCount: 0,
        naturalWinCount: 0,
        adjudicatedWinCount: 0,
        illegalActionCount: 0,
        averageSteps: 0,
        economyByPlayer: {},
        winsByPolicy: {},
        winsByPlayer: {},
        byScenario: {}
    };

    let totalSteps = 0;
    for (const episode of episodes) {
        const adjudicatedWinnerAlliance = getEpisodeAdjudicatedWinnerAlliance(episode);
        totalSteps += episode.summary.stepCount;
        summary.terminalCount += episode.summary.terminal ? 1 : 0;
        summary.timeoutCount += episode.summary.timeout ? 1 : 0;
        summary.stoppedByMaxStepsCount += episode.summary.stoppedByMaxSteps ? 1 : 0;
        summary.naturalWinCount += episode.summary.winnerAlliance !== null && episode.summary.winnerAlliance !== -1 ? 1 : 0;
        summary.adjudicatedWinCount += (
            adjudicatedWinnerAlliance !== null
            && adjudicatedWinnerAlliance !== -1
        ) ? 1 : 0;
        summary.drawCount += adjudicatedWinnerAlliance === -1 ? 1 : 0;
        summary.illegalActionCount += episode.summary.illegalActionCount;
        for (const [playerId, economy] of Object.entries(episode.summary.economyByPlayer ?? {})) {
            const aggregate = ensurePlayerEconomy(summary.economyByPlayer, Number(playerId));
            aggregate.spentValue += economy.spentValue;
            aggregate.killValue += economy.killValue;
            aggregate.lostValue += economy.lostValue;
        }

        const scenarioSummary = summary.byScenario[episode.scenario.id] ?? {
            episodeCount: 0,
            terminalCount: 0,
            timeoutCount: 0,
            stoppedByMaxStepsCount: 0,
            illegalActionCount: 0,
            averageSteps: 0,
            winsByPolicy: {}
        };
        scenarioSummary.episodeCount += 1;
        scenarioSummary.terminalCount += episode.summary.terminal ? 1 : 0;
        scenarioSummary.timeoutCount += episode.summary.timeout ? 1 : 0;
        scenarioSummary.stoppedByMaxStepsCount += episode.summary.stoppedByMaxSteps ? 1 : 0;
        scenarioSummary.illegalActionCount += episode.summary.illegalActionCount;
        scenarioSummary.averageSteps += episode.summary.stepCount;

        recordWinners(episode, summary.winsByPolicy, summary.winsByPlayer, scenarioSummary.winsByPolicy);
        summary.byScenario[episode.scenario.id] = scenarioSummary;
    }

    summary.averageSteps = episodes.length > 0 ? totalSteps / episodes.length : 0;
    for (const scenarioSummary of Object.values(summary.byScenario)) {
        scenarioSummary.averageSteps = scenarioSummary.episodeCount > 0
            ? scenarioSummary.averageSteps / scenarioSummary.episodeCount
            : 0;
    }

    return summary;
}

function getEpisodeAdjudicatedWinnerAlliance(episode: SkirmishEpisodeRecord): number | null {
    const maybeAdjudicated = (episode.summary as Partial<SkirmishEpisodeSummary>).adjudicatedWinnerAlliance;
    if (maybeAdjudicated !== undefined) return maybeAdjudicated;
    return episode.summary.winnerAlliance;
}

function recordWinners(
    episode: SkirmishEpisodeRecord,
    winsByPolicy: Record<string, number>,
    winsByPlayer: Record<number, number>,
    scenarioWinsByPolicy: Record<string, number>
) {
    const winnerAlliance = getEpisodeAdjudicatedWinnerAlliance(episode);
    if (winnerAlliance === null || winnerAlliance === -1) return;

    const winningPlayers = episode.players.filter(player => player.allianceId === winnerAlliance);
    const winningPolicies = new Set<string>();
    for (const player of winningPlayers) {
        winsByPlayer[player.id] = (winsByPlayer[player.id] ?? 0) + 1;
        winningPolicies.add(player.policy);
    }

    for (const policy of winningPolicies) {
        winsByPolicy[policy] = (winsByPolicy[policy] ?? 0) + 1;
        scenarioWinsByPolicy[policy] = (scenarioWinsByPolicy[policy] ?? 0) + 1;
    }
}

export function formatSkirmishRunSummary(summary: SkirmishRunSummary, outFile?: string): string {
    const lines = [
        '# Skirmish baseline 训练摘要',
        '',
        outFile ? `- 输出文件：\`${outFile}\`` : null,
        `- Episode：${summary.episodeCount}`,
        `- 环境终局：${summary.terminalCount}`,
        `- 其中超时裁定：${summary.timeoutCount}`,
        `- runner 步数保护停止：${summary.stoppedByMaxStepsCount}`,
        `- 真实胜局：${summary.naturalWinCount}`,
        `- 可统计胜局（含超时裁定）：${summary.adjudicatedWinCount}`,
        `- 平局：${summary.drawCount}`,
        `- 非法动作：${summary.illegalActionCount}`,
        `- 平均动作步数：${summary.averageSteps.toFixed(2)}`
    ].filter((line): line is string => line !== null);

    const policyRows = Object.entries(summary.winsByPolicy)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([policy, wins]) => `| ${policy} | ${wins} | ${(wins / Math.max(1, summary.episodeCount) * 100).toFixed(2)}% |`);

    if (policyRows.length > 0) {
        lines.push('', '| 策略 | 胜局（含超时裁定） | 按 episode 计胜率 |', '| --- | ---: | ---: |', ...policyRows);
    }

    const economyRows = Object.entries(summary.economyByPlayer)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([playerId, economy]) => (
            `| P${playerId} | ${economy.spentValue} | ${economy.killValue} | ${economy.lostValue} |`
        ));

    if (economyRows.length > 0) {
        lines.push('', '| 阵营 | 累计花费 | 累计击杀价值 | 累计损失价值 |', '| --- | ---: | ---: | ---: |', ...economyRows);
    }

    return lines.join('\n');
}

async function main() {
    const options = parseRunnerArgs(process.argv.slice(2));
    const { summary } = await runSkirmishBaseline(options);

    if (options.json) {
        console.log(JSON.stringify({ outFile: options.outFile, summary }, null, 2));
    } else {
        console.log(formatSkirmishRunSummary(summary, options.outFile));
    }
}

if (!isMainThread && (workerData as { kind?: string } | undefined)?.kind === 'skirmish_worker') {
    runSkirmishWorker().catch(error => {
        parentPort?.postMessage({
            type: 'error',
            workerId: (workerData as SkirmishWorkerData | undefined)?.workerId ?? 0,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        } satisfies SkirmishWorkerMessage);
        process.exit(1);
    });
} else if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
