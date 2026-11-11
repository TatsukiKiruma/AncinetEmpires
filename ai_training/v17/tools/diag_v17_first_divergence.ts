/**
 * V17/T17-04b：**首次分歧定位**——模型在哪一手离开了 H0 的赢棋线路？
 *
 * 背景（本轮的关键观察）：模型是确定性 argmax，H0 在同一状态下也几乎确定（重复输入 98.83% 自洽），
 * 所以每个 (地图, seed, 座位) 的胜负是**确定的**，不是概率抽样。
 * DEV20 的 20 局其实是 10 个场景 × 两个座位角色；H0 在每个场景里恰好赢一个角色。
 * 模型目前只拿到 5/20，缺的 5 胜**具体是哪几个场景**是可以逐局点名的。
 *
 * 本工具对指定 (map, seed, seat) 跑两局并逐步对齐：
 *   A) 镜像局：两个座位都是 H0（候选座位 = 目标座位）——这是"H0 的线路"；
 *   B) 候选局：目标座位换成模型，另一边仍是同样的 H0。
 * 两局共用同一个 seed 与同样的 seatstream，因此只要模型每一步都和 H0 一样，
 * 两条轨迹就逐位相同；**第一处状态 hash 不同**就是模型离开 H0 线路的那一手。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/diag_v17_first_divergence.ts `
 *     --model v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json `
 *     --cases 2609260110:0,2609260130:1 --out v17/out/v17_20260926_r2/diag/first_divergence.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { UNPACK_DIR, SD_PLAN_FILE, playOne, type GameRecord, type StepTraceV16 } from '../../v14/tools/eval_v14_match';
import { V16_DEFAULT_CAPS, V16_MAPS, scenarioIdOfMapV16 } from '../../v16/tools/eval_v16_protocol';
import { checkpointSha256V15 } from '../../v15/tools/eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODEL_PATH = arg('--model', 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json') as string;
const CASES = (arg('--cases', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = path.resolve(arg('--out', 'v17/out/v17_20260926_r2/diag/first_divergence.json') as string);
if (CASES.length === 0) throw new Error('[diag] 需要 --cases <seed>:<seat>[,<seed>:<seat>...]');

const MAP_BY_SEED = new Map<number, string>();
for (let m = 0; m < V16_MAPS.length; m += 1) {
    for (let s = 0; s < 2; s += 1) MAP_BY_SEED.set(2609260100 + 10 * m + s, V16_MAPS[m]);
}

const abs = path.resolve(MODEL_PATH);
const json = fs.readFileSync(abs, 'utf8');
const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(json));
const checkpointSha256 = checkpointSha256V15(abs);
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

interface Step { stepIndex: number; playerId: number; actionCode: string; stateHashBefore: string; turnAfter: number; terminalAfter: boolean }

function collect(record: GameRecord, trace: Step[]): Step[] { void record; return trace; }

async function playTraced(scenarioId: string, seed: number, candidateSeat: number | null, useModel: boolean) {
    const steps: Step[] = [];
    const record = await playOne({
        runId: 'v17_first_divergence', scenarioId, seed,
        candidateSeat, viewedSeatHint: candidateSeat ?? 0,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: useModel ? predictor : null,
        checkpointSha256: useModel ? checkpointSha256 : null,
        requestedPolicyId: useModel ? 'P1:s2026' : 'heuristic',
        envFactory, emitIdentity: false,
        captureStateOnStep: true,
        onStep: (t: StepTraceV16) => {
            if (t.stateBeforeJson === null) return;
            steps.push({
                stepIndex: t.stepIndex, playerId: t.playerId, actionCode: t.actionCode,
                stateHashBefore: t.stateHashBefore, turnAfter: t.turnAfter, terminalAfter: t.terminalAfter,
            });
        },
    });
    return collect(record, steps);
}

const report: Record<string, unknown> = {
    schema: 'v17_first_divergence_1',
    model: abs.replace(/\\/g, '/'),
    modelSha256: checkpointSha256,
    caps: V16_DEFAULT_CAPS,
    cases: [],
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });

for (const spec of CASES) {
    const [seedRaw, seatRaw] = spec.split(':');
    const seed = Number(seedRaw);
    const seat = Number(seatRaw);
    const mapName = MAP_BY_SEED.get(seed);
    if (!mapName) throw new Error(`[diag] 未知 seed ${seed}（只支持 DEV20 的 2609260100..2609260141）`);
    const scenarioId = scenarioIdOfMapV16(mapName);

    const mirrorSteps = await playTraced(scenarioId, seed, seat, false);
    const candSteps = await playTraced(scenarioId, seed, seat, true);

    // 逐位对齐：只要模型完全照抄 H0，两条轨迹的 (playerId, stateHashBefore, actionCode) 就完全相同
    let firstDiff = -1;
    const n = Math.min(mirrorSteps.length, candSteps.length);
    for (let i = 0; i < n; i += 1) {
        const a = mirrorSteps[i];
        const b = candSteps[i];
        if (a.stateHashBefore !== b.stateHashBefore || a.actionCode !== b.actionCode || a.playerId !== b.playerId) {
            firstDiff = i;
            break;
        }
    }
    if (firstDiff < 0 && mirrorSteps.length !== candSteps.length) firstDiff = n;

    // 统计"目标座位上的分歧次数"
    const decisiveSeatDiffs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < n; i += 1) {
        const a = mirrorSteps[i];
        const b = candSteps[i];
        if (a.playerId !== seat) continue;
        if (a.actionCode !== b.actionCode) {
            decisiveSeatDiffs.push({
                mirrorStepIndex: i, turn: a.turnAfter, h0Played: a.actionCode, modelPlayed: b.actionCode,
                sameStateOnEntry: a.stateHashBefore === b.stateHashBefore,
            });
        }
    }

    const entry = {
        caseId: spec, mapName, seed, seat,
        mirrorOutcome: null as string | null,
        candidateOutcome: null as string | null,
        mirrorSteps: mirrorSteps.length,
        candidateSteps: candSteps.length,
        firstDivergenceIndex: firstDiff < 0 ? null : firstDiff,
        firstDivergenceStep: firstDiff >= 0 && firstDiff < n
            ? {
                mirror: { playerId: mirrorSteps[firstDiff].playerId, actionCode: mirrorSteps[firstDiff].actionCode, turn: mirrorSteps[firstDiff].turnAfter },
                candidate: { playerId: candSteps[firstDiff].playerId, actionCode: candSteps[firstDiff].actionCode, turn: candSteps[firstDiff].turnAfter },
                statesIdenticalOnEntry: mirrorSteps[firstDiff].stateHashBefore === candSteps[firstDiff].stateHashBefore,
            }
            : null,
        decisiveSeatDivergenceCount: decisiveSeatDiffs.length,
        firstSeatDivergences: decisiveSeatDiffs.slice(0, 10),
    };
    (report.cases as unknown[]).push(entry);
    console.log(`[diag] ${spec} ${mapName} seat${seat}: mirror=${mirrorSteps.length} cand=${candSteps.length} `
        + `firstDiff=${entry.firstDivergenceIndex} seatDiffs=${decisiveSeatDiffs.length}`);
    if (entry.firstDivergenceStep) console.log(`       H0=${JSON.stringify(entry.firstDivergenceStep.mirror)} model=${JSON.stringify(entry.firstDivergenceStep.candidate)}`);
}

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[diag] → ${OUT}`);