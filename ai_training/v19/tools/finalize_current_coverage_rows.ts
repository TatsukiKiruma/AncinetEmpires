/** 校验因收尾故障遗留的完整覆盖导出，并只补写缺失的 manifest。 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import type { GameState } from '../../src/game/types';
import {
    ENCODER_SCHEMA_ID_V19,
    SPATIAL_TENSOR_CHANNELS_V19,
    SPATIAL_TENSOR_MAX_H,
    SPATIAL_TENSOR_MAX_W,
} from '../../src/game/ai/spatial_tensor_encoder';
import { stateHashOf } from '../../v15/tools/labeler_l1_v15';
import { sourceDigestsV16 } from '../../v16/tools/eval_v16_identity';
import { encodeRecoveredState } from '../data/encode_recovered_state';
import {
    selectCoverageCandidates,
    type CoverageCandidate,
    type SelectedCoverageCandidate,
} from './build_current_coverage_rows';

const DEFAULT_ROOT = 'v17/out/v17_20260926_r2/data/new_train/rollouts';
const ORIGINAL_RUNTIME_SOURCE = 'v19/out/coverage_20261004/coverage_export_initial.ts';
const FIXED_TOOL_SOURCE = 'v19/tools/build_current_coverage_rows.ts';
const ENCODER_SOURCE = 'v19/data/encode_recovered_state.ts';
const TEACHER_SOURCE = 'v18/tools/labeler_l1_v18.ts';
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

interface RawRolloutRow {
    trueFamilyId: string;
    stateHash: string;
    phaseBucket: string;
    behaviorActionCode: string;
    sourcePolicy: string;
    stateJson: string | GameState;
    mapIndex?: number;
}

interface ExistingCoverageRow {
    encoderSchemaId?: unknown;
    spatialTensor?: unknown;
    globalFeatures?: unknown;
    candidateActions?: unknown;
    orderedActionCodes?: unknown;
    targetActionIndex?: unknown;
    policyLossMask?: unknown;
    valueLossMask?: unknown;
    valueTarget?: unknown;
    stateHash?: unknown;
    inputIdentity?: unknown;
    rootFamilyId?: unknown;
    teacher?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
}

export function validateExistingCoverageRow(row: ExistingCoverageRow): string[] {
    const errors: string[] = [];
    const finite = (value: unknown): value is number[] => Array.isArray(value)
        && value.every((item) => typeof item === 'number' && Number.isFinite(item));
    if (row.encoderSchemaId !== ENCODER_SCHEMA_ID_V19) errors.push('encoderSchemaId 错误');
    const expectedSpatialLength = SPATIAL_TENSOR_CHANNELS_V19 * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W;
    if (!finite(row.spatialTensor) || row.spatialTensor.length !== expectedSpatialLength) errors.push('spatialTensor 错误');
    if (!finite(row.globalFeatures) || row.globalFeatures.length !== 20) errors.push('globalFeatures 错误');
    if (!Array.isArray(row.candidateActions) || row.candidateActions.length === 0) errors.push('candidateActions 错误');
    else if (row.candidateActions.some((candidate) => {
        const item = candidate as { semantics?: unknown };
        return !finite(item.semantics) || item.semantics.length !== 53;
    })) errors.push('candidate semantics 错误');
    if (!Array.isArray(row.orderedActionCodes) || row.orderedActionCodes.length !== (row.candidateActions as unknown[] | undefined)?.length) {
        errors.push('orderedActionCodes 错误');
    }
    if (!Number.isInteger(row.targetActionIndex)
        || (row.targetActionIndex as number) < 0
        || (row.targetActionIndex as number) >= ((row.orderedActionCodes as unknown[] | undefined)?.length ?? 0)) {
        errors.push('targetActionIndex 错误');
    }
    if (row.policyLossMask !== true || row.valueLossMask !== false || row.valueTarget !== null) errors.push('loss mask 错误');
    const teacher = row.teacher ?? {};
    if (!finite(teacher.rawScores)
        || teacher.rawScores.length !== ((row.orderedActionCodes as unknown[] | undefined)?.length ?? 0)) {
        errors.push('teacher rawScores 错误');
    }
    if (!Array.isArray(teacher.actionCodes)
        || JSON.stringify(teacher.actionCodes) !== JSON.stringify(row.orderedActionCodes)) {
        errors.push('teacher actionCodes 错误');
    }
    const targetCode = Array.isArray(row.orderedActionCodes)
        ? row.orderedActionCodes[row.targetActionIndex as number]
        : undefined;
    if (teacher.targetActionCode !== targetCode) errors.push('teacher targetActionCode 错误');
    if (typeof row.inputIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(row.inputIdentity)) errors.push('inputIdentity 错误');
    if (typeof row.stateHash !== 'string' || !/^[0-9a-f]{64}$/.test(row.stateHash)) errors.push('stateHash 错误');
    return errors;
}

function parseArgs(argv: readonly string[]) {
    const value = (name: string): string | undefined => {
        const index = argv.indexOf(name);
        return index < 0 ? undefined : argv[index + 1];
    };
    const outDir = value('--out-dir');
    if (!outDir) throw new Error('必须提供 --out-dir（已有导出目录）');
    const mapIndex = Number(value('--map-index'));
    if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex > 4) throw new Error('--map-index 必须是 0..4');
    const rowsPerFamily = Number(value('--rows-per-family') ?? '160');
    const sampleSize = Number(value('--reencode-samples') ?? '8');
    if (!Number.isInteger(rowsPerFamily) || rowsPerFamily <= 0) throw new Error('--rows-per-family 必须是正整数');
    if (!Number.isInteger(sampleSize) || sampleSize < 0) throw new Error('--reencode-samples 必须是非负整数');
    return { root: value('--root') ?? DEFAULT_ROOT, outDir, mapIndex, rowsPerFamily, sampleSize };
}

async function fileSha256(file: string): Promise<string> {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer);
    return digest.digest('hex');
}

function increment(table: Record<string, number>, key: string): void {
    table[key] = (table[key] ?? 0) + 1;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
    const { root, outDir, mapIndex, rowsPerFamily, sampleSize } = parseArgs(argv);
    const rowsPath = path.join(outDir, 'rows.jsonl');
    const errorsPath = path.join(outDir, 'errors.jsonl');
    const manifestPath = path.join(outDir, 'manifest.json');
    if (!existsSync(rowsPath) || !existsSync(errorsPath)) throw new Error('已有目录必须同时包含 rows.jsonl 与 errors.jsonl');
    if (existsSync(manifestPath)) throw new Error('manifest.json 已存在，拒绝覆盖');
    if (!existsSync(ORIGINAL_RUNTIME_SOURCE)) throw new Error(`缺少初版运行源码备份：${ORIGINAL_RUNTIME_SOURCE}`);

    const inputFiles = [
        `train_h0.m${mapIndex}.jsonl`,
        `train_student_P1s2026.m${mapIndex}.jsonl`,
        `train_student_P1s2026.b2m${mapIndex}.jsonl`,
    ];
    const available = new Set(await readdir(root));
    for (const file of inputFiles) if (!available.has(file)) throw new Error(`缺少输入文件：${file}`);

    const candidates: CoverageCandidate[] = [];
    const sourceFiles: Record<string, string> = {};
    let scannedRows = 0;
    for (const file of inputFiles) {
        const fullPath = path.join(root, file);
        sourceFiles[file] = await fileSha256(fullPath);
        let lineIndex = -1;
        for await (const line of createInterface({ input: createReadStream(fullPath), crlfDelay: Infinity })) {
            lineIndex++;
            if (!line.trim()) continue;
            const raw = JSON.parse(line) as RawRolloutRow;
            if (raw.mapIndex !== undefined && raw.mapIndex !== mapIndex) throw new Error(`${file}:${lineIndex} 地图编号不匹配`);
            candidates.push({
                trueFamilyId: raw.trueFamilyId, stateHash: raw.stateHash,
                phaseBucket: raw.phaseBucket, behaviorActionCode: raw.behaviorActionCode,
                sourcePolicy: raw.sourcePolicy, sourceFile: file, sourceLineIndex: lineIndex,
            });
            scannedRows++;
        }
    }
    const selected = selectCoverageCandidates(candidates, rowsPerFamily);
    const selectedByKey = new Map(selected.map((item) => [`${item.sourceFile}:${item.sourceLineIndex}`, item]));
    if (selectedByKey.size !== selected.length) throw new Error('选择集合出现重复来源键');

    // 再读原始来源，逐个验证 raw.stateJson 的真实哈希，并保存固定 SHA 排名前 N 个抽查状态。
    const sampleKeys = new Set([...selected]
        .sort((a, b) => a.selectionRank.localeCompare(b.selectionRank)).slice(0, sampleSize)
        .map((item) => `${item.sourceFile}:${item.sourceLineIndex}`));
    const sampleStates = new Map<string, GameState>();
    const verifiedSourceKeys = new Set<string>();
    for (const file of inputFiles) {
        let lineIndex = -1;
        for await (const line of createInterface({ input: createReadStream(path.join(root, file)), crlfDelay: Infinity })) {
            lineIndex++;
            const key = `${file}:${lineIndex}`;
            const selection = selectedByKey.get(key);
            if (!selection) continue;
            const raw = JSON.parse(line) as RawRolloutRow;
            const state = typeof raw.stateJson === 'string' ? JSON.parse(raw.stateJson) as GameState : raw.stateJson;
            const actualStateHash = stateHashOf(state);
            if (actualStateHash !== raw.stateHash || actualStateHash !== selection.stateHash) {
                throw new Error(`${key} 原始 stateJson/stateHash 不一致`);
            }
            if (raw.trueFamilyId !== selection.trueFamilyId) throw new Error(`${key} 原始家族不一致`);
            verifiedSourceKeys.add(key);
            if (sampleKeys.has(key)) sampleStates.set(key, state);
        }
    }
    if (verifiedSourceKeys.size !== selected.length) throw new Error('原始来源未完整覆盖选择集合');

    const seenCoverageKeys = new Set<string>();
    const seenInputIdentities = new Set<string>();
    const successStats = { phase: {} as Record<string, number>, actionType: {} as Record<string, number>, sourcePolicy: {} as Record<string, number> };
    const existingSampleRows = new Map<string, ExistingCoverageRow>();
    let successfulRows = 0;
    let rowsLineIndex = -1;
    for await (const line of createInterface({ input: createReadStream(rowsPath), crlfDelay: Infinity })) {
        rowsLineIndex++;
        if (!line.trim()) continue;
        const row = JSON.parse(line) as ExistingCoverageRow;
        const basicErrors = validateExistingCoverageRow(row);
        if (basicErrors.length > 0) throw new Error(`rows.jsonl:${rowsLineIndex} ${basicErrors.join('；')}`);
        const provenance = row.provenance ?? {};
        const sourceFile = path.basename(String(provenance.sourceFile ?? ''));
        const sourceLineIndex = Number(provenance.sourceLineIndex);
        const key = `${sourceFile}:${sourceLineIndex}`;
        const selection = selectedByKey.get(key);
        if (!selection) throw new Error(`rows.jsonl:${rowsLineIndex} 不属于重新计算的选择集合：${key}`);
        if (seenCoverageKeys.has(key)) throw new Error(`rows.jsonl 重复来源键：${key}`);
        if (row.stateHash !== selection.stateHash || provenance.sourceStateHash !== selection.stateHash) throw new Error(`${key} 状态哈希不一致`);
        if (provenance.sourceRootFamilyId !== selection.trueFamilyId
            || row.rootFamilyId !== `current:${selection.trueFamilyId}`) throw new Error(`${key} 家族不一致`);
        if (provenance.sourceFileSha256 !== sourceFiles[sourceFile]) throw new Error(`${key} 原文件 SHA 不一致`);
        if (provenance.phaseBucket !== selection.phaseBucket
            || provenance.behaviorActionCode !== selection.behaviorActionCode
            || provenance.sourcePolicy !== selection.sourcePolicy) throw new Error(`${key} 分层元数据不一致`);
        seenCoverageKeys.add(key);
        seenInputIdentities.add(row.inputIdentity as string);
        increment(successStats.phase, selection.phaseBucket);
        increment(successStats.actionType, selection.actionType);
        increment(successStats.sourcePolicy, selection.sourcePolicy);
        successfulRows++;
        if (sampleKeys.has(key)) existingSampleRows.set(key, row);
        if (successfulRows % 100 === 0) console.log(`已校验 ${successfulRows}/${selected.length} 个现存编码行`);
    }

    let errorCount = 0;
    let errorLineIndex = -1;
    for await (const line of createInterface({ input: createReadStream(errorsPath), crlfDelay: Infinity })) {
        errorLineIndex++;
        if (!line.trim()) continue;
        const error = JSON.parse(line) as { sourceFile?: unknown; sourceLineIndex?: unknown; stateHash?: unknown; trueFamilyId?: unknown };
        const key = `${String(error.sourceFile)}:${Number(error.sourceLineIndex)}`;
        const selection = selectedByKey.get(key);
        if (!selection) throw new Error(`errors.jsonl:${errorLineIndex} 不属于选择集合：${key}`);
        if (seenCoverageKeys.has(key)) throw new Error(`rows/errors 重复来源键：${key}`);
        if (error.stateHash !== selection.stateHash || error.trueFamilyId !== selection.trueFamilyId) throw new Error(`${key} 错误记录元数据不一致`);
        seenCoverageKeys.add(key);
        errorCount++;
    }
    if (seenCoverageKeys.size !== selected.length) {
        const missing = [...selectedByKey.keys()].filter((key) => !seenCoverageKeys.has(key));
        throw new Error(`rows/errors 未完整覆盖选择集合，缺少 ${missing.length} 项，示例：${missing.slice(0, 3).join(', ')}`);
    }

    let reencodedSamples = 0;
    for (const key of sampleKeys) {
        const state = sampleStates.get(key);
        const existing = existingSampleRows.get(key);
        if (!state || !existing) continue;
        const reencoded = encodeRecoveredState(state);
        if (reencoded.stateHash !== existing.stateHash
            || reencoded.inputIdentity !== existing.inputIdentity
            || reencoded.targetActionIndex !== existing.targetActionIndex
            || JSON.stringify(reencoded.orderedActionCodes) !== JSON.stringify(existing.orderedActionCodes)) {
            throw new Error(`${key} 少量重编码抽查不一致`);
        }
        reencodedSamples++;
    }

    const selectedFamilies: Record<string, number> = {};
    const selectedStats = { phase: {} as Record<string, number>, actionType: {} as Record<string, number>, sourcePolicy: {} as Record<string, number> };
    for (const item of selected) {
        increment(selectedFamilies, item.trueFamilyId);
        increment(selectedStats.phase, item.phaseBucket);
        increment(selectedStats.actionType, item.actionType);
        increment(selectedStats.sourcePolicy, item.sourcePolicy);
    }
    const manifest = {
        kind: 'v19-current-coverage-relabel', recoveryStatus: 'recovered_after_finalize_failure',
        originalRunExitSuccess: false,
        recoveryExplanation: '编码行已完整写出并关闭，但初版 CLI 在动态导入 writeFile 前被模块运行器关闭；本 manifest 由独立校验器恢复。',
        mapIndex, root: root.replace(/\\/g, '/'), inputFiles, scannedRows, rowsPerFamily,
        selectedRows: selected.length, selectedFamilies, successfulRows, errorCount,
        errorsPresent: errorCount > 0, distinctInputIdentities: seenInputIdentities.size,
        selectionContract: 'v19-current-coverage-20261004-v1:phaseBucket×behaviorActionType/sourcePolicy-round-robin',
        selectionUsesTeacherOrModelOutputs: false,
        selectedStats, successStats,
        coverageVerification: {
            selectedSourceStatesVerified: verifiedSourceKeys.size,
            rowsAndErrorsCovered: seenCoverageKeys.size,
            missing: 0, duplicateSourceKeys: 0,
            basicEncodedRowsVerified: successfulRows,
            deterministicReencodeRequested: sampleSize,
            deterministicReencodeCompleted: reencodedSamples,
            deterministicReencodeScope: '固定 selectionRank 最小的成功行；仅作抽查，不代表全体重算',
        },
        provenance: 'existing_current_rules_training_relabelled_h0',
        independentGeneralizationEvidence: false,
        sourceDigestV16: sourceDigestsV16(process.cwd()), sourceFiles,
        originalRuntimeSourcePath: ORIGINAL_RUNTIME_SOURCE,
        originalRuntimeSourceSha256: sha256(await readFile(ORIGINAL_RUNTIME_SOURCE)),
        fixedToolSha256: sha256(await readFile(FIXED_TOOL_SOURCE)),
        finalizerSha256: sha256(await readFile('v19/tools/finalize_current_coverage_rows.ts')),
        encoderSha256: sha256(await readFile(ENCODER_SOURCE)),
        teacherSha256: sha256(await readFile(TEACHER_SOURCE)),
        rowsSha256: await fileSha256(rowsPath), errorsSha256: await fileSha256(errorsPath),
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ mapIndex, selectedRows: selected.length, successfulRows, errorCount, reencodedSamples }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    try {
        await main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
