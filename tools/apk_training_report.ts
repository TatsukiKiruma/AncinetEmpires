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
import type { Action } from '../src/game/types';
import { decryptApkResourceBytes, APK_RESOURCE_DECRYPTION_INFO } from './apk_resource_crypto';

interface CliOptions {
    unpackDir: string;
    json: boolean;
    check: boolean;
    includeApproximate: boolean;
    smokePlies: number;
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
    smokeRequestedPlies: number;
    smokeExecutedPlies: number;
    smokeDone: boolean;
    smokeError: string | null;
    smokeFinalLegalActionCount: number;
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
    smokePlies: number;
    smokeFailureCount: number;
    setupOptions: ReturnType<typeof getApkSkirmishSetupOptions>;
    scenarios: TrainingScenarioReportEntry[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');

function printHelp() {
    console.log(`用法: npm run apk:training-report -- [选项]

选项:
  --unpack <dir>          APK 解包目录，默认 APK/_analysis/unpack
  --include-approximate   纳入含 approximate tile 的官方地图，默认只检查 16 张干净地图
  --smoke-plies <n>       每个场景执行 n 个合法动作 smoke test，默认 4；设为 0 可关闭
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
        includeApproximate: false,
        smokePlies: 4
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
        } else if (arg === '--smoke-plies') {
            const value = argv[++i];
            if (!value) throw new Error('--smoke-plies 缺少数值参数');
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new Error('--smoke-plies 必须是非负整数');
            }
            options.smokePlies = parsed;
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

function chooseSmokeAction(actions: Action[]): Action | null {
    return actions.find(action => action.type !== 'surrender') ?? actions[0] ?? null;
}

function runScenarioSmoke(
    env: ReturnType<typeof createApkSkirmishTrainingEnv>,
    requestedPlies: number
): Pick<
    TrainingScenarioReportEntry,
    'smokeRequestedPlies' | 'smokeExecutedPlies' | 'smokeDone' | 'smokeError' | 'smokeFinalLegalActionCount'
> {
    let executed = 0;
    let done = false;
    let smokeError: string | null = null;

    for (let ply = 0; ply < requestedPlies; ply += 1) {
        const actions = env.getLegalActions();
        const action = chooseSmokeAction(actions);
        if (!action) {
            smokeError = `第 ${ply + 1} 步无合法动作`;
            break;
        }

        const result = env.stepAction(action);
        executed += 1;
        done = result.done;

        if (result.info.includes('非法动作')) {
            smokeError = `第 ${ply + 1} 步执行 ${action.type} 返回非法动作: ${result.info}`;
            break;
        }
        if (done) {
            break;
        }
    }

    return {
        smokeRequestedPlies: requestedPlies,
        smokeExecutedPlies: executed,
        smokeDone: done,
        smokeError,
        smokeFinalLegalActionCount: env.getLegalActions().length
    };
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
    map: ApkAemMap,
    smokePlies: number
): TrainingScenarioReportEntry {
    const manifestEntry = getApkSkirmishMapManifestEntry(scenario.mapName);
    const manifestMatched = manifestEntry !== null && matchesApkSkirmishMapManifest(map, manifestEntry);
    const env = createApkSkirmishTrainingEnv(map, scenario, { maxPlies: 200 });
    const observation = env.getObservation();
    const metadata = observation.metadata;
    const legalActionCount = env.getLegalActions().length;
    const smoke = runScenarioSmoke(env, smokePlies);

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
        legalActionCount,
        recruitableUnitCount: observation.rules.recruitableUnits?.length ?? null,
        ...smoke
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
        entries.push(buildScenarioReportEntry(scenario, map, options.smokePlies));
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
        smokePlies: options.smokePlies,
        smokeFailureCount: entries.filter(entry => entry.smokeError !== null).length,
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
        `- smoke plies：每场景 ${report.smokePlies} 步，失败场景 ${report.smokeFailureCount} 个`,
        `- 开局设置范围：起始金币 ${report.setupOptions.initialGold.default}（${report.setupOptions.initialGold.min}-${report.setupOptions.initialGold.max}，步进 ${report.setupOptions.initialGold.step}）；单位上限 ${report.setupOptions.unitLimit.default}（${report.setupOptions.unitLimit.min}-${report.setupOptions.unitLimit.max}，步进 ${report.setupOptions.unitLimit.step}）；等级上限 ${report.setupOptions.levelCap.default}（${report.setupOptions.levelCap.min}-${report.setupOptions.levelCap.max}，步进 ${report.setupOptions.levelCap.step}）；模式 ${report.setupOptions.modes.options.map(mode => `${mode}=${report.setupOptions.modes.labels[mode]}`).join('、')}`,
        ``,
        `| 场景 | 模式 | 地图 | 玩家 | 单位 | 金币 | approximate | unmapped | 合法动作 | smoke | 可招募 | manifest | metadata |`,
        `| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |`
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
            scenario.smokeError
                ? `失败: ${scenario.smokeError}`
                : `${scenario.smokeExecutedPlies}/${scenario.smokeRequestedPlies}${scenario.smokeDone ? ' done' : ''}`,
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
    const smokeFailures = report.smokeFailureCount > 0;
    if (options.check && (scenarioCountMismatch || manifestMismatch || metadataMismatch || zeroLegalActions || smokeFailures)) {
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
