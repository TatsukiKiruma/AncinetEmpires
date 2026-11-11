/**
 * V17/T17-00：冻结 V17 的实际执行身份（owner：T17-00）。
 *
 * 与 `v16/tools/freeze_v16.ts` 的关系：**新增文件**，复用 V16 的清单定义与身份函数，
 * 但产物写到 `v17/out/<runId>/identity/`，并多做三件 V17 必须做的事：
 *
 * 1. **与 V16 冻结读数逐项比对**：五图初态（金币/合法数/可招募集/初态 hash/地图字节 SHA）
 *    必须与 `v16/out/v16_20260926_core/identity/five_maps.json` 完全一致，否则冠军的
 *    旧 DEV20 5/20 不能引用，必须在新版本重跑 20 局。
 * 2. **与 V16 源码摘要比对**：engine/policy/h0/runner 四组摘要若变化，记录为
 *    `infraChangedSinceV16`，并给出哪些文件变了。
 * 3. **B100 教师来源身份**：外部只读工作区的 HEAD、教师源码 SHA、参数快照 SHA，
 *    以及本次迁入副本的 SHA，全部写进 `b100_source_manifest.json`。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/freeze_v17.ts `
 *     --run-id v17_20260926_r2 --git-json v17/out/v17_20260926_r2/identity/_git_identity.json
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import {
    V16_ACTION_FILTER_ID,
    V16_CAPS_ID,
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_MAPS,
    V16_PANELS,
    V16_RNG_CONTRACT_ID,
    V16_SD_PLAN_FILE,
    V16_UNPACK_DIR,
    blocksForPanelV16,
    expectedCandidateGamesV16,
    expectedMirrorEntitiesV16,
    scenarioIdOfMapV16,
} from '../../v16/tools/eval_v16_protocol';
import {
    ENGINE_SOURCE_FILES_V16,
    H0_SOURCE_FILES_V16,
    POLICY_SOURCE_FILES_V16,
    RUNNER_SOURCE_FILES_V16,
    digestFileTableV16,
    initialStateHashOfV15,
    mapArtifactsV15,
    mapLayoutHashOfV15,
    sourceDigestsV16,
} from '../../v16/tools/eval_v16_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ID = arg('--run-id', 'v17_20260926_r2') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v17/out/${RUN_ID}`) as string);
const IDENTITY_DIR = path.join(RUN_ROOT, 'identity');
const FORCE = flag('--force');
const V16_IDENTITY = path.resolve('v16/out/v16_20260926_core/identity');
const EXTERNAL = arg('--external', 'C:\\code\\AncinetEmpires-100pct') as string;

if (fs.existsSync(path.join(IDENTITY_DIR, 'manifest.json')) && !FORCE) {
    throw new Error(`[T17-00] identity 已冻结：${IDENTITY_DIR}。确需重跑请显式 --force 并保留旧目录。`);
}
fs.mkdirSync(IDENTITY_DIR, { recursive: true });

const sha256Text = (v: string): string => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const sha256File = (abs: string): string => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
function writeJson(rel: string, value: unknown): string {
    const abs = path.join(IDENTITY_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const text = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(abs, text, 'utf8');
    return sha256Text(text);
}

/* ============================ 1. git 身份 ============================ */
const gitJsonArg = arg('--git-json', null);
let gitIdentity: Record<string, unknown>;
if (gitJsonArg !== null && fs.existsSync(path.resolve(gitJsonArg))) {
    gitIdentity = JSON.parse(fs.readFileSync(path.resolve(gitJsonArg), 'utf8')) as Record<string, unknown>;
} else {
    gitIdentity = { note: 'git 信息未提供（sandbox 禁止工具内 spawn git）；请用 --git-json 传入。' };
}
gitIdentity.frozenAt = new Date().toISOString();
const gitSha = writeJson('git_identity.json', gitIdentity);

/* ============================ 2. 运行环境 ============================ */
const environment = {
    schema: 'v17_environment_1',
    frozenAt: new Date().toISOString(),
    node: { version: process.version, v8: process.versions.v8, execPath: process.execPath, platform: process.platform, arch: process.arch },
    machine: {
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model ?? null,
        totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
        freeMemGB: Number((os.freemem() / 1024 ** 3).toFixed(2)),
        hostname: os.hostname(),
        osVersion: os.version(),
    },
    python: { note: 'torch CPU-only 环境由外部命令写入；不把 CPU torch 描述成 GPU 训练。' } as unknown,
};
const pyEnvArg = arg('--python-env', null);
if (pyEnvArg !== null && fs.existsSync(path.resolve(pyEnvArg))) {
    environment.python = JSON.parse(fs.readFileSync(path.resolve(pyEnvArg), 'utf8')) as unknown;
}
const envSha = writeJson('environment.json', environment);

/* ============================ 3. 源码清单 + 与 V16 比对 ============================ */
const repoRoot = process.cwd();
const digests = sourceDigestsV16(repoRoot);
const v16Progress = path.resolve('v16/out/v16_20260926_core/arena/dev/P1_s2026.progress.json');
const v16Recorded = fs.existsSync(v16Progress)
    ? (JSON.parse(fs.readFileSync(v16Progress, 'utf8')) as { sourceDigests?: Record<string, string> }).sourceDigests ?? null
    : null;

const groups: Record<string, { fileList: readonly string[]; digest: string; files: Record<string, string> }> = {
    engine: { fileList: ENGINE_SOURCE_FILES_V16, digest: digests.engine.digest, files: digestFileTableV16(digests.engine) },
    policy: { fileList: POLICY_SOURCE_FILES_V16, digest: digests.policy.digest, files: digestFileTableV16(digests.policy) },
    h0: { fileList: H0_SOURCE_FILES_V16, digest: digests.h0.digest, files: digestFileTableV16(digests.h0) },
    runner: { fileList: RUNNER_SOURCE_FILES_V16, digest: digests.runner.digest, files: digestFileTableV16(digests.runner) },
};
const infraDiff: Record<string, { v16: string | null; v17: string; same: boolean }> = {};
for (const key of Object.keys(groups)) {
    infraDiff[key] = { v16: v16Recorded?.[key] ?? null, v17: groups[key].digest, same: v16Recorded?.[key] === groups[key].digest };
}
const infraChanged = Object.values(infraDiff).some((v) => v.same === false);
const sourceManifest = {
    schema: 'v17_source_manifest_1',
    frozenAt: new Date().toISOString(),
    repoRoot: repoRoot.replace(/\\/g, '/'),
    digestFormat: digests.engine.format,
    groups,
    comparisonToV16: {
        reference: 'v16/out/v16_20260926_core/arena/dev/P1_s2026.progress.json#sourceDigests',
        perGroup: infraDiff,
        infraChangedSinceV16: infraChanged,
        consequence: infraChanged
            ? 'runner/engine/policy/h0 任一摘要变化 ⇒ P1:s2026 的旧 DEV20 5/20 只能作为历史引用，冠军必须在 V17 版本重跑 20 局后才可作为当前基线。'
            : '四组摘要与 V16 相同 ⇒ 推理/规则未变，旧 DEV20 5/20 可作为当前基线引用（但 V17 仍会复跑一次以确认）。',
    },
    rationale: {
        engine: '改变终局/淘汰/合法性/伤害顺序/收入结算的文件集合',
        policy: '模型臂实际执行的共享推理代码（合法集 + 固定过滤 + 编码 + 网络 + 稳定 argmax）',
        h0: 'H0 对手的完整依赖闭包',
        runner: '对局执行器与协议/身份实现（V16 清单，V17 新增 runner 单独记录）',
    },
};
const sourceSha = writeJson('source_manifest.json', sourceManifest);

/* ============================ 3b. V17 新增文件身份 ============================ */
const V17_FILES = [
    'v17/tools/v17_input_identity.ts',
    'v17/tools/v17_identity_parity.ts',
    'v17/tools/arena_run_v17.ts',
    'v17/tools/freeze_v17.ts',
    'v17/tools/build_v17_dataset.py',
    'v17/tools/build_v17_dataset.ts',
    'v17/tools/collect_v17_rollouts.ts',
    'v17/teachers/battle_search_b100.ts',
    'v17/teachers/b100_policy.ts',
    'v17/tools/b100_capture_states.ts',
    'v17/tools/b100_parity.ts',
];
const v17FileTable = V17_FILES.map((rel) => {
    const abs = path.resolve(rel);
    return {
        path: rel,
        exists: fs.existsSync(abs),
        sha256: fs.existsSync(abs) ? sha256File(abs) : null,
        bytes: fs.existsSync(abs) ? fs.statSync(abs).size : null,
    };
});

/* ============================ 4. 五图初态（与 V16 审核表比对） ============================ */
const envFactory = await createDefaultEnvFactory(V16_UNPACK_DIR, V16_SD_PLAN_FILE);
const v16MapDoc = JSON.parse(fs.readFileSync(path.join(V16_IDENTITY, 'five_maps.json'), 'utf8')) as {
    openings: Array<{
        mapName: string; mapHash: string; mapBytes: number; mapLayoutHash: string;
        initialStateHash: string; initialGold: number[]; initialLegalActionCount: number;
        initialRecruitCodes: string[]; snapshotRoundTripGold: number[]; snapshotRoundTripHash: string;
    }>;
};
const v16ByMap = new Map(v16MapDoc.openings.map((o) => [o.mapName, o]));

function makeEpisode(scenarioId: string, seed: number) {
    const mapName = scenarioId.split(':').pop() as string;
    return {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
        seed, maxPlies: 1200, maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;
}

const openings: Array<Record<string, unknown>> = [];
let allMatch = true;
for (let m = 0; m < V16_MAPS.length; m += 1) {
    const mapName = V16_MAPS[m];
    const scenarioId = scenarioIdOfMapV16(mapName);
    const seed = V16_PANELS.dev.baseSeed + 10 * m;
    const env = await envFactory.createEnv(makeEpisode(scenarioId, seed));
    env.reset(seed);
    const engine = env.getEngine();
    const state = engine.getState();
    const legal = engine.getLegalActions(state.currentPlayer);
    const recruitCodes = legal.filter((a) => a.type.startsWith('recruit')).map((a) => encodeAction(a)).sort();
    const roundTrip = new GameEngine(JSON.parse(JSON.stringify(state))).getState();
    const gold = state.players.map((p) => p.gold);
    const seatAlliances: Record<string, number> = {};
    for (const p of state.players) seatAlliances[String(p.id)] = getAllianceId(state, p.id);
    const artifacts = mapArtifactsV15(V16_UNPACK_DIR, scenarioId);
    const hash = initialStateHashOfV15(state);
    const prev = v16ByMap.get(mapName);
    const same = prev !== undefined
        && JSON.stringify(gold) === JSON.stringify(prev.initialGold)
        && legal.length === prev.initialLegalActionCount
        && JSON.stringify(recruitCodes) === JSON.stringify(prev.initialRecruitCodes)
        && hash === prev.initialStateHash
        && artifacts.mapHash === prev.mapHash;
    if (!same) allMatch = false;
    openings.push({
        mapIndex: m, mapName, scenarioId,
        mapHash: artifacts.mapHash, mapBytes: artifacts.bytes,
        mapLayoutHash: mapLayoutHashOfV15(state), initialStateHash: hash,
        initialGold: gold, initialLegalActionCount: legal.length, initialRecruitCodes: recruitCodes,
        seatAlliances,
        snapshotRoundTripGold: roundTrip.players.map((p) => p.gold),
        snapshotRoundTripHash: initialStateHashOfV15(roundTrip),
        matchesV16AuditTable: same,
        v16InitialGold: prev?.initialGold ?? null,
    });
    console.log(`[T17-00] ${mapName} gold=${JSON.stringify(gold)} legal=${legal.length} recruit=${recruitCodes.length} 与 V16 冻结表${same ? '一致 ✓' : '不一致 ✗'}`);
}
writeJson('five_maps.json', {
    schema: 'v17_five_maps_1',
    frozenAt: new Date().toISOString(),
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    referenceV16Table: 'v16/out/v16_20260926_core/identity/five_maps.json',
    referenceV16TableSha256: sha256File(path.join(V16_IDENTITY, 'five_maps.json')),
    allMatchV16: allMatch,
    devSeedUsedPerMap: V16_MAPS.map((_, m) => V16_PANELS.dev.baseSeed + 10 * m),
    openings,
});

/* ============================ 5. 冠军与对照权重 ============================ */
const CHAMPION = 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json';
const CHAMPION_SHA = 'b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899';
const championAbs = path.resolve(CHAMPION);
const championSha = fs.existsSync(championAbs) ? sha256File(championAbs) : null;
writeJson('champion.json', {
    schema: 'v17_champion_freeze_1',
    frozenAt: new Date().toISOString(),
    path: CHAMPION,
    sha256: championSha,
    declaredSha256FromAudit: CHAMPION_SHA,
    shaMatchesAudit: championSha === CHAMPION_SHA,
    dev20FromV16: { wins: 5, games: 20, note: 'V16 审核独立重算；仅当 infraChangedSinceV16=false 且 V17 复跑一致时才作为当前基线。' },
    cherryPickWarning: '2→5 是同一开发面板挑选后的改善，不是独立稳定性证明。',
});

/* ============================ 6. B100 来源身份 ============================ */
const extFiles = [
    'src/game/ai/battle_search_ai.ts',
    'src/game/ai/heuristic_ai.ts',
    'docs/training/battle_ai/models/battle_search_v11.json',
];
const extTable = extFiles.map((rel) => {
    const abs = path.join(EXTERNAL, ...rel.split('/'));
    return { path: rel, exists: fs.existsSync(abs), sha256: fs.existsSync(abs) ? sha256File(abs) : null };
});
const extExpected: Record<string, string> = {
    'src/game/ai/battle_search_ai.ts': '34bf582941252a7b3c6d4f26a60a85a81a6ce4ae1c5c88c4ac96557bea9d6f5b',
    'docs/training/battle_ai/models/battle_search_v11.json': 'b1209af5309dad7028b4fb52763a8808fa350b62bd265ceecca6fc260a52d062',
    'src/game/ai/heuristic_ai.ts': '5382c27e9b4dbd06e52f91a40b4377c64f3ad030a16e4a8de83aacee56228164',
};
writeJson('b100_source_manifest.json', {
    schema: 'v17_b100_source_manifest_1',
    frozenAt: new Date().toISOString(),
    externalWorkspace: EXTERNAL,
    externalReadOnly: true,
    externalHead: 'e85bb013936eae90956c491658a4a7b0095ce27b',
    externalTable: extTable.map((e) => ({ ...e, declaredSha256: extExpected[e.path] ?? null, matchesDeclared: e.sha256 === (extExpected[e.path] ?? null) })),
    importedCopy: v17FileTable.filter((f) => f.path.startsWith('v17/teachers/') || f.path.includes('b100')),
    note: '只迁入教师逻辑；不搬外部 engine / 地图工厂 / runner。外部工作区始终只读。',
});

/* ============================ 7. 对战协议 ============================ */
writeJson('arena_protocol.json', {
    schema: 'v17_arena_protocol_1',
    frozenAt: new Date().toISOString(),
    runId: RUN_ID,
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    actionFilterId: V16_ACTION_FILTER_ID,
    rngContractId: V16_RNG_CONTRACT_ID,
    capsId: V16_CAPS_ID,
    caps: V16_DEFAULT_CAPS,
    maps: V16_MAPS,
    panels: Object.fromEntries(Object.entries(V16_PANELS).map(([key, value]) => [key, {
        ...value,
        candidateGames: expectedCandidateGamesV16(key),
        mirrorEntities: expectedMirrorEntitiesV16(key),
        blocks: blocksForPanelV16(key),
    }])),
    seatRule: '每个 seed 跑模型座位 0、1 各一次；只交换策略座位，不改地图拥有者与开局结算顺序。',
    scoringRule: '胜 = 真实 engine terminal 且 winnerAllianceId == candidateAllianceId；负/平/超时/步数截断都不计胜；验收分母固定 20。',
    teacherRule: 'B100 教师臂使用同一面板、同一 caps、同一 H0 seatstream；不使用 CONFIRM20 调教师参数。',
    sourceDigests: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.digest])),
});

/* ============================ manifest ============================ */
const manifestFiles = ['git_identity.json', 'environment.json', 'source_manifest.json', 'five_maps.json', 'champion.json', 'b100_source_manifest.json', 'arena_protocol.json'];
writeJson('manifest.json', {
    schema: 'v17_identity_manifest_1',
    runId: RUN_ID,
    frozenAt: new Date().toISOString(),
    identityDir: IDENTITY_DIR.replace(/\\/g, '/'),
    digests: { git_identity: gitSha, environment: envSha, source_manifest: sourceSha },
    files: manifestFiles.map((rel) => {
        const abs = path.join(IDENTITY_DIR, rel);
        const bytes = fs.readFileSync(abs);
        return { path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    }),
    v17NewFiles: v17FileTable,
    status: 'FROZEN',
    notYetFrozen: [
        'V17 训练数据 split 与 SHA（T17-01 进行中）',
        'B100 R/Q 资格成绩（T17-03/04 进行中）',
        'CONFIRM20（模型冻结前不得运行）',
    ],
});

console.log(`[T17-00] 身份冻结 → ${IDENTITY_DIR}`);
console.log(`[T17-00] engine=${groups.engine.digest.slice(0, 12)}… policy=${groups.policy.digest.slice(0, 12)}… h0=${groups.h0.digest.slice(0, 12)}… runner=${groups.runner.digest.slice(0, 12)}…`);
console.log(`[T17-00] infraChangedSinceV16=${infraChanged} fiveMapsMatchV16=${allMatch} championShaMatch=${championSha === CHAMPION_SHA}`);