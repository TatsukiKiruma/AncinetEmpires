/**
 * V15/T15-05 补充回归：把 **V14 stageB 的同一批 128 个状态**用 V15 语义重编码 + L1 重标，
 * 生成与 V14 参考集**同任务构成**的诊断集（owner C 补齐 owner F 未完成的可比性对照）。
 *
 * 为什么必须单独做这一件事：
 *   T15-05 已有的 128 状态回归（117/128、CE 0.1714）用的是**从 T15-04 数据按 root 均匀轮转抽取**
 *   的自然分布任务（6 种目标动作类型、batch=32）；而 V14 stageB 用的是**按动作类型配平的 128 个状态**
 *   （11 种类型各约 12 个、batch=16、constant LR、weight decay=0）。两者不是同一任务，
 *   因此那次读数既不能证明「新链路可拟合性退步」，也不能证明「没有退步」。
 *
 * 本工具产出的数据集与 V14 参考集**逐行同源**：
 *   - 128 个 `stateHash` 直接取自 `v14/.../T14-04/tiny_fit_input.jsonl`；
 *   - 状态对象从 `v14/.../T14-02/raw/decisions.jsonl` 按 `stateHash` 反查（实测 128/128 命中）；
 *   - 候选集 = 该状态的真实引擎合法集 → 过滤 surrender（实测与 V14 归档的
 *     `candidateActionCodes` 逐元素相同，见 `--report` 的 `candidateSetMatchesV14`）；
 *   - 张量与候选语义用 **V15 语义**（`v15_current`）重新编码；
 *   - 标签用 **L1 独立标签器**（`replicateId=0`）重新生成，并同时记录 V14 归档标签以便对比。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/tiny_fit_comparable_v15.ts \
 *     --run-id v15_20260925_core
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId } from '../../src/game/rule_config';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
} from '../../src/game/ai/spatial_tensor_encoder';
import { queryL1Label, stateHashOf, L1_LABELER_VERSION } from './labeler_l1_v15';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
const RUN_ID = arg('--run-id') ?? process.env.V15_RUN_ID ?? null;
if (!RUN_ID) { console.error('usage: ... v15/tools/tiny_fit_comparable_v15.ts --run-id <runId>'); process.exit(2); }
const LABEL_SEED_BASE = Number(arg('--label-seed-base') ?? '20260925');

const REPO = process.cwd();
const V14_INPUT = 'v14/out/v14_20260925_t14b/T14-04/tiny_fit_input.jsonl';
const V14_ARCHIVE = 'v14/out/v14_20260924_t14/T14-02/raw/decisions.jsonl';
const OUT_DIR = path.resolve(REPO, 'v15', 'out', RUN_ID, 'T15-05', 'comparable');
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha256File = (abs: string): string => createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

function readJsonl<T>(rel: string): T[] {
    const abs = path.resolve(REPO, rel);
    if (!fs.existsSync(abs)) throw new Error(`缺少输入：${abs}`);
    return fs.readFileSync(abs, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
}

interface V14Row {
    stateHash: string;
    candidateActionCodes: string[];
    engineLegalActionCodes: string[];
    policyAllowedActionCodes: string[];
    targetActionCode: string;
    targetActionIndex: number;
    rootFamilyId: string;
    mapName: string;
    playerCount: number;
    rawActionStep: number;
    subjectPlayer: number;
    subjectAllianceId: number;
    rootAllianceId: number;
    turnPlayerIds: number[];
    acceptableActionCodes?: string[];
    spatialTensor: number[];
    globalFeatures: number[];
    encoderSchemaId: string;
    candidateCountEngineLegal: number;
}

interface ArchiveRow {
    rootFamilyId: string;
    stepIndex: number;
    turn: number;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCodes: string[];
    policyAllowedActionCodes: string[];
    labelActionCode: string;
    stateHash: string;
    state: GameState;
}

const v14Rows = readJsonl<V14Row>(V14_INPUT);
const archive = readJsonl<ArchiveRow>(V14_ARCHIVE);
const byHash = new Map<string, ArchiveRow>();
for (const a of archive) if (!byHash.has(a.stateHash)) byHash.set(a.stateHash, a);

const builtRows: unknown[] = [];
const missingStates: string[] = [];
const candidateSetMismatches: unknown[] = [];
const labelComparison: unknown[] = [];

for (const row of v14Rows) {
    const arch = byHash.get(row.stateHash);
    if (!arch) { missingStates.push(row.stateHash); continue; }
    const state = arch.state;
    const actingPlayerId = state.currentPlayer;
    if (stateHashOf(state) !== row.stateHash) {
        throw new Error(`状态摘要不匹配：${row.stateHash}`);
    }

    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    const engineLegalActionCodes = engine.isTerminal()
        ? [] : engine.getLegalActions(actingPlayerId).map(encodeAction);
    const policyAllowedActionCodes = engineLegalActionCodes.filter((c) => !c.startsWith('surrender'));

    // 候选集与 V14 归档逐元素比对（顺序也要一致，便于确认「同一任务」）。
    const sameAsV14 = JSON.stringify(policyAllowedActionCodes) === JSON.stringify(row.candidateActionCodes);
    if (!sameAsV14) {
        candidateSetMismatches.push({
            stateHash: row.stateHash,
            v14CandidateCount: row.candidateActionCodes.length,
            rederivedCount: policyAllowedActionCodes.length,
            firstDiffIndex: (() => {
                const n = Math.min(policyAllowedActionCodes.length, row.candidateActionCodes.length);
                for (let i = 0; i < n; i += 1) {
                    if (policyAllowedActionCodes[i] !== row.candidateActionCodes[i]) return i;
                }
                return n;
            })(),
        });
    }

    // V15 语义重编码。
    const encoded = encodeGameStateSpatial(state, actingPlayerId, 'v2', { channels: 26 });
    const allowedActions = engine.isTerminal()
        ? [] : engine.getLegalActions(actingPlayerId).filter((a) => a.type !== 'surrender');
    const candidates = allowedActions.map((a) => {
        const f = encodeCandidateActionSpatial(state, actingPlayerId, a, 'v2', 'v15_current');
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord,
            landingCoord: f.landingCoord,
            targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });
    const candidateActionCodes = candidates.map((c) => c.actionCode);

    // L1 重标（独立实例 + 逐状态 RNG）。
    const label = queryL1Label(state, {
        labelSeedBase: LABEL_SEED_BASE,
        actingPlayerId,
        subjectPlayerId: actingPlayerId,
        replicateId: 0,
    });
    const targetActionCode = label.actionCode;
    const targetActionIndex = targetActionCode === null ? -1 : candidateActionCodes.indexOf(targetActionCode);

    labelComparison.push({
        stateHash: row.stateHash,
        v14ArchivedLabel: row.targetActionCode,
        v14ArchiveLabelFromRaw: arch.labelActionCode,
        l1Label: targetActionCode,
        sameAsV14Stored: targetActionCode === row.targetActionCode,
        sameAsArchive: targetActionCode === arch.labelActionCode,
    });

    builtRows.push({
        schemaVersion: 'v15_tiny_fit_comparable_1',
        sampleId: `v15cmp_${createHash('sha256').update(row.stateHash).digest('hex').slice(0, 20)}`,
        datasetBuilderId: 'v15/tools/tiny_fit_comparable_v15.ts@v1',
        runId: RUN_ID,
        rootFamilyId: row.rootFamilyId,
        parentRootId: row.rootFamilyId,
        lineageId: row.rootFamilyId,
        sourceStateKey: `${row.rootFamilyId}#${arch.stepIndex}`,
        sourceArchiveId: 'v14_collect:raw/decisions.jsonl + T14-04/tiny_fit_input.jsonl',
        sourceSha256: sha256File(path.resolve(REPO, V14_INPUT)),
        sourceRowIndex: builtRows.length,
        rawActionStep: arch.stepIndex,
        scenarioId: null,
        mapName: row.mapName,
        mapHash: null,
        rulesHash: null,
        playerCount: row.playerCount,
        partition: 'train',
        partitionSource: 'V14 stageB tiny-fit 参考集（128 个按动作类型配平的状态）',
        subjectPlayerId: actingPlayerId,
        subjectAllianceId: getAllianceId(state, actingPlayerId),
        rootAllianceId: getAllianceId(state, actingPlayerId),
        actingPlayerId,
        turnPlayerIds: arch.turnPlayerIds,
        stateHash: row.stateHash,
        archivedStateHash: row.stateHash,
        stateFidelity: 'VERIFIED_REPLAY',
        behaviorPolicyBySeat: 'heuristic(H0)',
        labelTeacherId: 'L1',
        labelerVersion: L1_LABELER_VERSION,
        teacherRngKey: `l1:${label.keyHash}`,
        replicateId: 0,
        encoderSchemaId: ENCODER_SCHEMA_ID_V15,
        v14ReferenceEncoderSchemaId: row.encoderSchemaId,
        candidateSchemaId: 'v15_candidates_all_policy_allowed_1',
        orderingId: 'v15_engine_order_then_actor_code_1',
        policyActionFilterId: 'v15_policy_filter_no_surrender_1',
        engineLegalActionCodes,
        policyAllowedActionCodes,
        candidateActionCodes,
        candidateActions: candidates,
        spatialTensor: Array.from(encoded.spatialTensor),
        globalFeatures: Array.from(encoded.globalFeatures),
        missingActionCodes: engineLegalActionCodes.filter((c) => !policyAllowedActionCodes.includes(c)),
        targetActionCode,
        targetActionIndex,
        labelEvidenceKind: 'L1_SINGLE_ACTION',
        acceptableActionCodes: [],
        policyLossMask: targetActionIndex >= 0,
        valueLossMask: false,
        valueTarget: null,
        outcomeKind: 'DIAGNOSTIC_MEMORIZATION',
        candidateSetMatchesV14: sameAsV14,
    });
}

const datasetPath = path.join(OUT_DIR, 'tiny_fit_comparable_v15.jsonl');
if (fs.existsSync(datasetPath)) throw new Error(`拒绝覆盖已存在的产物：${datasetPath}`);
fs.writeFileSync(datasetPath, `${builtRows.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');

// train-only split manifest：与 V14 一致，128 行全部进 train。
const manifestPath = path.join(OUT_DIR, 'tiny_fit_comparable_v15_manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify({
    schema: 'v15_split_manifest_tiny_comparable_1',
    note: 'train-only 诊断：128 个状态全部进入优化，不设验证集（与 V14 stageB 同一口径）。',
    rule: '诊断专用；正式训练不使用本 manifest。',
    trainRootFamilies: [...new Set(builtRows.map((r) => (r as { rootFamilyId: string }).rootFamilyId))],
    valRootFamilies: [],
    testRootFamilies: [],
    sampleCounts: { train: builtRows.length, val: 0, test: 0 },
}, null, 1)}\n`, 'utf8');

const sameLabelCount = labelComparison.filter((c) => (c as { sameAsV14Stored: boolean }).sameAsV14Stored).length;
const report = {
    schema: 'v15_tiny_fit_comparable_report_1',
    task: 'T15-05（owner C 补齐的可比性对照）',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    purpose: '把 V14 stageB 的同一批 128 个状态用 V15 语义重编码 + L1 重标，'
        + '得到与 V14 参考集同任务构成、同超参下可直接比较的可拟合性读数。',
    inputs: {
        v14TinyFitInput: { path: V14_INPUT, sha256: sha256File(path.resolve(REPO, V14_INPUT)), rows: v14Rows.length },
        v14StateArchive: { path: V14_ARCHIVE, sha256: sha256File(path.resolve(REPO, V14_ARCHIVE)), rows: archive.length },
    },
    outputs: {
        dataset: { path: path.relative(REPO, datasetPath).split(path.sep).join('/'), sha256: sha256File(datasetPath), rows: builtRows.length },
        manifest: { path: path.relative(REPO, manifestPath).split(path.sep).join('/'), sha256: sha256File(manifestPath) },
    },
    stateResolution: {
        requested: v14Rows.length,
        resolvedFromArchive: builtRows.length,
        missing: missingStates.length,
        missingExamples: missingStates.slice(0, 5),
    },
    candidateSetMatchesV14: {
        rowsCompared: v14Rows.length,
        identical: v14Rows.length - candidateSetMismatches.length - missingStates.length,
        mismatched: candidateSetMismatches.length,
        mismatches: candidateSetMismatches.slice(0, 10),
        note: '逐元素（含顺序）比对；相同才说明「重导出的候选集就是 V14 当年那个任务」。',
    },
    labels: {
        rows: labelComparison.length,
        l1MatchesV14StoredTarget: sameLabelCount,
        l1DiffersFromV14StoredTarget: labelComparison.length - sameLabelCount,
        note: '标签来源不同是本轮刻意改变的一项（V14 用有状态启发式，V15 用 L1）；'
            + '差异只说明标签版本不同，不构成对任何一侧的否定。',
        perRow: labelComparison,
    },
    trainingHyperparametersToUse: {
        source: 'v14/out/v14_20260925_t14b/T14-04/tiny_fit_acceptance.json 的 config + stageB run.train.command',
        batch: 16,
        lr: 0.001,
        lrSchedule: 'constant',
        weightDecay: 0.0,
        updates: 16000,
        valueWeight: 0,
        numBlocks: 2,
        modelSeed: 42,
        splitSeed: 42,
        dataOrderSeed: 314159,
        note: '与 V14 stageB 完全一致；必须显式带 --encoder-schema-id spatial26_global20_actionSemantics53_v15。',
    },
    notDone: [
        '本工具只生成数据集与读数报告；训练由 train_spatial_resnet.py --train-only 执行。',
        '不宣称任何一侧更强：B5 的一次 AdamW 更新 fp32 判据仍未通过（见 gate_GP.json）。',
    ],
};
const reportPath = path.join(OUT_DIR, 'comparable_dataset_report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`[T15-05cmp] v14Rows=${v14Rows.length} built=${builtRows.length} missingStates=${missingStates.length}`);
console.log(`[T15-05cmp] candidateSet identical=${report.candidateSetMatchesV14.identical}/${v14Rows.length} mismatched=${candidateSetMismatches.length}`);
console.log(`[T15-05cmp] L1 label == V14 stored target: ${sameLabelCount}/${labelComparison.length}`);
console.log(`[T15-05cmp] dataset sha256=${report.outputs.dataset.sha256}`);
console.log(`[T15-05cmp] wrote ${path.relative(REPO, datasetPath)}`);
if (missingStates.length > 0 || candidateSetMismatches.length > 0) process.exitCode = 1;
