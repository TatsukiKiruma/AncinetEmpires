/**
 * V18/T18-01：**独立可达状态采集**，专门补开局（0-2 阶段）的未见输入覆盖。
 *
 * ## 为什么需要它
 *
 * 独立复算（`v18/tools/check_train_val_separation.py` + `analyze_val_overlap_by_phase.py`）发现：
 * 确定性地图上，任何采集进程从同一初态出发、在前几个决策点上都会走到**同一批状态**，
 * 因此 V17 新 val 的 416 个 0-2 阶段不同输入里有 413 个同时出现在训练池里，
 * 真正未见的开局输入只有 3 个。任务书要求：
 *
 * > 通过独立可达状态采集补开局覆盖，不通过重复相同开局凑数。
 *
 * 本工具从一个**独立探针随机域**出发，在开局阶段按确定性伪随机合法动作前进，
 * 采到的是**真实可达但 H0 与学生会走出不同分支**的状态。它们：
 * - 使用与训练/验证完全相同的初始态工厂、编码器与输入身份口径；
 * - 明确标记 `collectionKind = 'OPENING_REACHABLE_PROBE'`；
 * - 不是对局结果，`valueTarget = null`、`naturalTerminal = false`，**不进入价值监督**；
 * - 是否与训练池重复，由 `check_train_val_separation.py` 独立重算后决定，本工具不自我宣告。
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v18/tools/probe_opening_states_v18.ts \
 *     --run-id run_20260927_v18_01 --prefixes-per-map 40 --max-turns 2
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import {
    encodeGameStateSpatial,
    encodeCandidateActionSpatial,
    ENCODER_SCHEMA_ID_V15,
    GLOBAL_FEATURE_DIM_V2,
} from '../../src/game/ai/spatial_tensor_encoder';
import { CANDIDATE_ORDERING_ID_V16, compareActionCodeCanonicalV16 } from '../../src/game/ai/action_ordering';
import {
    V16_ACTION_FILTER_ID,
    V16_DEFAULT_CAPS,
    V16_INITIALIZATION_POLICY_ID,
    V16_MAPS,
    V16_RNG_CONTRACT_ID,
    V16_UNPACK_DIR,
    V16_SD_PLAN_FILE,
    scenarioIdOfMapV16,
} from '../../v16/tools/eval_v16_protocol';
import { V17_INPUT_IDENTITY_ID, V17_ACTION_SEMANTIC_DIM, policyInputKeyHexV17 } from '../../v17/tools/v17_input_identity';
import { mulberry32 } from '../../v15/tools/labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUN_ID = arg('--run-id', 'run_20260927_v18_01') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v18/out/${RUN_ID}`) as string);
const PREFIXES_PER_MAP = Number(arg('--prefixes-per-map', '40'));
const MAX_TURNS = Number(arg('--max-turns', '2'));
const MAX_STEPS = Number(arg('--max-steps', '400'));
const PROBE_DOMAIN = arg('--probe-domain', 'v18-opening-probe-v1') as string;
const MAP_FILTER = arg('--map-index', null);
const SHARD = arg('--shard', null);

let shardIndex = 0;
let shardCount = 1;
if (SHARD !== null) {
    const parts = SHARD.split('/').map(Number);
    shardIndex = parts[0];
    shardCount = parts[1];
}

const outDir = path.join(RUN_ROOT, 'data', 'val_states');
fs.mkdirSync(outDir, { recursive: true });
const rolloutPath = path.join(outDir, `opening_probe${SHARD ? `.shard${shardIndex}of${shardCount}` : ''}.jsonl`);
const encodedPath = path.join(outDir, `opening_probe.encoded${SHARD ? `.shard${shardIndex}of${shardCount}` : ''}.jsonl`);

const envFactory = await createDefaultEnvFactory(V16_UNPACK_DIR, V16_SD_PLAN_FILE);

function phaseBucketOf(completedTurns: number): string {
    return completedTurns <= 2 ? '0-2' : completedTurns <= 7 ? '3-7' : '8+';
}

/** 与训练/验证完全相同的候选规范顺序：actionCode 码点升序。 */
function canonicalCandidates(state: GameState, playerId: number, engine: GameEngine) {
    const legal: Action[] = engine.isTerminal()
        ? []
        : engine.getLegalActions(playerId).filter((a) => a.type !== 'surrender');
    const decorated = legal.map((action) => ({ action, code: encodeAction(action) }));
    decorated.sort((a, b) => compareActionCodeCanonicalV16(a.code, b.code));
    return decorated;
}

function orderedActionCodesOf(state: GameState, playerId: number): string[] {
    const engine = new GameEngine(JSON.parse(JSON.stringify(state)) as GameState);
    return canonicalCandidates(state, playerId, engine).map((d) => d.code);
}

const rolloutOut = fs.createWriteStream(rolloutPath, { flags: 'w' });
const encodedOut = fs.createWriteStream(encodedPath, { flags: 'w' });

const stats = {
    schema: 'v18_opening_probe_summary_1',
    runId: RUN_ID,
    probeDomain: PROBE_DOMAIN,
    prefixesPerMap: PREFIXES_PER_MAP,
    maxTurns: MAX_TURNS,
    maps: [] as Array<Record<string, unknown>>,
    rowsWritten: 0,
    encodedRows: 0,
    distinctStateHashes: 0,
    distinctPolicyInputKeys: 0,
    skippedDuplicateInput: 0,
    emptyLegalSets: 0,
    phaseBuckets: {} as Record<string, number>,
    actionTypeDistribution: {} as Record<string, number>,
};

const seenStateHashes = new Set<string>();
const seenInputKeys = new Set<string>();

for (let m = 0; m < V16_MAPS.length; m += 1) {
    if (MAP_FILTER !== null && Number(MAP_FILTER) !== m) continue;
    const mapName = V16_MAPS[m];
    const scenarioId = scenarioIdOfMapV16(mapName);
    const perMap: Record<string, unknown> = { mapIndex: m, mapName, prefixes: 0, rows: 0, encoded: 0, prefixSummaries: [] };

    for (let p = 0; p < PREFIXES_PER_MAP; p += 1) {
        const probeId = `${m}:${p}`;
        const jobIndex = m * PREFIXES_PER_MAP + p;
        if (jobIndex % shardCount !== shardIndex) continue;
        const seed = 0; // 初态与 seed 无关；分叉完全由探针随机流决定。
        const episode = {
            kind: 'skirmish_episode', version: 1,
            scenario: { id: scenarioId, mode: 'SD', mapName, resourcePath: '' },
            seed, maxPlies: 1200, maxSteps: MAX_STEPS,
            initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
            players: [], policyByPlayer: {}, steps: [], summary: {},
        } as any;
        const env = await envFactory.createEnv(episode);
        env.reset(seed);
        const engine = env.getEngine();

        const probeSeed = crypto.createHash('sha256')
            .update(Buffer.from(`${PROBE_DOMAIN}|${mapName}|${p}`, 'utf8')).digest();
        const rng = mulberry32(probeSeed.readUInt32LE(0));
        // 每个前缀多消耗一次随机数，保证不同前缀的随机流不会同步。
        for (let k = 0; k <= p; k += 1) rng();

        let completedTurns = 0;
        let lastPlayer: number | null = null;
        let steps = 0;
        let prefixRows = 0;
        const prefixActions: string[] = [];

        while (steps < MAX_STEPS && completedTurns <= MAX_TURNS) {
            const state = engine.getState();
            if (engine.isTerminal()) break;
            const current = state.currentPlayer;
            const decorated = canonicalCandidates(state, current, engine);
            if (decorated.length === 0) {
                stats.emptyLegalSets += 1;
                break;
            }
            if (lastPlayer !== null && lastPlayer !== current) completedTurns += 1;
            lastPlayer = current;
            if (completedTurns > MAX_TURNS) break;

            const chosen = decorated[Math.min(decorated.length - 1, Math.floor(rng() * decorated.length))];
            prefixActions.push(chosen.code);

            const stateHash = crypto.createHash('sha256')
                .update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex');
            if (!seenStateHashes.has(stateHash)) {
                seenStateHashes.add(stateHash);
                const phase = phaseBucketOf(completedTurns);
                const rootId = `probe:${PROBE_DOMAIN}:m${m}:p${p}`;
                const subjectAllianceId = state.players.find((pl) => pl.id === current)?.allianceId ?? current;

                rolloutOut.write(`${JSON.stringify({
                    schema: 'v17_rollout_row_1',
                    runId: RUN_ID,
                    split: 'val',
                    collectionKind: 'OPENING_REACHABLE_PROBE',
                    sourcePolicy: 'opening_probe',
                    behaviorPolicyId: 'probe-uniform-legal',
                    behaviorCheckpointSha256: null,
                    rootId,
                    rootFamilyId: `${mapName}#${V16_INITIALIZATION_POLICY_ID}#probe:${PROBE_DOMAIN}:m${m}:p${p}`,
                    trueFamilyId: `${mapName}#${V16_INITIALIZATION_POLICY_ID}#probe:${PROBE_DOMAIN}:m${m}:p${p}`,
                    familyDefinition: '探针前缀族：mapName#initializationPolicyId#probeDomain:map:prefix（不是物理对局 family）',
                    mapIndex: m,
                    mapName,
                    scenarioId,
                    seed: null,
                    seedFormula: '不适用：探针不是物理对局，没有物理 root seed',
                    subjectPlayerId: current,
                    subjectSeat: current,
                    subjectAllianceId,
                    subjectOutcome: null,
                    valueTarget: null,
                    winnerAllianceId: null,
                    naturalTerminal: false,
                    gameOutcomeKind: null,
                    engineError: null,
                    fallbackUsed: false,
                    initialStatePolicyId: V16_INITIALIZATION_POLICY_ID,
                    initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
                    actionFilterId: V16_ACTION_FILTER_ID,
                    rngContractId: V16_RNG_CONTRACT_ID,
                    collectionCaps: { maxStepsAtomicActions: MAX_STEPS, wallTimeoutMs: null, maxPlies: 1200 },
                    gameId: `${rootId}|step${steps}`,
                    stepIndex: steps,
                    turn: state.turn,
                    completedPlayerTurns: completedTurns,
                    phaseBucket: phase,
                    stateHash,
                    stateJson: JSON.stringify(state),
                    behaviorActionCode: chosen.code,
                    probePrefixActions: prefixActions.slice(),
                })}\n`);
                stats.rowsWritten += 1;
                prefixRows += 1;
                perMap.rows = (perMap.rows as number) + 1;
                stats.phaseBuckets[phase] = (stats.phaseBuckets[phase] ?? 0) + 1;
                const actionType = chosen.code.split(':')[0];
                stats.actionTypeDistribution[actionType] = (stats.actionTypeDistribution[actionType] ?? 0) + 1;

                // ==== 编码（与 build_v17_dataset.ts 完全相同的口径）====
                const spatial = encodeGameStateSpatial(state, current, 'v2', { channels: 26 });
                const candidates = decorated.map((d) => {
                    const features = encodeCandidateActionSpatial(state, current, d.action, 'v2', 'v15_current');
                    return {
                        actionCode: d.code,
                        actorCoord: features.actorCoord ?? null,
                        landingCoord: features.landingCoord ?? null,
                        targetCoord: features.targetCoord ?? null,
                        semantics: Array.from(features.semantics),
                    };
                });
                if (candidates.some((c) => c.semantics.length !== V17_ACTION_SEMANTIC_DIM)) {
                    throw new Error(`SEMANTIC_DIM:${rootId}:${steps}`);
                }
                const spatialArray = Array.from(spatial.spatialTensor);
                const globalArray = Array.from(spatial.globalFeatures);
                if (spatialArray.length !== 26 * 20 * 20) throw new Error(`SPATIAL_DIM:${rootId}:${steps}`);
                if (globalArray.length !== GLOBAL_FEATURE_DIM_V2) throw new Error(`GLOBAL_DIM:${rootId}:${steps}`);
                const policyInputKey = policyInputKeyHexV17(spatialArray, globalArray, candidates);
                if (seenInputKeys.has(policyInputKey)) {
                    stats.skippedDuplicateInput += 1;
                } else {
                    seenInputKeys.add(policyInputKey);
                    const encoded = {
                        schema: 'v17_dataset_row_1',
                        sampleId: `${rootId}|seat${current}|step${steps}`,
                        stateHash,
                        rootId,
                        trueFamilyId: `${mapName}#${V16_INITIALIZATION_POLICY_ID}#probe:${PROBE_DOMAIN}:m${m}:p${p}`,
                        split: 'val',
                        sourcePolicy: 'opening_probe',
                        collectionKind: 'OPENING_REACHABLE_PROBE',
                        behaviorPolicyId: 'probe-uniform-legal',
                        behaviorCheckpointSha256: null,
                        subjectPlayerId: current,
                        subjectAllianceId,
                        phaseBucket: phase,
                        completedPlayerTurns: completedTurns,
                        mapName,
                        mapIndex: m,
                        turn: state.turn,
                        environmentId: `v17:${V16_INITIALIZATION_POLICY_ID}`,
                        initializationPolicyId: V16_INITIALIZATION_POLICY_ID,
                        encoderSchemaId: ENCODER_SCHEMA_ID_V15,
                        candidateOrderingId: CANDIDATE_ORDERING_ID_V16,
                        filterId: V16_ACTION_FILTER_ID,
                        rngContractId: V16_RNG_CONTRACT_ID,
                        inputIdentityId: V17_INPUT_IDENTITY_ID,
                        policyInputKey,
                        actualInputKey: policyInputKey,
                        spatialTensor: spatialArray,
                        globalFeatures: globalArray,
                        candidateActions: candidates,
                        orderedActionCodes: candidates.map((c) => c.actionCode),
                        behaviorActionCode: chosen.code,
                        valueTarget: null,
                        valueLossMask: false,
                        policyLossMask: true,
                    };
                    encodedOut.write(`${JSON.stringify(encoded)}\n`);
                    stats.encodedRows += 1;
                    perMap.encoded = (perMap.encoded as number) + 1;
                }
            }

            engine.step(chosen.action);
            steps += 1;
        }

        perMap.prefixes = (perMap.prefixes as number) + 1;
        (perMap.prefixSummaries as Array<Record<string, unknown>>).push({
            prefixIndex: p,
            steps,
            completedTurns,
            rows: prefixRows,
            firstActions: prefixActions.slice(0, 4),
        });
        if (stats.rowsWritten >= 40000) break;
    }
    stats.maps.push(perMap);
    console.log(`[opening-probe] ${mapName}: rows=${perMap.rows} encoded=${perMap.encoded}`, );
}

rolloutOut.end();
encodedOut.end();
stats.distinctStateHashes = seenStateHashes.size;
stats.distinctPolicyInputKeys = seenInputKeys.size;

const summaryPath = path.join(outDir, 'opening_probe.summary.json');
fs.writeFileSync(summaryPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    rollouts: path.relative(process.cwd(), rolloutPath).replace(/\\/g, '/'),
    encoded: path.relative(process.cwd(), encodedPath).replace(/\\/g, '/'),
    summary: path.relative(process.cwd(), summaryPath).replace(/\\/g, '/'),
    rowsWritten: stats.rowsWritten,
    encodedRows: stats.encodedRows,
    distinctPolicyInputKeys: stats.distinctPolicyInputKeys,
    phaseBuckets: stats.phaseBuckets,
    actionTypeDistribution: stats.actionTypeDistribution,
    emptyLegalSets: stats.emptyLegalSets,
}, null, 2));
