/**
 * V11 T11-00: freeze evidence and publish the issue ledger.
 *
 * Deliverables under v11/out/: source_snapshot.json, issue_ledger.json,
 * regression_cases.json, evidence_manifest.json.
 *
 * Read-only with respect to the repository: it records hashes and evidence
 * status, and never rewrites a v10 artifact.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    F01_DERIVED_ARTIFACTS, FROZEN_SOURCE_FILES, OUT_DIR, REVIEW_COMMIT, V11_ROOT,
    ensureDir, relPosix, sha256File, writeJson,
} from './common';
import { V10_EVIDENCE_CLASSIFICATION, V11_ISSUES } from './evidence';

/**
 * Minimal git facts, read directly from `.git` instead of shelling out:
 * spawning `git` is denied in the confined execution environment.
 */
function readGitFacts(): { head: string | null; branch: string | null } {
    const gitDir = path.resolve('.git');
    try {
        const headRaw = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
        if (!headRaw.startsWith('ref:')) return { head: headRaw, branch: null };
        const ref = headRaw.slice(4).trim();
        const branch = ref.replace(/^refs\/heads\//, '');
        const looseRef = path.join(gitDir, ref);
        if (fs.existsSync(looseRef)) return { head: fs.readFileSync(looseRef, 'utf8').trim(), branch };
        const packed = path.join(gitDir, 'packed-refs');
        if (fs.existsSync(packed)) {
            for (const line of fs.readFileSync(packed, 'utf8').split('\n')) {
                if (line.startsWith('#') || !line.trim()) continue;
                const [sha, name] = line.trim().split(' ');
                if (name === ref) return { head: sha, branch };
            }
        }
        return { head: null, branch };
    } catch {
        return { head: null, branch: null };
    }
}

export interface SourceSnapshotFile {
    path: string;
    exists: boolean;
    sha256: string | null;
    bytes: number | null;
}

export interface SourceSnapshot {
    schema: 'v11_source_snapshot_1';
    generatedAt: string;
    reviewCommit: string;
    workingTreeHead: string | null;
    branch: string | null;
    headMatchesReviewCommit: boolean;
    files: SourceSnapshotFile[];
    referencedArtifacts: SourceSnapshotFile[];
    invalidatedArtifacts: Array<{ path: string; sha256: string | null; status: string }>;
    notes: string[];
}

export function buildSourceSnapshot(): SourceSnapshot {
    const { head: workingTreeHead, branch } = readGitFacts();
    const notes: string[] = [];

    const files: SourceSnapshotFile[] = FROZEN_SOURCE_FILES.map(p => ({
        path: p,
        exists: fs.existsSync(p),
        sha256: sha256File(p),
        bytes: fs.existsSync(p) ? fs.statSync(p).size : null,
    }));

    const referenced = new Set<string>([
        'v10/V10_TASK_COMPLETION_REPORT.md',
        'v10/fix_01/TASKS_1_5_RESULTS.md',
        'v10/fix_01/dagger_controlled_report.json',
        'v10/fix_01/dataset_v10_manifest.json',
        'v10/fix_01/split_v10.json',
        'v10/fix_01/episodes.jsonl',
        ...F01_DERIVED_ARTIFACTS,
    ]);
    const referencedArtifacts: SourceSnapshotFile[] = Array.from(referenced).map(p => ({
        path: p,
        exists: fs.existsSync(p),
        sha256: sha256File(p),
        bytes: fs.existsSync(p) ? fs.statSync(p).size : null,
    }));

    const invalidatedArtifacts = F01_DERIVED_ARTIFACTS.map(p => ({
        path: p,
        sha256: sha256File(p),
        status: 'INVALID_INPUT_ALIGNMENT_PENDING_REBUILD',
    }));

    const missingFrozen = files.filter(f => !f.exists).map(f => f.path);
    notes.push('Read-only freeze: no repository file was modified to produce this snapshot.');
    notes.push('HEAD and branch are read directly from .git (loose ref, then packed-refs); spawning git is denied here.');
    if (missingFrozen.length > 0) notes.push(`Frozen sources missing at freeze time: ${missingFrozen.join(', ')}`);

    return {
        schema: 'v11_source_snapshot_1',
        generatedAt: new Date().toISOString(),
        reviewCommit: REVIEW_COMMIT,
        workingTreeHead,
        branch,
        headMatchesReviewCommit: workingTreeHead === REVIEW_COMMIT,
        files,
        referencedArtifacts,
        invalidatedArtifacts,
        notes,
    };
}

export interface IssueLedger {
    schema: 'v11_issue_ledger_1';
    generatedAt: string;
    reviewCommit: string;
    issues: typeof V11_ISSUES;
    evidenceClassification: typeof V10_EVIDENCE_CLASSIFICATION;
    summary: Record<string, number>;
    invalidatedArtifactRule: string;
}

export function buildIssueLedger(): IssueLedger {
    return {
        schema: 'v11_issue_ledger_1',
        generatedAt: new Date().toISOString(),
        reviewCommit: REVIEW_COMMIT,
        issues: V11_ISSUES,
        evidenceClassification: V10_EVIDENCE_CLASSIFICATION,
        summary: {
            total: V11_ISSUES.length,
            confirmedFromSource: V11_ISSUES.filter(i => i.ownership === 'CONFIRMED_FROM_SOURCE').length,
            confirmedFromArtifactArithmetic: V11_ISSUES.filter(i => i.ownership === 'CONFIRMED_FROM_ARTIFACT_ARITHMETIC').length,
            riskNotQuantified: V11_ISSUES.filter(i => i.ownership === 'RISK_NOT_QUANTIFIED').length,
            p0: V11_ISSUES.filter(i => i.severity === 'P0' || i.severity === 'P0/P1').length,
            invalidatedArtifactCount: F01_DERIVED_ARTIFACTS.length,
            measuredNegativeResults: V10_EVIDENCE_CLASSIFICATION.filter(e => e.status === 'MEASURED_NEGATIVE_RESULT').length,
            insufficientSample: V10_EVIDENCE_CLASSIFICATION.filter(e => e.status === 'INSUFFICIENT_SAMPLE').length,
            notRun: V10_EVIDENCE_CLASSIFICATION.filter(e => e.status === 'NOT_RUN').length,
        },
        invalidatedArtifactRule:
            'Only artifacts whose *inputs* were produced by the F01 misalignment are marked ' +
            'INVALID_INPUT_ALIGNMENT_PENDING_REBUILD. Measured match results keep their status: they are real ' +
            'measurements, they are simply not attributable to the algorithm under test.',
    };
}

export interface RegressionCase {
    id: string;
    issue: string;
    task: string;
    contract: string;
    observedPreFix: string;
    test: string;
    status: 'FIXED' | 'OPEN';
}

export const REGRESSION_CASES: RegressionCase[] = [
    { id: 'RC-01', issue: 'F01', task: 'T11-00/01', contract: 'A sample turn/tensor/globals/candidate list all describe the state in which the action was taken.', observedPreFix: 'Every sample carried the opening board and turn 0.', test: 'tools/v11_regression_contract.test.ts > T11-01 / F01', status: 'FIXED' },
    { id: 'RC-02', issue: 'F01b', task: 'T11-00/01', contract: 'An episode that fails replay publishes zero samples.', observedPreFix: 'Prefix samples were pushed globally and kept after `continue`.', test: 'tools/v11_regression_contract.test.ts > a mid-episode illegal action publishes zero samples', status: 'FIXED' },
    { id: 'RC-03', issue: 'F02', task: 'T11-00/01', contract: 'Replay verifies per-step legality and the engine acceptance result.', observedPreFix: 'Only exceptions were caught; engine.step returns a failure string.', test: 'tools/v11_regression_contract.test.ts > T11-01 / F02', status: 'FIXED' },
    { id: 'RC-04', issue: 'F02b', task: 'T11-00/01', contract: 'A non-default setup is replayed only when its recorded hash proves the reconstruction.', observedPreFix: 'Replay always rebuilt the state with default settings.', test: 'tools/v11_regression_contract.test.ts > T11-01 / F02b', status: 'FIXED' },
    { id: 'RC-05', issue: 'F03', task: 'T11-00/02', contract: 'Every legal atomic action has a root candidate; baseline and immediate win always survive.', observedPreFix: 'Only end_turn and recruits were single-step candidates.', test: 'tools/v11_regression_contract.test.ts > T11-02 / F03', status: 'FIXED' },
    { id: 'RC-06', issue: 'F03b', task: 'T11-00/02', contract: 'A chained macro only ever acts with the unit that moved.', observedPreFix: 'Follow-ups came from the whole player legal set.', test: 'tools/v11_regression_contract.test.ts > T11-02 / F03b', status: 'FIXED' },
    { id: 'RC-07', issue: 'F04', task: 'T11-00/02', contract: 'Generation work is charged to the ledger; timeout fields are real; an exhausted budget returns a verified legal action.', observedPreFix: 'Generation was untracked, wallClockExceeded was literal false, fallback was the unscored first entry.', test: 'tools/v11_regression_contract.test.ts > T11-02 / F04', status: 'FIXED' },
    { id: 'RC-08', issue: 'F04/F06', task: 'T11-00/02', contract: 'The repository tactical fixtures run without crashing and report no failing fixture.', observedPreFix: 'runTacticalFixtures called searcher.search on an undefined parameter.', test: 'tools/v11_regression_contract.test.ts > survives the repository tactical fixtures', status: 'FIXED' },
    { id: 'RC-09', issue: 'F05', task: 'T11-00/01', contract: 'Truncated episodes keep a policy label and carry no value label.', observedPreFix: 'The mask rule switched the policy mask off with a null value target.', test: 'tools/v11_regression_contract.test.ts > truncated episodes keep policy labels', status: 'FIXED' },
    { id: 'RC-10', issue: 'F05', task: 'T11-00/03', contract: 'Only a successful optimizer.step counts as consumption; the pre-training plan is labelled as a plan.', observedPreFix: 'The consumed manifest was written before the DataLoader existed.', test: 'python/tests/test_v11_optimizer_consumption.py', status: 'FIXED' },
    { id: 'RC-11', issue: 'F05b', task: 'T11-00/03', contract: 'The last optimized batch contributes to the reported epoch loss.', observedPreFix: '`break` ran before the loss accumulation.', test: 'python/tests/test_v11_optimizer_consumption.py > test_last_optimized_batch_loss_is_not_dropped', status: 'FIXED' },
    { id: 'RC-12', issue: 'F05', task: 'T11-00/03', contract: 'Unknown root, empty validation partition, duplicate id with conflicting hash all fail loudly.', observedPreFix: 'Unknown roots fell into train; zero-validation was patched by carving the tail.', test: 'python/tests/test_v11_optimizer_consumption.py', status: 'FIXED' },
    { id: 'RC-13', issue: 'F07', task: 'T11-00/01', contract: 'A recorded match persists a provable initial snapshot and replays from its trajectory alone.', observedPreFix: 'Trajectory logs stored only actionHistory.', test: 'tools/v11_replay_e2e.test.ts', status: 'FIXED' },
];

export interface RegressionCasesFile {
    schema: 'v11_regression_cases_1';
    generatedAt: string;
    runner: string;
    baselineObservation: string;
    cases: RegressionCase[];
    requiredFixtureCoverage: Array<{ requirement: string; providedBy: string }>;
}

export function buildRegressionCases(): RegressionCasesFile {
    return {
        schema: 'v11_regression_cases_1',
        generatedAt: new Date().toISOString(),
        runner: 'pwsh -File v11/tools/run-tests.ps1   (TypeScript)   +   py -3.12 -m unittest discover -s python/tests   (Python)',
        baselineObservation:
            'First execution of the TypeScript suite against the review commit failed 7 assertions: F01b failure-step ' +
            'mismatch, F02 illegal-action classification, runTacticalFixtures TypeError, three F04 ledger/timeout/fallback ' +
            'fields, and the truncation policy mask. The Python suite failed on the self-certifying manifest, the ' +
            'per-epoch update limit, the dropped last batch, and every fail-loudly guard. All assertions pass after the fixes.',
        cases: REGRESSION_CASES,
        requiredFixtureCoverage: [
            { requirement: '已移动单位可直接攻击并自然获胜', providedBy: 'RC-05 (buildGuaranteedLethalPosition constructs and engine-verifies an immediate win)' },
            { requirement: '直接 capture/heal/summon/pending', providedBy: 'RC-05 (every distinct legal action type must have a root candidate) + the pending_resolution guarantee' },
            { requirement: '多步回放后状态与初态不同', providedBy: 'RC-01 (state hash equals the recomputed state at that step)' },
            { requirement: '变金币/人口/等级设置', providedBy: 'RC-04 + RC-13 (five setup variants; a recorded snapshot survives a 700/70/7 round trip)' },
            { requirement: '后段非法动作整局隔离', providedBy: 'RC-02 (a mid-episode illegal action publishes zero samples)' },
            { requirement: '训练 max_steps 使计划ID与优化ID不同', providedBy: 'RC-10 / python/tests/test_v11_optimizer_consumption.py' },
            { requirement: '并列候选排序与基准动作不变', providedBy: 'RC-05 (baseline always present) + RC-07 (verified fallback)' },
        ],
    };
}

export function runT11_00(): { outDir: string; files: string[] } {
    ensureDir(OUT_DIR);
    const snapshot = buildSourceSnapshot();
    const ledger = buildIssueLedger();
    const cases = buildRegressionCases();

    writeJson(path.join(OUT_DIR, 'source_snapshot.json'), snapshot);
    writeJson(path.join(OUT_DIR, 'issue_ledger.json'), ledger);
    writeJson(path.join(OUT_DIR, 'regression_cases.json'), cases);

    writeJson(path.join(OUT_DIR, 'evidence_manifest.json'), {
        schema: 'v11_evidence_manifest_1',
        generatedAt: new Date().toISOString(),
        reviewCommit: REVIEW_COMMIT,
        headMatchesReviewCommit: snapshot.headMatchesReviewCommit,
        files: ['source_snapshot.json', 'issue_ledger.json', 'regression_cases.json'].map(f => ({
            file: relPosix(path.join(OUT_DIR, f)),
            sha256: sha256File(path.join(OUT_DIR, f)),
        })),
        frozenSourceRoot: V11_ROOT,
        note: 'T11-00 freeze only. Other v11/out artifacts are hashed in out_index.json.',
    });

    return {
        outDir: OUT_DIR,
        files: ['source_snapshot.json', 'issue_ledger.json', 'regression_cases.json', 'evidence_manifest.json']
            .map(f => path.join(OUT_DIR, f)),
    };
}