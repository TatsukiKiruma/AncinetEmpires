import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createApkSkirmishTrainingEnv, getApkSkirmishTrainingScenarios } from '../src/game/apk_skirmish';
import {
    createApkLikeBaselinePolicy,
    createHeuristicBaselinePolicy,
    createRandomBaselinePolicy,
    readApkSkirmishTrainingMap,
    runSkirmishEpisode,
    type SkirmishEpisodeRecord,
    type SkirmishPolicy,
    type SkirmishPolicyContext,
    type SkirmishPolicyFactory
} from './skirmish_training_runner';

type PolicyName = 'heuristic' | 'apk-like' | 'random';
type WinningPolicy = PolicyName | 'draw' | 'none';
type PairingId = 'heuristic-vs-apk-like' | 'heuristic-vs-random' | 'apk-like-vs-random';

interface DecisionStats {
    calls: number;
    totalMs: number;
    maxMs: number;
}

interface DecisionStatsSummary extends DecisionStats {
    averageMs: number;
}

interface PairingSpec {
    id: PairingId;
    label: string;
    policies: [PolicyName, PolicyName];
}

interface EpisodeRow {
    jobIndex: number;
    scenarioId: string;
    mapName: string;
    pairingId: PairingId;
    repeatIndex: number;
    seed: number;
    p0Policy: PolicyName;
    p1Policy: PolicyName;
    winningPolicy: WinningPolicy;
    winnerAlliance: number | null;
    adjudicatedWinnerAlliance: number | null;
    terminal: boolean;
    timeout: boolean;
    stoppedByMaxSteps: boolean;
    illegalActionCount: number;
    steps: number;
    finalTurn: number;
    durationMs: number;
    decisionStatsByPolicy: Record<PolicyName, DecisionStatsSummary>;
}

interface PairingSummary {
    pairingId: PairingId;
    label: string;
    episodes: number;
    winsByPolicy: Record<PolicyName, number>;
    winRateByPolicy: Record<PolicyName, number>;
    drawCount: number;
    noneCount: number;
    timeoutCount: number;
    naturalWinCount: number;
    adjudicatedWinCount: number;
    illegalActionCount: number;
    averageSteps: number;
    averageDurationMs: number;
    decisionStatsByPolicy: Record<PolicyName, DecisionStatsSummary>;
}

interface BenchmarkSummary {
    generatedAt: string;
    outDir: string;
    unpackDir: string;
    mapsRequested: number;
    mapsSelected: number;
    repeatsPerMapPairing: number;
    totalEpisodes: number;
    maxTurns: number;
    seed: number;
    scenarios: Array<{
        id: string;
        mapName: string;
        playerCount: number;
    }>;
    pairings: PairingSpec[];
    winsByPolicy: Record<PolicyName, number>;
    winRateByPolicy: Record<PolicyName, number>;
    drawCount: number;
    noneCount: number;
    timeoutCount: number;
    naturalWinCount: number;
    adjudicatedWinCount: number;
    illegalActionCount: number;
    decisionStatsByPolicy: Record<PolicyName, DecisionStatsSummary>;
    pairingSummaries: Record<PairingId, PairingSummary>;
    episodeRows: EpisodeRow[];
}

interface BenchmarkOptions {
    maps: number;
    repeatsPerMapPairing: number;
    maxTurns: number;
    seed: number;
    unpackDir: string;
    outDir: string;
    scenarioIds: string[];
}

const POLICY_NAMES: PolicyName[] = ['heuristic', 'apk-like', 'random'];
const PAIRINGS: PairingSpec[] = [
    {
        id: 'heuristic-vs-apk-like',
        label: 'heuristic + apk-like',
        policies: ['heuristic', 'apk-like']
    },
    {
        id: 'heuristic-vs-random',
        label: 'heuristic + random',
        policies: ['heuristic', 'random']
    },
    {
        id: 'apk-like-vs-random',
        label: 'apk-like + random',
        policies: ['apk-like', 'random']
    }
];

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), 'training_runs', 'benchmarks', 'sd_strategy_timing_30x500');

function parseIntegerArg(argv: readonly string[], name: string, fallback: number): number {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数`);
    return value;
}

function parseStringArg(argv: readonly string[], name: string, fallback: string): string {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} 缺少参数`);
    return value;
}

function parseRepeatedStringArg(argv: readonly string[], name: string): string[] {
    const values: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] !== name) continue;
        const value = argv[index + 1];
        if (!value) throw new Error(`${name} 缺少参数`);
        values.push(value);
        index += 1;
    }
    return values;
}

function parseOptions(argv: readonly string[]): BenchmarkOptions {
    if (argv.includes('--help')) {
        printHelp();
        process.exit(0);
    }
    return {
        maps: parseIntegerArg(argv, '--maps', 5),
        repeatsPerMapPairing: parseIntegerArg(argv, '--repeats-per-map-pairing', 2),
        maxTurns: parseIntegerArg(argv, '--max-turns', 500),
        seed: parseIntegerArg(argv, '--seed', 2026070601),
        unpackDir: path.resolve(parseStringArg(argv, '--unpack', DEFAULT_UNPACK_DIR)),
        outDir: path.resolve(parseStringArg(argv, '--out-dir', DEFAULT_OUT_DIR)),
        scenarioIds: parseRepeatedStringArg(argv, '--scenario')
    };
}

function printHelp() {
    console.log(`用法: npm run bench:sd:strategy-timing -- [选项]

选项:
  --maps <n>                     选取前 n 张 SD 2P 地图，默认 5
  --scenario <id>                指定 SD 2P 地图场景，可重复；指定后忽略 --maps
  --repeats-per-map-pairing <n>  每张地图每组策略跑几局，默认 2
  --max-turns <n>                每局最大回合数，默认 500
  --seed <n>                     起始 seed，默认 2026070601
  --unpack <dir>                 APK 解包目录，默认 APK/_analysis/unpack
  --out-dir <dir>                输出目录，默认 training_runs/benchmarks/sd_strategy_timing_30x500
  --help                         显示帮助
`);
}

function createEmptyDecisionStats(): DecisionStats {
    return { calls: 0, totalMs: 0, maxMs: 0 };
}

function createDecisionStatsByPolicy(): Record<PolicyName, DecisionStats> {
    return {
        heuristic: createEmptyDecisionStats(),
        'apk-like': createEmptyDecisionStats(),
        random: createEmptyDecisionStats()
    };
}

function addDecisionStats(target: DecisionStats, elapsedMs: number) {
    target.calls += 1;
    target.totalMs += elapsedMs;
    target.maxMs = Math.max(target.maxMs, elapsedMs);
}

function summarizeDecisionStats(stats: DecisionStats): DecisionStatsSummary {
    return {
        calls: stats.calls,
        totalMs: roundMs(stats.totalMs),
        maxMs: roundMs(stats.maxMs),
        averageMs: roundMs(stats.totalMs / Math.max(1, stats.calls))
    };
}

function summarizeDecisionStatsByPolicy(statsByPolicy: Record<PolicyName, DecisionStats>): Record<PolicyName, DecisionStatsSummary> {
    return {
        heuristic: summarizeDecisionStats(statsByPolicy.heuristic),
        'apk-like': summarizeDecisionStats(statsByPolicy['apk-like']),
        random: summarizeDecisionStats(statsByPolicy.random)
    };
}

function roundMs(value: number): number {
    return Number(value.toFixed(3));
}

function createPolicyByName(name: PolicyName, seed: number): SkirmishPolicy {
    if (name === 'heuristic') return createHeuristicBaselinePolicy(seed);
    if (name === 'apk-like') return createApkLikeBaselinePolicy(seed);
    return createRandomBaselinePolicy(seed);
}

function wrapPolicy(
    policyName: PolicyName,
    policy: SkirmishPolicy,
    statsTargets: Array<Record<PolicyName, DecisionStats>>
): SkirmishPolicy {
    return {
        name: policy.name,
        selectFixedActionIndex(context: SkirmishPolicyContext): number {
            const startedAt = performance.now();
            try {
                return policy.selectFixedActionIndex(context);
            } finally {
                const elapsedMs = performance.now() - startedAt;
                for (const statsByPolicy of statsTargets) {
                    addDecisionStats(statsByPolicy[policyName], elapsedMs);
                }
            }
        }
    };
}

function createTimedPolicyFactory(options: {
    p0Policy: PolicyName;
    p1Policy: PolicyName;
    globalStatsByPolicy: Record<PolicyName, DecisionStats>;
    pairingStatsByPolicy: Record<PolicyName, DecisionStats>;
    episodeStatsByPolicy: Record<PolicyName, DecisionStats>;
}): SkirmishPolicyFactory {
    return (playerId, playerIds, episodeSeed) => {
        const sortedPlayerIds = [...playerIds].sort((left, right) => left - right);
        const playerIndex = Math.max(0, sortedPlayerIds.indexOf(playerId));
        const policyName = playerIndex === 0 ? options.p0Policy : options.p1Policy;
        const policySeed = episodeSeed + playerId * 1009 + playerIndex * 9173;
        const policy = createPolicyByName(policyName, policySeed);
        return wrapPolicy(policyName, policy, [
            options.globalStatsByPolicy,
            options.pairingStatsByPolicy,
            options.episodeStatsByPolicy
        ]);
    };
}

function getWinningPolicy(episode: SkirmishEpisodeRecord): WinningPolicy {
    const winnerAlliance = episode.summary.adjudicatedWinnerAlliance ?? episode.summary.winnerAlliance;
    if (winnerAlliance === -1) return 'draw';
    if (winnerAlliance === null) return 'none';
    const winningPlayer = episode.players.find(player => player.allianceId === winnerAlliance);
    if (winningPlayer?.policy === 'heuristic' || winningPlayer?.policy === 'apk-like' || winningPlayer?.policy === 'random') {
        return winningPlayer.policy;
    }
    return 'none';
}

function createEmptyWinsByPolicy(): Record<PolicyName, number> {
    return {
        heuristic: 0,
        'apk-like': 0,
        random: 0
    };
}

function createInitialPairingSummaries(): Record<PairingId, PairingSummary> {
    return Object.fromEntries(PAIRINGS.map(pairing => [
        pairing.id,
        {
            pairingId: pairing.id,
            label: pairing.label,
            episodes: 0,
            winsByPolicy: createEmptyWinsByPolicy(),
            winRateByPolicy: createEmptyWinsByPolicy(),
            drawCount: 0,
            noneCount: 0,
            timeoutCount: 0,
            naturalWinCount: 0,
            adjudicatedWinCount: 0,
            illegalActionCount: 0,
            averageSteps: 0,
            averageDurationMs: 0,
            decisionStatsByPolicy: summarizeDecisionStatsByPolicy(createDecisionStatsByPolicy())
        }
    ])) as Record<PairingId, PairingSummary>;
}

function buildSummary(options: BenchmarkOptions, context: {
    scenarios: Array<{ id: string; mapName: string; playerCount: number }>;
    episodeRows: EpisodeRow[];
    globalStatsByPolicy: Record<PolicyName, DecisionStats>;
    pairingStatsByPolicy: Record<PairingId, Record<PolicyName, DecisionStats>>;
}): BenchmarkSummary {
    const winsByPolicy = createEmptyWinsByPolicy();
    const pairingSummaries = createInitialPairingSummaries();
    let drawCount = 0;
    let noneCount = 0;
    let timeoutCount = 0;
    let naturalWinCount = 0;
    let adjudicatedWinCount = 0;
    let illegalActionCount = 0;

    for (const row of context.episodeRows) {
        if (row.winningPolicy === 'draw') {
            drawCount += 1;
            pairingSummaries[row.pairingId].drawCount += 1;
        } else if (row.winningPolicy === 'none') {
            noneCount += 1;
            pairingSummaries[row.pairingId].noneCount += 1;
        } else {
            winsByPolicy[row.winningPolicy] += 1;
            pairingSummaries[row.pairingId].winsByPolicy[row.winningPolicy] += 1;
        }
        if (row.timeout) {
            timeoutCount += 1;
            pairingSummaries[row.pairingId].timeoutCount += 1;
        }
        if (row.winnerAlliance !== null) {
            naturalWinCount += 1;
            pairingSummaries[row.pairingId].naturalWinCount += 1;
        }
        if (row.adjudicatedWinnerAlliance !== null && row.winnerAlliance === null) {
            adjudicatedWinCount += 1;
            pairingSummaries[row.pairingId].adjudicatedWinCount += 1;
        }
        illegalActionCount += row.illegalActionCount;
        pairingSummaries[row.pairingId].illegalActionCount += row.illegalActionCount;
        pairingSummaries[row.pairingId].episodes += 1;
        pairingSummaries[row.pairingId].averageSteps += row.steps;
        pairingSummaries[row.pairingId].averageDurationMs += row.durationMs;
    }

    for (const pairing of PAIRINGS) {
        const summary = pairingSummaries[pairing.id];
        summary.averageSteps = Number((summary.averageSteps / Math.max(1, summary.episodes)).toFixed(2));
        summary.averageDurationMs = roundMs(summary.averageDurationMs / Math.max(1, summary.episodes));
        summary.winRateByPolicy = calculateWinRates(summary.winsByPolicy, summary.episodes);
        summary.decisionStatsByPolicy = summarizeDecisionStatsByPolicy(context.pairingStatsByPolicy[pairing.id]);
    }

    return {
        generatedAt: new Date().toISOString(),
        outDir: options.outDir,
        unpackDir: options.unpackDir,
        mapsRequested: options.maps,
        mapsSelected: context.scenarios.length,
        repeatsPerMapPairing: options.repeatsPerMapPairing,
        totalEpisodes: context.episodeRows.length,
        maxTurns: options.maxTurns,
        seed: options.seed,
        scenarios: context.scenarios.map(scenario => ({
            id: scenario.id,
            mapName: scenario.mapName,
            playerCount: scenario.playerCount
        })),
        pairings: PAIRINGS,
        winsByPolicy,
        winRateByPolicy: calculateWinRates(winsByPolicy, context.episodeRows.length),
        drawCount,
        noneCount,
        timeoutCount,
        naturalWinCount,
        adjudicatedWinCount,
        illegalActionCount,
        decisionStatsByPolicy: summarizeDecisionStatsByPolicy(context.globalStatsByPolicy),
        pairingSummaries,
        episodeRows: context.episodeRows
    };
}

function calculateWinRates(winsByPolicy: Record<PolicyName, number>, episodes: number): Record<PolicyName, number> {
    return {
        heuristic: Number((winsByPolicy.heuristic / Math.max(1, episodes)).toFixed(4)),
        'apk-like': Number((winsByPolicy['apk-like'] / Math.max(1, episodes)).toFixed(4)),
        random: Number((winsByPolicy.random / Math.max(1, episodes)).toFixed(4))
    };
}

function csvEscape(value: unknown): string {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatEpisodesCsv(rows: readonly EpisodeRow[]): string {
    const header = [
        'jobIndex',
        'scenarioId',
        'mapName',
        'pairingId',
        'repeatIndex',
        'seed',
        'p0Policy',
        'p1Policy',
        'winningPolicy',
        'winnerAlliance',
        'adjudicatedWinnerAlliance',
        'terminal',
        'timeout',
        'stoppedByMaxSteps',
        'illegalActionCount',
        'steps',
        'finalTurn',
        'durationMs',
        'heuristicCalls',
        'heuristicTotalMs',
        'heuristicAverageMs',
        'heuristicMaxMs',
        'apkLikeCalls',
        'apkLikeTotalMs',
        'apkLikeAverageMs',
        'apkLikeMaxMs',
        'randomCalls',
        'randomTotalMs',
        'randomAverageMs',
        'randomMaxMs'
    ];
    const lines = rows.map(row => [
        row.jobIndex,
        row.scenarioId,
        row.mapName,
        row.pairingId,
        row.repeatIndex,
        row.seed,
        row.p0Policy,
        row.p1Policy,
        row.winningPolicy,
        row.winnerAlliance ?? '',
        row.adjudicatedWinnerAlliance ?? '',
        row.terminal,
        row.timeout,
        row.stoppedByMaxSteps,
        row.illegalActionCount,
        row.steps,
        row.finalTurn,
        roundMs(row.durationMs),
        row.decisionStatsByPolicy.heuristic.calls,
        row.decisionStatsByPolicy.heuristic.totalMs,
        row.decisionStatsByPolicy.heuristic.averageMs,
        row.decisionStatsByPolicy.heuristic.maxMs,
        row.decisionStatsByPolicy['apk-like'].calls,
        row.decisionStatsByPolicy['apk-like'].totalMs,
        row.decisionStatsByPolicy['apk-like'].averageMs,
        row.decisionStatsByPolicy['apk-like'].maxMs,
        row.decisionStatsByPolicy.random.calls,
        row.decisionStatsByPolicy.random.totalMs,
        row.decisionStatsByPolicy.random.averageMs,
        row.decisionStatsByPolicy.random.maxMs
    ].map(csvEscape).join(','));
    return [header.join(','), ...lines].join('\n') + '\n';
}

function formatDecisionStatsCsv(summary: BenchmarkSummary): string {
    const header = ['scope', 'pairingId', 'policy', 'calls', 'totalMs', 'averageMs', 'maxMs'];
    const rows: string[][] = [];
    for (const policy of POLICY_NAMES) {
        const stats = summary.decisionStatsByPolicy[policy];
        rows.push(['global', '', policy, String(stats.calls), String(stats.totalMs), String(stats.averageMs), String(stats.maxMs)]);
    }
    for (const pairing of PAIRINGS) {
        for (const policy of POLICY_NAMES) {
            const stats = summary.pairingSummaries[pairing.id].decisionStatsByPolicy[policy];
            rows.push(['pairing', pairing.id, policy, String(stats.calls), String(stats.totalMs), String(stats.averageMs), String(stats.maxMs)]);
        }
    }
    return [header.join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n') + '\n';
}

function formatPairingSummaryCsv(summary: BenchmarkSummary): string {
    const header = [
        'pairingId',
        'episodes',
        'heuristicWins',
        'heuristicWinRate',
        'apkLikeWins',
        'apkLikeWinRate',
        'randomWins',
        'randomWinRate',
        'drawCount',
        'noneCount',
        'timeoutCount',
        'naturalWinCount',
        'adjudicatedWinCount',
        'illegalActionCount',
        'averageSteps',
        'averageDurationMs'
    ];
    const rows = PAIRINGS.map(pairing => {
        const item = summary.pairingSummaries[pairing.id];
        return [
            item.pairingId,
            item.episodes,
            item.winsByPolicy.heuristic,
            item.winRateByPolicy.heuristic,
            item.winsByPolicy['apk-like'],
            item.winRateByPolicy['apk-like'],
            item.winsByPolicy.random,
            item.winRateByPolicy.random,
            item.drawCount,
            item.noneCount,
            item.timeoutCount,
            item.naturalWinCount,
            item.adjudicatedWinCount,
            item.illegalActionCount,
            item.averageSteps,
            item.averageDurationMs
        ].map(csvEscape).join(',');
    });
    return [header.join(','), ...rows].join('\n') + '\n';
}

async function writeOutputs(summary: BenchmarkSummary) {
    await mkdir(summary.outDir, { recursive: true });
    await writeFile(path.join(summary.outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    await writeFile(path.join(summary.outDir, 'episodes.csv'), formatEpisodesCsv(summary.episodeRows), 'utf8');
    await writeFile(path.join(summary.outDir, 'decision_stats.csv'), formatDecisionStatsCsv(summary), 'utf8');
    await writeFile(path.join(summary.outDir, 'pairing_summary.csv'), formatPairingSummaryCsv(summary), 'utf8');
}

function printFinalSummary(summary: BenchmarkSummary) {
    console.log(`输出目录: ${summary.outDir}`);
    console.log(`总局数: ${summary.totalEpisodes}，地图数: ${summary.mapsSelected}，maxTurns=${summary.maxTurns}`);
    console.log('');
    console.log('策略总胜率:');
    for (const policy of POLICY_NAMES) {
        console.log(`- ${policy}: ${summary.winsByPolicy[policy]}/${summary.totalEpisodes} (${(summary.winRateByPolicy[policy] * 100).toFixed(2)}%)`);
    }
    console.log(`- draw: ${summary.drawCount}`);
    console.log(`- none: ${summary.noneCount}`);
    console.log('');
    console.log('决策耗时:');
    for (const policy of POLICY_NAMES) {
        const stats = summary.decisionStatsByPolicy[policy];
        console.log(`- ${policy}: 次数=${stats.calls} 总耗时=${stats.totalMs}ms 平均=${stats.averageMs}ms 最大=${stats.maxMs}ms`);
    }
    console.log('');
    console.log('分组胜率:');
    for (const pairing of PAIRINGS) {
        const item = summary.pairingSummaries[pairing.id];
        console.log(`- ${pairing.id}: heuristic ${item.winsByPolicy.heuristic}/${item.episodes}，apk-like ${item.winsByPolicy['apk-like']}/${item.episodes}，random ${item.winsByPolicy.random}/${item.episodes}，timeout ${item.timeoutCount}`);
    }
}

function selectScenarios(options: BenchmarkOptions) {
    const candidates = getApkSkirmishTrainingScenarios()
        .filter(scenario => scenario.mode === 'SD' && scenario.playerCount === 2);
    if (options.scenarioIds.length > 0) {
        const byId = new Map(candidates.map(scenario => [scenario.id, scenario]));
        const selected = options.scenarioIds.map(id => {
            const scenario = byId.get(id);
            if (!scenario) throw new Error(`找不到 SD 2P 场景: ${id}`);
            return scenario;
        });
        return selected;
    }
    return candidates.slice(0, options.maps);
}

async function main() {
    const options = parseOptions(process.argv.slice(2));
    const scenarios = selectScenarios(options);
    if (scenarios.length === 0) throw new Error('没有选中任何 SD 2P 地图');

    const globalStatsByPolicy = createDecisionStatsByPolicy();
    const pairingStatsByPolicy = Object.fromEntries(PAIRINGS.map(pairing => [
        pairing.id,
        createDecisionStatsByPolicy()
    ])) as Record<PairingId, Record<PolicyName, DecisionStats>>;
    const episodeRows: EpisodeRow[] = [];
    const totalJobs = scenarios.length * PAIRINGS.length * options.repeatsPerMapPairing;

    await mkdir(options.outDir, { recursive: true });
    let jobIndex = 0;
    for (const [scenarioIndex, scenario] of scenarios.entries()) {
        const map = await readApkSkirmishTrainingMap(options.unpackDir, scenario);
        for (const [pairingIndex, pairing] of PAIRINGS.entries()) {
            for (let repeatIndex = 0; repeatIndex < options.repeatsPerMapPairing; repeatIndex += 1) {
                jobIndex += 1;
                const swapSides = repeatIndex % 2 === 1;
                const p0Policy = swapSides ? pairing.policies[1] : pairing.policies[0];
                const p1Policy = swapSides ? pairing.policies[0] : pairing.policies[1];
                const episodeSeed = options.seed + scenarioIndex * 10000 + pairingIndex * 1000 + repeatIndex;
                const maxPlies = options.maxTurns * Math.max(1, scenario.playerCount);
                const env = createApkSkirmishTrainingEnv(map, scenario, {
                    seed: episodeSeed,
                    maxPlies
                });
                const episodeStatsByPolicy = createDecisionStatsByPolicy();
                const startedAt = performance.now();
                const episode = runSkirmishEpisode({
                    env,
                    scenario,
                    seed: episodeSeed,
                    maxPlies,
                    maxSteps: maxPlies * 64,
                    policyFactory: createTimedPolicyFactory({
                        p0Policy,
                        p1Policy,
                        globalStatsByPolicy,
                        pairingStatsByPolicy: pairingStatsByPolicy[pairing.id],
                        episodeStatsByPolicy
                    }),
                    progressIntervalSteps: 1000000
                });
                const durationMs = performance.now() - startedAt;
                const winningPolicy = getWinningPolicy(episode);
                episodeRows.push({
                    jobIndex,
                    scenarioId: scenario.id,
                    mapName: scenario.mapName,
                    pairingId: pairing.id,
                    repeatIndex,
                    seed: episodeSeed,
                    p0Policy,
                    p1Policy,
                    winningPolicy,
                    winnerAlliance: episode.summary.winnerAlliance,
                    adjudicatedWinnerAlliance: episode.summary.adjudicatedWinnerAlliance,
                    terminal: episode.summary.terminal,
                    timeout: episode.summary.timeout,
                    stoppedByMaxSteps: episode.summary.stoppedByMaxSteps,
                    illegalActionCount: episode.summary.illegalActionCount,
                    steps: episode.summary.stepCount,
                    finalTurn: episode.summary.finalTurn,
                    durationMs,
                    decisionStatsByPolicy: summarizeDecisionStatsByPolicy(episodeStatsByPolicy)
                });
                const summary = buildSummary(options, {
                    scenarios,
                    episodeRows,
                    globalStatsByPolicy,
                    pairingStatsByPolicy
                });
                await writeOutputs(summary);
                console.error(
                    `完成 ${jobIndex}/${totalJobs}: ${scenario.id} ${pairing.id} `
                    + `P0=${p0Policy} P1=${p1Policy} 胜者=${winningPolicy} `
                    + `回合=${episode.summary.finalTurn} 动作=${episode.summary.stepCount} 耗时=${roundMs(durationMs)}ms`
                );
            }
        }
    }

    const summary = buildSummary(options, {
        scenarios,
        episodeRows,
        globalStatsByPolicy,
        pairingStatsByPolicy
    });
    await writeOutputs(summary);
    printFinalSummary(summary);
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
});
