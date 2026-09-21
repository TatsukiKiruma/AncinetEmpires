import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export interface VerificationResult {
    success: boolean;
    errors: string[];
    warnings: string[];
    metrics: Record<string, any>;
}

export function verifyReportConsistency(runId: string = 'agent_upgrade_20260921_v8_closure_01'): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics: Record<string, any> = {};

    const runDir = path.resolve(`training_runs/${runId}`);
    const reportDir = path.resolve(`docs/training/reports/${runId}`);
    const checkpointDir = path.join(runDir, 'checkpoints');

    // Expected SHAs for clean v8 models
    const EXPECTED_SHAS = {
        SPATIAL_V2: '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92',
        SPATIAL_DAGGER: 'efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b',
        NET_A: 'ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf'
    };

    // 1. Verify Checkpoint Hashes
    const spatialV2Path = path.join(checkpointDir, 'spatial_resnet/spatial_resnet_v2_best.json');
    const daggerPath = path.join(checkpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json');
    const netAPath = path.join(checkpointDir, 'net_a/net_a_checkpoint.json');

    if (!fs.existsSync(spatialV2Path)) {
        errors.push(`Missing SPATIAL_V2 checkpoint at: ${spatialV2Path}`);
    } else {
        const hash = sha256(fs.readFileSync(spatialV2Path));
        metrics.spatialV2Sha = hash;
        if (hash !== EXPECTED_SHAS.SPATIAL_V2) {
            errors.push(`SPATIAL_V2 SHA mismatch: expected ${EXPECTED_SHAS.SPATIAL_V2}, got ${hash}`);
        }
    }

    if (!fs.existsSync(daggerPath)) {
        errors.push(`Missing SPATIAL_DAGGER checkpoint at: ${daggerPath}`);
    } else {
        const hash = sha256(fs.readFileSync(daggerPath));
        metrics.spatialDaggerSha = hash;
        if (hash !== EXPECTED_SHAS.SPATIAL_DAGGER) {
            errors.push(`SPATIAL_DAGGER SHA mismatch: expected ${EXPECTED_SHAS.SPATIAL_DAGGER}, got ${hash}`);
        }
    }

    if (!fs.existsSync(netAPath)) {
        errors.push(`Missing NET_A checkpoint at: ${netAPath}`);
    } else {
        const hash = sha256(fs.readFileSync(netAPath));
        metrics.netASha = hash;
        if (hash !== EXPECTED_SHAS.NET_A) {
            errors.push(`NET_A SHA mismatch: expected ${EXPECTED_SHAS.NET_A}, got ${hash}`);
        }
    }

    // 2. Verify failure_windows.json
    const failureWindowsPath = path.join(runDir, 'failures/failure_windows.json');
    if (!fs.existsSync(failureWindowsPath)) {
        errors.push(`Missing failure_windows.json at: ${failureWindowsPath}`);
    } else {
        const failures = JSON.parse(fs.readFileSync(failureWindowsPath, 'utf8'));
        metrics.failureCount = failures.length;
        if (failures.length !== 61) {
            errors.push(`Failure windows count mismatch: expected 61, got ${failures.length}`);
        }
        const nonDivergence = failures.filter((f: any) => f.failureType !== 'POLICY_DIVERGENCE');
        if (nonDivergence.length > 0) {
            errors.push(`Expected all failures to be POLICY_DIVERGENCE, but found ${nonDivergence.length} other types`);
        }
    }

    // 3. Verify dagger_paired_evaluation.json
    const daggerEvalPath = path.join(reportDir, 'dagger_paired_evaluation.json');
    if (!fs.existsSync(daggerEvalPath)) {
        errors.push(`Missing dagger_paired_evaluation.json at: ${daggerEvalPath}`);
    } else {
        const daggerEval = JSON.parse(fs.readFileSync(daggerEvalPath, 'utf8'));
        metrics.pairedMatches = daggerEval.outcomes?.length ?? 0;
        metrics.baseRehireAttempts = daggerEval.aggregates?.SPATIAL_V2?.totalRehireOpportunities;
        metrics.baseRehireSuccesses = daggerEval.aggregates?.SPATIAL_V2?.totalRehireSuccesses;
        metrics.daggerRehireAttempts = daggerEval.aggregates?.SPATIAL_DAGGER?.totalRehireOpportunities;
        metrics.daggerRehireSuccesses = daggerEval.aggregates?.SPATIAL_DAGGER?.totalRehireSuccesses;

        // Base: 6/6 = 100%, DAgger: 14/15 = 93.3%
        if (metrics.baseRehireSuccesses !== 6 || metrics.baseRehireAttempts !== 6) {
            errors.push(`Base rehire mismatch: expected 6/6, got ${metrics.baseRehireSuccesses}/${metrics.baseRehireAttempts}`);
        }
        if (metrics.daggerRehireSuccesses !== 14 || metrics.daggerRehireAttempts !== 15) {
            errors.push(`DAgger rehire mismatch: expected 14/15, got ${metrics.daggerRehireSuccesses}/${metrics.daggerRehireAttempts}`);
        }
    }

    // 4. Verify v8_clean_benchmark.json if present
    const benchmarkPath = path.join(reportDir, 'v8_clean_benchmark.json');
    if (fs.existsSync(benchmarkPath)) {
        const bench = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
        const outcomes: any[] = bench.outcomes ?? [];
        metrics.benchmarkMatches = outcomes.length;

        if (outcomes.length !== 120) {
            warnings.push(`Benchmark matches count is ${outcomes.length} (expected 120 when fully finished)`);
        }

        const requiredFields = ['fallbackCount', 'encoderVersion', 'rulesHash', 'initialStateHash', 'decisionLatencies'];
        for (let i = 0; i < outcomes.length; i++) {
            const m = outcomes[i];
            for (const field of requiredFields) {
                if (m[field] === undefined) {
                    errors.push(`Match ${i} (${m.policyType} on ${m.mapName}) missing required field: ${field}`);
                }
            }
        }

        // Check latency per policy
        const policyLatencies: Record<string, number[]> = {};
        for (const m of outcomes) {
            const p = m.candidatePolicy || m.policyType || m.policy || 'UNKNOWN';
            if (!policyLatencies[p]) policyLatencies[p] = [];
            if (Array.isArray(m.decisionLatencies)) {
                policyLatencies[p].push(...m.decisionLatencies);
            }
        }

        metrics.policyLatencyStats = {};
        for (const [p, lats] of Object.entries(policyLatencies)) {
            if (lats.length === 0) continue;
            const sorted = [...lats].sort((a, b) => a - b);
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            const max = sorted[sorted.length - 1];
            const over1000 = sorted.filter(v => v > 1000).length;

            metrics.policyLatencyStats[p] = { p50, p95, p99, max, count: lats.length, over1000 };

            if (over1000 > 0) {
                errors.push(`Policy ${p} has ${over1000} decisions exceeding 1000ms deadline! Max was ${max}ms`);
            }
            if (p99 >= 1000) {
                errors.push(`Policy ${p} p99 latency (${p99}ms) is >= 1000ms deadline!`);
            }
        }
    } else {
        warnings.push(`Benchmark report not found yet at: ${benchmarkPath}`);
    }

    // 5. Verify task-status.json if present
    const taskStatusPath = path.join(reportDir, 'task-status.json');
    if (fs.existsSync(taskStatusPath)) {
        const taskStatus = JSON.parse(fs.readFileSync(taskStatusPath, 'utf8'));
        const tasks = taskStatus.tasks ?? {};
        const validStatuses = new Set(['IMPLEMENTED', 'TESTED', 'MEASURED', 'QUALIFIED', 'BLOCKED/NOT_RUN']);

        for (const [taskId, taskInfo] of Object.entries<any>(tasks)) {
            if (!validStatuses.has(taskInfo.status)) {
                errors.push(`Task ${taskId} has invalid status '${taskInfo.status}'. Must be one of: ${[...validStatuses].join(', ')}`);
            }
        }

        // Check NET_A SHA in metadata / audit
        const str = JSON.stringify(taskStatus);
        if (str.includes('4f3e69cf')) {
            errors.push('task-status.json contains corrupted/transcribed NET_A SHA (4f3e69cf). Must be ededeb34...');
        }
        if (str.includes('rehire rate improved') || str.includes('rehire improved')) {
            errors.push('task-status.json claims rehire rate improved, which is statistically false (100% -> 93.3%). Must state directional change with deeper survival.');
        }
        if (str.includes('S00 superior') || str.includes('S00 superiority')) {
            errors.push('task-status.json claims S00 superiority, but 55.6% win rate on 20 matches has 95% Wilson CI [33.7%, 75.4%] including 50%.');
        }
    }

    return {
        success: errors.length === 0,
        errors,
        warnings,
        metrics
    };
}

if (process.argv[1] && process.argv[1].endsWith('v8_verify_report_consistency.ts')) {
    const runId = process.argv[2] || 'agent_upgrade_20260921_v8_closure_01';
    console.log(`Verifying report consistency for run: ${runId}...`);
    const res = verifyReportConsistency(runId);
    console.log('Metrics:', JSON.stringify(res.metrics, null, 2));
    if (res.warnings.length > 0) {
        console.warn('Warnings:');
        res.warnings.forEach(w => console.warn(`  [WARN] ${w}`));
    }
    if (!res.success) {
        console.error('Errors:');
        res.errors.forEach(e => console.error(`  [ERROR] ${e}`));
        process.exit(1);
    } else {
        console.log('✅ Verification passed with 0 errors.');
    }
}
