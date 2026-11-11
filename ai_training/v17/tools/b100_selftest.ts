/**
 * V17/T17-03：B100 小自检（RNG 等价 / 恢复合同 / Q 一致性）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_selftest.ts --states <pool.jsonl> --limit 6
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    mulberryDefault,
    mulberryStateful,
    parseRngStateHex,
    rngStateHex,
    BattleSearchAI,
} from '../teachers/battle_search_b100';
import {
    B100_TEACHER_VERSION,
    B100_V11_CONFIG,
    createB100Policy,
    deriveRngSeedR,
    deriveRngSeedQ,
} from '../teachers/b100_policy';
import { encodeAction } from '../../src/game/env';
import { GameEngine } from '../../src/game/engine';
import type { Action, GameState } from '../../src/game/types';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

interface PoolRow {
    stateJson: string;
    stateId: string;
    decisionSeat: number;
    allowedActionCodes: string[];
    policyInputKey: string | null;
}

const report: Record<string, unknown> = { schema: 'v17_b100_selftest_1', teacherVersion: B100_TEACHER_VERSION };

/* ---- 1. mulberryDefault ≡ mulberryStateful ---- */
{
    const seeds = [0, 1, 0xBEEF, 0xdeadbeef, 2609260100];
    const draws = 2000;
    let mismatches = 0;
    const firstMismatch: Array<Record<string, unknown>> = [];
    for (const seed of seeds) {
        const a = mulberryDefault(seed);
        const b = mulberryStateful(seed);
        for (let i = 0; i < draws; i += 1) {
            const va = a();
            const vb = b();
            if (va !== vb) {
                mismatches += 1;
                if (firstMismatch.length < 3) firstMismatch.push({ seed, i, a: va, b: vb });
            }
        }
    }
    // 恢复等价：从状态 s 新建实例 → 与该流「在 s 之后」的后缀逐值相同。
    let recoveryMismatches = 0;
    for (const seed of seeds) {
        const stream = mulberryStateful(seed);
        for (let i = 0; i < 37; i += 1) stream();
        const state = stream.getState();
        const tail = [] as number[];
        for (let i = 0; i < 50; i += 1) tail.push(stream());
        const resumed = mulberryStateful(state);
        for (let i = 0; i < 50; i += 1) if (resumed() !== tail[i]) recoveryMismatches += 1;
        if (rngStateHex(state) !== `0x${state.toString(16).padStart(8, '0')}`) recoveryMismatches += 1;
        if (parseRngStateHex(rngStateHex(state)) !== state) recoveryMismatches += 1;
    }
    report.rngEquivalence = {
        seeds,
        drawsPerSeed: draws,
        mismatches,
        firstMismatch,
        recoveryMismatches,
        pass: mismatches === 0 && recoveryMismatches === 0,
    };
}

/* ---- 2. 真实状态上的 R 恢复 / Q 一致性 ---- */
const statesPath = arg('--states', 'v17/out/v17_20260926_r2/teacher/states/qualify200.jsonl') as string;
const limit = Number(arg('--limit', '12'));
const abs = path.resolve(statesPath);
if (!fs.existsSync(abs)) {
    report.stateChecks = { skipped: true, reason: `状态文件不存在：${abs}` };
} else {
    const rows: PoolRow[] = [];
    for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        rows.push(JSON.parse(t) as PoolRow);
        if (rows.length >= limit) break;
    }
    let rActionMismatch = 0;
    let rRngMismatch = 0;
    let qActionMismatch = 0;
    const details: Array<Record<string, unknown>> = [];
    for (const row of rows) {
        const state = JSON.parse(row.stateJson) as GameState;
        const allowed = new GameEngine(JSON.parse(row.stateJson) as GameState)
            .getLegalActions(row.decisionSeat)
            .filter((a: Action) => a.type !== 'surrender') as Action[];

        // R 第一次：从派生 seed 新建实例
        const first = createB100Policy({ variant: 'B100-R', rootSeed: 2609260100, seat: row.decisionSeat });
        const ctx = { state, playerId: row.decisionSeat, allowed, seat: row.decisionSeat, seed: 2609260100 };
        const a1 = encodeAction(first.policy(ctx) as Action);
        const rec1 = first.decisions[0];

        // R 恢复：从 rngBeforeHex 新建实例（同一 rootSeed/seat，但显式覆盖状态）
        const recovered = createB100Policy({
            variant: 'B100-R', rootSeed: 2609260100, seat: row.decisionSeat,
            rngInitialState: parseRngStateHex(rec1.rngBeforeHex as string),
        });
        const a2 = encodeAction(recovered.policy(ctx) as Action);
        const rec2 = recovered.decisions[0];

        if (a1 !== a2) rActionMismatch += 1;
        if (rec1.rngAfterHex !== rec2.rngAfterHex) rRngMismatch += 1;

        // R 同一实例重复查询（统计计数不同）：状态重置到 rngBefore 后必须同动作
        const again = encodeAction((() => {
            first.resetRng(parseRngStateHex(rec1.rngBeforeHex as string));
            return first.policy(ctx) as Action;
        })());
        if (again !== a1) rActionMismatch += 1;

        // Q：三次完全相同的查询
        const qCodes: string[] = [];
        const qSeeds: number[] = [];
        for (let i = 0; i < 3; i += 1) {
            const handle = createB100Policy({
                variant: 'B100-Q', rootSeed: 2609260100, seat: row.decisionSeat,
                queryKeyOverride: row.policyInputKey ?? undefined,
            });
            qCodes.push(encodeAction(handle.policy(ctx) as Action));
            qSeeds.push(deriveRngSeedQ(B100_TEACHER_VERSION, (row.policyInputKey ?? 'x'), 0));
        }
        if (new Set(qCodes).size !== 1) qActionMismatch += 1;
        details.push({
            stateId: row.stateId,
            rFirst: a1,
            rRecovered: a2,
            rAgain: again,
            rngBefore: rec1.rngBeforeHex,
            rngAfterFirst: rec1.rngAfterHex,
            rngAfterRecovered: rec2.rngAfterHex,
            rngCalls: rec1.rngCalls,
            qCodes,
            qSeed: qSeeds[0],
        });
    }
    report.stateChecks = {
        statesFile: abs.replace(/\\/g, '/'),
        checked: rows.length,
        rActionMismatch,
        rRngMismatch,
        qActionMismatch,
        pass: rActionMismatch === 0 && rRngMismatch === 0 && qActionMismatch === 0,
        details,
    };
}

/* ---- 3. 观测开关等价（小样本冒烟；完整 ≥50 状态在 b100_instrumentation_ab.ts） ---- */
{
    const p = path.resolve(arg('--ab-states', 'v17/out/_smoke_b100/teacher/states/_pool/mirror_m0_s0.jsonl') as string);
    if (!fs.existsSync(p)) {
        report.instrumentationSmoke = { skipped: true, reason: `无状态文件 ${p}` };
    } else {
        const rows: PoolRow[] = [];
        for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
            const t = line.trim();
            if (t) rows.push(JSON.parse(t) as PoolRow);
        }
        let mismatch = 0;
        for (const row of rows) {
            const mk = (instrument: boolean): BattleSearchAI => new BattleSearchAI(0x1234, {
                ...B100_V11_CONFIG, instrument,
            } as never);
            const allowed = new GameEngine(JSON.parse(row.stateJson) as GameState)
                .getLegalActions(row.decisionSeat)
                .filter((a: Action) => a.type !== 'surrender') as Action[];
            const on = mk(true);
            const off = mk(false);
            const aOn = encodeAction(on.getAction(new GameEngine(JSON.parse(row.stateJson) as GameState), row.decisionSeat, allowed));
            const aOff = encodeAction(off.getAction(new GameEngine(JSON.parse(row.stateJson) as GameState), row.decisionSeat, allowed));
            if (aOn !== aOff) mismatch += 1;
        }
        report.instrumentationSmoke = { file: p.replace(/\\/g, '/'), checked: rows.length, mismatch, pass: mismatch === 0 };
    }
}

console.log(JSON.stringify(report, null, 2));
const okRng = (report.rngEquivalence as { pass: boolean }).pass;
const okStates = report.stateChecks && (report.stateChecks as { pass?: boolean; skipped?: boolean }).skipped !== true
    ? (report.stateChecks as { pass: boolean }).pass
    : true;
process.exit(okRng && okStates ? 0 : 1);
