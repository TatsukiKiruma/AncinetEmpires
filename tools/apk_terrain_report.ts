import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_RELEASE_VERSION } from '../src/game/apk_manifest';
import {
    APK_TERRAIN_CONFIGS,
    APK_TERRAIN_COUNT,
    APK_TERRAIN_RECORD_SIZE,
    getSkirmishApkTerrainMappingInfo,
    type ApkTerrainConfig
} from '../src/game/apk_terrain';
import { decryptApkResourceBytes } from './apk_resource_crypto';

interface CliOptions {
    unpackDir: string;
    json: boolean;
    check: boolean;
}

interface ApkDataBinEnvelope {
    magic: number;
    keyHex: string;
    encryptedPayloadOffset: number;
    decrypted: Buffer;
}

interface TerrainMismatch {
    id: number;
    expected: ApkTerrainConfig | null;
    actual: ApkTerrainConfig | null;
}

interface ValueDistribution {
    value: number;
    count: number;
    ids: number[];
}

interface TerrainMappingSummary {
    confirmed: number;
    atlas: number;
    approximate: number;
    unmapped: number;
}

interface ApkTerrainReport {
    apkVersion: string;
    dataBinPath: string;
    envelopeMagic: number;
    decryptedMagic: number;
    keyHex: string;
    encryptedPayloadOffset: number;
    terrainCount: number;
    expectedTerrainCount: number;
    recordSize: number;
    expectedRecordSize: number;
    mismatches: TerrainMismatch[];
    defenseBonusDistribution: ValueDistribution[];
    healPerTurnDistribution: ValueDistribution[];
    moveCostDistribution: ValueDistribution[];
    mappingSummary: TerrainMappingSummary;
    terrainConfigs: ApkTerrainConfig[];
}

const APK_DATA_BIN_MAGIC = 365703;
const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET = 17;
const DATA_BIN_TERRAIN_COUNT_OFFSET = 8;
const DATA_BIN_TERRAIN_RECORDS_OFFSET = 9;

function printHelp() {
    console.log(`用法: npm run apk:terrain-report -- [选项]

选项:
  --unpack <dir>   APK 解包目录，默认 APK/_analysis/unpack
  --json           输出 JSON
  --check          data.bin 地形记录和项目归档不一致时以非 0 退出
  --help           显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        unpackDir: DEFAULT_UNPACK_DIR,
        json: false,
        check: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--check') {
            options.check = true;
        } else if (arg === '--unpack') {
            const value = argv[++i];
            if (!value) throw new Error('--unpack 缺少目录参数');
            options.unpackDir = path.resolve(value);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
}

function bytesToHex(bytes: Uint8Array): string {
    return [...bytes]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(' ');
}

function tailHex(value: number): string {
    return `0x${value.toString(16).padStart(8, '0')}`;
}

function readInt32BE(buffer: Buffer, offset: number): number {
    return buffer.readInt32BE(offset);
}

function readUInt32BE(buffer: Buffer, offset: number): number {
    return buffer.readUInt32BE(offset);
}

function parseApkDataBinEnvelope(data: Buffer): ApkDataBinEnvelope {
    if (data.length < DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET) {
        throw new Error('data.bin 文件过小');
    }

    const magic = readUInt32BE(data, 0);
    if (magic !== APK_DATA_BIN_MAGIC) {
        throw new Error(`data.bin magic 不匹配: ${magic}`);
    }

    const keyLength = data[8];
    if (keyLength !== 8) {
        throw new Error(`data.bin DES key 长度异常: ${keyLength}`);
    }

    const key = data.subarray(9, 17);
    const keyHex = bytesToHex(key);
    const encryptedPayload = data.subarray(DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET);

    return {
        magic,
        keyHex,
        encryptedPayloadOffset: DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET,
        decrypted: decryptApkResourceBytes(encryptedPayload, {
            cipher: 'DES/CBC/PKCS7',
            keyHex,
            ivHex: keyHex
        })
    };
}

export function parseApkTerrainRecord(buffer: Buffer, offset: number, id: number): ApkTerrainConfig {
    if (offset + APK_TERRAIN_RECORD_SIZE > buffer.length) {
        throw new Error(`APK 地形记录越界: id=${id}, offset=${offset}`);
    }

    return {
        id,
        kind: readInt32BE(buffer, offset),
        flagA: buffer.readInt16BE(offset + 4),
        variant: readInt32BE(buffer, offset + 6),
        linkedA: readInt32BE(buffer, offset + 10),
        defenseBonus: readInt32BE(buffer, offset + 14),
        healPerTurn: readInt32BE(buffer, offset + 18),
        moveCost: readInt32BE(buffer, offset + 22),
        flagB: buffer[offset + 26],
        linkedB: readInt32BE(buffer, offset + 27),
        linkedC: readInt32BE(buffer, offset + 31),
        flagC: buffer[offset + 35],
        tail: tailHex(readUInt32BE(buffer, offset + 36))
    };
}

export function parseApkTerrainConfigsFromDecryptedDataBin(decrypted: Buffer): ApkTerrainConfig[] {
    if (decrypted.length < DATA_BIN_TERRAIN_RECORDS_OFFSET) {
        throw new Error('解密后的 data.bin 文件过小');
    }

    const magic = readUInt32BE(decrypted, 0);
    if (magic !== APK_DATA_BIN_MAGIC) {
        throw new Error(`解密后的 data.bin magic 不匹配: ${magic}`);
    }

    const terrainCount = decrypted[DATA_BIN_TERRAIN_COUNT_OFFSET];
    const requiredLength = DATA_BIN_TERRAIN_RECORDS_OFFSET + terrainCount * APK_TERRAIN_RECORD_SIZE;
    if (requiredLength > decrypted.length) {
        throw new Error(`解密后的 data.bin 地形表越界: count=${terrainCount}`);
    }

    const configs: ApkTerrainConfig[] = [];
    for (let id = 0; id < terrainCount; id += 1) {
        configs.push(parseApkTerrainRecord(
            decrypted,
            DATA_BIN_TERRAIN_RECORDS_OFFSET + id * APK_TERRAIN_RECORD_SIZE,
            id
        ));
    }

    return configs;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function buildMismatches(actualConfigs: readonly ApkTerrainConfig[]): TerrainMismatch[] {
    const ids = new Set<number>([
        ...APK_TERRAIN_CONFIGS.map(config => config.id),
        ...actualConfigs.map(config => config.id)
    ]);
    const expectedById = new Map<number, ApkTerrainConfig>(APK_TERRAIN_CONFIGS.map(config => [config.id, config]));
    const actualById = new Map<number, ApkTerrainConfig>(actualConfigs.map(config => [config.id, config]));

    return [...ids].sort((left, right) => left - right).flatMap(id => {
        const expected = expectedById.get(id) ?? null;
        const actual = actualById.get(id) ?? null;
        return stableStringify(expected) === stableStringify(actual)
            ? []
            : [{ id, expected, actual }];
    });
}

export function buildValueDistribution(
    configs: readonly ApkTerrainConfig[],
    field: 'defenseBonus' | 'healPerTurn' | 'moveCost'
): ValueDistribution[] {
    const groups = new Map<number, number[]>();

    for (const config of configs) {
        const ids = groups.get(config[field]) ?? [];
        ids.push(config.id);
        groups.set(config[field], ids);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([value, ids]) => ({ value, count: ids.length, ids }));
}

function buildMappingSummary(configs: readonly ApkTerrainConfig[]): TerrainMappingSummary {
    const summary: TerrainMappingSummary = {
        confirmed: 0,
        atlas: 0,
        approximate: 0,
        unmapped: 0
    };

    for (const config of configs) {
        summary[getSkirmishApkTerrainMappingInfo(config.id).confidence] += 1;
    }

    return summary;
}

export async function buildApkTerrainReport(options: CliOptions): Promise<ApkTerrainReport> {
    const dataBinPath = path.join(options.unpackDir, 'data.bin');
    const envelope = parseApkDataBinEnvelope(await readFile(dataBinPath));
    const terrainConfigs = parseApkTerrainConfigsFromDecryptedDataBin(envelope.decrypted);

    return {
        apkVersion: APK_RELEASE_VERSION,
        dataBinPath,
        envelopeMagic: envelope.magic,
        decryptedMagic: readUInt32BE(envelope.decrypted, 0),
        keyHex: envelope.keyHex,
        encryptedPayloadOffset: envelope.encryptedPayloadOffset,
        terrainCount: terrainConfigs.length,
        expectedTerrainCount: APK_TERRAIN_COUNT,
        recordSize: APK_TERRAIN_RECORD_SIZE,
        expectedRecordSize: APK_TERRAIN_RECORD_SIZE,
        mismatches: buildMismatches(terrainConfigs),
        defenseBonusDistribution: buildValueDistribution(terrainConfigs, 'defenseBonus'),
        healPerTurnDistribution: buildValueDistribution(terrainConfigs, 'healPerTurn'),
        moveCostDistribution: buildValueDistribution(terrainConfigs, 'moveCost'),
        mappingSummary: buildMappingSummary(terrainConfigs),
        terrainConfigs
    };
}

function formatIds(ids: readonly number[]): string {
    return ids.length === 0 ? '-' : ids.map(id => `t${id}`).join(',');
}

function renderDistribution(title: string, distribution: readonly ValueDistribution[]): string[] {
    const lines = [
        `## ${title}`,
        '',
        '| 值 | 数量 | APK tile |',
        '| ---: | ---: | --- |'
    ];

    for (const item of distribution) {
        lines.push(`| ${item.value} | ${item.count} | ${formatIds(item.ids)} |`);
    }

    return lines;
}

function renderMarkdown(report: ApkTerrainReport): string {
    const lines = [
        '# APK data.bin 地形数值复核报告',
        '',
        `- APK 版本：${report.apkVersion}`,
        `- data.bin：\`${report.dataBinPath}\``,
        `- envelope magic：${report.envelopeMagic}`,
        `- decrypted magic：${report.decryptedMagic}`,
        `- DES key/iv：\`${report.keyHex}\``,
        `- 加密 payload offset：${report.encryptedPayloadOffset}`,
        `- 地形记录：${report.terrainCount}/${report.expectedTerrainCount}`,
        `- 记录长度：${report.recordSize}/${report.expectedRecordSize}`,
        `- 项目归档差异：${report.mismatches.length}`,
        `- skirmish 映射可信度：confirmed=${report.mappingSummary.confirmed}, atlas=${report.mappingSummary.atlas}, approximate=${report.mappingSummary.approximate}, unmapped=${report.mappingSummary.unmapped}`,
        '',
        ...renderDistribution('防御加成分布', report.defenseBonusDistribution),
        '',
        ...renderDistribution('回合回血分布', report.healPerTurnDistribution),
        '',
        ...renderDistribution('移动消耗分布', report.moveCostDistribution),
        '',
        '## 完整地形记录',
        '',
        '| ID | kind | flagA | variant | linkedA | 防御 | 回血 | 移动 | flagB | linkedB | linkedC | flagC | tail | 映射可信度 |',
        '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'
    ];

    for (const config of report.terrainConfigs) {
        lines.push([
            `| ${config.id}`,
            config.kind,
            config.flagA,
            config.variant,
            config.linkedA,
            config.defenseBonus,
            config.healPerTurn,
            config.moveCost,
            config.flagB,
            config.linkedB,
            config.linkedC,
            config.flagC,
            `\`${config.tail}\``,
            getSkirmishApkTerrainMappingInfo(config.id).confidence
        ].join(' | ') + ' |');
    }

    if (report.mismatches.length > 0) {
        lines.push('', '## 差异', '');
        for (const mismatch of report.mismatches) {
            lines.push(`- t${mismatch.id}: expected=${JSON.stringify(mismatch.expected)}, actual=${JSON.stringify(mismatch.actual)}`);
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildApkTerrainReport(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    if (
        options.check
        && (
            report.envelopeMagic !== APK_DATA_BIN_MAGIC
            || report.decryptedMagic !== APK_DATA_BIN_MAGIC
            || report.terrainCount !== report.expectedTerrainCount
            || report.recordSize !== report.expectedRecordSize
            || report.mismatches.length > 0
        )
    ) {
        process.exitCode = 1;
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
