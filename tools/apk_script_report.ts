import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoState } from '../src/game/demo_map';
import { GameEngine } from '../src/game/engine';
import { AncientEmpiresEnv } from '../src/game/env';
import { applyApkScriptRuleConfig, applyApkScriptStageStateConfig } from '../src/game/apk_script_config';
import {
    APK_SCRIPT_API_CALL_COUNTS,
    APK_SCRIPT_DECRYPTED_JS_FILE_COUNT,
    APK_SCRIPT_LITERAL_RULE_CONFIGS,
    APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS,
    APK_SCRIPT_MANIFEST_VERSION,
    type ApkScriptLiteralRuleConfig,
    type ApkScriptLiteralStageStateConfig,
    type ApkScriptApiName
} from '../src/game/apk_script_manifest';
import { decryptApkResourceBytes, APK_RESOURCE_DECRYPTION_INFO } from './apk_resource_crypto';

type ApiCounts = Record<string, number>;
type LiteralArg = string | number | boolean;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface CliOptions {
    unpackDir: string;
    json: boolean;
    check: boolean;
}

interface ScriptReportEntry {
    resourcePath: string;
    encryptedByteLength: number;
    decryptedByteLength: number;
    apiCallCounts: ApiCounts;
}

interface CountMismatch {
    apiName: string;
    expected: number;
    actual: number;
}

interface LiteralMismatch {
    kind: 'ruleConfig' | 'stageStateConfig';
    expected: JsonValue;
    actual: JsonValue;
}

interface ApplicationCheck {
    id: string;
    title: string;
    expected: JsonValue;
    actual: JsonValue;
    status: 'pass' | 'fail';
}

interface ApkScriptReport {
    apkVersion: string;
    unpackDir: string;
    decryption: typeof APK_RESOURCE_DECRYPTION_INFO;
    scriptCount: number;
    expectedScriptCount: number;
    apiCallCounts: ApiCounts;
    apiCountMismatches: CountMismatch[];
    literalRuleConfigs: ApkScriptLiteralRuleConfig[];
    literalStageStateConfigs: ApkScriptLiteralStageStateConfig[];
    literalMismatches: LiteralMismatch[];
    applicationChecks: ApplicationCheck[];
    scripts: ScriptReportEntry[];
}

const DEFAULT_UNPACK_DIR = path.resolve(process.cwd(), 'APK', '_analysis', 'unpack');

function printHelp() {
    console.log(`用法: npm run apk:script-report -- [选项]

选项:
  --unpack <dir>   APK 解包目录，默认 APK/_analysis/unpack
  --json           输出 JSON
  --check          文件数、API 计数或字面量配置不匹配时以非 0 退出
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

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addCount(counts: ApiCounts, key: string, delta = 1) {
    counts[key] = (counts[key] ?? 0) + delta;
}

function mergeCounts(target: ApiCounts, source: ApiCounts) {
    for (const [key, value] of Object.entries(source)) {
        addCount(target, key, value);
    }
}

export function countApkScriptApiCalls(source: string): ApiCounts {
    const counts: ApiCounts = {};

    for (const match of source.matchAll(/\bStage\.([A-Za-z_]\w*)\s*\(/g)) {
        addCount(counts, `Stage.${match[1]}`);
    }
    for (const match of source.matchAll(/\brule\.([A-Za-z_]\w*)\s*\(/g)) {
        addCount(counts, `rule.${match[1]}`);
    }

    return sortObject(counts);
}

function findApiCalls(source: string, apiName: string): string[] {
    const pattern = new RegExp(`${escapeRegExp(apiName)}\\s*\\(([^)]*)\\)`, 'g');
    return [...source.matchAll(pattern)].map(match => match[1]);
}

function splitArgs(argsText: string): string[] {
    const args: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (const char of argsText) {
        if (quote) {
            current += char;
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            current += char;
        } else if (char === ',') {
            args.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    if (current.trim().length > 0 || argsText.trim().length > 0) {
        args.push(current.trim());
    }

    return args;
}

function parseLiteralArg(arg: string): LiteralArg | null {
    if (/^-?\d+$/.test(arg)) return Number(arg);
    if (arg === 'true') return true;
    if (arg === 'false') return false;

    const stringMatch = arg.match(/^(['"])(.*)\1$/);
    if (stringMatch) {
        return stringMatch[2].replace(/\\(['"\\])/g, '$1');
    }

    return null;
}

function parseLiteralArgs(argsText: string): LiteralArg[] | null {
    const args = splitArgs(argsText);
    const parsed = args.map(parseLiteralArg);
    return parsed.every(arg => arg !== null) ? parsed as LiteralArg[] : null;
}

function getNumericCalls(source: string, apiName: string): number[][] {
    return findApiCalls(source, apiName)
        .map(parseLiteralArgs)
        .filter((args): args is number[] => (
            args !== null && args.every(arg => typeof arg === 'number')
        ));
}

function numbersToArray(args: readonly number[]): number[] {
    return [...args];
}

function uniqueSorted(values: number[]): number[] {
    return [...new Set(values)].sort((left, right) => left - right);
}

function sortObject<T extends Record<string, number>>(value: T): T {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) as T;
}

export function extractApkScriptLiteralRuleConfig(
    resourcePath: string,
    source: string
): ApkScriptLiteralRuleConfig | null {
    const config: ApkScriptLiteralRuleConfig = { resourcePath };
    const syncSetGoldValues = getNumericCalls(source, 'Stage.SyncSetGold')
        .filter(args => args.length === 1)
        .map(args => args[0]);
    const syncChangeGoldCalls = getNumericCalls(source, 'Stage.SyncChangeGold')
        .filter(args => args.length === 2)
        .map(([teamId, delta]) => ({ teamId, delta }));
    const syncSetUnitLimitValues = getNumericCalls(source, 'Stage.SyncSetUnitLimit')
        .filter(args => args.length === 1)
        .map(args => args[0]);
    const syncSetRecruitUnits = getNumericCalls(source, 'Stage.SyncSetRecruitUnits')
        .filter(args => args.length > 0)
        .map(numbersToArray);
    const syncSetRecruitUnitsForTeam = getNumericCalls(source, 'Stage.SyncSetRecruitUnitsForTeam')
        .filter(args => args.length > 1)
        .map(([teamId, ...apkUnitIds]) => ({ teamId, apkUnitIds }));
    const syncSetAllianceCalls = getNumericCalls(source, 'Stage.SyncSetAlliance')
        .filter(args => args.length === 2)
        .map(([teamId, allianceId]) => ({ teamId, allianceId }));
    const syncDisableTeamIds = uniqueSorted(getNumericCalls(source, 'Stage.SyncDisableTeam')
        .filter(args => args.length === 1)
        .map(args => args[0]));
    const syncRestoreTeamIds = uniqueSorted(getNumericCalls(source, 'Stage.SyncRestoreTeam')
        .filter(args => args.length === 1)
        .map(args => args[0]));
    const syncGameOverAllianceIds = uniqueSorted(getNumericCalls(source, 'Stage.SyncGameOver')
        .filter(args => args.length === 1)
        .map(args => args[0]));

    const ruleIncome = {
        incomeVillage: getNumericCalls(source, 'rule.SetIncomeVillage').find(args => args.length === 1)?.[0],
        incomeCastle: getNumericCalls(source, 'rule.SetIncomeCastle').find(args => args.length === 1)?.[0],
        incomeCommanderBase: getNumericCalls(source, 'rule.SetIncomeCommanderBase').find(args => args.length === 1)?.[0],
        incomeCommanderGrowth: getNumericCalls(source, 'rule.SetIncomeCommanderGrowth').find(args => args.length === 1)?.[0]
    };

    if (syncSetGoldValues.length > 0) config.syncSetGoldValues = syncSetGoldValues;
    if (syncChangeGoldCalls.length > 0) config.syncChangeGoldCalls = syncChangeGoldCalls;
    if (syncSetUnitLimitValues.length > 0) config.syncSetUnitLimitValues = syncSetUnitLimitValues;
    if (syncSetRecruitUnits.length > 0) config.syncSetRecruitUnits = syncSetRecruitUnits;
    if (syncSetRecruitUnitsForTeam.length > 0) config.syncSetRecruitUnitsForTeam = syncSetRecruitUnitsForTeam;
    if (syncSetAllianceCalls.length > 0) config.syncSetAllianceCalls = syncSetAllianceCalls;
    if (syncDisableTeamIds.length > 0) config.syncDisableTeamIds = syncDisableTeamIds;
    if (syncRestoreTeamIds.length > 0) config.syncRestoreTeamIds = syncRestoreTeamIds;
    if (syncGameOverAllianceIds.length > 0) config.syncGameOverAllianceIds = syncGameOverAllianceIds;
    if (Object.values(ruleIncome).some(value => value !== undefined)) {
        config.ruleIncome = Object.fromEntries(
            Object.entries(ruleIncome).filter(([, value]) => value !== undefined)
        );
    }

    return Object.keys(config).length > 1 ? config : null;
}

export function extractApkScriptLiteralStageStateConfig(
    resourcePath: string,
    source: string
): ApkScriptLiteralStageStateConfig | null {
    const config: ApkScriptLiteralStageStateConfig = { resourcePath };
    const syncOverrideMovCalls = findApiCalls(source, 'Stage.SyncOverrideMov')
        .map(parseLiteralArgs)
        .filter((args): args is [string, number, number] => (
            args !== null
            && args.length === 3
            && typeof args[0] === 'string'
            && typeof args[1] === 'number'
            && typeof args[2] === 'number'
        ))
        .map(([code, tileType, mov]) => ({ code, tileType, mov }));
    const syncSetUnitStatusCalls = findApiCalls(source, 'Stage.SyncSetUnitStatus')
        .map(parseLiteralArgs)
        .filter((args): args is [number, number, number, number, boolean] => (
            args !== null
            && args.length === 5
            && typeof args[0] === 'number'
            && typeof args[1] === 'number'
            && typeof args[2] === 'number'
            && typeof args[3] === 'number'
            && typeof args[4] === 'boolean'
        ))
        .map(([x, y, statusId, rounds, replaceExisting]) => ({ x, y, statusId, rounds, replaceExisting }));

    if (syncOverrideMovCalls.length > 0) config.syncOverrideMovCalls = syncOverrideMovCalls;
    if (syncSetUnitStatusCalls.length > 0) config.syncSetUnitStatusCalls = syncSetUnitStatusCalls;

    return Object.keys(config).length > 1 ? config : null;
}

async function listScriptFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return listScriptFiles(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    }));
    return files.flat().sort((left, right) => left.localeCompare(right));
}

function toResourcePath(unpackDir: string, filePath: string): string {
    return path.relative(unpackDir, filePath).split(path.sep).join('/');
}

function normalizeConfigs<T extends { resourcePath: string }>(configs: readonly T[]): JsonValue {
    return configs
        .map(config => JSON.parse(stableStringify(config)) as T)
        .sort((left, right) => left.resourcePath.localeCompare(right.resourcePath)) as JsonValue;
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

function addApplicationCheck(
    checks: ApplicationCheck[],
    id: string,
    title: string,
    expected: JsonValue,
    actual: JsonValue
) {
    checks.push({
        id,
        title,
        expected,
        actual,
        status: stableStringify(expected) === stableStringify(actual) ? 'pass' : 'fail'
    });
}

function createSixTeamScriptProbeState() {
    const state = createDemoState();
    for (let teamId = 2; teamId <= 5; teamId += 1) {
        state.players.push({ id: teamId, gold: 0, isAlive: true, commanderDeathCount: 0 });
        state.units.push({
            id: `script_team_${teamId}`,
            ownerId: teamId,
            unitClass: 'soldier',
            pos: { x: teamId, y: 3 },
            hp: 100,
            maxHp: 100,
            hasMoved: false,
            hasActed: false
        });
    }
    return state;
}

function buildApiMismatches(actualCounts: ApiCounts): CountMismatch[] {
    const keys = new Set([
        ...Object.keys(APK_SCRIPT_API_CALL_COUNTS),
        ...Object.keys(actualCounts)
    ]);

    return [...keys].sort().flatMap(apiName => {
        const expected = APK_SCRIPT_API_CALL_COUNTS[apiName as ApkScriptApiName] ?? 0;
        const actual = actualCounts[apiName] ?? 0;
        return expected === actual ? [] : [{ apiName, expected, actual }];
    });
}

function buildLiteralMismatches(
    literalRuleConfigs: ApkScriptLiteralRuleConfig[],
    literalStageStateConfigs: ApkScriptLiteralStageStateConfig[]
): LiteralMismatch[] {
    const mismatches: LiteralMismatch[] = [];
    const expectedRule = normalizeConfigs(APK_SCRIPT_LITERAL_RULE_CONFIGS);
    const actualRule = normalizeConfigs(literalRuleConfigs);
    const expectedStage = normalizeConfigs(APK_SCRIPT_LITERAL_STAGE_STATE_CONFIGS);
    const actualStage = normalizeConfigs(literalStageStateConfigs);

    if (stableStringify(expectedRule) !== stableStringify(actualRule)) {
        mismatches.push({ kind: 'ruleConfig', expected: expectedRule, actual: actualRule });
    }
    if (stableStringify(expectedStage) !== stableStringify(actualStage)) {
        mismatches.push({ kind: 'stageStateConfig', expected: expectedStage, actual: actualStage });
    }

    return mismatches;
}

export function buildApkScriptApplicationChecks(): ApplicationCheck[] {
    const checks: ApplicationCheck[] = [];

    const ruleState = createDemoState({
        alliances: { 0: 1 },
        teams: { 0: { unitLimit: 5 } }
    });
    applyApkScriptRuleConfig(ruleState, 'assets/mods/AEI/s5.js');
    const ruleObservation = new AncientEmpiresEnv({ initialState: ruleState }).getObservation();
    const rulePlayer0 = ruleObservation.players.find(player => player.id === 0);
    const rulePlayer1 = ruleObservation.players.find(player => player.id === 1);
    addApplicationCheck(
        checks,
        'rule-config-observation',
        '脚本规则配置应用后会进入训练 observation',
        {
            resourcePath: 'assets/mods/AEI/s5.js',
            rulesInitialGold: 800,
            team0InitialGold: 900,
            player0Gold: 900,
            player1Gold: 800,
            player0AllianceId: 1,
            player0UnitLimit: 5,
            ignoredGameOverAllianceIds: [1, 2],
            warningCount: 0
        },
        {
            resourcePath: ruleObservation.metadata?.apkRuleScriptResourcePath ?? null,
            rulesInitialGold: ruleObservation.rules.initialGold,
            team0InitialGold: ruleObservation.rules.teams[0]?.initialGold ?? null,
            player0Gold: rulePlayer0?.gold ?? null,
            player1Gold: rulePlayer1?.gold ?? null,
            player0AllianceId: rulePlayer0?.allianceId ?? null,
            player0UnitLimit: rulePlayer0?.unitLimit ?? null,
            ignoredGameOverAllianceIds: ruleObservation.metadata?.apkRuleScriptIgnoredGameOverAllianceIds ?? null,
            warningCount: ruleObservation.metadata?.apkRuleScriptWarnings?.length ?? null
        }
    );

    const soState = createDemoState();
    applyApkScriptRuleConfig(soState, 'assets/mods/SO/controller.js');
    const soObservation = new AncientEmpiresEnv({ initialState: soState }).getObservation();
    addApplicationCheck(
        checks,
        'so-recruit-observation',
        'SO 脚本招募列表会进入训练 observation',
        {
            resourcePath: 'assets/mods/SO/controller.js',
            recruitableUnitCount: 9,
            includesSoldier: true,
            includesDragon: true,
            includesCommander: false,
            commanderRecruitCost: null
        },
        {
            resourcePath: soObservation.metadata?.apkRuleScriptResourcePath ?? null,
            recruitableUnitCount: soObservation.rules.recruitableUnits?.length ?? null,
            includesSoldier: soObservation.rules.recruitableUnits?.includes('soldier') ?? null,
            includesDragon: soObservation.rules.recruitableUnits?.includes('dragon') ?? null,
            includesCommander: soObservation.rules.recruitableUnits?.includes('commander') ?? null,
            commanderRecruitCost: soObservation.players.find(player => player.id === 0)?.recruitCosts.commander ?? null
        }
    );

    const teamRuleState = createDemoState();
    applyApkScriptRuleConfig(teamRuleState, 'assets/mods/AEIII/s6.js');
    const teamRuleObservation = new AncientEmpiresEnv({ initialState: teamRuleState }).getObservation();
    addApplicationCheck(
        checks,
        'team-rule-observation',
        '脚本队伍招募、联盟和禁用队伍会进入训练 observation',
        {
            resourcePath: 'assets/mods/AEIII/s6.js',
            initialGold: 500,
            unitLimit: 50,
            disabledTeams: [3],
            alliances: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
            team0RecruitableUnitCount: 15,
            team1RecruitableUnitCount: 10,
            team5RecruitableUnitCount: 12,
            ignoredRestoreTeamIds: [3],
            ignoredGameOverAllianceIds: [1, 2]
        },
        {
            resourcePath: teamRuleObservation.metadata?.apkRuleScriptResourcePath ?? null,
            initialGold: teamRuleObservation.rules.initialGold,
            unitLimit: teamRuleObservation.rules.unitLimit,
            disabledTeams: teamRuleObservation.rules.disabledTeams,
            alliances: teamRuleObservation.rules.alliances,
            team0RecruitableUnitCount: teamRuleObservation.rules.teams[0]?.recruitableUnits?.length ?? null,
            team1RecruitableUnitCount: teamRuleObservation.rules.teams[1]?.recruitableUnits?.length ?? null,
            team5RecruitableUnitCount: teamRuleObservation.rules.teams[5]?.recruitableUnits?.length ?? null,
            ignoredRestoreTeamIds: teamRuleObservation.metadata?.apkRuleScriptIgnoredRestoreTeamIds ?? null,
            ignoredGameOverAllianceIds: teamRuleObservation.metadata?.apkRuleScriptIgnoredGameOverAllianceIds ?? null
        }
    );

    const teamRuleTurnState = createSixTeamScriptProbeState();
    applyApkScriptRuleConfig(teamRuleTurnState, 'assets/mods/AEIII/s6.js');
    teamRuleTurnState.currentPlayer = 2;
    const teamRuleTurnObservation = new AncientEmpiresEnv({ initialState: teamRuleTurnState }).getObservation();
    const teamRuleTurnEngine = new GameEngine(teamRuleTurnState);
    const disabledTeamLegalActionCount = teamRuleTurnEngine.getLegalActions(3).length;
    teamRuleTurnEngine.step({ type: 'end_turn' });
    addApplicationCheck(
        checks,
        'team-rule-turn-application',
        '脚本联盟和禁用队伍会影响训练回合轮转与合法动作',
        {
            resourcePath: 'assets/mods/AEIII/s6.js',
            turnPlayerIds: [0, 1, 2, 4, 5],
            player3Enabled: false,
            player3AllianceId: 2,
            disabledTeamLegalActionCount: 0,
            currentPlayerAfterTeam2EndTurn: 4
        },
        {
            resourcePath: teamRuleTurnObservation.metadata?.apkRuleScriptResourcePath ?? null,
            turnPlayerIds: teamRuleTurnObservation.turnPlayerIds,
            player3Enabled: teamRuleTurnObservation.players.find(player => player.id === 3)?.isEnabled ?? null,
            player3AllianceId: teamRuleTurnObservation.players.find(player => player.id === 3)?.allianceId ?? null,
            disabledTeamLegalActionCount,
            currentPlayerAfterTeam2EndTurn: teamRuleTurnEngine.getState().currentPlayer
        }
    );

    const incomeState = createDemoState();
    applyApkScriptRuleConfig(incomeState, 'assets/mods/AEIII/s4.js');
    for (const row of incomeState.map.tiles) {
        for (const tile of row) {
            tile.ownerId = null;
        }
    }
    incomeState.map.tiles[1][3].ownerId = 0;
    incomeState.currentPlayer = 1;
    const incomeObservation = new AncientEmpiresEnv({ initialState: incomeState }).getObservation();
    const incomeEngine = new GameEngine(incomeState);
    incomeEngine.step({ type: 'end_turn' });
    const incomeFinalPlayer0 = incomeEngine.getState().players.find(player => player.id === 0);
    addApplicationCheck(
        checks,
        'script-income-application',
        '脚本收入配置会进入训练 observation 并影响回合收入',
        {
            resourcePath: 'assets/mods/AEIII/s4.js',
            incomeVillage: 100,
            incomeCastle: 100,
            incomeCommanderBase: 0,
            incomeCommanderGrowth: 25,
            player0GoldBeforeIncome: 500,
            player0GoldAfterIncome: 600
        },
        {
            resourcePath: incomeObservation.metadata?.apkRuleScriptResourcePath ?? null,
            incomeVillage: incomeObservation.rules.incomeVillage,
            incomeCastle: incomeObservation.rules.incomeCastle,
            incomeCommanderBase: incomeObservation.rules.incomeCommanderBase,
            incomeCommanderGrowth: incomeObservation.rules.incomeCommanderGrowth,
            player0GoldBeforeIncome: incomeObservation.players.find(player => player.id === 0)?.gold ?? null,
            player0GoldAfterIncome: incomeFinalPlayer0?.gold ?? null
        }
    );

    const moveState = createDemoState();
    moveState.units[0].apkUnitCode = 'g1';
    applyApkScriptStageStateConfig(moveState, 'assets/mods/AEIII/s4.js');
    const moveObservation = new AncientEmpiresEnv({ initialState: moveState }).getObservation();
    const moveUnit = moveObservation.units.find(unit => unit.id === 'u1');
    addApplicationCheck(
        checks,
        'stage-move-override-observation',
        '脚本移动覆盖应用后会进入训练 observation',
        {
            resourcePath: 'assets/mods/AEIII/s4.js',
            appliedSyncOverrideMovCount: 1,
            appliedSyncSetUnitStatusCount: 0,
            warningCount: 4,
            unitMoveOverrides: { 0: 1 }
        },
        {
            resourcePath: moveObservation.metadata?.apkStageStateScriptResourcePath ?? null,
            appliedSyncOverrideMovCount: moveObservation.metadata?.apkStageStateAppliedSyncOverrideMovCount ?? null,
            appliedSyncSetUnitStatusCount: moveObservation.metadata?.apkStageStateAppliedSyncSetUnitStatusCount ?? null,
            warningCount: moveObservation.metadata?.apkStageStateScriptWarnings?.length ?? null,
            unitMoveOverrides: moveUnit?.apkMoveOverrides ?? null
        }
    );

    const statusState = createDemoState();
    statusState.map.width = 7;
    statusState.map.height = 10;
    statusState.map.tiles = Array.from({ length: 10 }, () => (
        Array.from({ length: 7 }, () => ({ terrainId: 6 as const, ownerId: null }))
    ));
    const statusTarget = statusState.units[0];
    statusTarget.pos = { x: 6, y: 9 };
    statusTarget.status = { type: 'poisoned', remainingTicks: 2 };
    applyApkScriptStageStateConfig(statusState, 'assets/mods/AEIII/s7.js');
    const statusObservation = new AncientEmpiresEnv({ initialState: statusState }).getObservation();
    const statusUnit = statusObservation.units.find(unit => unit.id === statusTarget.id);
    addApplicationCheck(
        checks,
        'stage-status-observation',
        '脚本状态覆盖应用后会进入训练 observation',
        {
            resourcePath: 'assets/mods/AEIII/s7.js',
            appliedSyncOverrideMovCount: 0,
            appliedSyncSetUnitStatusCount: 1,
            warningCount: 0,
            status: 'inspired',
            apkStatusId: 2,
            statusRemainingTurns: 2,
            statusRemainingTicks: null
        },
        {
            resourcePath: statusObservation.metadata?.apkStageStateScriptResourcePath ?? null,
            appliedSyncOverrideMovCount: statusObservation.metadata?.apkStageStateAppliedSyncOverrideMovCount ?? null,
            appliedSyncSetUnitStatusCount: statusObservation.metadata?.apkStageStateAppliedSyncSetUnitStatusCount ?? null,
            warningCount: statusObservation.metadata?.apkStageStateScriptWarnings?.length ?? null,
            status: statusUnit?.status ?? null,
            apkStatusId: statusUnit?.apkStatusId ?? null,
            statusRemainingTurns: statusUnit?.statusRemainingTurns ?? null,
            statusRemainingTicks: statusUnit?.statusRemainingTicks ?? null
        }
    );

    return checks;
}

export async function buildApkScriptReport(options: Partial<CliOptions> = {}): Promise<ApkScriptReport> {
    const resolvedOptions: CliOptions = {
        unpackDir: path.resolve(options.unpackDir ?? DEFAULT_UNPACK_DIR),
        json: options.json ?? false,
        check: options.check ?? false
    };
    const scriptsDir = path.join(resolvedOptions.unpackDir, 'assets', 'mods');
    const files = await listScriptFiles(scriptsDir);
    const scripts: ScriptReportEntry[] = [];
    const apiCallCounts: ApiCounts = {};
    const literalRuleConfigs: ApkScriptLiteralRuleConfig[] = [];
    const literalStageStateConfigs: ApkScriptLiteralStageStateConfig[] = [];

    for (const filePath of files) {
        const encrypted = await readFile(filePath);
        const decrypted = decryptApkResourceBytes(encrypted);
        const source = decrypted.toString('utf8');
        const resourcePath = toResourcePath(resolvedOptions.unpackDir, filePath);
        const counts = countApkScriptApiCalls(source);
        const ruleConfig = extractApkScriptLiteralRuleConfig(resourcePath, source);
        const stageStateConfig = extractApkScriptLiteralStageStateConfig(resourcePath, source);

        mergeCounts(apiCallCounts, counts);
        if (ruleConfig) literalRuleConfigs.push(ruleConfig);
        if (stageStateConfig) literalStageStateConfigs.push(stageStateConfig);
        scripts.push({
            resourcePath,
            encryptedByteLength: encrypted.length,
            decryptedByteLength: decrypted.length,
            apiCallCounts: counts
        });
    }

    const sortedCounts = sortObject(apiCallCounts);
    const sortedRuleConfigs = literalRuleConfigs.sort((left, right) => left.resourcePath.localeCompare(right.resourcePath));
    const sortedStageStateConfigs = literalStageStateConfigs.sort((left, right) => left.resourcePath.localeCompare(right.resourcePath));

    return {
        apkVersion: APK_SCRIPT_MANIFEST_VERSION,
        unpackDir: resolvedOptions.unpackDir,
        decryption: APK_RESOURCE_DECRYPTION_INFO,
        scriptCount: scripts.length,
        expectedScriptCount: APK_SCRIPT_DECRYPTED_JS_FILE_COUNT,
        apiCallCounts: sortedCounts,
        apiCountMismatches: buildApiMismatches(sortedCounts),
        literalRuleConfigs: sortedRuleConfigs,
        literalStageStateConfigs: sortedStageStateConfigs,
        literalMismatches: buildLiteralMismatches(sortedRuleConfigs, sortedStageStateConfigs),
        applicationChecks: buildApkScriptApplicationChecks(),
        scripts
    };
}

function renderMarkdown(report: ApkScriptReport): string {
    const lines = [
        `# APK 脚本解密复核报告`,
        ``,
        `- APK 版本：${report.apkVersion}`,
        `- 解包目录：\`${report.unpackDir}\``,
        `- 解密方式：${report.decryption.cipher}，key/iv = \`${report.decryption.keyHex}\``,
        `- 脚本数量：${report.scriptCount}/${report.expectedScriptCount}`,
        `- API 计数差异：${report.apiCountMismatches.length}`,
        `- 字面量配置差异：${report.literalMismatches.length}`,
        `- 应用检查：${report.applicationChecks.filter(check => check.status === 'pass').length}/${report.applicationChecks.length}`,
        ``,
        `## API 调用次数`,
        ``,
        `| API | 次数 |`,
        `| --- | ---: |`
    ];

    for (const [apiName, count] of Object.entries(report.apiCallCounts)) {
        lines.push(`| \`${apiName}\` | ${count} |`);
    }

    lines.push(
        ``,
        `## 字面量规则配置`,
        ``,
        `- 规则配置脚本：${report.literalRuleConfigs.length}`,
        `- 单位/坐标状态配置脚本：${report.literalStageStateConfigs.length}`,
        ``,
        `| 脚本 | 规则字段 |`,
        `| --- | --- |`
    );

    for (const config of report.literalRuleConfigs) {
        lines.push(`| \`${config.resourcePath}\` | ${Object.keys(config).filter(key => key !== 'resourcePath').join(', ')} |`);
    }

    lines.push(
        ``,
        `| 脚本 | 状态字段 |`,
        `| --- | --- |`
    );
    for (const config of report.literalStageStateConfigs) {
        lines.push(`| \`${config.resourcePath}\` | ${Object.keys(config).filter(key => key !== 'resourcePath').join(', ')} |`);
    }

    lines.push(
        ``,
        `## 应用检查`,
        ``,
        `| ID | 检查 | 状态 |`,
        `| --- | --- | --- |`
    );
    for (const check of report.applicationChecks) {
        lines.push(`| \`${check.id}\` | ${check.title} | ${check.status === 'pass' ? '通过' : '失败'} |`);
    }

    if (
        report.apiCountMismatches.length > 0
        || report.literalMismatches.length > 0
        || report.applicationChecks.some(check => check.status === 'fail')
    ) {
        lines.push(``, `## 差异`, ``);
        for (const mismatch of report.apiCountMismatches) {
            lines.push(`- API \`${mismatch.apiName}\`: expected=${mismatch.expected}, actual=${mismatch.actual}`);
        }
        for (const mismatch of report.literalMismatches) {
            lines.push(`- ${mismatch.kind} 不匹配`);
        }
        for (const check of report.applicationChecks.filter(item => item.status === 'fail')) {
            lines.push(`- 应用检查 \`${check.id}\` 不匹配`);
        }
    }

    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildApkScriptReport(options);

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderMarkdown(report));
    }

    if (
        options.check
        && (
            report.scriptCount !== report.expectedScriptCount
            || report.apiCountMismatches.length > 0
            || report.literalMismatches.length > 0
            || report.applicationChecks.some(check => check.status === 'fail')
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
