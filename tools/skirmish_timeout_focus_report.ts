import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AncientEmpiresEnv,
    calculateArmyValue,
    decodeAction,
    type EnvStepResult,
    type FixedActionSpaceDescriptor,
    type FixedActionSpaceOptions,
    type Observation
} from '../src/game/env';
import {
    createApkSkirmishTrainingEnv,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import type { ApkAemMap } from '../src/game/apk_map';
import type { Action } from '../src/game/types';
import { parseEpisodeJsonl } from './skirmish_training_eval';
import {
    readApkSkirmishTrainingMap,
    type SkirmishEpisodeRecord,
    type SkirmishEpisodeStep
} from './skirmish_training_runner';

interface TimeoutFocusReportFile {
    label: string;
    file: string;
}

export interface TimeoutFocusReportOptions {
    files: TimeoutFocusReportFile[];
    outFile: string;
    unpackDir: string;
    scenarioIds: string[];
    tailTurns: number;
    json: boolean;
}

interface LoadedEpisode {
    fileLabel: string;
    inputFile: string;
    episodeIndex: number;
    episode: SkirmishEpisodeRecord;
}

interface ReplayedTimeoutEpisode {
    loaded: LoadedEpisode;
    finalResult: EnvStepResult;
    beforeFinalResult: EnvStepResult;
    finalStep: SkirmishEpisodeStep | null;
}

interface ActionWindowStats {
    steps: number;
    moves: number;
    attacks: number;
    captures: number;
    destroys: number;
    summons: number;
    recruits: number;
    waits: number;
    heals: number;
    supports: number;
    repairs: number;
    endTurns: number;
    spendValue: number;
    killValue: number;
    lostValue: number;
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_REPORT_FILE = path.resolve(process.cwd(), 'training_runs', 'reports', 'timeout-endgame-focus-report.md');
const DEFAULT_SCENARIOS = [
    'SD:(2) Liberty Port.aem',
    'SD:(3) classic 2.aem',
    'SD:(4) Crossroads.aem'
];
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function printHelp() {
    console.log(`用法: npm run report:skirmish:timeout -- --file <label=file> [选项]

选项:
  --file <label=file>     输入 episode JSONL，可重复；label 可省略
  --out <file>            Markdown 报告输出路径，默认 training_runs/reports/timeout-endgame-focus-report.md
  --unpack <dir>          APK 解包目录，默认 APK/_analysis/unpack
  --scenario <id>         聚焦场景，可重复；默认 Liberty Port、classic 2、Crossroads
  --tail-turns <n>        统计 timeout 前最近多少回合，默认 25
  --json                  输出 JSON 摘要
  --help                  显示帮助
`);
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

function parseReportFile(value: string | undefined): TimeoutFocusReportFile {
    if (!value) throw new Error('--file 缺少文件参数');
    const separatorIndex = value.indexOf('=');
    if (separatorIndex > 0) {
        return {
            label: value.slice(0, separatorIndex),
            file: path.resolve(value.slice(separatorIndex + 1))
        };
    }
    const file = path.resolve(value);
    return {
        label: path.basename(file),
        file
    };
}

export function parseTimeoutFocusReportArgs(argv: readonly string[]): TimeoutFocusReportOptions {
    const scenarioIds: string[] = [];
    const options: TimeoutFocusReportOptions = {
        files: [],
        outFile: DEFAULT_REPORT_FILE,
        unpackDir: DEFAULT_UNPACK_DIR,
        scenarioIds,
        tailTurns: 25,
        json: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--file') {
            options.files.push(parseReportFile(argv[++i]));
        } else if (arg === '--out') {
            const value = argv[++i];
            if (!value) throw new Error('--out 缺少文件参数');
            options.outFile = path.resolve(value);
        } else if (arg === '--unpack') {
            const value = argv[++i];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else if (arg === '--scenario') {
            const value = argv[++i];
            if (!value) throw new Error('--scenario 缺少场景 ID');
            scenarioIds.push(value);
        } else if (arg === '--tail-turns') {
            options.tailTurns = parsePositiveInteger(argv[++i], '--tail-turns');
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (options.files.length === 0) throw new Error('请用 --file 指定至少一个 episode JSONL 文件');
    options.scenarioIds = scenarioIds.length > 0 ? scenarioIds : [...DEFAULT_SCENARIOS];
    return options;
}

async function readLoadedEpisodes(files: readonly TimeoutFocusReportFile[]): Promise<LoadedEpisode[]> {
    const groups = await Promise.all(files.map(async fileSpec => {
        const episodes = parseEpisodeJsonl(await readFile(fileSpec.file, 'utf8'), fileSpec.file);
        return episodes.map((episode, episodeIndex) => ({
            fileLabel: fileSpec.label,
            inputFile: fileSpec.file,
            episodeIndex,
            episode
        }));
    }));
    return groups.flat();
}

function fixedOptionsFromDescriptor(descriptor: FixedActionSpaceDescriptor): FixedActionSpaceOptions {
    const blockTypes = new Set(descriptor.blocks.map(block => block.type));
    return {
        width: descriptor.width,
        height: descriptor.height,
        unitClasses: descriptor.unitClasses,
        includeSurrender: blockTypes.has('surrender'),
        includeEndTurn: blockTypes.has('end_turn')
    };
}

function createScenarioMap(): Map<string, ApkSkirmishTrainingScenario> {
    return new Map(getApkSkirmishTrainingScenarios().map(scenario => [scenario.id, scenario]));
}

async function createReplayEnv(
    loaded: LoadedEpisode,
    unpackDir: string,
    scenarioById: Map<string, ApkSkirmishTrainingScenario>,
    mapCache: Map<string, ApkAemMap>
): Promise<AncientEmpiresEnv> {
    const scenario = scenarioById.get(loaded.episode.scenario.id);
    if (!scenario) {
        throw new Error(`未知 APK skirmish 训练场景，无法重放: ${loaded.episode.scenario.id}`);
    }
    const cachedMap = mapCache.get(scenario.resourcePath);
    const map = cachedMap ?? await readApkSkirmishTrainingMap(unpackDir, scenario);
    mapCache.set(scenario.resourcePath, map);
    return createApkSkirmishTrainingEnv(map, scenario, {
        seed: loaded.episode.seed,
        maxPlies: loaded.episode.maxPlies
    });
}

function assertReplayStep(loaded: LoadedEpisode, result: EnvStepResult, step: SkirmishEpisodeStep) {
    if (result.observation.currentPlayer !== step.playerId) {
        throw new Error(`${loaded.episode.scenario.id} seed=${loaded.episode.seed} 第 ${step.step} 步玩家错位`);
    }
    if (result.observation.turn !== step.turnBefore) {
        throw new Error(`${loaded.episode.scenario.id} seed=${loaded.episode.seed} 第 ${step.step} 步回合错位`);
    }
    const selectedEntry = result.legalActionEntries.find(entry => entry.fixedActionIndex === step.fixedActionIndex);
    if (!selectedEntry || selectedEntry.code !== step.actionCode) {
        throw new Error(`${loaded.episode.scenario.id} seed=${loaded.episode.seed} 第 ${step.step} 步动作错位`);
    }
}

function replayToTimeoutEnd(loaded: LoadedEpisode, env: AncientEmpiresEnv): ReplayedTimeoutEpisode {
    let result = env.reset(loaded.episode.seed);
    let beforeFinalResult = result;
    let finalStep: SkirmishEpisodeStep | null = null;

    for (const step of loaded.episode.steps) {
        assertReplayStep(loaded, result, step);
        beforeFinalResult = result;
        finalStep = step;
        result = env.stepFixedAction(step.fixedActionIndex, fixedOptionsFromDescriptor(result.fixedActionSpaceDescriptor));
    }

    return {
        loaded,
        finalResult: result,
        beforeFinalResult,
        finalStep
    };
}

function actionFromStep(step: SkirmishEpisodeStep): Action | null {
    return step.actionCode ? decodeAction(step.actionCode) : null;
}

function emptyActionWindowStats(): ActionWindowStats {
    return {
        steps: 0,
        moves: 0,
        attacks: 0,
        captures: 0,
        destroys: 0,
        summons: 0,
        recruits: 0,
        waits: 0,
        heals: 0,
        supports: 0,
        repairs: 0,
        endTurns: 0,
        spendValue: 0,
        killValue: 0,
        lostValue: 0
    };
}

function addStepToWindowStats(stats: ActionWindowStats, step: SkirmishEpisodeStep) {
    const action = actionFromStep(step);
    stats.steps += 1;
    stats.spendValue += step.spendValue;
    stats.killValue += Object.values(step.killValueByPlayer).reduce((sum, value) => sum + value, 0);
    stats.lostValue += Object.values(step.lostValueByPlayer).reduce((sum, value) => sum + value, 0);
    switch (action?.type) {
        case 'move':
        case 'post_attack_move':
            stats.moves += 1;
            break;
        case 'attack':
            stats.attacks += 1;
            break;
        case 'capture':
            stats.captures += 1;
            break;
        case 'destroy_town':
            stats.destroys += 1;
            break;
        case 'summon':
            stats.summons += 1;
            break;
        case 'recruit_to_castle':
        case 'recruit_and_deploy':
            stats.recruits += 1;
            break;
        case 'wait':
            stats.waits += 1;
            break;
        case 'heal':
            stats.heals += 1;
            break;
        case 'support':
            stats.supports += 1;
            break;
        case 'repair':
            stats.repairs += 1;
            break;
        case 'end_turn':
            stats.endTurns += 1;
            break;
        default:
            break;
    }
}

function summarizeTailWindow(episode: SkirmishEpisodeRecord, tailTurns: number): Record<string, ActionWindowStats> {
    const fromTurn = Math.max(1, episode.summary.finalTurn - tailTurns + 1);
    const byPolicy: Record<string, ActionWindowStats> = {};
    for (const step of episode.steps) {
        if (step.turnBefore < fromTurn) continue;
        byPolicy[step.policy] ??= emptyActionWindowStats();
        addStepToWindowStats(byPolicy[step.policy], step);
    }
    return byPolicy;
}

function relationToPlayer(observation: Observation, playerId: number, ownerId: number | null | undefined): string {
    if (ownerId === null || ownerId === undefined) return 'neutral';
    if (ownerId === playerId) return 'self';
    const self = observation.players.find(player => player.id === playerId);
    const other = observation.players.find(player => player.id === ownerId);
    if (self && other && self.allianceId === other.allianceId) return 'ally';
    return 'enemy';
}

function countBuildingsForPlayer(observation: Observation, playerId: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const tile of observation.tiles) {
        const isBuilding = tile.terrainKey === 'castle'
            || tile.terrainKey === 'town'
            || tile.terrainKey === 'damaged_town'
            || tile.terrainTags.includes('building');
        if (!isBuilding) continue;
        const key = `${relationToPlayer(observation, playerId, tile.ownerId)}:${tile.terrainKey}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function formatBuildingCounts(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join(', ') || '-';
}

function formatUnitClasses(units: Observation['units']): string {
    const counts: Record<string, number> = {};
    for (const unit of units) {
        if (unit.hp <= 0) continue;
        counts[unit.unitClass] = (counts[unit.unitClass] ?? 0) + 1;
    }
    return Object.entries(counts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 6)
        .map(([unitClass, count]) => `${unitClass}:${count}`)
        .join(', ') || '-';
}

function legalActionTypeCounts(result: EnvStepResult): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const code of result.legalActionCodes) {
        const action = decodeAction(code);
        const type = action?.type ?? 'unknown';
        counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
}

function formatActionTypeCounts(counts: Record<string, number>): string {
    return Object.entries(counts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([type, count]) => `${type}:${count}`)
        .join(', ') || '-';
}

function formatStats(stats: ActionWindowStats): string {
    return [
        `steps=${stats.steps}`,
        `move=${stats.moves}`,
        `attack=${stats.attacks}`,
        `capture=${stats.captures}`,
        `destroy=${stats.destroys}`,
        `summon=${stats.summons}`,
        `recruit=${stats.recruits}`,
        `wait=${stats.waits}`,
        `end_turn=${stats.endTurns}`,
        `kill=${stats.killValue}`,
        `lost=${stats.lostValue}`,
        `spend=${stats.spendValue}`
    ].join(', ');
}

function ownerAllianceId(observation: Observation, ownerId: number | null | undefined): number | null {
    if (ownerId === null || ownerId === undefined) return null;
    return observation.players.find(player => player.id === ownerId)?.allianceId ?? null;
}

function isBuildingTile(tile: Observation['tiles'][number]): boolean {
    return tile.terrainKey === 'castle'
        || tile.terrainKey === 'town'
        || tile.terrainKey === 'damaged_town'
        || tile.terrainTags.includes('building');
}

function totalTailStats(episode: SkirmishEpisodeRecord, tailTurns: number): ActionWindowStats {
    const total = emptyActionWindowStats();
    for (const stats of Object.values(summarizeTailWindow(episode, tailTurns))) {
        total.steps += stats.steps;
        total.moves += stats.moves;
        total.attacks += stats.attacks;
        total.captures += stats.captures;
        total.destroys += stats.destroys;
        total.summons += stats.summons;
        total.recruits += stats.recruits;
        total.waits += stats.waits;
        total.heals += stats.heals;
        total.supports += stats.supports;
        total.repairs += stats.repairs;
        total.endTurns += stats.endTurns;
        total.spendValue += stats.spendValue;
        total.killValue += stats.killValue;
        total.lostValue += stats.lostValue;
    }
    return total;
}

function formatPatternSummary(replayed: readonly ReplayedTimeoutEpisode[], tailTurns: number): string[] {
    if (replayed.length === 0) return ['- 没有找到符合条件的 timeout episode。'];

    const dominantWithoutEnemyUnits = replayed.filter(item => {
        const winnerAlliance = item.loaded.episode.summary.adjudicatedWinnerAlliance;
        if (winnerAlliance === null || winnerAlliance < 0) return false;
        return item.finalResult.observation.units.every(unit => (
            unit.hp <= 0 || ownerAllianceId(item.finalResult.observation, unit.ownerId) === winnerAlliance
        ));
    }).length;
    const noCaptureOrDestroyInTail = replayed.filter(item => {
        const stats = totalTailStats(item.loaded.episode, tailTurns);
        return stats.captures === 0 && stats.destroys === 0;
    }).length;
    const noDirectPressureAtFinalChoice = replayed.filter(item => {
        const counts = legalActionTypeCounts(item.beforeFinalResult);
        return (counts.attack ?? 0) + (counts.capture ?? 0) + (counts.destroy_town ?? 0) + (counts.summon ?? 0) === 0;
    }).length;
    const unresolvedBuildings = replayed.map(item => {
        const winnerAlliance = item.loaded.episode.summary.adjudicatedWinnerAlliance;
        const observation = item.finalResult.observation;
        const nonWinnerBuildings = observation.tiles.filter(tile => (
            isBuildingTile(tile)
            && tile.ownerId !== null
            && ownerAllianceId(observation, tile.ownerId) !== winnerAlliance
        )).length;
        const neutralBuildings = observation.tiles.filter(tile => isBuildingTile(tile) && tile.ownerId === null).length;
        return {
            scenario: item.loaded.episode.scenario.id,
            fileLabel: item.loaded.fileLabel,
            nonWinnerBuildings,
            neutralBuildings
        };
    });

    return [
        `- ${dominantWithoutEnemyUnits}/${replayed.length} 个 timeout 终局中，裁定优势方之外已经没有存活单位，但仍未自然结束。`,
        `- ${noCaptureOrDestroyInTail}/${replayed.length} 个 timeout 在最后 ${tailTurns} 回合没有 capture/destroy_town，说明残局清建筑目标没有进入动作选择。`,
        `- ${noDirectPressureAtFinalChoice}/${replayed.length} 个 timeout 的最后选择点已经没有 attack/capture/destroy/summon，问题发生在更早的目标推进阶段，而不是最后一手。`,
        `- 未清理建筑残留：${unresolvedBuildings.map(item => `${item.fileLabel}/${item.scenario}:敌方建筑${item.nonWinnerBuildings},中立建筑${item.neutralBuildings}`).join('；')}。`,
        '- 因此 v3 特征应显式编码：回合阶段、整体军力差、敌方剩余单位/是否只剩低价值目标、是否明显优势、合法动作中是否存在直接施压、移动是否接近敌城/敌指挥官，以及等待/治疗/无进展移动等低收益动作。'
    ];
}

function formatReplayedEpisode(replayed: ReplayedTimeoutEpisode, tailTurns: number): string[] {
    const { episode } = replayed.loaded;
    const finalObservation = replayed.finalResult.observation;
    const lines = [
        `### ${episode.scenario.id} / ${replayed.loaded.fileLabel}`,
        '',
        `- 输入：\`${replayed.loaded.inputFile}\` 第 ${replayed.loaded.episodeIndex + 1} 局`,
        `- seed：${episode.seed}`,
        `- timeout：${episode.summary.timeout ? '是' : '否'}，终局回合：${episode.summary.finalTurn}，步数：${episode.summary.stepCount}`,
        `- 裁定胜方联盟：${episode.summary.adjudicatedWinnerAlliance ?? '无'}，自然胜方：${episode.summary.winnerAlliance ?? '无'}`,
        `- 最后一手：${replayed.finalStep?.policy ?? '-'} P${replayed.finalStep?.playerId ?? '-'} ${replayed.finalStep?.actionCode ?? '-'}，信息：${replayed.finalStep?.info ?? '-'}`,
        '',
        '| 玩家 | 策略 | 联盟 | 金币 | 军力估值 | 存活单位 | 指挥官 | 建筑归属概况 | 主要兵种 |',
        '| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |'
    ];

    for (const player of finalObservation.players) {
        const units = finalObservation.units.filter(unit => unit.ownerId === player.id && unit.hp > 0);
        const commanderCount = units.filter(unit => unit.isCommander).length;
        lines.push([
            `| ${player.id}`,
            episode.policyByPlayer[player.id] ?? '-',
            String(player.allianceId),
            String(player.gold),
            String(calculateArmyValue(replayed.finalResult.state, player.id)),
            String(units.length),
            String(commanderCount),
            formatBuildingCounts(countBuildingsForPlayer(finalObservation, player.id)),
            `${formatUnitClasses(units)} |`
        ].join(' | '));
    }

    lines.push(
        '',
        `- 终局联盟军力：${formatActionTypeCounts(episode.summary.finalArmyValueByAlliance)}`,
        `- timeout 前一手玩家：P${replayed.beforeFinalResult.observation.currentPlayer}，回合：${replayed.beforeFinalResult.observation.turn}`,
        `- timeout 前一手合法动作：${formatActionTypeCounts(legalActionTypeCounts(replayed.beforeFinalResult))}`,
        '',
        `最近 ${tailTurns} 回合动作窗口：`,
        '',
        '| 策略 | 统计 |',
        '| --- | --- |'
    );

    const tailStats = summarizeTailWindow(episode, tailTurns);
    for (const [policy, stats] of Object.entries(tailStats).sort(([left], [right]) => left.localeCompare(right))) {
        lines.push(`| ${policy} | ${formatStats(stats)} |`);
    }

    lines.push('');
    return lines;
}

export async function generateTimeoutFocusReport(options: TimeoutFocusReportOptions): Promise<{
    report: string;
    replayed: ReplayedTimeoutEpisode[];
}> {
    const loadedEpisodes = await readLoadedEpisodes(options.files);
    const focusScenarios = new Set(options.scenarioIds);
    const timeoutEpisodes = loadedEpisodes.filter(loaded => (
        loaded.episode.summary.timeout
        && focusScenarios.has(loaded.episode.scenario.id)
    ));
    const scenarioById = createScenarioMap();
    const mapCache = new Map<string, ApkAemMap>();
    const replayed: ReplayedTimeoutEpisode[] = [];

    for (const loaded of timeoutEpisodes) {
        const env = await createReplayEnv(loaded, options.unpackDir, scenarioById, mapCache);
        replayed.push(replayToTimeoutEnd(loaded, env));
    }

    const lines = [
        '# Skirmish Timeout 终局聚焦报告',
        '',
        `- 输入文件：${options.files.map(file => `\`${file.label}=${file.file}\``).join(', ')}`,
        `- 聚焦场景：${options.scenarioIds.map(scenario => `\`${scenario}\``).join(', ')}`,
        `- timeout 局数：${replayed.length}`,
        `- 窗口统计：timeout 前最近 ${options.tailTurns} 回合`,
        '',
        '## 结论摘要',
        '',
        '- `Liberty Port` 是跨 seed 稳定 timeout，优先级最高。',
        '- `classic 2` 与 `Crossroads` 是 seed 敏感 timeout，应作为回归热点保留。',
        ...formatPatternSummary(replayed, options.tailTurns),
        ''
    ];

    if (replayed.length === 0) {
        lines.push('没有找到符合条件的 timeout episode。', '');
    } else {
        lines.push('## 终局明细', '');
        for (const item of replayed) {
            lines.push(...formatReplayedEpisode(item, options.tailTurns));
        }
    }

    const report = lines.join('\n');
    await mkdir(path.dirname(options.outFile), { recursive: true });
    await writeFile(options.outFile, report, 'utf8');
    return { report, replayed };
}

async function main() {
    const options = parseTimeoutFocusReportArgs(process.argv.slice(2));
    const result = await generateTimeoutFocusReport(options);
    if (options.json) {
        console.log(JSON.stringify({
            outFile: options.outFile,
            timeoutEpisodes: result.replayed.map(item => ({
                fileLabel: item.loaded.fileLabel,
                scenario: item.loaded.episode.scenario.id,
                seed: item.loaded.episode.seed,
                finalTurn: item.loaded.episode.summary.finalTurn,
                stepCount: item.loaded.episode.summary.stepCount,
                adjudicatedWinnerAlliance: item.loaded.episode.summary.adjudicatedWinnerAlliance
            }))
        }, null, 2));
    } else {
        console.log(result.report);
    }
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
