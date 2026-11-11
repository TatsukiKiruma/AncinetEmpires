/**
 * V17/T17-03：**B100 资格状态采集**（capture + stratified select）。
 *
 * 目标（任务书 T17-03 第 4 条 / 细则 B3）：
 *   从**当前规则的真实对局**里采到 ≥240 个不同决策状态（200 资格 + 40 pilot，互不重叠），
 *   覆盖五张固定图、两个座位、全部可采动作类型、pending 单位状态、开局/中盘/收官三个阶段，
 *   并包含「当前冠军输掉的局」里的状态。
 *
 * 做法（复用既有管线，不另造）：
 *   - `v14/tools/eval_v14_match.ts` 的 `playOne` + `onStep` + `captureStateOnStep:true`
 *     给出每步的完整**动作前状态 JSON**、引擎原生 allowed actionCode 列表与行动座位；
 *   - 环境来自 `createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE)`；
 *   - 冠军臂用 V16 冠军 `P1_final.json`（seat=0；V16 记录中 seat 0 的 10 局全为 NATURAL_LOSS）；
 *   - 网络输入身份用 `v17/tools/v17_input_identity.ts#policyInputKeyHexV17`
 *     （编码器为 `encodeGameStateSpatial` + `encodeCandidateActionSpatial(state, id, a, 'v2', 'v15_current')`，
 *      候选集 = 引擎原生合法集去掉 surrender，与 V16 数据集同一口径）。
 *
 * 用法（真实命令，见 teacher/configs/resolved_config.json）：
 *   采集（可分片并行）：
 *     node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_capture_states.ts --mode capture --jobs champion:m0:s0,mirror:m0:s0 ...
 *   分层选择：
 *     node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_capture_states.ts --mode select
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { UNPACK_DIR, SD_PLAN_FILE, playOne, type StepTraceV16 } from '../../v14/tools/eval_v14_match';
import { V16_DEFAULT_CAPS, V16_MAPS, scenarioIdOfMapV16 } from '../../v16/tools/eval_v16_protocol';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { SUPPORTED_ENCODER_SCHEMA_IDS } from '../../src/game/ai/spatial_tensor_encoder';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { b100PolicyInputKeySafe } from '../teachers/b100_input_key';
import { B100_TEACHER_VERSION } from '../teachers/b100_policy';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ROOT = path.resolve(arg('--run-root', 'v17/out/v17_20260926_r2') as string);
const STATES_DIR = path.join(RUN_ROOT, 'teacher', 'states');
const POOL_DIR = path.join(STATES_DIR, '_pool');
const MODE = arg('--mode', 'capture') as string;
/** `--scan`：只统计全轨迹动作类型，不保留状态 JSON（覆盖度证据，不扩池）。 */
const SCAN = flag('--scan');
/**
 * `--only-types a,b`：只保留 allowed 里含这些动作类型的决策状态（覆盖度补采）。
 *
 * 中文：常规采样用「稀有类型保底 + 哈希均匀采样」，稀有保底名额会被早期状态
 * （T1/T2 的 recruit_to_castle）用光，因此**极稀有**的 support / recruit_and_deploy
 * 可能在池子里缺席。补采用这个白名单过滤，不改动主采样口径。
 */
const ONLY_TYPES = (arg('--only-types', '') as string).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

/** DEV20 面板基础 seed（与 `V16_PANELS.dev` 一致）。 */
const DEV_BASE_SEED = 2609260100;
/** V16 冠军（P1 seed2026 final）。 */
const CHAMPION_PATH = arg('--champion', 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json') as string;

const REQUIRED_ACTION_TYPES = [
    'move', 'attack', 'capture', 'recruit_to_castle', 'recruit_and_deploy',
    'post_attack_move', 'heal', 'support', 'summon', 'destroy_town', 'repair',
    'wait', 'end_turn',
] as const;

/** 稀有机会动作类型：出现就优先保留，避免只采到普通 move/attack。 */
const RARE_ACTION_TYPES = new Set([
    'heal', 'support', 'summon', 'destroy_town', 'repair', 'post_attack_move',
    'recruit_and_deploy', 'recruit_to_castle',
]);

interface CapturedState {
    stateId: string;
    runKey: string;
    /** champion = 冠军臂对局；mirror = H0 对 H0。 */
    sourceArm: 'champion' | 'mirror';
    mapName: string;
    mapIndex: number;
    rootSeed: number;
    stepIndex: number;
    decisionSeat: number;
    byCandidate: boolean;
    turn: number;
    phaseBucket: 'opening' | 'midgame' | 'endgame';
    pendingUnitId: string | null;
    stateJson: string;
    stateHash: string;
    allowedActionCodes: string[];
    chosenActionCode: string;
    actionTypesInAllowed: string[];
    /** 重建引擎后重算的 allowed 与 trace 记录是否逐项相同。 */
    allowedMatchesTrace: boolean;
    /** 重建引擎时构造函数是否改动了状态（`ensureCurrentPlayerCanAct`）。 */
    constructorStateChanged: boolean;
    goldBySeat: Record<string, number>;
    unitCount: number;
    policyInputKey: string | null;
    /** 只有真的算出了网络输入 key 才是 policy-input-key。 */
    queryKeyKind: 'policy-input-key' | 'state-fallback';
    /** 该状态所属对局的自然结果（游戏结束后回填）。 */
    gameOutcomeKind: string | null;
    /** 该状态是否来自「当前冠军输掉的对局」。 */
    fromChampionLossGame: boolean | null;
    /** 该状态是否来自冠军本人（候选座位）的决策。 */
    fromChampionDecision: boolean;
}

interface RunMeta {
    runKey: string;
    sourceArm: 'champion' | 'mirror' | string;
    mapName: string;
    mapIndex: number;
    rootSeed: number;
    outcomeKind: string | null;
    steps: number;
    turns: number;
    wallMs: number;
    error: string | null;
    candidateSeat: number | null;
    fallbackUsed: boolean | null;
    capturedKept: number;
}

function parseJob(job: string): { arm: string; mapIndex: number; seedIndex: number } {
    const [arm, mRaw, sRaw] = job.split(':');
    const mapIndex = Number(String(mRaw).replace(/^m/, ''));
    const seedIndex = Number(String(sRaw).replace(/^s/, ''));
    if (!['champion', 'mirror'].includes(arm) || !Number.isInteger(mapIndex) || !Number.isInteger(seedIndex)) {
        throw new Error(`[B100-capture] 非法 job '${job}'（要求 arm:m<idx>:s<idx>，arm ∈ champion|mirror）。`);
    }
    if (mapIndex < 0 || mapIndex >= V16_MAPS.length) {
        throw new Error(`[B100-capture] job '${job}' 的 mapIndex 越界（0..${V16_MAPS.length - 1}）。`);
    }
    return { arm, mapIndex, seedIndex };
}

function phaseOf(turn: number): 'opening' | 'midgame' | 'endgame' {
    if (turn <= 8) return 'opening';
    if (turn <= 30) return 'midgame';
    return 'endgame';
}

function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readPoolRecords(): CapturedState[] {
    if (!fs.existsSync(POOL_DIR)) return [];
    const out: CapturedState[] = [];
    for (const name of fs.readdirSync(POOL_DIR).sort()) {
        if (!name.endsWith('.jsonl')) continue;
        if (name.startsWith('_')) continue; // `_runs.jsonl` 是元数据，不是状态记录
        const text = fs.readFileSync(path.join(POOL_DIR, name), 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const t = line.trim();
            if (t) out.push(JSON.parse(t) as CapturedState);
        }
    }
    return out;
}

function readPoolMeta(): RunMeta[] {
    const p = path.join(POOL_DIR, '_runs.jsonl');
    if (!fs.existsSync(p)) return [];
    const out: RunMeta[] = [];
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t) out.push(JSON.parse(t) as RunMeta);
    }
    return out;
}

/* ==========================================================================
 * 采集
 * ========================================================================== */

async function runCapture(): Promise<void> {
    const jobsArg = arg('--jobs', '') as string;
    const jobs = jobsArg.split(',').map((s) => s.trim()).filter((s) => s.length > 0).map(parseJob);
    if (jobs.length === 0) throw new Error('[B100-capture] --mode capture 需要 --jobs arm:m<idx>:s<idx>[,...]。');
    const sampleRate = Number(arg('--sample-rate', '0.012'));
    const maxPerRun = Number(arg('--max-per-run', '150'));
    const rareMax = Number(arg('--rare-max', '16'));
    const maxSteps = Number(arg('--max-steps', String(V16_DEFAULT_CAPS.maxStepsAtomicActions)));
    const wallMs = Number(arg('--wall-ms', String(V16_DEFAULT_CAPS.wallTimeoutMs)));
    const resume = arg('--resume', 'true') !== 'false';

    fs.mkdirSync(POOL_DIR, { recursive: true });

    let predictor: SpatialResNetPredictor | null = null;
    let championSha: string | null = null;
    let championSchema: string | null = null;
    const needsChampion = jobs.some((j) => j.arm === 'champion');
    if (needsChampion) {
        const abs = path.resolve(CHAMPION_PATH);
        if (!fs.existsSync(abs)) throw new Error(`[B100-capture] 冠军检查点不存在：${abs}`);
        const json = fs.readFileSync(abs, 'utf8');
        const parsed = JSON.parse(json) as { encoderSchemaId?: string };
        const declared = parsed.encoderSchemaId ?? null;
        const expected = declared !== null && (SUPPORTED_ENCODER_SCHEMA_IDS as readonly string[]).includes(declared)
            ? declared
            : null;
        const weights = loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: expected });
        predictor = new SpatialResNetPredictor(weights);
        championSha = sha256Hex(json);
        championSchema = predictor.encoderSchemaId;
        console.log(`[B100-capture] champion=${path.basename(abs)} schema=${championSchema} sha256=${championSha.slice(0, 16)}…`);
    }

    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    for (const job of jobs) {
        const runKey = `${job.arm}:m${job.mapIndex}:s${job.seedIndex}`;
        const fileName = SCAN
            ? `_scan_${job.arm}_m${job.mapIndex}_s${job.seedIndex}.jsonl`
            : ONLY_TYPES.length > 0
                ? `topup_${job.arm}_m${job.mapIndex}_s${job.seedIndex}.jsonl`
                : `${job.arm}_m${job.mapIndex}_s${job.seedIndex}.jsonl`;
        const outPath = path.join(POOL_DIR, fileName);
        if (resume && fs.existsSync(outPath)) {
            console.log(`[B100-capture] 跳过已完成 ${runKey}`);
            continue;
        }
        const mapName = V16_MAPS[job.mapIndex];
        const seed = DEV_BASE_SEED + 10 * job.mapIndex + job.seedIndex;
        const scenarioId = scenarioIdOfMapV16(mapName);
        const candidateSeat = job.arm === 'champion' ? 0 : null;
        if (SCAN) {
            // 全轨迹动作类型扫描（不保留状态 JSON，因此跑得接近正常对局速度）。
            // 注意：captureStateOnStep=false 时**动作前** trace 的 stateBeforeJson 也是 null，
            // 因此用 `legalActionCodes.length > 0` 区分「动作前」与「动作后」两条 trace。
            const typeInAllowed: Record<string, number> = {};
            const typeChosen: Record<string, number> = {};
            let steps = 0;
            const preStep = (t: StepTraceV16): void => {
                if (t.legalActionCodes.length === 0) return;
                steps += 1;
                for (const c of t.legalActionCodes) {
                    const ty = c.split(':')[0];
                    typeInAllowed[ty] = (typeInAllowed[ty] ?? 0) + 1;
                }
                if (t.actionCode) {
                    const ty = t.actionCode.split(':')[0];
                    typeChosen[ty] = (typeChosen[ty] ?? 0) + 1;
                }
            };
            const record = await playOne({
                runId: 'v17_20260926_r2', scenarioId, seed, candidateSeat, viewedSeatHint: candidateSeat,
                maxSteps, maxPlies: V16_DEFAULT_CAPS.maxPlies, wallTimeoutMs: wallMs,
                predictor: job.arm === 'champion' ? predictor : null,
                checkpointSha256: job.arm === 'champion' ? championSha : null,
                requestedPolicyId: job.arm === 'champion' ? `spatial_candidate:${path.basename(CHAMPION_PATH)}` : 'heuristic',
                envFactory,
                onStep: (t) => { preStep(t); },
                captureStateOnStep: false,
            });
            const row = {
                runKey, sourceArm: job.arm, mapName, mapIndex: job.mapIndex, rootSeed: seed,
                outcomeKind: record.outcomeKind, steps: record.steps, turns: record.turns,
                wallMs: record.wallMs, error: record.error, fallbackUsed: record.fallbackUsed,
                tracedSteps: steps, typeInAllowed, typeChosen,
            };
            fs.appendFileSync(outPath, `${JSON.stringify(row)}\n`, 'utf8');
            console.log(`[B100-scan] ${runKey} ${record.outcomeKind} steps=${record.steps} types=${Object.keys(typeInAllowed).sort().join(',')} ${(record.wallMs / 1000).toFixed(1)}s`);
            continue;
        }
        const kept: CapturedState[] = [];
        let rareKept = 0;
        let sampledKept = 0;
        let seen = 0;

        const onStep = (t: StepTraceV16): void => {
            if (t.stateBeforeJson === null) return; // 只处理动作前 trace
            seen += 1;
            if (kept.length >= maxPerRun) return;
            const stateJson = t.stateBeforeJson;
            const allowedCodes = t.legalActionCodes;
            if (allowedCodes.length === 0) return;
            const types = Array.from(new Set(allowedCodes.map((c) => c.split(':')[0])));
            const hasRare = types.some((x) => RARE_ACTION_TYPES.has(x));
            const hasPending = stateJson.includes('"pendingUnitId":"');
            // 确定性哈希采样：在整局时间轴上均匀取样（不是只采开局），
            // 稀有动作类型 / pending 状态另有保底名额。
            const u = Number.parseInt(sha256Hex(`${runKey}|${t.stepIndex}`).slice(0, 8), 16) / 0x100000000;
            let accept = false;
            if (ONLY_TYPES.length > 0) {
                accept = types.some((x) => ONLY_TYPES.includes(x));
                if (accept) sampledKept += 1;
            } else if ((hasRare || hasPending) && rareKept < rareMax) {
                rareKept += 1;
                accept = true;
            } else if (u < sampleRate) {
                sampledKept += 1;
                accept = true;
            }
            if (!accept) return;

            // ---- 只有被保留的状态才做重活（parse / 引擎重建 / 编码）----
            const turnMatch = /"turn":(\d+)/.exec(stateJson);
            const turn = turnMatch ? Number(turnMatch[1]) : -1;
            const parsedState = JSON.parse(stateJson) as GameState & { pendingUnitId?: string | null };
            const engine = new GameEngine(JSON.parse(stateJson) as GameState);
            const reconstructedChanged = JSON.stringify(engine.getState()) !== stateJson;
            let allowed: Action[] = [];
            let allowedMatchesTrace = false;
            try {
                allowed = engine.getLegalActions(t.playerId).filter((a) => a.type !== 'surrender');
                const rebuilt = allowed.map((a) => encodeAction(a));
                allowedMatchesTrace = rebuilt.length === allowedCodes.length
                    && rebuilt.every((c, i) => c === allowedCodes[i]);
            } catch (error) {
                console.warn(`[B100-capture] ${runKey} step=${t.stepIndex} 重建 allowed 失败：${(error as Error).message}`);
            }
            if (allowed.length === 0) return;

            let policyInputKey: string | null = null;
            const keyResult = b100PolicyInputKeySafe(parsedState, t.playerId, allowed);
            if (keyResult.key === null) {
                console.warn(`[B100-capture] ${runKey} step=${t.stepIndex} 编码失败（标记 state-fallback）：${keyResult.error}`);
            }
            policyInputKey = keyResult.key;

            const goldBySeat: Record<string, number> = {};
            for (const p of parsedState.players ?? []) goldBySeat[String(p.id)] = p.gold;
            kept.push({
                stateId: `${runKey}#${t.stepIndex}`,
                runKey,
                sourceArm: job.arm as 'champion' | 'mirror',
                mapName,
                mapIndex: job.mapIndex,
                rootSeed: seed,
                stepIndex: t.stepIndex,
                decisionSeat: t.playerId,
                byCandidate: t.byCandidate,
                turn: turn >= 0 ? turn : parsedState.turn,
                phaseBucket: phaseOf(turn >= 0 ? turn : parsedState.turn),
                pendingUnitId: (parsedState.pendingUnitId ?? null) as string | null,
                stateJson,
                stateHash: sha256Hex(stateJson),
                allowedActionCodes: allowedCodes,
                chosenActionCode: t.actionCode,
                actionTypesInAllowed: Array.from(new Set(allowedCodes.map((c) => c.split(':')[0]))).sort(),
                allowedMatchesTrace,
                constructorStateChanged: reconstructedChanged,
                goldBySeat,
                unitCount: (parsedState.units ?? []).length,
                policyInputKey,
                queryKeyKind: policyInputKey === null ? 'state-fallback' : 'policy-input-key',
                gameOutcomeKind: null,
                fromChampionLossGame: null,
                fromChampionDecision: job.arm === 'champion' && t.playerId === 0,
            });
        };

        const record = await playOne({
            runId: 'v17_20260926_r2',
            scenarioId,
            seed,
            candidateSeat,
            viewedSeatHint: candidateSeat,
            maxSteps,
            maxPlies: V16_DEFAULT_CAPS.maxPlies,
            wallTimeoutMs: wallMs,
            predictor: job.arm === 'champion' ? predictor : null,
            checkpointSha256: job.arm === 'champion' ? championSha : null,
            requestedPolicyId: job.arm === 'champion' ? `spatial_candidate:${path.basename(CHAMPION_PATH)}` : 'heuristic',
            envFactory,
            onStep,
            captureStateOnStep: true,
        });

        const championLoss = job.arm === 'champion' ? record.outcomeKind === 'NATURAL_LOSS' : null;
        for (const s of kept) {
            s.gameOutcomeKind = record.outcomeKind;
            s.fromChampionLossGame = championLoss;
        }
        const ws = fs.createWriteStream(outPath, { flags: 'w' });
        for (const s of kept) ws.write(`${JSON.stringify(s)}\n`);
        await new Promise<void>((resolve) => ws.end(resolve));

        const meta: RunMeta = {
            runKey,
            sourceArm: job.arm,
            mapName,
            mapIndex: job.mapIndex,
            rootSeed: seed,
            outcomeKind: record.outcomeKind,
            steps: record.steps,
            turns: record.turns,
            wallMs: record.wallMs,
            error: record.error,
            candidateSeat,
            fallbackUsed: record.fallbackUsed,
            capturedKept: kept.length,
        };
        fs.appendFileSync(path.join(POOL_DIR, '_runs.jsonl'), `${JSON.stringify(meta)}\n`, 'utf8');
        console.log(
            `[B100-capture] ${runKey} ${record.outcomeKind} steps=${record.steps} turns=${record.turns} `
            + `traced=${seen} kept=${kept.length} (rare=${rareKept} sampled=${sampledKept}) ${(record.wallMs / 1000).toFixed(1)}s`,
        );
    }
}

/* ==========================================================================
 * 分层选择
 * ========================================================================== */

interface SelectOptions {
    total: number;
    pilotCount: number;
}

function selectStates(pool: CapturedState[], opts: SelectOptions): {
    pilot: CapturedState[];
    qualify: CapturedState[];
    stats: Record<string, unknown>;
} {
    // 1) 按 stateHash 去重（同 hash 视为同一决策状态；同一状态在冠军局与镜像局各出现一次时只留一条）。
    const byHash = new Map<string, CapturedState>();
    const duplicates: Array<{ stateHash: string; kept: string; dropped: string }> = [];
    for (const s of pool) {
        const prev = byHash.get(s.stateHash);
        if (!prev) { byHash.set(s.stateHash, s); continue; }
        duplicates.push({ stateHash: s.stateHash, kept: prev.stateId, dropped: s.stateId });
        // 优先保留「冠军输局」来源，其次冠军决策来源。
        const better = (s.fromChampionLossGame === true && prev.fromChampionLossGame !== true)
            || (s.fromChampionDecision && !prev.fromChampionDecision && s.fromChampionLossGame === prev.fromChampionLossGame);
        if (better) byHash.set(s.stateHash, s);
    }
    const unique = Array.from(byHash.values());

    // 2) 分层 key = map × seat × phase。
    const strata = new Map<string, CapturedState[]>();
    for (const s of unique) {
        const key = `${s.mapIndex}|${s.decisionSeat}|${s.phaseBucket}`;
        const list = strata.get(key) ?? [];
        list.push(s);
        strata.set(key, list);
    }
    const hashRank = (s: CapturedState): string => sha256Hex(`b100-select|${s.stateId}`).slice(0, 16);
    for (const list of strata.values()) {
        list.sort((a, b) => {
            const rareA = a.actionTypesInAllowed.filter((t) => RARE_ACTION_TYPES.has(t)).length;
            const rareB = b.actionTypesInAllowed.filter((t) => RARE_ACTION_TYPES.has(t)).length;
            if (rareA !== rareB) return rareB - rareA;
            const pendA = a.pendingUnitId ? 1 : 0;
            const pendB = b.pendingUnitId ? 1 : 0;
            if (pendA !== pendB) return pendB - pendA;
            const champA = a.fromChampionLossGame === true ? 1 : 0;
            const champB = b.fromChampionLossGame === true ? 1 : 0;
            if (champA !== champB) return champB - champA;
            return hashRank(a) < hashRank(b) ? -1 : 1;
        });
    }

    // 3) 轮转取样：每轮从每个 stratum 取一个，直到集满 total。
    const stratumKeys = Array.from(strata.keys()).sort();
    const cursor = new Map<string, number>(stratumKeys.map((k) => [k, 0]));
    const picked: CapturedState[] = [];
    let exhausted = false;
    while (picked.length < opts.total && !exhausted) {
        exhausted = true;
        for (const key of stratumKeys) {
            if (picked.length >= opts.total) break;
            const list = strata.get(key) as CapturedState[];
            const i = cursor.get(key) as number;
            if (i >= list.length) continue;
            cursor.set(key, i + 1);
            picked.push(list[i]);
            exhausted = false;
        }
    }

    // 4) 动作类型覆盖补强：任一必需类型在 240 里没有出现（allowed 里没有），
    //    就从池子里换入含该类型的状态（优先替换掉同类型重复度最高的 stratum 成员）。
    const coverageOf = (set: CapturedState[]): Set<string> => {
        const covered = new Set<string>();
        for (const s of set) for (const t of s.actionTypesInAllowed) covered.add(t);
        return covered;
    };
    const swaps: Array<{ type: string; dropped: string; added: string }> = [];
    for (const type of REQUIRED_ACTION_TYPES) {
        if (coverageOf(picked).has(type)) continue;
        const pickedIds = new Set(picked.map((s) => s.stateId));
        const candidate = unique
            .filter((s) => !pickedIds.has(s.stateId) && s.actionTypesInAllowed.includes(type))
            .sort((a, b) => (hashRank(a) < hashRank(b) ? -1 : 1))[0];
        if (!candidate) continue;
        // 丢掉一个该类型缺席且 stratum 成员最多的状态。
        const counts = new Map<string, number>();
        for (const s of picked) {
            const k = `${s.mapIndex}|${s.decisionSeat}|${s.phaseBucket}`;
            counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const victim = [...picked].sort((a, b) => {
            const ka = `${a.mapIndex}|${a.decisionSeat}|${a.phaseBucket}`;
            const kb = `${b.mapIndex}|${b.decisionSeat}|${b.phaseBucket}`;
            const ca = counts.get(ka) as number;
            const cb = counts.get(kb) as number;
            if (ca !== cb) return cb - ca;
            return hashRank(a) < hashRank(b) ? -1 : 1;
        })[0];
        const idx = picked.indexOf(victim);
        picked[idx] = candidate;
        swaps.push({ type, dropped: victim.stateId, added: candidate.stateId });
    }

    // 5) 交替分配：每 6 个里第 1 个进 pilot（→ 40 个），其余进资格集（→ 200 个）。
    const pilot: CapturedState[] = [];
    const qualify: CapturedState[] = [];
    picked.forEach((s, i) => {
        if (i % 6 === 0 && pilot.length < opts.pilotCount) pilot.push(s);
        else qualify.push(s);
    });
    // 若交替分配没凑满 pilot，从资格集尾部补。
    while (pilot.length < opts.pilotCount && qualify.length > 0) pilot.push(qualify.pop() as CapturedState);

    const all = [...pilot, ...qualify];
    const coveredTypes = Array.from(coverageOf(all)).sort();
    const missingTypes = REQUIRED_ACTION_TYPES.filter((t) => !coveredTypes.includes(t));
    const chosenTypes = new Set(all.map((s) => s.chosenActionCode.split(':')[0]));

    const tally = <T extends string | number>(values: T[]): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const v of values) out[String(v)] = (out[String(v)] ?? 0) + 1;
        return out;
    };

    const stats: Record<string, unknown> = {
        poolRecords: pool.length,
        uniqueByStateHash: unique.length,
        duplicateStateHashRows: duplicates.length,
        duplicateExamples: duplicates.slice(0, 5),
        selectedTotal: all.length,
        pilotCount: pilot.length,
        qualifyCount: qualify.length,
        distinctStateHashSelected: new Set(all.map((s) => s.stateHash)).size,
        distinctPolicyInputKeySelected: new Set(all.filter((s) => s.policyInputKey).map((s) => s.policyInputKey)).size,
        statesWithPolicyInputKey: all.filter((s) => s.queryKeyKind === 'policy-input-key').length,
        statesWithStateFallback: all.filter((s) => s.queryKeyKind === 'state-fallback').length,
        byMap: tally(all.map((s) => s.mapName)),
        bySeat: tally(all.map((s) => s.decisionSeat)),
        byPhase: tally(all.map((s) => s.phaseBucket)),
        bySourceArm: tally(all.map((s) => s.sourceArm)),
        byMapSeatPhase: tally(all.map((s) => `m${s.mapIndex}|seat${s.decisionSeat}|${s.phaseBucket}`)),
        pendingStates: all.filter((s) => s.pendingUnitId !== null).length,
        pendingStatesPilot: pilot.filter((s) => s.pendingUnitId !== null).length,
        pendingStatesQualify: qualify.filter((s) => s.pendingUnitId !== null).length,
        fromChampionLossGame: all.filter((s) => s.fromChampionLossGame === true).length,
        fromChampionDecision: all.filter((s) => s.fromChampionDecision).length,
        fromMirrorGames: all.filter((s) => s.sourceArm === 'mirror').length,
        allowedMatchesTraceAll: all.every((s) => s.allowedMatchesTrace),
        allowedMismatchCount: all.filter((s) => !s.allowedMatchesTrace).length,
        constructorStateChangedCount: all.filter((s) => s.constructorStateChanged).length,
        actionTypesCoveredInAllowed: coveredTypes,
        actionTypesMissingFromAllowed: missingTypes,
        actionTypesChosenInGame: Array.from(chosenTypes).sort(),
        requiredActionTypes: Array.from(REQUIRED_ACTION_TYPES),
        coverageSwaps: swaps,
        turnRange: all.length ? [Math.min(...all.map((s) => s.turn)), Math.max(...all.map((s) => s.turn))] : null,
        allowedCountRange: all.length
            ? [Math.min(...all.map((s) => s.allowedActionCodes.length)), Math.max(...all.map((s) => s.allowedActionCodes.length))]
            : null,
    };
    return { pilot, qualify, stats };
}

function runSelect(): void {
    const total = Number(arg('--total', '240'));
    const pilotCount = Number(arg('--pilot', '40'));
    const pool = readPoolRecords();
    const runs = readPoolMeta();
    if (pool.length === 0) throw new Error(`[B100-capture] 池子为空（${POOL_DIR}）。先跑 --mode capture。`);
    if (pool.length < total) {
        console.warn(`[B100-capture] ⚠ 池子只有 ${pool.length} 条 < 目标 ${total}；按要求如实报告不足。`);
    }
    const { pilot, qualify, stats } = selectStates(pool, { total, pilotCount });

    fs.mkdirSync(STATES_DIR, { recursive: true });
    const write = (p: string, rows: CapturedState[]): string => {
        const ws = fs.createWriteStream(p, { flags: 'w' });
        for (const r of rows) ws.write(`${JSON.stringify(r)}\n`);
        ws.end();
        return p;
    };
    const pilotPath = write(path.join(STATES_DIR, 'pilot40.jsonl'), pilot);
    const qualifyPath = write(path.join(STATES_DIR, 'qualify200.jsonl'), qualify);

    const index = {
        schema: 'v17_b100_states_index_1',
        generatedAt: new Date().toISOString(),
        teacherVersion: B100_TEACHER_VERSION,
        runRoot: RUN_ROOT.replace(/\\/g, '/'),
        maps: V16_MAPS,
        devBaseSeed: DEV_BASE_SEED,
        selection: {
            rule: 'dedupe by sha256(stateJson) → stratum = mapIndex|seat|phase → round-robin pick '
                + '→ rare/pending/champion-loss preference inside stratum → action-type coverage swap '
                + '→ alternate 1-in-6 to pilot',
            total,
            pilotCount,
            actionTypePreference: Array.from(RARE_ACTION_TYPES).sort(),
        },
        files: {
            pilot40: pilotPath.replace(/\\/g, '/'),
            qualify200: qualifyPath.replace(/\\/g, '/'),
            poolDir: POOL_DIR.replace(/\\/g, '/'),
        },
        runs: runs.sort((a, b) => (a.runKey < b.runKey ? -1 : 1)),
        runCount: runs.length,
        championLossRuns: runs.filter((r) => r.outcomeKind === 'NATURAL_LOSS' && r.sourceArm === 'champion').length,
        championWinRuns: runs.filter((r) => r.outcomeKind === 'NATURAL_WIN' && r.sourceArm === 'champion').length,
        stats,
    };
    fs.writeFileSync(path.join(STATES_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    console.log(`[B100-select] pool=${pool.length} unique=${stats.uniqueByStateHash} pilot=${pilot.length} qualify=${qualify.length}`);
    console.log(`[B100-select] missingActionTypes=${JSON.stringify(stats.actionTypesMissingFromAllowed)}`);
    console.log(`[B100-select] -> ${pilotPath}`);
    console.log(`[B100-select] -> ${qualifyPath}`);
    console.log(`[B100-select] -> ${path.join(STATES_DIR, 'index.json')}`);
}

async function main(): Promise<void> {
    if (MODE === 'capture') {
        await runCapture();
        return;
    }
    if (MODE === 'select') {
        runSelect();
        return;
    }
    if (MODE === 'probe') {
        const pool = readPoolRecords();
        const sizes = pool.map((s) => s.stateJson.length).sort((a, b) => a - b);
        console.log(JSON.stringify({
            records: pool.length,
            stateJsonBytes: sizes.length ? { min: sizes[0], p50: sizes[Math.floor(sizes.length / 2)], max: sizes[sizes.length - 1] } : null,
            policyInputKey: pool.filter((s) => s.policyInputKey !== null).length,
            allowedMatchesTrace: pool.filter((s) => s.allowedMatchesTrace).length,
        }, null, 2));
        if (flag('--head')) console.log(pool[0]?.stateJson.slice(0, 400));
        return;
    }
    throw new Error(`[B100-capture] 未知 --mode '${MODE}'（capture | select | probe）。`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
