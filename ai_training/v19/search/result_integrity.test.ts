import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchBudgetSha256, sourceIdentity } from './search_experiment_v2';
import {
    validateExperimentResults,
    type IntegrityEnvelope,
    type IntegrityManifest,
} from './result_integrity';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function sha(value: Buffer | string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture() {
    const directory = fs.mkdtempSync(path.join(process.cwd(), 'result-integrity-test-'));
    temporaryDirectories.push(directory);
    const modelPath = path.join(directory, 'model.json');
    fs.writeFileSync(modelPath, '{"model":"test"}\n');
    const modelSha = sha(fs.readFileSync(modelPath));
    const entries = Array.from({ length: 40 }, (_, index) => ({
        windowId: `w${index}`,
        familyId: `f${index}`,
        mapIndex: index % 5,
        seed: 1000 + index,
        ownSeat: index % 2,
        group: index < 20 ? 'dev' as const : 'sealed' as const,
        // 中文：w1/w21是强根重复；w0/w20只在删除sdTrainingSeed后语义重合。
        rootStateHash: index === 21 ? 'root-1' : `root-${index}`,
        rootStateJson: JSON.stringify({
            turn: index === 20 ? 0 : index === 21 ? 1 : index,
            metadata: { sdTrainingSeed: index === 21 ? 1 : index, retained: 'same' },
        }),
    }));
    const manifest: IntegrityManifest = {
        schema: 'v19_fresh_window_manifest_1',
        policy: { path: modelPath, sha256: modelSha },
        entries,
    };
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const budget = {
        maxOwnDepth: 2, maxBranchPerLevel: 5, policyTopK: 4, maxBranchesPerWindow: 16,
        wallMsPerWindow: 600000, maxStepsPerContinuation: 12000,
        searchWallMs: 120000, validationWallMsPerArm: 239000,
    };
    const budgetPath = path.join(directory, 'budget.json');
    fs.writeFileSync(budgetPath, `${JSON.stringify({ budget, budgetSha256: searchBudgetSha256(budget) }, null, 2)}\n`);
    const sources = sourceIdentity();
    const identityBase = {
        manifestSha256: sha(fs.readFileSync(manifestPath)),
        modelSha256: modelSha,
        budgetFileSha256: sha(fs.readFileSync(budgetPath)),
        budgetSha256: searchBudgetSha256(budget),
        sourceSha256: sources.sourceSha256,
        sourceFiles: sources.sourceFiles,
    };
    const envelopes = entries.map((entry): IntegrityEnvelope => ({
        schema: 'v19_search_window_result_2',
        status: 'success',
        error: null,
        entry,
        identity: { ...identityBase, group: entry.group },
        result: { validation: { fromRoot: true, rootStateHash: entry.rootStateHash } },
    }));
    return {
        manifest: manifestPath,
        manifestData: manifest,
        manifestPath,
        manifestSha: identityBase.manifestSha256,
        budgetPath,
        dev: envelopes.slice(0, 20),
        sealed: envelopes.slice(20),
    };
}

describe('搜索正式结果完整性', () => {
    it('验收40个唯一且身份一致的精确manifest成员，并披露重复根', () => {
        const data = fixture();
        const report = validateExperimentResults(data);
        expect(report.valid).toBe(true);
        expect(report.counts.uniqueResultWindowIds).toBe(40);
        expect(report.rootDuplicates).toEqual([{
            rootStateHash: 'root-1',
            windowIds: ['w1', 'w21'],
            groups: ['dev', 'sealed'],
        }]);
        expect(report.semanticRootOverlaps).toHaveLength(2);
        expect(report.semanticRootOverlaps.map((item) => [item.devWindowIds, item.sealedWindowIds]))
            .toEqual(expect.arrayContaining([
                [['w0'], ['w20']],
                [['w1'], ['w21']],
            ]));
    });

    it('对象manifest必须携带冻结SHA，也能完成同一验收', () => {
        const data = fixture();
        const report = validateExperimentResults({
            ...data,
            manifest: { data: data.manifestData, sha256: data.manifestSha, baseDir: path.dirname(data.manifestPath) },
        });
        expect(report.valid).toBe(true);
    });

    it('拒绝组别错放、重复及缺失成员', () => {
        const data = fixture();
        data.dev[0].entry!.group = 'sealed';
        data.dev[1] = data.dev[2];
        const report = validateExperimentResults(data);
        expect(report.valid).toBe(false);
        expect(report.duplicateResultWindowIds).toContain('w2');
        expect(report.missingWindowIds).toContain('w1');
        expect(report.issues.some((issue) => issue.code === 'RESULT_GROUP')).toBe(true);
    });

    it('拒绝模型、源码、预算或manifest身份不一致', () => {
        const data = fixture();
        data.sealed[0].identity!.sourceSha256 = '0'.repeat(64);
        data.sealed[1].identity!.budgetSha256 = '1'.repeat(64);
        data.sealed[2].identity!.modelSha256 = '2'.repeat(64);
        data.sealed[3].identity!.manifestSha256 = '3'.repeat(64);
        const report = validateExperimentResults(data);
        expect(report.valid).toBe(false);
        expect(report.issues.filter((issue) => issue.code === 'RESULT_IDENTITY')).toHaveLength(4);
    });
});

