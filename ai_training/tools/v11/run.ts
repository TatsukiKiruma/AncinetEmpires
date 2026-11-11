/**
 * V11 command runner.
 *
 * All commands are invoked through the in-process loader, because this
 * environment denies process creation and `tsx` needs an esbuild child process:
 *
 *   node v11/tools/run-tool.mjs tools/v11/run.ts freeze          # T11-00 evidence
 *   node v11/tools/run-tool.mjs tools/v11/run.ts replay          # T11-01 validation
 *   node v11/tools/run-tool.mjs tools/v11/run.ts profile         # T11-02 search
 *   node v11/tools/run-tool.mjs tools/v11/run.ts collect         # batch 2 data
 *   node v11/tools/run-tool.mjs tools/v11/run.ts counterfactual  # T11-04 labels
 *   node v11/tools/run-tool.mjs tools/v11/run.ts ablation        # T11-04 arms
 *   node v11/tools/run-tool.mjs tools/v11/run.ts status          # what exists
 *
 * The runner is read-only with respect to V10 artifacts: it writes only under
 * v11/out/ and training_runs/<new runId>/.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { OUT_DIR, RUN_DIR, RUN_ID, REVIEW_COMMIT, ensureDir, isMain, sha256File, writeJson } from './common';
import { V11_ISSUES } from './evidence';
import { buildIssueLedger, buildRegressionCases, buildSourceSnapshot, runT11_00 } from './audit';
import { runT11_01 } from './replay_validation';
import { runT11_02 } from './search_profile';
import { collectDataset, defaultPlan, verifyCollectedSnapshots } from './collect';
import { buildLabelQualityReport, defaultJobOptions, runCounterfactualJob, runRankerCurves } from './labels';
import { defaultAblationOptions, runStrengthAblation } from './ablation';
import { runPowerAnalysis } from './power';
import { recoverDatasetSource } from './recover';

const OUTPUT_FILES = [
    'source_snapshot.json', 'issue_ledger.json', 'regression_cases.json', 'evidence_manifest.json',
    'replay_validation.json', 'invalid_episodes.jsonl', 'dataset_v11_manifest.json', 'split_v11.json',
    'dataset_v11_source.json', 'candidate_coverage.json', 'search_transition_profile.json',
    'tactical_regression.json', 'counterfactual_labels.jsonl', 'label_quality.json',
    'residual_ranker_curves.json', 'strength_ablation.json', 'intervention_audit.json', 'power_analysis.json', 'out_index.json',
];

function cmdFreeze(): void {
    const result = runT11_00();
    const snapshot = buildSourceSnapshot();
    console.log(`[T11-00] review commit : ${REVIEW_COMMIT}`);
    console.log(`[T11-00] working HEAD  : ${snapshot.workingTreeHead} (match=${snapshot.headMatchesReviewCommit})`);
    console.log(`[T11-00] issues frozen : ${V11_ISSUES.length}`);
    for (const f of result.files) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

function cmdReplay(): void {
    const result = runT11_01({
        maxEpisodes: Number(process.env.V11_MAX_EPISODES ?? 40),
        hashEveryNSteps: Number(process.env.V11_HASH_EVERY ?? 10),
    });
    const c = result.replayValidation.counts;
    console.log(`[T11-01] pool=${c.episodesInPool} validated=${c.replayValidated} failed=${c.replayFailed} ` +
        `missingTrajectory=${c.trajectoriesMissing} unprovenSnapshot=${c.snapshotUnproven}`);
    console.log(`[T11-01] steps replayed=${result.replayValidation.coverage.totalStepsReplayed}/` +
        `${result.replayValidation.coverage.totalRecordedSteps} hashChecks=${result.replayValidation.coverage.hashChecksPerformed}`);
    console.log(`[T11-01] partitions: ` + Object.entries(result.datasetManifest.partitions)
        .map(([k, v]) => `${k}=${v.episodes}ep/${v.rootFamilies}roots`).join(' '));
    for (const f of result.files) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

function cmdProfile(): void {
    const result = runT11_02();
    console.log(`[T11-02] coverage: ${result.coverage.summary.positionsChecked} positions, ` +
        `baselineAlwaysPresent=${result.coverage.summary.baselineAlwaysPresent}, ` +
        `missingTypes=${result.coverage.summary.positionsWithMissingTypes}, ` +
        `immediateWinKept=${result.coverage.summary.immediateWinAlwaysPresent}`);
    console.log(`[T11-02] profile : ` + result.profile.runs
        .map(r => `budget${r.budget}: gen=${r.candidateGenerationTransitions} total=${r.totalTransitions} ledger=${r.ledgerConsistent}`)
        .join(' | '));
    console.log(`[T11-02] tactical: failingRepoFixtures=[${result.tactical.failingRepositoryFixtures.join(', ')}] ` +
        `constructedWinKept=${result.tactical.constructedImmediateWin.attackKept} ` +
        `permutationUnstable=${result.tactical.permutationStability.unstablePositions}`);
    for (const f of result.files) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

async function cmdCollect(): Promise<void> {
    const plan = defaultPlan();
    if (process.env.V11_SEEDS) plan.seeds = process.env.V11_SEEDS.split(',').map(Number).filter(Number.isFinite);
    if (process.env.V11_MAPS) plan.maps = process.env.V11_MAPS.split('|');
    console.log(`[collect] runId=${plan.runId} maps=${plan.maps.length} seeds=[${plan.seeds}] maxTurns=${plan.maxTurns}`);
    const started = Date.now();
    const result = await collectDataset(plan);
    const integrity = verifyCollectedSnapshots(
        path.join('training_runs', plan.runId, 'episodes.jsonl'),
        Number(process.env.V11_VERIFY_SAMPLE ?? 8)
    );
    console.log(`[collect] matches=${result.episodes.length} natural=${result.sourceReport.naturalTerminals} ` +
        `truncated=${result.sourceReport.truncations} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`[collect] snapshot integrity: checked=${integrity.checked} valid=${integrity.valid} missing=${integrity.missing}`);
    if (integrity.failures.length > 0) console.log(`[collect] FAILURES: ${JSON.stringify(integrity.failures.slice(0, 5))}`);
    for (const f of result.files) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

function cmdCounterfactual(): void {
    const options = defaultJobOptions();
    console.log(`[T11-04] episodes=${options.episodesFile} maxEpisodes=${options.maxEpisodes} ` +
        `decisionsPerEpisode=${options.decisionsPerEpisode} candidates=${options.options.maxCandidates} ` +
        `continuationBudget=${options.options.continuationBudget}`);
    const started = Date.now();
    const job = runCounterfactualJob(options);
    const elapsedMs = Date.now() - started;

    const report = buildLabelQualityReport(job.labels, {
        episodesFile: options.episodesFile ?? 'unknown',
        episodesUsed: new Set(job.labels.map(l => l.episodeId)).size,
        skipped: job.skipped,
        options: options.options,
        fitsUsed: 0,
        uninformative: job.uninformative,
    });
    writeJson(path.join(OUT_DIR, 'label_quality.json'), report);

    const curves = runRankerCurves(job.labels, path.join(OUT_DIR, 'ranker_weights'));
    writeJson(path.join(OUT_DIR, 'residual_ranker_curves.json'), curves);

    console.log(`[T11-04] decisions=${report.decisions} (compared ${report.decisionsCompared}, ` +
        `dropped uninformative ${report.decisionsDroppedUninformative}) in ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`[T11-04] quality=${JSON.stringify(report.byQuality)}`);
    console.log(`[T11-04] dQ pos/zero/neg = ${report.deltaDistribution.positive}/${report.deltaDistribution.zero}/` +
        `${report.deltaDistribution.negative}, mean=${report.deltaDistribution.mean}, ` +
        `baselineVerifiedErrors=${report.baselineIsVerifiedErrorRate}`);
    console.log(`[T11-04] transitions=${report.accounting.engineTransitions} ` +
        `(${report.accounting.engineTransitionsPerDecision}/decision), teacherDecisions=${report.accounting.teacherDecisions}, ` +
        `withinBudget=${report.budgetCompliance.withinBudget}`);
    for (const fit of curves.fits) {
        const hold = fit.evaluations.find(e => e.arm === 'holdout_trained_ranker')!;
        const base = fit.evaluations.find(e => e.arm === 'holdout_always_baseline')!;
        const untr = fit.evaluations.find(e => e.arm === 'holdout_untrained_weights')!;
        const oracle = fit.evaluations.find(e => e.arm === 'holdout_oracle_upper_bound')!;
        console.log(`[T11-04] ${fit.fitId.padEnd(26)} holdout n=${hold.decisions} ` +
            `trained dQ=${hold.meanDeltaVsBaseline} (harm ${hold.harmfulRate}) | baseline ${base.meanDeltaVsBaseline} | ` +
            `untrained ${untr.meanDeltaVsBaseline} | oracle ${oracle.meanDeltaVsBaseline}`);
    }
    console.log(`[T11-04] bestFit=${curves.bestFit?.fitId ?? 'none'}`);

    // Sizing evidence for the next round: yield, effect size and sample arithmetic.
    const power = runPowerAnalysis({ elapsedMs });
    writeJson(path.join(OUT_DIR, 'power_analysis.json'), power);
    console.log(`[T11-04] power: yield=${(power.yield.yieldRate * 100).toFixed(1)}% (` +
        `/) distinctDelta=${power.effectSize.distinctDeltaValues} ` +
        `decisionsNeededFor5pt=${power.sampleSize.decisionsNeededAtObservedYield}`);
    for (const f of [path.join(OUT_DIR, 'counterfactual_labels.jsonl'), path.join(OUT_DIR, 'label_quality.json'),
        path.join(OUT_DIR, 'residual_ranker_curves.json')]) {
        console.log(`           - ${path.relative(process.cwd(), f)}`);
    }
}

function cmdAblation(): void {
    const options = defaultAblationOptions();
    console.log(`[ablation] maps=${options.maps!.length} seeds=[${options.seeds}] seats=[${options.seats}] ` +
        `maxTurns=${options.maxTurns} ranker=${options.rankerFile}`);
    const started = Date.now();
    const { ablation, interventions, files } = runStrengthAblation(options);
    const arms = (ablation as any).arms;
    for (const key of Object.keys(arms)) {
        const a = arms[key];
        console.log(`[ablation] ${key.padEnd(17)} n=${a.matches} W/L/D/T/E=${a.wins}/${a.losses}/${a.draws}/${a.truncated}/${a.errors} ` +
            `naturalWR=${(a.naturalWinRate * 100).toFixed(1)}% overrides=${a.overrides}/${a.decisions}`);
    }
    console.log(`[ablation] controlCheck=${JSON.stringify((ablation as any).controlCheck)}`);
    console.log(`[ablation] verdict=${(ablation as any).verdict.summary}`);
    console.log(`[ablation] learningAddsValue=${(ablation as any).verdict.learningAddsValue}`);
    console.log(`[ablation] interventions: events=${(interventions as any).events} overrides=${(interventions as any).overrides} ` +
        `(${((interventions as any).overrideShare * 100).toFixed(1)}%) elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
    for (const f of files) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

function cmdRecover(): void {
    const report = recoverDatasetSource(process.env.V11_RECOVER_RUN_ID || undefined) as any;
    console.log(`[recover] runId=${report.runId} matches=${report.matchCount} ` +
        `natural=${report.naturalTerminals} truncated=${report.truncations}`);
    console.log(`[recover] snapshots: onDisk=${report.snapshotIntegrity.trajectoriesOnDisk} ` +
        `withSnapshot=${report.snapshotIntegrity.episodesWithSnapshot} ` +
        `verified=${report.snapshotIntegrity.episodesWithVerifiedSnapshot} ` +
        `failures=${report.snapshotIntegrity.failures.length}`);
    console.log(`           - ${path.relative(process.cwd(), path.join(OUT_DIR, 'dataset_v11_source.json'))}`);
}

function cmdPower(): void {
    const power = runPowerAnalysis({ elapsedMs: Number(process.env.V11_CF_ELAPSED_MS ?? 0) || undefined });
    writeJson(path.join(OUT_DIR, 'power_analysis.json'), power);
    console.log(`[power] yield=${(power.yield.yieldRate * 100).toFixed(1)}% ` +
        `(${power.yield.decisionsKept}/${power.yield.decisionsCompared}) ` +
        `shapes: allTerminal=${power.decisionShapes.allCandidatesTerminal} ` +
        `noneTerminal=${power.decisionShapes.noCandidateTerminal} mixed=${power.decisionShapes.mixed}`);
    console.log(`[power] distinct dQ values=${power.effectSize.distinctDeltaValues} ` +
        `values=[${power.effectSize.deltaValues.join(', ')}] allEqual=${power.effectSize.allDeltasEqual}`);
    console.log(`[power] sample size for +5pt: discordantPairs=${power.sampleSize.discordantPairsNeeded} ` +
        `blocks=${power.sampleSize.blocksNeededAtObservedDiscordance} ` +
        `decisions=${power.sampleSize.decisionsNeededAtObservedYield} ` +
        `at ${power.budgetAccounting.secondsPerComparedDecision}s/decision`);
    for (const f of [path.join(OUT_DIR, 'power_analysis.json')]) console.log(`           - ${path.relative(process.cwd(), f)}`);
}

function cmdStatus(): void {
    const ledger = buildIssueLedger();
    const cases = buildRegressionCases();
    writeJson(path.join(OUT_DIR, 'out_index.json'), {
        schema: 'v11_out_index_1',
        generatedAt: new Date().toISOString(),
        runId: RUN_ID,
        reviewCommit: REVIEW_COMMIT,
        files: OUTPUT_FILES.map(f => ({
            file: f,
            exists: fs.existsSync(path.join(OUT_DIR, f)),
            sha256: fs.existsSync(path.join(OUT_DIR, f)) ? sha256File(path.join(OUT_DIR, f)) : null,
        })),
    });
    console.log(JSON.stringify({
        runId: RUN_ID,
        outDir: path.relative(process.cwd(), OUT_DIR),
        reviewCommit: REVIEW_COMMIT,
        issues: ledger.summary,
        regressionCases: cases.cases.length,
        outputs: OUTPUT_FILES.map(f => `${f}:${fs.existsSync(path.join(OUT_DIR, f)) ? 'ok' : 'MISSING'}`),
    }, null, 2));
}

function main(): void {
    const cmd = process.argv[2];
    ensureDir(OUT_DIR);
    ensureDir(RUN_DIR);
    switch (cmd) {
        case 'freeze': return cmdFreeze();
        case 'replay': return cmdReplay();
        case 'profile': return cmdProfile();
        case 'counterfactual': return cmdCounterfactual();
        case 'ablation': return cmdAblation();
        case 'power': return cmdPower();
        case 'recover': return cmdRecover();
        case 'collect':
            cmdCollect().catch(err => { console.error('FATAL', err); process.exitCode = 1; });
            return;
        case 'status': return cmdStatus();
        default: {
            writeJson(path.join(OUT_DIR, 'runner_help.json'), {
                commands: ['freeze', 'replay', 'profile', 'collect', 'counterfactual', 'ablation', 'power', 'recover', 'status'],
                note: 'Unknown or missing command.',
            });
            throw new Error(`Unknown V11 command: ${cmd ?? '(none)'}.`);
        }
    }
}

if (isMain('v11/run.ts') || isMain('run.ts')) {
    main();
}
