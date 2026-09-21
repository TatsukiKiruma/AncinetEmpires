import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyReportConsistency } from './v8_verify_report_consistency';
import { computePercentile, computeWilsonScoreInterval } from './v7_unified_evaluation';
import { recomputeBenchmarkFacts } from './v8_closure_facts';

const REPO_ROOT = path.resolve(process.cwd());
const SOURCE_RUN_ID = 'agent_upgrade_20260921_v8_closure_01';
const REPORT_RUN_ID = 'agent_upgrade_20260921_v8_closure_02';

const sourceBenchmarkPath = path.join(
    REPO_ROOT,
    'docs/training/reports',
    SOURCE_RUN_ID,
    'v8_clean_benchmark.json'
);

const EXPECTED_CHECKPOINT_SHAS: Record<string, string> = {
    SPATIAL_V2: '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92',
    SPATIAL_DAGGER: 'efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b',
    NET_A: 'ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf'
};

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('V8 report consistency: machine-verified closure_02 report', () => {
    it('R8-Consistency-A: checkpoint SHA-256 values match the clean closure set exactly', () => {
        const checkpointDir = path.join(
            REPO_ROOT,
            'training_runs/agent_upgrade_20260921_v8_closure_02/checkpoints'
        );
        expect(existsSync(checkpointDir)).toBe(true);

        expect(sha256File(path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'))).toBe(
            EXPECTED_CHECKPOINT_SHAS.SPATIAL_V2
        );
        expect(sha256File(path.join(checkpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json'))).toBe(
            EXPECTED_CHECKPOINT_SHAS.SPATIAL_DAGGER
        );
        expect(sha256File(path.join(checkpointDir, 'net_a/net_a_checkpoint.json'))).toBe(
            EXPECTED_CHECKPOINT_SHAS.NET_A
        );
    });

    it('R8-Consistency-B: closure_01 failure windows are 61 POLICY_DIVERGENCE samples and nothing else', () => {
        const failPath = path.join(
            REPO_ROOT,
            'training_runs',
            SOURCE_RUN_ID,
            'failures/failure_windows.json'
        );
        expect(existsSync(failPath)).toBe(true);

        const failures = JSON.parse(readFileSync(failPath, 'utf8'));
        expect(failures.length).toBe(61);
        expect(failures.filter((f: any) => f.failureType !== 'POLICY_DIVERGENCE').length).toBe(0);
    });

    it('R8-Consistency-C: benchmark latency percentiles are recomputed, never >1000ms, and match the aggregates', () => {
        const bench = JSON.parse(readFileSync(sourceBenchmarkPath, 'utf8'));
        expect(bench.outcomes.length).toBe(120);

        for (const policy of Object.keys(bench.aggregates)) {
            const latencies: number[] = bench.outcomes
                .filter((o: any) => o.candidatePolicy === policy)
                .flatMap((o: any) => o.decisionLatencies ?? [])
                .sort((a: number, b: number) => a - b);

            expect(latencies.length).toBeGreaterThan(0);

            // Interpolating percentile (canonical helper), not a floor index.
            expect(Number(computePercentile(latencies, 50).toFixed(1))).toBe(bench.aggregates[policy].latencyP50);
            expect(Number(computePercentile(latencies, 95).toFixed(1))).toBe(bench.aggregates[policy].latencyP95);
            expect(Number(computePercentile(latencies, 99).toFixed(1))).toBe(bench.aggregates[policy].latencyP99);
            expect(Number(latencies[latencies.length - 1].toFixed(1))).toBe(bench.aggregates[policy].latencyMax);

            expect(latencies.filter(v => v > 1000).length).toBe(0);
            expect(bench.aggregates[policy].latencyP99).toBeLessThan(1000);
            expect(bench.aggregates[policy].latencyMax).toBeLessThan(1000);
        }
    });

    it('R8-Consistency-D: benchmark W/L/T, rates and Wilson intervals reproduce exactly from the raw outcomes', () => {
        const bench = JSON.parse(readFileSync(sourceBenchmarkPath, 'utf8'));
        const { policies } = recomputeBenchmarkFacts(bench);

        expect(policies.map(p => p.policy).sort()).toEqual(Object.keys(bench.aggregates).sort());

        for (const p of policies) {
            const agg = bench.aggregates[p.policy];
            expect(p.naturalWins).toBe(agg.naturalWins);
            expect(p.naturalLosses).toBe(agg.naturalLosses);
            expect(p.truncations).toBe(agg.truncations);
            expect(p.winLossTruncation).toBe(`${agg.naturalWins}-${agg.naturalLosses}-${agg.truncations}`);
            expect(p.truncationRatePct).toBe(agg.truncationRate);
            expect(p.winRateNaturalOnlyPct).toBe(agg.winRateNaturalOnly);
            expect(p.effectiveWinRatePct).toBe(agg.effectiveWinRate);
            expect(p.confidenceInterval95Natural).toEqual(
                computeWilsonScoreInterval(agg.naturalWins, agg.naturalWins + agg.naturalLosses)
            );
            expect(p.confidenceInterval95Effective).toEqual(
                computeWilsonScoreInterval(agg.naturalWins, agg.matchesPlayed)
            );
        }
    });

    it('R8-Consistency-E: the closure_02 report set passes verification with zero errors', () => {
        const res = verifyReportConsistency({
            repoRoot: REPO_ROOT,
            reportRunId: REPORT_RUN_ID,
            sourceRunId: SOURCE_RUN_ID
        });
        expect(res.errors).toEqual([]);
        expect(res.success).toBe(true);
        expect(res.facts).not.toBeNull();
    });

    it('R8-Consistency-F: negative sensitivity - the verifier catches the legacy closure_01 S00/S10 contradictions', () => {
        const res = verifyReportConsistency({
            repoRoot: REPO_ROOT,
            reportRunId: SOURCE_RUN_ID,
            sourceRunId: SOURCE_RUN_ID
        });

        expect(res.success).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
        const joined = res.errors.join('\n');

        // The regenerated closure_01 report contradicts its own benchmark JSON.
        expect(joined).toMatch(/S00_SEARCH/);
        expect(joined).toMatch(/10W-8L-2T|10 wins \/ 8 losses \/ 2 draws/);
        expect(joined).toMatch(/55\.6/);
        expect(joined).toMatch(/33\.7/);
        expect(joined).toMatch(/75\.4/);
        expect(joined).toMatch(/S10_SPATIAL_SEARCH/);
        expect(joined).toMatch(/1W-11L-8T/);
        expect(joined).toMatch(/effective win rate claim 5%|effective win rate 5\.0%/);
        // S00 must not be presented as a Hard Bot.
        expect(joined).toMatch(/Hard Bot labelling violation/);
        // The legacy artifact set is missing the machine verifiable scaffolding.
        expect(joined).toMatch(/policyClaims/);
        expect(joined).toMatch(/v8_closure_facts\.json|MACHINE_FACTS/);
    });

    it('R8-Consistency-G: closure_02 contains no final_01-era S00/S10 numbers as current conclusions', () => {
        const reportDir = path.join(REPO_ROOT, 'docs/training/reports', REPORT_RUN_ID);
        const taskStatus = readFileSync(path.join(reportDir, 'task-status.json'), 'utf8');
        const audit = readFileSync(path.join(reportDir, 'v8_closure_audit_report.md'), 'utf8');

        for (const forbidden of ['10W-8L-2T', '1W-11L-8T', '55.6', '33.7', '75.4']) {
            expect(taskStatus.includes(forbidden)).toBe(false);
        }

        // In the audit report the legacy numbers may only appear inside the marked legacy region.
        const scannable = audit
            .split('<!-- legacy-claims-allowed:start -->')
            .map(part => part.split('<!-- legacy-claims-allowed:end -->').slice(1).join(''))
            .join('\n');
        for (const forbidden of ['10W-8L-2T', '1W-11L-8T', '55.6', '33.7', '75.4']) {
            expect(scannable.includes(forbidden)).toBe(false);
        }
        expect(audit).toMatch(/legacy-claims-allowed:start/);
    });

    it('R8-Consistency-H: S00_SEARCH current conclusions state 4-7-9 / 36.4% / [15.2%, 64.6%] and are NOT QUALIFIED', () => {
        const reportDir = path.join(REPO_ROOT, 'docs/training/reports', REPORT_RUN_ID);
        const facts = JSON.parse(readFileSync(path.join(reportDir, 'v8_closure_facts.json'), 'utf8'));
        const s00 = facts.policies.find((p: any) => p.policy === 'S00_SEARCH');
        const s10 = facts.policies.find((p: any) => p.policy === 'S10_SPATIAL_SEARCH');

        expect(s00.winLossTruncation).toBe('4-7-9');
        expect(s00.winRateNaturalOnlyPct).toBe(36.4);
        expect(s00.confidenceInterval95Natural).toEqual([15.2, 64.6]);
        expect(s00.qualification.promotionQualified).toBe(false);

        expect(s10.winLossTruncation).toBe('6-5-9');
        expect(s10.winRateNaturalOnlyPct).toBe(54.5);
        expect(s10.confidenceInterval95Natural).toEqual([28, 78.7]);
        expect(s10.qualification.promotionQualified).toBe(false);

        const audit = readFileSync(path.join(reportDir, 'v8_closure_audit_report.md'), 'utf8');
        expect(audit).toContain('S00_SEARCH is a bounded adversarial search policy');
        expect(audit).toContain('not** a Hard Bot');
    });

    it('R8-Consistency-I: task-status.json honours the status taxonomy and keeps 30k BLOCKED/NOT_RUN', () => {        const reportDir = path.join(REPO_ROOT, 'docs/training/reports', REPORT_RUN_ID);
        const taskStatus = JSON.parse(readFileSync(path.join(reportDir, 'task-status.json'), 'utf8'));
        const valid = new Set(['IMPLEMENTED', 'TESTED', 'MEASURED', 'QUALIFIED', 'BLOCKED/NOT_RUN']);

        const seen: string[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            for (const value of Object.values<any>(node)) {
                if (value && typeof value === 'object' && typeof value.status === 'string') {
                    seen.push(value.status);
                }
                if (value && typeof value === 'object') walk(value);
            }
        };
        walk(taskStatus.tasks ?? {});
        expect(seen.length).toBeGreaterThan(5);
        for (const status of seen) expect(valid.has(status)).toBe(true);

        expect(taskStatus.tasks['R8-06'].subTasks.thirtyKScale.status).toBe('BLOCKED/NOT_RUN');
        expect(taskStatus.overallVerdict.defaultProductionPolicy).toBe('HeuristicAI');
        expect(taskStatus.overallVerdict.thirtyKStatus.status).toBe('BLOCKED/NOT_RUN');
    });

    it('R8-Consistency-J: the report carries the machine-generated R8-07 round 2 DAgger evidence', () => {
        const reportDir = path.join(REPO_ROOT, 'docs/training/reports', REPORT_RUN_ID);
        const facts = JSON.parse(readFileSync(path.join(reportDir, 'v8_closure_facts.json'), 'utf8'));
        const audit = readFileSync(path.join(reportDir, 'v8_closure_audit_report.md'), 'utf8');

        expect(facts.daggerRound2).not.toBeNull();
        const d = facts.daggerRound2;

        expect(d.failuresCount).toBeGreaterThan(0);
        expect(d.distinctCheckpointShas).toBe(true);
        expect(d.baseModelSha256).toBe(EXPECTED_CHECKPOINT_SHAS.SPATIAL_V2);
        expect(d.daggerSha256).not.toBe(d.baseModelSha256);
        expect(d.daggerDatasetRows).toBeGreaterThan(d.baseDatasetRowsRead);
        expect(d.daggerAddedRootCount).toBeGreaterThan(0);
        expect(d.pairedMatches).toBeGreaterThan(0);
        expect(existsSync(path.resolve(REPO_ROOT, d.pairedReportPath))).toBe(true);
        expect(d.pairedAggregates.map((a: any) => a.policy).sort()).toEqual(['SPATIAL_DAGGER', 'SPATIAL_V2']);

        // The paired report must be complete for every match and both aggregate arms.
        const paired = JSON.parse(readFileSync(path.resolve(REPO_ROOT, d.pairedReportPath), 'utf8'));
        expect(paired.outcomes.length).toBe(d.pairedMatches);
        for (const outcome of paired.outcomes) {
            expect(outcome.terminationReason).toBeDefined();
            expect(outcome.decisionLatencies).toBeDefined();
            expect(outcome.actualPolicy).not.toBe('NOT_RUN');
        }

        expect(audit).toMatch(/## 4\. R8-07 round 2 DAgger evidence/);
        expect(audit).toContain(d.daggerSha256);
        expect(audit).toMatch(/does \*\*not\*\* demonstrate improved playing/);
    });
});
