import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_RELEASE_VERSION } from '../src/game/apk_manifest';

interface CliOptions {
    unpackDir: string;
    json: boolean;
    check: boolean;
}

interface Uleb128ReadResult {
    value: number;
    nextOffset: number;
}

interface DexStringReadResult {
    value: string;
    nextOffset: number;
}

interface DexProtoSignature {
    returnType: string;
    parameterTypes: string[];
}

export interface DexMethodSignature {
    classDescriptor: string;
    name: string;
    returnType: string;
    parameterTypes: string[];
}

export interface DexKeywordGroupReport {
    group: string;
    keywords: string[];
    count: number;
    matches: string[];
}

interface ApkDexReport {
    apkVersion: string;
    dexPath: string;
    stringCount: number;
    requiredStrings: string[];
    missingRequiredStrings: string[];
    requiredMethodNames: string[];
    missingRequiredMethodNames: string[];
    methodSignatures: DexMethodSignature[];
    commanderReviveApiCandidates: string[];
    keywordGroups: DexKeywordGroupReport[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_MATCH_LIMIT = 80;

const REQUIRED_STRINGS = [
    'CheckCommander',
    'GetCommander',
    'SyncSetCommander',
    'SetIncomeCommanderBase',
    'SetIncomeCommanderGrowth',
    'SetLevelCap',
    'SetPrices',
    'SyncSetGold',
    'SyncSetRecruitUnits',
    'SyncSetRecruitUnitsForTeam',
    'SyncSetUnitLimit',
    'Cannot recruit when stacked!',
    'OnUnitRecruited',
    'Cannot attack from (',
    'Cannot attack in state [',
    'Cannot support from (',
    'Cannot support in state [',
    'AsyncAttack',
    'SyncSetUnitStatus',
    '[Stage.AsyncAttack] Invalid position: (',
    '[Stage.SyncSetUnitStatus] No unit at (',
    '[Stage.SyncSetUnitStatus] Invalid status: ',
    '[Stage.SyncSetUnitStatus] Invalid rounds: '
] as const;

const REQUIRED_METHOD_NAMES = [
    'CheckCommander',
    'GetCommander',
    'SyncSetCommander',
    'SetIncomeCommanderBase',
    'SetIncomeCommanderGrowth',
    'SyncSetRecruitUnits',
    'SyncSetRecruitUnitsForTeam',
    'SyncSetUnitStatus',
    'AsyncAttack'
] as const;

const COMMANDER_REVIVE_API_PATTERN = /(?:ReviveCommander|RespawnCommander|CommanderRevive|CommanderRespawn)/i;

const KEYWORD_GROUPS = [
    {
        group: 'commander',
        keywords: [
            'Commander',
            'commander',
            'CheckCommander',
            'GetCommander',
            'SyncSetCommander',
            'IncomeCommander'
        ]
    },
    {
        group: 'recruit',
        keywords: [
            'Recruit',
            'recruit',
            'SetRecruitUnit',
            'SyncSetRecruitUnits',
            'SetPrices'
        ]
    },
    {
        group: 'revive',
        keywords: [
            'ReviveCommander',
            'RespawnCommander',
            'CommanderRevive',
            'CommanderRespawn',
            'revive',
            'Revive',
            'Respawn',
            'resurrect',
            'resurrection'
        ]
    },
    {
        group: 'setup',
        keywords: [
            'SetGold',
            'SetIncome',
            'SetIncomeCommanderBase',
            'SetIncomeCommanderGrowth',
            'SetLevelCap',
            'SetPrices',
            'SetUnitLimit'
        ]
    },
    {
        group: 'combat_action',
        keywords: [
            'Cannot attack from (',
            'Cannot attack in state [',
            'AsyncAttack',
            '[Stage.AsyncAttack] Invalid position: ('
        ]
    },
    {
        group: 'support_action',
        keywords: [
            'Cannot support from (',
            'Cannot support in state ['
        ]
    },
    {
        group: 'status_stage',
        keywords: [
            'SyncSetUnitStatus',
            '[Stage.SyncSetUnitStatus] No unit at (',
            '[Stage.SyncSetUnitStatus] Invalid status: ',
            '[Stage.SyncSetUnitStatus] Invalid rounds: '
        ]
    }
] as const;

function printHelp() {
    console.log(`用法: npm run apk:dex-report -- [选项]

选项:
  --unpack <dir>   APK 解包目录，默认 APK/_analysis/unpack
  --json           输出 JSON
  --check          必要字符串缺失、疑似指挥官复活 API 存在或 DEX 解析失败时以非 0 退出
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

export function readUleb128(buffer: Buffer, offset: number): Uleb128ReadResult {
    let result = 0;
    let shift = 0;
    let currentOffset = offset;

    for (let i = 0; i < 5; i += 1) {
        if (currentOffset >= buffer.length) {
            throw new Error(`ULEB128 越界: offset=${offset}`);
        }

        const byte = buffer[currentOffset];
        currentOffset += 1;
        result |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            return { value: result >>> 0, nextOffset: currentOffset };
        }

        shift += 7;
    }

    throw new Error(`ULEB128 超过 DEX 允许长度: offset=${offset}`);
}

function decodeDexModifiedUtf8(bytes: Buffer): string {
    const codeUnits: number[] = [];

    for (let i = 0; i < bytes.length;) {
        const first = bytes[i];

        if ((first & 0x80) === 0) {
            codeUnits.push(first);
            i += 1;
        } else if ((first & 0xe0) === 0xc0) {
            if (i + 1 >= bytes.length) throw new Error('DEX MUTF-8 两字节序列不完整');
            const second = bytes[i + 1];
            codeUnits.push(((first & 0x1f) << 6) | (second & 0x3f));
            i += 2;
        } else if ((first & 0xf0) === 0xe0) {
            if (i + 2 >= bytes.length) throw new Error('DEX MUTF-8 三字节序列不完整');
            const second = bytes[i + 1];
            const third = bytes[i + 2];
            codeUnits.push(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
            i += 3;
        } else {
            throw new Error(`DEX MUTF-8 不支持的字节: 0x${first.toString(16)}`);
        }
    }

    return String.fromCharCode(...codeUnits);
}

export function readDexString(buffer: Buffer, offset: number): DexStringReadResult {
    const size = readUleb128(buffer, offset);
    let endOffset = size.nextOffset;

    while (endOffset < buffer.length && buffer[endOffset] !== 0) {
        endOffset += 1;
    }

    if (endOffset >= buffer.length) {
        throw new Error(`DEX 字符串缺少结尾 0: offset=${offset}`);
    }

    const raw = buffer.subarray(size.nextOffset, endOffset);
    const value = decodeDexModifiedUtf8(raw);

    // utf16_size 是 DEX 的校验信息。这里不因代理对或空字符编码差异失败，只在明显截断时抛错。
    if ([...value].join('').length === 0 && size.value > 0) {
        throw new Error(`DEX 字符串长度异常: offset=${offset}`);
    }

    return {
        value,
        nextOffset: endOffset + 1
    };
}

export function parseDexStrings(buffer: Buffer): string[] {
    if (buffer.length < 0x70) {
        throw new Error('DEX 文件过小');
    }

    const magic = buffer.subarray(0, 4).toString('ascii');
    if (magic !== 'dex\n') {
        throw new Error('不是有效的 DEX 文件');
    }

    const stringIdsSize = buffer.readUInt32LE(0x38);
    const stringIdsOffset = buffer.readUInt32LE(0x3c);
    const stringIdsEnd = stringIdsOffset + stringIdsSize * 4;

    if (stringIdsEnd > buffer.length) {
        throw new Error('DEX string_ids 区域越界');
    }

    const strings: string[] = [];
    for (let i = 0; i < stringIdsSize; i += 1) {
        const stringDataOffset = buffer.readUInt32LE(stringIdsOffset + i * 4);
        if (stringDataOffset >= buffer.length) {
            throw new Error(`DEX string_data 越界: index=${i}, offset=${stringDataOffset}`);
        }
        strings.push(readDexString(buffer, stringDataOffset).value);
    }

    return strings;
}

function parseDexTypes(buffer: Buffer, strings: readonly string[]): string[] {
    if (buffer.length < 0x70) {
        throw new Error('DEX 文件过小');
    }

    const typeIdsSize = buffer.readUInt32LE(0x40);
    const typeIdsOffset = buffer.readUInt32LE(0x44);
    const typeIdsEnd = typeIdsOffset + typeIdsSize * 4;

    if (typeIdsEnd > buffer.length) {
        throw new Error('DEX type_ids 区域越界');
    }

    const types: string[] = [];
    for (let i = 0; i < typeIdsSize; i += 1) {
        const descriptorIndex = buffer.readUInt32LE(typeIdsOffset + i * 4);
        const descriptor = strings[descriptorIndex];
        if (descriptor === undefined) {
            throw new Error(`DEX type_ids 字符串索引越界: index=${i}, string_idx=${descriptorIndex}`);
        }
        types.push(descriptor);
    }

    return types;
}

function parseTypeList(buffer: Buffer, offset: number, types: readonly string[]): string[] {
    if (offset === 0) return [];
    if (offset + 4 > buffer.length) {
        throw new Error(`DEX type_list 越界: offset=${offset}`);
    }

    const size = buffer.readUInt32LE(offset);
    const listEnd = offset + 4 + size * 2;
    if (listEnd > buffer.length) {
        throw new Error(`DEX type_list 内容越界: offset=${offset}, size=${size}`);
    }

    const result: string[] = [];
    for (let i = 0; i < size; i += 1) {
        const typeIndex = buffer.readUInt16LE(offset + 4 + i * 2);
        const type = types[typeIndex];
        if (type === undefined) {
            throw new Error(`DEX type_list 类型索引越界: offset=${offset}, type_idx=${typeIndex}`);
        }
        result.push(type);
    }

    return result;
}

function parseDexProtos(buffer: Buffer, types: readonly string[]): DexProtoSignature[] {
    if (buffer.length < 0x70) {
        throw new Error('DEX 文件过小');
    }

    const protoIdsSize = buffer.readUInt32LE(0x48);
    const protoIdsOffset = buffer.readUInt32LE(0x4c);
    const protoIdsEnd = protoIdsOffset + protoIdsSize * 12;

    if (protoIdsEnd > buffer.length) {
        throw new Error('DEX proto_ids 区域越界');
    }

    const protos: DexProtoSignature[] = [];
    for (let i = 0; i < protoIdsSize; i += 1) {
        const itemOffset = protoIdsOffset + i * 12;
        const returnTypeIndex = buffer.readUInt32LE(itemOffset + 4);
        const parametersOffset = buffer.readUInt32LE(itemOffset + 8);
        const returnType = types[returnTypeIndex];
        if (returnType === undefined) {
            throw new Error(`DEX proto_ids 返回类型索引越界: index=${i}, type_idx=${returnTypeIndex}`);
        }

        protos.push({
            returnType,
            parameterTypes: parseTypeList(buffer, parametersOffset, types)
        });
    }

    return protos;
}

export function parseDexMethodSignatures(buffer: Buffer, methodNames: readonly string[]): DexMethodSignature[] {
    const wantedNames = new Set(methodNames);
    const strings = parseDexStrings(buffer);
    const types = parseDexTypes(buffer, strings);
    const protos = parseDexProtos(buffer, types);
    const methodIdsSize = buffer.readUInt32LE(0x58);
    const methodIdsOffset = buffer.readUInt32LE(0x5c);
    const methodIdsEnd = methodIdsOffset + methodIdsSize * 8;

    if (methodIdsEnd > buffer.length) {
        throw new Error('DEX method_ids 区域越界');
    }

    const signatures: DexMethodSignature[] = [];
    for (let i = 0; i < methodIdsSize; i += 1) {
        const itemOffset = methodIdsOffset + i * 8;
        const classIndex = buffer.readUInt16LE(itemOffset);
        const protoIndex = buffer.readUInt16LE(itemOffset + 2);
        const nameIndex = buffer.readUInt32LE(itemOffset + 4);
        const name = strings[nameIndex];

        if (name === undefined) {
            throw new Error(`DEX method_ids 方法名索引越界: index=${i}, string_idx=${nameIndex}`);
        }
        if (!wantedNames.has(name)) continue;

        const classDescriptor = types[classIndex];
        const proto = protos[protoIndex];
        if (classDescriptor === undefined) {
            throw new Error(`DEX method_ids 类索引越界: index=${i}, class_idx=${classIndex}`);
        }
        if (proto === undefined) {
            throw new Error(`DEX method_ids 原型索引越界: index=${i}, proto_idx=${protoIndex}`);
        }

        signatures.push({
            classDescriptor,
            name,
            returnType: proto.returnType,
            parameterTypes: proto.parameterTypes
        });
    }

    return signatures.sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) return byName;
        const byClass = left.classDescriptor.localeCompare(right.classDescriptor);
        if (byClass !== 0) return byClass;
        return left.parameterTypes.join(',').localeCompare(right.parameterTypes.join(','));
    });
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function containsAnyKeyword(value: string, keywords: readonly string[]): boolean {
    return keywords.some(keyword => value.includes(keyword));
}

export function buildKeywordReports(strings: readonly string[]): DexKeywordGroupReport[] {
    return KEYWORD_GROUPS.map(group => {
        const matches = uniqueSorted(strings.filter(value => containsAnyKeyword(value, group.keywords)));
        return {
            group: group.group,
            keywords: [...group.keywords],
            count: matches.length,
            matches: matches.slice(0, DEFAULT_MATCH_LIMIT)
        };
    });
}

export async function buildApkDexReport(options: CliOptions): Promise<ApkDexReport> {
    const dexPath = path.join(options.unpackDir, 'classes.dex');
    const dex = await readFile(dexPath);
    const strings = parseDexStrings(dex);
    const stringSet = new Set(strings);
    const methodSignatures = parseDexMethodSignatures(dex, REQUIRED_METHOD_NAMES);
    const methodNameSet = new Set(methodSignatures.map(method => method.name));
    const commanderReviveApiCandidates = uniqueSorted(strings.filter(value => COMMANDER_REVIVE_API_PATTERN.test(value)));

    return {
        apkVersion: APK_RELEASE_VERSION,
        dexPath,
        stringCount: strings.length,
        requiredStrings: [...REQUIRED_STRINGS],
        missingRequiredStrings: REQUIRED_STRINGS.filter(value => !stringSet.has(value)),
        requiredMethodNames: [...REQUIRED_METHOD_NAMES],
        missingRequiredMethodNames: REQUIRED_METHOD_NAMES.filter(value => !methodNameSet.has(value)),
        methodSignatures,
        commanderReviveApiCandidates,
        keywordGroups: buildKeywordReports(strings)
    };
}

function renderMarkdown(report: ApkDexReport): string {
    const lines = [
        '# APK DEX 字符串复核报告',
        '',
        `- APK 版本：${report.apkVersion}`,
        `- DEX 文件：\`${report.dexPath}\``,
        `- 字符串数量：${report.stringCount}`,
        `- 必要字符串缺失：${report.missingRequiredStrings.length}`,
        `- 必要方法名缺失：${report.missingRequiredMethodNames.length}`,
        `- 疑似指挥官复活 API 字符串：${report.commanderReviveApiCandidates.length}`,
        '',
        '## 关键词分组',
        '',
        '| 分组 | 关键词命中数 | 关键词 |',
        '| --- | ---: | --- |'
    ];

    for (const group of report.keywordGroups) {
        lines.push(`| ${group.group} | ${group.count} | ${group.keywords.map(value => `\`${value}\``).join(', ')} |`);
    }

    lines.push('', '## 关键方法签名', '', '| 方法 | 类 | 返回 | 参数 |', '| --- | --- | --- | --- |');

    for (const signature of report.methodSignatures) {
        const parameters = signature.parameterTypes.length > 0
            ? signature.parameterTypes.map(value => `\`${value}\``).join(', ')
            : '-';
        lines.push(`| \`${signature.name}\` | \`${signature.classDescriptor}\` | \`${signature.returnType}\` | ${parameters} |`);
    }

    lines.push('', '## 命中明细');

    for (const group of report.keywordGroups) {
        lines.push('', `### ${group.group}`, '');
        if (group.matches.length === 0) {
            lines.push('- 无');
        } else {
            for (const match of group.matches) {
                lines.push(`- \`${match}\``);
            }
        }
    }

    if (
        report.missingRequiredStrings.length > 0
        || report.missingRequiredMethodNames.length > 0
        || report.commanderReviveApiCandidates.length > 0
    ) {
        lines.push('', '## 差异', '');
        for (const value of report.missingRequiredStrings) {
            lines.push(`- 缺少必要字符串：\`${value}\``);
        }
        for (const value of report.missingRequiredMethodNames) {
            lines.push(`- 缺少必要方法名：\`${value}\``);
        }
        for (const value of report.commanderReviveApiCandidates) {
            lines.push(`- 疑似指挥官复活 API：\`${value}\``);
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildApkDexReport(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    if (
        options.check
        && (
            report.stringCount === 0
            || report.missingRequiredStrings.length > 0
            || report.missingRequiredMethodNames.length > 0
            || report.commanderReviveApiCandidates.length > 0
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
