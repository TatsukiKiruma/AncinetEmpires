/**
 * Upgraded report consistency verifier (Task B).
 *
 * Verifies that every number quoted in a closure report is machine-identical to the value
 * re-derived from the authoritative benchmark JSON, using the canonical `computePercentile`
 * (interpolating) and `computeWilsonScoreInterval` helpers.
 *
 * The verifier is deliberately runnable against a *legacy* report directory. Pointed at
 * `agent_upgrade_20260921_v8_closure_01` it must report the S00 / S10 contradictions that the
 * historical narrative contains; pointed at `agent_upgrade_20260921_v8_closure_02` it must pass.
 * That negative/positive pair is asserted by tools/v8_report_consistency.test.ts.
 */

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    HARD_BOT_NEGATION_PATTERN,
    HARD_BOT_PATTERN,
    LEGACY_EXEMPT_JSON_KEYS,
    LEGACY_S00_S10_DENYLIST,
    extractMachineFactsBlock,
    recomputeBenchmarkFacts,
    renderDaggerRound2Section,
    renderPolicyLatencyRows,
    renderPolicyOutcomeRows,
    renderPolicyVerdictRows,
    resolveRepoPath,
    sha256OfFile,
    sha256OfTextArtifact,
    splitLegacyExemptRegions,
    type ClosureFacts
} from './v8_closure_facts';

export interface VerifyOptions {
    repoRoot: string;
    reportRunId: string;
    sourceRunId: string;
    benchmarkPath?: string;
    reportDir?: string;
    /** When true, require the closure_02 artefact set (facts file, table rows, embedded facts block). */
    requireGeneratedArtifacts?: boolean;
}

export interface VerificationResult {
    success: boolean;
    errors: string[];
    warnings: string[];
    metrics: Record<string, unknown>;
    facts: ClosureFacts | null;
}

const TOLERANCE = 0.051;

const POLICY_TOKENS: ReadonlyArray<{ policy: string; pattern: RegExp }> = [
    { policy: 'S00_SEARCH', pattern: /\bS00(?:_SEARCH)?\b/i },
    { policy: 'S10_SPATIAL_SEARCH', pattern: /\bS10(?:_SPATIAL_SEARCH)?\b/i },
    { policy: 'SPATIAL_DAGGER', pattern: /\bSPATIAL_DAGGER\b/i },
    { policy: 'SPATIAL_V2', pattern: /\bSPATIAL_V2\b/i },
    { policy: 'NET_A', pattern: /\bNET_A\b/i },
    { policy: 'HEURISTIC', pattern: /\bHEURISTIC\b/i }
];

function policiesReferenced(text: string): string[] {
    const found: string[] = [];
    for (const token of POLICY_TOKENS) {
        if (token.pattern.test(text)) found.push(token.policy);
    }
    return found;
}

function approxEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < TOLERANCE;
}

interface TextClaimScannerState {
    currentPolicy: string | null;
}

/**
 * Scan one text line for policy claims and compare them against the machine facts.
 * `currentPolicy` carries the section context so that a bullet list following a policy
 * heading is still attributed to that policy (this is exactly how the legacy S00/S10
 * statements are laid out).
 */
function scanLineForClaims(
    line: string,
    state: TextClaimScannerState,
    factsByPolicy: Map<string, ClosureFacts['policies'][number]>,
    location: string
): { errors: string[]; referenced: string[] } {
    const errors: string[] = [];
    const referenced = policiesReferenced(line);

    if (/^\s{0,3}#{1,6}\s/.test(line) || /^\s*-{3,}\s*$/.test(line)) {
        // Heading / horizontal rule: start a fresh context.
        state.currentPolicy = referenced.length === 1 ? referenced[0] : null;
        return { errors, referenced };
    }
    if (referenced.length === 1) {
        state.currentPolicy = referenced[0];
    } else if (referenced.length > 1) {
        // Ambiguous attribution: skip rather than guess.
        return { errors, referenced };
    }

    const policy = state.currentPolicy;
    if (!policy) return { errors, referenced };
    const facts = factsByPolicy.get(policy);
    if (!facts) return { errors, referenced };

    // --- W-L-T records ---
    const wlt = /(\d+)\s*W\s*-\s*(\d+)\s*L\s*-\s*(\d+)\s*T/i.exec(line);
    if (wlt) {
        const [, w, l, t] = wlt;
        if (
            Number(w) !== facts.naturalWins ||
            Number(l) !== facts.naturalLosses ||
            Number(t) !== facts.truncations
        ) {
            errors.push(
                `claim mismatch at ${location}: ${policy} W-L-T claim ${w}W-${l}L-${t}T but benchmark facts are ` +
                `${facts.naturalWins}W-${facts.naturalLosses}L-${facts.truncations}T (${facts.winLossTruncation})`
            );
        }
    }

    const wld = /(\d+)\s+wins?\s*,\s*(\d+)\s+losses?\s*,\s*(\d+)\s+draws?/i.exec(line);
    if (wld) {
        const [, w, l, d] = wld;
        if (
            Number(w) !== facts.naturalWins ||
            Number(l) !== facts.naturalLosses ||
            Number(d) !== facts.naturalDraws
        ) {
            errors.push(
                `claim mismatch at ${location}: ${policy} claims ${w} wins / ${l} losses / ${d} draws but benchmark ` +
                `facts are ${facts.naturalWins} wins / ${facts.naturalLosses} losses / ${facts.naturalDraws} draws`
            );
        }
    }

    // --- keyword clauses: natural win rate / effective win rate / Wilson CI ---
    const keywords: Array<{ name: 'natural' | 'effective' | 'wilson'; index: number; length: number }> = [];
    const naturalMatch = /natural\s+win\s+rate/i.exec(line);
    if (naturalMatch) keywords.push({ name: 'natural', index: naturalMatch.index, length: naturalMatch[0].length });
    const effectiveMatch = /effective\s+win\s+rate/i.exec(line);
    if (effectiveMatch) keywords.push({ name: 'effective', index: effectiveMatch.index, length: effectiveMatch[0].length });
    const wilsonMatch = /wilson/i.exec(line);
    if (wilsonMatch) keywords.push({ name: 'wilson', index: wilsonMatch.index, length: wilsonMatch[0].length });
    keywords.sort((a, b) => a.index - b.index);

    for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        const clauseEnd = i + 1 < keywords.length ? keywords[i + 1].index : line.length;
        const clause = line.slice(kw.index + kw.length, clauseEnd);

        if (kw.name === 'wilson') {
            const bracket = /\[\s*(\d+(?:\.\d+)?)\s*\\?%\s*,\s*(\d+(?:\.\d+)?)\s*\\?%\s*\]/.exec(clause);
            if (bracket) {
                const lo = Number(bracket[1]);
                const hi = Number(bracket[2]);
                if (
                    !approxEqual(lo, facts.confidenceInterval95Natural[0]) ||
                    !approxEqual(hi, facts.confidenceInterval95Natural[1])
                ) {
                    errors.push(
                        `claim mismatch at ${location}: ${policy} Wilson CI claim [${lo}%, ${hi}%] but benchmark facts are ` +
                        `[${facts.confidenceInterval95Natural[0]}%, ${facts.confidenceInterval95Natural[1]}%]`
                    );
                }
            }
            continue;
        }

        const pct = /(\d+(?:\.\d+)?)\s*\\?%/.exec(clause);
        if (!pct) continue;
        const value = Number(pct[1]);
        const expected = kw.name === 'natural' ? facts.winRateNaturalOnlyPct : facts.effectiveWinRatePct;
        if (!approxEqual(value, expected)) {
            errors.push(
                `claim mismatch at ${location}: ${policy} ${kw.name} win rate claim ${value}% but benchmark facts are ${expected}%`
            );
        }
    }

    return { errors, referenced };
}

function scanTextForClaims(
    text: string,
    factsByPolicy: Map<string, ClosureFacts['policies'][number]>,
    location: string
): string[] {
    const { scannable } = splitLegacyExemptRegions(text);
    const errors: string[] = [];
    const state: TextClaimScannerState = { currentPolicy: null };
    const lines = scannable.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        errors.push(...scanLineForClaims(lines[i], state, factsByPolicy, `${location}:${i + 1}`).errors);
    }
    return errors;
}

/** Walk every string leaf of a JSON document, skipping explicitly historicising keys. */
function collectJsonStrings(value: unknown, keyPath: string, out: Array<{ keyPath: string; text: string }>): void {
    if (typeof value === 'string') {
        out.push({ keyPath, text: value });
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, idx) => collectJsonStrings(item, `${keyPath}[${idx}]`, out));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            if (LEGACY_EXEMPT_JSON_KEYS.has(key)) continue;
            const childPath = keyPath ? `${keyPath}.${key}` : key;
            // Key names themselves carry policy hints (e.g. `s00HardBotStatus`).
            if (typeof child === 'string') {
                out.push({ keyPath: childPath, text: `${key}: ${child}` });
            } else {
                collectJsonStrings(child, childPath, out);
            }
        }
    }
}

function checkDenylist(text: string, location: string): string[] {
    const { scannable } = splitLegacyExemptRegions(text);
    const errors: string[] = [];
    for (const entry of LEGACY_S00_S10_DENYLIST) {
        const match = entry.pattern.exec(scannable);
        if (match) {
            errors.push(
                `legacy claim denylist violation at ${location}: found ${entry.description} ("${match[0]}") in a current-conclusion region`
            );
        }
    }
    return errors;
}

function checkHardBotLabelling(text: string, location: string): string[] {
    const { scannable } = splitLegacyExemptRegions(text);
    const errors: string[] = [];
    const lines = scannable.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const pattern = new RegExp(HARD_BOT_PATTERN.source, 'gi');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            // A mention is acceptable only when it is negated or historicised right before it.
            const windowStart = Math.max(0, match.index - 40);
            const preceding = line.slice(windowStart, match.index);
            if (HARD_BOT_NEGATION_PATTERN.test(preceding)) continue;
            errors.push(
                `Hard Bot labelling violation at ${location}:${i + 1}: S00_SEARCH must not be labelled a Hard Bot ` +
                `("...${line.slice(windowStart, Math.min(line.length, match.index + 20)).trim()}...")`
            );
        }
    }
    return errors;
}

// ---------------------------------------------------------------------------
// Main verification
// ---------------------------------------------------------------------------

export function verifyReportConsistency(options: VerifyOptions): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics: Record<string, unknown> = {};

    const reportRunId = options.reportRunId;
    const sourceRunId = options.sourceRunId;
    const benchmarkPath = options.benchmarkPath
        ?? path.join(options.repoRoot, 'docs/training/reports', sourceRunId, 'v8_clean_benchmark.json');
    const reportDir = options.reportDir
        ?? path.join(options.repoRoot, 'docs/training/reports', reportRunId);

    // ---- 1. authoritative facts from the benchmark JSON ----
    if (!existsSync(benchmarkPath)) {
        return {
            success: false,
            errors: [`Missing source benchmark: ${benchmarkPath}`],
            warnings,
            metrics,
            facts: null
        };
    }
    const benchmarkRaw = readFileSync(benchmarkPath, 'utf8');
    const benchmark = JSON.parse(benchmarkRaw);
    metrics.benchmarkPath = benchmarkPath;
    metrics.benchmarkSha256 = sha256OfTextArtifact(benchmarkPath);

    let recomputed: ReturnType<typeof recomputeBenchmarkFacts>;
    try {
        recomputed = recomputeBenchmarkFacts(benchmark);
    } catch (e: any) {
        return {
            success: false,
            errors: [`Benchmark aggregates failed self-consistency: ${String(e?.message ?? e)}`],
            warnings,
            metrics,
            facts: null
        };
    }
    const factsByPolicy = new Map(recomputed.policies.map(p => [p.policy, p]));
    metrics.policyCount = recomputed.policies.length;
    metrics.totalDecisions = recomputed.totalDecisions;
    metrics.winLossTruncation = Object.fromEntries(
        recomputed.policies.map(p => [p.policy, p.winLossTruncation])
    );

    if (benchmark.runId !== sourceRunId) {
        warnings.push(
            `Benchmark runId "${benchmark.runId}" differs from the configured source run id "${sourceRunId}".`
        );
    }

    // ---- 2. generated artefact set ----
    const factsPath = path.join(reportDir, 'v8_closure_facts.json');
    const taskStatusPath = path.join(reportDir, 'task-status.json');
    const auditPath = path.join(reportDir, 'v8_closure_audit_report.md');

    let facts: ClosureFacts | null = null;
    if (!existsSync(factsPath)) {
        errors.push(
            `Missing machine fact file ${factsPath}: a closure_02 report must ship v8_closure_facts.json generated by tools/v8_closure_report.ts.`
        );
    } else {
        facts = JSON.parse(readFileSync(factsPath, 'utf8'));
    }

    const taskStatusText = existsSync(taskStatusPath) ? readFileSync(taskStatusPath, 'utf8') : null;
    const auditText = existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : null;
    if (taskStatusText === null) errors.push(`Missing task-status.json at ${taskStatusPath}`);
    if (auditText === null) errors.push(`Missing audit report at ${auditPath}`);

    // ---- 3. fact file must agree with the recomputation ----
    if (facts) {
        if (facts.sourceBenchmark?.sha256 !== metrics.benchmarkSha256) {
            errors.push(
                `v8_closure_facts.json records source benchmark SHA ${facts.sourceBenchmark?.sha256} but the file on disk hashes to ${metrics.benchmarkSha256}`
            );
        }
        if (facts.policies.length !== recomputed.policies.length) {
            errors.push(
                `v8_closure_facts.json lists ${facts.policies.length} policies but the benchmark recomputation yields ${recomputed.policies.length}`
            );
        }
        for (const expected of recomputed.policies) {
            const actual = facts.policies.find(p => p.policy === expected.policy);
            if (!actual) {
                errors.push(`v8_closure_facts.json is missing policy ${expected.policy}`);
                continue;
            }
            for (const key of [
                'matchesPlayed',
                'naturalWins',
                'naturalLosses',
                'naturalDraws',
                'truncations',
                'winLossTruncation',
                'truncationRatePct',
                'winRateNaturalOnlyPct',
                'effectiveWinRatePct',
                'decisionCount',
                'latencyP50',
                'latencyP95',
                'latencyP99',
                'latencyMax',
                'latenciesOver1000ms',
                'deadlineFallbackCount',
                'deadlineFallbackRatePct',
                'wallClockExceededMatches'
            ] as const) {
                if ((actual as any)[key] !== (expected as any)[key]) {
                    errors.push(
                        `fact mismatch for ${expected.policy}.${key}: report says ${JSON.stringify((actual as any)[key])} but benchmark recomputation gives ${JSON.stringify((expected as any)[key])}`
                    );
                }
            }
            for (const key of ['confidenceInterval95Natural', 'confidenceInterval95Effective'] as const) {
                if (JSON.stringify((actual as any)[key]) !== JSON.stringify((expected as any)[key])) {
                    errors.push(
                        `fact mismatch for ${expected.policy}.${key}: report says ${JSON.stringify((actual as any)[key])} but benchmark recomputation gives ${JSON.stringify((expected as any)[key])}`
                    );
                }
            }
        }
    }

    // ---- 4. audit markdown: embedded facts + canonical table rows ----
    if (auditText !== null && facts) {
        const embedded = extractMachineFactsBlock(auditText);
        if (!embedded) {
            errors.push(
                'v8_closure_audit_report.md does not contain a parsable MACHINE_FACTS block; the report cannot be machine verified.'
            );
        } else {
            for (const expected of recomputed.policies) {
                const embeddedPolicy = (embedded.policies ?? []).find((p: any) => p.policy === expected.policy);
                if (!embeddedPolicy) {
                    errors.push(`embedded machine facts block is missing policy ${expected.policy}`);
                    continue;
                }
                for (const key of [
                    'matchesPlayed',
                    'naturalWins',
                    'naturalLosses',
                    'naturalDraws',
                    'truncations',
                    'truncationRatePct',
                    'winRateNaturalOnlyPct',
                    'effectiveWinRatePct',
                    'decisionCount',
                    'latencyP50',
                    'latencyP95',
                    'latencyP99',
                    'latencyMax',
                    'deadlineFallbackCount',
                    'wallClockExceededMatches'
                ] as const) {
                    if (embeddedPolicy[key] !== (expected as any)[key]) {
                        errors.push(
                            `audit markdown embedded facts disagree with the benchmark for ${expected.policy}.${key}: ` +
                            `${JSON.stringify(embeddedPolicy[key])} vs ${JSON.stringify((expected as any)[key])}`
                        );
                    }
                }
                if (
                    JSON.stringify(embeddedPolicy.confidenceInterval95Natural) !==
                    JSON.stringify(expected.confidenceInterval95Natural)
                ) {
                    errors.push(
                        `audit markdown embedded CI disagrees with the benchmark for ${expected.policy}: ` +
                        `${JSON.stringify(embeddedPolicy.confidenceInterval95Natural)} vs ${JSON.stringify(expected.confidenceInterval95Natural)}`
                    );
                }
            }
        }

        // Canonical markdown tables must be byte-identical to the rows rendered from the facts.
        const expectedRows = [
            ...renderPolicyOutcomeRows(facts),
            ...renderPolicyLatencyRows(facts),
            ...renderPolicyVerdictRows(facts)
        ];
        for (const row of expectedRows) {
            if (!auditText.includes(row)) {
                errors.push(
                    `audit markdown does not contain the machine-rendered table row: ${row.slice(0, 160)}...`
                );
            }
        }

        // The R8-07 round 2 section must be the machine-rendered one (or the explicit BLOCKED form).
        const dossierSection = renderDaggerRound2Section(facts);
        if (!auditText.includes(dossierSection)) {
            errors.push(
                'audit markdown does not contain the machine-rendered R8-07 round 2 DAgger section; ' +
                'the DAgger evidence must be generated from dagger_round2_summary.json.'
            );
        }
        if (facts.daggerRound2) {
            if (!facts.daggerRound2.distinctCheckpointShas) {
                errors.push('R8-07 round 2 evidence claims identical base and DAgger checkpoint SHAs.');
            }
            if (!(facts.daggerRound2.daggerDatasetRows > facts.daggerRound2.baseDatasetRowsRead)) {
                errors.push('R8-07 round 2 DAgger buffer is not larger than the base dataset.');
            }
            if (!existsSync(resolveRepoPath(options.repoRoot, facts.daggerRound2.pairedReportPath))) {
                errors.push(`R8-07 round 2 paired pre/post report is missing: ${facts.daggerRound2.pairedReportPath}`);
            }
        }
    } else if (auditText !== null) {
        errors.push('audit markdown present but the machine fact file is missing, so table rows cannot be verified.');
    }

    // ---- 5. task-status.json: machine claims + taxonomy ----
    if (taskStatusText !== null) {
        let taskStatus: any = null;
        try {
            taskStatus = JSON.parse(taskStatusText);
        } catch (e: any) {
            errors.push(`task-status.json is not valid JSON: ${String(e?.message ?? e)}`);
        }
        if (taskStatus) {
            const validStatuses = new Set(['IMPLEMENTED', 'TESTED', 'MEASURED', 'QUALIFIED', 'BLOCKED/NOT_RUN']);
            const checkTaskStatuses = (node: any, keyPath: string) => {
                if (!node || typeof node !== 'object') return;
                for (const [key, value] of Object.entries<any>(node)) {
                    if (value && typeof value === 'object' && typeof value.status === 'string') {
                        if (!validStatuses.has(value.status)) {
                            errors.push(
                                `task ${keyPath}${key} has invalid status "${value.status}"; must be one of ${[...validStatuses].join(', ')}`
                            );
                        }
                    }
                    if (value && typeof value === 'object' && key !== 'statusTaxonomy') {
                        checkTaskStatuses(value, `${keyPath}${key}.`);
                    }
                }
            };
            checkTaskStatuses(taskStatus.tasks ?? {}, '');

            if (!taskStatus.policyClaims) {
                errors.push(
                    'task-status.json has no machine readable `policyClaims` block, so its per-policy numbers cannot be verified.'
                );
            } else if (facts) {
                for (const expected of recomputed.policies) {
                    const claim = taskStatus.policyClaims[expected.policy];
                    if (!claim) {
                        errors.push(`task-status.json policyClaims is missing ${expected.policy}`);
                        continue;
                    }
                    const pairs: Array<[string, unknown, unknown]> = [
                        ['naturalWins', claim.naturalWins, expected.naturalWins],
                        ['naturalLosses', claim.naturalLosses, expected.naturalLosses],
                        ['naturalDraws', claim.naturalDraws, expected.naturalDraws],
                        ['truncations', claim.truncations, expected.truncations],
                        ['winLossTruncation', claim.winLossTruncation, expected.winLossTruncation],
                        ['truncationRatePct', claim.truncationRatePct, expected.truncationRatePct],
                        ['winRateNaturalOnlyPct', claim.winRateNaturalOnlyPct, expected.winRateNaturalOnlyPct],
                        ['effectiveWinRatePct', claim.effectiveWinRatePct, expected.effectiveWinRatePct],
                        ['latencyP99', claim.latencyP99, expected.latencyP99],
                        ['latencyMax', claim.latencyMax, expected.latencyMax],
                        ['latenciesOver1000ms', claim.latenciesOver1000ms, expected.latenciesOver1000ms],
                        ['deadlineFallbackCount', claim.deadlineFallbackCount, expected.deadlineFallbackCount],
                        ['wallClockExceededMatches', claim.wallClockExceededMatches, expected.wallClockExceededMatches],
                        [
                            'confidenceInterval95Natural',
                            JSON.stringify(claim.confidenceInterval95Natural),
                            JSON.stringify(expected.confidenceInterval95Natural)
                        ]
                    ];
                    for (const [key, actual, wanted] of pairs) {
                        if (actual !== wanted) {
                            errors.push(
                                `task-status.json claim mismatch for ${expected.policy}.${key}: ${JSON.stringify(actual)} vs benchmark ${JSON.stringify(wanted)}`
                            );
                        }
                    }
                }
            }
        }

        // Free-text scan of every non-exempt string leaf.
        const leaves: Array<{ keyPath: string; text: string }> = [];
        try {
            collectJsonStrings(JSON.parse(taskStatusText), '', leaves);
        } catch {
            /* already reported above */
        }
        for (const leaf of leaves) {
            errors.push(...scanTextForClaims(leaf.text, factsByPolicy, `task-status.json:${leaf.keyPath}`));
        }
        errors.push(...checkDenylist(taskStatusText, 'task-status.json'));
        errors.push(...checkHardBotLabelling(taskStatusText, 'task-status.json'));
    }

    // ---- 6. audit markdown free-text scan + denylist ----
    if (auditText !== null) {
        errors.push(...scanTextForClaims(auditText, factsByPolicy, 'v8_closure_audit_report.md'));
        errors.push(...checkDenylist(auditText, 'v8_closure_audit_report.md'));
        errors.push(...checkHardBotLabelling(auditText, 'v8_closure_audit_report.md'));
    }

    // ---- 7. runtime fallback gate (when the closure_02 re-measurement exists) ----
    const runtimeAnalysisPath = path.join(reportDir, 'runtime_fallback_analysis.json');
    if (existsSync(runtimeAnalysisPath) && facts?.runtimeFallback) {
        const analysis = JSON.parse(readFileSync(runtimeAnalysisPath, 'utf8'));
        metrics.runtimeFallbackGatePassed = analysis.overall?.passed;
        for (const policy of analysis.policies ?? []) {
            if (!policy.candidateSearchApplicable) continue;
            const failures: string[] = policy.gate?.failures ?? [];
            const hardRate = policy.hardFallbackRatePct;
            if (hardRate !== undefined && hardRate >= 10) {
                errors.push(
                    `runtime fallback gate failed for ${policy.policy}: ${policy.hardFallbackDecisions}/${policy.totalCandidateDecisions} (${hardRate}%) >= 10%`
                );
            } else if (failures.length > 0) {
                errors.push(`runtime fallback gate failed for ${policy.policy}: ${failures.join('; ')}`);
            }
        }
    } else {
        warnings.push('No runtime_fallback_analysis.json found; the runtime fallback gate was not verified.');
    }

    // ---- 8. artifact hashes for the record ----
    metrics.artifacts = {
        facts: existsSync(factsPath) ? sha256OfFile(factsPath) : null,
        taskStatus: existsSync(taskStatusPath) ? sha256OfFile(taskStatusPath) : null,
        auditReport: existsSync(auditPath) ? sha256OfFile(auditPath) : null
    };

    return {
        success: errors.length === 0,
        errors,
        warnings,
        metrics,
        facts
    };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
    const argv = process.argv;
    const readFlag = (name: string): string | undefined => {
        const idx = argv.indexOf(name);
        return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
    };
    const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../..');
    const reportRunId = readFlag('--report-run-id') ?? 'agent_upgrade_20260921_v8_closure_02';
    const sourceRunId = readFlag('--source-run-id') ?? 'agent_upgrade_20260921_v8_closure_01';

    console.log(`Verifying report consistency: report=${reportRunId} source=${sourceRunId}`);
    const res = verifyReportConsistency({
        repoRoot,
        reportRunId,
        sourceRunId,
        benchmarkPath: readFlag('--benchmark'),
        reportDir: readFlag('--report-dir')
    });

    console.log('Metrics:', JSON.stringify(res.metrics, null, 2));
    if (res.warnings.length > 0) {
        console.warn('Warnings:');
        res.warnings.forEach(w => console.warn(`  [WARN] ${w}`));
    }
    if (!res.success) {
        console.error(`Errors (${res.errors.length}):`);
        res.errors.forEach(e => console.error(`  [ERROR] ${e}`));
        process.exit(1);
    }
    console.log('Verification passed with 0 errors.');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main();
}
