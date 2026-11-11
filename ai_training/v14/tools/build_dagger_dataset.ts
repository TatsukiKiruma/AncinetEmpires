/**
 * V14/T14-08：把 T14-08 的采集产物（教师轨迹 roots/decisions 或学生状态）转成可训练数据集行。
 *
 * 与 T14-02 使用同一候选契约（引擎合法集 → 策略过滤 → 编码），
 * 差异只在状态来源与身份字段：
 * - D1：教师（启发式）访问状态，行为策略 = heuristic，标签来自同一条轨迹；
 * - D2：学生访问状态，行为策略 = 学生检查点，标签由教师在同一状态上重标。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/build_dagger_dataset.ts \
 *     --run-id v14_20260924_t14 --group D1
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/build_dagger_dataset.ts \
 *     --run-id v14_20260924_t14 --group D2
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { getAllianceId, getTurnPlayerIds } from '../../src/game/rule_config';
import {
    ENCODER_SCHEMA_ID,
    encodeCandidateActionSpatial,
    encodeGameStateSpatial,
} from '../../src/game/ai/spatial_tensor_encoder';
import type { GameState } from '../../src/game/types';

const POLICY_ACTION_FILTER_ID = 'v14_policy_filter_no_surrender_1';
const CANDIDATE_SCHEMA_ID = 'v14_candidates_all_policy_allowed_1';
const CANDIDATE_ORDERING_ID = 'v14_engine_order_then_actor_code_1';
const DATASET_SCHEMA_ID = 'v14_spatial_dataset_1';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}
function stableStringify(value: unknown): string {
    const canonical = (v: any): any => {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(v).sort()) out[key] = canonical(v[key]);
            return out;
        }
        return v;
    };
    return JSON.stringify(canonical(value));
}
async function* readJsonl<T>(file: string): AsyncGenerator<T> {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) { if (line.trim()) yield JSON.parse(line) as T; }
}

interface RowIdentity {
    sourceStateKey: string;
    rootFamilyId: string;
    stepIndex: number;
    behaviorPolicyId: string;
    behaviorCheckpointSha256: string | null;
    labelTeacherId: string;
    labelTeacherVersion: string;
    labelProvenance: string;
    stateSnapshotRef: string;
    mapName: string;
    playerCount: number;
    rulesHash: string;
    studentActionCode: string | null;
}

/** 从一个真实状态与标签构造数据集行；候选集完全由引擎合法集 + 策略过滤决定。 */
function buildRow(state: GameState, playerId: number, labelCode: string, identity: RowIdentity): any | null {
    const engine = new GameEngine(state);
    const legal = engine.getLegalActions(playerId);
    const allowed = legal.filter((a) => a.type !== 'surrender');
    const codes = allowed.map(encodeAction);
    const targetIndex = codes.indexOf(labelCode);
    if (targetIndex < 0) return null;
    const spatial = encodeGameStateSpatial(state, playerId, 'v2');
    const candidates = allowed.map((a) => {
        const f = encodeCandidateActionSpatial(state, playerId, a, 'v2');
        return {
            actionCode: encodeAction(a),
            actorCoord: f.actorCoord, landingCoord: f.landingCoord, targetCoord: f.targetCoord,
            semantics: Array.from(f.semantics),
        };
    });
    return {
        schemaVersion: DATASET_SCHEMA_ID,
        sampleId: `v14dagger_${sha256(identity.sourceStateKey + '|' + labelCode).slice(0, 24)}`,
        sourceStateKey: identity.sourceStateKey,
        sourceArchiveId: `v14_dagger:${identity.behaviorPolicyId}`,
        sourceRowIndex: identity.stepIndex,
        sourceStep: identity.stepIndex,
        baseRootId: identity.rootFamilyId,
        rootFamilyId: identity.rootFamilyId,
        parentRootId: identity.rootFamilyId,
        lineageId: identity.rootFamilyId,
        partition: 'train',
        mapName: identity.mapName,
        mapHash: null,
        rulesHash: identity.rulesHash,
        playerCount: identity.playerCount,
        subjectPlayer: playerId,
        subjectAllianceId: getAllianceId(state, playerId),
        currentPlayer: state.currentPlayer,
        turnPlayerIds: getTurnPlayerIds(state),
        rawActionStep: identity.stepIndex,
        behaviorPolicyId: identity.behaviorPolicyId,
        behaviorCheckpointSha256: identity.behaviorCheckpointSha256,
        labelTeacherId: identity.labelTeacherId,
        labelTeacherVersion: identity.labelTeacherVersion,
        teacherRngKey: null,
        teacherBudget: { kind: 'none', detail: '启发式教师为确定性策略，无搜索预算' },
        teacherStopReason: null,
        labelProvenance: identity.labelProvenance,
        stateSnapshotRef: identity.stateSnapshotRef,
        stateHash: sha256(stableStringify(state)),
        stateFidelity: 'EXACT_SNAPSHOT',
        replayVerification: { source: identity.behaviorPolicyId, step: identity.stepIndex },
        encoderSchemaId: ENCODER_SCHEMA_ID,
        candidateSchemaId: CANDIDATE_SCHEMA_ID,
        candidateOrderingId: CANDIDATE_ORDERING_ID,
        policyActionFilterId: POLICY_ACTION_FILTER_ID,
        engineLegalActionCodes: legal.map(encodeAction),
        policyAllowedActionCodes: codes,
        filteredActionCodes: legal.filter((a) => a.type === 'surrender').map(encodeAction),
        candidateActionCodes: codes,
        candidateActions: candidates,
        spatialTensor: Array.from(spatial.spatialTensor),
        globalFeatures: Array.from(spatial.globalFeatures),
        candidateCountStored: codes.length,
        candidateCountEngineLegal: legal.length,
        candidateCountPolicyAllowed: allowed.length,
        missingActionCodes: [],
        targetActionCode: labelCode,
        targetActionIndex: targetIndex,
        acceptableActionCodes: [],
        policyLossMask: true,
        valueLossMask: false,
        valueTarget: null,
        outcomeKind: 'DAGGER_TRAIN_ROW',
        episodeFinalWinnerAllianceId: null,
        studentActionCode: identity.studentActionCode,
        behaviorAgreement: identity.studentActionCode
            ? identity.studentActionCode === labelCode : null,
    };
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const group = (arg('--group', 'D2') as string).toUpperCase();
    const t08 = path.resolve('v14', 'out', runId, 'T14-08');
    const outPath = path.join(t08, `dagger_${group}.jsonl`);
    const out = fs.createWriteStream(outPath, { flags: 'w' });

    let written = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    const seen = new Set<string>();
    const targetTypes: Record<string, number> = {};
    const agreement = { same: 0, different: 0, unknown: 0 };
    const roots = new Set<string>();
    const inputs: string[] = [];

    const emit = (row: any, studentCode: string | null) => {
        if (seen.has(row.sourceStateKey)) { skipped += 1; skipReasons.DUPLICATE_STATE = (skipReasons.DUPLICATE_STATE ?? 0) + 1; return; }
        seen.add(row.sourceStateKey);
        roots.add(row.rootFamilyId);
        out.write(`${JSON.stringify(row)}\n`);
        written += 1;
        const t = row.targetActionCode.split(':')[0];
        targetTypes[t] = (targetTypes[t] ?? 0) + 1;
        if (studentCode === null) agreement.unknown += 1;
        else if (studentCode === row.targetActionCode) agreement.same += 1;
        else agreement.different += 1;
    };

    if (group === 'D2') {
        for (const dir of ['student_states_s0', 'student_states_s1']) {
            const p = path.join(t08, dir, 'student_states.jsonl');
            if (!fs.existsSync(p)) continue;
            inputs.push(p.replace(/\\/g, '/'));
            for await (const row of readJsonl<any>(p)) {
                const built = buildRow(row.state as GameState, row.currentPlayer as number, row.labelActionCode as string, {
                    sourceStateKey: row.sourceStateKey,
                    rootFamilyId: row.rootFamilyId,
                    stepIndex: row.stepIndex,
                    behaviorPolicyId: row.behaviorPolicyId,
                    behaviorCheckpointSha256: row.behaviorCheckpointSha256 ?? null,
                    labelTeacherId: row.labelTeacherId,
                    labelTeacherVersion: row.labelTeacherVersion,
                    labelProvenance: 'student_state_relabeled_by_teacher',
                    stateSnapshotRef: p.replace(/\\/g, '/'),
                    mapName: row.mapName,
                    playerCount: row.playerCount,
                    rulesHash: row.rulesHash,
                    studentActionCode: row.studentActionCode ?? null,
                });
                if (!built) { skipped += 1; skipReasons.LABEL_NOT_IN_POLICY_ALLOWED = (skipReasons.LABEL_NOT_IN_POLICY_ALLOWED ?? 0) + 1; continue; }
                emit(built, row.studentActionCode ?? null);
            }
        }
    } else {
        // D1：教师轨迹。状态从 roots.jsonl 的初始快照按 actionPrefix 重放得到，
        // 标签是采集时该步真实执行的动作（同一条轨迹）。
        const rawDir = path.join(t08, 'teacher_states', 'raw');
        const rootsFile = path.join(rawDir, 'roots.jsonl');
        const decisionsFile = path.join(rawDir, 'decisions.jsonl');
        if (!fs.existsSync(rootsFile)) throw new Error(`缺少 ${rootsFile}`);
        inputs.push(rootsFile.replace(/\\/g, '/'));
        const decisionByRoot = new Map<string, Map<number, any>>();
        if (fs.existsSync(decisionsFile)) {
            for await (const d of readJsonl<any>(decisionsFile)) {
                const bucket = decisionByRoot.get(d.rootFamilyId) ?? new Map<number, any>();
                bucket.set(d.stepIndex, d);
                decisionByRoot.set(d.rootFamilyId, bucket);
            }
        }
        for await (const root of readJsonl<any>(rootsFile)) {
            const engine = new GameEngine(root.initialState);
            const bucket = decisionByRoot.get(root.rootFamilyId) ?? new Map<number, any>();
            for (let step = 0; step < root.actionPrefix.length; step += 1) {
                const state = engine.getState();
                const decision = bucket.get(step);
                if (decision) {
                    const built = buildRow(state, state.currentPlayer, decision.labelActionCode, {
                        sourceStateKey: `${root.rootFamilyId}#${step}`,
                        rootFamilyId: root.rootFamilyId,
                        stepIndex: step,
                        behaviorPolicyId: root.behaviorPolicyId,
                        behaviorCheckpointSha256: null,
                        labelTeacherId: root.labelTeacherId,
                        labelTeacherVersion: root.labelTeacherVersion,
                        labelProvenance: 'native_heuristic_trajectory',
                        stateSnapshotRef: rootsFile.replace(/\\/g, '/'),
                        mapName: root.mapName,
                        playerCount: root.playerCount,
                        rulesHash: root.rulesHash,
                        studentActionCode: null,
                    });
                    if (!built) { skipped += 1; skipReasons.LABEL_NOT_IN_POLICY_ALLOWED = (skipReasons.LABEL_NOT_IN_POLICY_ALLOWED ?? 0) + 1; }
                    else emit(built, null);
                }
                const action = decodeAction(root.actionPrefix[step]);
                if (!action) { skipped += 1; skipReasons.ACTION_DECODE_FAILED = (skipReasons.ACTION_DECODE_FAILED ?? 0) + 1; break; }
                engine.step(action);
            }
        }
    }
    await new Promise<void>((resolve) => out.end(resolve));

    const report = {
        schema: 'v14_dagger_dataset_1',
        task: 'T14-08',
        runId,
        group,
        generatedAt: new Date().toISOString(),
        inputs,
        output: outPath.replace(/\\/g, '/'),
        outputSha256: sha256(fs.readFileSync(outPath, 'utf8')),
        written,
        skipped,
        skipReasons,
        targetTypes,
        behaviorAgreement: agreement,
        distinctRoots: roots.size,
    };
    fs.writeFileSync(path.join(t08, `dagger_${group}_report.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[T14-08] ${group}: written=${written} skipped=${skipped} roots=${roots.size} agreement=${JSON.stringify(agreement)}`);
    console.log(`[T14-08] -> ${outPath}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
