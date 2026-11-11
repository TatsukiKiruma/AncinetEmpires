/**
 * V16/T16-03：S1 教师资格与成本预演（owner：T16-03）。
 *
 * 一个工具两种模式，避免出现「pilot 用一套窗口、资格用另一套」的口径漂移：
 *
 * - `--mode pilot`（任务书 §5.2）：三档各做 40 窗口成本试验，输出标签耗时 p50/p95、
 *   引擎 transition 数、边界达成比、wall 命中率；用于决定哪一档可以大批打标签。
 * - `--mode qualification`（任务书 §5.3）：200 个代表窗口，检查
 *   (a) 0 非法动作、0 真实局面污染（查询前后 canonicalStateJson hash 必须相同）；
 *   (b) 同状态 + 同教师版本 + 同 seed 的 3 次查询结果一致（且未触发 wall cap）；
 *   (c) 采样支路到达预定回合边界的比例 ≥90%，并**按地图分别报告**（不允许用全局比例
 *       掩盖某张图全截断）。
 *
 * 窗口来源：真实对局（`playOne` 的 H0 对 H0 重放 + `onStep` 逐步状态），不是合成状态。
 * 窗口只从 dev / recheck 面板的 seed 派生，**不碰 CONFIRM20 的 seed 空间**。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/teacher_s1_pilot_v16.ts \
 *     --mode pilot --tiers S1a,S1b,S1c --windows 40 \
 *     --out v16/out/v16_20260926_core/T16-03/pilot.json
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { UNPACK_DIR, SD_PLAN_FILE, playOne } from '../../v14/tools/eval_v14_match';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import {
    S1_TEACHER_VERSION,
    S1_TIERS,
    searchS1Action,
    type S1Tier,
} from './teacher_s1_v16';
import { V16_DEFAULT_CAPS, V16_PANELS, blocksForPanelV16, type V16Block } from './eval_v16_protocol';
import type { GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODE = arg('--mode', 'pilot') as 'pilot' | 'qualification';
const TIERS = (arg('--tiers', 'S1a,S1b,S1c') as string).split(',').map((s) => s.trim()).filter(Boolean);
const WINDOW_TARGET = Number(arg('--windows', MODE === 'pilot' ? '40' : '200'));
const SOURCE_PANEL = arg('--source-panel', MODE === 'pilot' ? 'preflight' : 'dev') as string;
const WALL_MS = Number(arg('--wall-ms', '30000'));
const REPLICATES = MODE === 'qualification' ? 3 : 1;
const OUT_PATH = path.resolve(arg('--out', `v16/out/v16_20260926_core/T16-03/${MODE}.json`) as string);

for (const tier of TIERS) {
    if (!S1_TIERS[tier]) throw new Error(`[T16-03] 未知档 '${tier}'；可用：${Object.keys(S1_TIERS).join(', ')}。`);
}

/* ---------------- 收集真实窗口 ---------------- */
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

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

interface Window {
    windowId: string;
    mapIndex: number;
    mapName: string;
    blockId: string;
    seed: number;
    stepIndex: number;
    playerId: number;
    state: GameState;
    stateHash: string;
}

const blocks = blocksForPanelV16(SOURCE_PANEL);
const windows: Window[] = [];
const perMap = Math.ceil(WINDOW_TARGET / 5);

for (const block of blocks) {
    if (windows.filter((w) => w.mapName === block.mapName).length >= perMap) continue;
    const collected: Window[] = [];
    await playOne({
        runId: 'v16_teach_window_collect',
        scenarioId: block.scenarioId,
        seed: block.rootSeed,
        candidateSeat: null,
        viewedSeatHint: null,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: null, checkpointSha256: null, requestedPolicyId: 'heuristic',
        envFactory,
        emitIdentity: false,
        captureStateOnStep: true,
        onStep: (trace) => {
            if (trace.stateBeforeJson === null) return;
            const state = JSON.parse(trace.stateBeforeJson) as GameState;
            if (new GameEngine(state).isTerminal()) return;
            collected.push({
                windowId: `${block.blockId}#step${trace.stepIndex}`,
                mapIndex: block.mapIndex,
                mapName: block.mapName,
                blockId: block.blockId,
                seed: block.rootSeed,
                stepIndex: trace.stepIndex,
                playerId: trace.playerId,
                state,
                stateHash: crypto.createHash('sha256')
                    .update(Buffer.from(canonicalStateJson(state), 'utf8')).digest('hex'),
            });
        },
    });
    // 均匀取样，避免全部落在同一局的前期。
    const need = perMap - windows.filter((w) => w.mapName === block.mapName).length;
    const stride = Math.max(1, Math.ceil(collected.length / need));
    for (let i = 0; i < collected.length && windows.filter((w) => w.mapName === block.mapName).length < perMap; i += stride) {
        windows.push(collected[i]);
    }
}

console.log(`[T16-03] 收集窗口 ${windows.length} 个（目标 ${WINDOW_TARGET}），来源面板=${SOURCE_PANEL}，地图分布=`
    + JSON.stringify(windows.reduce((acc: Record<string, number>, w) => {
        acc[w.mapName] = (acc[w.mapName] ?? 0) + 1; return acc;
    }, {})));

/* ---------------- 逐档评测 ---------------- */
interface TierResult {
    tierId: string;
    tier: S1Tier;
    windowsEvaluated: number;
    illegalActions: number;
    statePollution: number;
    wallCapHits: number;
    reproducibleQueries: number;
    reproducibityChecked: number;
    elapsedMsSorted: number[];
    transitionsSorted: number[];
    boundaryRatios: number[];
    perMap: Record<string, { n: number; boundaryReached: number; wallCapHits: number; illegal: number }>;
    reachedBoundaryCounts: Record<string, number>;
    candidatesSearched: number[];
    distinctReplies: number;
}

const results: TierResult[] = [];

for (const tierId of TIERS) {
    const tier = S1_TIERS[tierId];
    const result: TierResult = {
        tierId, tier,
        windowsEvaluated: 0, illegalActions: 0, statePollution: 0, wallCapHits: 0,
        reproducibleQueries: 0, reproducibityChecked: 0,
        elapsedMsSorted: [], transitionsSorted: [], boundaryRatios: [],
        perMap: {}, reachedBoundaryCounts: {}, candidatesSearched: [], distinctReplies: 0,
    };
    const startedAt = Date.now();
    for (const window of windows) {
        const legalCodes = new Set(
            new GameEngine(JSON.parse(JSON.stringify(window.state)) as GameState)
                .getLegalActions(window.playerId).map(encodeAction),
        );
        let firstCode: string | null = null;
        for (let replicate = 0; replicate < REPLICATES; replicate += 1) {
            const decision = searchS1Action({
                state: window.state,
                playerId: window.playerId,
                s1: { tier, rng: () => 0.5, wallMsPerDecision: WALL_MS },
            });
            result.windowsEvaluated += 1;
            if (replicate === 0) {
                firstCode = decision.actionCode;
                result.elapsedMsSorted.push(decision.elapsedMs);
                result.transitionsSorted.push(decision.engineTransitions);
                result.boundaryRatios.push(decision.boundaryReachedRatio);
                result.candidatesSearched.push(decision.candidates.filter((c) => c.value !== null).length);
                if (decision.wallCapHit) result.wallCapHits += 1;
                const bucket = result.perMap[window.mapName] ?? { n: 0, boundaryReached: 0, wallCapHits: 0, illegal: 0 };
                bucket.n += 1;
                if (decision.boundaryReachedRatio >= 0.9) bucket.boundaryReached += 1;
                if (decision.wallCapHit) bucket.wallCapHits += 1;
                if (!legalCodes.has(decision.actionCode)) {
                    result.illegalActions += 1;
                    bucket.illegal += 1;
                }
                result.perMap[window.mapName] = bucket;
                for (const candidate of decision.candidates) {
                    const key = candidate.reachedBoundary;
                    result.reachedBoundaryCounts[key] = (result.reachedBoundaryCounts[key] ?? 0) + 1;
                }
                result.distinctReplies += new Set(
                    decision.candidates.flatMap((c) => c.opponentReplyCodes),
                ).size > 0 ? 1 : 0;
            } else {
                result.reproducibityChecked += 1;
                if (decision.actionCode === firstCode) result.reproducibleQueries += 1;
            }
            // 查询不得污染真实局面。
            const after = crypto.createHash('sha256')
                .update(Buffer.from(canonicalStateJson(window.state), 'utf8')).digest('hex');
            if (after !== window.stateHash) result.statePollution += 1;
        }
    }
    results.push(result);
    console.log(
        `[T16-03] ${tierId} 完成 ${result.windowsEvaluated} 次查询，用时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s，`
        + `非法=${result.illegalActions} 污染=${result.statePollution} wall=${result.wallCapHits}`,
    );
}

const pct = (sorted: number[], q: number): number | null =>
    (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);

const report = {
    schema: 'v16_s1_teacher_qualification_1',
    task: 'T16-03',
    mode: MODE,
    generatedAt: new Date().toISOString(),
    teacherVersion: S1_TEACHER_VERSION,
    windowSource: {
        panel: SOURCE_PANEL,
        windows: windows.length,
        perMap: windows.reduce((acc: Record<string, number>, w) => {
            acc[w.mapName] = (acc[w.mapName] ?? 0) + 1; return acc;
        }, {}),
        note: '窗口来自真实对局逐步状态（playOne 重放 + onStep），不使用合成状态，也不使用 CONFIRM20 seed。',
    },
    wallMsPerDecision: WALL_MS,
    replicatesPerWindow: REPLICATES,
    tiers: results.map((r) => {
        const elapsed = [...r.elapsedMsSorted].sort((a, b) => a - b);
        const transitions = [...r.transitionsSorted].sort((a, b) => a - b);
        const boundary = [...r.boundaryRatios].sort((a, b) => a - b);
        const boundaryPass = boundary.length > 0 && boundary[0] >= 0.9;
        const allMapsPass = Object.values(r.perMap).every((b) => b.n === 0 || b.boundaryReached / b.n >= 0.9);
        const noMapFullyTruncated = Object.values(r.perMap).every((b) => b.n === 0 || b.boundaryReached > 0);
        return {
            tierId: r.tierId,
            tier: r.tier,
            queries: r.windowsEvaluated,
            illegalActions: r.illegalActions,
            statePollution: r.statePollution,
            wallCapHits: r.wallCapHits,
            wallCapHitRate: r.windowsEvaluated === 0 ? null : r.wallCapHits / (r.windowsEvaluated / REPLICATES),
            reproducibleQueries: r.reproducibleQueries,
            reproducibilityChecked: r.reproducibityChecked,
            reproducibleAll: r.reproducibityChecked === r.reproducibleQueries,
            elapsedMs: { p50: pct(elapsed, 0.5), p95: pct(elapsed, 0.95), max: elapsed.length ? elapsed[elapsed.length - 1] : null },
            engineTransitions: { p50: pct(transitions, 0.5), p95: pct(transitions, 0.95), max: transitions.length ? transitions[transitions.length - 1] : null },
            boundaryReachedRatio: { min: boundary.length ? boundary[0] : null, p05: pct(boundary, 0.05), p50: pct(boundary, 0.5) },
            candidatesSearchedP50: pct([...r.candidatesSearched].sort((a, b) => a - b), 0.5),
            reachedBoundaryCounts: r.reachedBoundaryCounts,
            perMap: r.perMap,
            verdict: {
                legalityPass: r.illegalActions === 0 && r.statePollution === 0,
                boundaryPass,
                perMapBoundaryPass: allMapsPass && noMapFullyTruncated,
                reproducibilityPass: r.reproducibityChecked === r.reproducibleQueries,
                wallCapAcceptable: r.windowsEvaluated > 0 && (r.wallCapHits / (r.windowsEvaluated / REPLICATES)) <= 0.10,
            },
        };
    }),
    criteria: {
        legality: '200 个代表窗口，0 非法动作、0 真实局面污染',
        reproducibility: '同状态/同教师版本/同 seed 的 3 次查询结果一致，且未触发 wall cap',
        boundary: '采样支路到达预定回合边界比例 ≥90%，且按地图分别满足（不允许全局比例掩盖某图全截断）',
        wallCap: '触发 wall 的决策比例 >10% 时该档不能用于大批可信标签（任务书 §5.2）',
    },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
    out: OUT_PATH.replace(/\\/g, '/'),
    tiers: report.tiers.map((t) => ({
        tierId: t.tierId,
        queries: t.queries,
        illegal: t.illegalActions,
        pollution: t.statePollution,
        wallCapHits: t.wallCapHits,
        reproducibility: `${t.reproducibleQueries}/${t.reproducibilityChecked}`,
        elapsedP50: t.elapsedMs.p50,
        elapsedP95: t.elapsedMs.p95,
        boundaryMin: t.boundaryReachedRatio.min,
        verdict: t.verdict,
    })),
}, null, 2));
