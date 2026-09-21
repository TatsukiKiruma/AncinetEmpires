import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

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
        const gitStatus = execSync('git status --porcelain docs/training/reports/agent_upgrade_20260921_v7_01', {
            encoding: 'utf8'
        }).trim();

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

    it('R8-Guard-F: Closure v8_closure_01 report directory contains all 4 required reports and benchmarks', () => {
        const v8ClosureReportDir = path.resolve('docs/training/reports/agent_upgrade_20260921_v8_closure_01');
        expect(existsSync(v8ClosureReportDir)).toBe(true);

        const files = readdirSync(v8ClosureReportDir);
        const expectedFiles = [
            'dagger_paired_evaluation.json',
            'task-status.json',
            'v8_clean_benchmark.json',
            'v8_closure_audit_report.md'
        ];
        expect(files.sort()).toEqual(expectedFiles.sort());
    });
});
