/**
 * V15/T15-09A：冻结竞技场清单（owner A）——`arena_manifest.json`。
 *
 * 把 T15-00 冻结的数值**原样取用**并展开成可执行计划：caps、roots、座位配对、
 * 248 场对局 ID 模板、缓存键字段表、恢复规则、统计设置、T15-09B/C 的调用接口。
 * 本工具不跑对局、不发明数值；任何与 protocol.json 不一致的地方直接抛错（在
 * `loadFrozenEvalConfigV15` 里已做自洽性检查）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_manifest_v15.ts \
 *     --out v15/out/<runId>/T15-09/arena_manifest.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
    PAIR_IDENTITY_MAY_DIFFER_V15,
    PAIR_IDENTITY_MUST_MATCH_V15,
    loadFrozenEvalConfigV15,
    modelSlotsV15,
    plannedGamesV15,
} from './eval_v15_core';
import {
    CACHE_IDENTITY_VERSION_V15,
    ACTION_FILTER_ID_V15,
    RNG_CONTRACT_ID_V15,
} from '../../v14/tools/eval_v14_protocol';
import {
    ENGINE_SOURCE_FILES_V15,
    POLICY_SOURCE_FILES_V15,
    SOURCE_DIGEST_FORMAT_V15,
    sourceDigestsV15,
} from './eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ROOT = path.resolve(arg('--run-root', 'v15/out/v15_20260925_core') as string);
const OUT_PATH = path.resolve(arg('--out', path.join(RUN_ROOT, 'T15-09', 'arena_manifest.json')) as string);
if (fs.existsSync(OUT_PATH)) throw new Error(`[T15-09A] 已存在同名产物，拒绝覆盖：${OUT_PATH}`);

const cfg = loadFrozenEvalConfigV15(RUN_ROOT);
const slots = modelSlotsV15(cfg);
const planned = plannedGamesV15(cfg, slots);
const digests = sourceDigestsV15(process.cwd());

function sha256File(abs: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}
const t00 = path.join(RUN_ROOT, 'T15-00');
const frozenRefs = [
    { path: 'T15-00/protocol.json', sha256: sha256File(path.join(t00, 'protocol.json')) },
    { path: 'T15-00/root_manifests/dev_panel_roots.json', sha256: sha256File(path.join(t00, 'root_manifests', 'dev_panel_roots.json')) },
    { path: 'T15-00/root_manifests/cost_preflight_roots.json', sha256: sha256File(path.join(t00, 'root_manifests', 'cost_preflight_roots.json')) },
    { path: 'T15-00/root_manifests/student_confirmation_roots.json', sha256: sha256File(path.join(t00, 'root_manifests', 'student_confirmation_roots.json')) },
];

/** 对局 ID 计划：逐 block 逐模型展开（模板里 sha12 在运行时用真实权重字节摘要替换）。 */
const gameIdPlan = cfg.devPanel.map((block) => ({
    blockId: block.blockId,
    mapName: block.mapName,
    playerCount: block.playerCount,
    rootSeed: block.rootSeed,
    episodeIndex: block.episodeIndex,
    rootFamilyId: block.rootFamilyId,
    candidateSeats: block.candidateSeats,
    seatAlliances: block.seatAlliances,
    candidateGameIds: slots.flatMap((slot) => block.candidateSeats.map((seat) =>
        `${cfg.runId}|dev|${block.blockId}|${slot.policyId}:${slot.tag}:{sha12}|CANDIDATE|seat=${seat}|view=${seat}`)),
    mirrorGameId: `${cfg.runId}|dev|${block.blockId}|heuristic:mirror:v1|MIRROR|seat=null|view=null`,
    mirrorSeatViewGameIds: block.candidateSeats.map((seat) =>
        `${cfg.runId}|dev|${block.blockId}|heuristic:mirror:v1|MIRROR|seat=null|view=${seat}`),
    mirrorReuseNote: '镜像实体只跑一次；viewedSeat 行共享同一份计算，只复用计算、不增加独立样本量',
}));

const payload = {
    schema: 'v15_arena_manifest_1',
    task: 'T15-09A',
    owner: 'A',
    runId: cfg.runId,
    generatedAt: new Date().toISOString(),
    purpose: '冻结开发面板对局 ID、缓存键字段、恢复规则、caps、roots 与统计设置；GE 通过后才可执行 T15-09B',
    frozenRefs,
    frozenValuesSource: '全部数值直接取自 T15-00 冻结产物，本清单不重写任何数值',
    caps: {
        maxStepsAtomicActions: cfg.caps.maxStepsAtomicActions,
        wallTimeoutMs: cfg.caps.wallTimeoutMs,
        maxPlies: cfg.caps.maxPlies,
        note: '协议 §5.1 冻结值；成本预检的实测墙钟见 calibration.json，caps 修订只能由协议 owner 统一冻结',
    },
    roots: {
        devPanel: cfg.devPanel,
        devPanelBlockCount: cfg.devPanel.length,
        seatPairingsPerModel: cfg.panel.candidateSeatsPerModel,
        panelWeightsByMap: cfg.panel.panelWeightsByMap,
        seatPairingNote: '8 个独立 root block；同 block 的座位视角不是新增 root，12 个模型对同一 root 也不构成新增 root',
    },
    modelSlots: slots.map((s) => ({
        ...s,
        modelIdTemplate: `${s.policyId}:${s.tag}:{sha12}`,
        identityRule: 'modelId 的 sha12 必须是**实际权重文件字节** SHA-256 的前 12 位；文件名与训练 seed 不能替代',
        sourceSha256Now: fs.existsSync(s.checkpointPathTemplate.replace('{runRoot}', RUN_ROOT))
            ? sha256File(s.checkpointPathTemplate.replace('{runRoot}', RUN_ROOT))
            : null,
    })),
    gameIds: {
        format: cfg.gameIds.format,
        modelIdFormat: cfg.gameIds.modelIdFormat,
        uniquenessRule: cfg.gameIds.uniquenessRule,
        listingRule: cfg.gameIds.listingRule,
        plannedCandidateArms: planned.filter((g) => g.arm === 'CANDIDATE').length,
        plannedMirrorEntities: planned.filter((g) => g.arm === 'MIRROR').length,
        plannedTotal: planned.length,
        byMap: cfg.panel.maps.map((map) => ({
            map,
            candidates: planned.filter((g) => g.arm === 'CANDIDATE' && g.mapName === map).length,
            mirrors: planned.filter((g) => g.arm === 'MIRROR' && g.mapName === map).length,
        })),
        plan: gameIdPlan,
    },
    cacheIdentity: {
        version: CACHE_IDENTITY_VERSION_V15,
        fields: cfg.cacheKeyFields,
        keyFormat: 'v15-cache-identity-v1:<字段名>=<值> 以 & 连接，字段名按字典序排序',
        mustMatchAcrossArmsOfSameRoot: PAIR_IDENTITY_MUST_MATCH_V15,
        mayDiffer: PAIR_IDENTITY_MAY_DIFFER_V15,
        rngContract: RNG_CONTRACT_ID_V15,
        actionFilter: ACTION_FILTER_ID_V15,
        sourceDigests: {
            format: SOURCE_DIGEST_FORMAT_V15,
            engineFiles: ENGINE_SOURCE_FILES_V15,
            policyFiles: POLICY_SOURCE_FILES_V15,
            engineSourceDigest: digests.engine.digest,
            policySourceDigest: digests.policy.digest,
            note: '源码摘要按运行时实际文件字节计算；并发修改源码会换键，旧结果自动失效',
        },
        mirrorReuseRule: '同一 root 的镜像只跑一次；按座位展开的行共享 cacheIdentity.key（实体键），gameId 的 view= 字段区分行',
        verifiedBy: 'v15/tools/eval_v15_selftest.ts 的 F8（缓存身份变化）与 v14/tools/eval_v14.test.ts 的身份键单测',
    },
    resume: {
        rule: [
            '每行写完整 gameId 与 cacheIdentity；输出文件本身即进度文件（另有 *.progress.json 摘要）。',
            '恢复时只跳过「gameId 相同且 mustMatchAcrossArmsOfSameRoot 字段全部一致」的行。',
            'POLICY_ERROR / ENGINE_ERROR 行默认不视为完成（--retry-errors true），并额外记入 *.errors.jsonl；重跑不产生重复计数。',
            '身份不一致时不复用该结果：严格配对报 IDENTITY_MISMATCH，必须换文件/换实验 ID 重跑。',
            '同一 gameId 重复出现即报错（strictBuildPairsV15 的 DUPLICATE_GAME_ID），不允许用 Map 覆盖后少算对局。',
            '缺臂（只跑完候选或只跑完镜像）如实报 MISSING_ARM，不伪造配对。',
            '输出文件已存在且 --resume=false 时拒绝覆盖。',
        ],
        incrementalJsonl: `${RUN_ROOT}/T15-09/matches/<panel>_<modelKey>.games.jsonl`.replace(/\\/g, '/'),
        errorJsonl: `${RUN_ROOT}/T15-09/matches/<panel>_<modelKey>.errors.jsonl`.replace(/\\/g, '/'),
        progressJson: `${RUN_ROOT}/T15-09/matches/<panel>_<modelKey>.progress.json`.replace(/\\/g, '/'),
        aggregationEntry: `${RUN_ROOT}/T15-09/`.replace(/\\/g, '/') + '（严格配对 + V15 加权聚合，见 eval_v15_core.ts）',
    },
    statistics: {
        ...cfg.statistics,
        panelWeightsByMap: cfg.panel.panelWeightsByMap,
        intervalRule: '自然 [score,score]；截断 [0,1]；配对差值 [C.low−H.high, C.high−H.low]；错误走错误 gate',
        bootstrap: {
            iterations: cfg.statistics.bootstrapIterations,
            seed: cfg.statistics.bootstrapSeed,
            unit: cfg.statistics.bootstrapUnit,
            stratifiedBy: cfg.statistics.bootstrapStratifiedBy,
            implementation: 'v15/tools/eval_v15_core.ts#stratifiedBootstrapV15（地图内整块重采样 root）',
        },
        smallSampleWarning: '开发每图仅 4 个 block，区间只用于筛选与描述；退化到一个点不代表没有总体不确定性',
    },
    executionInterface: {
        oneArm: 'node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_run_v15.ts --block <blockId> --seat <n> --model <checkpoint.json> --model-key <c2:42> --arms candidate',
        mirrorOnly: 'node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_run_v15.ts --block <blockId> --arms mirror',
        dryRun: 'node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/arena_run_v15.ts --block <blockId> --seat <n> --arms candidate --dry-run',
        blockSweep: '对每个 blockId × 每个 modelKey 重复 oneArm；同一模型所有 block 写进同一 JSONL，即为该模型的增量记录',
        selfTest: 'node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_selftest.ts',
        historicalRecompute: 'node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/eval_v15_historical.ts',
        legacyRunnerStillAvailable: 'v14/tools/eval_v14_match.ts（新开关 --emit-identity/--mirror-view-recompute/--refuse-overwrite，默认关闭=历史行为）',
    },
    openBlockers: [] as Array<Record<string, unknown>>,
};

// 中文：如实列出执行前还缺什么，不把 BLOCKED 包装成 READY。
const missingModels = payload.modelSlots
    .filter((s) => s.sourceSha256Now === null)
    .map((s) => ({ modelKey: s.modelKey, expectedPath: s.checkpointPathTemplate.replace('{runRoot}', RUN_ROOT).replace(/\\/g, '/') }));
if (missingModels.length > 0) {
    payload.openBlockers.push({
        kind: 'MODEL_CHECKPOINTS_MISSING',
        count: missingModels.length,
        detail: 'T15-09B 只能跑已存在且身份可解析的权重；下列槽位在清单生成时不存在（不伪造结果）',
        models: missingModels,
    });
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
    `[T15-09A] 计划 ${payload.gameIds.plannedCandidateArms} 候选臂 + ${payload.gameIds.plannedMirrorEntities} 镜像实体 `
    + `= ${payload.gameIds.plannedTotal} 场；缺失权重槽位 ${missingModels.length}`,
);
console.log(`[T15-09A] -> ${OUT_PATH}`);
