import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    APK_RELEASE_SHA256,
    APK_RELEASE_VERSION,
    APK_SKIRMISH_MAP_MANIFEST,
    getApkSkirmishTerrainVerificationTargets,
    matchesApkSkirmishMapManifest,
    type ApkSkirmishMapManifestEntry
} from '../src/game/apk_manifest';
import { getApkAemTerrainConfidenceUsage, parseApkAemMap, type ApkAemMap } from '../src/game/apk_map';
import { decryptApkResourceBytes, APK_RESOURCE_DECRYPTION_INFO } from './apk_resource_crypto';

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
    maps: MapReportEntry[];
    verificationTargets: ReturnType<typeof getApkSkirmishTerrainVerificationTargets>;
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
        maps,
        verificationTargets: getApkSkirmishTerrainVerificationTargets()
    };
}

function formatIds(ids: readonly number[]): string {
    return ids.length === 0 ? '-' : ids.join(',');
}

function renderMarkdown(report: ApkMapReport): string {
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
    if (options.check && (shaMismatch || manifestMismatch || unmapped)) {
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
