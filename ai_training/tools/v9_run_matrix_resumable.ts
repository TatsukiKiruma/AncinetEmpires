/**
 * V9-04 A/B resumable development-matrix driver.
 *
 * Why this exists: the 80-match matrix takes tens of minutes and the host shell can be
 * recycled mid-run. This driver calls the REAL exported runFullV7BenchmarkSuite per
 * (policy, map, seed) chunk -- each chunk runs both seats -- and appends the finished
 * outcomes to progress.jsonl. An interrupted run resumes without recomputing matches.
 *
 * It is pure orchestration: no evaluation logic is reimplemented here.
 *
 * Usage:
 *   RUN_ID=<id> node --experimental-loader ./.codex_runner/ts-loader.mjs tools/v9_run_matrix_resumable.ts [--merge]
 * Env:
 *   MAX_MS   per-invocation wall budget in ms (default 240000)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    runFullV7BenchmarkSuite,
    BENCHMARK_MAPS,
    DEFAULT_BENCHMARK_PROTOCOL,
    type PolicyType,
    type MatchOutcome
} from './v7_unified_evaluation';

const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260922_v9_identity_04';
const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
const MAIN_DIR = path.join(RUN_DIR, 'main');
const POLICY_FILTER = process.env.POLICY ? process.env.POLICY.split(',').map(s => s.trim()).filter(Boolean) : null;
const PROGRESS = path.join(MAIN_DIR, POLICY_FILTER ? `progress_${POLICY_FILTER.join('_')}.jsonl` : 'progress.jsonl');
const MERGED = path.join(MAIN_DIR, 'comparison_merged.json');

const ALL_POLICIES: PolicyType[] = ['HEURISTIC', 'SPATIAL_V2', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];
const POLICIES: PolicyType[] = POLICY_FILTER ? ALL_POLICIES.filter(p => POLICY_FILTER.includes(p)) : ALL_POLICIES;
const SEEDS = [42, 1337];

function loadOutcomes(): MatchOutcome[] {
    const files = fs.existsSync(MAIN_DIR) ? fs.readdirSync(MAIN_DIR).filter(f => /^progress.*\.jsonl$/.test(f)) : [];
    if (files.length === 0) return [];
    const seen = new Set<string>();
    const out: MatchOutcome[] = [];
    for (const file of files) for (const line of fs.readFileSync(path.join(MAIN_DIR, file), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        for (const o of rec.outcomes ?? []) {
            if (!seen.has(o.matchId)) { seen.add(o.matchId); out.push(o); }
        }
    }
    return out;
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Number(sorted[idx].toFixed(1));
}

function merge(): void {
    const outcomes = loadOutcomes();
    const aggregates: Record<string, any> = {};
    for (const policy of POLICIES) {
        const os = outcomes.filter(o => o.candidatePolicy === policy);
        if (os.length === 0) continue;
        const lats = os.flatMap(o => o.decisionLatencies ?? []).sort((a, b) => a - b);
        const wins = os.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const losses = os.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const draws = os.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const trunc = os.length - wins - losses - draws;
        aggregates[policy] = {
            policy,
            matchesPlayed: os.length,
            naturalWins: wins,
            naturalLosses: losses,
            naturalDraws: draws,
            truncations: trunc,
            truncationRate: Number(((trunc / os.length) * 100).toFixed(1)),
            engineErrors: os.filter(o => o.terminationReason === 'ENGINE_ERROR').length,
            modelLoadErrors: os.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length,
            notRuns: os.filter(o => (o as any).actualPolicy === 'NOT_RUN').length,
            winRateAllMatches: Number(((wins / os.length) * 100).toFixed(1)),
            winRateNaturalOnly: (wins + losses) > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : null,
            avgDecisionMs: lats.length ? Number((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1)) : null,
            latencyP50: percentile(lats, 50),
            latencyP95: percentile(lats, 95),
            latencyP99: percentile(lats, 99),
            latencyMax: lats.length ? Number(lats[lats.length - 1].toFixed(1)) : null,
            latenciesOver1000ms: lats.filter(v => v > 1000).length,
            wallClockExceededMatches: os.filter(o => (o.wallClockExceededCount ?? 0) > 0).length,
            avgSearchNodes: null,
            avgCandidatesEvaluated: os.some(o => (o.searchCandidatesEvaluated ?? 0) > 0)
                ? Number((os.reduce((a, o) => a + (o.searchCandidatesEvaluated ?? 0), 0) / os.length).toFixed(1))
                : null
        };
    }
    const merged = {
        runId: RUN_ID,
        mergedAt: new Date().toISOString(),
        dataSource: 'tools/v9_run_matrix_resumable.ts (real runFullV7BenchmarkSuite chunks, deduplicated by matchId)',
        protocol: {
            maps: BENCHMARK_MAPS.map(m => m.name),
            seats: [0, 1],
            seeds: SEEDS,
            maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
            maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
            searchMaxNodes: DEFAULT_BENCHMARK_PROTOCOL.searchMaxNodes,
            searchBudgetSoftMs: DEFAULT_BENCHMARK_PROTOCOL.searchBudgetSoftMs,
            searchBudgetHardMs: DEFAULT_BENCHMARK_PROTOCOL.searchBudgetHardMs
        },
        totalMatches: outcomes.length,
        outcomes,
        aggregates
    };
    fs.mkdirSync(MAIN_DIR, { recursive: true });
    fs.writeFileSync(MERGED, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[merge] ${outcomes.length} matches -> ${MERGED}`);
    for (const p of POLICIES) {
        const a = aggregates[p];
        if (a) console.log(`  ${p}: ${a.naturalWins}W/${a.naturalLosses}L/${a.naturalDraws}D/${a.truncations}T  W/N=${a.winRateAllMatches}%  W/(W+L)=${a.winRateNaturalOnly}%  p99=${a.latencyP99}ms`);
    }
}

async function runChunks(): Promise<void> {
    fs.mkdirSync(MAIN_DIR, { recursive: true });
    const budgetMs = Number(process.env.MAX_MS ?? 240000);
    const t0 = Date.now();
    const done = new Set(loadOutcomes().map(o => `${o.candidatePolicy}|${o.mapName}|${o.seed}`));
    let ran = 0;
    for (const policy of POLICIES) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of SEEDS) {
                const key = `${policy}|${map.name}|${seed}`;
                if (done.has(key)) continue;
                if (Date.now() - t0 > budgetMs) { console.log(`[budget] stop after ${ran} chunks this session`); return; }
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
                    maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
                    directories: { runId: RUN_ID }
                });
                fs.appendFileSync(PROGRESS, JSON.stringify({ chunkKey: key, ranAt: new Date().toISOString(), outcomes: res.outcomes }) + '\n', 'utf8');
                ran++;
                console.log(`[chunk] ${key} -> ${res.outcomes.map(o => o.terminationReason).join(',')}`);
            }
        }
    }
    console.log(`[done] no remaining chunks (${ran} run this session)`);
}

const isMerge = process.argv.includes('--merge');
(isMerge ? Promise.resolve(merge()) : runChunks()).catch(e => { console.error('FATAL', e); process.exit(1); });