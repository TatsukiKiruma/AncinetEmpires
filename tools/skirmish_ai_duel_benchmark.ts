import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createApkSkirmishTrainingEnv, getApkSkirmishTrainingScenarios } from '../src/game/apk_skirmish';
import {
    createApkLikeBaselinePolicy,
    createHeuristicBaselinePolicy,
    readApkSkirmishTrainingMap,
    runSkirmishEpisode,
    type SkirmishEpisodeRecord,
    type SkirmishPolicy,
    type SkirmishPolicyContext,
    type SkirmishPolicyFactory
} from './skirmish_training_runner';

type PolicyName = 'heuristic' | 'apk-like';

interface DecisionStats {
    calls: number;
    totalMs: number;
    maxMs: number;
}

interface ScenarioRow {
    scenarioId: string;
    episodeIndex: number;
    seed: number;
    p0Policy: PolicyName;
    winnerAlliance: number | null;
    adjudicatedWinnerAlliance: number | null;
    winningPolicy: PolicyName | 'draw' | 'none';
    steps: number;
    finalTurn: number;
    durationMs: number;
}

interface BenchmarkSummary {
    generatedAt: string;
    maps: number;
    episodesPerMap: number;
    totalEpisodes: number;
    maxTurns: number;
    seed: number;
    scenarios: string[];
    winsByPolicy: Record<PolicyName, number>;
    winRateByPolicy: Record<PolicyName, number>;
    decisionStatsByPolicy: Record<PolicyName, DecisionStats & {
        averageMs: number;
    }>;
    episodeRows: ScenarioRow[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_OUT_DIR = path.resolve(process.cwd(), 'training_runs', 'benchmarks', 'sd_ai_duel_20260706');

function parseIntegerArg(argv: readonly string[], name: string, fallback: number): number {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(argv[index + 1]);
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须是正整数`);
    return value;
}

function parseStringArg(argv: readonly string[], name: string, fallback: string): string {
    const index = argv.indexOf(name);
    return index < 0 ? fallback : argv[index + 1] ?? fallback;
}

function createEmptyDecisionStats(): DecisionStats {
    return { calls: 0, totalMs: 0, maxMs: 0 };
}

function wrapPolicy(policy: SkirmishPolicy, stats: DecisionStats): SkirmishPolicy {
    return {
        name: policy.name,
        selectFixedActionIndex(context: SkirmishPolicyContext): number {
            const startedAt = performance.now();
            try {
                return policy.selectFixedActionIndex(context);
            } finally {
                const elapsedMs = performance.now() - startedAt;
                stats.calls += 1;
                stats.totalMs += elapsedMs;
                stats.maxMs = Math.max(stats.maxMs, elapsedMs);
            }
        }
    };
}

function createPolicyFactory(
    p0Policy: PolicyName,
    statsByPolicy: Record<PolicyName, DecisionStats>
): SkirmishPolicyFactory {
    return (playerId, playerIds, episodeSeed) => {
        const sortedPlayerIds = [...playerIds].sort((left, right) => left - right);
        const policyName: PolicyName = playerId === sortedPlayerIds[0]
            ? p0Policy
            : (p0Policy === 'heuristic' ? 'apk-like' : 'heuristic');
        const policySeed = episodeSeed + playerId * 1009 + sortedPlayerIds.indexOf(playerId) * 9173;
        const policy = policyName === 'heuristic'
            ? createHeuristicBaselinePolicy(policySeed)
            : createApkLikeBaselinePolicy(policySeed);
        return wrapPolicy(policy, statsByPolicy[policyName]);
    };
}

function getWinningPolicy(episode: SkirmishEpisodeRecord): PolicyName | 'draw' | 'none' {
    const winnerAlliance = episode.summary.adjudicatedWinnerAlliance ?? episode.summary.winnerAlliance;
    if (winnerAlliance === -1) return 'draw';
    if (winnerAlliance === null) return 'none';
    const winningPlayer = episode.players.find(player => player.allianceId === winnerAlliance);
    return winningPlayer?.policy === 'heuristic' || winningPlayer?.policy === 'apk-like'
        ? winningPlayer.policy
        : 'none';
}

function summarizeDecisionStats(stats: DecisionStats): DecisionStats & { averageMs: number } {
    return {
        calls: stats.calls,
        totalMs: Number(stats.totalMs.toFixed(3)),
        maxMs: Number(stats.maxMs.toFixed(3)),
        averageMs: Number((stats.totalMs / Math.max(1, stats.calls)).toFixed(3))
    };
}

function formatCsv(rows: ScenarioRow[]): string {
    const header = [
        'scenarioId',
        'episodeIndex',
        'seed',
        'p0Policy',
        'winnerAlliance',
        'adjudicatedWinnerAlliance',
        'winningPolicy',
        'steps',
        'finalTurn',
        'durationMs'
    ];
    const lines = rows.map(row => [
        row.scenarioId,
        row.episodeIndex,
        row.seed,
        row.p0Policy,
        row.winnerAlliance ?? '',
        row.adjudicatedWinnerAlliance ?? '',
        row.winningPolicy,
        row.steps,
        row.finalTurn,
        row.durationMs.toFixed(3)
    ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','));
    return [header.join(','), ...lines].join('\n') + '\n';
}

async function main() {
    const argv = process.argv.slice(2);
    const maps = parseIntegerArg(argv, '--maps', 10);
    const episodesPerMap = parseIntegerArg(argv, '--episodes-per-map', 2);
    const maxTurns = parseIntegerArg(argv, '--max-turns', 200);
    const seed = parseIntegerArg(argv, '--seed', 20260706);
    const unpackDir = path.resolve(parseStringArg(argv, '--unpack', DEFAULT_UNPACK_DIR));
    const outDir = path.resolve(parseStringArg(argv, '--out-dir', DEFAULT_OUT_DIR));

    const scenarios = getApkSkirmishTrainingScenarios()
        .filter(scenario => scenario.playerCount === 2)
        .slice(0, maps);
    const statsByPolicy: Record<PolicyName, DecisionStats> = {
        heuristic: createEmptyDecisionStats(),
        'apk-like': createEmptyDecisionStats()
    };
    const winsByPolicy: Record<PolicyName, number> = {
        heuristic: 0,
        'apk-like': 0
    };
    const episodeRows: ScenarioRow[] = [];

    await mkdir(outDir, { recursive: true });

    const writeSummary = async () => {
        const totalEpisodes = episodeRows.length;
        const summary: BenchmarkSummary = {
            generatedAt: new Date().toISOString(),
            maps: scenarios.length,
            episodesPerMap,
            totalEpisodes,
            maxTurns,
            seed,
            scenarios: scenarios.map(scenario => scenario.id),
            winsByPolicy,
            winRateByPolicy: {
                heuristic: Number((winsByPolicy.heuristic / Math.max(1, totalEpisodes)).toFixed(4)),
                'apk-like': Number((winsByPolicy['apk-like'] / Math.max(1, totalEpisodes)).toFixed(4))
            },
            decisionStatsByPolicy: {
                heuristic: summarizeDecisionStats(statsByPolicy.heuristic),
                'apk-like': summarizeDecisionStats(statsByPolicy['apk-like'])
            },
            episodeRows
        };
        await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
        await writeFile(path.join(outDir, 'episodes.csv'), formatCsv(episodeRows), 'utf8');
        return summary;
    };

    for (const [scenarioIndex, scenario] of scenarios.entries()) {
        const map = await readApkSkirmishTrainingMap(unpackDir, scenario);
        for (let episodeIndex = 0; episodeIndex < episodesPerMap; episodeIndex += 1) {
            const p0Policy: PolicyName = episodeIndex % 2 === 0 ? 'heuristic' : 'apk-like';
            const episodeSeed = seed + scenarioIndex * 100 + episodeIndex;
            const maxPlies = maxTurns * Math.max(1, scenario.playerCount);
            const env = createApkSkirmishTrainingEnv(map, scenario, {
                seed: episodeSeed,
                maxPlies
            });
            const startedAt = performance.now();
            const episode = runSkirmishEpisode({
                env,
                scenario,
                seed: episodeSeed,
                maxPlies,
                maxSteps: maxPlies * 64,
                policyFactory: createPolicyFactory(p0Policy, statsByPolicy),
                progressIntervalSteps: 1000000
            });
            const durationMs = performance.now() - startedAt;
            const winningPolicy = getWinningPolicy(episode);
            if (winningPolicy === 'heuristic' || winningPolicy === 'apk-like') {
                winsByPolicy[winningPolicy] += 1;
            }
            episodeRows.push({
                scenarioId: scenario.id,
                episodeIndex,
                seed: episodeSeed,
                p0Policy,
                winnerAlliance: episode.summary.winnerAlliance,
                adjudicatedWinnerAlliance: episode.summary.adjudicatedWinnerAlliance,
                winningPolicy,
                steps: episode.summary.stepCount,
                finalTurn: episode.summary.finalTurn,
                durationMs
            });
            await writeSummary();
            console.error(`完成 ${episodeRows.length}/${scenarios.length * episodesPerMap}: ${scenario.id} 第 ${episodeIndex + 1} 局，胜者 ${winningPolicy}，耗时 ${durationMs.toFixed(1)}ms`);
        }
    }

    const summary = await writeSummary();
    console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
});
