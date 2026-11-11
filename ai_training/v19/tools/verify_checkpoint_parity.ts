/**
 * 任意 V19 34 通道检查点的 TypeScript / Python 前向一致性校验。
 *
 * 本工具只读取冻结 DEV20 根状态，不推进游戏，也不读取标签或胜负。TypeScript 侧用
 * 正式编码器和规范候选顺序生成输入及参考读数，再调用既有 python/verify_parity.py
 * 的批处理入口。输出目录必须不存在，避免新旧检查点证据混写。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/tools/verify_checkpoint_parity.ts \
 *     --model <checkpoint.json> --out-dir <new-directory> --python <python-executable>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { canonicalActionOrderV16, CANDIDATE_ORDERING_ID_V16 } from '../../src/game/ai/action_ordering';
import {
    encodeCandidateActionsSpatialForSchema,
    encodeGameStateSpatial,
    ENCODER_SCHEMA_ID_V19,
    ENCODER_SCHEMA_ID_V19_PATH3,
    SPATIAL_TENSOR_CHANNELS_V19,
} from '../../src/game/ai/spatial_tensor_encoder';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import type { GameState } from '../../src/game/types';

const DEFAULT_MANIFEST = 'v19/out/search_recheck_20261003/search/window_manifest.json';
const THRESHOLD = 2e-4;

interface ManifestEntry {
    windowId: string;
    group: 'dev' | 'sealed';
    mapIndex: number;
    mapName: string;
    seed: number;
    ownSeat: number;
    legalActionCount: number;
    rootStateSha256?: string;
    rootStateJson: string;
}

interface Manifest {
    schema: string;
    entries: ManifestEntry[];
}

interface PythonReadout {
    caseId: string;
    actionLogits: number[];
    bestActionIndex: number;
    value: number;
}

interface PythonOutput {
    checkpointEncoderSchemaId: string | null;
    spatialChannels: number;
    semanticDim: number;
    cases: number;
    readouts: PythonReadout[];
}

function arg(name: string): string {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少必需参数 ${name}`);
    return process.argv[index + 1];
}

function optionalArg(name: string, fallback: string): string {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sha256File(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function maxAbsDiff(left: readonly number[], right: readonly number[]): number {
    if (left.length !== right.length) return Number.POSITIVE_INFINITY;
    let worst = 0;
    for (let i = 0; i < left.length; i += 1) {
        if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) return Number.POSITIVE_INFINITY;
        worst = Math.max(worst, Math.abs(left[i] - right[i]));
    }
    return worst;
}

function writeJson(file: string, value: unknown): void {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main(): void {
    const modelPath = path.resolve(arg('--model'));
    const outDir = path.resolve(arg('--out-dir'));
    const python = arg('--python');
    const manifestPath = path.resolve(optionalArg('--manifest', DEFAULT_MANIFEST));

    if (!fs.existsSync(modelPath)) throw new Error(`检查点不存在：${modelPath}`);
    if (!fs.existsSync(manifestPath)) throw new Error(`窗口清单不存在：${manifestPath}`);
    if (fs.existsSync(outDir)) throw new Error(`输出目录已存在，拒绝覆盖：${outDir}`);

    const modelText = fs.readFileSync(modelPath, 'utf8');
    const declared = JSON.parse(modelText) as { encoderSchemaId?: string; spatialChannels?: number };
    const acceptedSchemas = [ENCODER_SCHEMA_ID_V19, ENCODER_SCHEMA_ID_V19_PATH3] as const;
    if (!acceptedSchemas.includes(declared.encoderSchemaId as typeof acceptedSchemas[number])
        || declared.spatialChannels !== SPATIAL_TENSOR_CHANNELS_V19) {
        throw new Error(
            `只接受34通道V19 53/56维检查点：schema=${String(declared.encoderSchemaId)} `
            + `channels=${String(declared.spatialChannels)}`,
        );
    }
    const expectedSchema = declared.encoderSchemaId as typeof acceptedSchemas[number];
    const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(modelText, {
        expectedEncoderSchemaId: expectedSchema,
    }));
    if (predictor.spatialChannels !== SPATIAL_TENSOR_CHANNELS_V19) {
        throw new Error(`推理器空间通道应为34，实际 ${predictor.spatialChannels}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
    if (manifest.schema !== 'v19_fresh_window_manifest_1' || !Array.isArray(manifest.entries)) {
        throw new Error(`窗口清单schema不受支持：${String(manifest.schema)}`);
    }
    const devEntries = manifest.entries.filter((entry) => entry.group === 'dev');
    if (devEntries.length !== 20) throw new Error(`冻结DEV根应为20个，实际 ${devEntries.length}`);
    if (new Set(devEntries.map((entry) => entry.windowId)).size !== devEntries.length) {
        throw new Error('冻结DEV根含重复windowId');
    }

    fs.mkdirSync(outDir, { recursive: false });
    const casesPath = path.join(outDir, 'cases.jsonl');
    const tsPath = path.join(outDir, 'typescript_forward.json');
    const pythonPath = path.join(outDir, 'python_forward.json');
    const reportPath = path.join(outDir, 'report.json');
    const tsReadouts: Array<{
        caseId: string;
        mapIndex: number;
        mapName: string;
        seed: number;
        playerId: number;
        candidateActionCodes: string[];
        actionLogits: number[];
        bestActionIndex: number;
        bestActionCode: string | null;
        value: number;
    }> = [];
    const caseLines: string[] = [];

    for (const entry of devEntries) {
        const state = JSON.parse(entry.rootStateJson) as GameState;
        if (state.currentPlayer !== entry.ownSeat) {
            throw new Error(`${entry.windowId}: currentPlayer=${state.currentPlayer} 与 ownSeat=${entry.ownSeat} 不同`);
        }
        if (entry.rootStateSha256) {
            const actual = createHash('sha256').update(canonicalJson(state)).digest('hex');
            if (actual !== entry.rootStateSha256) throw new Error(`${entry.windowId}: rootStateSha256不匹配`);
        }
        const engine = new GameEngine(state);
        const legal = engine.getLegalActions(state.currentPlayer).filter((action) => action.type !== 'surrender');
        const ordered = canonicalActionOrderV16(legal);
        if (ordered.length !== entry.legalActionCount) {
            throw new Error(`${entry.windowId}: 合法动作数 ${ordered.length} 与清单 ${entry.legalActionCount} 不同`);
        }
        if (ordered.length === 0) throw new Error(`${entry.windowId}: 没有可供前向的候选动作`);

        const encoded = encodeGameStateSpatial(state, state.currentPlayer, 'v2', {
            channels: SPATIAL_TENSOR_CHANNELS_V19,
        });
        const features = encodeCandidateActionsSpatialForSchema(
            state, state.currentPlayer, ordered.map(({ action }) => action),
            'v2', predictor.encoderSchemaId,
        );
        const candidates = ordered.map(({ code }, index) => {
            const feature = features[index];
            return {
                actionCode: code,
                actorCoord: feature.actorCoord,
                landingCoord: feature.landingCoord,
                targetCoord: feature.targetCoord,
                semantics: Array.from(feature.semantics),
            };
        });
        const prediction = predictor.predict(encoded, candidates);
        const codes = candidates.map((candidate) => candidate.actionCode);
        caseLines.push(JSON.stringify({
            caseId: entry.windowId,
            spatialTensor: Array.from(encoded.spatialTensor),
            globalFeatures: Array.from(encoded.globalFeatures),
            candidateActions: candidates,
        }));
        tsReadouts.push({
            caseId: entry.windowId,
            mapIndex: entry.mapIndex,
            mapName: entry.mapName,
            seed: entry.seed,
            playerId: state.currentPlayer,
            candidateActionCodes: codes,
            actionLogits: prediction.actionLogits,
            bestActionIndex: prediction.bestActionIndex,
            bestActionCode: codes[prediction.bestActionIndex] ?? null,
            value: prediction.value,
        });
    }

    fs.writeFileSync(casesPath, `${caseLines.join('\n')}\n`, 'utf8');
    const modelSha256 = sha256File(modelPath);
    const manifestSha256 = sha256File(manifestPath);
    writeJson(tsPath, {
        schema: 'v19_checkpoint_parity_ts_1',
        checkpointPath: modelPath.replace(/\\/g, '/'),
        checkpointSha256: modelSha256,
        encoderSchemaId: predictor.encoderSchemaId,
        spatialChannels: predictor.spatialChannels,
        semanticDim: predictor.semanticDim,
        manifestPath: manifestPath.replace(/\\/g, '/'),
        manifestSha256,
        group: 'dev',
        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
        cases: tsReadouts.length,
        readouts: tsReadouts,
    });

    const verifyScript = path.resolve('python/verify_parity.py');
    execFileSync(python, [
        verifyScript, '--batch', modelPath, casesPath, pythonPath,
        '--expect-schema', expectedSchema,
    ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });

    const py = JSON.parse(fs.readFileSync(pythonPath, 'utf8')) as PythonOutput;
    const pyById = new Map(py.readouts.map((item) => [item.caseId, item]));
    const rows = tsReadouts.map((ts) => {
        const item = pyById.get(ts.caseId);
        const logitMaxAbsDiff = item ? maxAbsDiff(ts.actionLogits, item.actionLogits) : Number.POSITIVE_INFINITY;
        const valueAbsDiff = item && Number.isFinite(item.value)
            ? Math.abs(ts.value - item.value) : Number.POSITIVE_INFINITY;
        const pythonBestActionCode = item ? ts.candidateActionCodes[item.bestActionIndex] ?? null : null;
        const argmaxMatches = Boolean(item) && ts.bestActionIndex === item!.bestActionIndex
            && ts.bestActionCode === pythonBestActionCode;
        const passed = logitMaxAbsDiff <= THRESHOLD && valueAbsDiff <= THRESHOLD && argmaxMatches;
        return {
            caseId: ts.caseId,
            candidateCount: ts.candidateActionCodes.length,
            candidateActionCodes: ts.candidateActionCodes,
            typescriptBestActionIndex: ts.bestActionIndex,
            pythonBestActionIndex: item?.bestActionIndex ?? null,
            bestActionCode: ts.bestActionCode,
            pythonBestActionCode,
            logitMaxAbsDiff,
            valueAbsDiff,
            argmaxMatches,
            passed,
        };
    });
    const duplicatePythonIds = py.readouts.length - pyById.size;
    const missingPythonIds = rows.filter((row) => !pyById.has(row.caseId)).map((row) => row.caseId);
    const extraPythonIds = [...pyById.keys()].filter((id) => !tsReadouts.some((item) => item.caseId === id));
    const maxLogitDiff = Math.max(...rows.map((row) => row.logitMaxAbsDiff));
    const maxValueDiff = Math.max(...rows.map((row) => row.valueAbsDiff));
    const passed = py.checkpointEncoderSchemaId === expectedSchema
        && py.spatialChannels === SPATIAL_TENSOR_CHANNELS_V19
        && py.semanticDim === predictor.semanticDim
        && py.cases === tsReadouts.length
        && duplicatePythonIds === 0 && missingPythonIds.length === 0 && extraPythonIds.length === 0
        && rows.every((row) => row.passed);
    const report = {
        schema: 'v19_checkpoint_parity_report_1',
        generatedAt: new Date().toISOString(),
        passed,
        threshold: { logitsMaxAbs: THRESHOLD, valueAbs: THRESHOLD, argmaxMustMatch: true },
        checkpoint: {
            path: modelPath.replace(/\\/g, '/'), sha256: modelSha256,
            encoderSchemaId: predictor.encoderSchemaId,
            spatialChannels: predictor.spatialChannels, semanticDim: predictor.semanticDim,
        },
        input: {
            manifestPath: manifestPath.replace(/\\/g, '/'), manifestSha256,
            group: 'dev', cases: tsReadouts.length,
            candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
            note: '只使用冻结DEV20根做单次前向，不读取标签或胜负，不推进游戏。',
        },
        python: { executable: python, cases: py.cases, schema: py.checkpointEncoderSchemaId },
        summary: {
            maxLogitAbsDiff: maxLogitDiff,
            maxValueAbsDiff: maxValueDiff,
            argmaxMismatches: rows.filter((row) => !row.argmaxMatches).length,
            failedCases: rows.filter((row) => !row.passed).length,
            duplicatePythonIds, missingPythonIds, extraPythonIds,
        },
        cases: rows,
        artifacts: {
            cases: 'cases.jsonl', typescriptForward: 'typescript_forward.json',
            pythonForward: 'python_forward.json', report: 'report.json',
        },
    };
    writeJson(reportPath, report);
    console.log(JSON.stringify({
        passed, cases: rows.length, modelSha256,
        maxLogitAbsDiff: maxLogitDiff, maxValueAbsDiff: maxValueDiff,
        argmaxMismatches: report.summary.argmaxMismatches,
        report: reportPath.replace(/\\/g, '/'),
    }, null, 2));
    if (!passed) process.exitCode = 1;
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
}

