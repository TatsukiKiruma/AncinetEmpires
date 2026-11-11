/**
 * V19/R1：具体对局家族的失败机制定位（重放 + 反事实）。
 *
 * 目的（对应 `V19_RUN02_REVIEW_AND_NEXT.md` R1）：把「θ1 赢、θ2/θ3 输」或反之的 DEV 局
 * 变成「**哪个选择 → 哪个规则后果 → 哪种改动能避免**」，而不是再交一份失败分类。
 *
 * 做法：
 * 1. 用**原 seed 与各自 SHA**重放该局（`playOne` + 逐步 trace），并与 DEV 面板记录的
 *    `actionDigest` 对齐——只有摘要一致，后续结论才属于同一局。
 * 2. 找出**首次策略分歧**（首个 actionCode 不同的步）。首次分歧**不自动等于错误**。
 * 3. 在分歧窗口做**反事实**：把 A 的选择强行放到 B 的轨迹上（以及反向），
 *    其余决策仍由原模型给出，同一 H0 随机流不重新初始化，重放到自然终局，
 *    比较后继局面与自然结果。这才是可验证的「选择→后果」。
 * 4. 每个家族最多 2 个窗口；窗口数硬上限由调用方给出（默认总 8 个）。
 *
 * 纪律：训练采样轨迹不能冒充 DEV 轨迹；本工具只重放 DEV 指定的 (地图, seed, 座位)。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/tools/diagnose_dev_families.ts \
 *     --a v19/out/.../ppo_w1.json --b v19/out/.../ppo_w2.json \
 *     --families v19/out/.../diag/families.json --out v19/out/.../diag/trace.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { predictSpatialAction } from '../../src/game/ai/shared_spatial_policy';
import { encodeAction } from '../../src/game/env';
import {
    UNPACK_DIR,
    SD_PLAN_FILE,
    playOne,
    type CandidatePolicyV16,
    type StepTraceV16,
} from '../../v14/tools/eval_v14_match';
import { V16_DEFAULT_CAPS } from '../../v16/tools/eval_v16_protocol';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sha256File(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadPredictor(file: string): { predictor: SpatialResNetPredictor; sha: string } {
    const abs = path.resolve(file);
    const json = fs.readFileSync(abs, 'utf8');
    const declared = (JSON.parse(json) as { encoderSchemaId?: string }).encoderSchemaId ?? null;
    return {
        predictor: new SpatialResNetPredictor(loadSpatialResNetFromJson(json, { expectedEncoderSchemaId: declared })),
        sha: sha256File(abs),
    };
}

/** 紧凑但可核验的状态摘要：规则后果要看的就是这些字段。 */
function stateSummary(state: GameState) {
    const units = [...state.units]
        .filter(u => u.hp > 0)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(u => ({
            id: u.id, owner: u.ownerId, cls: u.unitClass, pos: `${u.pos.x},${u.pos.y}`,
            hp: `${u.hp}/${u.maxHp}`, lv: u.level ?? 0, exp: u.exp ?? 0,
            moved: !!u.hasMoved, acted: !!u.hasActed,
            status: u.status ? `${u.status.type}:${u.status.duration ?? ''}` : null,
        }));
    const players = [...state.players].sort((a, b) => a.id - b.id).map(p => ({
        id: p.id, gold: p.gold, alive: p.isAlive,
        commanderDeathCount: p.commanderDeathCount ?? 0,
    }));
    const buildings: Record<string, string[]> = {};
    for (let y = 0; y < state.map.height; y += 1) {
        for (let x = 0; x < state.map.width; x += 1) {
            const tile = state.map.tiles[y]?.[x];
            if (!tile) continue;
            const key = String((tile as any).terrainId ?? (tile as any).apkTerrainId ?? '?');
            if (tile.ownerId === null || tile.ownerId === undefined) continue;
            const k = `p${tile.ownerId}`;
            buildings[k] = buildings[k] ?? [];
            buildings[k].push(`${x},${y}:t${key}`);
        }
    }
    return {
        turn: state.turn, currentPlayer: state.currentPlayer,
        winner: state.winner, pendingUnitId: (state as any).pendingUnitId ?? null,
        players, units, ownedTiles: buildings,
    };
}

interface ModelRun {
    sha: string;
    actionDigest: string;
    outcomeKind: string;
    steps: number;
    turns: number;
    winnerAllianceId: number | null;
    candidateAllianceId: number | null;
    trace: StepTraceV16[];
    stepStates: string[];
}

async function runModel(
    file: string,
    family: { mapName: string; seed: number; seat: number },
    runId: string,
    envFactory: any,
    force?: { atDecisionIndex: number; actionCode: string },
): Promise<ModelRun> {
    const { predictor, sha } = loadPredictor(file);
    const trace: StepTraceV16[] = [];
    const stepStates: string[] = [];
    let decisionIndex = -1;
    const policyOverride: CandidatePolicyV16 | undefined = force === undefined ? undefined : (ctx) => {
        decisionIndex += 1;
        if (decisionIndex === force.atDecisionIndex) {
            const match = ctx.allowed.find((a: Action) => encodeAction(a) === force.actionCode);
            if (match) return match;
            throw new Error(`[R1] 强制动作 ${force.actionCode} 不在合法集内，拒绝静默回退。`);
        }
        return predictSpatialAction(predictor, ctx.state, ctx.playerId, ctx.allowed).action;
    };
    const record = await playOne({
        runId,
        scenarioId: `SDPLAN:sd-normal:${family.mapName}`,
        seed: family.seed,
        candidateSeat: family.seat,
        viewedSeatHint: family.seat,
        maxSteps: V16_DEFAULT_CAPS.maxStepsAtomicActions,
        maxPlies: V16_DEFAULT_CAPS.maxPlies,
        wallTimeoutMs: V16_DEFAULT_CAPS.wallTimeoutMs,
        predictor: force === undefined ? predictor : null,
        checkpointSha256: sha,
        requestedPolicyId: path.basename(file).replace(/\.json$/, ''),
        envFactory,
        emitIdentity: false,
        mirrorViewRecompute: false,
        onStep: (t) => { trace.push({ ...t }); },
        captureStateOnStep: true,
        ...(policyOverride ? { policyOverride } : {}),
    });
    for (const t of trace) if (t.stateBeforeJson) stepStates.push(t.stateBeforeJson);
    return {
        sha, actionDigest: record.actionDigest, outcomeKind: record.outcomeKind,
        steps: record.steps, turns: record.turns,
        winnerAllianceId: record.winnerAllianceId, candidateAllianceId: record.candidateAllianceId,
        trace, stepStates,
    };
}

/** 只保留「候选臂真正做决策」的步（byCandidate 且带 logits）。 */
function candidateDecisions(run: ModelRun) {
    return run.trace.filter(t => t.byCandidate && t.actionCode !== '' && t.orderedActionCodes !== null);
}

async function main(): Promise<void> {
    const runId = arg('--run-id', 'run_20260929_v19_02') as string;
    const aPath = arg('--a', null);
    const bPath = arg('--b', null);
    const familiesPath = arg('--families', null);
    const outPath = path.resolve(arg('--out', `v19/out/${runId}/diag/trace.json`) as string);
    const maxWindowsTotal = Number(arg('--max-windows', '8'));
    const maxWindowsPerFamily = Number(arg('--max-windows-per-family', '2'));
    if (!aPath || !bPath || !familiesPath) {
        throw new Error('[R1] 需要 --a --b --families。');
    }
    const families = JSON.parse(fs.readFileSync(path.resolve(familiesPath), 'utf8')) as Array<{
        id: string; mapName: string; seed: number; seat: number;
        expectA?: string; expectB?: string; note?: string;
    }>;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);

    const results: any[] = [];
    let windowsUsed = 0;
    for (const family of families) {
        console.log(`[R1] 家族 ${family.id}：${family.mapName} seed=${family.seed} seat=${family.seat}`);
        const runA = await runModel(aPath, family, runId, envFactory);
        const runB = await runModel(bPath, family, runId, envFactory);
        const digestMatchA = family.expectA ? runA.actionDigest === family.expectA : null;
        const digestMatchB = family.expectB ? runB.actionDigest === family.expectB : null;
        console.log(`[R1]   A ${runA.outcomeKind} digestMatch=${digestMatchA} sha=${runA.sha.slice(0, 12)}`);
        console.log(`[R1]   B ${runB.outcomeKind} digestMatch=${digestMatchB} sha=${runB.sha.slice(0, 12)}`);

        const decA = candidateDecisions(runA);
        const decB = candidateDecisions(runB);
        const n = Math.min(decA.length, decB.length);
        let firstDivergence = -1;
        for (let i = 0; i < n; i += 1) {
            if (decA[i].actionCode !== decB[i].actionCode) { firstDivergence = i; break; }
        }

        const windows: any[] = [];
        if (firstDivergence >= 0) {
            const perFamily = Math.min(maxWindowsPerFamily, Math.max(0, maxWindowsTotal - windowsUsed));
            // 窗口取「首次分歧」及其后第一个分歧点（每个家族最多 2 个）。
            const candidates: number[] = [firstDivergence];
            for (let i = firstDivergence + 1; i < n && candidates.length < perFamily; i += 1) {
                if (decA[i].actionCode !== decB[i].actionCode) candidates.push(i);
            }
            for (const idx of candidates) {
                if (windowsUsed >= maxWindowsTotal) break;
                windowsUsed += 1;
                const stepA = decA[idx];
                const stepB = decB[idx];
                const stateJson = runA.stepStates[stepA.stepIndex] ?? runB.stepStates[stepB.stepIndex];
                const state = stateJson ? JSON.parse(stateJson) : null;
                // 反事实：把 A 的选择放到 B 的轨迹上，其余决策仍由 B 给出。
                let counterfactual: any = null;
                try {
                    const forced = await runModel(bPath, family, runId, envFactory,
                        { atDecisionIndex: idx, actionCode: stepA.actionCode });
                    counterfactual = {
                        forcedAction: stepA.actionCode,
                        appliedTo: 'B',
                        outcomeKind: forced.outcomeKind,
                        winnerAllianceId: forced.winnerAllianceId,
                        candidateAllianceId: forced.candidateAllianceId,
                        steps: forced.steps,
                        changedOutcome: forced.outcomeKind !== runB.outcomeKind,
                    };
                } catch (error) {
                    counterfactual = { forcedAction: stepA.actionCode, appliedTo: 'B', error: String(error) };
                }
                windows.push({
                    decisionIndex: idx,
                    engineStepIndex: stepA.stepIndex,
                    turn: stepA.turn,
                    playerId: stepA.playerId,
                    legalActionCount: stepA.legalActionCodes.length,
                    actionA: stepA.actionCode,
                    actionB: stepB.actionCode,
                    logitsA: stepA.actionLogits,
                    logitsB: stepB.actionLogits,
                    orderedA: stepA.orderedActionCodes,
                    orderedB: stepB.orderedActionCodes,
                    state: state ? stateSummary(state) : null,
                    counterfactual,
                });
            }
        }
        results.push({
            family,
            modelA: { path: aPath, sha: runA.sha, outcomeKind: runA.outcomeKind, steps: runA.steps,
                      turns: runA.turns, actionDigest: runA.actionDigest, digestMatchesDev: digestMatchA },
            modelB: { path: bPath, sha: runB.sha, outcomeKind: runB.outcomeKind, steps: runB.steps,
                      turns: runB.turns, actionDigest: runB.actionDigest, digestMatchesDev: digestMatchB },
            candidateDecisionsA: decA.length,
            candidateDecisionsB: decB.length,
            firstDivergenceIndex: firstDivergence,
            windows,
        });
        console.log(`[R1]   首次分歧=${firstDivergence} 窗口=${windows.length} 已用=${windowsUsed}/${maxWindowsTotal}`);
    }

    const payload = {
        schema: 'v19_r1_failure_diagnosis_1',
        runId, modelA: aPath, modelB: bPath,
        families: results.length,
        windowsUsed,
        note: '重放使用原 seed 与各自 SHA，并与 DEV 面板 actionDigest 对齐；'
            + '反事实把 A 的选择强行放到 B 的轨迹上，其余决策仍由 B 给出，H0 随机流不重新初始化。',
        results,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`[R1] -> ${outPath}（家族 ${results.length}，窗口 ${windowsUsed}）`);
}

const entryPath = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('v19/tools/diagnose_dev_families.ts')) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(1);
    });
}
