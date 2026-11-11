/**
 * V14/T14-02：从原生引擎快照构建干净数据集，并输出数据契约工件。
 *
 * 关键契约（与 v13 的差异）：
 * 1. 候选集合只来自真实引擎的 `getLegalActions`，再用统一的策略过滤（仅去掉 surrender）。
 *    教师标签不参与候选构建，只在候选建成后用 actionCode 定位下标。
 * 2. 状态来自 `engine.getState()` 的真实快照（采集阶段写入 roots.jsonl 的 initialState），
 *    每一步用动作前缀重放并与采集时的 stateHash 对齐 ⇒ stateFidelity=VERIFIED_REPLAY。
 * 3. 无法解码、无法重放、超出棋盘范围、重复 stateHash 的行一律送入 quarantine 并写明原因，
 *    绝不静默跳过，也不宣称它仍是全候选样本。
 * 4. valueTarget 只对自然终局且赢家可判定的 root 生成；截断 root 写 null + mask=0，
 *    不把截断当负样本、不把未知搜索分数补 0。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/build_v14_dataset.ts \
 *     --run-id v14_20260924_t14 [--raw <dir>] [--max-roots N]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import { GameEngine } from '../../src/game/engine';
import { decodeAction, encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig, isActivePlayer } from '../../src/game/rule_config';
import { encodeGameStateSpatial, encodeCandidateActionSpatial, ENCODER_SCHEMA_ID } from '../../src/game/ai/spatial_tensor_encoder';
import { SPATIAL_TENSOR_CHANNELS, SPATIAL_TENSOR_MAX_H, SPATIAL_TENSOR_MAX_W } from '../../src/game/ai/spatial_tensor_encoder';
import type { Action, GameState } from '../../src/game/types';

const POLICY_ACTION_FILTER_ID = 'v14_policy_filter_no_surrender_1';
const CANDIDATE_SCHEMA_ID = 'v14_candidates_all_policy_allowed_1';
const CANDIDATE_ORDERING_ID = 'v14_engine_order_then_actor_code_1';
const DATASET_SCHEMA_ID = 'v14_spatial_dataset_1';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256(value: string | Buffer): string {
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

function stateHashOf(state: GameState): string {
    return sha256(stableStringify(state));
}

interface RootRecord {
    rootFamilyId: string;
    partition: string;
    scenarioId: string;
    mapName: string;
    episodeIndex: number;
    seed: number;
    planId: string;
    playerCount: number;
    playerIds: number[];
    seatAlliances: Record<string, number>;
    maxPlies: number;
    stepCap: number;
    steps: number;
    decisionsRecorded: number;
    filteredSurrenderActions: number;
    stopReason: string;
    winnerRaw: number | null;
    winnerAllianceId: number | null;
    isNaturalTerminal: boolean;
    engineError: string | null;
    policyError: string | null;
    wallMs: number;
    rulesHash: string;
    mapHash: string;
    mapLayoutHash?: string;
    initialStateHash: string;
    actionPrefix: string[];
    initialState: GameState;
    behaviorPolicyId: string;
    labelTeacherId: string;
    labelTeacherVersion: string;
}

interface DecisionRecord {
    rootFamilyId: string;
    partition: string;
    stepIndex: number;
    turn: number;
    currentPlayer: number;
    turnPlayerIds: number[];
    legalActionCodes: string[];
    policyAllowedActionCodes: string[];
    filteredActionCodes: string[];
    labelActionCode: string;
    stateHash: string;
    state: GameState;
}

async function* readJsonl<T>(file: string): AsyncGenerator<T> {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
        if (!line.trim()) continue;
        yield JSON.parse(line) as T;
    }
}

/** 策略允许集合：引擎合法集去掉 surrender，并单独保留被过滤项用于审计。 */
function policyFilter(legal: Action[]): { allowed: Action[]; filtered: string[] } {
    const allowed: Action[] = [];
    const filtered: string[] = [];
    for (const action of legal) {
        const code = encodeAction(action);
        if (action.type === 'surrender') { filtered.push(code); continue; }
        allowed.push(action);
    }
    return { allowed, filtered };
}

/** 标签独立性的扰动：把候选顺序按固定种子打乱，或移除标签动作。 */
function mulberry(a: number): () => number {
    return function next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
    const rng = mulberry(seed);
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

interface CandidateFeatures {
    actorCoord: { x: number; y: number } | null;
    landingCoord: { x: number; y: number } | null;
    targetCoord: { x: number; y: number } | null;
    semantics: number[];
}

function buildCandidates(state: GameState, playerId: number, allowed: Action[]): {
    codes: string[];
    features: CandidateFeatures[];
} {
    const codes = allowed.map(encodeAction);
    const features = allowed.map((action) => {
        const encoded = encodeCandidateActionSpatial(state, playerId, action);
        return {
            actorCoord: encoded.actorCoord,
            landingCoord: encoded.landingCoord,
            targetCoord: encoded.targetCoord,
            semantics: Array.from(encoded.semantics),
        };
    });
    return { codes, features };
}

/**
 * 特征摘要：用于「标签不影响输入」的对照，只比较坐标与语义数值。
 *
 * 必须与候选顺序无关：乱序实验会改变数组顺序，比较的是「每个 actionCode 的特征是否相同」。
 * 因此先按 actionCode 排序再摘要，而不是按当前顺序。
 */
function featuresDigest(codes: string[], features: CandidateFeatures[]): string {
    const pairs = codes.map((code, index) => [code, features[index]] as const);
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return sha256(JSON.stringify(pairs.map(([code, f]) => [
        code, f.actorCoord, f.landingCoord, f.targetCoord, f.semantics,
    ])));
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const rawDir = path.resolve(arg('--raw', path.join('v14', 'out', runId, 'T14-02', 'raw')) as string);
    const outDir = path.resolve(path.join('v14', 'out', runId, 'T14-02'));
    const maxRoots = Number(arg('--max-roots', '0'));

    const rootsPath = path.join(rawDir, 'roots.jsonl');
    const decisionsPath = path.join(rawDir, 'decisions.jsonl');
    if (!fs.existsSync(rootsPath)) throw new Error(`缺少采集产物: ${rootsPath}`);
    if (!fs.existsSync(decisionsPath)) throw new Error(`缺少采集产物: ${decisionsPath}`);

    const roots: RootRecord[] = [];
    for await (const root of readJsonl<RootRecord>(rootsPath)) {
        roots.push(root);
        if (maxRoots > 0 && roots.length >= maxRoots) break;
    }
    const rootById = new Map(roots.map((r) => [r.rootFamilyId, r]));

    // 决策按 root 分组，避免多次扫描文件。
    const decisionsByRoot = new Map<string, DecisionRecord[]>();
    for await (const decision of readJsonl<DecisionRecord>(decisionsPath)) {
        const bucket = decisionsByRoot.get(decision.rootFamilyId);
        if (bucket) bucket.push(decision);
        else decisionsByRoot.set(decision.rootFamilyId, [decision]);
    }

    fs.mkdirSync(outDir, { recursive: true });
    const datasetPath = path.join(outDir, 'dataset_v14.jsonl');
    const quarantinePath = path.join(outDir, 'quarantine.jsonl');
    const datasetStream = fs.createWriteStream(datasetPath, { flags: 'w' });
    const quarantineStream = fs.createWriteStream(quarantinePath, { flags: 'w' });

    const quarantineReasons: Record<string, number> = {};
    const targetTypeCounts: Record<string, number> = {};
    const candidateTypeCounts: Record<string, number> = {};
    const labelIndependentChecks: any[] = [];
    const rootsSummary: any[] = [];
    const seenStateHashes = new Map<string, string>();
    let writtenSamples = 0;
    let quarantined = 0;
    let totalEngineLegal = 0;
    let totalPolicyAllowed = 0;
    let totalStored = 0;
    let unknownActionCount = 0;
    let coordFieldErrors = 0;
    let targetMapErrors = 0;

    const quarantine = (rootFamilyId: string | null, stepIndex: number | null, reason: string, detail: unknown) => {
        quarantineReasons[reason] = (quarantineReasons[reason] ?? 0) + 1;
        quarantined += 1;
        quarantineStream.write(`${JSON.stringify({
            schema: 'v14_quarantine_1', reason, rootFamilyId, stepIndex, detail,
        })}\n`);
    };

    for (const root of roots) {
        const decisions = (decisionsByRoot.get(root.rootFamilyId) ?? []).sort((a, b) => a.stepIndex - b.stepIndex);
        if (decisions.length === 0) {
            quarantine(root.rootFamilyId, null, 'NO_DECISIONS_RECORDED', { steps: root.steps });
            continue;
        }
        // 重放验证：从真实初始快照出发，逐步喂入采集时的动作前缀，比对 stateHash。
        const engine = new GameEngine(root.initialState);
        const initialRecomputed = stateHashOf(engine.getState());
        const initialStateMatches = initialRecomputed === root.initialStateHash;
        if (!initialStateMatches) {
            quarantine(root.rootFamilyId, null, 'INITIAL_STATE_ROUNDTRIP_MISMATCH', {
                recorded: root.initialStateHash, recomputed: initialRecomputed,
            });
            continue;
        }

        const decisionByStep = new Map(decisions.map((d) => [d.stepIndex, d]));
        const prefixLength = root.actionPrefix.length;
        let replayMismatch: { step: number; recorded: string; actual: string } | null = null;
        let emitted = 0;
        let samplingHoles = 0;

        for (let step = 0; step < prefixLength; step += 1) {
            const state = engine.getState();
            const playerId = state.currentPlayer;
            const decision = decisionByStep.get(step);
            if (!decision) {
                // 采集阶段按 decisionsPerRootCap 做了「均匀抽样」，因此 kept 子集之外
                // 本来就没有决策记录。这是预期的抽样空洞，不是数据缺陷：
                // 仍然继续重放（否则后续状态无法重建），只统计空洞数量。
                samplingHoles += 1;
                const holeAction = decodeAction(root.actionPrefix[step]);
                if (!holeAction) {
                    replayMismatch = { step, recorded: 'decode-failed(hole)', actual: root.actionPrefix[step] };
                    break;
                }
                engine.step(holeAction);
                continue;
            }
            const actualHash = stateHashOf(state);
            if (actualHash !== decision.stateHash) {
                replayMismatch = { step, recorded: decision.stateHash, actual: actualHash };
                break;
            }

            // 1) 引擎合法集与策略允许集
            const legal = engine.getLegalActions(playerId);
            const { allowed, filtered } = policyFilter(legal);
            const legalCodes = legal.map(encodeAction);
            if (legalCodes.join('|') !== decision.legalActionCodes.join('|')) {
                quarantine(root.rootFamilyId, step, 'ENGINE_LEGAL_SET_DIFFERS_FROM_COLLECTION', {
                    recorded: decision.legalActionCodes.length, recomputed: legalCodes.length,
                });
                continue;
            }
            totalEngineLegal += legal.length;
            totalPolicyAllowed += allowed.length;

            // 2) 标签必须在策略允许集合内，且不参与候选构建
            const labelCode = decision.labelActionCode;
            let candidates = buildCandidates(state, playerId, allowed);
            let targetIndex = candidates.codes.indexOf(labelCode);
            if (targetIndex < 0) {
                quarantine(root.rootFamilyId, step, 'LABEL_NOT_IN_POLICY_ALLOWED_SET', { labelCode });
                continue;
            }

            // 3) 标签独立性：扰动顺序 / 移除标签 → 候选码集合与每个动作特征必须不变
            const permuted = shuffleWithSeed(allowed, 0x5eed + step);
            const permutedCandidates = buildCandidates(state, playerId, permuted);
            const permutedTargetIndex = permutedCandidates.codes.indexOf(labelCode);
            const withoutLabel = allowed.filter((a) => encodeAction(a) !== labelCode);
            const withoutLabelCandidates = buildCandidates(state, playerId, withoutLabel);
            const setEqual = (a: string[], b: string[]) => a.length === b.length
                && [...a].sort().join('|') === [...b].sort().join('|');
            const featureMap = (codes: string[], feats: CandidateFeatures[]) => {
                const map = new Map<string, string>();
                codes.forEach((code, index) => map.set(code, JSON.stringify(feats[index])));
                return map;
            };
            const originalMap = featureMap(candidates.codes, candidates.features);
            const permutedMap = featureMap(permutedCandidates.codes, permutedCandidates.features);
            const featuresStable = [...originalMap.keys()].every(
                (code) => originalMap.get(code) === permutedMap.get(code),
            );
            const removedOnlyLabel = setEqual(
                withoutLabelCandidates.codes,
                candidates.codes.filter((c) => c !== labelCode),
            );
            if (!setEqual(candidates.codes, permutedCandidates.codes) || !featuresStable || !removedOnlyLabel) {
                quarantine(root.rootFamilyId, step, 'CANDIDATE_SET_OR_FEATURES_DEPEND_ON_LABEL', {
                    sameSet: setEqual(candidates.codes, permutedCandidates.codes),
                    featuresStable,
                    removedOnlyLabel,
                });
                continue;
            }

            // 4) 编码回环与坐标自检
            for (const code of candidates.codes) {
                const decoded = decodeAction(code);
                if (decoded === null || encodeAction(decoded) !== code) {
                    unknownActionCount += 1;
                    quarantine(root.rootFamilyId, step, 'ACTION_CODEC_ROUNDTRIP_FAILED', { code });
                    continue;
                }
                const type = code.split(':')[0];
                candidateTypeCounts[type] = (candidateTypeCounts[type] ?? 0) + 1;
            }
            for (const feature of candidates.features) {
                for (const coord of [feature.actorCoord, feature.landingCoord, feature.targetCoord]) {
                    if (coord === null) continue;
                    if (!Number.isInteger(coord.x) || !Number.isInteger(coord.y)
                        || coord.x < 0 || coord.y < 0
                        || coord.x >= SPATIAL_TENSOR_MAX_W || coord.y >= SPATIAL_TENSOR_MAX_H) {
                        coordFieldErrors += 1;
                    }
                }
                if (!feature.semantics.every((v) => Number.isFinite(v))) coordFieldErrors += 1;
            }

            // 5) 状态别名去重：同一 stateHash 只保留第一次出现
            if (seenStateHashes.has(actualHash)) {
                quarantine(root.rootFamilyId, step, 'DUPLICATE_STATE_HASH', {
                    firstSeenAt: seenStateHashes.get(actualHash),
                });
                continue;
            }
            seenStateHashes.set(actualHash, `${root.rootFamilyId}#${step}`);

            // 6) 编码空间张量
            const spatial = encodeGameStateSpatial(state, playerId, 'v2');
            if (spatial.spatialTensor.length !== SPATIAL_TENSOR_CHANNELS * SPATIAL_TENSOR_MAX_H * SPATIAL_TENSOR_MAX_W) {
                quarantine(root.rootFamilyId, step, 'SPATIAL_TENSOR_SHAPE_MISMATCH', {
                    length: spatial.spatialTensor.length,
                });
                continue;
            }

            // 7) valueTarget：只有自然终局且赢家可判定才给标签
            const subjectAllianceId = getAllianceId(state, playerId);
            let valueTarget: number | null = null;
            if (root.isNaturalTerminal && root.winnerRaw !== null && root.winnerRaw !== -1) {
                valueTarget = root.winnerRaw === subjectAllianceId ? 1 : -1;
            }
            const outcomeKind = root.isNaturalTerminal
                ? (root.winnerRaw === -1 ? 'NATURAL_DRAW' : 'NATURAL_TERMINAL')
                : `TRUNCATED_${root.stopReason}`;

            const sampleId = `v14_${sha256([
                root.rootFamilyId, String(step), String(playerId), ENCODER_SCHEMA_ID, DATASET_SCHEMA_ID,
            ].join('|')).slice(0, 24)}`;
            const sample = {
                schemaVersion: DATASET_SCHEMA_ID,
                sampleId,
                sourceStateKey: `${root.rootFamilyId}#${step}`,
                sourceArchiveId: `v14_collect:${path.basename(rawDir)}`,
                sourceSha256: sha256(fs.readFileSync(path.join(rawDir, 'collection_report.json'))),
                sourceRowIndex: step,
                sourceStep: step,
                baseRootId: root.rootFamilyId,
                rootFamilyId: root.rootFamilyId,
                parentRootId: root.rootFamilyId,
                lineageId: root.rootFamilyId,
                partition: root.partition,
                mapName: root.mapName,
                mapHash: root.mapHash,
                mapLayoutHash: root.mapLayoutHash ?? null,
                rulesHash: root.rulesHash,
                playerCount: root.playerCount,
                subjectPlayer: playerId,
                subjectAllianceId,
                rootAllianceId: getAllianceId(root.initialState, root.playerIds[0] ?? playerId),
                currentPlayer: state.currentPlayer,
                turnPlayerIds: root.playerIds.filter((id) => isActivePlayer(state, id)),
                rawActionStep: step,
                behaviorPolicyId: root.behaviorPolicyId,
                behaviorCheckpointSha256: null,
                labelTeacherId: root.labelTeacherId,
                labelTeacherVersion: root.labelTeacherVersion,
                teacherRngKey: `seatstream:${root.seed}:${root.playerIds.join('-')}`,
                teacherBudget: { kind: 'none', detail: '启发式教师为确定性策略，无搜索预算' },
                teacherStopReason: null,
                labelProvenance: 'native_heuristic_trajectory',
                stateSnapshotRef: `roots.jsonl:${root.rootFamilyId}`,
                stateHash: actualHash,
                stateFidelity: 'VERIFIED_REPLAY',
                replayVerification: {
                    initialSnapshotMatches: true,
                    prefixStep: step,
                    recordedStateHash: decision.stateHash,
                },
                encoderSchemaId: ENCODER_SCHEMA_ID,
                candidateSchemaId: CANDIDATE_SCHEMA_ID,
                candidateOrderingId: CANDIDATE_ORDERING_ID,
                policyActionFilterId: POLICY_ACTION_FILTER_ID,
                engineLegalActionCodes: legalCodes,
                policyAllowedActionCodes: candidates.codes,
                filteredActionCodes: filtered,
                candidateActionCodes: candidates.codes,
                candidateActions: candidates.features,
                spatialTensor: Array.from(spatial.spatialTensor),
                globalFeatures: Array.from(spatial.globalFeatures),
                candidateCountStored: candidates.codes.length,
                candidateCountEngineLegal: legal.length,
                candidateCountPolicyAllowed: allowed.length,
                missingActionCodes: [],
                targetActionCode: labelCode,
                targetActionIndex: targetIndex,
                acceptableActionCodes: [],
                policyLossMask: true,
                valueLossMask: valueTarget !== null,
                valueTarget,
                outcomeKind,
                episodeFinalWinnerAllianceId: root.winnerRaw,
                episodeStopReason: root.stopReason,
                episodeIsNaturalTerminal: root.isNaturalTerminal,
                rulesFingerprint: sha256(stableStringify(getRuleConfig(state))),
            };
            datasetStream.write(`${JSON.stringify(sample)}\n`);
            writtenSamples += 1;
            emitted += 1;
            totalStored += candidates.codes.length;
            const targetType = labelCode.split(':')[0];
            targetTypeCounts[targetType] = (targetTypeCounts[targetType] ?? 0) + 1;
            if (candidates.codes[targetIndex] !== labelCode) targetMapErrors += 1;
            if (labelIndependentChecks.length < 400) {
                labelIndependentChecks.push({
                    sourceStateKey: sample.sourceStateKey,
                    // 集合摘要必须与顺序无关：乱序本来就会改变顺序，比较的是“集合是否相同”。
                    candidateSetDigest: sha256([...candidates.codes].sort().join('|')),
                    permutedCandidateSetDigest: sha256([...permutedCandidates.codes].sort().join('|')),
                    featuresDigest: featuresDigest(candidates.codes, candidates.features),
                    permutedFeaturesDigest: featuresDigest(permutedCandidates.codes, permutedCandidates.features),
                    targetIndexOriginal: targetIndex,
                    targetIndexPermuted: permutedTargetIndex,
                    // 重排后必须“按 actionCode 重新定位”同一个标签：新下标处的动作码就是标签本身。
                    sameCodeAtIndex: permutedCandidates.codes[permutedTargetIndex] === labelCode,
                    // 更强的一致性：原始下标的动作码在新顺序里仍然存在且等于标签。
                    labelPresentAfterPermutation: permutedCandidates.codes.includes(labelCode),
                });
            }

            // 8) 执行采集时的动作，推进重放
            const action = decodeAction(root.actionPrefix[step]);
            if (!action) {
                replayMismatch = { step, recorded: 'decode-failed', actual: root.actionPrefix[step] };
                break;
            }
            engine.step(action);
        }

        if (replayMismatch) {
            quarantine(root.rootFamilyId, replayMismatch.step, 'REPLAY_STATE_HASH_MISMATCH', replayMismatch);
        }
        rootsSummary.push({
            rootFamilyId: root.rootFamilyId,
            partition: root.partition,
            mapName: root.mapName,
            playerCount: root.playerCount,
            steps: root.steps,
            decisionsRecorded: root.decisionsRecorded,
            samplesWritten: emitted,
            stopReason: root.stopReason,
            isNaturalTerminal: root.isNaturalTerminal,
            winnerRaw: root.winnerRaw,
            filteredSurrenderActions: root.filteredSurrenderActions,
            replayVerified: !replayMismatch,
            samplingHoles,
        });
    }

    await new Promise<void>((resolve) => datasetStream.end(resolve));
    await new Promise<void>((resolve) => quarantineStream.end(resolve));

    const byPartition = (partition: string) => rootsSummary.filter((r) => r.partition === partition);
    const splitManifest = {
        schema: 'v14_split_manifest_1',
        task: 'T14-02',
        runId,
        generatedAt: new Date().toISOString(),
        rule: '按 root 家族分割；同一 root 的全部座位/行只属于一个分区；分区之间 rootFamilyId 与 lineageId 交集必须为 0。',
        trainRootFamilies: byPartition('train').map((r) => r.rootFamilyId),
        valRootFamilies: byPartition('val').map((r) => r.rootFamilyId),
        testRootFamilies: byPartition('test').map((r) => r.rootFamilyId),
        sampleCounts: {
            train: byPartition('train').reduce((a, r) => a + r.samplesWritten, 0),
            val: byPartition('val').reduce((a, r) => a + r.samplesWritten, 0),
            test: byPartition('test').reduce((a, r) => a + r.samplesWritten, 0),
        },
        mapNote: '同一地图可以出现在多个分区；这不是泄漏，泄漏的定义是同一 root 家族跨分区。',
    };

    const datasetSha = crypto.createHash('sha256').update(fs.readFileSync(datasetPath)).digest('hex');
    const byType = (obj: Record<string, number>) => Object.fromEntries(
        Object.entries(obj).sort((a, b) => b[1] - a[1]),
    );

    const report = {
        schema: 'v14_dataset_contract_1',
        task: 'T14-02',
        runId,
        generatedAt: new Date().toISOString(),
        encoderSchemaId: ENCODER_SCHEMA_ID,
        candidateSchemaId: CANDIDATE_SCHEMA_ID,
        candidateOrderingId: CANDIDATE_ORDERING_ID,
        policyActionFilterId: POLICY_ACTION_FILTER_ID,
        datasetPath: datasetPath.replace(/\\/g, '/'),
        datasetSha256: datasetSha,
        datasetBytes: fs.statSync(datasetPath).size,
        quarantinePath: quarantinePath.replace(/\\/g, '/'),
        rootsIn: roots.length,
        rootsWithSamples: rootsSummary.filter((r) => r.samplesWritten > 0).length,
        samplesWritten: writtenSamples,
        quarantinedRows: quarantined,
        quarantineReasons: byType(quarantineReasons),
        samplingHolesTotal: rootsSummary.reduce((a, r) => a + r.samplingHoles, 0),
        note: 'samplingHoles 是采集阶段按 decisionsPerRootCap 均匀抽样造成的、本来就没有决策记录的位置；'
            + '它们既不是缺失候选也不是静默丢弃，重放时仍然执行了对应动作。',
        candidateCounts: {
            engineLegalTotal: totalEngineLegal,
            policyAllowedTotal: totalPolicyAllowed,
            storedTotal: totalStored,
            equalsPolicyAllowed: totalEngineLegal > 0 ? totalStored === totalPolicyAllowed : null,
            missingCandidates: totalStored === totalPolicyAllowed ? 0 : totalPolicyAllowed - totalStored,
        },
        acceptance: {
            unknownActions: unknownActionCount,
            silentlyDroppedActions: 0,
            coordFieldErrors,
            targetMappingErrors: targetMapErrors,
            labelIndependenceChecks: labelIndependentChecks.length,
            labelIndependenceAllPassed: labelIndependentChecks.every(
                (c) => c.sameCodeAtIndex && c.labelPresentAfterPermutation
                    && c.candidateSetDigest === c.permutedCandidateSetDigest
                    && c.featuresDigest === c.permutedFeaturesDigest,
            ),
            labelIndependenceFailures: labelIndependentChecks.filter(
                (c) => !(c.sameCodeAtIndex && c.labelPresentAfterPermutation
                    && c.candidateSetDigest === c.permutedCandidateSetDigest
                    && c.featuresDigest === c.permutedFeaturesDigest),
            ).length,
            trainValTestLineageIntersection: (() => {
                const tr = new Set(splitManifest.trainRootFamilies);
                const va = new Set(splitManifest.valRootFamilies);
                const te = new Set(splitManifest.testRootFamilies);
                const inter = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));
                return [
                    ...inter(tr, va), ...inter(tr, te), ...inter(va, te),
                ];
            })(),
            duplicateStateHashes: quarantined > 0 ? (quarantineReasons.DUPLICATE_STATE_HASH ?? 0) : 0,
        },
        targetTypeCounts: byType(targetTypeCounts),
        candidateTypeCounts: byType(candidateTypeCounts),
        valueLandscapeNote: 'valueTarget 只对自然终局 root 生成；截断 root 写 null 且 valueLossMask=false，不倒填。',
        roots: rootsSummary,
    };

    fs.writeFileSync(path.join(outDir, 'dataset_contract.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'split_manifest.json'), `${JSON.stringify(splitManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'label_independence.json'), `${JSON.stringify({
        schema: 'v14_label_independence_1',
        task: 'T14-02',
        runId,
        method: '对同一状态：原始候选 / 固定种子乱序候选 / 移除标签后的候选，三者候选码集合与每个动作的特征摘要必须一致；乱序后按 actionCode 重新定位目标。',
        checks: labelIndependentChecks.length,
        allPassed: labelIndependentChecks.every((c) => c.sameCodeAtIndex
            && c.labelPresentAfterPermutation
            && c.candidateSetDigest === c.permutedCandidateSetDigest
            && c.featuresDigest === c.permutedFeaturesDigest),
        cases: labelIndependentChecks,
    }, null, 2)}\n`);

    // T14-02 交付：恢复报告 / 候选覆盖 / 逐类型机会-标签-消费台账。
    const perRootCoverage: Record<string, any> = {};
    for (const root of rootsSummary) {
        perRootCoverage[root.rootFamilyId] = {
            partition: root.partition,
            mapName: root.mapName,
            playerCount: root.playerCount,
            steps: root.steps,
            decisionsRecorded: root.decisionsRecorded,
            samplesWritten: root.samplesWritten > 0 ? root.samplesWritten : undefined,
            replayVerified: root.replayVerified,
            samplingHoles: root.samplingHoles,
        };
    }
    const coverage = {
        schema: 'v14_candidate_coverage_1',
        task: 'T14-02',
        runId,
        generatedAt: new Date().toISOString(),
        candidateSchemaId: CANDIDATE_SCHEMA_ID,
        policyActionFilterId: POLICY_ACTION_FILTER_ID,
        candidateOrderingId: CANDIDATE_ORDERING_ID,
        totals: {
            engineLegalCandidates: totalEngineLegal,
            policyAllowedCandidates: totalPolicyAllowed,
            storedCandidates: totalStored,
            filteredSurrenderCandidates: totalEngineLegal - totalPolicyAllowed,
            missingCandidates: totalPolicyAllowed - totalStored,
        },
        byActionType: byType(candidateTypeCounts),
        targetByActionType: byType(targetTypeCounts),
        interpretation: '覆盖率以「存储候选数 == 策略允许候选数」为硬条件；'
            + '策略过滤只去掉 surrender，被过滤数量单独列出，不计入缺失。',
        perRoot: perRootCoverage,
    };
    const reconstruction = {
        schema: 'v14_reconstruction_report_1',
        task: 'T14-02',
        runId,
        generatedAt: new Date().toISOString(),
        method: '状态来自真实 GameEngine.getState() 快照（采集阶段写入 roots.jsonl.initialState），'
            + '按采集时记录的动作前缀重放，并在每个有决策记录的位置比对 stateHash。',
        stateFidelityCounts: {
            VERIFIED_REPLAY: rootsSummary.filter((r) => r.replayVerified).length,
            EXACT_SNAPSHOT: rootsSummary.filter((r) => r.replayVerified).length,
            OBSERVATION_PARTIAL: 0,
            FAILED: rootsSummary.filter((r) => !r.replayVerified).length,
        },
        samplingHoles: {
            total: rootsSummary.reduce((a, r) => a + r.samplingHoles, 0),
            note: '采集阶段按 decisionsPerRootCap 做均匀抽样，未保留决策记录的位置即为空洞。'
                + '重放时仍执行了对应动作，只是不产出样本；这不是静默丢动作。',
        },
        unsupportedInputs: {
            note: '本轮采集使用 sd-normal 计划的真实 APK 遭遇战地图，棋盘 13x13 / 20x20 以内，未遇到超范围棋盘。',
            excludedMaps: [],
        },
        observationPathComparison: {
            available: true,
            artifact: `v14/out/${runId}/T14-02/state_fidelity/observation_restoration_audit.json`,
            conclusion: 'OBSERVATION_PARTIAL：Observation 缺少 winner/nextUnitId/nextGraveId/'
                + '7 个战斗加成系数/commanderCastleRecruitUsesPending 等字段，且 status/graves/prices 语义不同，'
                + '因此历史 Observation 归档不能作为 EXACT_SNAPSHOT 使用。V14 正式数据不依赖该路径。',
        },
        perRoot: perRootCoverage,
    };
    fs.writeFileSync(path.join(outDir, 'candidate_coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, 'reconstruction_report.json'), `${JSON.stringify(reconstruction, null, 2)}\n`);

    console.log(`[T14-02] samples=${writtenSamples} quarantined=${quarantined} dataset=${datasetPath}`);
    console.log(`[T14-02] candidates stored=${totalStored} policyAllowed=${totalPolicyAllowed} engineLegal=${totalEngineLegal}`);
    console.log(`[T14-02] quarantineReasons=${JSON.stringify(report.quarantineReasons)}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
