import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    APK_RELEASE_SHA256,
    APK_RELEASE_VERSION,
    APK_SKIRMISH_MAP_MANIFEST,
    getApkSkirmishTerrainUsageSummary,
    getApkSkirmishTerrainVerificationTargets,
    matchesApkSkirmishMapManifest,
    type ApkSkirmishMapManifestEntry
} from '../src/game/apk_manifest';
import {
    getApkAemTerrainConfidenceUsage,
    getApkAemTerrainUsage,
    parseApkAemMap,
    parseApkAemTerrainOnly,
    type ApkAemMap
} from '../src/game/apk_map';
import { decryptApkResourceBytes, APK_RESOURCE_DECRYPTION_INFO } from './apk_resource_crypto';

const EXPECTED_SKIRMISH_TAIL_TEMPLATE = 'zero_suffix_58';
const LOW_CONFIDENCE_AEM_TERRAIN_IDS = [30, 31, 80, 81, 82, 83] as const;
const EXPECTED_ALL_AEM_COUNT = 45;
const EXPECTED_FULL_PARSE_FAILURE_RESOURCE_PATHS = [
    'assets/mods/AEII/s5.aem',
    'assets/mods/AEII/s7.aem',
    'assets/mods/AEIII/s1.aem'
] as const;
const EXPECTED_LOW_CONFIDENCE_ALL_AEM_USAGE = [
    { apkTerrainId: 30, tileCount: 30, skirmishTileCount: 2, nonSkirmishTileCount: 28, resourceCount: 11 },
    { apkTerrainId: 31, tileCount: 16, skirmishTileCount: 7, nonSkirmishTileCount: 9, resourceCount: 11 },
    { apkTerrainId: 80, tileCount: 0, skirmishTileCount: 0, nonSkirmishTileCount: 0, resourceCount: 0 },
    { apkTerrainId: 81, tileCount: 9, skirmishTileCount: 0, nonSkirmishTileCount: 9, resourceCount: 1 },
    { apkTerrainId: 82, tileCount: 8, skirmishTileCount: 0, nonSkirmishTileCount: 8, resourceCount: 1 },
    { apkTerrainId: 83, tileCount: 6, skirmishTileCount: 0, nonSkirmishTileCount: 6, resourceCount: 2 }
] as const;

interface CliOptions {
    unpackDir: string;
    apkPath: string;
    json: boolean;
    check: boolean;
}

interface MapReportEntry {
    name: string;
    resourcePath: string;
    width: number;
    height: number;
    playerIds: number[];
    initialUnitCount: number;
    recommendedGold: number | null;
    tailTemplate: string;
    approximateTerrainIds: number[];
    approximateTileCount: number;
    unmappedTerrainIds: number[];
    unmappedTileCount: number;
    manifestMatched: boolean;
}

interface AllAemTerrainUsageEntry {
    apkTerrainId: number;
    tileCount: number;
    resourceCount: number;
    skirmishTileCount: number;
    nonSkirmishTileCount: number;
    resources: { resourcePath: string; tileCount: number; isSkirmish: boolean }[];
}

interface AllAemTerrainUsageReport {
    aemCount: number;
    fullParseFailureCount: number;
    fullParseFailures: { resourcePath: string; error: string }[];
    lowConfidenceTerrainUsage: AllAemTerrainUsageEntry[];
}

interface ApkMapReport {
    apkVersion: string;
    apkPath: string;
    apkSha256: string | null;
    expectedApkSha256: string;
    unpackDir: string;
    decryption: typeof APK_RESOURCE_DECRYPTION_INFO;
    mapCount: number;
    matchedManifestCount: number;
    approximateMapCount: number;
    unmappedMapCount: number;
    tailTemplateCounts: Record<string, number>;
    unexpectedTailTemplateCount: number;
    maps: MapReportEntry[];
    terrainUsageSummary: ReturnType<typeof getApkSkirmishTerrainUsageSummary>;
    verificationTargets: ReturnType<typeof getApkSkirmishTerrainVerificationTargets>;
    allAemTerrainUsage: AllAemTerrainUsageReport;
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const DEFAULT_APK_PATH = path.resolve(process.cwd(), 'APK', `${APK_RELEASE_VERSION}.apk`);

function printHelp() {
    console.log(`用法: npm run apk:map-report -- [选项]

选项:
  --unpack <dir>   APK 解包目录，默认 APK/_analysis/unpack
  --apk <file>     APK 文件路径，默认 APK/${APK_RELEASE_VERSION}.apk
  --json           输出 JSON
  --check          manifest 或 SHA256 不匹配时以非 0 退出
  --help           显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        unpackDir: DEFAULT_UNPACK_DIR,
        apkPath: DEFAULT_APK_PATH,
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
        } else if (arg === '--apk') {
            const value = argv[++i];
            if (!value) throw new Error('--apk 缺少文件参数');
            options.apkPath = path.resolve(value);
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    return options;
}

async function sha256File(filePath: string): Promise<string | null> {
    try {
        const data = await readFile(filePath);
        return createHash('sha256').update(data).digest('hex').toUpperCase();
    } catch {
        return null;
    }
}

async function readDecryptedMap(unpackDir: string, entry: ApkSkirmishMapManifestEntry): Promise<ApkAemMap> {
    const encryptedPath = path.join(unpackDir, ...entry.resourcePath.split('/'));
    const encrypted = await readFile(encryptedPath);
    return parseApkAemMap(decryptApkResourceBytes(encrypted));
}

async function listAemFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return listAemFiles(fullPath);
        return entry.isFile() && entry.name.endsWith('.aem') ? [fullPath] : [];
    }));
    return files.flat().sort((left, right) => left.localeCompare(right));
}

function toResourcePath(unpackDir: string, filePath: string): string {
    return path.relative(unpackDir, filePath).split(path.sep).join('/');
}

async function buildAllAemTerrainUsageReport(unpackDir: string): Promise<AllAemTerrainUsageReport> {
    const aemFiles = await listAemFiles(path.join(unpackDir, 'assets'));
    const skirmishResourcePaths = new Set(APK_SKIRMISH_MAP_MANIFEST.map(entry => entry.resourcePath));
    const grouped = new Map<number, AllAemTerrainUsageEntry>();
    const fullParseFailures: { resourcePath: string; error: string }[] = [];

    for (const filePath of aemFiles) {
        const resourcePath = toResourcePath(unpackDir, filePath);
        const decrypted = decryptApkResourceBytes(await readFile(filePath));
        const terrainOnly = parseApkAemTerrainOnly(decrypted);
        const terrainUsage = getApkAemTerrainUsage(terrainOnly);
        const isSkirmish = skirmishResourcePaths.has(resourcePath);

        try {
            parseApkAemMap(decrypted);
        } catch (error) {
            fullParseFailures.push({
                resourcePath,
                error: error instanceof Error ? error.message : String(error)
            });
        }

        for (const apkTerrainId of LOW_CONFIDENCE_AEM_TERRAIN_IDS) {
            const tileCount = terrainUsage[apkTerrainId] ?? 0;
            if (tileCount === 0) continue;

            const existing = grouped.get(apkTerrainId) ?? {
                apkTerrainId,
                tileCount: 0,
                resourceCount: 0,
                skirmishTileCount: 0,
                nonSkirmishTileCount: 0,
                resources: []
            };
            existing.tileCount += tileCount;
            existing.resourceCount += 1;
            if (isSkirmish) {
                existing.skirmishTileCount += tileCount;
            } else {
                existing.nonSkirmishTileCount += tileCount;
            }
            existing.resources.push({ resourcePath, tileCount, isSkirmish });
            grouped.set(apkTerrainId, existing);
        }
    }

    for (const apkTerrainId of LOW_CONFIDENCE_AEM_TERRAIN_IDS) {
        if (!grouped.has(apkTerrainId)) {
            grouped.set(apkTerrainId, {
                apkTerrainId,
                tileCount: 0,
                resourceCount: 0,
                skirmishTileCount: 0,
                nonSkirmishTileCount: 0,
                resources: []
            });
        }
    }

    return {
        aemCount: aemFiles.length,
        fullParseFailureCount: fullParseFailures.length,
        fullParseFailures,
        lowConfidenceTerrainUsage: [...grouped.values()].sort((left, right) => left.apkTerrainId - right.apkTerrainId)
    };
}

function buildMapReportEntry(map: ApkAemMap, entry: ApkSkirmishMapManifestEntry): MapReportEntry {
    const confidence = getApkAemTerrainConfidenceUsage(map);
    return {
        name: entry.name,
        resourcePath: entry.resourcePath,
        width: map.width,
        height: map.height,
        playerIds: [...map.playerIds],
        initialUnitCount: map.units.length,
        recommendedGold: map.recommendedGold,
        tailTemplate: map.tail.template,
        approximateTerrainIds: confidence.approximateTerrainIds,
        approximateTileCount: confidence.approximateTileCount,
        unmappedTerrainIds: confidence.unmappedTerrainIds,
        unmappedTileCount: confidence.unmappedTileCount,
        manifestMatched: matchesApkSkirmishMapManifest(map, entry)
    };
}

async function buildReport(options: CliOptions): Promise<ApkMapReport> {
    const maps: MapReportEntry[] = [];
    for (const entry of APK_SKIRMISH_MAP_MANIFEST) {
        const map = await readDecryptedMap(options.unpackDir, entry);
        maps.push(buildMapReportEntry(map, entry));
    }
    const tailTemplateCounts = maps.reduce<Record<string, number>>((counts, map) => {
        counts[map.tailTemplate] = (counts[map.tailTemplate] ?? 0) + 1;
        return counts;
    }, {});

    return {
        apkVersion: APK_RELEASE_VERSION,
        apkPath: options.apkPath,
        apkSha256: await sha256File(options.apkPath),
        expectedApkSha256: APK_RELEASE_SHA256,
        unpackDir: options.unpackDir,
        decryption: APK_RESOURCE_DECRYPTION_INFO,
        mapCount: maps.length,
        matchedManifestCount: maps.filter(entry => entry.manifestMatched).length,
        approximateMapCount: maps.filter(entry => entry.approximateTileCount > 0).length,
        unmappedMapCount: maps.filter(entry => entry.unmappedTileCount > 0).length,
        tailTemplateCounts,
        unexpectedTailTemplateCount: maps.filter(entry => entry.tailTemplate !== EXPECTED_SKIRMISH_TAIL_TEMPLATE).length,
        maps,
        terrainUsageSummary: getApkSkirmishTerrainUsageSummary(),
        verificationTargets: getApkSkirmishTerrainVerificationTargets(),
        allAemTerrainUsage: await buildAllAemTerrainUsageReport(options.unpackDir)
    };
}

function formatIds(ids: readonly number[]): string {
    return ids.length === 0 ? '-' : ids.join(',');
}

function renderMarkdown(report: ApkMapReport): string {
    const tailSummary = Object.entries(report.tailTemplateCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([template, count]) => `${template}=${count}`)
        .join('，');
    const lines = [
        `# APK skirmish 地图解密复核报告`,
        ``,
        `- APK 版本：${report.apkVersion}`,
        `- APK 路径：\`${report.apkPath}\``,
        `- APK SHA256：${report.apkSha256 ?? '未读取'}${report.apkSha256 === report.expectedApkSha256 ? '（匹配）' : '（不匹配或缺失）'}`,
        `- 解包目录：\`${report.unpackDir}\``,
        `- 解密方式：${report.decryption.cipher}，key/iv = \`${report.decryption.keyHex}\``,
        `- 官方 skirmish 地图：${report.mapCount} 张，manifest 匹配 ${report.matchedManifestCount} 张`,
        `- 含低可信 approximate tile 地图：${report.approximateMapCount} 张；含 unmapped tile 地图：${report.unmappedMapCount} 张`,
        `- 尾部模板：${tailSummary || '-'}；非 ${EXPECTED_SKIRMISH_TAIL_TEMPLATE}：${report.unexpectedTailTemplateCount} 张`,
        ``,
        `| 地图 | 尺寸 | 玩家 | 单位 | 推荐金币 | 尾部 | approximate | unmapped | manifest |`,
        `| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |`
    ];

    for (const map of report.maps) {
        lines.push([
            `| \`${map.name}\``,
            `${map.width}x${map.height}`,
            formatIds(map.playerIds),
            map.initialUnitCount,
            map.recommendedGold ?? '-',
            map.tailTemplate,
            map.approximateTileCount === 0 ? '-' : `${formatIds(map.approximateTerrainIds)} (${map.approximateTileCount})`,
            map.unmappedTileCount === 0 ? '-' : `${formatIds(map.unmappedTerrainIds)} (${map.unmappedTileCount})`,
            map.manifestMatched ? '是' : '否'
        ].join(' | ') + ' |');
    }

    const lowConfidenceTerrain = report.terrainUsageSummary.filter(entry => entry.confidence !== 'atlas' && entry.confidence !== 'confirmed');
    lines.push(
        ``,
        `## 低可信 tile 汇总`,
        ``,
        `| APK tile | 格子 | 地图数 | 地图 | 当前项目映射 | 可信度 | 当前规则语义 |`,
        `| ---: | ---: | ---: | --- | --- | --- | --- |`
    );

    if (lowConfidenceTerrain.length === 0) {
        lines.push(`| - | 0 | 0 | - | - | - | - |`);
    } else {
        for (const terrain of lowConfidenceTerrain) {
            const semantic = terrain.projectRuleSemantics;
            const summary = [
                semantic.projectTerrainKey ?? '-',
                `防御${semantic.defenseBonus ?? '-'}`,
                `回血${semantic.healPerTurn ?? '-'}`,
                semantic.clearsNegativeStatus ? '清异常' : '不清异常',
                semantic.canBeCaptured ? '可占领' : '不可占领',
                semantic.generatesIncome ? '有收入' : '无收入',
                semantic.canRecruit ? '可招募' : '不可招募'
            ].join('; ');
            lines.push([
                `| ${terrain.apkTerrainId}`,
                terrain.tileCount,
                terrain.mapCount,
                terrain.mapNames.map(name => `\`${name}\``).join(', '),
                terrain.projectTerrainId ?? '-',
                terrain.confidence,
                summary
            ].join(' | ') + ' |');
        }
    }

    lines.push(
        ``,
        `## 全 AEM 低可信 tile 使用范围`,
        ``,
        `- 全 assets AEM：${report.allAemTerrainUsage.aemCount} 张`,
        `- 可完整解析单位段失败：${report.allAemTerrainUsage.fullParseFailureCount} 张；地形段仍已纳入统计`,
        ``,
        `| APK tile | 总格子 | skirmish 格子 | 非 skirmish 格子 | 资源数 | 资源 |`,
        `| ---: | ---: | ---: | ---: | ---: | --- |`
    );
    for (const entry of report.allAemTerrainUsage.lowConfidenceTerrainUsage) {
        lines.push([
            `| ${entry.apkTerrainId}`,
            entry.tileCount,
            entry.skirmishTileCount,
            entry.nonSkirmishTileCount,
            entry.resourceCount,
            entry.resources.length === 0
                ? '-'
                : entry.resources.map(item => `\`${item.resourcePath}\`(${item.tileCount}${item.isSkirmish ? ',skirmish' : ''})`).join(', ')
        ].join(' | ') + ' |');
    }
    if (report.allAemTerrainUsage.fullParseFailures.length > 0) {
        lines.push('', '单位段解析失败资源：');
        for (const failure of report.allAemTerrainUsage.fullParseFailures) {
            lines.push(`- \`${failure.resourcePath}\`: ${failure.error}`);
        }
    }

    lines.push(
        ``,
        `## 人工验证目标`,
        ``,
        `| 地图 | APK tile | 坐标 | 当前项目语义 | 实测状态 | 实测结果 | 项目 checklist |`,
        `| --- | ---: | --- | --- | --- | --- | --- |`
    );

    for (const target of report.verificationTargets) {
        const positions = target.positions.map(position => `(${position.x},${position.y})`).join(', ');
        const checks = target.manualChecks.map(check => `${check.key}=${check.currentProjectValue}`).join('; ');
        const verification = target.manualVerification;
        const status = verification.status === 'confirmed'
            ? `已实测（${verification.observedAt ?? '-'}，${verification.source ?? '-'}）`
            : '待验证';
        const observed = verification.notes.length > 0 ? verification.notes.join(' ') : '-';
        lines.push(`| \`${target.mapName}\` | ${target.apkTerrainId} | ${positions} | ${target.projectRuleSemantics.projectTerrainKey ?? '-'} | ${status} | ${observed} | ${checks} |`);
    }

    return lines.join('\n');
}

function hasAllAemTerrainUsageMismatch(report: ApkMapReport): boolean {
    if (report.allAemTerrainUsage.aemCount !== EXPECTED_ALL_AEM_COUNT) return true;

    const failurePaths = report.allAemTerrainUsage.fullParseFailures.map(failure => failure.resourcePath);
    if (JSON.stringify(failurePaths) !== JSON.stringify([...EXPECTED_FULL_PARSE_FAILURE_RESOURCE_PATHS])) {
        return true;
    }

    const actual = report.allAemTerrainUsage.lowConfidenceTerrainUsage.map(entry => ({
        apkTerrainId: entry.apkTerrainId,
        tileCount: entry.tileCount,
        skirmishTileCount: entry.skirmishTileCount,
        nonSkirmishTileCount: entry.nonSkirmishTileCount,
        resourceCount: entry.resourceCount
    }));
    return JSON.stringify(actual) !== JSON.stringify([...EXPECTED_LOW_CONFIDENCE_ALL_AEM_USAGE]);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildReport(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    const shaMismatch = report.apkSha256 !== report.expectedApkSha256;
    const manifestMismatch = report.matchedManifestCount !== report.mapCount;
    const unmapped = report.unmappedMapCount > 0;
    const unexpectedTail = report.unexpectedTailTemplateCount > 0;
    const allAemTerrainUsageMismatch = hasAllAemTerrainUsageMismatch(report);
    if (options.check && (shaMismatch || manifestMismatch || unmapped || unexpectedTail || allAemTerrainUsageMismatch)) {
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
