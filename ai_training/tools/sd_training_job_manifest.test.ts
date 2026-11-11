import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    createImmutableSdJobManifest,
    parseSdJobManifestArgs
} from './sd_training_job_manifest';

const PLAN_FILE = path.resolve('training_configs', 'sd_training_plan_20260705.json');

describe('sd training job manifest', () => {
    it('解析计划筛选和输出参数', () => {
        const options = parseSdJobManifestArgs([
            '--plan',
            PLAN_FILE,
            '--out-root',
            'training_runs/test-manifests',
            '--plan-id',
            'sd-normal',
            '--limit-jobs',
            '3'
        ]);

        expect(options.planIds).toEqual(['sd-normal']);
        expect(options.limitJobs).toBe(3);
        expect(options.outRoot).toContain('test-manifests');
    });

    it('生成内容寻址 job 清单，并只读复用相同 ID', async () => {
        const outRoot = await mkdtemp(path.join(os.tmpdir(), 'sd-job-manifest-'));
        const options = {
            planFile: PLAN_FILE,
            outRoot,
            planIds: ['sd-normal'],
            limitJobs: 3,
            json: false
        };
        const result = await createImmutableSdJobManifest(options);
        const jobs = (await readFile(result.jobFile, 'utf8')).trim().split('\n');

        expect(result.manifest.jobs.count).toBe(3);
        expect(result.manifest.jobs.sha256).toHaveLength(64);
        expect(result.manifest.plan.sha256).toHaveLength(64);
        expect(jobs).toHaveLength(3);
        const reused = await createImmutableSdJobManifest(options);
        expect(reused.manifestFile).toBe(result.manifestFile);
        expect(reused.manifest.createdAt).toBe(result.manifest.createdAt);
    });
});
