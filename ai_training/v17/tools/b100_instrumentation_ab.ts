/**
 * V17/T17-03：**观测开关等价性验证**。
 *
 * 要求（T17-03 交付 1）：加入 `B100Instrumentation` 后，在 ≥50 个真实状态上，
 * 「开观测」与「关观测」选出的 actionCode 必须完全相同；否则观测改变了行为，不可接受。
 *
 * 本工具对每个状态做两次**独立**决策：
 *   A. `instrument: true`（计数 + clone/heuristic 计时）
 *   B. `instrument: false`（全部跳过）
 * 两次都用同一条新建的 mulberry 流（同 seed），并对**同一个重建引擎**调用
 * `getAction(engine, playerId, allowed)`；比较 actionCode、`getStats()` 与可读诊断。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_instrumentation_ab.ts --states v17/out/v17_20260926_r2/teacher/states/qualify200.jsonl
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { BattleSearchAI, mulberryStateful } from '../teachers/battle_search_b100';
import { B100_V11_CONFIG, B100_TEACHER_VERSION } from '../teachers/b100_policy';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface StateRow { stateId: string; stateJson: string; decisionSeat: number; allowedActionCodes: string[] }

const RUN_ROOT = path.resolve(arg('--run-root', 'v17/out/v17_20260926_r2') as string);
const STATES = path.resolve(arg('--states', path.join(RUN_ROOT, 'teacher', 'states', 'qualify200.jsonl')) as string);
const OUT = path.resolve(arg('--out', path.join(RUN_ROOT, 'teacher', 'instrumentation_ab.json')) as string);
const SEED = Number(arg('--seed', '19088743'));

const rows: StateRow[] = [];
for (const line of fs.readFileSync(STATES, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t) rows.push(JSON.parse(t) as StateRow);
}
if (rows.length === 0) throw new Error(`[B100-ab] 状态文件为空：${STATES}`);

let actionMismatch = 0;
let statsMismatch = 0;
let diagMismatch = 0;
let allowedMismatch = 0;
const examples: Array<Record<string, unknown>> = [];
const wallOn: number[] = [];
const wallOff: number[] = [];

for (const row of rows) {
    const allowedOf = (): Action[] => new GameEngine(JSON.parse(row.stateJson) as GameState)
        .getLegalActions(row.decisionSeat)
        .filter((a) => a.type !== 'surrender') as Action[];
    const allowed = allowedOf();
    const codes = allowed.map((a) => encodeAction(a));
    if (codes.length !== row.allowedActionCodes.length || !codes.every((c, i) => c === row.allowedActionCodes[i])) {
        allowedMismatch += 1;
    }

    const run = (instrument: boolean): { code: string; stats: string; diag: string; ms: number } => {
        const teacher = new BattleSearchAI(mulberryStateful(SEED), { ...B100_V11_CONFIG, instrument } as never);
        const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
        const t0 = Date.now();
        const action = teacher.getAction(engine, row.decisionSeat, allowed);
        const ms = Date.now() - t0;
        const d = teacher.getLastDecisionDiagnostics();
        return {
            code: encodeAction(action),
            stats: JSON.stringify(teacher.getStats()),
            diag: JSON.stringify({
                path: d.path, candidateCount: d.candidateCount, stageBCount: d.stageBCount,
                cheapLeafValues: d.cheapLeafValues, candidateActionCodes: d.candidateActionCodes,
                heuTopLeaf: d.heuTopLeaf, bestLeaf: d.bestLeaf, margin: d.margin,
                takeoverGate: d.takeoverGate, fired: d.fired,
            }),
            ms,
        };
    };

    const on = run(true);
    const off = run(false);
    wallOn.push(on.ms);
    wallOff.push(off.ms);

    if (on.code !== off.code) {
        actionMismatch += 1;
        if (examples.length < 10) examples.push({ stateId: row.stateId, instrumentOn: on.code, instrumentOff: off.code });
    }
    if (on.stats !== off.stats) statsMismatch += 1;
    if (on.diag !== off.diag) diagMismatch += 1;
}

const pct = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b);
    return {
        p50: s[Math.min(s.length - 1, Math.floor(0.5 * s.length))],
        p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))],
        mean: s.reduce((a, b) => a + b, 0) / s.length,
        max: s[s.length - 1],
    };
};

const report = {
    schema: 'v17_b100_instrumentation_ab_1',
    teacherVersion: B100_TEACHER_VERSION,
    statesFile: STATES.replace(/\\/g, '/'),
    checked: rows.length,
    requirement: '>= 50 real states,instrumentation on vs off must return the same actionCode',
    seed: SEED,
    actionMismatch,
    statsMismatch,
    diagnosticsMismatch: diagMismatch,
    allowedSetMismatchVsCapture: allowedMismatch,
    examples,
    wallMsWithInstrumentation: pct(wallOn),
    wallMsWithoutInstrumentation: pct(wallOff),
    conclusion: actionMismatch === 0 && statsMismatch === 0 && diagMismatch === 0
        ? 'PASS：观测不改变所选动作、统计分支与诊断内容。'
        : 'FAIL：观测改变了行为，必须修掉后才能用这些标签。',
    pass: actionMismatch === 0 && statsMismatch === 0 && diagMismatch === 0 && rows.length >= 50,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[B100-ab] checked=${rows.length} actionMismatch=${actionMismatch} statsMismatch=${statsMismatch} diagMismatch=${diagMismatch}`);
console.log(`[B100-ab] pass=${report.pass} -> ${OUT}`);
process.exit(report.pass ? 0 : 1);
