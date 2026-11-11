/**
 * V14/T14-03：编码器 schema 与权重兼容性测试。
 *
 * 验证四件事（全部基于真实检查点文件，不是构造字符串）：
 * 1. 历史 24 通道检查点用 expectedEncoderSchemaId=v13 可以加载（旧模型按旧路径可读）；
 * 2. 同一个检查点用 expectedEncoderSchemaId=v14 被拒绝（旧权重不得静默解释新语义）；
 * 3. schema 声明的通道数与检查点 stem 输入通道数不一致时被拒绝（24 vs 26）；
 * 4. 未知 encoderSchemaId 被拒绝。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/schema_compatibility_check.ts \
 *     --run-id v14_20260924_t14
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ENCODER_SCHEMA_ID_V13, ENCODER_SCHEMA_ID_V14 } from '../../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';

const REPO_ROOT = process.cwd();

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256File(file: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const runId = arg('--run-id', 'v14_20260924_t14');
const outDir = path.resolve('v14', 'out', runId, 'T14-03');
fs.mkdirSync(outDir, { recursive: true });

const legacyCheckpoints = [
    'src/game/ai/models/spatial_resnet_checkpoint.json',
    'src/game/ai/models/spatial_resnet_v2_checkpoint.json',
    'src/game/ai/models/spatial_resnet_dagger_checkpoint.json',
    'v13/out/v13_20260924_t13/T13-07/data_v3_b0_v31/runs/s42/best.json',
];

interface CaseResult {
    id: string;
    description: string;
    pass: boolean;
    reading: unknown;
}
const cases: CaseResult[] = [];

function expectLoad(id: string, description: string, fn: () => unknown): void {
    try {
        cases.push({ id, description, pass: true, reading: fn() });
    } catch (error) {
        cases.push({ id, description, pass: false, reading: String((error as Error).message ?? error) });
    }
}

function expectReject(id: string, description: string, fn: () => unknown, matcher: RegExp): void {
    try {
        fn();
        cases.push({ id, description, pass: false, reading: '未抛错（本应被拒绝）' });
    } catch (error) {
        const message = String((error as Error).message ?? error);
        cases.push({ id, description, pass: matcher.test(message), reading: message });
    }
}

for (const checkpointPath of legacyCheckpoints) {
    const abs = path.join(REPO_ROOT, checkpointPath);
    if (!fs.existsSync(abs)) {
        cases.push({ id: `missing/${checkpointPath}`, description: '检查点存在', pass: false, reading: '文件不存在' });
        continue;
    }
    const json = fs.readFileSync(abs, 'utf8');
    const parsed = JSON.parse(json);
    const base = path.basename(checkpointPath);

    expectLoad(`legacy-loadable/${base}`,
        '历史检查点按 v13 语义可加载（旧模型仍能按旧路径读取）',
        () => {
            const weights = loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V13 });
            return {
                encoderSchemaId: weights.encoderSchemaId,
                stemInChannels: weights.stem.inChannels,
                architectureId: weights.architectureId,
                declaredSchema: parsed.encoderSchemaId ?? null,
            };
        });
    expectReject(`legacy-rejected-under-v14/${base}`,
        '同一历史检查点在 v14 语义下必须被拒绝',
        () => loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V14 }),
        /schema mismatch|channel count mismatch/);
    expectReject(`unknown-schema/${base}`,
        '未知 encoderSchemaId 必须被拒绝',
        () => {
            const tampered = JSON.parse(json);
            tampered.encoderSchemaId = 'spatial99_unknown_0';
            return loadSpatialResNetFromJson(JSON.stringify(tampered));
        },
        /Unknown spatial encoder schema/);
    expectReject(`channel-mismatch/${base}`,
        'schema 声明的通道数与权重 stem 通道数不一致时必须被拒绝',
        () => {
            const tampered = JSON.parse(json);
            tampered.encoderSchemaId = ENCODER_SCHEMA_ID_V14;
            return loadSpatialResNetFromJson(JSON.stringify(tampered), {
                expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V14,
            });
        },
        /channel count mismatch/);
    expectReject(`stem-length-mismatch/${base}`,
        '权重字节数与声明的 stem 形状不一致时必须被拒绝（防止半截或错位权重）',
        () => {
            const tampered = JSON.parse(json);
            tampered.stem.weights = tampered.stem.weights.slice(0, 10);
            return loadSpatialResNetFromJson(JSON.stringify(tampered), {
                expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V13,
            });
        },
        /./);
}

const report = {
    schema: 'v14_schema_compatibility_1',
    task: 'T14-03',
    runId,
    generatedAt: new Date().toISOString(),
    encoderSchemas: {
        v13: { id: ENCODER_SCHEMA_ID_V13, channels: 24 },
        v14: { id: ENCODER_SCHEMA_ID_V14, channels: 26 },
    },
    checkedCheckpoints: legacyCheckpoints.map((p) => ({
        path: p,
        exists: fs.existsSync(path.join(REPO_ROOT, p)),
        sha256: fs.existsSync(path.join(REPO_ROOT, p)) ? sha256File(path.join(REPO_ROOT, p)) : null,
    })),
    cases,
    counts: {
        checks: cases.length,
        passed: cases.filter((c) => c.pass).length,
        failed: cases.filter((c) => !c.pass).length,
    },
};
fs.writeFileSync(path.join(outDir, 'schema_compatibility.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[T14-03] schema compatibility checks=${report.counts.checks} passed=${report.counts.passed} failed=${report.counts.failed}`);
for (const c of cases.filter((x) => !x.pass)) {
    console.log(`  FAIL ${c.id}: ${typeof c.reading === 'string' ? c.reading : JSON.stringify(c.reading)}`);
}
if (report.counts.failed > 0) process.exitCode = 1;
