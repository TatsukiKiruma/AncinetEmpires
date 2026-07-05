import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_UNIT_ID_TO_CLASS } from '../src/game/apk_compat';
import { getExpThresholdForLevel } from '../src/game/abilities';
import { mapSkirmishApkTerrainId } from '../src/game/apk_terrain';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import {
    APK_REPLAY_EVENT_TYPES,
    parseDecryptedApkReplayActions,
    validateApkReplay,
    type ApkReplayActionRecord,
    type ApkReplayEventType,
    type ApkReplayStepDiagnostic,
    type ApkReplayValidationResult
} from '../src/game/apk_replay';
import { applyInitialRuleConfig, getTurnPlayerIds, mergeRuleConfig } from '../src/game/rule_config';
import type { TerrainId, Tile } from '../src/game/terrain';
import type {
    ApkSkirmishMode,
    GameState,
    LevelCap,
    PlayerState,
    Position,
    RuleConfig,
    Unit,
    UnitClass,
    UnitLevel
} from '../src/game/types';
import {
    buildPlainReplayBytes,
    findEmbeddedActionArrayCandidate,
    parseMaybeEncryptedC1270o,
    type ReplayArrayCandidate
} from './apk_game_get_report';

const APK_OBJECT_MAGIC = 365703;
const DEFAULT_MAX_RECORDS = 100000;
const ROOM_TYPES = ['PUBLIC', 'PRIVATE'] as const;
const ROOM_STATUSES = ['OPEN', 'STARTED', 'CLOSED'] as const;

interface CliOptions {
    inputs: string[];
    rootDir: string;
    outPath: string | null;
    json: boolean;
    mode: ApkSkirmishMode;
    maxRecords: number;
    offset: number;
    limit: number | null;
    uniqueOffset: number | null;
    uniqueLimit: number | null;
    dedupe: boolean;
    allowAmbiguousRecruit: boolean;
    strictTerrain: boolean;
    forceExecuteReplayActions: boolean;
}

interface EmbeddedMapData {
    width: number;
    height: number;
    author: string | null;
    playerIds: number[];
    terrainValues: number[];
    unitValues: number[];
    recommendedGold: number;
    playerPreset: number[];
    alliancePreset: number[];
}

interface EmbeddedTerrainDefinition {
    apkTerrainId: number;
    isLand: boolean;
    kind: number;
    variant: number;
    defenseBonus: number;
    healPerTurn: number;
    moveCost: number;
    capturableFlag: boolean;
    destroyedTileId: number;
    repairTileId: number;
    linkedTileIds: number[];
    sortOrder: number;
}

type RuleFieldName =
    | 'f1272a' | 'f1274c' | 'f1275d' | 'f1276e' | 'f1277f' | 'f1278g'
    | 'f1279h' | 'f1280i' | 'f1281j' | 'f1282k' | 'f1283l' | 'f1284m'
    | 'f1285n' | 'f1286o' | 'f1287p' | 'f1288q' | 'f1289r' | 'f1290s'
    | 'f1291t' | 'f1292u' | 'f1293v' | 'f1294w' | 'f1295x' | 'f1296y'
    | 'f1297z' | 'f1262A' | 'f1263B' | 'f1264C' | 'f1266E' | 'f1267F'
    | 'f1268G' | 'f1269H' | 'f1270I' | 'f1271J';

type EmbeddedRuleParams = Record<RuleFieldName, number>;

interface EmbeddedGameConfig {
    campaignLike: boolean;
    terrainDefinitionCount: number;
    terrainDefinitions: EmbeddedTerrainDefinition[];
    unitDefinitionCount: number;
    unitDefinitions: EmbeddedUnitDefinition[];
    map: EmbeddedMapData;
    rules: EmbeddedRuleParams;
    seed: bigint;
    scenarioCode: string | null;
    currentTeamField: number;
    initialGoldByTeam: number[];
    playerTypes: number[];
    allianceByTeam: number[];
    unitLimits: number[];
    mapObjectOffset: number;
    currentStep: number | null;
    replaySplitIndex: number | null;
    roomType: string | null;
    status: string | null;
    playerSlotCount: number;
    observerCount: number;
}

interface EmbeddedUnitDefinition {
    apkUnitId: number;
    unitClass: UnitClass | null;
    cost: number;
    population: number;
    attackElement: number;
    defenseShift: number;
    baseAttack: number;
    attackGrowth: number;
    baseDefense: number;
    defenseGrowth: number;
    baseMaxHp: number;
    maxHpGrowth: number;
    baseMove: number;
    moveGrowth: number;
    maxRange: number;
    minRange: number;
    abilityIds: number[];
    recruitableFlag: boolean;
    flagR: boolean;
}

interface ImportedUnitRecord {
    apkUnitId: number;
    teamId: number;
    level: number;
    x: number;
    y: number;
    unitClass: UnitClass | null;
}

interface StateBuildSummary {
    activeTeamIds: number[];
    disabledTeamIds: number[];
    defaultInitialGold: number;
    defaultUnitLimit: number;
    levelCap: LevelCap;
    approximateTerrainIds: number[];
    unmappedTerrainIds: number[];
    initialCurrentPlayer: number;
    priceOverrides: Partial<Record<UnitClass, number>>;
}

interface ParsedRemoteReplay {
    inputPath: string;
    sha256: string;
    encrypted: boolean;
    rawBytes: number;
    decryptedBytes: number;
    topFields: {
        key: string;
        type: number | null;
        typeName: string;
        valueLength: number | null;
    }[];
    topRemainingBytes: number;
    gameObjectBytes: Uint8Array;
    replayArray: ReplayArrayCandidate;
    actions: ApkReplayActionRecord[];
    config: EmbeddedGameConfig;
    initialState: GameState;
    stateSummary: StateBuildSummary;
}

interface ValidationReportItem {
    inputPath: string;
    fileName: string;
    sha256: string;
    duplicateOf: string | null;
    skipped: boolean;
    encrypted: boolean | null;
    rawBytes: number;
    decryptedBytes: number | null;
    gameObjectBytes: number | null;
    map: {
        width: number | null;
        height: number | null;
        scenarioCode: string | null;
        campaignLike: boolean | null;
        players: number[];
        terrainCount: number | null;
        unitCount: number | null;
        recommendedGold: number | null;
    };
    state: StateBuildSummary | null;
    actions: {
        count: number | null;
        eventCounts: Record<ApkReplayEventType, number> | null;
        remainingBytes: number | null;
    };
    diagnostics: {
        topFields: string[];
        topFieldSummaries: {
            key: string;
            type: number | null;
            typeName: string;
            valueLength: number | null;
        }[];
        topRemainingBytes: number | null;
        hasOnlyGameObjectField: boolean | null;
        gameObjectBytesConsumedByReplayArray: boolean | null;
        currentStep: number | null;
        replaySplitIndex: number | null;
        roomType: string | null;
        status: string | null;
    };
    validation: {
        success: boolean | null;
        executedRecordCount: number | null;
        expandedActionCount: number | null;
        firstError: string | null;
        firstErrorRecordIndex: number | null;
        firstErrorRecordEvent: ApkReplayEventType | null;
        firstErrorRecordSource: Position | null;
        firstErrorRecordMoveTo: Position | null;
        firstErrorRecordTarget: Position | null;
        firstErrorRecordRecruitUnitId: number | null;
        currentPlayerBefore: number | null;
        turnBefore: number | null;
        legalActionCount: number | null;
        info: string | null;
        actionCode: string | null;
        failureDiagnostic: ApkReplayStepDiagnostic | null;
        failureClassification: ReplayFailureClassification | null;
        finalTurn: number | null;
        finalCurrentPlayer: number | null;
        finalWinner: number | null;
    };
    error: string | null;
}

interface ReplayFailureClassification {
    code: 'strict_move_reachability_gap' | 'strict_move_destination_occupied' | 'unknown';
    label: string;
    detail: string;
}

interface ReplayFailureClassificationSummary {
    code: ReplayFailureClassification['code'];
    label: string;
    count: number;
    items: {
        fileName: string;
        recordIndex: number | null;
        eventType: ApkReplayEventType | null;
        actionCode: string | null;
    }[];
}

interface BatchValidationReport {
    generatedAt: string;
    options: {
        rootDir: string;
        mode: ApkSkirmishMode;
        maxRecords: number;
        offset: number;
        limit: number | null;
        uniqueOffset: number | null;
        uniqueLimit: number | null;
        dedupe: boolean;
        allowAmbiguousRecruit: boolean;
        strictTerrain: boolean;
        forceExecuteReplayActions: boolean;
    };
    totals: {
        files: number;
        uniqueFiles: number;
        duplicates: number;
        parsed: number;
        passed: number;
        failed: number;
        parseErrors: number;
    };
    failureClassifications: ReplayFailureClassificationSummary[];
    items: ValidationReportItem[];
}

class ApkObjectReader {
    private readonly view: DataView;
    private offset: number;

    constructor(
        private readonly data: Uint8Array,
        private readonly label: string,
        startOffset = 0
    ) {
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        this.offset = startOffset;
    }

    get position(): number {
        return this.offset;
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

    private requireBytes(length: number): void {
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
        rootDir: path.resolve('captures', 'mitm_replay'),
        outPath: null,
        json: false,
        mode: 'SD',
        maxRecords: DEFAULT_MAX_RECORDS,
        offset: 0,
        limit: null,
        uniqueOffset: null,
        uniqueLimit: null,
        dedupe: true,
        allowAmbiguousRecruit: false,
        strictTerrain: false,
        forceExecuteReplayActions: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input') {
            options.inputs.push(argv[++index]);
        } else if (arg === '--dir') {
            options.rootDir = path.resolve(argv[++index]);
        } else if (arg === '--out') {
            options.outPath = path.resolve(argv[++index]);
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--mode') {
            const mode = argv[++index];
            if (mode !== 'SD' && mode !== 'SO') throw new Error('--mode 只能是 SD 或 SO');
            options.mode = mode;
        } else if (arg === '--max-records') {
            options.maxRecords = parsePositiveInt(argv[++index], '--max-records');
        } else if (arg === '--offset') {
            options.offset = parseNonNegativeInt(argv[++index], '--offset');
        } else if (arg === '--limit') {
            options.limit = parsePositiveInt(argv[++index], '--limit');
        } else if (arg === '--unique-offset') {
            options.uniqueOffset = parseNonNegativeInt(argv[++index], '--unique-offset');
        } else if (arg === '--unique-limit') {
            options.uniqueLimit = parsePositiveInt(argv[++index], '--unique-limit');
        } else if (arg === '--no-dedupe') {
            options.dedupe = false;
        } else if (arg === '--allow-ambiguous-recruit') {
            options.allowAmbiguousRecruit = true;
        } else if (arg === '--strict-terrain') {
            options.strictTerrain = true;
        } else if (arg === '--force-apk-replay-execution') {
            options.forceExecuteReplayActions = true;
        } else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    const usesFileWindow = options.offset !== 0 || options.limit !== null;
    const usesUniqueWindow = options.uniqueOffset !== null || options.uniqueLimit !== null;
    if (usesFileWindow && usesUniqueWindow) {
        throw new Error('--offset/--limit 不能与 --unique-offset/--unique-limit 同时使用');
    }
    if (!options.dedupe && usesUniqueWindow) {
        throw new Error('--unique-offset/--unique-limit 需要启用去重，不能与 --no-dedupe 同时使用');
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

function parseNonNegativeInt(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${label} 需要非负整数`);
    }
    return parsed;
}

function printUsage(): void {
    console.log(`用法:
  npm run apk:game-get-validate -- --dir <mitm_replay目录>

参数:
  --input <file>                  指定 game_get_*.bin，可重复传入
  --dir <dir>                     扫描目录，默认 captures/mitm_replay
  --out <file>                    Markdown 报告输出路径
  --mode <SD|SO>                  使用 APK 多人规则模式，默认 SD
  --max-records <n>               最大校验记录数，默认 ${DEFAULT_MAX_RECORDS}
  --offset <n>                    跳过排序后的前 n 个 game_get 文件，默认 0
  --limit <n>                     最多扫描前 n 个 game_get 文件，用于抽样校验
  --unique-offset <n>             跳过排序并去重后的前 n 个唯一回放
  --unique-limit <n>              最多扫描 n 个唯一回放，用于按唯一 SHA 分片
  --allow-ambiguous-recruit       招募动作缺少部署坐标时选第一个合法部署点继续跑
  --force-apk-replay-execution    按 APK 回放器强制执行记录，不要求动作存在于项目合法动作集合
  --no-dedupe                     不按响应 SHA256 跳过重复回放
  --strict-terrain                遇到未映射 APK 地形时直接失败
  --json                          同时在控制台输出 JSON`);
}

function readObjectHeader(reader: ApkObjectReader, objectName: string): void {
    const magic = reader.readInt32();
    if (magic !== APK_OBJECT_MAGIC) {
        throw new Error(`${objectName}: magic 不匹配 ${magic}`);
    }
    if (reader.readBoolean()) {
        throw new Error(`${objectName}: 对象为 null`);
    }
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

function skipNullableC1271pArray(reader: ApkObjectReader): number {
    if (reader.readBoolean()) return 0;
    const count = reader.readInt32();
    if (count < 0 || count > 32) {
        throw new Error(`C1271p[] 数量无效 ${count}`);
    }
    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) continue;
        reader.readInt32();
        reader.readNullableString();
        reader.readNullableString();
    }
    return count;
}

function skipNullableStringArray(reader: ApkObjectReader): number {
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

function parseNullableC0619bArray(reader: ApkObjectReader): EmbeddedTerrainDefinition[] {
    if (reader.readBoolean()) return [];
    const count = reader.readInt32();
    if (count < 0 || count > 10000) {
        throw new Error(`C0619b[] 数量无效 ${count}`);
    }
    const definitions: EmbeddedTerrainDefinition[] = [];
    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) continue;
        const isLand = reader.readBoolean();
        const kind = reader.readInt32();
        const variant = reader.readInt32();
        const defenseBonus = reader.readInt32();
        const healPerTurn = reader.readInt32();
        const moveCost = reader.readInt32();
        const capturableFlag = reader.readBoolean();
        const destroyedTileId = reader.readInt32();
        const repairTileId = reader.readInt32();
        const linkedTileIds = readNullableIntArray(reader, 'C0619b.f1377j', 10000);
        const sortOrder = reader.readInt32();
        definitions.push({
            apkTerrainId: index,
            isLand,
            kind,
            variant,
            defenseBonus,
            healPerTurn,
            moveCost,
            capturableFlag,
            destroyedTileId,
            repairTileId,
            linkedTileIds,
            sortOrder
        });
    }
    return definitions;
}

function parseNullableC0620cArray(reader: ApkObjectReader): EmbeddedUnitDefinition[] {
    if (reader.readBoolean()) return [];
    const count = reader.readInt32();
    if (count < 0 || count > 10000) {
        throw new Error(`C0620c[] 数量无效 ${count}`);
    }
    const definitions: EmbeddedUnitDefinition[] = [];
    for (let index = 0; index < count; index += 1) {
        if (reader.readBoolean()) continue;
        const cost = reader.readInt32();
        const population = reader.readInt32();
        const attackElement = reader.readInt32();
        const defenseShift = reader.readInt32();
        const baseAttack = reader.readInt32();
        reader.readInt32();
        const attackGrowth = reader.readInt32();
        const baseDefense = reader.readInt32();
        const defenseGrowth = reader.readInt32();
        const baseMaxHp = reader.readInt32();
        const maxHpGrowth = reader.readInt32();
        const baseMove = reader.readInt32();
        const moveGrowth = reader.readInt32();
        const maxRange = reader.readInt32();
        const minRange = reader.readInt32();
        const abilityIds = readNullableIntArray(reader, 'C0620c.f1394p', 10000);
        const recruitableFlag = reader.readBoolean();
        const flagR = reader.readBoolean();
        definitions.push({
            apkUnitId: index,
            unitClass: APK_UNIT_ID_TO_CLASS[index] ?? null,
            cost,
            population,
            attackElement,
            defenseShift,
            baseAttack,
            attackGrowth,
            baseDefense,
            defenseGrowth,
            baseMaxHp,
            maxHpGrowth,
            baseMove,
            moveGrowth,
            maxRange,
            minRange,
            abilityIds,
            recruitableFlag,
            flagR
        });
    }
    return definitions;
}

function parseNullableC0618a(reader: ApkObjectReader): {
    terrainDefinitionCount: number;
    terrainDefinitions: EmbeddedTerrainDefinition[];
    unitDefinitionCount: number;
    unitDefinitions: EmbeddedUnitDefinition[];
} {
    if (reader.readBoolean()) {
        return { terrainDefinitionCount: 0, terrainDefinitions: [], unitDefinitionCount: 0, unitDefinitions: [] };
    }
    const terrainDefinitions = parseNullableC0619bArray(reader);
    const unitDefinitions = parseNullableC0620cArray(reader);
    return {
        terrainDefinitionCount: terrainDefinitions.length,
        terrainDefinitions,
        unitDefinitionCount: unitDefinitions.length,
        unitDefinitions
    };
}

function parseNullableC0616a(reader: ApkObjectReader): EmbeddedMapData {
    if (reader.readBoolean()) {
        throw new Error('C0616a 地图对象为空');
    }

    const width = reader.readInt32();
    const height = reader.readInt32();
    if (width <= 0 || height <= 0 || width * height > 100000) {
        throw new Error(`C0616a 地图尺寸无效 ${width}x${height}`);
    }

    const author = reader.readNullableString();
    const playerIds = readNullableIntArray(reader, 'C0616a.f1354d', 32);
    const terrainValues = readNullableIntArray(reader, 'C0616a.f1355e', width * height + 16);
    const unitValues = readNullableIntArray(reader, 'C0616a.f1356f', 100000);
    const recommendedGold = reader.readInt32();
    const playerPreset = readNullableIntArray(reader, 'C0616a.f1358h', 32);
    const alliancePreset = readNullableIntArray(reader, 'C0616a.f1359i', 32);

    if (terrainValues.length !== width * height) {
        throw new Error(`C0616a 地形数量不匹配 ${terrainValues.length} != ${width * height}`);
    }
    if (unitValues.length % 5 !== 0) {
        throw new Error(`C0616a 单位字段数量不是 5 的倍数: ${unitValues.length}`);
    }

    return {
        width,
        height,
        author,
        playerIds,
        terrainValues,
        unitValues,
        recommendedGold,
        playerPreset,
        alliancePreset
    };
}

const RULE_FIELD_NAMES: RuleFieldName[] = [
    'f1272a', 'f1274c', 'f1275d', 'f1276e', 'f1277f', 'f1278g',
    'f1279h', 'f1280i', 'f1281j', 'f1282k', 'f1283l', 'f1284m',
    'f1285n', 'f1286o', 'f1287p', 'f1288q', 'f1289r', 'f1290s',
    'f1291t', 'f1292u', 'f1293v', 'f1294w', 'f1295x', 'f1296y',
    'f1297z', 'f1262A', 'f1263B', 'f1264C', 'f1266E', 'f1267F',
    'f1268G', 'f1269H', 'f1270I', 'f1271J'
];

function createDefaultRuleParams(): EmbeddedRuleParams {
    const values = Object.fromEntries(RULE_FIELD_NAMES.map(name => [name, 0])) as EmbeddedRuleParams;
    values.f1272a = 10;
    values.f1274c = 20;
    values.f1275d = 10;
    values.f1276e = 10;
    values.f1277f = 10;
    values.f1278g = 10;
    values.f1279h = 3;
    values.f1280i = 50;
    values.f1281j = 10;
    values.f1282k = 10;
    values.f1283l = 30;
    values.f1284m = 10;
    values.f1285n = 60;
    values.f1286o = 30;
    values.f1287p = 10;
    values.f1288q = 10;
    values.f1289r = 100;
    values.f1290s = 50;
    values.f1291t = 25;
    values.f1292u = 50;
    values.f1293v = 9;
    values.f1294w = 10;
    values.f1295x = 40;
    values.f1296y = 10;
    values.f1297z = 10;
    values.f1262A = 5;
    values.f1263B = 10;
    values.f1266E = 10;
    values.f1268G = 1;
    values.f1270I = 2;
    values.f1271J = 1;
    return values;
}

function parseNullableC0611d(reader: ApkObjectReader): EmbeddedRuleParams {
    const values = createDefaultRuleParams();
    if (reader.readBoolean()) return values;
    for (const name of RULE_FIELD_NAMES) {
        values[name] = reader.readInt32();
    }
    return values;
}

function parseNullableC0585e(reader: ApkObjectReader): EmbeddedGameConfig {
    if (reader.readBoolean()) {
        throw new Error('C0585e 游戏配置对象为空');
    }

    const campaignLike = reader.readBoolean();
    const definitions = parseNullableC0618a(reader);
    const map = parseNullableC0616a(reader);
    const rules = parseNullableC0611d(reader);
    const seed = reader.readInt64();
    const scenarioCode = reader.readNullableString();
    const currentTeamField = reader.readInt32();
    const initialGoldByTeam = readNullableIntArray(reader, 'C0585e.f1152h', 32);
    const playerTypes = readNullableIntArray(reader, 'C0585e.f1153i', 32);
    // C0577a -> C0600q.m4365a 会把 f1154j 复制到 C0606a.f1239k，即实时联盟数组。
    const allianceByTeam = readNullableIntArray(reader, 'C0585e.f1154j', 32);
    const unitLimits = readNullableIntArray(reader, 'C0585e.f1155k', 32);

    return {
        campaignLike,
        ...definitions,
        map,
        rules,
        seed,
        scenarioCode,
        currentTeamField,
        initialGoldByTeam,
        playerTypes,
        allianceByTeam,
        unitLimits,
        mapObjectOffset: 0,
        currentStep: null,
        replaySplitIndex: null,
        roomType: null,
        status: null,
        playerSlotCount: 0,
        observerCount: 0
    };
}

function parseEmbeddedGameConfig(gameObjectBytes: Uint8Array, candidate: ReplayArrayCandidate): EmbeddedGameConfig {
    const reader = new ApkObjectReader(gameObjectBytes, 'C1258d');
    readObjectHeader(reader, 'C1258d');

    reader.readNullableString();
    reader.readNullableString();
    const roomType = reader.readNullableEnum(ROOM_TYPES);
    const status = reader.readNullableEnum(ROOM_STATUSES);
    reader.readInt64();
    const playerSlotCount = skipNullableC1271pArray(reader);
    const observerCount = skipNullableStringArray(reader);
    const mapObjectOffset = reader.position;
    const config = parseNullableC0585e(reader);
    const intReader = new ApkObjectReader(gameObjectBytes, 'C1258d-int-peek');

    return {
        ...config,
        mapObjectOffset,
        currentStep: candidate.startOffset >= 8 ? intReader.peekInt32(candidate.startOffset - 8) : null,
        replaySplitIndex: candidate.startOffset >= 4 ? intReader.peekInt32(candidate.startOffset - 4) : null,
        roomType,
        status,
        playerSlotCount,
        observerCount
    };
}

function hashBytes(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
}

function getGameObjectBytes(parsed: ReturnType<typeof parseMaybeEncryptedC1270o>): Uint8Array {
    const value = parsed.parsed.fields.get('g');
    if (!value || value.type !== 5 || !(value.value instanceof Uint8Array)) {
        throw new Error('game_get 响应缺少 g/object-bytes 字段');
    }
    return value.value;
}

function clampLevel(value: number): UnitLevel {
    if (!Number.isInteger(value)) return 0;
    return Math.max(0, Math.min(9, value)) as UnitLevel;
}

function clampLevelCap(value: number): LevelCap {
    return clampLevel(value) as LevelCap;
}

function normalizeOwner(ownerCode: number): number | null {
    return ownerCode <= 7 ? ownerCode : null;
}

function parseImportedUnits(map: EmbeddedMapData): ImportedUnitRecord[] {
    const units: ImportedUnitRecord[] = [];
    for (let index = 0; index < map.unitValues.length; index += 5) {
        const apkUnitId = map.unitValues[index];
        const teamId = map.unitValues[index + 1];
        const level = map.unitValues[index + 2];
        const x = map.unitValues[index + 3];
        const y = map.unitValues[index + 4];
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
            throw new Error(`C0616a 单位坐标越界: unit=${index / 5}, pos=(${x},${y})`);
        }
        units.push({
            apkUnitId,
            teamId,
            level,
            x,
            y,
            unitClass: APK_UNIT_ID_TO_CLASS[apkUnitId] ?? null
        });
    }
    return units;
}

function buildTiles(map: EmbeddedMapData, strictTerrain: boolean, terrainDefinitions: readonly EmbeddedTerrainDefinition[] = []): {
    tiles: Tile[][];
    approximateTerrainIds: number[];
    unmappedTerrainIds: number[];
} {
    const approximateTerrainIds = new Set<number>();
    const unmappedTerrainIds = new Set<number>();
    const tiles: Tile[][] = [];
    const terrainFallback: TerrainId = 6;
    const terrainDefinitionById = new Map(terrainDefinitions.map(definition => [definition.apkTerrainId, definition]));

    for (let y = 0; y < map.height; y += 1) {
        const row: Tile[] = [];
        for (let x = 0; x < map.width; x += 1) {
            // APK 地图矩阵按列优先存储：同一 x 的所有 y 先连续出现。
            const raw = map.terrainValues[x * map.height + y];
            const apkTerrainId = raw >>> 12;
            const ownerCode = raw & 0xff;
            const terrainDefinition = terrainDefinitionById.get(apkTerrainId);
            const terrainId = mapSkirmishApkTerrainId(apkTerrainId);
            if (terrainId === null) {
                unmappedTerrainIds.add(apkTerrainId);
                if (strictTerrain) {
                    throw new Error(`嵌入地图存在未映射 APK tile: ${apkTerrainId}`);
                }
            }
            // 目前项目已标记的近似地形较少，先保留集合字段，后续可接入 confidence 表。
            row.push({
                terrainId: terrainId ?? terrainFallback,
                ownerId: normalizeOwner(ownerCode),
                apkTerrainId,
                apkTerrainRaw: raw,
                apkOwnerCode: ownerCode,
                apkTerrainKind: terrainDefinition?.kind,
                apkTerrainIsLand: terrainDefinition?.isLand,
                apkMoveCost: terrainDefinition?.moveCost
            });
        }
        tiles.push(row);
    }

    return {
        tiles,
        approximateTerrainIds: [...approximateTerrainIds].sort((a, b) => a - b),
        unmappedTerrainIds: [...unmappedTerrainIds].sort((a, b) => a - b)
    };
}

function createUnits(importedUnits: ImportedUnitRecord[]): Unit[] {
    return importedUnits.map((unit, index) => {
        if (!unit.unitClass) {
            throw new Error(`嵌入地图单位 ${index} 使用未知 APK 单位 ID: ${unit.apkUnitId}`);
        }
        const initialLevel = clampLevel(unit.level);
        return {
            id: `apk_remote_u${index}`,
            ownerId: unit.teamId,
            unitClass: unit.unitClass,
            pos: { x: unit.x, y: unit.y },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false,
            level: initialLevel,
            // APK C0600q.m4333c 使用累计经验字段：初始等级 N 会写入 m4201a(N)，不是从 0 重新累计。
            exp: getExpThresholdForLevel(initialLevel),
            apkUnitId: unit.apkUnitId,
            apkUnitExtra: unit.level
        };
    });
}

function collectActiveTeamIds(config: EmbeddedGameConfig, importedUnits: ImportedUnitRecord[]): number[] {
    const map = config.map;
    const fromPlayerTypes = config.playerTypes
        .map((type, teamId) => ({ teamId, type }))
        .filter(entry => entry.type > 0)
        .map(entry => entry.teamId);
    const fromTerrain = map.terrainValues
        .map(raw => normalizeOwner(raw & 0xff))
        .filter((ownerId): ownerId is number => ownerId !== null);
    const teamIds = new Set<number>([
        ...map.playerIds,
        ...fromPlayerTypes,
        ...fromTerrain,
        ...importedUnits.map(unit => unit.teamId)
    ].filter(teamId => teamId >= 0 && teamId <= 31));
    return [...teamIds].sort((a, b) => a - b);
}

function firstValidPositive(values: number[], teamIds: readonly number[], fallback: number): number {
    for (const teamId of teamIds) {
        const value = values[teamId];
        if (Number.isInteger(value) && value >= 0) return value;
    }
    return fallback;
}

function buildEmbeddedPriceOverrides(config: EmbeddedGameConfig): Partial<Record<UnitClass, number>> {
    const prices: Partial<Record<UnitClass, number>> = {};
    for (const definition of config.unitDefinitions) {
        if (!definition.unitClass) continue;
        if (definition.unitClass === 'skeleton' || definition.unitClass === 'crystal') continue;
        if (!Number.isInteger(definition.cost) || definition.cost < 0) continue;
        prices[definition.unitClass] = definition.cost;
    }
    return prices;
}

function buildRuleConfig(config: EmbeddedGameConfig, activeTeamIds: number[], options: CliOptions): {
    rules: RuleConfig;
    defaultInitialGold: number;
    defaultUnitLimit: number;
    levelCap: LevelCap;
    disabledTeamIds: number[];
    priceOverrides: Partial<Record<UnitClass, number>>;
} {
    const recommendedGold = config.map.recommendedGold >= 0 ? config.map.recommendedGold : 300;
    const defaultInitialGold = firstValidPositive(config.initialGoldByTeam, activeTeamIds, recommendedGold);
    const defaultUnitLimit = firstValidPositive(config.unitLimits, activeTeamIds, 30);
    const levelCap = clampLevelCap(config.rules.f1279h);
    const baseRules = getApkSkirmishRuleConfig(options.mode, {
        initialGold: defaultInitialGold,
        unitLimit: defaultUnitLimit,
        levelCap
    });
    const priceOverrides = buildEmbeddedPriceOverrides(config);

    const teams = Object.fromEntries(activeTeamIds.map(teamId => [
        teamId,
        {
            initialGold: config.initialGoldByTeam[teamId] ?? defaultInitialGold,
            unitLimit: config.unitLimits[teamId] ?? defaultUnitLimit
        }
    ]));

    const alliances = Object.fromEntries(activeTeamIds.map(teamId => {
        const alliance = config.allianceByTeam[teamId];
        return [teamId, Number.isInteger(alliance) && alliance >= 0 ? alliance : teamId];
    }));

    const disabledTeamIds = config.playerTypes
        .map((type, teamId) => ({ teamId, type }))
        .filter(entry => entry.type === 0 && activeTeamIds.includes(entry.teamId))
        .map(entry => entry.teamId);

    const rules = mergeRuleConfig(baseRules, {
        initialGold: defaultInitialGold,
        unitLimit: defaultUnitLimit,
        levelCap,
        destroyerAttackBonus: config.rules.f1272a,
        deathReaperAttackBonus: config.rules.f1274c,
        inspiredAttackBonus: config.rules.f1275d,
        sharpshooterAttackBonus: config.rules.f1276e,
        terrainChildCombatBonus: config.rules.f1277f,
        weakenedDefensePenalty: config.rules.f1266E,
        incomeCastle: config.rules.f1289r,
        incomeCommanderBase: config.rules.f1290s,
        incomeCommanderGrowth: config.rules.f1291t,
        incomeVillage: config.rules.f1292u,
        prices: priceOverrides,
        alliances,
        disabledTeams: disabledTeamIds,
        teams
    });

    return { rules, defaultInitialGold, defaultUnitLimit, levelCap, disabledTeamIds, priceOverrides };
}

function getUnitAt(units: readonly Unit[], pos: Position): Unit | null {
    return units.find(unit => unit.hp > 0 && unit.pos.x === pos.x && unit.pos.y === pos.y) ?? null;
}

function inferInitialCurrentPlayer(state: GameState, records: readonly ApkReplayActionRecord[]): number {
    let leadingNextTurns = 0;
    for (const record of records) {
        if (record.eventType === 'GAME_START') continue;
        if (record.eventType === 'NEXT_TURN') {
            leadingNextTurns += 1;
            continue;
        }

        let firstActorOwner: number | null = null;
        if (record.recruitUnitId >= 0 && record.source) {
            const tile = state.map.tiles[record.source.y]?.[record.source.x];
            if (tile?.ownerId !== null && tile?.ownerId !== undefined) {
                firstActorOwner = tile.ownerId;
            }
        }
        if (firstActorOwner === null && record.source) {
            const unit = getUnitAt(state.units, record.source);
            if (unit) {
                firstActorOwner = unit.ownerId;
            }
        }

        if (firstActorOwner !== null) {
            const turnPlayers = getTurnPlayerIds(state);
            if (turnPlayers.length === 0) return firstActorOwner;
            const actorIndex = turnPlayers.indexOf(firstActorOwner);
            if (actorIndex === -1) return firstActorOwner;
            const initialIndex = (actorIndex - (leadingNextTurns % turnPlayers.length) + turnPlayers.length) % turnPlayers.length;
            return turnPlayers[initialIndex];
        }
    }
    return state.players[0]?.id ?? 0;
}

function createGameStateFromEmbeddedConfig(
    config: EmbeddedGameConfig,
    records: readonly ApkReplayActionRecord[],
    options: CliOptions,
    inputPath: string
): { state: GameState; summary: StateBuildSummary } {
    const importedUnits = parseImportedUnits(config.map);
    const activeTeamIds = collectActiveTeamIds(config, importedUnits);
    const { tiles, approximateTerrainIds, unmappedTerrainIds } = buildTiles(config.map, options.strictTerrain, config.terrainDefinitions);
    const units = createUnits(importedUnits);
    const { rules, defaultInitialGold, defaultUnitLimit, levelCap, disabledTeamIds, priceOverrides } = buildRuleConfig(config, activeTeamIds, options);
    const players: PlayerState[] = activeTeamIds.map(id => ({
        id,
        gold: rules.teams?.[id]?.initialGold ?? defaultInitialGold,
        isAlive: true,
        commanderDeathCount: 0
    }));

    const provisionalState: GameState = {
        turn: 1,
        currentPlayer: activeTeamIds[0] ?? 0,
        map: {
            width: config.map.width,
            height: config.map.height,
            tiles
        },
        units,
        players,
        winner: null,
        nextUnitId: units.length,
        nextGraveId: 100,
        rules,
        metadata: {
            source: 'apk_aem',
            apkResourcePath: inputPath,
            apkMapName: config.scenarioCode ?? path.basename(inputPath),
            apkSkirmishMode: options.mode,
            recommendedGold: config.map.recommendedGold >= 0 ? config.map.recommendedGold : null,
            apkApproximateTerrainIds: approximateTerrainIds,
            apkApproximateTileCount: 0,
            apkUnmappedTerrainIds: unmappedTerrainIds,
            apkUnmappedTileCount: unmappedTerrainIds.length
        }
    };

    const state = applyInitialRuleConfig(provisionalState);
    state.currentPlayer = inferInitialCurrentPlayer(state, records);

    return {
        state,
        summary: {
            activeTeamIds,
            disabledTeamIds,
            defaultInitialGold,
            defaultUnitLimit,
            levelCap,
            approximateTerrainIds,
            unmappedTerrainIds,
            initialCurrentPlayer: state.currentPlayer,
            priceOverrides
        }
    };
}

function countEvents(actions: readonly ApkReplayActionRecord[]): Record<ApkReplayEventType, number> {
    const counts = Object.fromEntries(
        APK_REPLAY_EVENT_TYPES.map(eventType => [eventType, 0])
    ) as Record<ApkReplayEventType, number>;
    for (const action of actions) {
        counts[action.eventType] += 1;
    }
    return counts;
}

async function parseRemoteReplay(inputPath: string, options: CliOptions): Promise<ParsedRemoteReplay> {
    const raw = await readFile(inputPath);
    const sha256 = hashBytes(raw);
    const parsed = parseMaybeEncryptedC1270o(raw);
    const gameObjectBytes = getGameObjectBytes(parsed);
    const replayArray = findEmbeddedActionArrayCandidate(gameObjectBytes, options.maxRecords);
    const plainReplay = buildPlainReplayBytes(gameObjectBytes, replayArray);
    const actionParse = parseDecryptedApkReplayActions(plainReplay);
    const config = parseEmbeddedGameConfig(gameObjectBytes, replayArray);
    const { state, summary } = createGameStateFromEmbeddedConfig(config, actionParse.actions, options, inputPath);

    return {
        inputPath,
        sha256,
        encrypted: parsed.encrypted,
        rawBytes: raw.byteLength,
        decryptedBytes: parsed.decrypted.byteLength,
        topFields: parsed.parsed.fieldSummaries,
        topRemainingBytes: parsed.parsed.remainingBytes,
        gameObjectBytes,
        replayArray,
        actions: actionParse.actions,
        config,
        initialState: state,
        stateSummary: summary
    };
}

function firstProblem(result: ApkReplayValidationResult) {
    return result.steps.find(step => step.error) ?? null;
}

function formatTileDiagnosticForClassification(diagnostic: ApkReplayStepDiagnostic | undefined): string {
    const tile = diagnostic?.moveDestinationTile;
    if (!tile) return '目标格地形未知';
    return [
        `terrainId=${tile.terrainId}`,
        `owner=${tile.ownerId ?? '-'}`,
        `apkTerrainId=${tile.apkTerrainId ?? '-'}`,
        `apkKind=${tile.apkTerrainKind ?? '-'}`,
        `apkIsLand=${tile.apkTerrainIsLand ?? '-'}`,
        `apkMoveCost=${tile.apkMoveCost ?? '-'}`
    ].join(', ');
}

function classifyReplayFailure(
    problem: ReturnType<typeof firstProblem>,
    problemRecord: ApkReplayActionRecord | null
): ReplayFailureClassification | null {
    if (!problem?.error) return null;

    const actionCode = problem.actionCode ?? '';
    const diagnostic = problem.diagnostic;
    if (problem.error.includes('非法动作') && actionCode.startsWith('move:')) {
        const occupant = diagnostic?.moveDestinationOccupant ?? null;
        if (occupant) {
            return {
                code: 'strict_move_destination_occupied',
                label: 'strict 目的格被项目状态占用',
                detail: [
                    `APK 记录要求移动到 ${formatPosition(problemRecord?.moveTo ?? null)}`,
                    `但项目状态中该格被 ${occupant.id}/${occupant.unitClass}/P${occupant.ownerId} 占用`,
                    `hp=${occupant.hp}/${occupant.maxHp}`,
                    formatTileDiagnosticForClassification(diagnostic)
                ].join('；')
            };
        }

        return {
            code: 'strict_move_reachability_gap',
            label: 'strict 移动可达性缺口',
            detail: [
                `APK 记录要求移动到 ${formatPosition(problemRecord?.moveTo ?? null)}`,
                '项目没有生成对应合法移动动作',
                '优先核实 APK 运行时脚本、SyncOverrideMov 或前序状态，而不是直接修改全局地形成本',
                formatTileDiagnosticForClassification(diagnostic)
            ].join('；')
        };
    }

    return {
        code: 'unknown',
        label: '未分类 strict 分歧',
        detail: '需要继续按首个 record 查看回放记录和 APK 反编译证据。'
    };
}

function createItemFromParsed(parsed: ParsedRemoteReplay, result: ApkReplayValidationResult): ValidationReportItem {
    const problem = firstProblem(result);
    const problemRecord = problem ? parsed.actions[problem.recordIndex] : null;
    const failureClassification = classifyReplayFailure(problem, problemRecord);
    return {
        inputPath: parsed.inputPath,
        fileName: path.basename(parsed.inputPath),
        sha256: parsed.sha256,
        duplicateOf: null,
        skipped: false,
        encrypted: parsed.encrypted,
        rawBytes: parsed.rawBytes,
        decryptedBytes: parsed.decryptedBytes,
        gameObjectBytes: parsed.gameObjectBytes.byteLength,
        map: {
            width: parsed.config.map.width,
            height: parsed.config.map.height,
            scenarioCode: parsed.config.scenarioCode,
            campaignLike: parsed.config.campaignLike,
            players: parsed.config.map.playerIds,
            terrainCount: parsed.config.map.terrainValues.length,
            unitCount: parsed.config.map.unitValues.length / 5,
            recommendedGold: parsed.config.map.recommendedGold
        },
        state: parsed.stateSummary,
        actions: {
            count: parsed.actions.length,
            eventCounts: countEvents(parsed.actions),
            remainingBytes: parsed.replayArray.remainingBytes
        },
        diagnostics: {
            topFields: parsed.topFields.map(field => field.key),
            topFieldSummaries: parsed.topFields,
            topRemainingBytes: parsed.topRemainingBytes,
            hasOnlyGameObjectField: parsed.topFields.length === 1
                && parsed.topFields[0]?.key === 'g'
                && parsed.topFields[0]?.typeName === 'object-bytes',
            gameObjectBytesConsumedByReplayArray: parsed.replayArray.remainingBytes === 0,
            currentStep: parsed.config.currentStep,
            replaySplitIndex: parsed.config.replaySplitIndex,
            roomType: parsed.config.roomType,
            status: parsed.config.status
        },
        validation: {
            success: result.success,
            executedRecordCount: result.executedRecordCount,
            expandedActionCount: result.expandedActionCount,
            firstError: result.firstError,
            firstErrorRecordIndex: problem?.recordIndex ?? null,
            firstErrorRecordEvent: problemRecord?.eventType ?? null,
            firstErrorRecordSource: problemRecord?.source ?? null,
            firstErrorRecordMoveTo: problemRecord?.moveTo ?? null,
            firstErrorRecordTarget: problemRecord?.target ?? null,
            firstErrorRecordRecruitUnitId: problemRecord?.recruitUnitId ?? null,
            currentPlayerBefore: problem?.currentPlayerBefore ?? null,
            turnBefore: problem?.turnBefore ?? null,
            legalActionCount: problem?.legalActionCount ?? null,
            info: problem?.info || null,
            actionCode: problem?.actionCode ?? null,
            failureDiagnostic: problem?.diagnostic ?? null,
            failureClassification,
            finalTurn: result.finalState.turn,
            finalCurrentPlayer: result.finalState.currentPlayer,
            finalWinner: result.finalState.winner
        },
        error: null
    };
}

function createDuplicateItem(inputPath: string, rawBytes: number, sha256: string, duplicateOf: string): ValidationReportItem {
    return {
        inputPath,
        fileName: path.basename(inputPath),
        sha256,
        duplicateOf,
        skipped: true,
        encrypted: null,
        rawBytes,
        decryptedBytes: null,
        gameObjectBytes: null,
        map: { width: null, height: null, scenarioCode: null, campaignLike: null, players: [], terrainCount: null, unitCount: null, recommendedGold: null },
        state: null,
        actions: { count: null, eventCounts: null, remainingBytes: null },
        diagnostics: {
            topFields: [],
            topFieldSummaries: [],
            topRemainingBytes: null,
            hasOnlyGameObjectField: null,
            gameObjectBytesConsumedByReplayArray: null,
            currentStep: null,
            replaySplitIndex: null,
            roomType: null,
            status: null
        },
        validation: {
            success: null,
            executedRecordCount: null,
            expandedActionCount: null,
            firstError: null,
            firstErrorRecordIndex: null,
            firstErrorRecordEvent: null,
            firstErrorRecordSource: null,
            firstErrorRecordMoveTo: null,
            firstErrorRecordTarget: null,
            firstErrorRecordRecruitUnitId: null,
            currentPlayerBefore: null,
            turnBefore: null,
            legalActionCount: null,
            info: null,
            actionCode: null,
            failureDiagnostic: null,
            failureClassification: null,
            finalTurn: null,
            finalCurrentPlayer: null,
            finalWinner: null
        },
        error: null
    };
}

function createErrorItem(inputPath: string, rawBytes: number, sha256: string, error: unknown): ValidationReportItem {
    return {
        inputPath,
        fileName: path.basename(inputPath),
        sha256,
        duplicateOf: null,
        skipped: false,
        encrypted: null,
        rawBytes,
        decryptedBytes: null,
        gameObjectBytes: null,
        map: { width: null, height: null, scenarioCode: null, campaignLike: null, players: [], terrainCount: null, unitCount: null, recommendedGold: null },
        state: null,
        actions: { count: null, eventCounts: null, remainingBytes: null },
        diagnostics: {
            topFields: [],
            topFieldSummaries: [],
            topRemainingBytes: null,
            hasOnlyGameObjectField: null,
            gameObjectBytesConsumedByReplayArray: null,
            currentStep: null,
            replaySplitIndex: null,
            roomType: null,
            status: null
        },
        validation: {
            success: false,
            executedRecordCount: null,
            expandedActionCount: null,
            firstError: null,
            firstErrorRecordIndex: null,
            firstErrorRecordEvent: null,
            firstErrorRecordSource: null,
            firstErrorRecordMoveTo: null,
            firstErrorRecordTarget: null,
            firstErrorRecordRecruitUnitId: null,
            currentPlayerBefore: null,
            turnBefore: null,
            legalActionCount: null,
            info: null,
            actionCode: null,
            failureDiagnostic: null,
            failureClassification: null,
            finalTurn: null,
            finalCurrentPlayer: null,
            finalWinner: null
        },
        error: error instanceof Error ? error.message : String(error)
    };
}

async function collectGameGetFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];
    async function visit(dir: string): Promise<void> {
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
                files.push(path.resolve(fullPath));
            }
        }
    }
    await visit(path.resolve(rootDir));
    return files.sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function resolveInputFiles(options: CliOptions): Promise<string[]> {
    const files = options.inputs.length > 0
        ? options.inputs.map(input => path.resolve(input))
        : await collectGameGetFiles(options.rootDir);
    if (files.length === 0) {
        throw new Error(`未找到 game_get_*.bin：${path.resolve(options.rootDir)}`);
    }
    if (options.uniqueOffset !== null || options.uniqueLimit !== null) {
        const uniqueFiles: string[] = [];
        const seen = new Set<string>();
        for (const file of files) {
            const raw = await readFile(file);
            const sha256 = hashBytes(raw);
            if (seen.has(sha256)) continue;
            seen.add(sha256);
            uniqueFiles.push(file);
        }
        const start = options.uniqueOffset ?? 0;
        const offsetUniqueFiles = uniqueFiles.slice(start);
        return options.uniqueLimit ? offsetUniqueFiles.slice(0, options.uniqueLimit) : offsetUniqueFiles;
    }
    const offsetFiles = files.slice(options.offset);
    return options.limit ? offsetFiles.slice(0, options.limit) : offsetFiles;
}

async function validateInput(inputPath: string, options: CliOptions): Promise<ValidationReportItem> {
    try {
        const parsed = await parseRemoteReplay(inputPath, options);
        const result = validateApkReplay(parsed.initialState, parsed.actions, {
            maxRecords: options.maxRecords,
            stopOnFirstError: true,
            forceExecuteReplayActions: options.forceExecuteReplayActions,
            expansionOptions: {
                allowAmbiguousRecruitDeployFirstMatch: options.allowAmbiguousRecruit
            }
        });
        return createItemFromParsed(parsed, result);
    } catch (error) {
        const raw = await readFile(inputPath).catch(() => Buffer.alloc(0));
        return createErrorItem(inputPath, raw.byteLength, raw.byteLength > 0 ? hashBytes(raw) : '', error);
    }
}

async function validateBatch(options: CliOptions): Promise<BatchValidationReport> {
    const inputs = await resolveInputFiles(options);
    const seen = new Map<string, string>();
    const items: ValidationReportItem[] = [];

    for (const inputPath of inputs) {
        const raw = await readFile(inputPath);
        const sha256 = hashBytes(raw);
        const duplicateOf = seen.get(sha256);
        if (options.dedupe && duplicateOf) {
            items.push(createDuplicateItem(inputPath, raw.byteLength, sha256, duplicateOf));
            continue;
        }
        seen.set(sha256, path.basename(inputPath));
        items.push(await validateInput(inputPath, options));
    }

    const parsedItems = items.filter(item => !item.error && !item.skipped);
    const report: BatchValidationReport = {
        generatedAt: new Date().toISOString(),
        options: {
            rootDir: options.rootDir,
            mode: options.mode,
            maxRecords: options.maxRecords,
            offset: options.offset,
            limit: options.limit,
            uniqueOffset: options.uniqueOffset,
            uniqueLimit: options.uniqueLimit,
            dedupe: options.dedupe,
            allowAmbiguousRecruit: options.allowAmbiguousRecruit,
            strictTerrain: options.strictTerrain,
            forceExecuteReplayActions: options.forceExecuteReplayActions
        },
        totals: {
            files: items.length,
            uniqueFiles: parsedItems.length,
            duplicates: items.filter(item => item.skipped).length,
            parsed: parsedItems.length,
            passed: parsedItems.filter(item => item.validation.success).length,
            failed: parsedItems.filter(item => item.validation.success === false).length,
            parseErrors: items.filter(item => item.error).length
        },
        failureClassifications: summarizeFailureClassifications(parsedItems),
        items
    };
    return report;
}

function formatEventCounts(counts: Record<ApkReplayEventType, number> | null): string {
    if (!counts) return '-';
    return APK_REPLAY_EVENT_TYPES
        .filter(eventType => counts[eventType] > 0)
        .map(eventType => `${eventType}=${counts[eventType]}`)
        .join(', ') || '-';
}

function summarizeFailureClassifications(items: readonly ValidationReportItem[]): ReplayFailureClassificationSummary[] {
    const grouped = new Map<ReplayFailureClassification['code'], ReplayFailureClassificationSummary>();
    for (const item of items) {
        const classification = item.validation.failureClassification;
        if (!classification) continue;
        const current = grouped.get(classification.code) ?? {
            code: classification.code,
            label: classification.label,
            count: 0,
            items: []
        };
        current.count += 1;
        current.items.push({
            fileName: item.fileName,
            recordIndex: item.validation.firstErrorRecordIndex,
            eventType: item.validation.firstErrorRecordEvent,
            actionCode: item.validation.actionCode
        });
        grouped.set(classification.code, current);
    }
    return [...grouped.values()].sort((left, right) => (
        right.count - left.count || left.code.localeCompare(right.code)
    ));
}

function formatPriceOverrides(prices: Partial<Record<UnitClass, number>> | undefined): string {
    const entries = Object.entries(prices ?? {});
    if (entries.length === 0) return '-';
    return entries
        .map(([unitClass, cost]) => `${unitClass}=${cost}`)
        .join(', ');
}

function shortHash(hash: string): string {
    return hash ? hash.slice(0, 12) : '-';
}

function formatNullable(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    return String(value).replace(/\|/g, '\\|');
}

function formatPosition(pos: Position | null): string {
    return pos ? `(${pos.x},${pos.y})` : '-';
}

function formatUnitDiagnostic(unit: ApkReplayStepDiagnostic['actor']): string {
    if (!unit) return '-';
    const status = unit.status
        ? `${unit.status.type}:${unit.status.remainingTurns ?? unit.status.remainingTicks ?? ''}`
        : 'none';
    return `${unit.id}/${unit.unitClass}/P${unit.ownerId}@${formatPosition(unit.pos)} hp=${unit.hp}/${unit.maxHp} lv=${formatNullable(unit.level)} exp=${formatNullable(unit.exp)} range=${unit.minRange}-${unit.maxRange} status=${status}`;
}

function formatTileDiagnostic(tile: ApkReplayStepDiagnostic['moveDestinationTile']): string {
    if (!tile) return '-';
    return `terrain=${tile.terrainId} owner=${formatNullable(tile.ownerId)} apkTerrainId=${formatNullable(tile.apkTerrainId)} apkKind=${formatNullable(tile.apkTerrainKind)} apkIsLand=${formatNullable(tile.apkTerrainIsLand)} apkMoveCost=${formatNullable(tile.apkMoveCost)}`;
}

function renderItemDetails(item: ValidationReportItem): string {
    if (item.skipped) {
        return [
            `### ${item.fileName}`,
            '',
            `- 状态：重复回放，已跳过。重复对象：\`${item.duplicateOf}\``,
            `- SHA256：\`${item.sha256}\``
        ].join('\n');
    }

    if (item.error) {
        return [
            `### ${item.fileName}`,
            '',
            `- 状态：解析/导入失败`,
            `- SHA256：\`${item.sha256 || '-'}\``,
            `- 错误：${item.error}`
        ].join('\n');
    }

    const firstErrorLines = item.validation.firstError ? [
        `- 首个问题：${item.validation.firstError}`,
        `- 分歧分类：${item.validation.failureClassification ? `${item.validation.failureClassification.label}（${item.validation.failureClassification.code}）：${item.validation.failureClassification.detail}` : '-'}`,
        `- APK 记录：event=${formatNullable(item.validation.firstErrorRecordEvent)}，source=${formatPosition(item.validation.firstErrorRecordSource)}，move=${formatPosition(item.validation.firstErrorRecordMoveTo)}，target=${formatPosition(item.validation.firstErrorRecordTarget)}，recruitId=${formatNullable(item.validation.firstErrorRecordRecruitUnitId)}`,
        `- 问题位置：record=${formatNullable(item.validation.firstErrorRecordIndex)}, turn=${formatNullable(item.validation.turnBefore)}, currentPlayer=${formatNullable(item.validation.currentPlayerBefore)}, legalActions=${formatNullable(item.validation.legalActionCount)}`,
        `- 项目动作：\`${formatNullable(item.validation.actionCode)}\``,
        `- 失败诊断：actor=${formatUnitDiagnostic(item.validation.failureDiagnostic?.actor ?? null)}；target=${formatUnitDiagnostic(item.validation.failureDiagnostic?.target ?? null)}；move占位=${formatUnitDiagnostic(item.validation.failureDiagnostic?.moveDestinationOccupant ?? null)}；move地形=${formatTileDiagnostic(item.validation.failureDiagnostic?.moveDestinationTile ?? null)}；sourceTargetDist=${formatNullable(item.validation.failureDiagnostic?.sourceToTargetDistance)}；moveTargetDist=${formatNullable(item.validation.failureDiagnostic?.moveToTargetDistance)}`,
        `- 引擎信息：${formatNullable(item.validation.info)}`
    ] : [
        '- 首个问题：无'
    ];

    return [
        `### ${item.fileName}`,
        '',
        `- 状态：${item.validation.success ? '通过' : '失败'}`,
        `- SHA256：\`${item.sha256}\``,
        `- 地图：${formatNullable(item.map.width)}x${formatNullable(item.map.height)}，scenario=${formatNullable(item.map.scenarioCode)}，campaignLike=${formatNullable(item.map.campaignLike)}，玩家=[${item.map.players.join(',')}]，初始单位=${formatNullable(item.map.unitCount)}，推荐金币=${formatNullable(item.map.recommendedGold)}`,
        `- 项目开局：currentPlayer=${formatNullable(item.state?.initialCurrentPlayer)}，activeTeams=[${item.state?.activeTeamIds.join(',') ?? ''}]，initialGold=${formatNullable(item.state?.defaultInitialGold)}，unitLimit=${formatNullable(item.state?.defaultUnitLimit)}，levelCap=${formatNullable(item.state?.levelCap)}`,
        `- 本局价格覆盖：${formatPriceOverrides(item.state?.priceOverrides)}`,
        `- 动作：${formatNullable(item.actions.count)} 条，remaining=${formatNullable(item.actions.remainingBytes)}，事件=${formatEventCounts(item.actions.eventCounts)}`,
        `- 包诊断：topFields=[${item.diagnostics.topFields.join(',')}]，topRemaining=${formatNullable(item.diagnostics.topRemainingBytes)}，onlyG=${formatNullable(item.diagnostics.hasOnlyGameObjectField)}，replayEOF=${formatNullable(item.diagnostics.gameObjectBytesConsumedByReplayArray)}，currentStep=${formatNullable(item.diagnostics.currentStep)}，replaySplitIndex=${formatNullable(item.diagnostics.replaySplitIndex)}，room=${formatNullable(item.diagnostics.roomType)}/${formatNullable(item.diagnostics.status)}`,
        `- 校验进度：已执行 ${formatNullable(item.validation.executedRecordCount)} / ${formatNullable(item.actions.count)} 条 APK 记录，展开项目动作 ${formatNullable(item.validation.expandedActionCount)} 个`,
        `- 终局状态：turn=${formatNullable(item.validation.finalTurn)}，currentPlayer=${formatNullable(item.validation.finalCurrentPlayer)}，winner=${formatNullable(item.validation.finalWinner)}`,
        ...firstErrorLines
    ].join('\n');
}

function renderFailureClassificationSummary(report: BatchValidationReport): string[] {
    if (report.failureClassifications.length === 0) {
        return [
            '## 分歧分类汇总',
            '',
            '- 无失败分歧。'
        ];
    }

    const lines = [
        '## 分歧分类汇总',
        '',
        '| 分类 | 数量 | 首个失败 |',
        '| --- | ---: | --- |'
    ];
    for (const item of report.failureClassifications) {
        const examples = item.items
            .slice(0, 5)
            .map(entry => `${entry.fileName}#${formatNullable(entry.recordIndex)} ${formatNullable(entry.eventType)} ${formatNullable(entry.actionCode)}`)
            .join('<br>');
        lines.push(`| ${item.label} (\`${item.code}\`) | ${item.count} | ${examples || '-'} |`);
    }
    return lines;
}

function renderMarkdownReport(report: BatchValidationReport): string {
    const lines = [
        '# AEII 远端回放项目规则校验报告',
        '',
        `- 生成时间：${report.generatedAt}`,
        `- 输入目录：\`${report.options.rootDir}\``,
        `- 规则模式：${report.options.mode}`,
        `- 抽样跳过文件数：${report.options.offset}`,
        `- 抽样文件上限：${report.options.limit ?? '全部'}`,
        `- 唯一回放跳过数：${report.options.uniqueOffset ?? '未启用'}`,
        `- 唯一回放上限：${report.options.uniqueLimit ?? '未启用'}`,
        `- 招募歧义处理：${report.options.allowAmbiguousRecruit ? '允许选第一个合法部署点继续' : '严格模式，缺少部署坐标即失败'}`,
        `- APK 强制执行：${report.options.forceExecuteReplayActions ? '开启，跳过项目合法动作枚举' : '关闭，严格要求项目合法动作'}`,
        `- 地形处理：${report.options.strictTerrain ? '严格' : '未映射地形使用道路兜底并记录'}`,
        `- 文件数：${report.totals.files}，唯一校验：${report.totals.uniqueFiles}，重复跳过：${report.totals.duplicates}，通过：${report.totals.passed}，失败：${report.totals.failed}，解析错误：${report.totals.parseErrors}`,
        '',
        ...renderFailureClassificationSummary(report),
        '',
        '## 汇总',
        '',
        '| 文件 | SHA256 | 地图 | 动作 | 结果 | 进度 | 首个问题 |',
        '| --- | --- | --- | ---: | --- | --- | --- |'
    ];

    for (const item of report.items) {
        const mapText = item.map.width && item.map.height
            ? `${item.map.width}x${item.map.height}, P[${item.map.players.join(',')}]`
            : '-';
        const resultText = item.skipped
            ? `重复(${item.duplicateOf})`
            : item.error
                ? '解析失败'
                : item.validation.success
                    ? '通过'
                    : '失败';
        const progress = item.validation.executedRecordCount === null
            ? '-'
            : `${item.validation.executedRecordCount}/${item.actions.count ?? '?'}`;
        lines.push([
            item.fileName,
            shortHash(item.sha256),
            mapText,
            formatNullable(item.actions.count),
            resultText,
            progress,
            item.error ?? item.validation.firstError ?? '-'
        ].map(formatNullable).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }

    lines.push('', '## 明细', '');
    for (const item of report.items) {
        lines.push(renderItemDetails(item), '');
    }

    lines.push(
        '## 结论说明',
        '',
        '- “通过”表示项目规则能从同一个远端回放响应中的初始地图开始，按已抓到的 APK 动作前缀执行到校验上限且没有非法动作。',
        '- 抓包得到的回放可能只是整场对局的一段前缀；本报告不把终局、胜负或完整对局作为通过条件。',
        '- “失败”表示项目引擎在某条 APK 动作处出现非法动作或无法展开动作，报告中的 record 即首个分歧点。',
        '- 严格模式下招募记录如果没有部署坐标，可能会在多个合法部署点时中断；这属于回放动作格式信息不足，不一定代表战斗规则不一致。'
    );

    return lines.join('\n');
}

async function writeReports(report: BatchValidationReport, options: CliOptions): Promise<{ markdownPath: string; jsonPath: string }> {
    const markdownPath = options.outPath ?? path.join(path.resolve(options.rootDir), 'project_validation_report.md');
    const jsonPath = markdownPath.replace(/\.md$/i, '.json');
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderMarkdownReport(report), 'utf8');
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    return { markdownPath, jsonPath };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const report = await validateBatch(options);
    const paths = await writeReports(report, options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(`已保存项目校验报告：${paths.markdownPath}`);
    console.log(`已保存项目校验 JSON：${paths.jsonPath}`);
    console.log(`通过 ${report.totals.passed}/${report.totals.parsed}，失败 ${report.totals.failed}，重复跳过 ${report.totals.duplicates}，解析错误 ${report.totals.parseErrors}`);
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
    createGameStateFromEmbeddedConfig,
    parseEmbeddedGameConfig,
    parseRemoteReplay,
    validateBatch
};
