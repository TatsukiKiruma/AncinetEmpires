/**
 * Complete the per-match identity record (S8-2).
 *
 * The v8_run_reeval_02 driver did not populate `directories.provenance`, so `MatchOutcome.provenance`
 * came back undefined for played matches even though the suite supports it and the NOT_RUN path did
 * record it. Rather than pretending that did not happen, this script completes the already-persisted
 * records with the exact provenance of the run (a pure metadata addition: no measured field is
 * touched, and the outcome count and every game result are asserted unchanged).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectMatchProvenance } from './v7_unified_evaluation';

const RUN = path.resolve('training_runs/agent_upgrade_20260922_v8_reeval_02');
const REPORT = path.resolve('docs/training/reports/agent_upgrade_20260922_v8_reeval_02');

// Provenance of the tree the benchmark actually ran against, as logged by the driver at start-up.
const benchmarkRunProvenance = {
    codeCommit: '28f0b847a0ac0147cdb8e096ac7ad9c132e85cb4',
    workspaceDirty: true,
    dirtyPatchHash: 'e13280187bc1b513362af60be44b8fbf08c14b0403de92531ae885dec70cc764',
    node: 'v22.18.0',
    platform: 'win32'
};

const current = collectMatchProvenance();
if (current.codeCommit !== benchmarkRunProvenance.codeCommit) {
    throw new Error(
        `Refusing to stamp provenance: HEAD is ${current.codeCommit}, but the benchmark ran at ${benchmarkRunProvenance.codeCommit}`
    );
}

const stamp = (file: string, label: string): void => {
    const before = JSON.parse(readFileSync(file, 'utf8'));
    const outcomes = before.outcomes;
    if (!Array.isArray(outcomes)) throw new Error(`${file}: no outcomes array`);
    const countBefore = outcomes.length;
    const resultFingerprintBefore = JSON.stringify(
        outcomes.map((o: { matchId: string; terminationReason: string; steps: number }) => [o.matchId, o.terminationReason, o.steps])
    );

    for (const o of outcomes) {
        o.provenance = benchmarkRunProvenance;
    }
    if (!before.provenance) before.provenance = benchmarkRunProvenance;
    if (!before.protocol) throw new Error(`${file}: protocol missing; refusing to guess it`);

    writeFileSync(file, JSON.stringify(before, null, 2), 'utf8');

    const after = JSON.parse(readFileSync(file, 'utf8'));
    const resultFingerprintAfter = JSON.stringify(
        after.outcomes.map((o: { matchId: string; terminationReason: string; steps: number }) => [o.matchId, o.terminationReason, o.steps])
    );
    if (after.outcomes.length !== countBefore || resultFingerprintAfter !== resultFingerprintBefore) {
        throw new Error(`${file}: measured results changed while stamping provenance - aborting`);
    }
    console.log(`  ${label}: stamped ${after.outcomes.length} outcomes; results verified unchanged`);
};

stamp(path.join(RUN, 'main/comparison.json'), 'main');
stamp(path.join(RUN, 'pilot/comparison.json'), 'pilot');
stamp(path.join(RUN, 'deterministic_node_budget/comparison.json'), 'deterministic_node_budget');
stamp(path.join(RUN, 'deterministic_node_budget_repeat/comparison.json'), 'deterministic_node_budget_repeat');

// Mirror the two reviewed reports again.
writeFileSync(path.join(REPORT, 'comparison.json'), readFileSync(path.join(RUN, 'main/comparison.json')));
writeFileSync(path.join(REPORT, 'pilot_comparison.json'), readFileSync(path.join(RUN, 'pilot/comparison.json')));

console.log('provenance stamping complete');
console.log('current tree hash for the record:', current.dirtyPatchHash);
