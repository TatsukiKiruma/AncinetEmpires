import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateV7Dataset, trainV7SpatialModel, trainV7NetAControl } from './v7_training_pipeline';
import { runStudentDiagnosticAndDAgger } from './v7_counterfactual_dagger';
import { runFullV7BenchmarkSuite, BENCHMARK_MAPS } from './v7_unified_evaluation';

function getSha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

async function main() {
    const runId = process.env.RUN_ID || 'agent_upgrade_20260921_v8_final_01';
    const reportDir = path.resolve(`docs/training/reports/${runId}`);
    const runDir = path.resolve(`training_runs/${runId}`);
    const datasetDir = path.join(runDir, 'datasets');
    const checkpointDir = path.join(runDir, 'checkpoints');
    const failuresDir = path.join(runDir, 'failures');
    const consumedDir = path.join(runDir, 'consumed_samples');

    const dirs = {
        runId,
        reportDir,
        runDir,
        datasetDir,
        checkpointDir,
        failuresDir,
        consumedDir
    };

    mkdirSync(reportDir, { recursive: true });
    mkdirSync(runDir, { recursive: true });

    console.log(`=======================================================`);
    console.log(`[R8-05/06/07 Workflow] Clean Run ID: ${runId}`);
    console.log(`Report Dir: ${reportDir}`);
    console.log(`Run Dir:    ${runDir}`);
    console.log(`=======================================================\n`);

    // Step 1: Generate 10k stratified dataset with unified split manifest
    console.log(`\n--- Step 1: Generating 10,000 Verified States (7000 General + 3000 Curriculum) ---`);
    const datasetRes = await generateV7Dataset({
        totalTarget: 10000,
        generalTarget: 7000,
        curriculumTarget: 3000,
        directories: dirs
    });
    console.log(`Generated ${datasetRes.totalUniqueStates} states (Train: ${datasetRes.trainCount}, Val: ${datasetRes.valCount})`);

    // Step 2: Train Spatial ResNet v2 (32ch, 2 blocks, 4 epochs) with unified split manifest
    console.log(`\n--- Step 2: Training Spatial ResNet v2 (Policy-Only, 4 epochs) ---`);
    const spatialTrainRes = await trainV7SpatialModel(
        datasetRes.spatialDatasetPath,
        4,
        datasetRes.splitManifestPath,
        dirs
    );
    const baseModelSha = getSha256(readFileSync(spatialTrainRes.bestModelPath, 'utf8'));
    console.log(`Spatial ResNet v2 trained. Checkpoint SHA-256: ${baseModelSha}`);

    // Step 3: Train Low-Cost NET_A Control on exact same split
    console.log(`\n--- Step 3: Training NET_A Control DualHead [256, 128] ---`);
    const dualHeadSamples = JSON.parse(readFileSync(datasetRes.dualHeadDatasetPath, 'utf8'));
    const netARes = await trainV7NetAControl(
        dualHeadSamples,
        datasetRes.splitManifestPath,
        dirs
    );
    const netASha = getSha256(readFileSync(netARes.checkpointPath, 'utf8'));
    console.log(`NET_A Control trained. Checkpoint SHA-256: ${netASha}`);

    // Step 4: Run Student Diagnostic & Warm-Start DAgger Loop
    console.log(`\n--- Step 4: Running 2-Seat Diagnostic & Warm-Start DAgger ---`);
    const daggerRes = await runStudentDiagnosticAndDAgger({
        studentModelPath: spatialTrainRes.bestModelPath,
        matchCount: 6, // 3 maps, 2 seats (P0 and P1)
        maxStepsPerMatch: 70,
        directories: dirs
    });
    if (!daggerRes.fineTunedModelPath) {
        throw new Error('DAgger fine-tuned model path was not produced!');
    }
    const daggerModelSha = getSha256(readFileSync(daggerRes.fineTunedModelPath, 'utf8'));
    console.log(`DAgger fine-tuning complete.`);
    console.log(`Base Model SHA:   ${baseModelSha}`);
    console.log(`DAgger Model SHA: ${daggerModelSha}`);
    console.log(`Distinct Checkpoint SHAs Verified: ${baseModelSha !== daggerModelSha}`);
    console.log(`Logged Failure Windows: ${daggerRes.failures.length}`);

    // Step 5: Paired Evaluation between SPATIAL_BASE and SPATIAL_DAGGER
    console.log(`\n--- Step 5: Paired Benchmark: SPATIAL_BASE vs SPATIAL_DAGGER ---`);
    const pairedEvalPath = path.join(reportDir, 'dagger_paired_evaluation.json');
    const pairedEvalRes = await runFullV7BenchmarkSuite({
        policiesToEvaluate: ['SPATIAL_V2', 'SPATIAL_DAGGER'],
        maps: BENCHMARK_MAPS,
        seeds: [42, 1337],
        maxTurns: 45,
        maxAtomicSteps: 800,
        reportPath: pairedEvalPath,
        directories: dirs
    });

    console.log(`\n=======================================================`);
    console.log(`✅ [R8-05/06/07 Full Pipeline Completed Successfully]`);
    console.log(`Dataset states:  ${datasetRes.totalUniqueStates}`);
    console.log(`Base Model SHA:   ${baseModelSha}`);
    console.log(`DAgger Model SHA: ${daggerModelSha}`);
    console.log(`Paired Report:   ${pairedEvalPath}`);
    console.log(`=======================================================`);
}

main().catch(err => {
    console.error('Fatal pipeline error:', err);
    process.exit(1);
});
