import { GameEngine } from '../src/game/engine';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import { runCancellableAiAction, type DecisionTelemetryEntry } from '../src/game/ai/cancellable_ai_runner';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function runLatencyProbes() {
    const telemetries: DecisionTelemetryEntry[] = [];
    const policies = ['heuristic', 'random', 'net_b_1ply', 'net_b_s10'] as const;

    for (const pol of policies) {
        for (let i = 0; i < 5; i++) {
            const state = createDemoState(getApkSkirmishRuleConfig('SD'));
            const engine = new GameEngine(state);
            await runCancellableAiAction({
                policy: pol,
                engine,
                playerId: 0,
                deadlineMs: 1000,
                onTelemetry: (t) => telemetries.push(t)
            });
        }
    }

    const reportDir = path.resolve('docs/training/reports/agent_upgrade_20260920_v4_01');
    fs.mkdirSync(reportDir, { recursive: true });

    const lines = telemetries.map(t => JSON.stringify(t)).join('\n') + '\n';
    fs.writeFileSync(path.join(reportDir, 'decision-telemetry.jsonl'), lines, 'utf8');

    const latencies = telemetries.map(t => t.e2eMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
    const max = latencies[latencies.length - 1] ?? 0;
    const misses = telemetries.filter(t => t.deadlineMiss).length;

    const s10Entries = telemetries.filter(t => t.policy === 'net_b_s10');
    const s10Latencies = s10Entries.map(t => t.e2eMs).sort((a, b) => a - b);

    const report = {
        schemaVersion: 1,
        runId: 'agent_upgrade_20260920_v4_01',
        generatedAt: new Date().toISOString(),
        totalProbes: telemetries.length,
        overallLatency: {
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            maxMs: max,
            deadlineMissCount: misses,
            complianceRate: (telemetries.length - misses) / telemetries.length
        },
        policyBreakdown: {
            heuristic: {
                meanE2eMs: telemetries.filter(t => t.policy === 'heuristic').reduce((a, b) => a + b.e2eMs, 0) / 5
            },
            random: {
                meanE2eMs: telemetries.filter(t => t.policy === 'random').reduce((a, b) => a + b.e2eMs, 0) / 5
            },
            net_b_1ply: {
                meanE2eMs: telemetries.filter(t => t.policy === 'net_b_1ply').reduce((a, b) => a + b.e2eMs, 0) / 5
            },
            net_b_s10: {
                count: s10Entries.length,
                p50Ms: s10Latencies[Math.floor(s10Latencies.length * 0.5)] ?? 0,
                maxMs: s10Latencies[s10Latencies.length - 1] ?? 0,
                allWithin1000Ms: s10Latencies.every(l => l <= 1000)
            }
        },
        notes: "真实端到端测量，严禁裁剪；冷热缓存与不同策略分别报告。"
    };

    fs.writeFileSync(path.join(reportDir, 'online-latency-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(`Latency probe complete: total ${telemetries.length}, P50=${p50}ms, P95=${p95}ms, Max=${max}ms, Misses=${misses}`);
    return report;
}

if (process.argv[1] && process.argv[1].endsWith('skirmish_r04_latency_probe.ts')) {
    runLatencyProbes().catch(err => {
        console.error('Latency probe failed:', err);
        process.exit(1);
    });
}
