import path from 'node:path';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS, PolicyType } from './v7_unified_evaluation';

async function main() {
    const runId = 'agent_upgrade_20260922_v8_reeval_01';
    const reportDir = path.resolve(`docs/training/reports/${runId}`);
    const reportTrajDir = path.join(reportDir, 'trajectories');
    const runDir = path.resolve(`training_runs/${runId}`);
    const runTrajDir = path.join(runDir, 'trajectories');
    const checkpointDir = path.resolve('training_runs/agent_upgrade_20260921_v7_01/checkpoints');
    const reportPath = path.join(reportDir, 'comparison.json');

    mkdirSync(reportDir, { recursive: true });
    mkdirSync(reportTrajDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });
    mkdirSync(runTrajDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[V8 Frozen-Weights Re-Evaluation Benchmark]`);
    console.log(`Run ID: ${runId}`);
    console.log(`Frozen Checkpoints from: ${checkpointDir}`);
    console.log(`Report Output: ${reportPath}`);
    console.log(`Trajectories Output: ${reportTrajDir}`);
    console.log(`Maps (5): ${BENCHMARK_MAPS.map(m => m.label).join(', ')}`);
    console.log(`Seats (2): 0, 1 | Seeds (2): 42, 1337`);
    console.log(`Total Matches: 6 policies x 5 maps x 2 seats x 2 seeds = 120 matches`);
    console.log(`Protocol: No unit stagnation cutoff, strict 2-arg predict, NET_A finite contract`);
    console.log(`=======================================================\n`);

    const policies: PolicyType[] = [
        'HEURISTIC',
        'SPATIAL_V2',
        'SPATIAL_DAGGER',
        'NET_A',
        'S00_SEARCH',
        'S10_SPATIAL_SEARCH'
    ];

    const res = await runFullV7BenchmarkSuite({
        policiesToEvaluate: policies,
        maps: BENCHMARK_MAPS,
        seeds: [42, 1337],
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath,
        directories: {
            runId,
            reportDir,
            runDir,
            checkpointDir,
            trajectoryDir: reportTrajDir
        }
    });

    // Also mirror trajectories into runDir for consistency
    try {
        const files = readdirSync(reportTrajDir);
        for (const file of files) {
            copyFileSync(path.join(reportTrajDir, file), path.join(runTrajDir, file));
        }
    } catch (e) {
        console.warn('Failed to mirror trajectories to runDir:', e);
    }

    console.log('\n=======================================================');
    console.log(`✅ [V8 Frozen-Weights Re-Evaluation Completed Successfully]`);
    console.log(`Total Matches: ${res.outcomes.length}`);
    console.log(`Report Path: ${res.reportPath}`);
    console.log(`Trajectories Saved: ${reportTrajDir}`);
    console.log(`=======================================================`);
}

main().catch(err => {
    console.error('Re-evaluation benchmark failed:', err);
    process.exit(1);
});
