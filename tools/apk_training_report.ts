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
    decodeAction,
    encodeAction,
    getActionSpaceSchema,
    type Observation
} from '../src/game/env';
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
    hasUnverifiedApproximateTerrain: boolean;
    unmappedTileCount: number;
    manifestMatched: boolean;
    metadataMatched: boolean;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCount: number;
    actionMaskMatched: boolean;
    recruitableUnitCount: number | null;
    modeRuleMatched: boolean;
    commanderInitialRecruitCosts: (number | null)[];
    commanderRecruitCostProfile: (number | null)[];
    commanderRecruitRuleMatched: boolean;
    observationApkEvidenceMatched: boolean;
    smokeRequestedPlies: number;
    smokeExecutedPlies: number;
    smokeDone: boolean;
    smokeError: string | null;
    smokeActionMaskMatched: boolean;
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
    modeRuleMismatchCount: number;
    commanderRecruitRuleMismatchCount: number;
    observationApkEvidenceMismatchCount: number;
    actionMaskMismatchCount: number;
    smokeActionMaskMismatchCount: number;
    actionSchemaTemplateCount: number;
    actionSchemaMatched: boolean;
    actionRoundTripMatched: boolean;
    unverifiedApproximateScenarioCount: number;
    smokePlies: number;
    smokeFailureCount: number;
    setupOptions: ReturnType<typeof getApkSkirmishSetupOptions>;
    scenarios: TrainingScenarioReportEntry[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');
const VERIFIED_SKIRMISH_APPROXIMATE_TERRAIN_IDS = new Set([30, 31]);
const EXPECTED_ACTION_SPACE_SCHEMA = [
    'move:<unitId>:<x>,<y>',
    'post_attack_move:<unitId>:<x>,<y>',
    'attack:<attackerId>:<targetId>',
    'heal:<healerId>:<targetId>',
    'support:<supporterId>:<targetId>',
    'summon:<summonerId>:<graveId>:<x>,<y>',
    'recruit_to_castle:<unitClass>:<castleX>,<castleY>',
    'recruit_and_deploy:<unitClass>:<castleX>,<castleY>:<toX>,<toY>',
    'capture:<unitId>',
    'repair:<unitId>',
    'destroy_town:<unitId>',
    'wait:<unitId>',
    'surrender',
    'end_turn'
] as const;

function printHelp() {
    console.log(`用法: npm run apk:training-report -- [选项]

选项:
  --unpack <dir>          APK 解包目录，默认 APK/_analysis/unpack
  --include-approximate   额外允许未实测 approximate tile；默认已包含实机确认的 t30/t31 地图
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

function isActionMaskMatched(actions: readonly Action[], mask: readonly boolean[]): boolean {
    return actions.length === mask.length && mask.every(value => value === true);
}

function runScenarioSmoke(
    env: ReturnType<typeof createApkSkirmishTrainingEnv>,
    requestedPlies: number
): Pick<
    TrainingScenarioReportEntry,
    | 'smokeRequestedPlies'
    | 'smokeExecutedPlies'
    | 'smokeDone'
    | 'smokeError'
    | 'smokeActionMaskMatched'
    | 'smokeFinalLegalActionCount'
> {
    let executed = 0;
    let done = false;
    let smokeError: string | null = null;
    let smokeActionMaskMatched = true;

    for (let ply = 0; ply < requestedPlies; ply += 1) {
        const actions = env.getLegalActions();
        if (!isActionMaskMatched(actions, env.getActionMask())) {
            smokeActionMaskMatched = false;
        }
        const action = chooseSmokeAction(actions);
        if (!action) {
            smokeError = `第 ${ply + 1} 步无合法动作`;
            break;
        }

        const result = env.stepAction(action);
        executed += 1;
        done = result.done;
        if (!isActionMaskMatched(result.legalActions, result.actionMask)) {
            smokeActionMaskMatched = false;
        }

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
        smokeActionMaskMatched,
        smokeFinalLegalActionCount: env.getLegalActions().length
    };
}

function buildCommanderRecruitCostProfile(
    baseCost: number | null | undefined,
    costGrowth: number | null | undefined
): (number | null)[] {
    if (baseCost === null || baseCost === undefined) return [null, null, null];
    const growth = costGrowth ?? 0;
    return [0, 1, 2].map(deathCount => baseCost + deathCount * growth);
}

function sameCostProfile(left: readonly (number | null)[], right: readonly (number | null)[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildActionRoundTripSamples(): Action[] {
    return [
        { type: 'move', unitId: 'u1', to: { x: 2, y: 3 } },
        { type: 'post_attack_move', unitId: 'u1', to: { x: 4, y: 5 } },
        { type: 'attack', attackerId: 'u1', targetId: 'u2' },
        { type: 'heal', healerId: 'u3', targetId: 'u1' },
        { type: 'support', supporterId: 'u4', targetId: 'u1' },
        { type: 'summon', summonerId: 'u5', graveId: 'g1', spawnPos: { x: 6, y: 7 } },
        { type: 'recruit_to_castle', unitClass: 'soldier', castlePos: { x: 1, y: 1 } },
        { type: 'recruit_and_deploy', unitClass: 'archer', castlePos: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
        { type: 'capture', unitId: 'u1' },
        { type: 'repair', unitId: 'u1' },
        { type: 'destroy_town', unitId: 'u1' },
        { type: 'wait', unitId: 'u1' },
        { type: 'surrender' },
        { type: 'end_turn' }
    ];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function actionEquals(left: Action | null, right: Action): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isActionSchemaMatched(): boolean {
    const schema = getActionSpaceSchema();
    schema.push('mutated');
    return (
        arraysEqual(getActionSpaceSchema(), EXPECTED_ACTION_SPACE_SCHEMA)
        && !getActionSpaceSchema().includes('mutated')
    );
}

function isActionRoundTripMatched(): boolean {
    return buildActionRoundTripSamples().every(action => (
        actionEquals(decodeAction(encodeAction(action)), action)
    ));
}

function hasCompleteObservationApkEvidence(observation: Observation): boolean {
    const expectedTileCount = observation.mapWidth * observation.mapHeight;
    const terrainMappingSummary = observation.terrainMappingSummary;
    const terrainSummaryMatched = (
        terrainMappingSummary !== undefined
        && terrainMappingSummary.apkTileCount === expectedTileCount
        && Object.values(terrainMappingSummary.apkTerrainUsage).reduce((sum, count) => sum + count, 0) === expectedTileCount
        && Object.values(terrainMappingSummary.byConfidence).reduce((sum, count) => sum + count, 0) === expectedTileCount
    );
    const tilesMatched = (
        observation.tiles.length === expectedTileCount
        && observation.tiles.every(tile => (
            tile.apkTerrainId !== undefined
            && tile.apkTerrainConfig !== undefined
            && tile.apkTerrainConfig.id === tile.apkTerrainId
            && tile.apkTerrainMappingConfidence !== undefined
            && tile.apkTerrainMappingEvidence !== undefined
            && tile.apkTerrainMappingEvidence.length > 0
            && tile.defenseBonus === tile.apkTerrainConfig.defenseBonus
            && tile.healPerTurn === tile.apkTerrainConfig.healPerTurn
            && tile.moveCost === tile.apkTerrainConfig.moveCost
            && tile.ruleTerrainId !== undefined
            && tile.terrainKey.length > 0
        ))
    );
    const unitsMatched = observation.units.every(unit => (
        unit.apkUnitId !== undefined
        && Number.isInteger(unit.apkUnitClassId)
        && Number.isFinite(unit.baseAttack)
        && Number.isFinite(unit.basePhysicalDefense)
        && Number.isFinite(unit.baseMagicDefense)
        && Number.isFinite(unit.baseMinRange)
        && Number.isFinite(unit.baseMaxRange)
        && Number.isFinite(unit.baseMove)
        && Number.isFinite(unit.attackGrowth)
        && Number.isFinite(unit.defenseGrowth)
        && Number.isFinite(unit.maxHpGrowth)
        && Number.isFinite(unit.moveGrowth)
        && unit.tileApkTerrainId !== undefined
        && unit.tileApkTerrainConfig !== undefined
        && unit.tileApkTerrainConfig.id === unit.tileApkTerrainId
        && unit.tileApkTerrainMappingConfidence !== undefined
        && unit.tileApkTerrainMappingEvidence !== undefined
        && unit.tileApkTerrainMappingEvidence.length > 0
        && unit.tileDefenseBonus === unit.tileApkTerrainConfig.defenseBonus
        && unit.tileHealPerTurn === unit.tileApkTerrainConfig.healPerTurn
        && unit.tileMoveCost === unit.tileApkTerrainConfig.moveCost
    ));

    return terrainSummaryMatched && tilesMatched && unitsMatched;
}

function formatCostProfile(profile: readonly (number | null)[]): string {
    return profile.map(cost => cost ?? '-').join('/');
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
    const initialLegalActions = env.getLegalActions();
    const legalActionCount = initialLegalActions.length;
    const actionMaskMatched = isActionMaskMatched(initialLegalActions, env.getActionMask());
    const smoke = runScenarioSmoke(env, smokePlies);
    const recruitableUnits = observation.rules.recruitableUnits ?? [];
    const commanderInitialRecruitCosts = observation.players.map(player => (
        player.recruitCosts.commander ?? null
    ));
    const commanderRecruitCostProfile = buildCommanderRecruitCostProfile(
        observation.rules.commanderRecruitBaseCost,
        observation.rules.commanderRecruitCostGrowth
    );
    const expectedCommanderRecruitCostProfile = scenario.mode === 'SD'
        ? [400, 400, 400]
        : [null, null, null];
    const expectedInitialCommanderRecruitCost = scenario.mode === 'SD' ? 400 : null;
    const commanderRecruitRuleMatched = (
        sameCostProfile(commanderRecruitCostProfile, expectedCommanderRecruitCostProfile)
        && commanderInitialRecruitCosts.every(cost => cost === expectedInitialCommanderRecruitCost)
    );
    const hasUnverifiedApproximateTerrain = scenario.terrainConfidence.approximateTerrainIds.some(
        apkTerrainId => !VERIFIED_SKIRMISH_APPROXIMATE_TERRAIN_IDS.has(apkTerrainId)
    );
    const modeRuleMatched = scenario.mode === 'SD'
        ? (
            recruitableUnits.length === 19
            && recruitableUnits.includes('commander')
            && !recruitableUnits.includes('skeleton')
            && !recruitableUnits.includes('crystal')
            && observation.rules.allowSurrender
            && observation.rules.defeatOnNoUnitsAndNoCastles
            && !observation.rules.defeatOnNoUnits
        )
        : (
            recruitableUnits.length === 9
            && !recruitableUnits.includes('commander')
            && !recruitableUnits.includes('skeleton')
            && !recruitableUnits.includes('crystal')
            && observation.rules.allowSurrender
            && observation.rules.defeatOnNoUnitsAndNoCastles
            && !observation.rules.defeatOnNoUnits
        );

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
        hasUnverifiedApproximateTerrain,
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
        actionMaskMatched,
        recruitableUnitCount: observation.rules.recruitableUnits?.length ?? null,
        modeRuleMatched,
        commanderInitialRecruitCosts,
        commanderRecruitCostProfile,
        commanderRecruitRuleMatched,
        observationApkEvidenceMatched: hasCompleteObservationApkEvidence(observation),
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

    const actionSchema = getActionSpaceSchema();
    return {
        apkVersion: APK_RELEASE_VERSION,
        unpackDir: options.unpackDir,
        decryption: APK_RESOURCE_DECRYPTION_INFO,
        includeApproximate: options.includeApproximate,
        scenarioCount: entries.length,
        manifestMatchedCount: entries.filter(entry => entry.manifestMatched).length,
        metadataMatchedCount: entries.filter(entry => entry.metadataMatched).length,
        zeroLegalActionCount: entries.filter(entry => entry.legalActionCount === 0).length,
        modeRuleMismatchCount: entries.filter(entry => !entry.modeRuleMatched).length,
        commanderRecruitRuleMismatchCount: entries.filter(entry => !entry.commanderRecruitRuleMatched).length,
        observationApkEvidenceMismatchCount: entries.filter(entry => !entry.observationApkEvidenceMatched).length,
        actionMaskMismatchCount: entries.filter(entry => !entry.actionMaskMatched).length,
        smokeActionMaskMismatchCount: entries.filter(entry => !entry.smokeActionMaskMatched).length,
        actionSchemaTemplateCount: actionSchema.length,
        actionSchemaMatched: isActionSchemaMatched(),
        actionRoundTripMatched: isActionRoundTripMatched(),
        unverifiedApproximateScenarioCount: entries.filter(entry => entry.hasUnverifiedApproximateTerrain).length,
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
        `- 允许未实测 approximate：${report.includeApproximate ? '是' : '否'}`,
        `- 默认地形策略：包含无 approximate 地图和已实机确认的 t30/t31 approximate 地图，继续排除未来未实测 approximate/unmapped 地图`,
        `- 训练场景：${report.scenarioCount} 个，manifest 匹配 ${report.manifestMatchedCount} 个，metadata 匹配 ${report.metadataMatchedCount} 个`,
        `- 含未实测 approximate 的场景：${report.unverifiedApproximateScenarioCount}`,
        `- 模式规则错配场景：${report.modeRuleMismatchCount}`,
        `- 指挥官重招募费用错配场景：${report.commanderRecruitRuleMismatchCount}`,
        `- Observation APK 证据字段错配场景：${report.observationApkEvidenceMismatchCount}`,
        `- actionMask 错配场景：初始 ${report.actionMaskMismatchCount} 个，smoke ${report.smokeActionMaskMismatchCount} 个`,
        `- 动作接口：schema 模板 ${report.actionSchemaTemplateCount} 个，schema 匹配 ${report.actionSchemaMatched ? '是' : '否'}，编码/解码往返 ${report.actionRoundTripMatched ? '通过' : '失败'}`,
        `- 初始合法动作数为 0 的场景：${report.zeroLegalActionCount}`,
        `- smoke plies：每场景 ${report.smokePlies} 步，失败场景 ${report.smokeFailureCount} 个`,
        `- 开局设置范围：起始金币 ${report.setupOptions.initialGold.default}（${report.setupOptions.initialGold.min}-${report.setupOptions.initialGold.max}，步进 ${report.setupOptions.initialGold.step}）；单位上限 ${report.setupOptions.unitLimit.default}（${report.setupOptions.unitLimit.min}-${report.setupOptions.unitLimit.max}，步进 ${report.setupOptions.unitLimit.step}）；等级上限 ${report.setupOptions.levelCap.default}（${report.setupOptions.levelCap.min}-${report.setupOptions.levelCap.max}，步进 ${report.setupOptions.levelCap.step}）；模式 ${report.setupOptions.modes.options.map(mode => `${mode}=${report.setupOptions.modes.labels[mode]}`).join('、')}`,
        ``,
        `| 场景 | 模式 | 地图 | 玩家 | 单位 | 金币 | approximate | 未实测 approximate | unmapped | 合法动作 | mask | smoke | 可招募 | 指挥官费用 | 模式规则 | APK 观测 | manifest | metadata |`,
        `| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- | --- |`
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
            scenario.hasUnverifiedApproximateTerrain ? '是' : '否',
            scenario.unmappedTileCount,
            scenario.legalActionCount,
            scenario.actionMaskMatched && scenario.smokeActionMaskMatched ? '是' : '否',
            scenario.smokeError
                ? `失败: ${scenario.smokeError}`
                : `${scenario.smokeExecutedPlies}/${scenario.smokeRequestedPlies}${scenario.smokeDone ? ' done' : ''}`,
            scenario.recruitableUnitCount ?? '-',
            `${formatCostProfile(scenario.commanderRecruitCostProfile)} ${scenario.commanderRecruitRuleMatched ? '是' : '否'}`,
            scenario.modeRuleMatched ? '是' : '否',
            scenario.observationApkEvidenceMatched ? '是' : '否',
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

    const expectedScenarioCount = 40;
    const scenarioCountMismatch = report.scenarioCount !== expectedScenarioCount;
    const manifestMismatch = report.manifestMatchedCount !== report.scenarioCount;
    const metadataMismatch = report.metadataMatchedCount !== report.scenarioCount;
    const zeroLegalActions = report.zeroLegalActionCount > 0;
    const modeRuleMismatches = report.modeRuleMismatchCount > 0;
    const commanderRecruitRuleMismatches = report.commanderRecruitRuleMismatchCount > 0;
    const observationApkEvidenceMismatches = report.observationApkEvidenceMismatchCount > 0;
    const actionMaskMismatches = report.actionMaskMismatchCount > 0 || report.smokeActionMaskMismatchCount > 0;
    const actionSchemaMismatch = !report.actionSchemaMatched || !report.actionRoundTripMatched;
    const unverifiedApproximateScenarios = !report.includeApproximate && report.unverifiedApproximateScenarioCount > 0;
    const smokeFailures = report.smokeFailureCount > 0;
    if (options.check && (
        scenarioCountMismatch
        || manifestMismatch
        || metadataMismatch
        || zeroLegalActions
        || modeRuleMismatches
        || commanderRecruitRuleMismatches
        || observationApkEvidenceMismatches
        || actionMaskMismatches
        || actionSchemaMismatch
        || unverifiedApproximateScenarios
        || smokeFailures
    )) {
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
