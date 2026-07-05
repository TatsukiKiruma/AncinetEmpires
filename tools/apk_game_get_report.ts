import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    APK_REPLAY_EVENT_TYPES,
    APK_REPLAY_MAGIC,
    parseDecryptedApkReplayActions,
    type ApkReplayActionRecord,
    type ApkReplayEventType
} from '../src/game/apk_replay';
import { decryptApkResourceBytes } from './apk_resource_crypto';

const ROOM_TYPES = ['PUBLIC', 'PRIVATE'] as const;
const ROOM_STATUSES = ['OPEN', 'STARTED', 'CLOSED'] as const;
const DEFAULT_MAX_RECORDS = 100000;
const C0635F_TYPE_NAMES: Record<number, string> = {
    0: 'boolean',
    1: 'int',
    2: 'float',
    3: 'long',
    4: 'string',
    5: 'object-bytes'
};

interface CliOptions {
    inputs: string[];
    all: boolean;
    rootDir: string;
    json: boolean;
    exportReplay: boolean;
    sampleCount: number;
    maxRecords: number;
}

interface C0635fValueSummary {
    key: string;
    type: number | null;
    typeName: string;
    valueLength: number | null;
}

export interface ParsedC0635fValue {
    type: number;
    typeName: string;
    value: boolean | number | bigint | string | Uint8Array | null;
    valueLength: number | null;
}

export interface ParsedC1270o {
    magic: number;
    version: number;
    fields: Map<string, ParsedC0635fValue | null>;
    fieldSummaries: C0635fValueSummary[];
    remainingBytes: number;
}

export interface ReplayArrayCandidate {
    startOffset: number;
    endOffset: number;
    recordCount: number;
    remainingBytes: number;
    eventCounts: Record<ApkReplayEventType, number>;
    score: number;
}

export interface ParsedGameMetadata {
    roomType: string | null;
    status: string | null;
    deadlineAtMs: number | null;
    deadlineAtIso: string | null;
    playerSlotCount: number;
    playerSlotValues: number[];
    occupiedPlayerIdCount: number;
    publicLabelCount: number;
    observerCount: number;
    mapObjectOffset: number;
    mapObjectLength: number | null;
    mapConfig: ParsedMapConfigSummary | null;
    currentStep: number | null;
    replaySplitIndex: number | null;
}

export interface ParsedMapConfigSummary {
    campaignLike: boolean | null;
    terrainDefinitionCount: number;
    unitDefinitionCount: number;
    width: number | null;
    height: number | null;
    authorLength: number | null;
    playerIds: number[];
    terrainValueCount: number;
    unitRecordCount: number;
    recommendedGold: number | null;
}

export interface GameGetReport {
    inputPath: string;
    encrypted: boolean;
    encryptedBytes: number;
    decryptedBytes: number;
    top: {
        magic: number;
        version: number;
        remainingBytes: number;
        fields: C0635fValueSummary[];
    };
    gameObjectBytes: number;
    metadata: ParsedGameMetadata;
    replayArray: ReplayArrayCandidate;
    actionCount: number;
    eventCounts: Record<ApkReplayEventType, number>;
    sampleActions: ApkReplayActionRecord[];
    exportedReplayPath: string | null;
}

interface FileInfo {
    fullPath: string;
    mtimeMs: number;
    size: number;
}

class ApkObjectReader {
    private readonly view: DataView;

    constructor(
        private readonly data: Uint8Array,
        private readonly label: string,
        private offset = 0
    ) {
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }

    get position(): number {
        return this.offset;
    }

    set position(value: number) {
        if (value < 0 || value > this.data.byteLength) {
            throw new Error(`${this.label}: offset 越界 ${value}`);
        }
        this.offset = value;
    }

    get remainingBytes(): number {
        return this.data.byteLength - this.offset;
    }

    readBoolean(): boolean {
        this.requireBytes(1);
        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value !== 0;
    }

    readInt32(): number {
        this.requireBytes(4);
        const value = this.view.getInt32(this.offset, false);
        this.offset += 4;
        return value;
    }

    readUInt16(): number {
        this.requireBytes(2);
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
    }

    readFloat32(): number {
        this.requireBytes(4);
        const value = this.view.getFloat32(this.offset, false);
        this.offset += 4;
        return value;
    }

    readInt64(): bigint {
        this.requireBytes(8);
        const value = this.view.getBigInt64(this.offset, false);
        this.offset += 8;
        return value;
    }

    readBytes(length: number): Uint8Array {
        this.requireBytes(length);
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readJavaUtf(): string {
        const length = this.readUInt16();
        return decodeModifiedUtf8(this.readBytes(length));
    }

    readNullableString(): string | null {
        if (this.readBoolean()) return null;
        return this.readJavaUtf();
    }

    readNullableByteArray(): Uint8Array | null {
        if (this.readBoolean()) return null;
        const length = this.readInt32();
        if (length < 0) {
            throw new Error(`${this.label}: byte[] 长度无效 ${length}`);
        }
        return this.readBytes(length);
    }

    readNullableEnum(names: readonly string[]): string | null {
        if (this.readBoolean()) return null;
        const ordinal = this.readInt32();
        return names[ordinal] ?? `#${ordinal}`;
    }

    peekInt32(offset: number): number {
        if (offset < 0 || offset + 4 > this.data.byteLength) {
            throw new Error(`${this.label}: peekInt32 越界 ${offset}`);
        }
        return this.view.getInt32(offset, false);
    }

    private requireBytes(length: number) {
        if (length < 0 || this.offset + length > this.data.byteLength) {
            throw new Error(`${this.label}: 数据长度不足，offset=${this.offset}, length=${length}`);
        }
    }
}

function decodeModifiedUtf8(bytes: Uint8Array): string {
    const codeUnits: number[] = [];
    for (let index = 0; index < bytes.length;) {
        const first = bytes[index];
        if ((first & 0x80) === 0) {
            codeUnits.push(first);
            index += 1;
        } else if ((first & 0xe0) === 0xc0) {
            if (index + 1 >= bytes.length) throw new Error('Java UTF 字符串截断');
            const second = bytes[index + 1];
            codeUnits.push(((first & 0x1f) << 6) | (second & 0x3f));
            index += 2;
        } else if ((first & 0xf0) === 0xe0) {
            if (index + 2 >= bytes.length) throw new Error('Java UTF 字符串截断');
            const second = bytes[index + 1];
            const third = bytes[index + 2];
            codeUnits.push(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
            index += 3;
        } else {
            throw new Error(`Java UTF 字符串包含不支持的字节: 0x${first.toString(16)}`);
        }
    }

    const chunks: string[] = [];
    for (let index = 0; index < codeUnits.length; index += 0x8000) {
        chunks.push(String.fromCharCode(...codeUnits.slice(index, index + 0x8000)));
    }
    return chunks.join('');
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        inputs: [],
        all: false,
        rootDir: path.resolve('captures', 'mitm_replay'),
        json: false,
        exportReplay: true,
        sampleCount: 12,
        maxRecords: DEFAULT_MAX_RECORDS
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input') {
            options.inputs.push(argv[++index]);
        } else if (arg === '--all') {
            options.all = true;
        } else if (arg === '--dir') {
            options.rootDir = argv[++index];
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--no-export') {
            options.exportReplay = false;
        } else if (arg === '--sample') {
            options.sampleCount = parsePositiveInt(argv[++index], '--sample');
        } else if (arg === '--max-records') {
            options.maxRecords = parsePositiveInt(argv[++index], '--max-records');
        } else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
}

function parsePositiveInt(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${label} 需要正整数`);
    }
    return parsed;
}

function printUsage() {
    console.log(`用法:
  npm run apk:game-get-report -- [--input <game_get.bin>] [--all]

参数:
  --input <file>      指定一个抓到的 /api/game_get 响应体，可重复传入
  --all               未指定 --input 时分析 captures/mitm_replay 下全部 game_get_*.bin
  --dir <dir>         扫描目录，默认 captures/mitm_replay
  --sample <n>        输出前 n 条动作样例，默认 12
  --max-records <n>   扫描动作数组时允许的最大记录数，默认 ${DEFAULT_MAX_RECORDS}
  --no-export         不导出明文 .act 回放动作流
  --json              输出 JSON`);
}

function readC0601rObjectHeader(reader: ApkObjectReader, objectName: string): number {
    const magic = reader.readInt32();
    if (magic !== APK_REPLAY_MAGIC) {
        throw new Error(`${objectName}: 未知 magic ${magic}`);
    }
    if (reader.readBoolean()) {
        throw new Error(`${objectName}: 根对象为 null`);
    }
    return magic;
}

function parseC0635fValue(reader: ApkObjectReader): ParsedC0635fValue | null {
    if (reader.readBoolean()) return null;

    const type = reader.readInt32();
    const typeName = C0635F_TYPE_NAMES[type] ?? `unknown-${type}`;
    if (type === 0) {
        return { type, typeName, value: reader.readBoolean(), valueLength: null };
    }
    if (type === 1) {
        return { type, typeName, value: reader.readInt32(), valueLength: null };
    }
    if (type === 2) {
        return { type, typeName, value: reader.readFloat32(), valueLength: null };
    }
    if (type === 3) {
        return { type, typeName, value: reader.readInt64(), valueLength: null };
    }
    if (type === 4) {
        const bytes = reader.readNullableByteArray();
        return {
            type,
            typeName,
            value: bytes ? new TextDecoder().decode(bytes) : null,
            valueLength: bytes?.byteLength ?? null
        };
    }
    if (type === 5) {
        const bytes = reader.readNullableByteArray();
        return { type, typeName, value: bytes, valueLength: bytes?.byteLength ?? null };
    }

    return { type, typeName, value: null, valueLength: null };
}

function parseC1270o(data: Uint8Array): ParsedC1270o {
    const reader = new ApkObjectReader(data, 'C1270o');
    const magic = readC0601rObjectHeader(reader, 'C1270o');
    const version = reader.readInt32();
    const fieldCount = reader.readInt32();
    if (fieldCount < 0 || fieldCount > 1000) {
        throw new Error(`C1270o: 字段数量无效 ${fieldCount}`);
    }

    const fields = new Map<string, ParsedC0635fValue | null>();
    const fieldSummaries: C0635fValueSummary[] = [];
    for (let index = 0; index < fieldCount; index += 1) {
        const key = reader.readNullableString();
        if (key === null) {
            throw new Error(`C1270o: 第 ${index} 个字段 key 为 null`);
        }
        const value = parseC0635fValue(reader);
        fields.set(key, value);
        fieldSummaries.push({
            key,
            type: value?.type ?? null,
            typeName: value?.typeName ?? 'null',
            valueLength: value?.valueLength ?? null
        });
    }

    return {
        magic,
        version,
        fields,
        fieldSummaries,
        remainingBytes: reader.remainingBytes
    };
}

function parseMaybeEncryptedC1270o(raw: Uint8Array): { encrypted: boolean; decrypted: Uint8Array; parsed: ParsedC1270o } {
    try {
        return { encrypted: false, decrypted: raw, parsed: parseC1270o(raw) };
    } catch (rawError) {
        try {
            const decrypted = decryptApkResourceBytes(raw);
            return { encrypted: true, decrypted, parsed: parseC1270o(decrypted) };
        } catch (decryptError) {
            const rawMessage = rawError instanceof Error ? rawError.message : String(rawError);
            const decryptMessage = decryptError instanceof Error ? decryptError.message : String(decryptError);
            throw new Error(`无法解析 game_get 响应。明文尝试: ${rawMessage}；解密尝试: ${decryptMessage}`);
        }
    }
}

function parseNullableC1271pArray(reader: ApkObjectReader): {
    playerSlotCount: number;
    playerSlotValues: number[];
    occupiedPlayerIdCount: number;
    publicLabelCount: number;
} {
    if (reader.readBoolean()) {
        return {
            playerSlotCount: 0,
            playerSlotValues: [],
            occupiedPlayerIdCount: 0,
            publicLabelCount: 0
        };
    }

    const count = reader.readInt32();
    if (count < 0 || count > 32) {
        throw new Error(`C1271p[] 数量无效 ${count}`);
    }

    const playerSlotValues: number[] = [];
    let occupiedPlayerIdCount = 0;
    let publicLabelCount = 0;
    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) {
            continue;
        }
        playerSlotValues.push(reader.readInt32());
        const playerId = reader.readNullableString();
        const label = reader.readNullableString();
        if (playerId) occupiedPlayerIdCount += 1;
        if (label === 'public') publicLabelCount += 1;
    }

    return {
        playerSlotCount: count,
        playerSlotValues,
        occupiedPlayerIdCount,
        publicLabelCount
    };
}

function parseNullableStringArrayCount(reader: ApkObjectReader): number {
    if (reader.readBoolean()) return 0;
    const count = reader.readInt32();
    if (count < 0 || count > 10000) {
        throw new Error(`String[] 数量无效 ${count}`);
    }
    for (let index = 0; index < count; index += 1) {
        reader.readNullableString();
    }
    return count;
}

function readNullableIntArray(reader: ApkObjectReader, label: string, maxLength: number): number[] {
    if (reader.readBoolean()) return [];
    const count = reader.readInt32();
    if (count < 0 || count > maxLength) {
        throw new Error(`${label} 数量无效 ${count}`);
    }
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
        values.push(reader.readInt32());
    }
    return values;
}

function skipNullableC0619bArray(reader: ApkObjectReader): number {
    if (reader.readBoolean()) return 0;
    const count = reader.readInt32();
    if (count < 0 || count > 10000) {
        throw new Error(`C0619b[] 数量无效 ${count}`);
    }

    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) continue;
        reader.readBoolean();
        for (let field = 0; field < 5; field += 1) reader.readInt32();
        reader.readBoolean();
        reader.readInt32();
        reader.readInt32();
        readNullableIntArray(reader, 'C0619b.f1377j', 10000);
        reader.readInt32();
    }
    return count;
}

function skipNullableC0620cArray(reader: ApkObjectReader): number {
    if (reader.readBoolean()) return 0;
    const count = reader.readInt32();
    if (count < 0 || count > 10000) {
        throw new Error(`C0620c[] 数量无效 ${count}`);
    }

    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) continue;
        for (let field = 0; field < 15; field += 1) reader.readInt32();
        readNullableIntArray(reader, 'C0620c.f1394p', 10000);
        reader.readBoolean();
        reader.readBoolean();
    }
    return count;
}

function parseNullableC0618aSummary(reader: ApkObjectReader): {
    terrainDefinitionCount: number;
    unitDefinitionCount: number;
} {
    if (reader.readBoolean()) {
        return { terrainDefinitionCount: 0, unitDefinitionCount: 0 };
    }

    return {
        terrainDefinitionCount: skipNullableC0619bArray(reader),
        unitDefinitionCount: skipNullableC0620cArray(reader)
    };
}

function parseNullableC0616aSummary(reader: ApkObjectReader): Omit<
    ParsedMapConfigSummary,
    'campaignLike' | 'terrainDefinitionCount' | 'unitDefinitionCount'
> {
    if (reader.readBoolean()) {
        return {
            width: null,
            height: null,
            authorLength: null,
            playerIds: [],
            terrainValueCount: 0,
            unitRecordCount: 0,
            recommendedGold: null
        };
    }

    const width = reader.readInt32();
    const height = reader.readInt32();
    const author = reader.readNullableString();
    const playerIds = readNullableIntArray(reader, 'C0616a.f1354d', 32);
    const terrainValues = readNullableIntArray(reader, 'C0616a.f1355e', 100000);
    const unitValues = readNullableIntArray(reader, 'C0616a.f1356f', 100000);
    const recommendedGold = reader.readInt32();
    readNullableIntArray(reader, 'C0616a.f1358h', 32);
    readNullableIntArray(reader, 'C0616a.f1359i', 32);

    return {
        width,
        height,
        authorLength: author?.length ?? null,
        playerIds,
        terrainValueCount: terrainValues.length,
        unitRecordCount: Math.floor(unitValues.length / 5),
        recommendedGold
    };
}

function parseMapConfigSummaryFromReader(reader: ApkObjectReader): ParsedMapConfigSummary | null {
    try {
        if (reader.readBoolean()) return null;
        const campaignLike = reader.readBoolean();
        const definitions = parseNullableC0618aSummary(reader);
        const map = parseNullableC0616aSummary(reader);
        return {
            campaignLike,
            ...definitions,
            ...map
        };
    } catch {
        return null;
    }
}

function parseMapConfigSummary(gameObjectBytes: Uint8Array, mapObjectOffset: number): ParsedMapConfigSummary | null {
    return parseMapConfigSummaryFromReader(new ApkObjectReader(gameObjectBytes, 'C0585e', mapObjectOffset));
}

function buildEmptyEventCounts(): Record<ApkReplayEventType, number> {
    return Object.fromEntries(
        APK_REPLAY_EVENT_TYPES.map(eventType => [eventType, 0])
    ) as Record<ApkReplayEventType, number>;
}

function parseActionArrayCandidateAt(
    data: Uint8Array,
    startOffset: number,
    maxRecords: number
): ReplayArrayCandidate | null {
    if (startOffset + 5 > data.byteLength) return null;
    const reader = new ApkObjectReader(data, `C0578b[]@${startOffset}`, startOffset);
    try {
        if (reader.readBoolean()) return null;
        const recordCount = reader.readInt32();
        if (recordCount <= 0 || recordCount > maxRecords) return null;

        const expectedEnd = startOffset + 5 + recordCount * 42;
        if (expectedEnd > data.byteLength) return null;

        const eventCounts = buildEmptyEventCounts();
        for (let index = 0; index < recordCount; index += 1) {
            if (reader.readBoolean()) return null;
            for (let field = 0; field < 9; field += 1) {
                reader.readInt32();
            }
            if (reader.readBoolean()) return null;
            const ordinal = reader.readInt32();
            const eventType = APK_REPLAY_EVENT_TYPES[ordinal];
            if (!eventType) return null;
            eventCounts[eventType] += 1;
        }

        const remainingBytes = data.byteLength - reader.position;
        const score = recordCount * 1000 + (remainingBytes === 0 ? 100000000 : -remainingBytes);
        return {
            startOffset,
            endOffset: reader.position,
            recordCount,
            remainingBytes,
            eventCounts,
            score
        };
    } catch {
        return null;
    }
}

function findBestActionArrayCandidate(data: Uint8Array, maxRecords: number): ReplayArrayCandidate {
    let best: ReplayArrayCandidate | null = null;
    for (let offset = 0; offset < data.byteLength - 5; offset += 1) {
        const candidate = parseActionArrayCandidateAt(data, offset, maxRecords);
        if (!candidate) continue;
        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }

    if (!best) {
        throw new Error('未能在 C1258d.g 对象内定位 C0578b[] 动作数组');
    }
    return best;
}

function findBestEofActionArrayCandidate(data: Uint8Array, maxRecords: number): ReplayArrayCandidate | null {
    let best: ReplayArrayCandidate | null = null;
    for (let offset = 0; offset < data.byteLength - 5; offset += 1) {
        const candidate = parseActionArrayCandidateAt(data, offset, maxRecords);
        if (!candidate || candidate.remainingBytes !== 0) continue;
        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }
    return best;
}

function findEmbeddedActionArrayCandidate(data: Uint8Array, maxRecords: number): ReplayArrayCandidate {
    const reader = new ApkObjectReader(data, 'C1258d');
    readC0601rObjectHeader(reader, 'C1258d');

    reader.readNullableString();
    reader.readNullableString();
    reader.readNullableEnum(ROOM_TYPES);
    reader.readNullableEnum(ROOM_STATUSES);
    reader.readInt64();
    parseNullableC1271pArray(reader);
    parseNullableStringArrayCount(reader);
    parseMapConfigSummaryFromReader(reader);
    reader.readInt32();
    reader.readInt32();

    const candidate = parseActionArrayCandidateAt(data, reader.position, maxRecords);
    if (candidate?.remainingBytes === 0) return candidate;

    const fallback = findBestEofActionArrayCandidate(data, maxRecords);
    if (fallback) return fallback;
    if (candidate) {
        throw new Error(`C1258d: 动作数组未消费到对象末尾，remainingBytes=${candidate.remainingBytes}`);
    }
    throw new Error('C1258d: 未能定位 EOF 动作数组');
}

function buildPlainReplayBytes(gameObjectBytes: Uint8Array, candidate: ReplayArrayCandidate): Buffer {
    const actionArrayBytes = gameObjectBytes.slice(candidate.startOffset, candidate.endOffset);
    const plainReplay = Buffer.alloc(4 + actionArrayBytes.byteLength);
    plainReplay.writeInt32BE(APK_REPLAY_MAGIC, 0);
    Buffer.from(actionArrayBytes).copy(plainReplay, 4);
    return plainReplay;
}

function parseGameMetadata(gameObjectBytes: Uint8Array, candidate: ReplayArrayCandidate): ParsedGameMetadata {
    const reader = new ApkObjectReader(gameObjectBytes, 'C1258d');
    readC0601rObjectHeader(reader, 'C1258d');

    // 这里会读出房间 ID 和玩家 ID，但报告只保留非敏感统计，不输出原始 ID。
    reader.readNullableString();
    reader.readNullableString();
    const roomType = reader.readNullableEnum(ROOM_TYPES);
    const status = reader.readNullableEnum(ROOM_STATUSES);
    const deadlineAtBigInt = reader.readInt64();
    const deadlineAtMs = Number(deadlineAtBigInt);
    const playerStats = parseNullableC1271pArray(reader);
    const observerCount = parseNullableStringArrayCount(reader);
    const mapObjectOffset = reader.position;
    const mapObjectEndOffset = candidate.startOffset - 8;
    const mapObjectLength = mapObjectEndOffset >= mapObjectOffset ? mapObjectEndOffset - mapObjectOffset : null;
    const mapConfig = parseMapConfigSummary(gameObjectBytes, mapObjectOffset);
    const intReader = new ApkObjectReader(gameObjectBytes, 'C1258d-int-peek');
    const currentStep = candidate.startOffset >= 8 ? intReader.peekInt32(candidate.startOffset - 8) : null;
    const replaySplitIndex = candidate.startOffset >= 4 ? intReader.peekInt32(candidate.startOffset - 4) : null;

    return {
        roomType,
        status,
        deadlineAtMs: Number.isSafeInteger(deadlineAtMs) ? deadlineAtMs : null,
        deadlineAtIso: Number.isSafeInteger(deadlineAtMs) ? new Date(deadlineAtMs).toISOString() : null,
        ...playerStats,
        observerCount,
        mapObjectOffset,
        mapObjectLength,
        mapConfig,
        currentStep,
        replaySplitIndex
    };
}

function countEvents(actions: readonly ApkReplayActionRecord[]): Record<ApkReplayEventType, number> {
    const counts = buildEmptyEventCounts();
    for (const action of actions) {
        counts[action.eventType] += 1;
    }
    return counts;
}

async function collectGameGetFiles(rootDir: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    async function visit(dir: string) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await visit(fullPath);
            } else if (entry.isFile() && /^game_get_.*\.bin$/i.test(entry.name)) {
                const bytes = await readFile(fullPath);
                files.push({
                    fullPath: path.resolve(fullPath),
                    mtimeMs: 0,
                    size: bytes.byteLength
                });
            }
        }
    }

    await visit(path.resolve(rootDir));
    files.sort((left, right) => {
        const leftName = path.basename(left.fullPath);
        const rightName = path.basename(right.fullPath);
        return rightName.localeCompare(leftName);
    });
    return files;
}

async function resolveInputFiles(options: CliOptions): Promise<string[]> {
    if (options.inputs.length > 0) {
        return options.inputs.map(input => path.resolve(input));
    }

    const files = await collectGameGetFiles(options.rootDir);
    if (files.length === 0) {
        throw new Error(`未找到 game_get_*.bin：${path.resolve(options.rootDir)}`);
    }

    return (options.all ? files : files.slice(0, 1)).map(file => file.fullPath);
}

async function analyzeGameGetFile(inputPath: string, options: CliOptions): Promise<GameGetReport> {
    const resolvedInputPath = path.resolve(inputPath);
    const raw = await readFile(resolvedInputPath);
    const response = parseMaybeEncryptedC1270o(raw);
    const gameField = response.parsed.fields.get('g');
    if (!gameField || gameField.type !== 5 || !(gameField.value instanceof Uint8Array)) {
        throw new Error(`${resolvedInputPath}: 顶层响应缺少 object-bytes 字段 g`);
    }

    const gameObjectBytes = gameField.value;
    const replayArray = findEmbeddedActionArrayCandidate(gameObjectBytes, options.maxRecords);
    const plainReplayBytes = buildPlainReplayBytes(gameObjectBytes, replayArray);
    const parsedReplay = parseDecryptedApkReplayActions(plainReplayBytes);
    const metadata = parseGameMetadata(gameObjectBytes, replayArray);

    let exportedReplayPath: string | null = null;
    if (options.exportReplay) {
        const parsedPath = path.parse(resolvedInputPath);
        exportedReplayPath = path.join(parsedPath.dir, `${parsedPath.name}.replay.plain.act`);
        await writeFile(exportedReplayPath, plainReplayBytes);
    }

    return {
        inputPath: resolvedInputPath,
        encrypted: response.encrypted,
        encryptedBytes: raw.byteLength,
        decryptedBytes: response.decrypted.byteLength,
        top: {
            magic: response.parsed.magic,
            version: response.parsed.version,
            remainingBytes: response.parsed.remainingBytes,
            fields: response.parsed.fieldSummaries
        },
        gameObjectBytes: gameObjectBytes.byteLength,
        metadata,
        replayArray,
        actionCount: parsedReplay.actions.length,
        eventCounts: countEvents(parsedReplay.actions),
        sampleActions: parsedReplay.actions.slice(0, options.sampleCount),
        exportedReplayPath
    };
}

function formatEventCounts(counts: Record<ApkReplayEventType, number>): string {
    return APK_REPLAY_EVENT_TYPES
        .filter(eventType => counts[eventType] > 0)
        .map(eventType => `${eventType}=${counts[eventType]}`)
        .join(', ') || '-';
}

function formatPos(pos: { x: number; y: number } | null): string {
    return pos ? `(${pos.x},${pos.y})` : '-';
}

function renderActionSample(actions: readonly ApkReplayActionRecord[]): string[] {
    if (actions.length === 0) return [];
    const lines = [
        '',
        '| # | 事件 | 来源 | 移动 | 二段移动 | 目标 | 招募ID |',
        '| ---: | --- | --- | --- | --- | --- | ---: |'
    ];
    actions.forEach((action, index) => {
        lines.push([
            `| ${index}`,
            action.eventType,
            formatPos(action.source),
            formatPos(action.moveTo),
            formatPos(action.postMoveTo),
            formatPos(action.target),
            `${action.recruitUnitId} |`
        ].join(' | '));
    });
    return lines;
}

function renderMapConfig(mapConfig: ParsedMapConfigSummary | null): string {
    if (!mapConfig) return '-';
    const size = mapConfig.width !== null && mapConfig.height !== null ? `${mapConfig.width}x${mapConfig.height}` : '-';
    return [
        `size=${size}`,
        `players=[${mapConfig.playerIds.join(',')}]`,
        `terrain=${mapConfig.terrainValueCount}`,
        `units=${mapConfig.unitRecordCount}`,
        `recommendedGold=${mapConfig.recommendedGold ?? '-'}`,
        `defs=${mapConfig.terrainDefinitionCount}/${mapConfig.unitDefinitionCount}`,
        `campaignLike=${mapConfig.campaignLike === null ? '-' : mapConfig.campaignLike ? 'true' : 'false'}`
    ].join(', ');
}

function renderReport(report: GameGetReport): string {
    const lines = [
        `## ${path.basename(report.inputPath)}`,
        '',
        `- 文件：\`${report.inputPath}\``,
        `- 响应加密：${report.encrypted ? '是' : '否'}（${report.encryptedBytes} -> ${report.decryptedBytes} bytes）`,
        `- 顶层对象：magic=${report.top.magic}, version=${report.top.version}, fields=${report.top.fields.map(field => `${field.key}:${field.typeName}${field.valueLength === null ? '' : `(${field.valueLength})`}`).join(', ')}`,
        `- g 对象大小：${report.gameObjectBytes} bytes`,
        `- 房间类型/状态：${report.metadata.roomType ?? '-'} / ${report.metadata.status ?? '-'}`,
        `- 截止时间字段：${report.metadata.deadlineAtIso ?? '-'}`,
        `- 玩家槽位：${report.metadata.playerSlotCount} 个，非空玩家 ID 计数 ${report.metadata.occupiedPlayerIdCount}，public 标记 ${report.metadata.publicLabelCount}`,
        `- 旁观/附加字符串数：${report.metadata.observerCount}`,
        `- 地图对象片段：offset=${report.metadata.mapObjectOffset}, length=${report.metadata.mapObjectLength ?? '-'}`,
        `- 嵌入地图摘要：${renderMapConfig(report.metadata.mapConfig)}`,
        `- 回放进度字段：currentStep=${report.metadata.currentStep ?? '-'}, replaySplitIndex=${report.metadata.replaySplitIndex ?? '-'}`,
        `- 动作数组：offset=${report.replayArray.startOffset}, count=${report.actionCount}, remaining=${report.replayArray.remainingBytes}`,
        `- 事件分布：${formatEventCounts(report.eventCounts)}`,
        `- 导出明文 ACT：${report.exportedReplayPath ? `\`${report.exportedReplayPath}\`` : '未导出'}`
    ];

    lines.push(...renderActionSample(report.sampleActions));
    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const inputs = await resolveInputFiles(options);
    const reports: GameGetReport[] = [];
    for (const input of inputs) {
        reports.push(await analyzeGameGetFile(input, options));
    }

    if (options.json) {
        console.log(JSON.stringify(reports, (_key, value) => (
            typeof value === 'bigint' ? value.toString() : value
        ), 2));
        return;
    }

    console.log(['# AEII /api/game_get 回放响应分析', '', ...reports.map(renderReport)].join('\n\n'));
}

const isDirectRun = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}

export {
    analyzeGameGetFile,
    buildPlainReplayBytes,
    findEmbeddedActionArrayCandidate,
    findBestActionArrayCandidate,
    parseArgs,
    parseC1270o,
    parseMaybeEncryptedC1270o
};
