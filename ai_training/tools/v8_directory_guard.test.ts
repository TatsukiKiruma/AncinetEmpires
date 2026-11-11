import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, openSync, closeSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(process.cwd());

/** List the tracked files under a pathspec (empty when nothing there is tracked yet). */
function gitLsFiles(pathspec: string): string[] {
    const outFile = path.join(
        os.tmpdir(),
        `v8_guard_lsfiles_${process.pid}_${Math.random().toString(36).slice(2)}.txt`
    );
    const fd = openSync(outFile, 'w');
    try {
        execFileSync('git', ['ls-files', pathspec], {
            cwd: REPO_ROOT,
            stdio: ['ignore', fd, 'ignore']
        });
    } finally {
        closeSync(fd);
    }
    const text = readFileSync(outFile, 'utf8').trim();
    rmSync(outFile, { force: true });
    return text.length > 0 ? text.split(/\r?\n/) : [];
}

/**
 * Read `git status --porcelain` for a pathspec.
 *
 * git's stdout is redirected straight into a file descriptor instead of a pipe: sandboxed
 * environments can refuse piped stdio (`spawnSync ... EPERM`), and a pipe is not needed here.
 */
function gitPorcelain(pathspec: string, extraArgs: string[] = []): string {
    const outFile = path.join(
        os.tmpdir(),
        `v8_guard_git_${process.pid}_${Math.random().toString(36).slice(2)}.txt`
    );
    const fd = openSync(outFile, 'w');
    try {
        execFileSync('git', ['status', '--porcelain', ...extraArgs, pathspec], {
            cwd: REPO_ROOT,
            stdio: ['ignore', fd, 'ignore']
        });
    } finally {
        closeSync(fd);
    }
    const text = readFileSync(outFile, 'utf8').trim();
    rmSync(outFile, { force: true });
    return text;
}

describe('V8 Directory Guard & Historical Report Isolation', () => {
    const historicalReportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v7_01');

    it('R8-Guard-A: Historical v7_01 report directory must strictly contain only the 5 tracked baseline files', () => {
        expect(existsSync(historicalReportDir)).toBe(true);

        const files = readdirSync(historicalReportDir);
        const expectedFiles = [
            'audit-v7.json',
            'comparison.json',
            'data-and-training-coverage.json',
            'inference-parity.json',
            'task-status.json'
        ];

        // Ensure exactly the 5 baseline files exist, no unexpected files like corrected_v7_rerun.json or split_manifest.json
        expect(files.sort()).toEqual(expectedFiles.sort());
    });

    it('R8-Guard-B: Git status on historical report directory must show 0 modifications', () => {
        const gitStatus = gitPorcelain('docs/training/reports/agent_upgrade_20260921_v7_01');

        expect(gitStatus).toBe('');
    });

    it('R8-Guard-C: Historical data-and-training-coverage.json must retain original baseline sample count', () => {
        const coveragePath = path.join(historicalReportDir, 'data-and-training-coverage.json');
        const content = JSON.parse(readFileSync(coveragePath, 'utf8'));

        // Baseline had 2,940 unique verified states
        expect(content.totalUniqueStates).toBe(2940);
        expect(content.trainSampleCount).toBe(2395);
        expect(content.valSampleCount).toBe(545);
    });

    it('R8-Guard-D: Historical v8_clean_01 report directory must retain its 6 audit files unmodified', () => {
        const v8CleanReportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_clean_01');
        expect(existsSync(v8CleanReportDir)).toBe(true);

        const files = readdirSync(v8CleanReportDir);
        const expectedFiles = [
            'dagger_paired_evaluation.json',
            'data-and-training-coverage.json',
            'split_manifest.json',
            'task-status.json',
            'v8_audit_and_re-evaluation_report.md',
            'v8_clean_benchmark.json'
        ];
        expect(files.sort()).toEqual(expectedFiles.sort());
    });

    it('R8-Guard-E: Historical v8_final_01 report directory must retain its 7 audit files unmodified', () => {
        const v8FinalReportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_final_01');
        expect(existsSync(v8FinalReportDir)).toBe(true);

        const files = readdirSync(v8FinalReportDir);
        const expectedFiles = [
            'dagger_paired_evaluation.json',
            'data-and-training-coverage.json',
            'split_manifest.json',
            'task-status.json',
            'v8_clean_benchmark.json',
            'v8_final_audit_report.md',
            'v8_step0_read_only_audit.md'
        ];
        expect(files.sort()).toEqual(expectedFiles.sort());
    });

    it('R8-Guard-F: closure v8_closure_01 keeps its 4 historical reports unmodified; only corrections/ may be added', () => {
        const v8ClosureReportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_closure_01');
        expect(existsSync(v8ClosureReportDir)).toBe(true);

        // Historical report files must all still be present.
        const expectedFiles = [
            'dagger_paired_evaluation.json',
            'task-status.json',
            'v8_clean_benchmark.json',
            'v8_closure_audit_report.md'
        ];
        const files = readdirSync(v8ClosureReportDir, { withFileTypes: true })
            .filter(entry => entry.isFile())
            .map(entry => entry.name);
        for (const expected of expectedFiles) {
            expect(files).toContain(expected);
        }

        // No historical report file may be modified, added or deleted.
        const trackedHistorical = gitLsFiles('docs/training/reports/agent_upgrade_20260921_v8_closure_01');
        const closure01HasTrackedHistory = trackedHistorical.length > 0;

        if (closure01HasTrackedHistory) {
            for (const historical of expectedFiles) {
                const trackedChange = gitPorcelain(
                    `docs/training/reports/agent_upgrade_20260921_v8_closure_01/${historical}`,
                    ['--untracked-files=no']
                );
                expect(trackedChange, `historical file ${historical} must not change`).toBe('');
            }

            // Any tracked change inside the closure_01 report directory must be confined to the
            // additive corrections/ subdirectory this cycle introduced.
            const allTrackedChanges = gitPorcelain(
                'docs/training/reports/agent_upgrade_20260921_v8_closure_01',
                ['--untracked-files=no']
            )
                .split(/\r?\n/)
                .filter(line => line.length > 0);
            for (const line of allTrackedChanges) {
                expect(line).toMatch(/corrections\//);
            }
        }

        // The only addition this cycle makes to the closure_01 report directory is corrections/.
        const untracked = gitPorcelain('docs/training/reports/agent_upgrade_20260921_v8_closure_01')
            .split(/\r?\n/)
            .filter(line => line.startsWith('??'));
        for (const line of untracked) {
            const allowedByDirectory = line.endsWith('/agent_upgrade_20260921_v8_closure_01/');
            const allowedByCorrections = /corrections\/?$/.test(line);
            expect(
                allowedByDirectory || allowedByCorrections,
                `unexpected untracked entry in the closure_01 report directory: ${line}`
            ).toBe(true);
        }

        const correctionsDir = path.join(v8ClosureReportDir, 'corrections');
        expect(existsSync(correctionsDir)).toBe(true);
        expect(existsSync(path.join(correctionsDir, 'CORRECTIONS.md'))).toBe(true);
    });

    it('R8-Guard-G: the closure_01 benchmark used as the closure_02 fact source is byte-identical to the recorded hash', () => {
        const closure02Dir = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_closure_02');
        const factsPath = path.join(closure02Dir, 'v8_closure_facts.json');
        expect(existsSync(factsPath)).toBe(true);

        const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
        const sourcePath = facts.sourceBenchmark.path;
        expect(existsSync(sourcePath)).toBe(true);

        // Hashed over LF-normalised content so the check is identical in the worktree (where
        // core.autocrlf rewrites tracked text files to CRLF) and in the canonical working tree.
        const actual = createHash('sha256')
            .update(readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n'))
            .digest('hex');
        expect(actual).toBe(facts.sourceBenchmark.sha256);
    });

    it('R8-Guard-H: closure_02 ships its own run directory and historical run artifacts are unchanged', () => {
        const closure02RunDir = path.resolve('training_runs/agent_upgrade_20260921_v8_closure_02');
        expect(existsSync(closure02RunDir)).toBe(true);
        expect(existsSync(path.join(closure02RunDir, 'checkpoints/spatial_resnet/spatial_resnet_v2_best.json'))).toBe(true);

        // The clean checkpoints in the historical closure_01 run must still be the verified artifacts.
        const closure01CheckpointDir = path.resolve('training_runs/agent_upgrade_20260921_v8_closure_01/checkpoints');
        const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
        expect(sha(path.join(closure01CheckpointDir, 'spatial_resnet/spatial_resnet_v2_best.json'))).toBe(
            '1721ca177ec729457b7dde0676573c3312bd0b96331ea9b29ddbb902b635af92'
        );
        expect(sha(path.join(closure01CheckpointDir, 'spatial_resnet_dagger/spatial_resnet_dagger_best.json'))).toBe(
            'efec05c0e16a707689f651b59262b41db30601fa3ce6b567ed9fc17c117fbf9b'
        );
        expect(sha(path.join(closure01CheckpointDir, 'net_a/net_a_checkpoint.json'))).toBe(
            'ededeb349a252d75c8dd66d40a29dcae8d0716669911285c39da870bebfc4edf'
        );

        // Historical failure evidence is untouched.
        const closure01Failures = JSON.parse(
            readFileSync(path.resolve('training_runs/agent_upgrade_20260921_v8_closure_01/failures/failure_windows.json'), 'utf8')
        );
        expect(closure01Failures.length).toBe(61);

        // Run data is gitignored, so assert no *tracked* historical run file was modified or deleted.
        for (const historical of [
            'agent_upgrade_20260921_v7_01',
            'agent_upgrade_20260921_v8_clean_01',
            'agent_upgrade_20260921_v8_final_01',
            'agent_upgrade_20260921_v8_closure_01'
        ]) {
            const porcelain = gitPorcelain(`training_runs/${historical}`, ['--untracked-files=no']);
            expect(porcelain, `historical run dir ${historical} must be untouched`).toBe('');
        }
    });
});
