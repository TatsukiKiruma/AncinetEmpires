import { describe, it, expect } from 'vitest';
import { verifyReportConsistency } from './v8_verify_report_consistency';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('V8 Report Consistency & Machine Verifiable Assertions', () => {
    it('R8-Consistency-A: Real SHA-256 of all 3 clean checkpoints match expected hashes exactly', () => {
        const runId = 'agent_upgrade_20260921_v8_closure_01';
        const checkpointDir = path.resolve(`training_runs/${runId}/checkpoints`);

        const expected = {
            SPATIAL_V2: '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92',
            SPATIAL_DAGGER: 'efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b',
            NET_A: 'ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf'
        };

        const sha = (file: string) => crypto.createHash('sha256').update(readFileSync(file)).digest('hex');

        expect(sha(path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'))).toBe(expected.SPATIAL_V2);
        expect(sha(path.join(checkpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json'))).toBe(expected.SPATIAL_DAGGER);
        expect(sha(path.join(checkpointDir, 'net_a/net_a_checkpoint.json'))).toBe(expected.NET_A);
    });

    it('R8-Consistency-B: Failure windows contains exactly 61 POLICY_DIVERGENCE samples and zero regressions', () => {
        const failPath = path.resolve('training_runs/agent_upgrade_20260921_v8_closure_01/failures/failure_windows.json');
        expect(existsSync(failPath)).toBe(true);

        const failures = JSON.parse(readFileSync(failPath, 'utf8'));
        expect(failures.length).toBe(61);

        const nonDivergence = failures.filter((f: any) => f.failureType !== 'POLICY_DIVERGENCE');
        expect(nonDivergence.length).toBe(0);
    });

    it('R8-Consistency-D: Full 120-match clean benchmark has exactly 0 decisions exceeding 1000ms and p99 < 1000ms across all policies', () => {
        const benchmarkPath = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_closure_01/v8_clean_benchmark.json');
        expect(existsSync(benchmarkPath)).toBe(true);

        const bench = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
        expect(bench.outcomes.length).toBe(120);

        const policyLatencies: Record<string, number[]> = {};
        for (const m of bench.outcomes) {
            const p = m.candidatePolicy || m.policyType;
            if (!policyLatencies[p]) policyLatencies[p] = [];
            if (Array.isArray(m.decisionLatencies)) {
                policyLatencies[p].push(...m.decisionLatencies);
            }
        }

        expect(Object.keys(policyLatencies).length).toBe(6);

        for (const [policy, latencies] of Object.entries(policyLatencies)) {
            expect(latencies.length).toBeGreaterThan(0);
            const over1000 = latencies.filter(l => l > 1000).length;
            expect(over1000).toBe(0); // Zero decisions over 1000ms!

            const sorted = [...latencies].sort((a, b) => a - b);
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            const max = sorted[sorted.length - 1];
            expect(p99).toBeLessThan(1000);
            expect(max).toBeLessThan(1000);
        }
    });

    it('R8-Consistency-E: task-status.json enforces strict taxonomy without corrupted SHAs or unverified superiority claims', () => {
        const res = verifyReportConsistency('agent_upgrade_20260921_v8_closure_01');
        expect(res.success).toBe(true);
        expect(res.errors.length).toBe(0);
    });
});

