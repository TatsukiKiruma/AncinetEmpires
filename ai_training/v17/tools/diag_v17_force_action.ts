/**
 * V17/T17-04c：**单点干预实验**——把首次分歧那一手强制换成 H0 的动作，胜负会不会翻？
 *
 * 每个 case 跑三局，共用同一 seed 与同样 seatstream：
 *   1. 镜像局：两座位都是 H0 ⇒ 得到"H0 线路"的逐步动作与每步状态 hash；
 *   2. 候选局：模型打目标座位（正常跑）⇒ 基线胜负 + 首次分歧步；
 *   3. 干预局：同候选局，但**只在首次分歧那一步**把动作换成镜像局在该步的动作；
 *      其余每一步仍由模型自己决定（走与正常候选局完全相同的生产推理路径）。
 *
 * 判读（写进产物，避免过度推断）：
 *   * 若干预局翻成胜利 ⇒ 在**后续仍由模型自己下**的前提下，那一手是决定性的；
 *     这是任务书 §7.1 第二类"固定续弈的成对结果改进"证据，可用于偏好/排名监督；
 *   * 若不翻 ⇒ 单个早期分歧不是决定性的，不能把它说成"一步走错"。
 *
 * 明确限制：干预后并非双方都按 H0 续弈，所以这不是全局最优证明，
 * 只说明"在模型自己的后续策略下，换掉它会不会改变本局结果"。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/diag_v17_force_action.ts --model v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json --cases 2609260110:0,2609260130:1 --out v17/out/v17_20260926_r2/diag/force_action.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { encodeAction } from '../../src/game/env';
import type { Action } from '../../src/game/types';
import {
    UNPACK_DIR, SD_PLAN_FILE, playOne,
    type CandidatePolicyV16, type GameRecord, type StepTraceV16,
} from '../../v14/tools/eval_v14_match';
import { V16_DEFAULT_CAPS, V16_MAPS, scenarioIdOfMapV16 } from '../../v16/tools/eval_v16_protocol';
import { checkpointSha256V15 } from '../../v15/tools/eval_v15_identity';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODEL_PATH = arg('--model', 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json') as string;
const CASES = (arg('--cases', '') as string).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = path.resolve(arg('--out', 'v17/out/v17_20260926_r2/diag/force_action.json') as string);
if (CASES.length === 0) throw new Error('[diag] 需要 --cases <seed>:<seat>[,...]');

const MAP_BY_SEED = new Map<number, string>();
for (let m = 0; m < V16_MAPS.length; m += 1) {
    for (let s = 0; s < 2; s += 1) MAP_BY_SEED.set(2609260100 + 10 * m + s, V16_MAPS[m]);
}

const abs = path.resolve(MODEL_PATH);
const predictor = new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(abs, 'utf8')));
const checkpointSha256 = checkpointSha256V15(abs);
const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

interface Step { stepIndex: number; playerId: number; actionCode: string; stateHashBefore: string }
interface ForceSpec { stepIndex: number; actionCode: string }

async function playTraced(
    scenarioId: string, seed: number, seat: number,
    opts: { useModel: boolean; force?: ForceSpec },
): Promise<{ steps: Step[]; record: GameRecord; forceHit: boolean }> {
    const steps: Step[] = [];
    let stepCursor = 0;
    let forceHit = false;

    const forcePolicy: CandidatePolicyV16 | undefined = opts.force
        ? (context) => {
            const allowed = context.allowed as readonly Action[];
            const modelAction = predictSpatialAction(predictor, context.state, context.playerId, allowed).action;
            const spec = opts.force as ForceSpec;
            if (stepCursor === spec.stepIndex && context.playerId === seat) {
                const replacement = allowed.find((a) => encodeAction(a) === spec.actionCode);
                if (replacement) {
                    forceHit = true;
                    return replacement;
                }
            }
            return modelAction;
        }
        : undefined;

    const record = await playOne({
        runId: 'v17_force_action', scenarioId, seed,
        candidateSeat: seat, viewedSeatHint: seat,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: opts.useModel ? predictor : null,
        checkpointSha256: opts.useModel ? checkpointSha256 : null,
        requestedPolicyId: opts.useModel ? 'P1:s2026' : 'heuristic',
        envFactory, emitIdentity: false,
        captureStateOnStep: true,
        policyOverride: forcePolicy,
        onStep: (t: StepTraceV16) => {
            if (t.stateBeforeJson === null) return;
            stepCursor = Math.max(stepCursor, t.stepIndex + 1);
            steps.push({ stepIndex: t.stepIndex, playerId: t.playerId, actionCode: t.actionCode, stateHashBefore: t.stateHashBefore });
        },
    });
    return { steps, record, forceHit };
}

function outcomeOf(record: GameRecord, seat: number): string {
    // 中文：`playOne` 返回的记录里 `seatAlliances` 可能为 null，但 `candidateAllianceId`
    // 一定按候选座位填好。上一版只看 seatAlliances，导致把"该座位其实赢了"误报成 LOSS
    // （实测 m3:s1 seat0 的镜像局被误判）。这里以 candidateAllianceId 为准。
    const alliance = record.candidateAllianceId
        ?? record.seatAlliances?.[String(seat)]
        ?? null;
    if (record.error) return `ERROR:${record.error}`;
    if (record.outcomeKind === 'NATURAL_DRAW') return 'DRAW';
    if (record.outcomeKind !== 'NATURAL_WIN' && record.outcomeKind !== 'NATURAL_LOSS') return record.outcomeKind;
    if (alliance === null) return `${record.outcomeKind}:ALLIANCE_UNKNOWN`;
    return record.winnerAllianceId === alliance ? 'WIN' : 'LOSS';
}

const report: Record<string, unknown> = {
    schema: 'v17_force_action_1',
    model: abs.replace(/\\/g, '/'),
    modelSha256: checkpointSha256,
    caps: V16_DEFAULT_CAPS,
    limitation: '干预后并非双方都按 H0 续弈；结论只限「在模型自己的后续策略下，这一手换掉会不会改变本局结果」，不是全局最优证明。',
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

    const mirror = await playTraced(scenarioId, seed, seat, { useModel: false });
    const baseline = await playTraced(scenarioId, seed, seat, { useModel: true });

    const n = Math.min(mirror.steps.length, baseline.steps.length);
    let firstDiff = -1;
    for (let i = 0; i < n; i += 1) {
        const a = mirror.steps[i];
        const b = baseline.steps[i];
        if (a.stateHashBefore !== b.stateHashBefore || a.actionCode !== b.actionCode || a.playerId !== b.playerId) {
            firstDiff = i;
            break;
        }
    }

    let intervention: Record<string, unknown> | null = null;
    if (firstDiff >= 0 && firstDiff < n) {
        const target = mirror.steps[firstDiff];
        const intervened = await playTraced(scenarioId, seed, seat, {
            useModel: true,
            force: { stepIndex: firstDiff, actionCode: target.actionCode },
        });
        const baseOutcome = outcomeOf(baseline.record, seat);
        const forcedOutcome = outcomeOf(intervened.record, seat);
        intervention = {
            stepIndex: firstDiff,
            h0Action: target.actionCode,
            modelAction: baseline.steps[firstDiff].actionCode,
            forceApplied: intervened.forceHit,
            baselineOutcome: baseOutcome,
            forcedOutcome,
            flipped: baseOutcome !== forcedOutcome,
            baselineSteps: baseline.record.steps,
            forcedSteps: intervened.record.steps,
        };
    }

    const entry = {
        caseId: spec, mapName, seed, seat,
        mirrorOutcome: outcomeOf(mirror.record, seat),
        baselineOutcome: outcomeOf(baseline.record, seat),
        mirrorSteps: mirror.record.steps,
        baselineStepsTotal: baseline.record.steps,
        mirrorRaw: {
            outcomeKind: mirror.record.outcomeKind,
            winnerAllianceId: mirror.record.winnerAllianceId ?? null,
            candidateAllianceId: mirror.record.candidateAllianceId ?? null,
            seatAlliances: mirror.record.seatAlliances ?? null,
            error: mirror.record.error ?? null,
        },
        baselineRaw: {
            outcomeKind: baseline.record.outcomeKind,
            winnerAllianceId: baseline.record.winnerAllianceId ?? null,
            candidateAllianceId: baseline.record.candidateAllianceId ?? null,
            seatAlliances: baseline.record.seatAlliances ?? null,
            error: baseline.record.error ?? null,
        },
        firstDivergenceIndex: firstDiff < 0 ? null : firstDiff,
        intervention,
    };
    (report.cases as unknown[]).push(entry);
    console.log(`[diag] ${spec} ${mapName} seat${seat}: mirror=${entry.mirrorOutcome} baseline=${entry.baselineOutcome} firstDiff=${entry.firstDivergenceIndex}`
        + (intervention ? ` | force ${String(intervention.h0Action)} -> ${String(intervention.forcedOutcome)} (flipped=${String(intervention.flipped)})` : ''));
}

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[diag] -> ${OUT}`);