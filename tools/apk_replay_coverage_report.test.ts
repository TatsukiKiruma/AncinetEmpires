import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCoverageSummary } from './apk_replay_coverage_report';

const tempRoots: string[] = [];

async function makeTempRoot() {
    const root = await mkdtemp(path.join(tmpdir(), 'aeii-coverage-'));
    tempRoots.push(root);
    return root;
}

function sha256(data: string) {
    return createHash('sha256').update(Buffer.from(data)).digest('hex');
}

async function writeReplay(root: string, name: string, data: string) {
    const filePath = path.join(root, name);
    await writeFile(filePath, Buffer.from(data));
    return sha256(data);
}

async function writeReport(root: string, name: string, options: {
    force: boolean;
    failed?: number;
    parseErrors?: number;
    shas: string[];
}) {
    await writeFile(path.join(root, name), JSON.stringify({
        options: {
            forceExecuteReplayActions: options.force
        },
        totals: {
            parsed: options.shas.length,
            passed: options.shas.length,
            failed: options.failed ?? 0,
            parseErrors: options.parseErrors ?? 0
        },
        items: options.shas.map(sha => ({
            sha256: sha,
            skipped: false,
            validation: {
                success: true
            }
        }))
    }));
}

afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('APK 回放覆盖率审计', () => {
    it('统计任意同结构 JSON 报告，并按 SHA 去重', async () => {
        const root = await makeTempRoot();
        const shaA = await writeReplay(root, 'game_get_a.bin', 'same');
        await writeReplay(root, 'game_get_a_duplicate.bin', 'same');
        const shaB = await writeReplay(root, 'game_get_b.bin', 'other');
        await writeReport(root, 'agent_forced_001_020.json', {
            force: true,
            shas: [shaA, shaB]
        });

        const summary = await generateCoverageSummary({
            rootDir: root,
            outPath: null,
            targetUnique: 2,
            requireForce: true,
            check: true
        });

        expect(summary.uniqueShaCount).toBe(2);
        expect(summary.unverifiedUniqueCount).toBe(0);
        expect(summary.missingToTarget).toBe(0);
        expect(summary.checkPassed).toBe(true);
        expect(summary.markdown).toContain('agent_forced_001_020.json');
        expect(summary.markdown).toContain('重复文件数：1');
    });

    it('requireForce 会忽略非强制执行报告', async () => {
        const root = await makeTempRoot();
        const sha = await writeReplay(root, 'game_get_only.bin', 'payload');
        await writeReport(root, 'strict_unique.json', {
            force: false,
            shas: [sha]
        });

        const summary = await generateCoverageSummary({
            rootDir: root,
            outPath: null,
            targetUnique: 1,
            requireForce: true,
            check: true
        });

        expect(summary.uniqueShaCount).toBe(1);
        expect(summary.unverifiedUniqueCount).toBe(1);
        expect(summary.missingToTarget).toBe(0);
        expect(summary.checkPassed).toBe(false);
    });

    it('不会把失败报告计入覆盖证据', async () => {
        const root = await makeTempRoot();
        const nested = path.join(root, 'captures');
        await mkdir(nested);
        const sha = await writeReplay(nested, 'game_get_failed.bin', 'payload');
        await writeReport(nested, 'failed_forced.json', {
            force: true,
            failed: 1,
            shas: [sha]
        });

        const summary = await generateCoverageSummary({
            rootDir: root,
            outPath: null,
            targetUnique: 1,
            requireForce: true,
            check: true
        });

        expect(summary.uniqueShaCount).toBe(1);
        expect(summary.unverifiedUniqueCount).toBe(1);
        expect(summary.checkPassed).toBe(false);
        expect(summary.markdown).toContain('全通过报告');
        expect(summary.markdown).not.toContain('failed_forced.json');
    });
});
