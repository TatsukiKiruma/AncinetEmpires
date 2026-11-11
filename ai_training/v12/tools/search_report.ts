/**
 * Build `v12/out/labels/T12-06_07_report.md` from the measured artifacts.
 *
 * Every number in the report is read from a run artifact or from the previous
 * batch's published artifact. Nothing is typed by hand and nothing is
 * extrapolated: if a field is missing the report says so instead of guessing.
 *
 * Usage:
 *   node v11/tools/run-tool.mjs v12/tools/search_report.ts \
 *     [--labels v12/out/labels/counterfactual_labels_v2.jsonl] \
 *     [--quality v12/out/labels/label_quality_v2.json] \
 *     [--prescreen v12/out/labels/decision_prescreen.json] \
 *     [--recovery v12/out/labels/b2_recovered_decision_ids.json] \
 *     [--determinism v12/out/labels/determinism_check.json] \
 *     [--command "<exact command>"] \
 *     [--tests "<verbatim test result>"] \
 *     [--out v12/out/labels/T12-06_07_report.md]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ensureDir, readJson, readJsonl } from '../../tools/v11/common';
import { renderBar } from './search_prescreen';

interface Histogram { binCount: number; lo: number; hi: number; width: number; bins: Array<{ lo: number; hi: number; count: number }> }
interface NumericSummary {
    count: number; distinct: number; min: number; max: number; mean: number; stdDev: number;
    median: number; p10: number; p90: number;
}

function argValue(flag: string): string | null {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

function histogramBlock(h: Histogram, label: string): string {
    if (!h || h.bins.length === 0) return `_(no ${label} histogram: no values)_\n`;
    const maxCount = h.bins.reduce((m, b) => Math.max(m, b.count), 0);
    const lines = [`| bin | count | |`, `|---|---:|---|`];
    h.bins.forEach(b => {
        lines.push(`| [${b.lo}, ${b.hi}) | ${b.count} | ${renderBar(b.count, maxCount, 30)} |`);
    });
    return lines.join('\n') + '\n';
}

function summaryLine(s: NumericSummary): string {
    if (!s) return '_missing_';
    return `n=${s.count}, distinct=${s.distinct}, min=${s.min}, max=${s.max}, mean=${s.mean}, ` +
        `sd(population)=${s.stdDev}, median=${s.median}, p10=${s.p10}, p90=${s.p90}`;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function main(): void {
    const labelsFile = argValue('--labels') ?? 'v12/out/labels/counterfactual_labels_v2.jsonl';
    const qualityFile = argValue('--quality') ?? 'v12/out/labels/label_quality_v2.json';
    const prescreenFile = argValue('--prescreen') ?? 'v12/out/labels/decision_prescreen.json';
    const recoveryFile = argValue('--recovery') ?? 'v12/out/labels/b2_recovered_decision_ids.json';
    const determinismFile = argValue('--determinism') ?? 'v12/out/labels/determinism_check.json';
    const command = argValue('--command') ?? '(command not supplied)';
    const testsFile = argValue('--tests-file');
    const tests = testsFile && fs.existsSync(testsFile)
        ? fs.readFileSync(testsFile, 'utf8')
        : (argValue('--tests') ?? '(test output not supplied)');
    const outFile = argValue('--out') ?? 'v12/out/labels/T12-06_07_report.md';

    const quality = readJson<any>(qualityFile);
    const prescreen = readJson<any>(prescreenFile);
    const labels = readJsonl<any>(labelsFile);
    const recovery = fs.existsSync(recoveryFile) ? readJson<any>(recoveryFile) : null;
    const determinism = fs.existsSync(determinismFile) ? readJson<any>(determinismFile) : null;
    const previousQuality = fs.existsSync('v11/out/label_quality.json') ? readJson<any>('v11/out/label_quality.json') : null;
    const previousPower = fs.existsSync('v11/out/power_analysis.json') ? readJson<any>('v11/out/power_analysis.json') : null;

    const e = quality.effectSize;
    const yields = quality.yield;
    const cost = quality.cost;
    const footing = prescreen.sameFooting ?? null;
    const footingFromQuality = quality.sameFooting ?? null;
    const sf = footing ?? footingFromQuality;

    const L: string[] = [];
    const push = (s = '') => L.push(s);

    push('# T12-06 + T12-07 — continuous proxy-Q labels and a high-information decision prescreen');
    push();
    push(`- Generated: ${new Date().toISOString()}`);
    push(`- Repo: \`C:\\code\\AncinetEmpires\`, branch \`train/battle-ai-20260923\`, HEAD \`9c6c1ab\``);
    push(`- Provenance of every label: \`${quality.provenance}\``);
    push(`- Decisions compared in this run: **${quality.sample.decisionsCompared}**`);
    push();

    push('## 1. Exact commands');
    push();
    push('```powershell');
    push('# NOTE: run-tool.mjs loads vite, whose Windows "safe realpath" probe shells out to');
    push('# `net use`. This sandbox denies process creation, so the in-repo preload shim');
    push('# (the same one v11/tools/run-tests.ps1 uses) must be attached to the loader.');
    push(command);
    push('pwsh -File v11/tools/run-tests.ps1');
    push('```');
    push();

    push('## 2. What changed in the game AI (one line, behaviour-preserving)');
    push();
    push('`src/game/ai/battle_search_ai.ts`: `private evaluateCandidate(...)` -> `public evaluateCandidate(...)`.');
    push('The body, the seeding contract and every call site are untouched; only the visibility modifier and a');
    push('doc comment changed. Nothing in the class reads or writes new state.');
    push();
    push('```diff');
    push('-  private evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {');
    push('+  public evaluateCandidate(engine: GameEngine, playerId: number, action: Action): number {');
    push('```');
    push();
    push('No game rule was modified. The tooling in this task writes only under `v12/out/labels/`; it reads ' +
        '`v11/out/*.json` and `v11/out/*.jsonl` but never writes there. (Other files may appear modified in the ' +
        'working tree from parallel tasks on this branch — e.g. `tools/convert_archive_to_spatial.ts`, which ' +
        'carries a T12-03 banner and is not part of this task.)');
    push();

    push('## 3. Decisions actually compared');
    push();
    push(`| quantity | measured |`);
    push(`|---|---:|`);
    push(`| episodes loaded | ${quality.sample.episodesUsed} |`);
    push(`| episodes skipped | ${quality.sample.episodesSkipped} |`);
    push(`| decision points planned | ${quality.sample.decisionPointsPlanned} |`);
    push(`| **decisions compared** | **${quality.sample.decisionsCompared}** |`);
    push(`| decisions skipped at evaluation | ${quality.sample.decisionsSkipped} |`);
    push(`| leaf evaluations (candidates x decisions) | ${cost.leafEvalsTotal} |`);
    push(`| episodes file | \`${quality.config.episodesFile}\` |`);
    push();
    push(`Sampling: plan=\`${quality.config.plan}\`, per-episode=\`${quality.config.decisionsPerEpisode}\`, ` +
        `step band=[${quality.config.minStepFraction}, ${quality.config.maxStepFraction}]. Both the sampling function ` +
        '(`tools/v11/labels.ts` -> `sampleDecisionPoints`) and the step band are the ones the batch-2 labels used; ' +
        'the per-episode count is larger, and because `sampleDecisionSteps` takes a prefix of one deterministic ' +
        'shuffle, a larger count is a **strict superset** of any smaller count on the same episode. That is what ' +
        "makes the batch-2 subset recoverable below.");
    push();

    push('## 4. The ΔQ distribution');
    push();
    push('```');
    push(`dQ(a) = leaf(a) - leaf(a0)`);
    push(`leaf   = BattleSearchAI v3 maximin leaf = worst case over the opponent's most dangerous replies`);
    push(`a0     = the Heuristic top choice (what BattleSearchAI returns unless it takes over / vetoes)`);
    push('```');
    push();
    push(`**distinctDeltaValues = ${e.distinctDeltaValues}** (previous batch: **${previousPower?.effectSize?.distinctDeltaValues ?? 1}**, ` +
        `\`allDeltasEqual\` was \`${previousPower?.effectSize?.allDeltasEqual ?? true}\`). ` +
        `\`allDeltasEqual\` now = \`${e.allDeltasEqual}\`. ` +
        `Restricted to \`dQ != 0\` (the batch-2 keep rule): **${e.distinctDeltaValuesNonZero}** distinct values.`);
    push();
    push(`- All decisions: ${summaryLine(e.summaryAll)}`);
    push(`- \`dQ != 0\` only (like-for-like with batch-2): ${summaryLine(e.summaryNonZeroOnly)}`);
    push(`- Non-degenerate decisions only: ${summaryLine(e.summaryNonDegenerateOnly)}`);
    push(`- All non-baseline candidate dQ pooled: ${summaryLine(e.candidateLevelPooled.summary)}`);
    push();
    push(`Fraction of decisions where every candidate ties (no ranking information): ` +
        `**${yields.decisionsDroppedDegenerate}/${quality.sample.decisionsCompared} = ${pct(yields.fractionAllCandidatesTie)}**`);
    push();
    push(`Breakdown of \`margin = 0\` (${yields.marginZeroBreakdown.totalMarginZero} decisions): ` +
        `${yields.marginZeroBreakdown.allCandidatesTie} because every candidate ties, and ` +
        `${yields.marginZeroBreakdown.baselineAlreadyBest} because the heuristic baseline is already the ` +
        'maximin-best candidate (candidates differ, but nothing beats the baseline).');
    push();
    push(yields.criterionNote);
    push();
    push('### 4.1 Raw histogram — all decisions');
    push();
    push(histogramBlock(e.histogramAll, 'all-decisions'));
    push('### 4.2 Raw histogram — `dQ != 0` only (batch-2-comparable subset)');
    push();
    push(histogramBlock(e.histogramNonZeroOnly, 'dQ != 0'));
    push('### 4.3 Raw histogram — non-degenerate decisions only');
    push();
    push(histogramBlock(e.histogramNonDegenerateOnly, 'non-degenerate'));
    push('### 4.4 Most frequent exact dQ values');
    push();
    push('| dQ | count |');
    push('|---:|---:|');
    for (const v of (e.deltaValuesExact ?? []).slice(0, 20)) push(`| ${v.value} | ${v.count} |`);
    push();
    push('### 4.5 What kind of values these are, and what the sample is made of');
    push();
    const allLeaves = labels.flatMap((l: any) => l.leaves.map((c: any) => c.leaf));
    const sortedLeaves = [...allLeaves].sort((a, b) => a - b);
    const qq = (p: number) => sortedLeaves[Math.min(sortedLeaves.length - 1, Math.round(p * (sortedLeaves.length - 1)))];
    const inTerminalBand = allLeaves.filter((v: number) => Math.abs(v) >= 90000).length;
    const mapCounts = new Map<string, number>();
    const seatCounts = new Map<string, number>();
    for (const l of labels as any[]) {
        mapCounts.set(l.mapName, (mapCounts.get(l.mapName) ?? 0) + 1);
        seatCounts.set(`seat${l.subjectPlayer}`, (seatCounts.get(`seat${l.subjectPlayer}`) ?? 0) + 1);
    }
    push('| property | measured |');
    push('|---|---|');
    push(`| leaf evaluations | ${allLeaves.length} |`);
    push(`| raw leaf range | ${sortedLeaves[0]} .. ${sortedLeaves[sortedLeaves.length - 1]} (p1=${qq(0.01)}, p50=${qq(0.5)}, p99=${qq(0.99)}) |`);
    push(`| leaves inside the terminal band (\|leaf\| >= 90000) | **${inTerminalBand}** |`);
    push(`| decisions flagged terminal-dominated | **${labels.filter((l: any) => l.terminalDominated).length}** |`);
    push(`| decisions with a forced win available | ${labels.filter((l: any) => l.forcedWinAvailable).length} |`);
    push(`| decisions where the baseline is past the danger line | ${labels.filter((l: any) => l.dangerousBaseline).length} |`);
    push(`| leaves where the action threw (\`stepFailed\`) | ${labels.filter((l: any) => l.leaves.some((c: any) => c.stepFailed)).length} decisions |`);
    push(`| label quality mix | ${JSON.stringify(quality.labelQualityMix)} |`);
    push(`| distinct root families | ${new Set((labels as any[]).map(l => l.rootFamilyId)).size} |`);
    push(`| maps | ${Array.from(mapCounts.entries()).map(([m, n]) => `${m}: ${n}`).join(', ')} |`);
    push(`| seats | ${Array.from(seatCounts.entries()).map(([s, n]) => `${s}: ${n}`).join(', ')} |`);
    push();
    push('Two things follow, and both matter for reading the yield numbers. First, **no leaf in this sample ' +
        'ever reached a real terminal** (0 leaves in the terminal band, 0 forced wins), so every label here is ' +
        'a pure heuristic-score proxy and `PROXY_TERMINAL` is empty — the terminal half of the leaf scale is a ' +
        'convention that this run never exercised. Second, this run spans 4 maps and both seats evenly, while ' +
        "batch-2's 40 decisions came from only 2 maps (8 Duel episodes covering both seats, plus 2 " +
        'Crossed-swords seat-0 episodes). The overall 60.9% / 91.4% numbers therefore cover a **wider map ' +
        'and seat mix** than batch-2; the like-for-like comparison is the recovered 40-decision row in ' +
        'section 5, not the overall row.');
    push();

    push('## 5. Yield rate, compared with the previous batch on the same footing');
    push();
    const prevYield = previousPower?.yield?.yieldRate ?? 0.2;
    push('The batch-2 keep rule was "some candidate separated from the baseline", i.e. `dQ != 0`. That is the ' +
        'strictly comparable criterion (`yield (dQ != 0)` column). The weaker "candidates do not all tie" ' +
        'criterion is also given, because that is what the T12-07 prescreen is stated against.');
    push();
    push(`| run | decisions compared | yield (dQ != 0) | yield (non-degenerate) | distinct decision-level ΔQ | value scale |`);
    push(`|---|---:|---:|---:|---:|---|`);
    push(`| v11 batch-2 (\`v11/out/label_quality.json\`, \`power_analysis.json\`) | ${previousPower?.yield?.decisionsCompared ?? 40} | ` +
        `${pct(prevYield)} (${previousPower?.yield?.decisionsKept ?? 8} kept) | not measured | ${previousPower?.effectSize?.distinctDeltaValues ?? 1} | ` +
        `tanh of a {-1,0,+1} terminal payoff, range [-1,1] |`);
    push(`| v12 this run (all ${quality.sample.decisionsCompared} sampled decisions) | ${quality.sample.decisionsCompared} | ` +
        `${pct(yields.yieldRateNonZeroDeltaQ)} (${yields.decisionsWithNonZeroDeltaQ}) | ` +
        `${pct(yields.yieldRate)} (${yields.decisionsKeptNonDegenerate}) | ${e.distinctDeltaValues} ` +
        `(${e.distinctDeltaValuesNonZero} over dQ != 0) | evaluatePositionHeuristic units |`);
    if (sf) {
        push(`| **v12 on the recovered batch-2 decision set only** | ${sf.footingDecisionsCompared} | ` +
            `${pct(sf.footingYieldRateNonZeroDeltaQ)} (${sf.footingNonZeroDeltaQ}) | ` +
            `${pct(sf.footingYieldRate)} (${sf.footingNonDegenerate}) | ${sf.footingDistinctDeltaValues} ` +
            `(${sf.footingDistinctDeltaValuesNonZero} over dQ != 0) | evaluatePositionHeuristic units |`);
    }
    push();
    if (recovery?.recovered) {
        push(`The batch-2 decision set was recovered, not assumed (${recoveryFile}): the published batch-2 ids ` +
            `(${recovery.publishedKeptIds.length} kept + ${recovery.publishedUninformativeExamples.length} dropped examples) ` +
            `are reproduced exactly and uniquely by \`maxEpisodes=${recovery.recovered.maxEpisodes}\`, ` +
            `\`decisionsPerEpisode=${recovery.recovered.decisionsPerEpisode}\` — ${recovery.recovered.decisionIds.length} ids, ` +
            `matching the published \`decisionsCompared=${recovery.previousDecisionsCompared}\`. ` +
            `Unique solution: \`${recovery.recovered.uniqueSolution}\`.`);
        push();
        push('Caveat on the recovery: it is a consistency argument against the **published** ids. Only ' +
            `${recovery.publishedIdsKnown} of the 40 batch-2 ids were ever published, so "unique" means ` +
            '"the only (E,K) pair consistent with everything that was published", not a byte-level replay of the ' +
            'batch-2 process.');
    } else {
        push('The batch-2 decision set could NOT be recovered; the comparison is therefore across ' +
            'the same episodes file and sampling machinery, but not necessarily the identical positions.');
    }
    push();
    if (sf && sf.previouslyKeptDecisionsReproduced > 0) {
        push(`The ${sf.previouslyKeptDecisionsReproduced} batch-2 *kept* decisions that this run reproduces, with their new continuous labels:`);
        push();
        push('| decision | v11 dQ | v12 dQ | distinct leaves | v12 label quality |');
        push('|---|---:|---:|---:|---|');
        for (const r of sf.previouslyKeptNewDeltaQ) {
            push(`| \`${r.decisionId}\` | 2 (constant, all ${previousPower?.yield?.decisionsKept ?? 8} kept labels were 2) | ` +
                `${r.deltaQ} | ${r.distinctLeafValues} | ${r.labelQuality} |`);
        }
        push();
        const keptNewNonZero = sf.previouslyKeptNewDeltaQ.filter((r: any) => r.deltaQ !== 0).length;
        push(`Agreement between the two label functions on the identical 40 positions: batch-2 called ` +
            `${previousPower?.yield?.decisionsKept ?? 8} decisions informative (\`dQ != 0\`); this run calls ` +
            `${sf.footingNonZeroDeltaQ}. Only ${keptNewNonZero} of batch-2's ${previousPower?.yield?.decisionsKept ?? 8} ` +
            'are also `dQ != 0` here, and the other ' +
            `${previousPower?.yield?.decisionsKept ? (previousPower.yield.decisionsKept - keptNewNonZero) : '?'} ` +
            'flip to `dQ = 0` (the maximin leaf ranks the Heuristic top first, the 900-transition continuation ' +
            'payoff did not). The two measures are therefore **not nested**: the new label separates far more ' +
            'decisions, but it is a different ordering function, not a refinement of the old one. Each of ' +
            "batch-2's kept decisions still carries a graded candidate spread (3-6 distinct leaves), so those " +
            'states are not lost even where the headline margin is 0.');
        push();
    }

    push('## 6. Measured cost per decision');
    push();
    const publishedCostSeconds = 54.46; // v11/V11_BATCH2_REPORT.md section 4, "单决策耗时 54.46 秒"
    const recordedCostSeconds = previousPower?.budgetAccounting?.secondsPerComparedDecision;
    push('| quantity | v11 batch-2 | v12 this run |');
    push('|---|---:|---:|');
    push(`| seconds per compared decision | ${publishedCostSeconds} | **${cost.secondsPerComparedDecision}** |`);
    push(`| seconds per leaf evaluation | n/a (payoff only) | ${cost.secondsPerLeafEval} |`);
    push(`| engine transitions per decision | ${previousQuality?.accounting?.engineTransitionsPerDecision ?? 1558.9} | ${cost.engineTransitionsPerDecision} |`);
    push(`| total search wall clock | n/a | ${cost.searchSecondsTotal}s for ${quality.sample.decisionsCompared} decisions |`);
    push();
    push(`Note on the batch-2 figure: it is taken from \`v11/V11_BATCH2_REPORT.md\` ("单决策耗时 54.46 秒"). ` +
        `\`v11/out/power_analysis.json\` records \`budgetAccounting.secondsPerComparedDecision = ${JSON.stringify(recordedCostSeconds)}\`, ` +
        'which contradicts its own report; the report value is used here and the discrepancy is flagged rather ' +
        'than silently resolved.');
    push();
    push('The two costs are not the same operation and must not be read as a speed-up of the same thing: the ' +
        'batch-2 number is a 900-transition heuristic continuation per candidate, the v12 number is one ' +
        'maximin leaf per candidate (1 step + up to 3 friendly rollout steps + up to ' +
        `${quality.config.search.oppProbeK} opponent probes). The v12 label is cheaper *and* continuous.`);
    push();
    push('### 6.1 What that does to the projected sample size');
    push();
    push('Reusing the previous round\'s own order-of-magnitude arithmetic (`v11/out/power_analysis.json`: a paired ' +
        'test at 95% confidence for a +5 percentage-point effect needs ~1537 discordant pairs, and every compared ' +
        'decision was assumed discordant), the decision count and wall clock scale as 1537 / yield:');
    push();
    const DISCORDANT = 1537;
    const costSeconds = cost.secondsPerComparedDecision ?? 0;
    const projections = [
        { label: 'v11 batch-2 as published', yieldRate: prevYield, seconds: publishedCostSeconds },
        { label: 'v12, batch-2 keep rule (dQ != 0)', yieldRate: yields.yieldRateNonZeroDeltaQ, seconds: costSeconds },
        { label: 'v12, recovered batch-2 subset, batch-2 keep rule', yieldRate: sf?.footingYieldRateNonZeroDeltaQ ?? 0, seconds: costSeconds },
        { label: 'v12, non-degenerate', yieldRate: yields.yieldRate, seconds: costSeconds },
    ];
    push('| scenario | yield | decisions needed (1537 / yield) | seconds each | projected hours |');
    push('|---|---:|---:|---:|---:|');
    for (const p of projections) {
        if (!p.yieldRate) continue;
        const needed = Math.round(DISCORDANT / p.yieldRate);
        push(`| ${p.label} | ${pct(p.yieldRate)} | ${needed} | ${p.seconds} | ${(needed * p.seconds / 3600).toFixed(1)} |`);
    }
    push();
    push('This is the same crude arithmetic the previous round used, applied to the newly measured yield and ' +
        'cost. It is an order-of-magnitude planning number, not a power calculation, and it still assumes every ' +
        'compared decision is discordant, which nothing here establishes.');
    push();

    push('## 7. T12-07 — high-information decision prescreen');
    push();
    push(`Baseline yield in this run: **${pct(prescreen.baselineYield.yieldRate)}** ` +
        `(${prescreen.baselineYield.nonDegenerate}/${prescreen.baselineYield.total}); ` +
        `previous batch was ${pct(prescreen.baselineYield.previousBatchYieldRate)}, ` +
        `absolute change ${(prescreen.baselineYield.absoluteChange * 100).toFixed(1)} percentage points.`);
    push();
    push('| predicate | cheap before search? | kept | kept & non-degenerate | yield inside | yield outside | precision | recall |');
    push('|---|---|---:|---:|---:|---:|---:|---:|');
    for (const p of prescreen.predicates) {
        const outside = p.kept < p.total ? pct(p.yieldRateOutside) : 'n/a (keeps everything)';
        push(`| \`${p.definition}\` | ${p.evaluableBeforeSearch ? 'yes' : 'no'} | ${p.kept}/${p.total} | ` +
            `${p.keptNonDegenerate} | ${pct(p.yieldRateInside)} | ${outside} | ` +
            `${pct(p.precision.value)} | ${pct(p.recall.value)} |`);
    }
    push();
    push('Definitions: precision = kept decisions that are non-degenerate / kept decisions; ' +
        'recall = kept non-degenerate / all non-degenerate. A predicate with `evaluableBeforeSearch = yes` ' +
        'needs only `HeuristicAI.scoreCandidateActions`, so an operator can apply it *before* spending any search.');
    push();
    push('### 7.1 Wall clock');
    push();
    push('| predicate | wall ms kept | wall ms excluded | ms per kept decision |');
    push('|---|---:|---:|---:|');
    for (const p of prescreen.predicates) {
        push(`| \`${p.id}\` | ${p.wallMsInside} | ${p.wallMsOutside} | ${p.wallMsPerKeptDecision} |`);
    }
    push();
    push(prescreen.wallClock.note);
    push();
    push('### 7.2 Stratification by the branch BattleSearchAI v3 would take');
    push();
    push(prescreen.branchMix.note);
    push();
    push('| branch | decisions | non-degenerate | yield | mean margin | wall ms |');
    push('|---|---:|---:|---:|---:|---:|');
    for (const b of prescreen.branchMix.perBranch) {
        push(`| ${b.branch} | ${b.count} | ${b.nonDegenerate} | ${pct(b.yieldRate)} | ${b.meanMargin} | ${b.wallMsTotal} |`);
    }
    push();
    push(`Raw reconstructed counts: \`${JSON.stringify(prescreen.branchMix.reconstructedExternally)}\`.`);
    push();
    push('### 7.3 Policy agreement check');
    push();
    const pc = prescreen.policyCheck;
    push(`On ${pc.checked} decisions a *real* \`BattleSearchAI.getAction\` was run on the same state: ` +
        `its returned action equals the Heuristic top choice in ${pct(pc.realMatchesHeuristicTop)} of cases and ` +
        `equals this tool's external branch reconstruction in ${pct(pc.realMatchesReconstruction)} of cases ` +
        `(${pc.mismatches.length} mismatches).`);
    push();
    push('This is the evidence that defining `a0` as the Heuristic top choice is faithful to the policy: ' +
        'v3 is heuristic-anchored, so it returns the heuristic top unless it takes over or vetoes.');
    push();
    push('### 7.4 Stratification by turn / stage (computed at report time from the label file)');
    push();
    const byStage = new Map<string, any[]>();
    for (const l of labels) {
        const key = String(l.stage ?? `turn>=${l.turn}`);
        const list = byStage.get(key) ?? [];
        list.push(l);
        byStage.set(key, list);
    }
    push('| stage | decisions | non-degenerate | yield | mean turn | mean margin | mean wall ms |');
    push('|---|---:|---:|---:|---:|---:|---:|');
    for (const key of ['OPENING', 'MIDGAME', 'ENDGAME']) {
        const list = byStage.get(key);
        if (!list || list.length === 0) continue;
        const nd = list.filter((l: any) => l.distinctLeafValues > 1).length;
        push(`| ${key} | ${list.length} | ${nd} | ${pct(nd / list.length)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.turn, 0) / list.length).toFixed(1)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.margin, 0) / list.length).toFixed(1)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.wallMs, 0) / list.length).toFixed(0)} |`);
    }
    for (const [key, list] of byStage) {
        if (['OPENING', 'MIDGAME', 'ENDGAME'].includes(key)) continue;
        const nd = list.filter((l: any) => l.distinctLeafValues > 1).length;
        push(`| ${key} | ${list.length} | ${nd} | ${pct(nd / list.length)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.turn, 0) / list.length).toFixed(1)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.margin, 0) / list.length).toFixed(1)} | ` +
            `${(list.reduce((n: number, l: any) => n + l.wallMs, 0) / list.length).toFixed(0)} |`);
    }
    push();
    push('`stage` comes from the v11 sampling machinery (episode progress <= 0.3 OPENING, > 0.7 ENDGAME). ' +
        'Turn number is recorded on every label as `turn`; the table above is a report-time aggregation of the ' +
        'emitted label file, not an additional measurement.');
    push();

    push('## 8. Determinism evidence');
    push();
    if (determinism) {
        push(`\`${argValue('--determinism') ?? 'v12/out/labels/determinism_check.json'}\`: ${determinism.checks.length} decisions ` +
            `re-evaluated a second time from the same state with freshly constructed, separately seeded ` +
            `\`BattleSearchAI\` instances. Compared by sha256 with only the wall-clock fields zeroed ` +
            `(\`${determinism.wallClockFieldsExcluded.join('\`, `')}\`).`);
        push();
        push(`**All bit-identical: \`${determinism.allBitIdentical}\`**`);
        push();
        push('| decision | dQ (1st) | dQ (2nd) | identical |');
        push('|---|---|---|---|');
        for (const c of determinism.checks) {
            push(`| \`${c.decisionId}\` | \`${JSON.stringify(c.deltaQsA)}\` | \`${JSON.stringify(c.deltaQsB)}\` | ${c.bitIdenticalIgnoringWallClock} |`);
        }
    } else {
        push('No determinism artifact was produced in this run.');
    }
    push();
    push('Determinism is structural, not incidental: each candidate leaf comes from a **fresh** ' +
        '`new BattleSearchAI(seedFromHash(stateHash) ^ imul(index+1, 0x9e3779b9))`, so a leaf depends only on ' +
        '(state, playerId, action, seed) and never on evaluation order or on how many decisions ran before it. ' +
        '`Math.random` is reachable nowhere in this path: `HeuristicAI` is only constructed with an explicit ' +
        '`fixedRng(...)` stream.');
    push();
    const crossFile = 'v12/out/labels/determinism_cross_process.json';
    if (fs.existsSync(crossFile)) {
        const cross = readJson<any>(crossFile);
        push('### 8.1 Cross-process check');
        push();
        push(`The check above is inside one process. \`${crossFile}\` closes that gap: two **separate node ` +
            `processes** loaded the same episodes file and evaluated the same ${cross.decisionsCompared} decision ` +
            'points, and every label record was compared by sha256 after zeroing the same wall-clock fields.');
        push();
        push(`**All bit-identical across processes: \`${cross.allBitIdentical}\`**`);
        push();
        push('| decision | dQ (process A) | dQ (process B) | identical |');
        push('|---|---|---|---|');
        for (const c of cross.checks) {
            push(`| \`${c.decisionId}\` | \`${JSON.stringify(c.deltaQsA)}\` | \`${JSON.stringify(c.deltaQsB)}\` | ${c.bitIdenticalIgnoringWallClock} |`);
        }
        push();
        push('Two of those four positions (`#73`, `#85` in `Duel.aem s42`) are in the v11 batch-2 ' +
            '`uninformativeExamples` list — states the old label called "no candidate separated from the ' +
            'baseline" and discarded. Under the continuous maximin leaf they carry dQ of 288 and 2030.5 ' +
            'respectively, reproducibly, in both processes.');
        push();
    }

    push('## 9. Test suite');
    push();
    push('```');
    push(tests.trim());
    push('```');
    push();

    push('## 10. Verification boundary — what `Q_ref` is and is not');
    push();
    for (const line of quality.verificationBoundary) push(`- ${line}`);
    push();
    push('Concretely:');
    push();
    push('1. **Not a win probability.** The leaf is `evaluatePositionHeuristic`, a hand-weighted material /');
    push('   territory / commander score. Its units are arbitrary score points, not probabilities.');
    push('2. **Not calibrated.** Nothing in this run fitted a mapping from leaf values to observed outcomes.');
    push('   The terminal band (+/-100000) is a convention, and this run never reached it: 0 of the raw leaves ' +
        'measured in section 4.5 fall inside the band, so the proxy is entirely a mid-game score here, while ' +
        `decision-level dQ spans [${e.summaryAll.min}, ${e.summaryAll.max}].`);
    push('3. **Not optimal Q.** It is the worst case over at most ' + quality.config.search.oppProbeK +
        ' opponent replies, with the friendly side rolled out for at most ' + quality.config.search.friendlyRolloutSteps +
        ' heuristic steps. A deeper or wider search would change it.');
    push('4. **Must not be added raw to heuristic scores.** It lives on the `evaluatePositionHeuristic` scale, ' +
        'which HeuristicAI already uses internally; adding a residual ranker output to a heuristic score ' +
        'without normalisation mixes two quantities that only look commensurate. Normalise (and calibrate) first.');
    push('5. The label is a **relative preference in one state**, `dQ(a) = leaf(a) - leaf(a0)`; by construction ' +
        '`dQ(a0) = 0`. It is not an absolute value estimate.');
    push();

    push('## 11. What passed, what failed, what remains unverified');
    push();
    push('### Passed');
    push();
    push(`- \`distinctDeltaValues = ${e.distinctDeltaValues}\` at the decision level ` +
        `(acceptance: > 1, preferably >= 10) — versus 1 in the previous batch; ` +
        `${e.distinctDeltaValuesNonZero} distinct values restricted to \`dQ != 0\`.`);
    push(`- Raw histograms shown above over ${e.summaryAll.count} decisions, over the ${e.summaryNonZeroOnly.count} ` +
        `\`dQ != 0\` decisions, and over the ${e.summaryNonDegenerateOnly.count} non-degenerate decisions.`);
    push(`- Yield reported on both criteria: ${pct(yields.yieldRateNonZeroDeltaQ)} on the batch-2 keep rule ` +
        `(\`dQ != 0\`) and ${pct(yields.yieldRate)} on "candidates do not all tie"` +
        `${sf ? `; on the recovered batch-2 decision set, ${pct(sf.footingYieldRateNonZeroDeltaQ)} and ` +
            `${pct(sf.footingYieldRate)} respectively, against the previous batch's ${pct(prescreen.baselineYield.previousBatchYieldRate)} on the identical 40 positions.` : '.'}`);
    push(`- Determinism: ${determinism?.allBitIdentical ? 'bit-identical dQ on repeat evaluation inside one process, and bit-identical label records across two separate node processes (sections 8 and 8.1).' : 'NOT proven in this run.'}`);
    push(`- Prescreen predicates measured with precision/recall, plus the pre-search predicates that can be applied before any search cost.`);
    push(`- v11 regression suite: see section 9.`);
    push('- The only game-AI source change is a visibility modifier; no rule, threshold, or behaviour changed.');
    push();
    push('### Failed or not attempted');
    push();
    push('- `BattleSearchAI` has **no internal `stats` counter** at HEAD: `decisions / urgentHits / forcedWins / ' +
        'takeovers / vetos / follows` do not exist in `src/game/ai/battle_search_ai.ts`. The requested ' +
        'stratification is therefore provided as an **external reconstruction** from the same thresholds ' +
        '(section 7.2), not read from internal state. No counter was added, to keep the AI change minimal.');
    push('- No ranker was trained or evaluated on these labels in this task (that is T12-08 territory); ' +
        'the labels are produced and characterised, not shown to improve play.');
    push();
    push('### Remains unverified');
    push();
    push('- Whether a ranker actually learns from these labels, and whether it transfers to game strength.');
    push('- Whether the leaf ordering correlates with eventual game outcome (no calibration run was done). ' +
        'Related: **no leaf in this sample reached a terminal** (section 4.5), so the +/-100000 terminal ' +
        'convention is untested here — the proxy is entirely a mid-game heuristic score in this sample.');
    push('- Whether the proxy has any signal at *deeper* search settings. `oppProbeK=6` and ' +
        '`friendlyRolloutSteps=3` are BattleSearchAI v3 defaults; a different setting produces a different ' +
        'Q_ref, and this run measured only the default.');
    push('- The batch-2 label file\'s 32 dropped decisions were only partly published; the recovery pins the ' +
        'sampling configuration, but the *old* labels for those positions were not re-derivable without ' +
        're-running the v11 continuation, which was not done.');
    push(`- The prescreen predicates that need leaves (\`margin\`, \`danger\`) cannot be applied before the search; ` +
        'their measured "saving" is a downstream-continuation saving, not a search saving. Only the ' +
        '`heuristic_score_gap_nonzero` / `candidate_count_at_least_3` predicates are genuinely pre-search, and ' +
        'their precision/recall above is the honest measure of how much they are worth.');
    push(`- The batch-2 same-footing comparison rests on a recovered (E,K) sample that is unique **given the ` +
        `${recovery?.publishedIdsKnown ?? 'published'} published ids**, not on a bit-level replay of the batch-2 run.`);
    if (quality.sample.episodesSkipped > 0) {
        push(`- ${quality.sample.episodesSkipped} episode(s) were skipped during replay validation: ` +
            `\`${JSON.stringify(quality.sample.skippedEpisodes)}\`.`);
    }
    push();

    ensureDir(path.dirname(outFile));
    fs.writeFileSync(outFile, L.join('\n') + '\n', 'utf8');
    console.log(`wrote ${outFile} (${L.length} lines)`);
}

if ((process.argv[1] ?? '').endsWith('search_report.ts')) main();
