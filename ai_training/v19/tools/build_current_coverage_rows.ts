/** 从既有当前规则训练轨迹中，按家族分层抽取覆盖训练行。 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import type { GameState } from '../../src/game/types';
import { sourceDigestsV16 } from '../../v16/tools/eval_v16_identity';
import { encodeRecoveredState } from '../data/encode_recovered_state';

const DEFAULT_ROOT = 'v17/out/v17_20260926_r2/data/new_train/rollouts';
const SELECTION_SALT = 'v19-current-coverage-20261004-v1';

export interface CoverageCandidate {
    trueFamilyId: string;
    stateHash: string;
    phaseBucket: string;
    behaviorActionCode: string;
    sourcePolicy: string;
    sourceFile: string;
    sourceLineIndex: number;
}

export interface SelectedCoverageCandidate extends CoverageCandidate {
    actionType: string;
    selectionRank: string;
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const actionTypeOf = (code: string): string => code.split(':', 1)[0] || 'unknown';

/**
 * 每个家族独立去重；桶内用固定 SHA 排序，先轮转 sourcePolicy，再轮转 phase×动作类型桶。
 * 本函数不读取教师标签、验证集或模型预测。
 */
export function selectCoverageCandidates(
    candidates: readonly CoverageCandidate[],
    rowsPerFamily: number,
): SelectedCoverageCandidate[] {
    if (!Number.isInteger(rowsPerFamily) || rowsPerFamily <= 0) throw new Error('rowsPerFamily 必须是正整数');
    const families = new Map<string, Map<string, CoverageCandidate>>();
    for (const candidate of candidates) {
        const family = families.get(candidate.trueFamilyId) ?? new Map<string, CoverageCandidate>();
        const previous = family.get(candidate.stateHash);
        const canonicalKey = `${candidate.sourceFile}\0${String(candidate.sourceLineIndex).padStart(12, '0')}`;
        const previousKey = previous
            ? `${previous.sourceFile}\0${String(previous.sourceLineIndex).padStart(12, '0')}`
            : null;
        if (previousKey === null || canonicalKey < previousKey) family.set(candidate.stateHash, candidate);
        families.set(candidate.trueFamilyId, family);
    }

    const selected: SelectedCoverageCandidate[] = [];
    for (const familyId of [...families.keys()].sort()) {
        const buckets = new Map<string, Map<string, SelectedCoverageCandidate[]>>();
        for (const candidate of families.get(familyId)!.values()) {
            const actionType = actionTypeOf(candidate.behaviorActionCode);
            const bucketKey = `${candidate.phaseBucket}\0${actionType}`;
            const sources = buckets.get(bucketKey) ?? new Map<string, SelectedCoverageCandidate[]>();
            const queue = sources.get(candidate.sourcePolicy) ?? [];
            queue.push({
                ...candidate,
                actionType,
                selectionRank: sha256(`${SELECTION_SALT}:${candidate.trueFamilyId}:${candidate.stateHash}`),
            });
            sources.set(candidate.sourcePolicy, queue);
            buckets.set(bucketKey, sources);
        }
        for (const sources of buckets.values()) {
            for (const queue of sources.values()) {
                queue.sort((a, b) => a.selectionRank.localeCompare(b.selectionRank)
                    || a.sourceFile.localeCompare(b.sourceFile) || a.sourceLineIndex - b.sourceLineIndex);
            }
        }

        // 每个桶内部也轮转来源，避免一个来源先耗尽家族额度。
        const bucketQueues = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sources]) => {
            const sourceNames = [...sources.keys()].sort();
            const flattened: SelectedCoverageCandidate[] = [];
            let offset = 0;
            while (true) {
                let added = false;
                for (const source of sourceNames) {
                    const item = sources.get(source)![offset];
                    if (item) { flattened.push(item); added = true; }
                }
                if (!added) break;
                offset++;
            }
            return flattened;
        });
        let familySelected = 0;
        for (let offset = 0; familySelected < rowsPerFamily; offset++) {
            let added = false;
            for (const queue of bucketQueues) {
                const item = queue[offset];
                if (!item) continue;
                selected.push(item);
                familySelected++;
                added = true;
                if (familySelected >= rowsPerFamily) break;
            }
            if (!added) break;
        }
    }
    return selected;
}

interface RawRolloutRow extends CoverageCandidate {
    stateJson: string | GameState;
    gameId?: string;
    initializationPolicyId?: string;
    rootId?: string;
    mapIndex?: number;
}

function parseArgs(argv: readonly string[]) {
    const value = (name: string): string | undefined => {
        const index = argv.indexOf(name);
        return index < 0 ? undefined : argv[index + 1];
    };
    const outDir = value('--out-dir');
    if (!outDir) throw new Error('必须提供 --out-dir，且应指向一个不存在的新目录');
    const mapIndex = Number(value('--map-index'));
    if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex > 4) throw new Error('--map-index 必须是 0..4');
    const rowsPerFamily = Number(value('--rows-per-family') ?? '160');
    if (!Number.isInteger(rowsPerFamily) || rowsPerFamily <= 0) throw new Error('--rows-per-family 必须是正整数');
    return { root: value('--root') ?? DEFAULT_ROOT, outDir, mapIndex, rowsPerFamily };
}

async function fileSha256(file: string): Promise<string> {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer);
    return digest.digest('hex');
}

async function writeLine(stream: ReturnType<typeof createWriteStream>, digest: ReturnType<typeof createHash>, row: unknown) {
    const line = `${JSON.stringify(row)}\n`;
    digest.update(line, 'utf8');
    if (!stream.write(line, 'utf8')) await once(stream, 'drain');
}

function increment(table: Record<string, number>, key: string): void {
    table[key] = (table[key] ?? 0) + 1;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
    const { root, outDir, mapIndex, rowsPerFamily } = parseArgs(argv);
    if (existsSync(outDir)) throw new Error('输出目录已存在，拒绝覆盖');
    const expectedFiles = [
        `train_h0.m${mapIndex}.jsonl`,
        `train_student_P1s2026.m${mapIndex}.jsonl`,
        `train_student_P1s2026.b2m${mapIndex}.jsonl`,
    ];
    const available = new Set(await readdir(root));
    for (const file of expectedFiles) if (!available.has(file)) throw new Error(`缺少输入文件：${file}`);

    const candidates: CoverageCandidate[] = [];
    const sourceFiles: Record<string, string> = {};
    let scannedRows = 0;
    for (const file of expectedFiles) {
        const fullPath = path.join(root, file);
        sourceFiles[file] = await fileSha256(fullPath);
        let lineIndex = -1;
        for await (const line of createInterface({ input: createReadStream(fullPath), crlfDelay: Infinity })) {
            lineIndex++;
            if (!line.trim()) continue;
            const raw = JSON.parse(line) as RawRolloutRow;
            if (raw.mapIndex !== undefined && raw.mapIndex !== mapIndex) throw new Error(`${file}:${lineIndex} 地图编号不匹配`);
            for (const key of ['trueFamilyId', 'stateHash', 'phaseBucket', 'behaviorActionCode', 'sourcePolicy', 'stateJson'] as const) {
                if (raw[key] === undefined || raw[key] === null || raw[key] === '') throw new Error(`${file}:${lineIndex} 缺少 ${key}`);
            }
            scannedRows++;
            candidates.push({
                trueFamilyId: raw.trueFamilyId,
                stateHash: raw.stateHash,
                phaseBucket: raw.phaseBucket,
                behaviorActionCode: raw.behaviorActionCode,
                sourcePolicy: raw.sourcePolicy,
                sourceFile: file,
                sourceLineIndex: lineIndex,
            });
        }
    }
    const selected = selectCoverageCandidates(candidates, rowsPerFamily);
    const selectedKeys = new Set(selected.map((row) => `${row.sourceFile}:${row.sourceLineIndex}`));
    const selectedByKey = new Map(selected.map((row) => [`${row.sourceFile}:${row.sourceLineIndex}`, row]));
    await mkdir(outDir, { recursive: true });

    const rowsStream = createWriteStream(path.join(outDir, 'rows.jsonl'), { encoding: 'utf8', flags: 'wx' });
    const errorsStream = createWriteStream(path.join(outDir, 'errors.jsonl'), { encoding: 'utf8', flags: 'wx' });
    const rowsDigest = createHash('sha256');
    const errorsDigest = createHash('sha256');
    const inputIdentities = new Set<string>();
    const successStats = { phase: {} as Record<string, number>, actionType: {} as Record<string, number>, sourcePolicy: {} as Record<string, number> };
    let successfulRows = 0;
    let errorCount = 0;
    for (const file of expectedFiles) {
        let lineIndex = -1;
        for await (const line of createInterface({ input: createReadStream(path.join(root, file)), crlfDelay: Infinity })) {
            lineIndex++;
            const key = `${file}:${lineIndex}`;
            if (!selectedKeys.has(key)) continue;
            const selection = selectedByKey.get(key)!;
            try {
                const raw = JSON.parse(line) as RawRolloutRow;
                const state = typeof raw.stateJson === 'string' ? JSON.parse(raw.stateJson) as GameState : raw.stateJson;
                const encoded = encodeRecoveredState(state);
                const rootFamilyId = `current:${raw.trueFamilyId}`;
                await writeLine(rowsStream, rowsDigest, {
                    ...encoded,
                    stateJson: state,
                    sampleId: `current:${file}:${lineIndex}`,
                    rootFamilyId,
                    episodeId: raw.gameId ?? `current-episode:${file}:${lineIndex}`,
                    provenance: {
                        familyId: rootFamilyId,
                        sourceFile: path.join(root, file).replace(/\\/g, '/'),
                        sourceFileSha256: sourceFiles[file],
                        sourceLineIndex: lineIndex,
                        sourceStateHash: raw.stateHash,
                        sourceRootFamilyId: raw.trueFamilyId,
                        phaseBucket: raw.phaseBucket,
                        behaviorActionCode: raw.behaviorActionCode,
                        behaviorActionType: selection.actionType,
                        sourcePolicy: raw.sourcePolicy,
                        initializationPolicyId: raw.initializationPolicyId ?? null,
                        sourceRootId: raw.rootId ?? null,
                        dataRole: 'existing_current_rules_training_relabelled_h0',
                        independentGeneralizationEvidence: false,
                    },
                });
                successfulRows++;
                inputIdentities.add(encoded.inputIdentity);
                increment(successStats.phase, raw.phaseBucket);
                increment(successStats.actionType, selection.actionType);
                increment(successStats.sourcePolicy, raw.sourcePolicy);
                if (successfulRows % 100 === 0) console.log(`已编码 ${successfulRows}/${selected.length} 行`);
            } catch (error) {
                errorCount++;
                await writeLine(errorsStream, errorsDigest, {
                    sourceFile: file, sourceLineIndex: lineIndex, stateHash: selection.stateHash,
                    trueFamilyId: selection.trueFamilyId, error: String(error),
                });
            }
        }
    }
    rowsStream.end();
    errorsStream.end();
    await Promise.all([once(rowsStream, 'finish'), once(errorsStream, 'finish')]);

    const selectedStats = { phase: {} as Record<string, number>, actionType: {} as Record<string, number>, sourcePolicy: {} as Record<string, number> };
    const selectedFamilies: Record<string, number> = {};
    for (const row of selected) {
        increment(selectedFamilies, row.trueFamilyId);
        increment(selectedStats.phase, row.phaseBucket);
        increment(selectedStats.actionType, row.actionType);
        increment(selectedStats.sourcePolicy, row.sourcePolicy);
    }
    const toolFile = 'v19/tools/build_current_coverage_rows.ts';
    const encoderFile = 'v19/data/encode_recovered_state.ts';
    const teacherFile = 'v18/tools/labeler_l1_v18.ts';
    const manifest = {
        kind: 'v19-current-coverage-relabel', mapIndex, root: root.replace(/\\/g, '/'),
        inputFiles: expectedFiles, scannedRows, rowsPerFamily,
        selectedRows: selected.length, selectedFamilies,
        successfulRows, errorCount, errorsPresent: errorCount > 0,
        distinctInputIdentities: inputIdentities.size,
        selectionContract: `${SELECTION_SALT}:phaseBucket×behaviorActionType/sourcePolicy-round-robin`,
        selectionUsesTeacherOrModelOutputs: false,
        selectedStats, successStats,
        provenance: 'existing_current_rules_training_relabelled_h0',
        independentGeneralizationEvidence: false,
        sourceDigestV16: sourceDigestsV16(process.cwd()),
        sourceFiles,
        toolSha256: sha256(await readFile(toolFile)),
        encoderSha256: sha256(await readFile(encoderFile)),
        teacherSha256: sha256(await readFile(teacherFile)),
        rowsSha256: rowsDigest.digest('hex'),
        errorsSha256: errorsDigest.digest('hex'),
    };
    await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ mapIndex, scannedRows, selectedRows: selected.length, successfulRows, errorCount }));
    if (errorCount > 0) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    try {
        await main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
