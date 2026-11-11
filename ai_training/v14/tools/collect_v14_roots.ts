/**
 * V14/T14-02：从真实引擎采集原生启发式轨迹，并保存完整引擎快照。
 *
 * 与 V13 的关键区别：
 * 1. 每条决策都保存 `engine.getState()` 的真实快照（stateFidelity=EXACT_SNAPSHOT），
 *    而不是从 Observation 反推；后续编码只读这份快照。
 * 2. 参与者身份、root 家族、seed、map、规则指纹、合法动作集都在采集时记录。
 * 3. 采集阶段不做任何候选裁剪、不读取教师标签来构造输入。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/collect_v14_roots.ts \
 *     --config v14/configs/collect_v14_roots.json --out-dir v14/out/<runId>/T14-02/raw \
 *     [--partitions train,val] [--max-roots 4] [--step-cap 3000] [--decisions-per-root 200]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSdTrainingPlanConfig } from '../../tools/sd_training_state_generator';
import { HeuristicAI } from '../../src/game/ai/heuristic_ai';
import { encodeAction } from '../../src/game/env';
import { getAllianceId, getRuleConfig, getTurnPlayerIds } from '../../src/game/rule_config';
import type { Action, GameState } from '../../src/game/types';

const UNPACK_DIR = 'APK/_analysis/unpack';
const SD_PLAN_FILE = 'training_configs/sd_training_plan_20260705.json';
const SCENARIO_PREFIX = 'SDPLAN';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface RootSpec { mapName: string; episodeIndex: number }
interface CollectConfig {
    schema: string;
    planId: string;
    seedBase: number;
    maxPlies: number;
    behaviorPolicyId: string;
    labelTeacherId: string;
    labelTeacherVersion: string;
    partitionSeedOffset: Record<string, number>;
    budget: { stepCap: number; wallMsPerRoot: number; decisionsPerRootCap: number };
    partitions: Record<string, RootSpec[]>;
}

/** 与 v13/tools/eval_paired_v3.ts 相同的每座位独立确定性随机流。 */
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

/** 规则指纹：只覆盖影响引擎判定的规则与地图尺寸，不含运行时计数。 */
function rulesFingerprint(state: GameState): string {
    const rules = getRuleConfig(state) as unknown as Record<string, unknown>;
    return sha256(stableStringify({ rules, map: { width: state.map.width, height: state.map.height } }));
}

function mapFingerprint(state: GameState): string {
    const tiles = state.map.tiles.map((row) => row.map((t) => `${t.terrainId}:${t.ownerId ?? '-'}`).join(','));
    return sha256(tiles.join('|'));
}
 
/** 只含地形 ID 的地图布局指纹：与运行时归属变化无关，用于跨 root 识别同一张地图。 */
function mapLayoutFingerprint(state: GameState): string {
    const tiles = state.map.tiles.map((row) => row.map((t) => String(t.terrainId)).join(','));
    return sha256(tiles.join('|'));
}

function stateHash(state: GameState): string {
    return sha256(stableStringify(state));
}

/** 轻量局面指纹：只覆盖影响“是否有事可做”的字段，用于停滞检测与重复局面识别。 */
function progressFingerprint(state: GameState): string {
    const units = state.units
        .filter((u) => u.hp > 0)
        .map((u) => [u.id, u.ownerId, u.pos.x, u.pos.y, u.hp, u.hasActed ? 1 : 0, u.hasMoved ? 1 : 0].join(":"))
        .sort()
        .join(";");
    const owners = state.map.tiles.map((row) => row.map((t) => t.ownerId ?? "-").join(",")).join("|");
    const gold = state.players.map((p) => p.gold).join(",");
    const alive = state.players.map((p) => (p.isAlive ? 1 : 0)).join(",");
    return sha256(`${state.turn}#${units}#${owners}#${gold}#${alive}`);
}

/** 策略允许集合：引擎合法集去掉 surrender；两者都单独保留以便审计。 */
function policyAllowed(legal: Action[]): { allowed: Action[]; filtered: string[] } {
    const allowed: Action[] = [];
    const filtered: string[] = [];
    for (const action of legal) {
        if (action.type === 'surrender') { filtered.push(encodeAction(action)); continue; }
        allowed.push(action);
    }
    return { allowed, filtered };
}

/** 按阶段均匀抽取，避免只保留中间候选最多的状态。 */
function spreadIndices(total: number, cap: number): number[] {
    if (total <= cap) return Array.from({ length: total }, (_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < cap; i += 1) out.push(Math.round((i * (total - 1)) / (cap - 1)));
    return [...new Set(out)].sort((a, b) => a - b);
}

interface RawDecision {
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

async function collectRoot(opts: {
    runId: string;
    partition: string;
    spec: RootSpec;
    config: CollectConfig;
    stepCap: number;
    decisionsPerRootCap: number;
    envFactory: any;
    plan: any;
}): Promise<{ rootRecord: any; decisions: RawDecision[] }> {
    const { spec, config, envFactory, plan } = opts;
    // 中文：seed 与 root id 采用与 buildSdTrainingJobs 相同的语义，但 seedBase 属本轮。
    const partitionOffset = config.partitionSeedOffset?.[opts.partition] ?? 0;
    const seed = config.seedBase + partitionOffset + spec.episodeIndex;
    const rootFamilyId = `${SCENARIO_PREFIX}:${config.planId}:${spec.mapName}#${seed}#${spec.episodeIndex}`;
    const scenarioId = `${SCENARIO_PREFIX}:${config.planId}:${spec.mapName}`;
    const episode = {
        kind: 'skirmish_episode', version: 1,
        scenario: { id: scenarioId, mode: 'SD', mapName: spec.mapName, resourcePath: '' },
        seed, maxPlies: config.maxPlies, maxSteps: opts.stepCap,
        initialObservationHash: '', initialLegalActionCount: 0, fixedActionSpaceSize: 0,
        players: [], policyByPlayer: {}, steps: [], summary: {},
    } as any;

    const env = await envFactory.createEnv(episode);
    env.reset(seed);
    const engine = env.getEngine();
    const initialSnapshot = engine.getState();
    const initialRulesFingerprint = rulesFingerprint(initialSnapshot);
    const initialMapFingerprint = mapFingerprint(initialSnapshot);

    const playerIds: number[] = initialSnapshot.players.map((p: any) => p.id).sort((a: number, b: number) => a - b);
    const seatAi = new Map<number, HeuristicAI>();
    for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));

    const decisions: RawDecision[] = [];
    const actionPrefix: string[] = [];
    const startedAt = Date.now();
    let steps = 0;
    let stopReason = 'NATURAL';
    let engineError: string | null = null;
    let policyError: string | null = null;
    let filteredSurrender = 0;
    // V14：停滞检测。双方都无有意义动作时引擎会一直空转 end_turn 直到 step 上限；
    // 这种局面既不是自然终局，也不是有价值的训练数据，必须显式分类。
    let roundFingerprint = '';
    let roundPlayersSeen = new Set<number>();
    let sameFingerprintPlayers = new Set<number>();
    let sameFingerprintRounds = 0;
    let noMeaningfulPlayers = new Set<number>();
    let noMeaningfulRounds = 0;

    while (!engine.isTerminal() && steps < opts.stepCap) {
        if (Date.now() - startedAt > config.budget.wallMsPerRoot) { stopReason = 'WALL_TIMEOUT'; break; }
        const state = engine.getState();
        const current = state.currentPlayer;
        const legal = engine.getLegalActions(current).slice();
        if (legal.length === 0) { stopReason = 'NO_LEGAL_ACTION'; break; }
        const fingerprint = progressFingerprint(state);
        if (roundPlayersSeen.size === 0) roundFingerprint = fingerprint;
        roundPlayersSeen.add(current);
        if (fingerprint === roundFingerprint) sameFingerprintPlayers.add(current);
        if (!legal.some((a) => a.type !== 'end_turn' && a.type !== 'surrender')) noMeaningfulPlayers.add(current);
        if (roundPlayersSeen.size >= playerIds.length) {
            sameFingerprintRounds = sameFingerprintPlayers.size >= playerIds.length ? sameFingerprintRounds + 1 : 0;
            noMeaningfulRounds = noMeaningfulPlayers.size >= playerIds.length ? noMeaningfulRounds + 1 : 0;
            roundPlayersSeen = new Set<number>();
            sameFingerprintPlayers = new Set<number>();
            noMeaningfulPlayers = new Set<number>();
            roundFingerprint = '';
            if (sameFingerprintRounds >= 3) { stopReason = 'STALLED_STATE'; break; }
            if (noMeaningfulRounds >= 3) { stopReason = 'STALLED_NO_MEANINGFUL_ACTION'; break; }
        }
        const { allowed, filtered } = policyAllowed(legal);
        filteredSurrender += filtered.length;
        if (allowed.length === 0) { stopReason = 'NO_POLICY_ALLOWED_ACTION'; break; }

        let action: Action | null = null;
        try {
            action = (seatAi.get(current) as HeuristicAI).getAction(engine, current, undefined) ?? null;
        } catch (err) {
            policyError = err instanceof Error ? err.message : String(err);
            break;
        }
        if (!action) { policyError = 'heuristic returned no action'; break; }
        const labelCode = encodeAction(action);
        if (!allowed.some((a) => encodeAction(a) === labelCode)) {
            policyError = `label not in policy-allowed candidates: ${labelCode}`;
            break;
        }

        decisions.push({
            stepIndex: steps,
            turn: state.turn,
            currentPlayer: current,
            turnPlayerIds: getTurnPlayerIds(state),
            legalActionCodes: legal.map(encodeAction),
            policyAllowedActionCodes: allowed.map(encodeAction),
            filteredActionCodes: filtered,
            labelActionCode: labelCode,
            stateHash: stateHash(state),
            state,
        });
        actionPrefix.push(labelCode);

        try {
            // 中文：直接走 GameEngine.step，保证经过引擎自身的合法性校验与回合结算。
            engine.step(action);
        } catch (err) {
            engineError = err instanceof Error ? err.message : String(err);
            break;
        }
        steps += 1;
    }

    const finalState = engine.getState();
    const winnerRaw = finalState.winner;
    const winnerAllianceId = winnerRaw === null ? null : winnerRaw;
    const rootRecord = {
        rootFamilyId,
        partition: opts.partition,
        scenarioId,
        mapName: spec.mapName,
        episodeIndex: spec.episodeIndex,
        seed,
        planId: config.planId,
        playerCount: playerIds.length,
        playerIds,
        seatAlliances: Object.fromEntries(playerIds.map((id) => [String(id), getAllianceId(initialSnapshot, id)])),
        maxPlies: config.maxPlies,
        stepCap: opts.stepCap,
        steps,
        decisionsRecorded: decisions.length,
        filteredSurrenderActions: filteredSurrender,
        stopReason: engine.isTerminal() ? 'NATURAL' : stopReason,
        winnerRaw,
        winnerAllianceId,
        isNaturalTerminal: engine.isTerminal(),
        engineError,
        policyError,
        wallMs: Date.now() - startedAt,
        rulesHash: initialRulesFingerprint,
        mapHash: initialMapFingerprint,
        mapLayoutHash: mapLayoutFingerprint(initialSnapshot),
        initialStateHash: stateHash(initialSnapshot),
        actionPrefix,
        initialState: initialSnapshot,
        behaviorPolicyId: config.behaviorPolicyId,
        labelTeacherId: config.labelTeacherId,
        labelTeacherVersion: config.labelTeacherVersion,
    };
    return { rootRecord, decisions };
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'v14_20260924_t14') as string;
    const configPath = arg('--config', 'v14/configs/collect_v14_roots.json') as string;
    const outDir = arg('--out-dir', `v14/out/${runId}/T14-02/raw`) as string;
    const partitions = (arg('--partitions', 'train,val,test') as string).split(',').map((s) => s.trim()).filter(Boolean);
    const maxRoots = Number(arg('--max-roots', '0'));
    const stepCap = Number(arg('--step-cap', '20000'));
    const decisionsPerRootCap = Number(arg('--decisions-per-root', '200'));

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CollectConfig;
    const sdTrainingPlan = await loadSdTrainingPlanConfig(path.resolve(SD_PLAN_FILE));
    const plan = sdTrainingPlan.plans.find((p: any) => p.id === config.planId);
    if (!plan) throw new Error(`采集配置引用了不存在的 plan: ${config.planId}`);
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    fs.mkdirSync(outDir, { recursive: true });
    const rootsOut = path.join(outDir, 'roots.jsonl');
    const decisionsOut = path.join(outDir, 'decisions.jsonl');
    const rootsStream = fs.createWriteStream(rootsOut, { flags: 'w' });
    const decisionsStream = fs.createWriteStream(decisionsOut, { flags: 'w' });

    const summary: any[] = [];
    let planned = 0;
    for (const partition of partitions) {
        const specs = config.partitions[partition] ?? [];
        for (const spec of specs) {
            if (maxRoots > 0 && planned >= maxRoots) break;
            planned += 1;
            const { rootRecord, decisions } = await collectRoot({
                runId, partition, spec, config, stepCap, decisionsPerRootCap, envFactory, plan,
            });
            rootsStream.write(`${JSON.stringify(rootRecord)}\n`);
            const keep = spreadIndices(decisions.length, decisionsPerRootCap);
            for (const idx of keep) {
                decisionsStream.write(`${JSON.stringify({ rootFamilyId: rootRecord.rootFamilyId, partition, ...decisions[idx] })}\n`);
            }
            summary.push({
                rootFamilyId: rootRecord.rootFamilyId,
                partition,
                mapName: rootRecord.mapName,
                playerCount: rootRecord.playerCount,
                steps: rootRecord.steps,
                decisions: rootRecord.decisionsRecorded,
                kept: keep.length,
                stopReason: rootRecord.stopReason,
                winnerRaw: rootRecord.winnerRaw,
                wallMs: rootRecord.wallMs,
                engineError: rootRecord.engineError,
                policyError: rootRecord.policyError,
            });
            console.log(`[collect] ${partition} ${rootRecord.rootFamilyId} players=${rootRecord.playerCount} steps=${rootRecord.steps} decisions=${rootRecord.decisionsRecorded} kept=${keep.length} stop=${rootRecord.stopReason} ${rootRecord.wallMs}ms`);
            if (rootRecord.engineError || rootRecord.policyError) {
                console.error(`[collect] 错误 root=${rootRecord.rootFamilyId} engine=${rootRecord.engineError} policy=${rootRecord.policyError}`);
            }
        }
    }
    await new Promise<void>((resolve) => rootsStream.end(resolve));
    await new Promise<void>((resolve) => decisionsStream.end(resolve));

    const report = {
        schema: 'v14_collection_report_1',
        runId,
        generatedAt: new Date().toISOString(),
        configPath,
        configSha256: crypto.createHash('sha256').update(fs.readFileSync(configPath)).digest('hex'),
        stepCap,
        decisionsPerRootCap,
        rootCount: summary.length,
        byPartition: Object.fromEntries(partitions.map((p) => [p, summary.filter((s) => s.partition === p).length])),
        byPlayerCount: summary.reduce((acc: Record<string, number>, s) => {
            acc[String(s.playerCount)] = (acc[String(s.playerCount)] ?? 0) + 1; return acc;
        }, {}),
        naturalTerminalRoots: summary.filter((s) => s.stopReason === 'NATURAL').length,
        errorRoots: summary.filter((s) => s.engineError || s.policyError).length,
        totalDecisions: summary.reduce((acc, s) => acc + s.decisions, 0),
        totalKeptDecisions: summary.reduce((acc, s) => acc + s.kept, 0),
        roots: summary,
    };
    fs.writeFileSync(path.join(outDir, 'collection_report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[collect] roots=${summary.length} decisions=${report.totalDecisions} kept=${report.totalKeptDecisions} -> ${outDir}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
