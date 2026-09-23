/**
 * V10-01 A/B resumable development-matrix driver.
 *
 * Implements T10-01:
 * - Frozen benchmark protocol (45 turns, 800 steps, 20 nodes / 200ms soft / 900ms hard, opponent: Heuristic)
 * - 6 arms (20 matches each, total 120 matches):
 *   1. HEURISTIC
 *   2. SPATIAL_V2_OLD (SHA: 1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92)
 *   3. SPATIAL_V2_BEST (SHA: f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153)
 *   4. SPATIAL_V2_LAST (SHA: cce536bd705871e0d5606725c9dc5950fadd2e937cee2545e4d72b4210f7e6f0)
 *   5. S00_SEARCH
 *   6. S10_SEARCH_BEST (guided by run03 best SHA: f4c8f14b...)
 * - Explicit checkpoint mapping per arm with strict SHA-256 verification and NOT_RUN on missing models
 * - Emits model_runtime_receipts.json and new_checkpoint_benchmark.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
    runFullV7BenchmarkSuite,
    BENCHMARK_MAPS,
    DEFAULT_BENCHMARK_PROTOCOL,
    computeWilsonScoreInterval,
    type PolicyType,
    type MatchOutcome
} from './v7_unified_evaluation';
import { isMain } from './v10_common';

export const RUN_ID = process.env.RUN_ID || 'agent_upgrade_20260923_v10_fix_01';
export const RUN_DIR = path.resolve(`training_runs/${RUN_ID}`);
export const REPORT_DIR = path.resolve(`docs/training/reports/${RUN_ID}`);
export const MAIN_DIR = path.join(RUN_DIR, 'main');
export const PROGRESS = path.join(MAIN_DIR, 'progress.jsonl');
export const MERGED = path.join(MAIN_DIR, 'new_checkpoint_benchmark.json');
export const RECEIPTS_PATH = path.join(MAIN_DIR, 'model_runtime_receipts.json');

export const V10_CHECKPOINT_MAP: Partial<Record<PolicyType, string>> = {
    SPATIAL_V2_OLD: 'src/game/ai/models/spatial_resnet_v2_checkpoint.json',
    SPATIAL_V2_BEST: 'training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json',
    SPATIAL_V2_LAST: 'training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_last.json',
    S10_SEARCH_BEST: 'training_runs/agent_upgrade_20260922_v9_identity_03/checkpoints/spatial_resnet/d10_best.json'
};

export const EXPECTED_SHAS: Partial<Record<PolicyType, string>> = {
    SPATIAL_V2_OLD: '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92',
    SPATIAL_V2_BEST: 'f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153',
    SPATIAL_V2_LAST: 'cce536bd705871e0d5606725c9dc5950fadd2e937cee2545e4d72b4210f7e6f0',
    S10_SEARCH_BEST: 'f4c8f14b5953cb6e26a32d3ec3ff4cf8f5294e62e0b35c7b3e39d918bd315153'
};

export const ALL_V10_POLICIES: PolicyType[] = [
    'HEURISTIC',
    'SPATIAL_V2_OLD',
    'SPATIAL_V2_BEST',
    'SPATIAL_V2_LAST',
    'S00_SEARCH',
    'S10_SEARCH_BEST'
];

const POLICY_FILTER = process.env.POLICY ? process.env.POLICY.split(',').map(s => s.trim()).filter(Boolean) as PolicyType[] : null;
export const POLICIES: PolicyType[] = POLICY_FILTER ? ALL_V10_POLICIES.filter(p => POLICY_FILTER.includes(p)) : ALL_V10_POLICIES;
export const SEEDS = [42, 1337];

function getSha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

export function generateModelRuntimeReceipts(): Record<string, any> {
    const receipts: Record<string, any> = {
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        reviewBenchmarkCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
        policies: {}
    };

    for (const policy of ALL_V10_POLICIES) {
        const ckptRel = V10_CHECKPOINT_MAP[policy];
        const expectedSha = EXPECTED_SHAS[policy];
        if (!ckptRel) {
            receipts.policies[policy] = {
                policy,
                type: 'non-neural',
                checkpointPath: null,
                verifiedSha256: null,
                expectedSha256: null,
                shaMatch: true,
                status: 'AVAILABLE'
            };
            continue;
        }

        const absPath = path.resolve(ckptRel);
        if (!fs.existsSync(absPath)) {
            receipts.policies[policy] = {
                policy,
                type: 'neural',
                checkpointPath: ckptRel,
                verifiedSha256: null,
                expectedSha256: expectedSha,
                shaMatch: false,
                status: 'MISSING_NOT_RUN',
                error: `File does not exist: ${absPath}`
            };
            continue;
        }

        try {
            const content = fs.readFileSync(absPath, 'utf8');
            const sha256 = getSha256(content);
            const parsed = JSON.parse(content);
            const shaMatch = expectedSha ? sha256 === expectedSha : true;

            let paramCount = 0;
            for (const k of Object.keys(parsed)) {
                if (parsed[k] && parsed[k].weights && Array.isArray(parsed[k].weights)) {
                    paramCount += parsed[k].weights.length + (parsed[k].biases ? parsed[k].biases.length : 0);
                }
            }
            receipts.policies[policy] = {
                policy,
                type: 'neural',
                checkpointPath: ckptRel,
                verifiedSha256: sha256,
                expectedSha256: expectedSha ?? null,
                shaMatch,
                status: shaMatch ? 'AVAILABLE' : 'SHA_MISMATCH_ERROR',
                architecture: parsed.architecture || (parsed.numBlocks ? `spatial-resnet-v2 (${parsed.numBlocks} blocks, 32ch)` : 'spatial-resnet-v2 (2 blocks, 32ch)'),
                encoderVersion: parsed.version?.includes('v2') ? 'v2' : 'v1',
                parametersCount: paramCount
            };
        } catch (e: any) {
            receipts.policies[policy] = {
                policy,
                type: 'neural',
                checkpointPath: ckptRel,
                verifiedSha256: null,
                expectedSha256: expectedSha,
                shaMatch: false,
                status: 'LOAD_ERROR',
                error: String(e?.message ?? e)
            };
        }
    }

    fs.mkdirSync(MAIN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(RECEIPTS_PATH, JSON.stringify(receipts, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'model_runtime_receipts.json'), JSON.stringify(receipts, null, 2), 'utf8');
    fs.writeFileSync(path.resolve('v10/model_runtime_receipts.json'), JSON.stringify(receipts, null, 2), 'utf8');

    return receipts;
}

function loadOutcomes(): MatchOutcome[] {
    const files = fs.existsSync(MAIN_DIR) ? fs.readdirSync(MAIN_DIR).filter(f => /^progress.*\.jsonl$/.test(f)) : [];
    if (files.length === 0) return [];
    const seen = new Set<string>();
    const out: MatchOutcome[] = [];
    for (const file of files) {
        for (const line of fs.readFileSync(path.join(MAIN_DIR, file), 'utf8').split('\n')) {
            if (!line.trim()) continue;
            try {
                const rec = JSON.parse(line);
                for (const o of rec.outcomes ?? []) {
                    if (!seen.has(o.matchId)) {
                        seen.add(o.matchId);
                        out.push(o);
                    }
                }
            } catch {}
        }
    }
    return out;
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Number(sorted[idx].toFixed(1));
}

export function merge(): void {
    const outcomes = loadOutcomes();
    const aggregates: Record<string, any> = {};
    const byMap: Record<string, Record<string, any>> = {};

    for (const policy of ALL_V10_POLICIES) {
        const os = outcomes.filter(o => o.candidatePolicy === policy);
        if (os.length === 0) continue;
        const lats = os.flatMap(o => o.decisionLatencies ?? []).sort((a, b) => a - b);
        const wins = os.filter(o => o.terminationReason === 'NATURAL_WIN').length;
        const losses = os.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
        const draws = os.filter(o => o.terminationReason === 'NATURAL_DRAW').length;
        const trunc = os.length - wins - losses - draws;
        const wilsonNatural = computeWilsonScoreInterval(wins, wins + losses);
        const wilsonAll = computeWilsonScoreInterval(wins, os.length);

        aggregates[policy] = {
            policy,
            matchesPlayed: os.length,
            checkpointSha256: os[0]?.checkpointSha256 ?? null,
            naturalWins: wins,
            naturalLosses: losses,
            naturalDraws: draws,
            truncations: trunc,
            truncationRate: Number(((trunc / os.length) * 100).toFixed(1)),
            engineErrors: os.filter(o => o.terminationReason === 'ENGINE_ERROR').length,
            modelLoadErrors: os.filter(o => o.terminationReason === 'MODEL_LOAD_ERROR').length,
            notRuns: os.filter(o => (o as any).actualPolicy === 'NOT_RUN').length,
            winRateAllMatches: Number(((wins / os.length) * 100).toFixed(1)),
            confidenceInterval95All: wilsonAll,
            winRateNaturalOnly: (wins + losses) > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : null,
            confidenceInterval95Natural: wilsonNatural,
            avgDecisionMs: lats.length ? Number((lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1)) : null,
            latencyP50: percentile(lats, 50),
            latencyP95: percentile(lats, 95),
            latencyP99: percentile(lats, 99),
            latencyMax: lats.length ? Number(lats[lats.length - 1].toFixed(1)) : null,
            latenciesOver1000ms: lats.filter(v => v > 1000).length,
            wallClockExceededMatches: os.filter(o => (o.wallClockExceededCount ?? 0) > 0).length,
            avgCandidatesEvaluated: os.some(o => (o.searchCandidatesEvaluated ?? 0) > 0)
                ? Number((os.reduce((a, o) => a + (o.searchCandidatesEvaluated ?? 0), 0) / os.length).toFixed(1))
                : null
        };

        // By map breakdown
        byMap[policy] = {};
        for (const m of BENCHMARK_MAPS) {
            const mos = os.filter(o => o.mapName === m.name);
            const mwins = mos.filter(o => o.terminationReason === 'NATURAL_WIN').length;
            const mlosses = mos.filter(o => o.terminationReason === 'NATURAL_LOSS').length;
            const mtrunc = mos.length - mwins - mlosses;
            byMap[policy][m.label] = {
                wins: mwins,
                losses: mlosses,
                truncations: mtrunc,
                record: `${mwins}W/${mlosses}L/${mtrunc}T`,
                winRate: mos.length > 0 ? Number(((mwins / mos.length) * 100).toFixed(1)) : 0
            };
        }
    }

    const merged = {
        benchmarkName: 'V10 T10-01 New Checkpoint Comparative Benchmark',
        runId: RUN_ID,
        mergedAt: new Date().toISOString(),
        dataSource: 'tools/v10_run_matrix_resumable.ts',
        reviewCommit: '88a1ccc8f3e158fedd8ddc5b2f00e41c8ebfb037',
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
        checkpointMap: V10_CHECKPOINT_MAP,
        expectedShas: EXPECTED_SHAS,
        aggregates,
        byMap,
        outcomes
    };

    fs.mkdirSync(MAIN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(MERGED, JSON.stringify(merged, null, 2), 'utf8');
    fs.writeFileSync(path.join(REPORT_DIR, 'new_checkpoint_benchmark.json'), JSON.stringify(merged, null, 2), 'utf8');
    fs.writeFileSync(path.resolve('v10/new_checkpoint_benchmark.json'), JSON.stringify(merged, null, 2), 'utf8');

    console.log(`\n=======================================================`);
    console.log(`[V10 T10-01 Merge] ${outcomes.length} matches -> ${MERGED}`);
    console.log(`=======================================================`);
    for (const p of ALL_V10_POLICIES) {
        const a = aggregates[p];
        if (a) {
            console.log(`  ${p.padEnd(20)}: ${a.naturalWins}W/${a.naturalLosses}L/${a.naturalDraws}D/${a.truncations}T | W/N=${a.winRateAllMatches}% [${a.confidenceInterval95All?.[0]}-${a.confidenceInterval95All?.[1]}%] | W/(W+L)=${a.winRateNaturalOnly ?? 'N/A'}% | p99=${a.latencyP99}ms | SHA: ${a.checkpointSha256?.slice(0, 8) ?? 'none'}`);
        } else {
            console.log(`  ${p.padEnd(20)}: NO MATCHES YET`);
        }
    }
}

export async function runChunks(): Promise<void> {
    fs.mkdirSync(MAIN_DIR, { recursive: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    // 1. Generate model runtime receipts first
    console.log('[V10 T10-01] Validating model checkpoints...');
    const receipts = generateModelRuntimeReceipts();
    for (const [pol, rec] of Object.entries(receipts.policies as Record<string, any>)) {
        if (rec.type === 'neural') {
            console.log(`  [${pol}] Status: ${rec.status} | SHA: ${rec.verifiedSha256?.slice(0, 16)}... | Expected: ${rec.expectedSha256?.slice(0, 16)}... | Match: ${rec.shaMatch}`);
            if (rec.status !== 'AVAILABLE') {
                console.warn(`  WARNING: Checkpoint for ${pol} is not available (${rec.status}): ${rec.error}`);
            }
        }
    }

    const budgetMs = Number(process.env.MAX_MS ?? 1200000); // 20 min default budget
    const t0 = Date.now();
    const done = new Set(loadOutcomes().map(o => `${o.candidatePolicy}|${o.mapName}|${o.seed}`));
    let ran = 0;

    for (const policy of POLICIES) {
        for (const map of BENCHMARK_MAPS) {
            for (const seed of SEEDS) {
                const key = `${policy}|${map.name}|${seed}`;
                if (done.has(key)) continue;

                if (Date.now() - t0 > budgetMs) {
                    console.log(`[budget] stop after ${ran} chunks this session`);
                    merge();
                    return;
                }

                console.log(`[chunk start] ${key}...`);
                const res = await runFullV7BenchmarkSuite({
                    policiesToEvaluate: [policy],
                    maps: [map],
                    seeds: [seed],
                    maxTurns: DEFAULT_BENCHMARK_PROTOCOL.maxTurns,
                    maxAtomicSteps: DEFAULT_BENCHMARK_PROTOCOL.maxAtomicSteps,
                    directories: { runId: RUN_ID },
                    checkpointMap: V10_CHECKPOINT_MAP
                });

                fs.appendFileSync(PROGRESS, JSON.stringify({ chunkKey: key, ranAt: new Date().toISOString(), outcomes: res.outcomes }) + '\n', 'utf8');
                ran++;
                console.log(`[chunk done]  ${key} -> ${res.outcomes.map(o => `${o.terminationReason}(turns:${o.turns},steps:${o.steps})`).join(', ')}`);
            }
        }
    }

    console.log(`\n[done] All requested chunks complete (${ran} run this session). Merging outcomes...`);
    merge();
}

const isMerge = process.argv.includes('--merge');
if (isMain('v10_run_matrix_resumable.ts')) {
    (isMerge ? Promise.resolve(merge()) : runChunks()).catch(e => {
        console.error('FATAL', e);
        process.exit(1);
    });
}
