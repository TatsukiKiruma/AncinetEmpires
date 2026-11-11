import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildSdTrainingJobs,
    loadSdTrainingPlanConfig,
    type SdTrainingJobSpec
} from './sd_training_state_generator';
import {
    hashDatasetSource,
    resolveGitCommit,
    sha256Text,
    stableJson
} from './skirmish_dataset_artifacts';

export interface SdJobManifestOptions {
    planFile: string;
    outRoot: string;
    planIds: string[];
    limitJobs: number | null;
    json: boolean;
}

export interface SdImmutableJobManifest {
    kind: 'sd_training_job_manifest';
    schemaVersion: 1;
    manifestId: string;
    createdAt: string;
    generator: {
        tool: 'tools/sd_training_job_manifest.ts';
        version: 1;
        gitCommit: string | null;
    };
    plan: {
        path: string;
        sha256: string;
        bytes: number;
        configName: string;
        configVersion: number;
    };
    selection: {
        planIds: string[];
        limitJobs: number | null;
    };
    jobs: {
        path: string;
        sha256: string;
        bytes: number;
        count: number;
    };
}

export interface SdJobManifestResult {
    artifactDir: string;
    manifestFile: string;
    jobFile: string;
    manifest: SdImmutableJobManifest;
}

const DEFAULT_PLAN_FILE = path.resolve(process.cwd(), 'training_configs', 'sd_training_plan_20260705.json');
const DEFAULT_OUT_ROOT = path.resolve(process.cwd(), 'training_runs', 'job_manifests');
const DIRECT_RUN_PATH = process.argv[1] ? path.resolve(process.argv[1]) : '';
const THIS_FILE_PATH = fileURLToPath(import.meta.url);

function printHelp() {
    console.log(`用法: npm run sd:training-manifest -- [选项]

选项:
  --plan <file>       SD 训练计划 JSON
  --out-root <dir>    内容寻址 manifest 根目录
  --plan-id <id>      只选择指定计划，可重复
  --limit-jobs <n>    最多写入 n 个 job
  --json              输出 JSON 摘要
  --help              显示帮助
`);
}

function parsePositiveInteger(value: string | undefined, label: string): number {
    if (!value) throw new Error(`${label} 缺少数值参数`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必须是正整数`);
    return parsed;
}

export function parseSdJobManifestArgs(argv: readonly string[]): SdJobManifestOptions {
    const options: SdJobManifestOptions = {
        planFile: DEFAULT_PLAN_FILE,
        outRoot: DEFAULT_OUT_ROOT,
        planIds: [],
        limitJobs: null,
        json: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--plan') {
            const value = argv[++index];
            if (!value) throw new Error('--plan 缺少文件参数');
            options.planFile = path.resolve(value);
        } else if (arg === '--out-root') {
            const value = argv[++index];
            if (!value) throw new Error('--out-root 缺少目录参数');
            options.outRoot = path.resolve(value);
        } else if (arg === '--plan-id') {
            const value = argv[++index];
            if (!value) throw new Error('--plan-id 缺少计划 ID');
            options.planIds.push(value);
        } else if (arg === '--limit-jobs') {
            options.limitJobs = parsePositiveInteger(argv[++index], arg);
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }
    return options;
}

function selectJobs(
    jobs: readonly SdTrainingJobSpec[],
    options: SdJobManifestOptions
): SdTrainingJobSpec[] {
    const selectedPlanIds = new Set(options.planIds);
    const selected = jobs.filter(job => (
        selectedPlanIds.size === 0 || selectedPlanIds.has(job.planId)
    ));
    return options.limitJobs === null ? selected : selected.slice(0, options.limitJobs);
}

export async function createImmutableSdJobManifest(
    options: SdJobManifestOptions
): Promise<SdJobManifestResult> {
    const config = await loadSdTrainingPlanConfig(options.planFile);
    const jobs = selectJobs(buildSdTrainingJobs(config), options);
    const planSource = await hashDatasetSource(options.planFile);
    const jobContent = jobs.map(job => JSON.stringify(job)).join('\n') + (jobs.length > 0 ? '\n' : '');
    const jobSha256 = sha256Text(jobContent);
    const selection = {
        planIds: [...new Set(options.planIds)].sort(),
        limitJobs: options.limitJobs
    };
    const manifestId = sha256Text(stableJson({
        schemaVersion: 1,
        planSha256: planSource.sha256,
        configName: config.name,
        configVersion: config.version,
        selection,
        jobSha256,
        jobCount: jobs.length
    }));
    const safeName = config.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    await mkdir(options.outRoot, { recursive: true });
    const artifactDir = path.join(options.outRoot, `${safeName}-${manifestId.slice(0, 16)}`);
    const jobFile = path.join(artifactDir, 'jobs.jsonl');
    const manifestFile = path.join(artifactDir, 'manifest.json');
    try {
        await mkdir(artifactDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = JSON.parse(
            await readFile(manifestFile, 'utf8')
        ) as SdImmutableJobManifest;
        const existingJobs = await hashDatasetSource(jobFile);
        if (
            existing.manifestId !== manifestId
            || existing.jobs.sha256 !== jobSha256
            || existingJobs.sha256 !== jobSha256
        ) {
            throw new Error(`已有 job manifest 内容与 ID 不一致，拒绝覆盖：${artifactDir}`);
        }
        return { artifactDir, manifestFile, jobFile, manifest: existing };
    }
    await writeFile(jobFile, jobContent, { encoding: 'utf8', flag: 'wx' });

    const manifest: SdImmutableJobManifest = {
        kind: 'sd_training_job_manifest',
        schemaVersion: 1,
        manifestId,
        createdAt: new Date().toISOString(),
        generator: {
            tool: 'tools/sd_training_job_manifest.ts',
            version: 1,
            gitCommit: await resolveGitCommit()
        },
        plan: {
            path: planSource.path,
            sha256: planSource.sha256,
            bytes: planSource.bytes,
            configName: config.name,
            configVersion: config.version
        },
        selection,
        jobs: {
            path: 'jobs.jsonl',
            sha256: jobSha256,
            bytes: Buffer.byteLength(jobContent),
            count: jobs.length
        }
    };
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx'
    });
    return { artifactDir, manifestFile, jobFile, manifest };
}

async function main() {
    const options = parseSdJobManifestArgs(process.argv.slice(2));
    const result = await createImmutableSdJobManifest(options);
    console.log(options.json
        ? JSON.stringify(result, null, 2)
        : `已生成不可变 job manifest：${result.manifestFile}\nJob：${result.jobFile}\n`);
}

if (path.resolve(DIRECT_RUN_PATH) === path.resolve(THIS_FILE_PATH)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
