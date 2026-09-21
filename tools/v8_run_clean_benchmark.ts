import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS, PolicyType } from './v7_unified_evaluation';

async function main() {
    const runId = process.env.RUN_ID || 'agent_upgrade_20260921_v8_closure_01';
    const reportDir = path.resolve(`docs/training/reports/${runId}`);
    const runDir = path.resolve(`training_runs/${runId}`);
    const checkpointDir = path.join(runDir, 'checkpoints');
    const reportPath = path.join(reportDir, 'v8_clean_benchmark.json');

    mkdirSync(reportDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[R8-03 Clean Benchmark] Run ID: ${runId}`);
    console.log(`Loading clean checkpoints from: ${checkpointDir}`);
    console.log(`Saving clean report to: ${reportPath}`);
    console.log(`=======================================================\n`);

    const policies: PolicyType[] = ['HEURISTIC', 'SPATIAL_V2', 'SPATIAL_DAGGER', 'NET_A', 'S00_SEARCH', 'S10_SPATIAL_SEARCH'];

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
            checkpointDir
        }
    });

    console.log('\n=======================================================');
    console.log(`✅ [R8-03 Clean Benchmark Completed Successfully]`);
    console.log(`Total Matches: ${res.outcomes.length}`);
    console.log(`Report Path: ${res.reportPath}`);
    console.log(`=======================================================`);
}

main().catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
