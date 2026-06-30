import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    APK_RELEASE_VERSION,
    getApkSkirmishMapManifestEntry,
    matchesApkSkirmishMapManifest
} from '../src/game/apk_manifest';
import { parseApkAemMap, type ApkAemMap } from '../src/game/apk_map';
import {
    createApkSkirmishTrainingEnv,
    getApkSkirmishSetupOptions,
    getApkSkirmishTrainingScenarios,
    type ApkSkirmishTrainingScenario
} from '../src/game/apk_skirmish';
import { decryptApkResourceBytes, APK_RESOURCE_DECRYPTION_INFO } from './apk_resource_crypto';

interface CliOptions {
    unpackDir: string;
    json: boolean;
    check: boolean;
    includeApproximate: boolean;
}

interface TrainingScenarioReportEntry {
    id: string;
    mode: string;
    mapName: string;
    resourcePath: string;
    width: number;
    height: number;
    playerCount: number;
    initialUnitCount: number;
    recommendedGold: number | null;
    approximateTileCount: number;
    unmappedTileCount: number;
    manifestMatched: boolean;
    metadataMatched: boolean;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCount: number;
    recruitableUnitCount: number | null;
}

interface ApkTrainingReport {
    apkVersion: string;
    unpackDir: string;
    decryption: typeof APK_RESOURCE_DECRYPTION_INFO;
    includeApproximate: boolean;
    scenarioCount: number;
    manifestMatchedCount: number;
    metadataMatchedCount: number;
    zeroLegalActionCount: number;
    setupOptions: ReturnType<typeof getApkSkirmishSetupOptions>;
    scenarios: TrainingScenarioReportEntry[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');

function printHelp() {
    console.log(`用法: npm run apk:training-report -- [选项]

选项:
  --unpack <dir>          APK 解包目录，默认 APK/_analysis/unpack
  --include-approximate   纳入含 approximate tile 的官方地图，默认只检查 16 张干净地图
  --json                  输出 JSON
  --check                 场景数量、manifest、metadata 或初始合法动作异常时以非 0 退出
  --help                  显示帮助
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        unpackDir: DEFAULT_UNPACK_DIR,
        json: false,
        check: false,
        includeApproximate: false
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
        } else if (arg === '--include-approximate') {
            options.includeApproximate = true;
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

async function readDecryptedMap(unpackDir: string, scenario: ApkSkirmishTrainingScenario): Promise<ApkAemMap> {
    const encryptedPath = path.join(unpackDir, ...scenario.resourcePath.split('/'));
    const encrypted = await readFile(encryptedPath);
    return parseApkAemMap(decryptApkResourceBytes(encrypted));
}

async function getCachedMap(
    cache: Map<string, ApkAemMap>,
    unpackDir: string,
    scenario: ApkSkirmishTrainingScenario
): Promise<ApkAemMap> {
    const cached = cache.get(scenario.resourcePath);
    if (cached) return cached;

    const map = await readDecryptedMap(unpackDir, scenario);
    cache.set(scenario.resourcePath, map);
    return map;
}

function buildScenarioReportEntry(
    scenario: ApkSkirmishTrainingScenario,
    map: ApkAemMap
): TrainingScenarioReportEntry {
    const manifestEntry = getApkSkirmishMapManifestEntry(scenario.mapName);
    const manifestMatched = manifestEntry !== null && matchesApkSkirmishMapManifest(map, manifestEntry);
    const env = createApkSkirmishTrainingEnv(map, scenario, { maxPlies: 200 });
    const observation = env.getObservation();
    const metadata = observation.metadata;

    return {
        id: scenario.id,
        mode: scenario.mode,
        mapName: scenario.mapName,
        resourcePath: scenario.resourcePath,
        width: observation.mapWidth,
        height: observation.mapHeight,
        playerCount: observation.players.length,
        initialUnitCount: observation.units.length,
        recommendedGold: metadata?.recommendedGold ?? null,
        approximateTileCount: metadata?.apkApproximateTileCount ?? 0,
        unmappedTileCount: metadata?.apkUnmappedTileCount ?? 0,
        manifestMatched,
        metadataMatched: (
            metadata?.apkMapName === scenario.mapName
            && metadata?.apkSkirmishMode === scenario.mode
            && metadata?.apkSkirmishTrainingScenarioId === scenario.id
            && metadata?.apkResourcePath === scenario.resourcePath
        ),
        currentPlayer: observation.currentPlayer,
        turnPlayerIds: observation.turnPlayerIds,
        legalActionCount: env.getLegalActions().length,
        recruitableUnitCount: observation.rules.recruitableUnits?.length ?? null
    };
}

async function buildReport(options: CliOptions): Promise<ApkTrainingReport> {
    const scenarios = getApkSkirmishTrainingScenarios({
        allowApproximateTerrain: options.includeApproximate
    });
    const mapCache = new Map<string, ApkAemMap>();
    const entries: TrainingScenarioReportEntry[] = [];

    for (const scenario of scenarios) {
        const map = await getCachedMap(mapCache, options.unpackDir, scenario);
        entries.push(buildScenarioReportEntry(scenario, map));
    }

    return {
        apkVersion: APK_RELEASE_VERSION,
        unpackDir: options.unpackDir,
        decryption: APK_RESOURCE_DECRYPTION_INFO,
        includeApproximate: options.includeApproximate,
        scenarioCount: entries.length,
        manifestMatchedCount: entries.filter(entry => entry.manifestMatched).length,
        metadataMatchedCount: entries.filter(entry => entry.metadataMatched).length,
        zeroLegalActionCount: entries.filter(entry => entry.legalActionCount === 0).length,
        setupOptions: getApkSkirmishSetupOptions(),
        scenarios: entries
    };
}

function renderMarkdown(report: ApkTrainingReport): string {
    const lines = [
        `# APK skirmish 训练场景复核报告`,
        ``,
        `- APK 版本：${report.apkVersion}`,
        `- 解包目录：\`${report.unpackDir}\``,
        `- 解密方式：${report.decryption.cipher}，key/iv = \`${report.decryption.keyHex}\``,
        `- includeApproximate：${report.includeApproximate ? '是' : '否'}`,
        `- 训练场景：${report.scenarioCount} 个，manifest 匹配 ${report.manifestMatchedCount} 个，metadata 匹配 ${report.metadataMatchedCount} 个`,
        `- 初始合法动作数为 0 的场景：${report.zeroLegalActionCount}`,
        `- 开局设置范围：起始金币 ${report.setupOptions.initialGold.default}（${report.setupOptions.initialGold.min}-${report.setupOptions.initialGold.max}，步进 ${report.setupOptions.initialGold.step}）；单位上限 ${report.setupOptions.unitLimit.default}（${report.setupOptions.unitLimit.min}-${report.setupOptions.unitLimit.max}，步进 ${report.setupOptions.unitLimit.step}）；等级上限 ${report.setupOptions.levelCap.default}（${report.setupOptions.levelCap.min}-${report.setupOptions.levelCap.max}，步进 ${report.setupOptions.levelCap.step}）；模式 ${report.setupOptions.modes.options.map(mode => `${mode}=${report.setupOptions.modes.labels[mode]}`).join('、')}`,
        ``,
        `| 场景 | 模式 | 地图 | 玩家 | 单位 | 金币 | approximate | unmapped | 合法动作 | 可招募 | manifest | metadata |`,
        `| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |`
    ];

    for (const scenario of report.scenarios) {
        lines.push([
            `| \`${scenario.id}\``,
            scenario.mode,
            `\`${scenario.mapName}\``,
            scenario.playerCount,
            scenario.initialUnitCount,
            scenario.recommendedGold ?? '-',
            scenario.approximateTileCount,
            scenario.unmappedTileCount,
            scenario.legalActionCount,
            scenario.recruitableUnitCount ?? '-',
            scenario.manifestMatched ? '是' : '否',
            scenario.metadataMatched ? '是' : '否'
        ].join(' | ') + ' |');
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

    const expectedScenarioCount = options.includeApproximate ? 40 : 32;
    const scenarioCountMismatch = report.scenarioCount !== expectedScenarioCount;
    const manifestMismatch = report.manifestMatchedCount !== report.scenarioCount;
    const metadataMismatch = report.metadataMatchedCount !== report.scenarioCount;
    const zeroLegalActions = report.zeroLegalActionCount > 0;
    if (options.check && (scenarioCountMismatch || manifestMismatch || metadataMismatch || zeroLegalActions)) {
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
