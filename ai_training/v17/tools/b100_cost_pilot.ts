/**
 * V17/T17-03：**40 状态成本 pilot**（先 pilot 再 200×3，细则 B3 第 1 条）。
 *
 * 只跑 pilot40 状态（与资格集 200 个状态**互不重叠**，由 `b100_capture_states.ts --mode select`
 * 保证），测量：
 *   - 单次「完整查询」墙钟（重建引擎 + 重算 allowed + 网络输入 key 编码 + 教师决策）；
 *   - 教师单次决策墙钟；
 *   - 按 4,000 个标签状态的推算总成本（串行，以及按实测并发数折算）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_cost_pilot.ts --states v17/out/v17_20260926_r2/teacher/states/pilot40.jsonl
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { createB100Policy, B100_TEACHER_VERSION, B100_V11_CONFIG, type B100Variant } from '../teachers/b100_policy';
import { b100InputKeyProvider } from '../teachers/b100_input_key';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface StateRow { stateId: string; stateJson: string; decisionSeat: number; rootSeed: number; turn: number; phaseBucket: string; mapName: string }

const RUN_ROOT = path.resolve(arg('--run-root', 'v17/out/v17_20260926_r2') as string);
const STATES = path.resolve(arg('--states', path.join(RUN_ROOT, 'teacher', 'states', 'pilot40.jsonl')) as string);
const OUT = path.resolve(arg('--out', path.join(RUN_ROOT, 'pilot', 'b100_cost_pilot.json')) as string);
const TARGET_STATES = Number(arg('--target-states', '4000'));
const CONCURRENCY = Number(arg('--concurrency', '6'));

const rows: StateRow[] = [];
for (const line of fs.readFileSync(STATES, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t) rows.push(JSON.parse(t) as StateRow);
}
if (rows.length === 0) throw new Error(`[B100-cost-pilot] 状态文件为空：${STATES}`);

const provider = b100InputKeyProvider();

interface Sample {
    stateId: string; variant: B100Variant; querySeed: number;
    queryMs: number; decisionMs: number | null; cloneCount: number; stepCount: number;
    internalExceptions: number; allowedCount: number; actionCode: string; error: string | null;
}

const samples: Sample[] = [];
const t0 = Date.now();
for (const row of rows) {
    for (const spec of [
        { variant: 'B100-R' as B100Variant, querySeed: 0 },
        { variant: 'B100-Q' as B100Variant, querySeed: 0 },
    ]) {
        const started = Date.now();
        const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
        const allowed = engine.getLegalActions(row.decisionSeat).filter((a) => a.type !== 'surrender') as Action[];
        const parsed = JSON.parse(row.stateJson) as GameState;
        const handle = createB100Policy({
            variant: spec.variant, rootSeed: row.rootSeed, seat: row.decisionSeat,
            querySeed: spec.querySeed, inputKeyProvider: provider,
        });
        let error: string | null = null;
        let actionCode = '';
        try {
            actionCode = encodeAction(handle.policy({
                state: parsed, playerId: row.decisionSeat, allowed, seat: row.decisionSeat, seed: row.rootSeed,
            }) as Action);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
        const rec = handle.decisions[0];
        samples.push({
            stateId: row.stateId,
            variant: spec.variant,
            querySeed: spec.querySeed,
            queryMs: Date.now() - started,
            decisionMs: rec?.elapsedMs ?? null,
            cloneCount: rec?.cloneCount ?? 0,
            stepCount: rec?.stepCount ?? 0,
            internalExceptions: rec?.internalExceptions ?? 0,
            allowedCount: rec?.allowedCount ?? allowed.length,
            actionCode,
            error,
        });
    }
    console.log(`[B100-cost-pilot] ${row.stateId} done (${((Date.now() - t0) / 1000).toFixed(1)}s cumulative)`);
}
const wallMs = Date.now() - t0;

function pct(values: number[]): { n: number; p50: number | null; p95: number | null; mean: number | null; max: number | null } {
    if (values.length === 0) return { n: 0, p50: null, p95: null, mean: null, max: null };
    const s = [...values].sort((a, b) => a - b);
    return {
        n: s.length,
        p50: s[Math.min(s.length - 1, Math.floor(0.5 * s.length))],
        p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))],
        mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 100) / 100,
        max: s[s.length - 1],
    };
}

const byVariant = (v: B100Variant) => samples.filter((s) => s.variant === v);
const stats = {
    queryMs: {
        'B100-R': pct(byVariant('B100-R').map((s) => s.queryMs)),
        'B100-Q': pct(byVariant('B100-Q').map((s) => s.queryMs)),
    },
    decisionMs: {
        'B100-R': pct(byVariant('B100-R').map((s) => s.decisionMs).filter((v): v is number => v !== null)),
        'B100-Q': pct(byVariant('B100-Q').map((s) => s.decisionMs).filter((v): v is number => v !== null)),
    },
    cloneCount: {
        'B100-R': pct(byVariant('B100-R').map((s) => s.cloneCount)),
        'B100-Q': pct(byVariant('B100-Q').map((s) => s.cloneCount)),
    },
    stepCount: {
        'B100-R': pct(byVariant('B100-R').map((s) => s.stepCount)),
        'B100-Q': pct(byVariant('B100-Q').map((s) => s.stepCount)),
    },
    internalExceptionsTotal: samples.reduce((a, s) => a + s.internalExceptions, 0),
    errors: samples.filter((s) => s.error !== null).length,
};

const qP50 = stats.queryMs['B100-Q'].p50 as number;
const qP95 = stats.queryMs['B100-Q'].p95 as number;
const qMean = stats.queryMs['B100-Q'].mean as number;
const rP50 = stats.queryMs['B100-R'].p50 as number;
const rP95 = stats.queryMs['B100-R'].p95 as number;
const rMean = stats.queryMs['B100-R'].mean as number;
const mins = (ms: number): number => Math.round((ms / 60000) * 100) / 100;
const projection = {
    targetStates: TARGET_STATES,
    assumption: '一个学生状态一条 Q 标签（细则 D1：首批当前学生访问状态 ≥1,000，后期更多）；'
        + 'R 只作参照与轨迹示范，不作为批量标签来源。',
    costPerQueryMs: { 'B100-Q': { p50: qP50, p95: qP95, mean: qMean }, 'B100-R': { p50: rP50, p95: rP95, mean: rMean } },
    q_only_expected_serial_minutes: mins(qMean * TARGET_STATES),
    q_only_if_all_states_at_p50_minutes: mins(qP50 * TARGET_STATES),
    q_only_if_all_states_at_p95_minutes_upper_bound: mins(qP95 * TARGET_STATES),
    r_only_expected_serial_minutes: mins(rMean * TARGET_STATES),
    measuredConcurrencyProcesses: CONCURRENCY,
    q_only_expected_parallel_minutes: mins((qMean * TARGET_STATES) / CONCURRENCY),
    q_only_at_p50_parallel_minutes: mins((qP50 * TARGET_STATES) / CONCURRENCY),
    bothVariants_expected_serial_minutes: mins((qMean + rMean) * TARGET_STATES),
    notes: [
        '延迟强依赖状态规模（本 pilot 中 allowed 数从 3 到 455），因此均值推算才是期望成本；',
        'p95 推算表示「若全部 4,000 个状态都落在 p95」，是上界不是期望值；',
        '并发折算按线性假设，实测并发下有 CPU 争用，属于乐观下界。',
    ],
};

const report = {
    schema: 'v17_b100_cost_pilot_1',
    generatedAt: new Date().toISOString(),
    teacherVersion: B100_TEACHER_VERSION,
    config: B100_V11_CONFIG,
    statesFile: STATES.replace(/\\/g, '/'),
    pilotStates: rows.length,
    queriesPerState: 2,
    samples: samples.length,
    wallMs,
    stats,
    projection,
    detail: samples,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[B100-cost-pilot] states=${rows.length} samples=${samples.length} wall=${(wallMs / 1000).toFixed(1)}s`);
console.log(`[B100-cost-pilot] Q query p50=${qP50}ms p95=${qP95}ms mean=${qMean}ms | R query p50=${rP50}ms p95=${rP95}ms mean=${rMean}ms`);
console.log(`[B100-cost-pilot] projection 4000 states: Q-only expected serial=${projection.q_only_expected_serial_minutes}min, ${CONCURRENCY}-way=${projection.q_only_expected_parallel_minutes}min; p95 upper bound=${projection.q_only_if_all_states_at_p95_minutes_upper_bound}min`);
console.log(`[B100-cost-pilot] -> ${OUT}`);
