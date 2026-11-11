/**
 * V15/T15-08-E：D1/D2 双臂 DAgger 采集（owner E）。
 *
 * 协议依据（V15_EXPERIMENT_PROTOCOL §2.2、任务书 §9.1）：
 *   1. 只采预指定 `subjectSeat` 当前决策的状态；其他座位一律 H0。
 *   2. D1 的主体座位由 **H0** 行动；D2 的主体座位由**冻结的 C2-42 final@3000** 行动。
 *   3. 两分支从**相同初始 root、相同 subjectSeat、相同对手随机流合同**出发。
 *   4. 墙钟/原子步上限与基础采集相同：12,000 原子动作、150,000 ms（T15-00 protocol.json
 *      的 `caps.daggerCollection`）。**不启用**含义不明的 maxPlies 回合上限。
 *   5. 不得仅取前 N 行：主体座位的**每一次**决策都写入原轨迹，采样/匹配留给后续阶段。
 *
 * 与 `v14/tools/collect_v14_roots.ts` 的关系（可复用部分与**不复用**部分）：
 *   - 复用：`createDefaultEnvFactory` 环境工厂、每座位独立 `streamFor(seed, seat)` 随机流、
 *     `engine.step` 真实推进、完整 `getState()` 快照。
 *   - 不复用（v14 的错误/不适用部分）：
 *       a) v14 用 `spreadIndices(decisions, cap)` 事后抽样，会丢掉「不得仅取前 N 行」以外的
 *          大量主体决策；本工具**不抽样**，全部主体决策落盘。
 *       b) v14 的 STALLED_* 提前停止是**未冻结的额外回合上限**；本工具只用冻结的两个 cap。
 *       c) v14 的 `maxPlies: 1200` 属未冻结上限；本工具不把 maxPlies 当 cap。
 *   - `v14/tools/collect_student_states.ts` 是反面教材：它在同一实例上先选动作、
 *     再查询教师重标，导致查询推进行为 RNG。本工具**行为实例与标签查询完全分离**：
 *     采集阶段只跑行为实例，**从不调用 L1**；L1 在后续 `dataset_dagger_encode_v15.ts`
 *     中按 `stateHash` 重建独立实例（T15-01 已证查询不推进行为流，证据见
 *     `T15-01/query_isolation.json`：allIdentical=true、failures=0）。
 *
 * 输出（每 root 一个 JSONL，行序 = 时间序）：
 *   {"kind":"root", ...}              —— root 元数据 + 初始快照 + caps + 逐座位行为合同
 *   {"kind":"subject_decision", ...}  —— 主体座位每一次决策：完整 state 快照、stateHash、
 *                                        引擎合法集、策略允许集、实际行为动作、前缀长度
 *   {"kind":"root_summary", ...}      —— actionPrefix、stopReason、wallMs、原子步数、终局
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v15/tools/collect_dagger_arms_v15.ts \
 *     --run-id v15_20260925_core --arm D1 [--pairs dc:pair:duel:0,...] [--max-pairs N] \
 *     [--out-dir DIR] [--step-cap 12000] [--wall-ms 150000] [--smoke-steps N] [--resume]
 *
 * D2 另外需要（C2-42 final 冻结后）：
 *     --d2-weights v15/out/<runId>/T15-06/c2_s42/c2_s42_final.json [--d2-sha256 <hex>]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getTurnPlayerIds } from '../../src/game/rule_config';
import { SpatialResNetPredictor, loadSpatialResNetFromJson } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction, EmptyActionSetError } from '../../src/game/ai/shared_spatial_policy';
import { ENCODER_SCHEMA_ID_V15 } from '../../src/game/ai/spatial_tensor_encoder';
import { stateHashOf, L1_LABELER_VERSION } from './labeler_l1_v15';
import type { Action, GameState } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';
/** 行为/采集工具的版本身份，写进每条 root 记录。 */
const COLLECTOR_ID = 'v15/tools/collect_dagger_arms_v15.ts@v1';
const RNG_CONTRACT_ID = 'heuristic-seatstream-v1';
const POLICY_FILTER_ID = 'v15_policy_filter_no_surrender_1';

function arg(name: string, fallback: string | null = null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
    return process.argv.includes(name);
}
function sha256File(abs: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

/** 与 v13/v14 相同的每座位独立确定性随机流（对手随机流合同）。 */
function mulberry(a: number): () => number {
    return function next() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}

interface DaggerRoot {
    blockId: string;
    purpose: string;
    index: number;
    mapName: string;
    scenarioId: string;
    planId: string;
    playerCount: number;
    rootSeed: number;
    episodeIndex: number;
    rootFamilyId: string;
    subjectSeat: number;
    armBehaviorPolicy: Record<string, string>;
    otherSeatsBehaviorPolicy: string;
}

interface RootFileWriter {
    stream: fs.WriteStream;
    count: number;
}

async function main(): Promise<void> {
    const runId = arg('--run-id');
    const arm = (arg('--arm') ?? '').toUpperCase();
    if (!runId) throw new Error('缺少 --run-id');
    if (arm !== 'D1' && arm !== 'D2') throw new Error('--arm 必须是 D1 或 D2');

    const manifestPath = arg('--manifest', 'v15/out/v15_20260925_core/T15-00/root_manifests/data_collection_roots.json') as string;
    const outDir = arg('--out-dir', path.join('v15', 'out', runId, 'T15-08', `collect_${arm}`)) as string;
    const stepCap = Number(arg('--step-cap', '12000'));
    const wallMs = Number(arg('--wall-ms', '150000'));
    // smoke 用：只跑少量原子步，用于验证链路；正式运行不传。
    const smokeSteps = arg('--smoke-steps') ? Number(arg('--smoke-steps')) : null;
    const resume = flag('--resume');
    const maxPairs = arg('--max-pairs') ? Number(arg('--max-pairs')) : null;
    const pairFilter = arg('--pairs') ? (arg('--pairs') as string).split(',').map((s) => s.trim()).filter(Boolean) : null;

    // ---------------- C2-42 final 权重（仅 D2 需要）----------------
    let predictor: SpatialResNetPredictor | null = null;
    let behaviorCheckpointSha256: string | null = null;
    let behaviorCheckpointPath: string | null = null;
    if (arm === 'D2') {
        const weightsPath = arg('--d2-weights', path.join('v15', 'out', runId, 'T15-06', 'c2_s42', 'c2_s42_final.json')) as string;
        const expectedSha = arg('--d2-sha256');
        if (!fs.existsSync(weightsPath)) {
            throw new Error(
                `BLOCKED_ON_C2_FINAL：D2 需要冻结的 C2-42 final@3000 权重，但文件不存在：${weightsPath}。`
                + '按任务书 §9.1 与数据契约 §1，禁止用其他权重代替。'
                + 'C2-42 final 冻结后重跑同一命令即可恢复。',
            );
        }
        behaviorCheckpointPath = weightsPath;
        behaviorCheckpointSha256 = sha256File(weightsPath);
        if (expectedSha && expectedSha !== behaviorCheckpointSha256) {
            throw new Error(`--d2-sha256 与文件实际 SHA 不一致：期望 ${expectedSha}，实际 ${behaviorCheckpointSha256}`);
        }
        const weights = loadSpatialResNetFromJson(fs.readFileSync(weightsPath, 'utf8'), {
            expectedEncoderSchemaId: ENCODER_SCHEMA_ID_V15,
        });
        predictor = new SpatialResNetPredictor(weights);
        if (predictor.encoderSchemaId !== ENCODER_SCHEMA_ID_V15) {
            throw new Error(`C2-42 权重的 encoderSchemaId=${predictor.encoderSchemaId}，期望 ${ENCODER_SCHEMA_ID_V15}`);
        }
        console.log(`[dagger] D2 行为权重 ${weightsPath} sha256=${behaviorCheckpointSha256} schema=${predictor.encoderSchemaId}`);
    }

    // ---------------- 读取冻结 root 清单 ----------------
    const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')) as {
        roots: DaggerRoot[]; daggerPairInitialCount: number; maxDaggerPairs: number;
    };
    let roots = manifest.roots.filter((r) => r.purpose === 'dataCollection.daggerPair');
    if (pairFilter) {
        const want = new Set(pairFilter);
        roots = roots.filter((r) => want.has(r.blockId));
        if (roots.length !== want.size) {
            throw new Error(`--pairs 中有未在 daggerPair 清单里的 blockId；匹配到 ${roots.length}/${want.size}`);
        }
    }
    roots.sort((a, b) => a.index - b.index);
    if (maxPairs !== null) roots = roots.slice(0, maxPairs);

    fs.mkdirSync(outDir, { recursive: true });
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    const summaries: any[] = [];
    for (const root of roots) {
        const fileBase = root.blockId.replace(/[:\\/]/g, '_');
        const outPath = path.join(outDir, `${fileBase}.jsonl`);
        if (fs.existsSync(outPath)) {
            if (!resume) {
                // 不是静默跳过：明确报错，要求显式 --resume 或换目录。
                throw new Error(`拒绝覆盖已存在的产物：${outPath}（续写请显式加 --resume）`);
            }
            const text = fs.readFileSync(outPath, 'utf8');
            if (!text.includes('"kind":"root_summary"') && !text.includes('"kind": "root_summary"')) {
                throw new Error(`--resume 但文件没有完成标记 root_summary：${outPath}`);
            }
            const lines = text.split('\n').filter(Boolean);
            const summary = JSON.parse(lines[lines.length - 1]);
            summaries.push(summary);
            console.log(`[dagger] 跳过已完成 root ${root.blockId}`);
            continue;
        }
        const result = await collectRoot({
            root, arm, envFactory, stepCap, wallMs, smokeSteps, outPath,
            predictor, behaviorCheckpointSha256, behaviorCheckpointPath, runId,
        });
        summaries.push(result);
    }

    // ---------------- 采集报告 ----------------
    const reportPath = path.join(outDir, 'collection_report.json');
    if (fs.existsSync(reportPath) && !resume) throw new Error(`拒绝覆盖已存在的产物：${reportPath}`);
    const report = {
        schema: 'v15_dagger_collection_report_1',
        task: 'T15-08',
        owner: 'E',
        runId,
        arm,
        collectorId: COLLECTOR_ID,
        generatedAt: new Date().toISOString(),
        manifestPath,
        manifestSha256: sha256File(path.resolve(manifestPath)),
        manifestDaggerPairInitialCount: manifest.daggerPairInitialCount,
        manifestMaxDaggerPairs: manifest.maxDaggerPairs,
        caps: {
            stepCapAtomicActions: stepCap,
            wallMsPerRoot: wallMs,
            maxPliesUsedAsCap: false,
            smokeSteps,
        },
        behaviorPolicyBySeat: arm === 'D1'
            ? { subjectSeat: 'H0', otherSeats: 'H0' }
            : { subjectSeat: 'C2-42_final@3000', otherSeats: 'H0' },
        behaviorRngContractId: RNG_CONTRACT_ID,
        behaviorCheckpointPath,
        behaviorCheckpointSha256,
        labelerUsedDuringCollection: false,
        labelerNote: '采集阶段从不调用 L1；标签与逐状态 teacherRngKey 在 dataset_dagger_encode_v15.ts 中生成。',
        rootsRequested: roots.length,
        rootsCompleted: summaries.length,
        rootSummaries: summaries,
    };
    if (resume && fs.existsSync(reportPath)) {
        // 续写：合并旧的 rootSummaries，避免丢掉先前完成的 root。
        const old = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as any;
        const byId = new Map<string, any>();
        for (const s of old.rootSummaries ?? []) byId.set(s.rootFamilyId, s);
        for (const s of summaries) byId.set(s.rootFamilyId, s);
        report.rootSummaries = [...byId.values()].sort((a, b) => a.blockIndex - b.blockIndex);
        report.rootsCompleted = report.rootSummaries.length;
    }
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const totalAtomic = summaries.reduce((a, s) => a + (s.atomicSteps ?? 0), 0);
    const totalDecisions = summaries.reduce((a, s) => a + (s.subjectDecisions ?? 0), 0);
    console.log(`[dagger] arm=${arm} roots=${summaries.length} atomicSteps=${totalAtomic} subjectDecisions=${totalDecisions} -> ${outDir}`);
}

async function collectRoot(opts: {
    root: DaggerRoot;
    arm: string;
    envFactory: any;
    stepCap: number;
    wallMs: number;
    smokeSteps: number | null;
    outPath: string;
    predictor: SpatialResNetPredictor | null;
    behaviorCheckpointSha256: string | null;
    behaviorCheckpointPath: string | null;
    runId: string;
}): Promise<any> {
    const { root, arm } = opts;
    const seed = root.rootSeed;
    const episode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: root.scenarioId, mode: 'SD', mapName: root.mapName, resourcePath: '' },
        seed, maxPlies: null, maxSteps: opts.stepCap,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;

    const env = await opts.envFactory.createEnv(episode);
    env.reset(seed);
    const engine = env.getEngine();
    const initialSnapshot: GameState = engine.getState();
    const initialStateHash = stateHashOf(initialSnapshot);
    const playerIds: number[] = initialSnapshot.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);

    // 每座位独立 H0 实例与独立随机流。D2 的主体座位实例也会被构造，但**从不被查询**，
    // 因此它的 RNG 保持初始状态，不会因学生多走几步而推进其他座位 RNG。
    const seatAi = new Map<number, HeuristicAI>();
    for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

    const stream = fs.createWriteStream(opts.outPath, { flags: 'w' });
    const write = (obj: unknown): Promise<void> => new Promise((resolve, reject) => {
        stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
    });

    await write({
        kind: 'root',
        schema: 'v15_dagger_root_1',
        runId: opts.runId,
        arm,
        collectorId: COLLECTOR_ID,
        blockId: root.blockId,
        blockIndex: root.index,
        rootFamilyId: root.rootFamilyId,
        scenarioId: root.scenarioId,
        mapName: root.mapName,
        planId: root.planId,
        playerCount: root.playerCount,
        rootSeed: seed,
        episodeIndex: root.episodeIndex,
        subjectSeat: root.subjectSeat,
        seatAlliances: Object.fromEntries(playerIds.map((id) => [String(id), getAllianceId(initialSnapshot, id)])),
        subjectAllianceId: getAllianceId(initialSnapshot, root.subjectSeat),
        behaviorPolicyBySeat: Object.fromEntries(playerIds.map((id) => [
            String(id),
            (id === root.subjectSeat
                ? (arm === 'D1' ? 'H0' : 'C2-42_final@3000')
                : 'H0'),
        ])),
        otherSeatsBehaviorPolicy: root.otherSeatsBehaviorPolicy,
        behaviorRngContractId: RNG_CONTRACT_ID,
        behaviorCheckpointPath: arm === 'D2' ? opts.behaviorCheckpointPath : null,
        behaviorCheckpointSha256: arm === 'D2' ? opts.behaviorCheckpointSha256 : null,
        policyActionFilterId: POLICY_FILTER_ID,
        labelerVersion: L1_LABELER_VERSION,
        labelerQueriedDuringCollection: false,
        caps: { stepCapAtomicActions: opts.stepCap, wallMsPerRoot: opts.wallMs, smokeSteps: opts.smokeSteps },
        initialStateHash,
        initialState: initialSnapshot,
    });

    const actionPrefix: string[] = [];
    const startedAt = Date.now();
    let atomicSteps = 0;
    let subjectDecisions = 0;
    let stopReason = 'NATURAL';
    let behaviorError: string | null = null;
    const limit = opts.smokeSteps !== null ? Math.min(opts.smokeSteps, opts.stepCap) : opts.stepCap;

    // 数据契约 §2.2：rawActionStep / playerTransitions / subjectTurnsCompleted / fullRounds 必须单列，
    // 不能用含混的 depth/ply 代替。定义（写进采样层与 sampler_contract.md）：
    //   - playerTransitions：真实行动者（currentPlayer）发生变化的次数（含首次进入）；
    //   - subjectTurnsCompleted：主体座位**已完整走完**的玩家阶段数。主体正在行动时该值为
    //     已开始的阶段数减 1（当前阶段尚未结束）；
    //   - fullRounds：真实行动顺序中已有玩家重复出现时的轮次回绕次数（用 turnPlayerIds 的
    //     实际存活顺序，不用固定人数取模，因此淘汰会自然缩短一轮）。
    let playerTransitions = 0;
    let subjectPhasesStarted = 0;
    let fullRounds = 0;
    let prevCurrent: number | null = null;
    const roundPlayersSeen = new Set<number>();

    while (!engine.isTerminal() && atomicSteps < limit) {
        if (Date.now() - startedAt > opts.wallMs) { stopReason = 'WALL_TIMEOUT_MS'; break; }
        const state: GameState = engine.getState();
        const current = state.currentPlayer;
        const legal: Action[] = engine.getLegalActions(current);
        if (legal.length === 0) { stopReason = 'NO_LEGAL_ACTION'; break; }
        const allowed = legal.filter((a) => a.type !== 'surrender');
        if (allowed.length === 0) { stopReason = 'NO_POLICY_ALLOWED_ACTION'; break; }
        const allowedCodes = allowed.map(encodeAction);

        // 真实行动者切换计数（含首次进入）。
        if (current !== prevCurrent) {
            playerTransitions += 1;
            if (current === root.subjectSeat) subjectPhasesStarted += 1;
            if (roundPlayersSeen.has(current)) {
                fullRounds += 1;
                roundPlayersSeen.clear();
            }
            roundPlayersSeen.add(current);
            prevCurrent = current;
        }
        const subjectTurnsCompleted = subjectPhasesStarted > 0 ? subjectPhasesStarted - 1 : 0;

        let action: Action | null = null;
        let behaviorSource: string;
        if (current === root.subjectSeat && arm === 'D2') {
            behaviorSource = 'C2-42_final@3000';
            try {
                const r = predictSpatialAction(opts.predictor as SpatialResNetPredictor, state, current, allowed);
                action = r.action;
            } catch (err) {
                if (err instanceof EmptyActionSetError) { stopReason = 'STUDENT_EMPTY_ACTION_SET'; }
                else { stopReason = 'STUDENT_ERROR'; }
                behaviorError = err instanceof Error ? err.message : String(err);
                break;
            }
        } else {
            behaviorSource = 'H0';
            try {
                action = (seatAi.get(current) as HeuristicAI).getAction(engine, current, undefined) ?? null;
            } catch (err) {
                stopReason = 'BEHAVIOR_ERROR';
                behaviorError = err instanceof Error ? err.message : String(err);
                break;
            }
            if (!action) {
                stopReason = 'BEHAVIOR_ERROR';
                behaviorError = 'heuristic returned no action';
                break;
            }
        }
        const actionCode = encodeAction(action);
        if (!allowedCodes.includes(actionCode)) {
            stopReason = 'BEHAVIOR_ACTION_NOT_ALLOWED';
            behaviorError = `行为动作不在策略允许集内：${actionCode}`;
            break;
        }

        if (current === root.subjectSeat) {
            await write({
                kind: 'subject_decision',
                seq: subjectDecisions,
                stepIndex: atomicSteps,
                prefixLength: actionPrefix.length,
                stateHash: stateHashOf(state),
                turn: state.turn,
                actingPlayerId: current,
                subjectPlayerId: root.subjectSeat,
                subjectAllianceId: getAllianceId(state, root.subjectSeat),
                turnPlayerIds: getTurnPlayerIds(state),
                rawActionStep: atomicSteps,
                playerTransitions,
                subjectTurnsCompleted,
                fullRounds,
                engineLegalActionCodes: legal.map(encodeAction),
                policyAllowedActionCodes: allowedCodes,
                missingActionCodes: legal.map(encodeAction).filter((c) => !allowedCodes.includes(c)),
                behaviorSource,
                behaviorActionCode: actionCode,
                state,
            });
            subjectDecisions += 1;
        }

        actionPrefix.push(actionCode);
        try {
            engine.step(action);
        } catch (err) {
            stopReason = 'ENGINE_ERROR';
            behaviorError = err instanceof Error ? err.message : String(err);
            break;
        }
        atomicSteps += 1;
    }

    const finalState = engine.getState();
    const wallMsActual = Date.now() - startedAt;
    const summary = {
        kind: 'root_summary',
        schema: 'v15_dagger_root_summary_1',
        runId: opts.runId,
        arm,
        blockId: root.blockId,
        blockIndex: root.index,
        rootFamilyId: root.rootFamilyId,
        mapName: root.mapName,
        scenarioId: root.scenarioId,
        playerCount: root.playerCount,
        rootSeed: seed,
        subjectSeat: root.subjectSeat,
        subjectAllianceId: getAllianceId(initialSnapshot, root.subjectSeat),
        initialStateHash,
        finalStateHash: stateHashOf(finalState),
        atomicSteps,
        subjectDecisions,
        playerTransitions,
        subjectPhasesStarted,
        fullRounds,
        stopReason: engine.isTerminal() ? 'NATURAL' : stopReason,
        isNaturalTerminal: engine.isTerminal(),
        winnerRaw: finalState.winner === undefined ? null : finalState.winner,
        wallMs: wallMsActual,
        wallMsCap: opts.wallMs,
        stepCapAtomicActions: opts.stepCap,
        behaviorError,
        actionPrefix,
        actionPrefixSha256: crypto.createHash('sha256').update(actionPrefix.join('\n')).digest('hex'),
        behaviorCheckpointSha256: arm === 'D2' ? opts.behaviorCheckpointSha256 : null,
        labelerQueriedDuringCollection: false,
    };
    await write(summary);
    await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
    console.log(`[dagger] ${arm} ${root.blockId} seat=${root.subjectSeat} atomic=${atomicSteps} subjectDecisions=${subjectDecisions} stop=${summary.stopReason} ${wallMsActual}ms`);
    if (behaviorError) console.error(`[dagger] 行为/引擎错误 root=${root.rootFamilyId}: ${behaviorError}`);
    return summary;
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
