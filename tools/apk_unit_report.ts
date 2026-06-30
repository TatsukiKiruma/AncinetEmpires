import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_ABILITY_TYPE_TO_ID, APK_UNIT_ID_TO_CLASS } from '../src/game/apk_compat';
import { APK_RELEASE_VERSION } from '../src/game/apk_manifest';
import { APK_TERRAIN_RECORD_SIZE } from '../src/game/apk_terrain';
import { UNIT_CONFIGS } from '../src/game/units';
import type { AttackType } from '../src/game/units';
import type { UnitClass } from '../src/game/types';
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

export interface ApkUnitRecord {
    id: number;
    unitClass: UnitClass;
    recordOffset: number;
    cost: number;
    population: number;
    attackElement: number;
    defenseShift: number;
    baseAttack: number;
    fieldF: number;
    attackGrowth: number;
    baseDefense: number;
    defenseGrowth: number;
    baseMaxHp: number;
    maxHpGrowth: number;
    baseMove: number;
    moveGrowth: number;
    maxRange: number;
    minRange: number;
    fieldP: number;
    abilityIds: number[];
    recruitableFlag: number;
    flagR: number;
    tailByte: number;
}

interface ProjectMismatch {
    unitId: number;
    unitClass: UnitClass;
    field: string;
    expectedFromApk: unknown;
    projectValue: unknown;
}

interface IntentionalDifference {
    unitId: number;
    unitClass: UnitClass;
    field: string;
    apkValue: unknown;
    projectValue: unknown;
    reason: string;
}

interface ValueDistribution {
    value: number;
    count: number;
    unitIds: number[];
}

interface ApkUnitReport {
    apkVersion: string;
    dataBinPath: string;
    envelopeMagic: number;
    decryptedMagic: number;
    keyHex: string;
    encryptedPayloadOffset: number;
    unitSectionMarker: number;
    unitSectionMagic: number;
    unitCount: number;
    expectedUnitCount: number;
    projectMismatches: ProjectMismatch[];
    intentionalDifferences: IntentionalDifference[];
    costDistribution: ValueDistribution[];
    populationDistribution: ValueDistribution[];
    abilityCountDistribution: ValueDistribution[];
    unitRecords: ApkUnitRecord[];
}

const APK_DATA_BIN_MAGIC = 365703;
const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET = 17;
const DATA_BIN_TERRAIN_COUNT_OFFSET = 8;
const DATA_BIN_TERRAIN_RECORDS_OFFSET = 9;
const UNIT_SECTION_HEADER_SIZE = 14;
const APK_UNIT_RECORD_FIXED_INT_COUNT = 16;
const APK_UNIT_COUNT = 21;

function printHelp() {
    console.log(`用法: npm run apk:unit-report -- [选项]

选项:
  --unpack <dir>   APK 解包目录，默认 APK/_analysis/unpack
  --json           输出 JSON
  --check          data.bin 单位记录或项目单位配置不一致时以非 0 退出
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

function readUInt32BE(buffer: Buffer, offset: number): number {
    return buffer.readUInt32BE(offset);
}

function readInt32BE(buffer: Buffer, offset: number): number {
    return buffer.readInt32BE(offset);
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

    return {
        magic,
        keyHex,
        encryptedPayloadOffset: DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET,
        decrypted: decryptApkResourceBytes(data.subarray(DATA_BIN_ENCRYPTED_PAYLOAD_OFFSET), {
            cipher: 'DES/CBC/PKCS7',
            keyHex,
            ivHex: keyHex
        })
    };
}

function getUnitSectionOffset(decrypted: Buffer): number {
    if (decrypted.length < DATA_BIN_TERRAIN_RECORDS_OFFSET) {
        throw new Error('解密后的 data.bin 文件过小');
    }

    const terrainCount = decrypted[DATA_BIN_TERRAIN_COUNT_OFFSET];
    return DATA_BIN_TERRAIN_RECORDS_OFFSET + terrainCount * APK_TERRAIN_RECORD_SIZE;
}

function getAttackType(attackElement: number): AttackType {
    if (attackElement === 0) return 'physical';
    if (attackElement === 1) return 'magic';
    throw new Error(`未知 APK 攻击元素: ${attackElement}`);
}

function getPhysicalDefense(record: ApkUnitRecord): number {
    return record.attackElement === 0
        ? record.baseDefense + record.defenseShift
        : record.baseDefense - record.defenseShift;
}

function getMagicDefense(record: ApkUnitRecord): number {
    return record.attackElement === 0
        ? record.baseDefense - record.defenseShift
        : record.baseDefense + record.defenseShift;
}

export function parseApkUnitRecord(buffer: Buffer, offset: number, id: number): { record: ApkUnitRecord; nextOffset: number } {
    const unitClass = APK_UNIT_ID_TO_CLASS[id];
    if (!unitClass) throw new Error(`未知 APK 单位 ID: ${id}`);

    const fixedByteLength = APK_UNIT_RECORD_FIXED_INT_COUNT * 4;
    if (offset + fixedByteLength + 4 > buffer.length) {
        throw new Error(`APK 单位记录越界: id=${id}, offset=${offset}`);
    }

    const values = Array.from({ length: APK_UNIT_RECORD_FIXED_INT_COUNT }, (_, index) => readInt32BE(buffer, offset + index * 4));
    let cursor = offset + fixedByteLength;
    const abilityCount = buffer[cursor];
    cursor += 1;

    const abilityIds: number[] = [];
    for (let i = 0; i < abilityCount; i += 1) {
        abilityIds.push(readInt32BE(buffer, cursor));
        cursor += 4;
    }

    const recruitableFlag = buffer[cursor];
    const flagR = buffer[cursor + 1];
    const tailByte = buffer[cursor + 2];
    cursor += 3;

    return {
        record: {
            id,
            unitClass,
            recordOffset: offset,
            cost: values[0],
            population: values[1],
            attackElement: values[2],
            defenseShift: values[3],
            baseAttack: values[4],
            fieldF: values[5],
            attackGrowth: values[6],
            baseDefense: values[7],
            defenseGrowth: values[8],
            baseMaxHp: values[9],
            maxHpGrowth: values[10],
            baseMove: values[11],
            moveGrowth: values[12],
            maxRange: values[13],
            minRange: values[14],
            fieldP: values[15],
            abilityIds,
            recruitableFlag,
            flagR,
            tailByte
        },
        nextOffset: cursor
    };
}

export function parseApkUnitRecordsFromDecryptedDataBin(decrypted: Buffer): {
    sectionOffset: number;
    sectionMarker: number;
    sectionMagic: number;
    recordsOffset: number;
    records: ApkUnitRecord[];
} {
    const magic = readUInt32BE(decrypted, 0);
    if (magic !== APK_DATA_BIN_MAGIC) {
        throw new Error(`解密后的 data.bin magic 不匹配: ${magic}`);
    }

    const sectionOffset = getUnitSectionOffset(decrypted);
    const sectionMarker = readUInt32BE(decrypted, sectionOffset);
    const sectionMagic = readUInt32BE(decrypted, sectionOffset + 4);
    const unitCount = decrypted[sectionOffset + 12];
    let cursor = sectionOffset + UNIT_SECTION_HEADER_SIZE;
    const records: ApkUnitRecord[] = [];

    for (let id = 0; id < unitCount; id += 1) {
        const parsed = parseApkUnitRecord(decrypted, cursor, id);
        records.push(parsed.record);
        cursor = parsed.nextOffset;
    }

    return {
        sectionOffset,
        sectionMarker,
        sectionMagic,
        recordsOffset: sectionOffset + UNIT_SECTION_HEADER_SIZE,
        records
    };
}

function expectedAbilityIds(unitClass: UnitClass): number[] {
    return UNIT_CONFIGS[unitClass].abilities.map(ability => APK_ABILITY_TYPE_TO_ID[ability]);
}

function sortedNumbers(values: readonly number[]): number[] {
    return [...values].sort((left, right) => left - right);
}

function valuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function addMismatch(
    mismatches: ProjectMismatch[],
    record: ApkUnitRecord,
    field: string,
    expectedFromApk: unknown,
    projectValue: unknown
) {
    if (!valuesEqual(expectedFromApk, projectValue)) {
        mismatches.push({
            unitId: record.id,
            unitClass: record.unitClass,
            field,
            expectedFromApk,
            projectValue
        });
    }
}

function buildProjectMismatches(records: readonly ApkUnitRecord[]): ProjectMismatch[] {
    const mismatches: ProjectMismatch[] = [];

    for (const record of records) {
        const config = UNIT_CONFIGS[record.unitClass];
        addMismatch(mismatches, record, 'attack', record.baseAttack, config.attack);
        addMismatch(mismatches, record, 'attackType', getAttackType(record.attackElement), config.attackType);
        addMismatch(mismatches, record, 'physicalDefense', getPhysicalDefense(record), config.physicalDefense);
        addMismatch(mismatches, record, 'magicDefense', getMagicDefense(record), config.magicDefense);
        addMismatch(mismatches, record, 'minRange', record.minRange, config.minRange);
        addMismatch(mismatches, record, 'maxRange', record.maxRange, config.maxRange);
        if (record.unitClass !== 'crystal') {
            addMismatch(mismatches, record, 'move', record.baseMove, config.move);
        }
        addMismatch(mismatches, record, 'attackGrowth', record.attackGrowth, config.attackGrowth);
        addMismatch(mismatches, record, 'defenseGrowth', record.defenseGrowth, config.defenseGrowth);
        addMismatch(mismatches, record, 'maxHpGrowth', record.maxHpGrowth, config.maxHpGrowth);
        addMismatch(mismatches, record, 'moveGrowth', record.moveGrowth, config.moveGrowth);
        addMismatch(mismatches, record, 'population', record.population, config.population);
        addMismatch(mismatches, record, 'abilityIds', sortedNumbers(record.abilityIds), sortedNumbers(expectedAbilityIds(record.unitClass)));
        if (config.cost !== null) {
            addMismatch(mismatches, record, 'cost', record.cost, config.cost);
        }
        addMismatch(mismatches, record, 'baseMaxHp', record.baseMaxHp, 100);
    }

    return mismatches;
}

function buildIntentionalDifferences(records: readonly ApkUnitRecord[]): IntentionalDifference[] {
    const differences: IntentionalDifference[] = [];

    for (const record of records) {
        const config = UNIT_CONFIGS[record.unitClass];
        if (record.unitClass === 'commander') {
            differences.push({
                unitId: record.id,
                unitClass: record.unitClass,
                field: 'cost',
                apkValue: record.cost,
                projectValue: config.cost,
                reason: '项目通过 RuleConfig.commanderRecruitBaseCost 表达指挥官重招募基础价格，UnitConfig.cost 保持 null 以避免普通招募路径直接购买。'
            });
            continue;
        }
        if (record.unitClass === 'skeleton') {
            differences.push({
                unitId: record.id,
                unitClass: record.unitClass,
                field: 'cost',
                apkValue: record.cost,
                projectValue: config.cost,
                reason: '骷髅由召唤师从墓碑召唤，不作为普通城堡招募单位，UnitConfig.cost 保持 null。'
            });
            continue;
        }
        if (record.unitClass === 'crystal') {
            differences.push({
                unitId: record.id,
                unitClass: record.unitClass,
                field: 'cost',
                apkValue: record.cost,
                projectValue: config.cost,
                reason: '水晶是战役目标占位，不作为普通城堡招募单位，UnitConfig.cost 保持 null。'
            });
            differences.push({
                unitId: record.id,
                unitClass: record.unitClass,
                field: 'move',
                apkValue: record.baseMove,
                projectValue: config.move,
                reason: 'data.bin 中水晶移动为 4，但项目按不可行动目标占位处理，战役脚本可通过 static/targeted/move override 控制。'
            });
        }
    }

    return differences;
}

export function buildValueDistribution(
    records: readonly ApkUnitRecord[],
    field: 'cost' | 'population'
): ValueDistribution[] {
    const groups = new Map<number, number[]>();

    for (const record of records) {
        const ids = groups.get(record[field]) ?? [];
        ids.push(record.id);
        groups.set(record[field], ids);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([value, unitIds]) => ({ value, count: unitIds.length, unitIds }));
}

function buildAbilityCountDistribution(records: readonly ApkUnitRecord[]): ValueDistribution[] {
    const groups = new Map<number, number[]>();
    for (const record of records) {
        const ids = groups.get(record.abilityIds.length) ?? [];
        ids.push(record.id);
        groups.set(record.abilityIds.length, ids);
    }
    return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([value, unitIds]) => ({ value, count: unitIds.length, unitIds }));
}

export async function buildApkUnitReport(options: CliOptions): Promise<ApkUnitReport> {
    const dataBinPath = path.join(options.unpackDir, 'data.bin');
    const envelope = parseApkDataBinEnvelope(await readFile(dataBinPath));
    const unitTable = parseApkUnitRecordsFromDecryptedDataBin(envelope.decrypted);

    return {
        apkVersion: APK_RELEASE_VERSION,
        dataBinPath,
        envelopeMagic: envelope.magic,
        decryptedMagic: readUInt32BE(envelope.decrypted, 0),
        keyHex: envelope.keyHex,
        encryptedPayloadOffset: envelope.encryptedPayloadOffset,
        unitSectionMarker: unitTable.sectionMarker,
        unitSectionMagic: unitTable.sectionMagic,
        unitCount: unitTable.records.length,
        expectedUnitCount: APK_UNIT_COUNT,
        projectMismatches: buildProjectMismatches(unitTable.records),
        intentionalDifferences: buildIntentionalDifferences(unitTable.records),
        costDistribution: buildValueDistribution(unitTable.records, 'cost'),
        populationDistribution: buildValueDistribution(unitTable.records, 'population'),
        abilityCountDistribution: buildAbilityCountDistribution(unitTable.records),
        unitRecords: unitTable.records
    };
}

function formatUnitIds(unitIds: readonly number[]): string {
    return unitIds.length === 0 ? '-' : unitIds.map(id => `#${id}`).join(',');
}

function renderDistribution(title: string, distribution: readonly ValueDistribution[]): string[] {
    const lines = [
        `## ${title}`,
        '',
        '| 值 | 数量 | APK 单位 ID |',
        '| ---: | ---: | --- |'
    ];

    for (const item of distribution) {
        lines.push(`| ${item.value} | ${item.count} | ${formatUnitIds(item.unitIds)} |`);
    }

    return lines;
}

function renderMarkdown(report: ApkUnitReport): string {
    const lines = [
        '# APK data.bin 单位数值复核报告',
        '',
        `- APK 版本：${report.apkVersion}`,
        `- data.bin：\`${report.dataBinPath}\``,
        `- envelope magic：${report.envelopeMagic}`,
        `- decrypted magic：${report.decryptedMagic}`,
        `- DES key/iv：\`${report.keyHex}\``,
        `- 加密 payload offset：${report.encryptedPayloadOffset}`,
        `- 单位 section marker：${report.unitSectionMarker}`,
        `- 单位 section magic：${report.unitSectionMagic}`,
        `- 单位记录：${report.unitCount}/${report.expectedUnitCount}`,
        `- 项目单位配置差异：${report.projectMismatches.length}`,
        `- 已记录的刻意差异：${report.intentionalDifferences.length}`,
        '',
        ...renderDistribution('价格分布', report.costDistribution),
        '',
        ...renderDistribution('人口分布', report.populationDistribution),
        '',
        ...renderDistribution('能力数量分布', report.abilityCountDistribution),
        '',
        '## 完整单位记录',
        '',
        '| APK ID | 项目 key | 价格 | 人口 | 攻击类型 | 攻击 | 物防 | 魔防 | 攻击成长 | 防御成长 | 生命 | 生命成长 | 移动 | 移动成长 | 射程 | 能力 ID | 招募标志 |',
        '| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |'
    ];

    for (const record of report.unitRecords) {
        lines.push([
            `| ${record.id}`,
            `\`${record.unitClass}\``,
            record.cost,
            record.population,
            getAttackType(record.attackElement),
            record.baseAttack,
            getPhysicalDefense(record),
            getMagicDefense(record),
            record.attackGrowth,
            record.defenseGrowth,
            record.baseMaxHp,
            record.maxHpGrowth,
            record.baseMove,
            record.moveGrowth,
            `${record.minRange}-${record.maxRange}`,
            record.abilityIds.length === 0 ? '-' : record.abilityIds.join(','),
            record.recruitableFlag
        ].join(' | ') + ' |');
    }

    if (report.intentionalDifferences.length > 0) {
        lines.push('', '## 刻意差异', '');
        for (const item of report.intentionalDifferences) {
            lines.push(`- #${item.unitId} \`${item.unitClass}\` ${item.field}: APK=${JSON.stringify(item.apkValue)}, 项目=${JSON.stringify(item.projectValue)}。${item.reason}`);
        }
    }

    if (report.projectMismatches.length > 0) {
        lines.push('', '## 差异', '');
        for (const mismatch of report.projectMismatches) {
            lines.push(`- #${mismatch.unitId} \`${mismatch.unitClass}\` ${mismatch.field}: APK=${JSON.stringify(mismatch.expectedFromApk)}, 项目=${JSON.stringify(mismatch.projectValue)}`);
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildApkUnitReport(options);

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
            || report.unitSectionMagic !== APK_DATA_BIN_MAGIC
            || report.unitCount !== report.expectedUnitCount
            || report.projectMismatches.length > 0
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
