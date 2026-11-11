/**
 * V16/T16-00：冻结实际执行环境（owner：T16-00）。
 *
 * 任务书 §2 的六项要求，逐项对应本工具的产物：
 * 1. `identity/git_identity.json`  —— HEAD、branch、status 行数与前 200 行原文、diff 摘要。
 * 2. `identity/environment.json`   —— node/CPU/内存；python/torch 由外部命令生成后并入。
 * 3. `identity/source_manifest.json` —— 引擎 / 共享推理策略 / H0 依赖闭包 / runner 四组逐文件 SHA。
 * 4. `identity/five_maps.json`     —— 五图 map bytes SHA、布局摘要、初态 hash、首步金币、
 *    合法动作数、可招募集合、座位→联盟表、快照往返金币（证明没有重复首次结算），
 *    并与 `v16/review/openings.json` 的审核表逐项核对。
 * 5. `identity/c2_models.json`     —— 三个有效 C2 final 的 schema、结构、SHA、ledger 摘要。
 * 6. `identity/arena_protocol.json` —— V16 四个面板的 resolved block 列表与 caps。
 *
 * 只读历史文件、只写 `v16/out/<runId>/identity/`；不改 V14/V15 任何产物。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/freeze_v16.ts \
 *     --run-id v16_20260926_core [--python-env <json>] [--force]
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
    V16_CAPS_ID_PREFLIGHT,
    V16_CAPS_V1_300S,
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_MAPS,
    V16_PANELS,
    V16_RNG_CONTRACT_ID,
    V16_RUN_ID_DEFAULT,
    V16_SD_PLAN_FILE,
    V16_UNPACK_DIR,
    blocksForPanelV16,
    expectedCandidateGamesV16,
    expectedMirrorEntitiesV16,
    scenarioIdOfMapV16,
} from './eval_v16_protocol';
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
    type MapOpeningV16,
} from './eval_v16_identity';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ID = arg('--run-id', V16_RUN_ID_DEFAULT) as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v16/out/${RUN_ID}`) as string);
const IDENTITY_DIR = path.join(RUN_ROOT, 'identity');
const PYTHON_ENV = arg('--python-env', null);
const FORCE = flag('--force');

if (fs.existsSync(IDENTITY_DIR) && !FORCE) {
    throw new Error(
        `[T16-00] identity 目录已存在：${IDENTITY_DIR}。`
        + '冻结产物不得静默覆盖；确需重跑请显式 --force（并把旧目录改名保留）。',
    );
}
fs.mkdirSync(IDENTITY_DIR, { recursive: true });

function sha256Text(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
function writeJson(rel: string, value: unknown): string {
    const abs = path.join(IDENTITY_DIR, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const text = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(abs, text, 'utf8');
    return sha256Text(text);
}
function sh(cmd: string[]): string {
    // 中文：sandbox 禁止 spawn；这里不执行外部命令，git 信息由 `--git-json` 预先提供。
    void cmd;
    throw new Error('unused');
}

/* ============================ 1. git 身份 ============================ */
const gitJsonArg = arg('--git-json', null);
let gitIdentity: Record<string, unknown>;
if (gitJsonArg !== null && fs.existsSync(path.resolve(gitJsonArg))) {
    gitIdentity = JSON.parse(fs.readFileSync(path.resolve(gitJsonArg), 'utf8')) as Record<string, unknown>;
} else {
    gitIdentity = {
        note: 'git 信息未通过 --git-json 提供；sandbox 禁止在工具内 spawn git。',
        declaredHeadFromDocs: 'c1b9ac038fad98ed97bfd72a801fd564747acd07',
    };
}
gitIdentity.frozenAt = new Date().toISOString();
const gitSha = writeJson('git_identity.json', gitIdentity);

/* ============================ 2. 运行环境 ============================ */
const environment: Record<string, unknown> = {
    schema: 'v16_environment_1',
    frozenAt: new Date().toISOString(),
    node: {
        version: process.version,
        v8: process.versions.v8,
        execPath: process.execPath,
        platform: process.platform,
        arch: process.arch,
    },
    machine: {
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model ?? null,
        totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
        freeMemGB: Number((os.freemem() / 1024 ** 3).toFixed(2)),
        hostname: os.hostname(),
        osVersion: os.version(),
    },
    python: null as unknown,
};
if (PYTHON_ENV !== null && fs.existsSync(path.resolve(PYTHON_ENV))) {
    environment.python = JSON.parse(fs.readFileSync(path.resolve(PYTHON_ENV), 'utf8')) as unknown;
} else {
    environment.python = { note: 'python 环境未提供；用 --python-env 传入 JSON。' };
}
const envSha = writeJson('environment.json', environment);

/* ============================ 3. 源码清单 ============================ */
const repoRoot = process.cwd();
const digests = sourceDigestsV16(repoRoot);
const sourceManifest = {
    schema: 'v16_source_manifest_1',
    frozenAt: new Date().toISOString(),
    repoRoot: repoRoot.replace(/\\/g, '/'),
    digestFormat: digests.engine.format,
    groups: {
        engine: {
            fileList: ENGINE_SOURCE_FILES_V16,
            digest: digests.engine.digest,
            files: digestFileTableV16(digests.engine),
        },
        policy: {
            fileList: POLICY_SOURCE_FILES_V16,
            digest: digests.policy.digest,
            files: digestFileTableV16(digests.policy),
        },
        h0: {
            fileList: H0_SOURCE_FILES_V16,
            digest: digests.h0.digest,
            files: digestFileTableV16(digests.h0),
        },
        runner: {
            fileList: RUNNER_SOURCE_FILES_V16,
            digest: digests.runner.digest,
            files: digestFileTableV16(digests.runner),
        },
    },
    rationale: {
        engine: '改变终局/淘汰/合法性/伤害顺序/收入结算的文件集合',
        policy: '模型臂实际执行的共享推理代码；T16-02 稳定 tie-break 必须先于正式基线落地',
        h0: 'H0 对手的完整依赖闭包；V15 清单只有 heuristic_ai.ts，V16 补齐 tactical_* 两个文件',
        runner: '对局执行器与协议/身份实现',
    },
};
const sourceSha = writeJson('source_manifest.json', sourceManifest);

/* ============================ 4. 五图初态 ============================ */
const unpackDir = V16_UNPACK_DIR;
const envFactory = await createDefaultEnvFactory(unpackDir, V16_SD_PLAN_FILE);

/** 审核表（`v16/review/openings.json`）的期望值：applyInitialTurnStart=true 的读数。 */
interface AuditRow {
    mapName: string;
    gold: number[];
    legalCount: number;
    recruitCodes: string[];
}
const auditPath = path.resolve('v16/review/openings.json');
if (!fs.existsSync(auditPath)) {
    throw new Error(`[T16-00] 缺少审核表 ${auditPath}（先跑 v16/review/probe_openings.ts）。`);
}
const auditRaw = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as Array<{
    mapName: string;
    variants: Array<{ applyInitialTurnStart: boolean; gold: number[]; legalCount: number; recruitCodes: string[] }>;
}>;
const auditByMap = new Map<string, AuditRow>();
for (const row of auditRaw) {
    const applied = row.variants.find((v) => v.applyInitialTurnStart === true);
    if (!applied) throw new Error(`[T16-00] 审核表 ${row.mapName} 缺少 applyInitialTurnStart=true 变体。`);
    auditByMap.set(row.mapName, {
        mapName: row.mapName,
        gold: applied.gold,
        legalCount: applied.legalCount,
        recruitCodes: applied.recruitCodes,
    });
}

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

/** 在**全新** env 实例里重建初态（独立重建 = 可复算性的实测部分）。 */
async function buildInitialState(scenarioId: string, seed: number): Promise<{ state: GameState; engine: GameEngine }> {
    const env = await envFactory.createEnv(makeEpisode(scenarioId, seed));
    env.reset(seed);
    const engine = env.getEngine();
    return { state: engine.getState(), engine };
}

const openings: MapOpeningV16[] = [];
for (let m = 0; m < V16_MAPS.length; m += 1) {
    const mapName = V16_MAPS[m];
    const scenarioId = scenarioIdOfMapV16(mapName);
    const seed = V16_PANELS.dev.baseSeed + 10 * m; // dev:m<s>:s0
    const first = await buildInitialState(scenarioId, seed);
    const second = await buildInitialState(scenarioId, seed);

    const state = first.state;
    const hash1 = initialStateHashOfV15(state);
    const hash2 = initialStateHashOfV15(second.state);
    if (hash1 !== hash2) {
        throw new Error(`[T16-00] ${mapName} 独立重建初态 hash 不一致：${hash1} vs ${hash2}。`);
    }

    const legal = first.engine.getLegalActions(state.currentPlayer);
    const recruitCodes = legal
        .filter((a) => a.type.startsWith('recruit'))
        .map((a) => encodeAction(a))
        .sort();

    // 快照往返：`new GameEngine(snapshot)` 不得重复结算首次回合收入。
    const roundTrip = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState).getState();
    const roundTripGold = roundTrip.players.map((p) => p.gold);
    const roundTripHash = initialStateHashOfV15(roundTrip);

    const seatAlliances: Record<string, number> = {};
    for (const p of state.players) seatAlliances[String(p.id)] = getAllianceId(state, p.id);

    const artifacts = mapArtifactsV15(unpackDir, scenarioId);
    const audit = auditByMap.get(mapName);
    if (!audit) throw new Error(`[T16-00] 审核表缺少 ${mapName}。`);
    const gold = state.players.map((p) => p.gold);
    const matchesAuditTable =
        JSON.stringify(gold) === JSON.stringify(audit.gold)
        && legal.length === audit.legalCount
        && JSON.stringify(recruitCodes) === JSON.stringify(audit.recruitCodes);

    openings.push({
        mapIndex: m,
        mapName,
        scenarioId,
        mapHash: artifacts.mapHash,
        mapBytes: artifacts.bytes,
        mapLayoutHash: mapLayoutHashOfV15(state),
        initialStateHash: hash1,
        initialGold: gold,
        initialLegalActionCount: legal.length,
        initialRecruitCodes: recruitCodes,
        seatAlliances,
        snapshotRoundTripGold: roundTripGold,
        snapshotRoundTripHash: roundTripHash,
        matchesAuditTable,
    });
    if (!matchesAuditTable) {
        throw new Error(
            `[T16-00] ${mapName} 初态与审核表不符：gold=${JSON.stringify(gold)} (期望 ${JSON.stringify(audit.gold)})，`
            + `legal=${legal.length} (期望 ${audit.legalCount})，recruit=${recruitCodes.length} (期望 ${audit.recruitCodes.length})。`
            + '不要用「大致相同」放过；初态不一致意味着整个面板不可比。',
        );
    }
    if (JSON.stringify(roundTripGold) !== JSON.stringify(gold)) {
        throw new Error(`[T16-00] ${mapName} 快照往返改变了金币：${JSON.stringify(gold)} → ${JSON.stringify(roundTripGold)}（重复结算嫌疑）。`);
    }
    if (roundTripHash !== hash1) {
        throw new Error(`[T16-00] ${mapName} 快照往返改变了初态 hash：${hash1} → ${roundTripHash}。`);
    }
    console.log(
        `[T16-00] ${mapName} gold=${JSON.stringify(gold)} legal=${legal.length} `
        + `recruit=${recruitCodes.length} hash=${hash1.slice(0, 12)}… 审核表一致 ✓ 快照往返不变 ✓`,
    );
}
writeJson('five_maps.json', {
    schema: 'v16_five_maps_1',
    frozenAt: new Date().toISOString(),
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    auditTableSource: 'v16/review/openings.json',
    auditTableSha256: crypto.createHash('sha256').update(fs.readFileSync(auditPath)).digest('hex'),
    devSeedUsedPerMap: V16_MAPS.map((_, m) => V16_PANELS.dev.baseSeed + 10 * m),
    openings,
});

/* ============================ 5. C2 模型身份 ============================ */
const C2_FINALS: Array<{ seed: number; tag: string; finalPath: string; finalSha256Declared: string }> = [
    {
        seed: 42, tag: 'C2-42',
        finalPath: 'v15/out/v15_20260925_core/T15-06/c2_s42/c2_s42_final.json',
        finalSha256Declared: 'b406c50ba5e6df7a98387673e4a87abc3fc7d1bf68158bd63119c2fb5223c091',
    },
    {
        seed: 1337, tag: 'C2-1337',
        finalPath: 'v15/out/v15_20260925_core/T15-06/c2_s1337/c2_s1337_final.json',
        finalSha256Declared: 'ecb5635532ce74da20ffdf6ac479c41e0b469499be677d096b1587f1cab70700',
    },
    {
        seed: 2026, tag: 'C2-2026',
        finalPath: 'v15/out/v15_20260925_core/T15-06/c2_s2026/c2_s2026_final.json',
        finalSha256Declared: '1c1d413b5f1e188077b0fd063fea933bc4f3d244818255d28fa4c97f43b166b1',
    },
];
const BADSCHEMA_DIRS = [
    'v15/out/v15_20260925_core/T15-06/c2_s42_badschema',
    'v15/out/v15_20260925_core/T15-06/c2_s1337_badschema',
    'v15/out/v15_20260925_core/T15-06/c2_s2026_badschema',
];

const c2Models = C2_FINALS.map((entry) => {
    const abs = path.resolve(entry.finalPath);
    if (!fs.existsSync(abs)) throw new Error(`[T16-00] C2 权重不存在：${abs}`);
    const bytes = fs.readFileSync(abs);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const obj = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const ledgerPath = path.join(path.dirname(abs), path.basename(abs).replace(/_final\.json$/, '_best.optimizer_update_ledger.jsonl'));
    const ledgerExists = fs.existsSync(ledgerPath);
    let updateCount = 0;
    let valueSupervised = 0;
    if (ledgerExists) {
        const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
        updateCount = lines.length;
        for (const line of lines) {
            try {
                const row = JSON.parse(line) as { valueSupervised?: number; valueMaskCount?: number };
                if ((row.valueSupervised ?? row.valueMaskCount ?? 0) > 0) valueSupervised += 1;
            } catch { /* 逐行健壮：坏行由 recompute 脚本单独报告 */ }
        }
    }
    return {
        tag: entry.tag,
        seed: entry.seed,
        path: entry.finalPath,
        sha256: sha,
        sha256MatchesV15FrozenManifest: sha === entry.finalSha256Declared,
        encoderSchemaId: obj.encoderSchemaId ?? null,
        version: obj.version ?? null,
        numBlocks: obj.numBlocks ?? null,
        architectureId: obj.architectureId ?? null,
        globalPolicyPool: obj.globalPolicyPool ?? null,
        spatialChannels: obj.spatialChannels ?? null,
        ledgerPath: ledgerExists ? ledgerPath.replace(/\\/g, '/') : null,
        ledgerUpdates: updateCount,
        ledgerValueSupervisedRows: valueSupervised,
        valueHeadUsableAsTeacherLeaf: valueSupervised > 0,
    };
});

const c2Doc = {
    schema: 'v16_c2_models_1',
    frozenAt: new Date().toISOString(),
    selectionBasis: 'v15/out/v15_20260925_core/T15-06/frozen_c2.json（三个有效 run，final@3000 为主端点）',
    quarantinedBadSchemaDirs: BADSCHEMA_DIRS.filter((d) => fs.existsSync(path.resolve(d))),
    quarantineReason: 'badschema 目录属于隔离失败产物，不纳入有效模型数、不得续训、不得冒充基线。',
    valueHeadWarning:
        '三个 C2 的 ledger valueSupervised 全为 0（V15 审核 §4）。其价值头没有经过真实结果监督，'
        + '禁止直接作为搜索教师的叶评估（任务书 §5.1 第 7 条）。',
    sourceDatasetNote:
        'C2 主要学习旧开局轨迹（初始金币 300）。V15 审核 §2.2 已确认 C2 的 48 个基础 root 全部 gold=300；'
        + '因此 C2 在新规则五图上的成绩是「旧分布模型在新目标分布上的迁移读数」，不能当作新规则基线已训练的证据。',
    models: c2Models,
};
writeJson('c2_models.json', c2Doc);

/* ============================ 6. resolved 对战协议 ============================ */
const arenaProtocol = {
    schema: 'v16_arena_protocol_1',
    frozenAt: new Date().toISOString(),
    protocolDoc: 'v16/V16_EVALUATION_PROTOCOL.md',
    taskbookDoc: 'v16/V16_AGENT_TASKBOOK.md',
    runId: RUN_ID,
    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
    actionFilterId: V16_ACTION_FILTER_ID,
    rngContractId: V16_RNG_CONTRACT_ID,
    capsId: V16_CAPS_ID,
    caps: V16_DEFAULT_CAPS,
    capsHistory: [
        {
            capsId: V16_CAPS_ID_PREFLIGHT,
            caps: V16_CAPS_V1_300S,
            status: 'SUPERSEDED_BY_CAPS_V2',
            evidence: [
                'preflight:m4:s0 的 H0-vs-H0 实体在 300 秒墙钟处 WALL_TIMEOUT（3770 个原子动作仍未自然终局）。',
                'DEV20 的 10 个 H0 镜像全部自然结束，但最长两个为 182.0s / 162.7s。',
                '两批合计 14 个镜像实体中 1 个截断 → 自然完成率 93% < 协议 §3 的 95% 门槛。',
            ],
        },
        {
            capsId: V16_CAPS_ID,
            caps: V16_DEFAULT_CAPS,
            status: 'ACTIVE',
            evidence: [
                '协议 §3 允许在任何正式新基线评测前把所有学生面板统一升到 900 秒并说明依据。',
                '原子动作上限保持 12,000 不变；墙钟只是保险，放宽不改变 300 秒内已自然结束的对局结果。',
                'caps 进缓存身份（maxStepsAtomicActions/maxPlies/wallTimeoutMs），换 caps 会自动换键，旧截断结果不会被复用。',
            ],
        },
    ],
    capsNote:
        'v1（300 秒）的 T16-01 读数保留在 arena/dev_caps300s/ 作为被取代的预演证据；'
        + '正式基线在 v2（900 秒）下重新执行，报告同时列出两套读数。',
    maps: V16_MAPS,
    panels: Object.fromEntries(Object.entries(V16_PANELS).map(([key, value]) => [
        key,
        {
            ...value,
            candidateGames: expectedCandidateGamesV16(key),
            mirrorEntities: expectedMirrorEntitiesV16(key),
            blocks: blocksForPanelV16(key),
        },
    ])),
    seatRule: '每个 seed 跑模型座位 0、1 各一次；只交换策略座位，不改地图拥有者与开局结算顺序。',
    mirrorRule: 'H0 对 H0：每 (地图, seed) 只跑一次实体，再按座位展开视角；只复用计算，不增加独立样本。',
    scoringRule: '胜 = 真实 engine terminal 且 winnerAllianceId == candidateAllianceId；负/平/超时/步数截断都不计胜；验收分母固定 20。',
    sourceDigests: {
        engine: digests.engine.digest,
        policy: digests.policy.digest,
        h0: digests.h0.digest,
        runner: digests.runner.digest,
    },
};
writeJson('arena_protocol.json', arenaProtocol);

/* ============================ manifest ============================ */
const manifestFiles = [
    'git_identity.json', 'environment.json', 'source_manifest.json',
    'five_maps.json', 'c2_models.json', 'arena_protocol.json',
];
const manifest = {
    schema: 'v16_identity_manifest_1',
    runId: RUN_ID,
    frozenAt: new Date().toISOString(),
    identityDir: IDENTITY_DIR.replace(/\\/g, '/'),
    digests: {
        git_identity: gitSha,
        environment: envSha,
        source_manifest: sourceSha,
    },
    files: manifestFiles.map((rel) => {
        const abs = path.join(IDENTITY_DIR, rel);
        const bytes = fs.readFileSync(abs);
        return { path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    }),
    status: 'FROZEN',
    notYetFrozen: [
        '正式基线成绩（T16-01 尚未执行）',
        '教师 S1 身份与资格（T16-03）',
        '训练数据 split 与 SHA（T16-04）',
        'CONFIRM20（协议 §2：选定模型 SHA 前不得运行）',
    ],
};
writeJson('manifest.json', manifest);

console.log(`[T16-00] 身份冻结完成 → ${IDENTITY_DIR}`);
console.log(`[T16-00] engine=${digests.engine.digest.slice(0, 12)}… policy=${digests.policy.digest.slice(0, 12)}… `
    + `h0=${digests.h0.digest.slice(0, 12)}… runner=${digests.runner.digest.slice(0, 12)}…`);
void sh;
