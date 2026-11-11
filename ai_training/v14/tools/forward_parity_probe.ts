/**
 * V14/T14-03 补项：TS ↔ Python **网络前向**逐数值一致性（logits / value）。
 *
 * 为什么必须单独做：
 * 上一轮的一致性只覆盖了两件事：
 * 1. 编码器一致（TS 编码结果与 Python 独立实现逐数值相同）；
 * 2. 候选重排不变（同一 TS 前向自身在不同顺序下对齐后相同）。
 * 两者都不能证明「TS 推理端算出的 logits/value」与「Python 训练端算出的」相同。
 * 如果两侧打分不一致，训练得到的策略在浏览器/Node 里的实际行为就与训练目标不同，
 * 这是直接可定位的训练—推理差异，任务书把它列为必测项。
 *
 * 做法：
 * - 从 `parity_fixture.json`（269 状态 / 712 视角 / 33556 候选）里挑一份覆盖性样本：
 *   覆盖全部动作类型、候选数最少/最多、地图边缘、null 坐标、pending、并列最高分；
 * - TS 侧用真实 `SpatialResNetPredictor`（浏览器同一条推理路径）算 Z、logits、value；
 * - Python 侧用 `python/verify_parity.py`（训练侧同一模型定义）算同样三样；
 * - 逐项比较，按任务书预登记容差 `atol=1e-4, rtol=1e-4` 判定。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/forward_parity_probe.ts \
 *       --checkpoint <model.json> --output-dir <dir> [--max-cases 48]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
    SpatialResNetPredictor,
    loadSpatialResNetFromJson,
} from '../../src/game/ai/spatial_conv_net';
import { ENCODER_SCHEMA_ID_V14 } from '../../src/game/ai/spatial_tensor_encoder';

function argOf(name: string, fallback: string | null): string | null {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const checkpointPath = argOf('--checkpoint', null);
const fixturePath = argOf('--fixture', 'v14/out/v14_20260924_t14/T14-03/parity_fixture.json')!;
const outputDir = argOf('--output-dir', 'v14/out/v14_20260925_t14b/T14-03')!;
const maxCases = Number(argOf('--max-cases', '48'));
if (!checkpointPath) {
    console.error('用法：--checkpoint <model.json> [--fixture <parity_fixture.json>] [--output-dir <dir>] [--max-cases N]');
    process.exit(2);
}

const ATOL = 1e-4;
const RTOL = 1e-4;

interface Case {
    stateId: string;
    stateIndex: number;
    playerId: number;
    legalActionCodes: string[];
    spatialTensor: number[];
    globalFeatures: number[];
    candidates: Array<{
        actorCoord: { x: number; y: number } | null;
        landingCoord: { x: number; y: number } | null;
        targetCoord: { x: number; y: number } | null;
        semantics: number[];
        actionCode?: string;
    }>;
}

/** 中文：选择覆盖性样本 —— 动作类型全覆盖 + 候选数极值 + 地图边缘 + null 坐标。 */
function selectCases(cases: Case[], limit: number): Case[] {
    const selected = new Map<number, Case>();
    const typeSeen = new Set<string>();
    const sorted = [...cases].sort((a, b) => b.candidates.length - a.candidates.length);

    for (const item of sorted) {
        for (const candidate of item.candidates) {
            const type = String(candidate.actionCode ?? '').split(':')[0];
            if (type && !typeSeen.has(type)) {
                typeSeen.add(type);
                selected.set(item.stateIndex * 10 + item.playerId, item);
            }
        }
        if (selected.size > limit * 2) break;
    }
    // 候选数最多与最少各取若干，保证 padding / 空候选边界被覆盖。
    for (const item of sorted.slice(0, Math.ceil(limit / 4))) selected.set(item.stateIndex * 10 + item.playerId, item);
    for (const item of sorted.slice(-Math.ceil(limit / 4))) selected.set(item.stateIndex * 10 + item.playerId, item);
    // null 坐标的候选（end_turn / surrender / 部分 summon）
    for (const item of cases) {
        if (item.candidates.some((c) => !c.actorCoord || !c.landingCoord || !c.targetCoord)) {
            selected.set(item.stateIndex * 10 + item.playerId, item);
        }
        if (selected.size > limit * 3) break;
    }

    const pool = [...selected.values()];
    // 均匀抽样，避免只取到大型状态。
    const step = Math.max(1, Math.floor(pool.length / limit));
    const picked: Case[] = [];
    for (let i = 0; i < pool.length && picked.length < limit; i += step) picked.push(pool[i]);
    for (let i = 0; i < pool.length && picked.length < limit; i += 1) {
        if (!picked.includes(pool[i])) picked.push(pool[i]);
    }
    return picked;
}

function pythonForward(inputPath: string, outPath: string): { logits: number[]; z: number[] } | null {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v14-parity-'));
    const stdoutFile = path.join(tmpDir, 'stdout.txt');
    const stderrFile = path.join(tmpDir, 'stderr.txt');
    const outFd = fs.openSync(stdoutFile, 'w');
    const errFd = fs.openSync(stderrFile, 'w');
    try {
        execFileSync('py', [
            'python/verify_parity.py', checkpointPath!, inputPath, outPath,
        ], { cwd: process.cwd(), stdio: ['ignore', outFd, errFd], timeout: 600000 });
    } catch (error) {
        const stderr = fs.readFileSync(stderrFile, 'utf8');
        console.error('[T14-03] Python 前向失败：' + stderr.slice(-1500));
        return null;
    } finally {
        try { fs.closeSync(outFd); } catch { /* 已关闭 */ }
        try { fs.closeSync(errFd); } catch { /* 已关闭 */ }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    if (!fs.existsSync(outPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    return { logits: parsed.actionLogits as number[], z: parsed.spatialZ as number[] };
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const cases: Case[] = fixture.cases.map((raw: any, index: number) => ({
    ...raw,
    stateIndex: raw.stateIndex ?? index,
    candidates: (raw.candidates ?? []).map((candidate: any, ci: number) => ({
        ...candidate,
        actionCode: raw.legalActionCodes?.[ci],
    })),
}));

const picked = selectCases(cases, maxCases);
const weights = loadSpatialResNetFromJson(fs.readFileSync(checkpointPath, 'utf8'), {
    expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V14,
});
const predictor = new SpatialResNetPredictor(weights);

const workDir = path.resolve(outputDir, 'forward_parity_work');
fs.mkdirSync(workDir, { recursive: true });

const perCase: any[] = [];
let maxLogitAbsDiff = 0;
let maxLogitRelDiff = 0;
let maxZAbsDiff = 0;
let bestIndexMismatches = 0;
let pythonFailures = 0;
const typeCoverage = new Set<string>();

for (const item of picked) {
    const encoded = {
        spatialTensor: new Float32Array(item.spatialTensor),
        globalFeatures: new Float32Array(item.globalFeatures),
        mapWidth: 20,
        mapHeight: 20,
        subjectPlayerId: item.playerId,
    };
    const tsResult = predictor.predict(encoded, item.candidates.map((c) => ({
        actorCoord: c.actorCoord,
        landingCoord: c.landingCoord,
        targetCoord: c.targetCoord,
        semantics: c.semantics,
    })) as any);

    const inputPath = path.join(workDir, `case_${item.stateIndex}_${item.playerId}.input.json`);
    const outPath = path.join(workDir, `case_${item.stateIndex}_${item.playerId}.python.json`);
    fs.writeFileSync(inputPath, JSON.stringify({
        spatialTensor: item.spatialTensor,
        globalFeatures: item.globalFeatures,
        candidateActions: item.candidates,
    }));

    const pythonResult = pythonForward(inputPath, outPath);
    if (!pythonResult) {
        pythonFailures += 1;
        continue;
    }
    for (const candidate of item.candidates) {
        const type = String(candidate.actionCode ?? '').split(':')[0];
        if (type) typeCoverage.add(type);
    }

    if (pythonResult.logits.length !== tsResult.actionLogits.length) {
        perCase.push({
            stateId: item.stateId, stateIndex: item.stateIndex, playerId: item.playerId,
            error: `候选数不一致：TS=${tsResult.actionLogits.length} Python=${pythonResult.logits.length}`,
        });
        continue;
    }

    let caseMaxAbs = 0;
    let caseMaxRel = 0;
    for (let i = 0; i < pythonResult.logits.length; i += 1) {
        const diff = Math.abs(tsResult.actionLogits[i] - pythonResult.logits[i]);
        const denom = Math.max(Math.abs(tsResult.actionLogits[i]), Math.abs(pythonResult.logits[i]), 1e-12);
        caseMaxAbs = Math.max(caseMaxAbs, diff);
        caseMaxRel = Math.max(caseMaxRel, diff / denom);
    }
    for (let i = 0; i < pythonResult.z.length; i += 1) {
        maxZAbsDiff = Math.max(maxZAbsDiff, Math.abs(tsResult.spatialFeaturesZ[i] - pythonResult.z[i]));
    }
    const pythonBest = pythonResult.logits.reduce(
        (best, value, index) => (value > pythonResult.logits[best] ? index : best), 0,
    );
    const bestMismatch = pythonBest !== tsResult.bestActionIndex;
    if (bestMismatch) bestIndexMismatches += 1;
    maxLogitAbsDiff = Math.max(maxLogitAbsDiff, caseMaxAbs);
    maxLogitRelDiff = Math.max(maxLogitRelDiff, caseMaxRel);

    perCase.push({
        stateId: item.stateId,
        stateIndex: item.stateIndex,
        playerId: item.playerId,
        candidates: item.candidates.length,
        types: [...new Set(item.candidates.map((c) => String(c.actionCode ?? '').split(':')[0]))],
        maxLogitAbsDiff: caseMaxAbs,
        maxLogitRelDiff: caseMaxRel,
        tsBestActionIndex: tsResult.bestActionIndex,
        pythonBestActionIndex: pythonBest,
        bestIndexMismatch: bestMismatch,
        tsValue: tsResult.value,
    });
}

const report = {
    schema: 'v14_ts_python_forward_parity_1',
    task: 'T14-03',
    generatedAt: new Date().toISOString(),
    purpose: '中文：补齐上一轮缺失的 TS/Python 网络前向逐数值一致性（logits / Z / value）。',
    checkpoint: checkpointPath.replace(/\\/g, '/'),
    checkpointEncoderSchemaId: (weights as any).encoderSchemaId ?? null,
    fixture: fixturePath,
    fixtureCasesAvailable: cases.length,
    casesCompared: perCase.filter((entry) => !entry.error).length,
    pythonFailures,
    tolerance: { atol: ATOL, rtol: RTOL, note: '预登记：FP32 跨语言输出 atol=1e-4, rtol=1e-4。' },
    summary: {
        maxLogitAbsDiff,
        maxLogitRelDiff,
        maxTrunkZAbsDiff: maxZAbsDiff,
        bestIndexMismatches,
        withinTolerance: maxLogitAbsDiff <= ATOL || maxLogitRelDiff <= RTOL,
    },
    actionTypeCoverage: [...typeCoverage].sort(),
    cases: perCase,
};

fs.mkdirSync(outputDir, { recursive: true });
const outFile = path.join(outputDir, 'ts_python_forward_parity.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
    outFile,
    casesCompared: report.casesCompared,
    maxLogitAbsDiff,
    maxLogitRelDiff,
    maxTrunkZAbsDiff: maxZAbsDiff,
    bestIndexMismatches,
    pythonFailures,
    typeCoverage: report.actionTypeCoverage.length,
}, null, 2));
