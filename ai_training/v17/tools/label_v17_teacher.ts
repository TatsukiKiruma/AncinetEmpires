/**
 * V17/T17-05：用 B100 教师给**当前输入池**打 hard 行为标签（可恢复、可分片）。
 *
 * 中文：B0/B1 必须共享完全相同的输入池，只换标签来源。因此标签不重新采集游戏，
 * 而是对已经采集好的 rollout（每行带决策前的完整 `stateJson`）逐行重建引擎并查询教师：
 *
 *   stateJson → new GameEngine(state)            // 不重复结算首次收入
 *             → allowed = engine.getLegalActions(currentPlayer) 去 surrender（引擎原生顺序）
 *             → B100-Q / B100-R queryKey 由 b100_input_key 统一口径给出
 *             → teacherActionCode
 *
 * 教师动作必须落在 `allowed` 内；不在则记 ERROR，**绝不静默回退 H0**、绝不填假标签。
 * 内部 catch 计数如实记录；异常查询的标签带 `cleanForPolicy:false`。
 *
 * 用法（真实可复制）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/label_v17_teacher.ts `
 *     --rollouts v17/out/v17_20260926_r2/data/new_train/rollouts `
 *     --label-set b100q-newtrain --variant B100-Q --out-dir v17/out/v17_20260926_r2/teacher/labels
 *
 * 分片（多进程并行）：
 *   ... --shard 0/6
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { createB100Policy, B100_TEACHER_VERSION, type B100Variant } from '../teachers/b100_policy';
import { b100PolicyInputKeySafe } from '../teachers/b100_input_key';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROLLOUT_ARG = arg('--rollouts', null);
const LABEL_SET = arg('--label-set', 'b100q') as string;
const VARIANT = arg('--variant', 'B100-Q') as B100Variant;
const OUT_DIR = path.resolve(arg('--out-dir', 'v17/out/v17_20260926_r2/teacher/labels') as string);
const SHARD = arg('--shard', null);
const LIMIT = arg('--limit', null) === null ? null : Number(arg('--limit', null));
const RESUME = arg('--resume', 'true') !== 'false';

if (ROLLOUT_ARG === null) throw new Error('[T17-05 label] 必须给 --rollouts <文件或目录>。');
if (VARIANT !== 'B100-Q' && VARIANT !== 'B100-R') throw new Error(`[T17-05 label] 未知 variant '${VARIANT}'。`);

const inputs: string[] = [];
const resolvedRollout = path.resolve(ROLLOUT_ARG);
if (fs.statSync(resolvedRollout).isDirectory()) {
    for (const f of fs.readdirSync(resolvedRollout).sort()) {
        if (f.endsWith('.jsonl') && !f.includes('.labels.')) inputs.push(path.join(resolvedRollout, f));
    }
} else {
    inputs.push(resolvedRollout);
}
if (inputs.length === 0) throw new Error(`[T17-05 label] ${resolvedRollout} 下没有 .jsonl。`);

let shardIndex = 0;
let shardCount = 1;
if (SHARD !== null) {
    const [i, n] = SHARD.split('/').map(Number);
    shardIndex = i; shardCount = n;
}

const outDir = path.join(OUT_DIR, LABEL_SET);
fs.mkdirSync(outDir, { recursive: true });
const shardTag = SHARD === null ? '' : `.shard${shardIndex}of${shardCount}`;
const outPath = path.join(outDir, `labels${shardTag}.jsonl`);
const summaryPath = path.join(outDir, `summary${shardTag}.json`);

/** 断点续打：已有行的 sourceRowId 集合。 */
const done = new Set<string>();
const finishedRows: Array<Record<string, unknown>> = [];
if (RESUME && fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const row = JSON.parse(t) as Record<string, unknown>;
        finishedRows.push(row);
        done.add(String(row.sourceRowId));
    }
}
const out = fs.createWriteStream(outPath, { flags: 'a' });

let seen = 0;
let labelled = 0;
let skipped = 0;
let illegal = 0;
let exceptionRows = 0;
let mismatchSeat = 0;
let emptyAllowed = 0;
const latencies: number[] = [];
const encodeLatencies: number[] = [];
const actionTypes: Record<string, number> = {};
const keyKinds: Record<string, number> = {};
const agreementWithBehavior = { same: 0, differ: 0 };
const startedAt = Date.now();

for (let fi = 0; fi < inputs.length; fi += 1) {
    if (fi % shardCount !== shardIndex) continue;
    const file = inputs[fi];
    const stream = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of stream) {
        const t = line.trim();
        if (!t) continue;
        let row: Record<string, unknown>;
        try {
            row = JSON.parse(t) as Record<string, unknown>;
        } catch {
            // 中文：采集进程可能仍在写最后一个分片；半行不是数据错误，跳过并计数。
            skipped += 1;
            continue;
        }
        const sourceRowId = `${path.basename(file)}|${String(row.gameId ?? row.stateHash ?? seen)}`;
        seen += 1;
        if (LIMIT !== null && labelled >= LIMIT) break;
        if (done.has(sourceRowId)) { skipped += 1; continue; }

        const stateJson = row.stateJson as string | undefined;
        if (!stateJson) { skipped += 1; continue; }

        const record: Record<string, unknown> = {
            schema: 'v17_b100_label_1',
            labelSetId: LABEL_SET,
            teacherId: VARIANT,
            teacherVersion: B100_TEACHER_VERSION,
            variant: VARIANT,
            sourceRowId,
            sourceFile: path.basename(file),
            split: row.split ?? null,
            sourcePolicy: row.sourcePolicy ?? null,
            mapName: row.mapName ?? null,
            mapIndex: row.mapIndex ?? null,
            seed: row.seed ?? null,
            subjectSeat: row.subjectSeat ?? null,
            stepIndex: row.stepIndex ?? null,
            turn: row.turn ?? null,
            phaseBucket: row.phaseBucket ?? null,
            stateHash: row.stateHash ?? null,
            behaviorActionCode: row.behaviorActionCode ?? null,
            valueTarget: row.valueTarget ?? null,
            naturalTerminal: row.naturalTerminal ?? null,
        };

        let engine: GameEngine;
        try {
            engine = new GameEngine(JSON.parse(stateJson) as GameState);
        } catch (error) {
            record.status = 'STATE_REBUILD_ERROR';
            record.error = error instanceof Error ? error.message : String(error);
            out.write(`${JSON.stringify(record)}\n`);
            continue;
        }
        const state = engine.getState();
        const playerId = state.currentPlayer;
        record.currentPlayer = playerId;
        if (row.subjectPlayerId !== undefined && row.subjectPlayerId !== null && playerId !== row.subjectPlayerId) {
            mismatchSeat += 1;
            record.status = 'SEAT_MISMATCH';
            record.expectedSubjectPlayerId = row.subjectPlayerId;
            out.write(`${JSON.stringify(record)}\n`);
            continue;
        }
        let allowed: Action[];
        try {
            allowed = engine.getLegalActions(playerId).filter((a) => a.type !== 'surrender');
        } catch (error) {
            record.status = 'LEGAL_SET_ERROR';
            record.error = error instanceof Error ? error.message : String(error);
            out.write(`${JSON.stringify(record)}\n`);
            continue;
        }
        if (allowed.length === 0) {
            emptyAllowed += 1;
            record.status = 'EMPTY_LEGAL_SET';
            record.allowedActionCodes = [];
            out.write(`${JSON.stringify(record)}\n`);
            continue;
        }
        record.allowedCount = allowed.length;
        record.allowedActionCodes = allowed.map((a) => encodeAction(a));

        // 网络输入身份（Q 的 queryKey）；失败不编造，退回 state-fallback 并如实标注。
        const t0 = Date.now();
        const keyResult = b100PolicyInputKeySafe(state, playerId, allowed);
        encodeLatencies.push(Date.now() - t0);
        const queryKey = keyResult?.key ?? null;
        record.queryKey = queryKey;
        record.queryKeyKind = queryKey === null ? 'state-fallback' : 'policy-input-key';

        const handle = createB100Policy({
            variant: VARIANT,
            rootSeed: Number(row.seed ?? 0),
            seat: Number(row.subjectSeat ?? playerId),
            ...(queryKey !== null ? { queryKeyOverride: queryKey } : {}),
        });
        const t1 = Date.now();
        let action: Action | null = null;
        try {
            action = handle.policy({ state, playerId, allowed, seat: Number(row.subjectSeat ?? playerId), seed: Number(row.seed ?? 0) });
        } catch (error) {
            record.status = 'TEACHER_THROW';
            record.error = error instanceof Error ? error.message : String(error);
        }
        const elapsed = Date.now() - t1;
        if (action === null) {
            exceptionRows += 1;
            out.write(`${JSON.stringify(record)}\n`);
            continue;
        }
        const code = encodeAction(action);
        const inAllowed = allowed.some((a) => encodeAction(a) === code);
        const last = handle.decisions[handle.decisions.length - 1];
        record.status = inAllowed ? 'OK' : 'ILLEGAL_ACTION';
        record.teacherActionCode = code;
        record.teacherActionInAllowed = inAllowed;
        record.decisionRng = last ? {
            rngBeforeHex: last.rngBeforeHex ?? null,
            rngAfterHex: last.rngAfterHex ?? null,
            rngCalls: last.rngCalls ?? null,
            querySeed: last.querySeed ?? null,
        } : null;
        record.internalExceptions = handle.exceptions;
        record.elapsedMs = elapsed;
        record.cleanForPolicy = inAllowed && handle.exceptions === 0;
        record.labelEvidenceKind = 'B100_FINAL_ACTION_HARD';
        out.write(`${JSON.stringify(record)}\n`);

        if (inAllowed) {
            labelled += 1;
            latencies.push(elapsed);
            const type = code.split(':')[0];
            actionTypes[type] = (actionTypes[type] ?? 0) + 1;
            keyKinds[record.queryKeyKind as string] = (keyKinds[record.queryKeyKind as string] ?? 0) + 1;
            if (row.behaviorActionCode) {
                if (row.behaviorActionCode === code) agreementWithBehavior.same += 1;
                else agreementWithBehavior.differ += 1;
            }
        } else {
            illegal += 1;
        }
        if (handle.exceptions > 0) exceptionRows += 1;
        if (labelled % 500 === 0 && labelled > 0) {
            console.log(`[T17-05 label] ${LABEL_SET} labelled=${labelled} skipped=${skipped} illegal=${illegal} ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
        }
    }
}

await new Promise<void>((resolve) => out.end(resolve));

const sorted = (a: number[]): number[] => [...a].sort((x, y) => x - y);
const pct = (a: number[], q: number): number | null => (a.length === 0 ? null : a[Math.min(a.length - 1, Math.floor(q * a.length))]);
const summary = {
    schema: 'v17_b100_label_summary_1',
    labelSetId: LABEL_SET,
    teacherId: VARIANT,
    teacherVersion: B100_TEACHER_VERSION,
    shard: SHARD,
    rolloutInputs: inputs.map((p) => p.replace(/\\/g, '/')),
    rowsSeen: seen,
    labelledOk: labelled,
    skippedAlreadyDone: skipped,
    illegalActions: illegal,
    errorRows: exceptionRows,
    seatMismatch: mismatchSeat,
    emptyLegalSets: emptyAllowed,
    queryKeyKinds: keyKinds,
    actionTypeDistribution: actionTypes,
    agreementWithBehaviorPolicy: agreementWithBehavior,
    teacherLatencyMs: { p50: pct(sorted(latencies), 0.5), p95: pct(sorted(latencies), 0.95), max: sorted(latencies).slice(-1)[0] ?? null },
    encodeLatencyMs: { p50: pct(sorted(encodeLatencies), 0.5), p95: pct(sorted(encodeLatencies), 0.95), max: sorted(encodeLatencies).slice(-1)[0] ?? null },
    wallMs: Date.now() - startedAt,
    outPath: outPath.replace(/\\/g, '/'),
    previousRowsInFile: finishedRows.length,
    generatedAt: new Date().toISOString(),
    disclaimer: 'B100_QUALIFIED 只表示可开展蒸馏；teacherActionCode 是行为标签，不是最优动作真值。内部异常的查询 cleanForPolicy=false。',
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
void createHash;