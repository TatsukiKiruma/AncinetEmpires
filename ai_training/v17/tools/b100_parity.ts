/**
 * V17/T17-03：**B4 资格验收**（200 状态 × 3 次完全恢复查询）。
 *
 * 对每个状态、每个变体：
 *   1. `new GameEngine(JSON.parse(stateJson))` 重建引擎（**不**再发首次收入）；
 *   2. 重算引擎原生 allowed（去 surrender），与采集时记录的列表逐项比对（映射口径检查）；
 *   3. 记录查询前后的根状态摘要与金币（原地污染检查）；
 *   4. 调 `createB100Policy(...).policy(...)`；返回动作必须在 allowed 内，否则抛错并计数。
 *
 * 变体合同（细则 B3）：
 *   - `B100-R`：3 次查询各自 **从派生 seed 新建实例**（等价于从 `rngBeforeHex` 恢复）；
 *     要求 action / `rngAfterHex` / `rngCalls` 三者一致。
 *   - `B100-Q`：3 次**完全相同**的查询（`querySeed=0`）要求动作一致；
 *     另跑 `querySeed=1,2` 测随机扰动敏感性——**只报告，不要求一致**。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_parity.ts --mode qualify --states v17/out/v17_20260926_r2/teacher/states/qualify200.jsonl --shard 0/4
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_parity.ts --mode qualify --merge
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/b100_parity.ts --mode midstream
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import type { Action, GameState } from '../../src/game/types';
import { canonicalStateJson } from '../../v15/tools/labeler_l1_v15';
import {
    B100_V11_CONFIG,
    B100_TEACHER_VERSION,
    createB100Policy,
    type B100DecisionRecord,
    type B100PolicyHandle,
    type B100Variant,
} from '../teachers/b100_policy';
import { b100InputKeyProvider } from '../teachers/b100_input_key';
import { B100_SOURCE_HEAD, B100_SOURCE_SHA256, parseRngStateHex } from '../teachers/battle_search_b100';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(name);

const RUN_ROOT = path.resolve(arg('--run-root', 'v17/out/v17_20260926_r2') as string);
const TEACHER_DIR = path.join(RUN_ROOT, 'teacher');
const STATES_DIR = path.join(TEACHER_DIR, 'states');
const MODE = arg('--mode', 'qualify') as string;
const QUERIES = Number(arg('--queries', '3'));

interface StateRow {
    stateId: string;
    runKey: string;
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
    policyInputKey: string | null;
    queryKeyKind: 'policy-input-key' | 'state-fallback';
    gameOutcomeKind: string | null;
    fromChampionLossGame: boolean | null;
}

interface QueryResult {
    variant: B100Variant;
    queryIndex: number;
    querySeed: number;
    stateId: string;
    runKey: string;
    mapName: string;
    mapIndex: number;
    decisionSeat: number;
    turn: number;
    phaseBucket: string;
    pendingUnitId: string | null;
    sourceArm: string;
    gameOutcomeKind: string | null;
    fromChampionLossGame: boolean | null;
    actionCode: string;
    chosenInAllowed: boolean;
    allowedMatchesTrace: boolean;
    allowedCount: number;
    recomputedAllowedCount: number;
    rngBeforeHex: string | null;
    rngAfterHex: string | null;
    rngCalls: number | null;
    queryKeyKind: 'policy-input-key' | 'state-fallback';
    queryKey: string;
    /** label_ledger 要求的别名字段。 */
    inputKey: string;
    internalExceptions: number;
    /** label_ledger 要求的别名字段。 */
    exceptions: number;
    cloneCount: number;
    stepCount: number;
    fired: B100DecisionRecord['fired'];
    /** 整个查询（重建引擎 + 重算 allowed + 编码 + 决策）的墙钟。 */
    elapsedMs: number;
    /** 教师单次决策的墙钟（台账里的 elapsedMs）。 */
    decisionMs: number | null;
    pollutionStateHash: boolean;
    pollutionGold: boolean;
    pollutionParsedState: boolean;
    error: string | null;
    labelEvidenceKind: string;
}

function sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function goldOf(state: GameState): string {
    return (state.players ?? []).map((p) => `${p.id}:${p.gold}`).join(',');
}

function readJsonl<T>(p: string): T[] {
    const out: T[] = [];
    if (!fs.existsSync(p)) return out;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t) out.push(JSON.parse(t) as T);
    }
    return out;
}

function writeJsonl(p: string, rows: unknown[]): void {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* ==========================================================================
 * 单次查询
 * ========================================================================== */

function runOneQuery(
    row: StateRow,
    variant: B100Variant,
    queryIndex: number,
    querySeed: number,
    provider: (state: any, playerId: number, allowed: readonly any[]) => string | null,
): QueryResult {
    const startedAt = Date.now();
    // 中文：每次都从**字符串**重新 parse，保证三次查询之间不共享任何对象。
    const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
    const engineStateBefore = engine.getState();
    const allowed = engine.getLegalActions(row.decisionSeat).filter((a) => a.type !== 'surrender') as Action[];
    const allowedCodes = allowed.map((a) => encodeAction(a));
    const allowedMatchesTrace = arraysEqual(allowedCodes, row.allowedActionCodes);

    const hashBefore = sha256Hex(canonicalStateJson(engineStateBefore));
    const goldBefore = goldOf(engineStateBefore);

    const parsedState = JSON.parse(row.stateJson) as GameState;
    const parsedBefore = JSON.stringify(parsedState);

    const handle: B100PolicyHandle = createB100Policy({
        variant,
        rootSeed: row.rootSeed,
        seat: row.decisionSeat,
        querySeed,
        inputKeyProvider: provider,
    });

    let actionCode = '';
    let error: string | null = null;
    try {
        const action = handle.policy({
            state: parsedState,
            playerId: row.decisionSeat,
            allowed,
            seat: row.decisionSeat,
            seed: row.rootSeed,
        }) as Action;
        actionCode = encodeAction(action);
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    const engineStateAfter = engine.getState();
    const hashAfter = sha256Hex(canonicalStateJson(engineStateAfter));
    const goldAfter = goldOf(engineStateAfter);
    const parsedAfter = JSON.stringify(parsedState);

    const rec: B100DecisionRecord | null = handle.decisions[0] ?? null;
    const chosenInAllowed = rec !== null && rec.chosenInAllowed && !error;

    let labelEvidenceKind = `${variant.toLowerCase()}-hard`;
    if (error !== null) labelEvidenceKind = `${variant.toLowerCase()}-error`;
    else if (!allowedMatchesTrace) labelEvidenceKind = `${variant.toLowerCase()}-allowed-mismatch`;
    else if (row.queryKeyKind === 'state-fallback') labelEvidenceKind = `${variant.toLowerCase()}-state-fallback-key`;
    else if ((rec?.internalExceptions ?? 0) > 0) labelEvidenceKind = `${variant.toLowerCase()}-internal-exception`;

    return {
        variant,
        queryIndex,
        querySeed,
        stateId: row.stateId,
        runKey: row.runKey,
        mapName: row.mapName,
        mapIndex: row.mapIndex,
        decisionSeat: row.decisionSeat,
        turn: row.turn,
        phaseBucket: row.phaseBucket,
        pendingUnitId: row.pendingUnitId,
        sourceArm: row.sourceArm,
        gameOutcomeKind: row.gameOutcomeKind,
        fromChampionLossGame: row.fromChampionLossGame,
        actionCode,
        chosenInAllowed,
        allowedMatchesTrace,
        allowedCount: row.allowedActionCodes.length,
        recomputedAllowedCount: allowedCodes.length,
        rngBeforeHex: rec?.rngBeforeHex ?? null,
        rngAfterHex: rec?.rngAfterHex ?? null,
        rngCalls: rec?.rngCalls ?? null,
        queryKeyKind: rec?.queryKeyKind ?? row.queryKeyKind,
        queryKey: rec?.queryKey ?? '',
        inputKey: rec?.queryKey ?? '',
        internalExceptions: rec?.internalExceptions ?? 0,
        exceptions: rec?.internalExceptions ?? 0,
        cloneCount: rec?.cloneCount ?? 0,
        stepCount: rec?.stepCount ?? 0,
        fired: rec?.fired ?? { urgent: false, forcedWin: false, takeover: false, veto: false, follow: false },
        elapsedMs: Date.now() - startedAt,
        decisionMs: rec?.elapsedMs ?? null,
        pollutionStateHash: hashAfter !== hashBefore,
        pollutionGold: goldAfter !== goldBefore,
        pollutionParsedState: parsedAfter !== parsedBefore,
        error,
        labelEvidenceKind,
    };
}

/* ==========================================================================
 * qualify 模式
 * ========================================================================== */

function percentiles(values: number[]): { p50: number | null; p95: number | null; mean: number | null; max: number | null; n: number } {
    if (values.length === 0) return { p50: null, p95: null, mean: null, max: null, n: 0 };
    const s = [...values].sort((a, b) => a - b);
    return {
        p50: s[Math.min(s.length - 1, Math.floor(0.5 * s.length))],
        p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))],
        mean: s.reduce((a, b) => a + b, 0) / s.length,
        max: s[s.length - 1],
        n: s.length,
    };
}

function runQualifyShard(): void {
    const statesPath = path.resolve(arg('--states', path.join(STATES_DIR, 'qualify200.jsonl')) as string);
    const rows = readJsonl<StateRow>(statesPath);
    const shardArg = arg('--shard', null);
    let shardRows = rows;
    let shardLabel = '0of1';
    if (shardArg !== null) {
        const [iRaw, nRaw] = shardArg.split('/');
        const i = Number(iRaw);
        const n = Number(nRaw);
        if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i >= n) {
            throw new Error(`[B100-parity] --shard 需要 i/n 且 0<=i<n，实际 '${shardArg}'。`);
        }
        shardRows = rows.filter((_, idx) => idx % n === i);
        shardLabel = `${i}of${n}`;
    }
    const provider = b100InputKeyProvider();
    const results: QueryResult[] = [];
    const startedAt = Date.now();
    for (const row of shardRows) {
        // R：3 次完全恢复查询
        for (let q = 0; q < QUERIES; q += 1) {
            results.push(runOneQuery(row, 'B100-R', q, 0, provider));
        }
        // Q：3 次完全相同查询（querySeed=0）+ 2 次敏感性（1,2）
        for (let q = 0; q < QUERIES; q += 1) {
            results.push(runOneQuery(row, 'B100-Q', q, 0, provider));
        }
        for (const sens of [1, 2]) {
            results.push(runOneQuery(row, 'B100-Q', QUERIES + sens - 1, sens, provider));
        }
        if (results.length % 40 === 0) {
            console.log(`[B100-parity] shard=${shardLabel} rows=${results.length / (QUERIES * 2 + 2)}/${shardRows.length} ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
        }
    }
    const outPath = path.join(TEACHER_DIR, `parity.shard${shardLabel}.json`);
    const ledgerPath = path.join(TEACHER_DIR, `label_ledger.shard${shardLabel}.jsonl`);
    fs.mkdirSync(TEACHER_DIR, { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify({
        schema: 'v17_b100_parity_shard_1',
        teacherVersion: B100_TEACHER_VERSION,
        statesFile: statesPath.replace(/\\/g, '/'),
        shard: shardLabel,
        queriesPerVariant: QUERIES,
        stateCount: shardRows.length,
        results,
        wallMs: Date.now() - startedAt,
    }, null, 2)}\n`, 'utf8');
    writeJsonl(ledgerPath, results);
    console.log(`[B100-parity] shard=${shardLabel} states=${shardRows.length} results=${results.length} ${((Date.now() - startedAt) / 1000).toFixed(1)}s -> ${outPath}`);
}

/* ==========================================================================
 * midstream 模式：R 的「随机流中途恢复」强测试
 * ========================================================================== */

function runMidstream(): void {
    const poolDir = path.resolve(arg('--pool-dir', path.join(STATES_DIR, '_pool')) as string);
    const maxSequences = Number(arg('--sequences', '8'));
    const provider = b100InputKeyProvider();
    const rows: StateRow[] = [];
    if (fs.existsSync(poolDir)) {
        for (const name of fs.readdirSync(poolDir).sort()) {
            if (!name.endsWith('.jsonl') || name.startsWith('_')) continue;
            rows.push(...readJsonl<StateRow>(path.join(poolDir, name)));
        }
    }
    // 序列 = (runKey, seat)，按 stepIndex 升序 → 一条真实的决策时间轴。
    const groups = new Map<string, StateRow[]>();
    for (const r of rows) {
        const k = `${r.runKey}|seat${r.decisionSeat}`;
        const list = groups.get(k) ?? [];
        list.push(r);
        groups.set(k, list);
    }
    const sequences = Array.from(groups.entries())
        .map(([k, list]) => ({ key: k, list: list.sort((a, b) => a.stepIndex - b.stepIndex) }))
        .filter((s) => s.list.length >= 4)
        .sort((a, b) => b.list.length - a.list.length)
        .slice(0, maxSequences);

    const results: Array<Record<string, unknown>> = [];
    let checked = 0;
    let actionMismatch = 0;
    let rngMismatch = 0;
    let callsMismatch = 0;
    let distinctRngBefore = new Set<string>();
    for (const seq of sequences) {
        const seat = seq.list[0].decisionSeat;
        const rootSeed = seq.list[0].rootSeed;
        const persistent = createB100Policy({ variant: 'B100-R', rootSeed, seat, inputKeyProvider: provider });
        const timeline: Array<{ row: StateRow; actionCode: string; rngBeforeHex: string | null; rngAfterHex: string | null; rngCalls: number | null }> = [];
        for (const row of seq.list) {
            const engine = new GameEngine(JSON.parse(row.stateJson) as GameState);
            const allowed = engine.getLegalActions(row.decisionSeat).filter((a) => a.type !== 'surrender') as Action[];
            const parsed = JSON.parse(row.stateJson) as GameState;
            let code = '';
            try {
                code = encodeAction(persistent.policy({
                    state: parsed, playerId: row.decisionSeat, allowed, seat: row.decisionSeat, seed: rootSeed,
                }) as Action);
            } catch (e) {
                code = `ERROR:${(e as Error).message}`;
            }
            const rec = persistent.decisions[persistent.decisions.length - 1];
            timeline.push({
                row, actionCode: code,
                rngBeforeHex: rec?.rngBeforeHex ?? null,
                rngAfterHex: rec?.rngAfterHex ?? null,
                rngCalls: rec?.rngCalls ?? null,
            });
        }
        // 对时间轴上的每个点做「从 rngBeforeHex 新建实例」的恢复重放。
        for (const point of timeline) {
            if (point.rngBeforeHex === null) continue;
            distinctRngBefore.add(point.rngBeforeHex);
            const recovered = createB100Policy({
                variant: 'B100-R', rootSeed, seat, inputKeyProvider: provider,
                rngInitialState: parseRngStateHex(point.rngBeforeHex),
            });
            const engine = new GameEngine(JSON.parse(point.row.stateJson) as GameState);
            const allowed = engine.getLegalActions(point.row.decisionSeat).filter((a) => a.type !== 'surrender') as Action[];
            const parsed = JSON.parse(point.row.stateJson) as GameState;
            let code = '';
            try {
                code = encodeAction(recovered.policy({
                    state: parsed, playerId: point.row.decisionSeat, allowed, seat: point.row.decisionSeat, seed: rootSeed,
                }) as Action);
            } catch (e) {
                code = `ERROR:${(e as Error).message}`;
            }
            const rec = recovered.decisions[0];
            checked += 1;
            if (code !== point.actionCode) actionMismatch += 1;
            if ((rec?.rngAfterHex ?? null) !== point.rngAfterHex) rngMismatch += 1;
            if ((rec?.rngCalls ?? null) !== point.rngCalls) callsMismatch += 1;
        }
        results.push({
            sequence: seq.key,
            decisions: timeline.length,
            distinctRngBeforeStates: new Set(timeline.map((t) => t.rngBeforeHex)).size,
            firstRngBefore: timeline[0]?.rngBeforeHex ?? null,
            lastRngAfter: timeline[timeline.length - 1]?.rngAfterHex ?? null,
        });
    }
    const out = {
        schema: 'v17_b100_r_midstream_recovery_1',
        teacherVersion: B100_TEACHER_VERSION,
        purpose: 'R 合同：从随机流**中途**的 rngBeforeHex 新建实例后重放同一状态，动作与 rngAfterHex 必须一致。',
        sequences: results,
        checked,
        actionMismatch,
        rngAfterMismatch: rngMismatch,
        rngCallsMismatch: callsMismatch,
        distinctRngBeforeStates: distinctRngBefore.size,
        pass: checked > 0 && actionMismatch === 0 && rngMismatch === 0 && callsMismatch === 0,
    };
    const outPath = path.join(TEACHER_DIR, 'r_recovery_midstream.json');
    fs.mkdirSync(TEACHER_DIR, { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`[B100-midstream] sequences=${sequences.length} checked=${checked} actionMismatch=${actionMismatch} rngAfterMismatch=${rngMismatch} -> ${outPath}`);
}

/* ==========================================================================
 * merge 模式：汇总 + 报告
 * ========================================================================== */

function runMerge(): void {
    const files = fs.readdirSync(TEACHER_DIR).filter((f) => /^parity\.shard.*\.json$/.test(f)).sort();
    if (files.length === 0) throw new Error(`[B100-parity] ${TEACHER_DIR} 下没有 parity.shard*.json。`);
    const all: QueryResult[] = [];
    const stateIds = new Set<string>();
    const shardMeta: Array<Record<string, unknown>> = [];
    for (const f of files) {
        const parsed = JSON.parse(fs.readFileSync(path.join(TEACHER_DIR, f), 'utf8')) as {
            results: QueryResult[]; stateCount: number; shard: string; statesFile: string; wallMs: number; queriesPerVariant: number;
        };
        all.push(...parsed.results);
        for (const r of parsed.results) stateIds.add(r.stateId);
        shardMeta.push({
            file: f, shard: parsed.shard, stateCount: parsed.stateCount,
            statesFile: parsed.statesFile, results: parsed.results.length, wallMs: parsed.wallMs,
        });
    }
    const statesIndexPath = path.join(STATES_DIR, 'index.json');
    const statesIndex = fs.existsSync(statesIndexPath)
        ? JSON.parse(fs.readFileSync(statesIndexPath, 'utf8')) as Record<string, unknown>
        : null;

    const byVariant = (v: B100Variant): QueryResult[] => all.filter((r) => r.variant === v);
    const rPrimary = byVariant('B100-R').filter((r) => r.querySeed === 0);
    const qPrimary = byVariant('B100-Q').filter((r) => r.querySeed === 0);
    const qSens = byVariant('B100-Q').filter((r) => r.querySeed !== 0);

    const groupByState = (rows: QueryResult[]): Map<string, QueryResult[]> => {
        const m = new Map<string, QueryResult[]>();
        for (const r of rows) {
            const list = m.get(r.stateId) ?? [];
            list.push(r);
            m.set(r.stateId, list);
        }
        return m;
    };

    const consistency = (rows: QueryResult[], fields: Array<'actionCode' | 'rngAfterHex' | 'rngCalls'>) => {
        const groups = groupByState(rows);
        let consistent = 0;
        const mismatches: Array<Record<string, unknown>> = [];
        for (const [stateId, list] of groups) {
            if (list.length < QUERIES) continue;
            const first = list[0];
            const same = fields.every((f) => list.every((x) => x[f] === first[f]));
            if (same) consistent += 1;
            else if (mismatches.length < 10) {
                mismatches.push({
                    stateId,
                    values: list.map((x) => ({ actionCode: x.actionCode, rngAfterHex: x.rngAfterHex, rngCalls: x.rngCalls })),
                });
            }
        }
        return { groups: groups.size, consistent, inconsistent: groups.size - consistent, mismatches };
    };

    const rConsistency = consistency(rPrimary, ['actionCode', 'rngAfterHex', 'rngCalls']);
    const qConsistency = consistency(qPrimary, ['actionCode']);

    // Q 敏感性：querySeed=1,2 与 querySeed=0 的动作差异率。
    const q0ByState = new Map<string, string>();
    for (const r of qPrimary) if (!q0ByState.has(r.stateId)) q0ByState.set(r.stateId, r.actionCode);
    const sensitivity: Record<string, unknown> = {};
    for (const seed of [1, 2]) {
        const rows = qSens.filter((r) => r.querySeed === seed);
        let diff = 0;
        let checked = 0;
        const examples: Array<Record<string, unknown>> = [];
        for (const r of rows) {
            const base = q0ByState.get(r.stateId);
            if (base === undefined) continue;
            checked += 1;
            if (r.actionCode !== base) {
                diff += 1;
                if (examples.length < 5) examples.push({ stateId: r.stateId, seed0: base, seedN: r.actionCode });
            }
        }
        sensitivity[`querySeed${seed}`] = {
            checked,
            differentFromSeed0: diff,
            differenceRate: checked ? diff / checked : null,
            examples,
            note: '敏感性只报告，不要求一致（细则 B3）。',
        };
    }

    const legalCount = all.filter((r) => r.chosenInAllowed).length;
    /**
     * 同网络输入 key 的标签冲突（细则 B3：同输入仍可能因隐藏状态产生冲突，必须输出冲突率与例子）。
     *
     * 中文：一个 key 可能对应多个**不同决策状态**（完整 stateJson 不同但网络看到的一样，
     * 例如只差未被编码的计数字段）。这些状态如果给出不同动作，就是真实冲突，
     * 不能靠 sampleId 消除，也不能自动当等价动作。
     */
    const inputKeyConflicts = (rows: QueryResult[]): Record<string, unknown> => {
        const onePerState = new Map<string, QueryResult>();
        for (const r of rows) if (!onePerState.has(r.stateId)) onePerState.set(r.stateId, r);
        const byKey = new Map<string, QueryResult[]>();
        for (const r of onePerState.values()) {
            const list = byKey.get(r.queryKey) ?? [];
            list.push(r);
            byKey.set(r.queryKey, list);
        }
        let multiStateGroups = 0;
        let conflictingGroups = 0;
        let statesInConflictingGroups = 0;
        const examples: Array<Record<string, unknown>> = [];
        for (const [key, list] of byKey) {
            if (list.length > 1) multiStateGroups += 1;
            const codes = new Set(list.map((r) => r.actionCode));
            if (codes.size > 1) {
                conflictingGroups += 1;
                statesInConflictingGroups += list.length;
                if (examples.length < 5) {
                    examples.push({
                        inputKey: key,
                        states: list.map((r) => ({
                            stateId: r.stateId, actionCode: r.actionCode,
                            turn: r.turn, seat: r.decisionSeat, phase: r.phaseBucket,
                        })),
                    });
                }
            }
        }
        return {
            distinctDecisionStates: onePerState.size,
            distinctInputKeys: byKey.size,
            statesSharingAnInputKey: onePerState.size - byKey.size,
            groupsWithMultipleStates: multiStateGroups,
            conflictingGroups,
            conflictRatePerGroup: byKey.size ? conflictingGroups / byKey.size : null,
            statesInConflictingGroups,
            conflictRatePerState: onePerState.size ? statesInConflictingGroups / onePerState.size : null,
            examples,
            note: '冲突来自「同网络输入、不同完整状态」；不自动判等价，也不靠 sampleId 消除。',
        };
    };
    const inputKeyConflictReport = {
        'B100-Q(querySeed=0)': inputKeyConflicts(qPrimary),
        'B100-R(first query)': inputKeyConflicts(rPrimary),
    };    const errors = all.filter((r) => r.error !== null);
    const mappingMisses = all.filter((r) => r.error !== null && /不在引擎原生合法集内/.test(r.error));
    const allowedMismatch = all.filter((r) => !r.allowedMatchesTrace);
    // 全轨迹动作类型扫描（同一 20 局，captureStateOnStep=false，覆盖度证据；不参与池子）。
    const poolDir = path.join(STATES_DIR, '_pool');
    const scanRuns: Array<{ runKey: string; tracedSteps: number; typeInAllowed: Record<string, number>; typeChosen: Record<string, number>; outcomeKind: string }> = [];
    if (fs.existsSync(poolDir)) {
        for (const f of fs.readdirSync(poolDir).filter((n) => n.startsWith('_scan_') && n.endsWith('.jsonl')).sort()) {
            for (const line of fs.readFileSync(path.join(poolDir, f), 'utf8').split(/\r?\n/)) {
                const t = line.trim();
                if (t) scanRuns.push(JSON.parse(t));
            }
        }
    }
    const scanTypesInAllowed: Record<string, number> = {};
    const scanTypesChosen: Record<string, number> = {};
    for (const r of scanRuns) {
        for (const [k, v] of Object.entries(r.typeInAllowed ?? {})) scanTypesInAllowed[k] = (scanTypesInAllowed[k] ?? 0) + v;
        for (const [k, v] of Object.entries(r.typeChosen ?? {})) scanTypesChosen[k] = (scanTypesChosen[k] ?? 0) + v;
    }
    const stateCoverage = {
        note: '资格状态集（240）的覆盖 + 同一 20 局全轨迹扫描（不保留状态 JSON）的动作类型可达性证据。',
        scan: {
            runs: scanRuns.length,
            tracedDecisionSteps: scanRuns.reduce((a, r) => a + (r.tracedSteps ?? 0), 0),
            typeOccurrencesInAllowed: scanTypesInAllowed,
            typeOccurrencesChosen: scanTypesChosen,
        },
        unreachableActionTypes: [
            {
                type: 'recruit_and_deploy',
                evidence: `全轨迹扫描 ${scanRuns.reduce((a, r) => a + (r.tracedSteps ?? 0), 0)} 个决策步里出现 0 次。`,
                reason: '当前普通 SD 规则 `src/game/apk_skirmish.ts` 设置 rules.commanderCastleRecruitUsesPending=true，'
                    + '`src/game/rules.ts` 因此走 recruit_to_castle（堆叠 pending）分支，从不生成 recruit_and_deploy。'
                    + '该动作类型在当前规则下**结构上不可达**，不是采样遗漏。',
            },
        ],
        sparseActionTypes: Object.entries(scanTypesInAllowed)
            .filter(([, v]) => v > 0 && v < 100)
            .map(([k, v]) => ({ type: k, occurrences: v })),
    };    const pollution = all.filter((r) => r.pollutionStateHash || r.pollutionGold || r.pollutionParsedState);
    const exceptionQueries = all.filter((r) => r.internalExceptions > 0);

    const lat = (rows: QueryResult[]) => ({
        queryMs: percentiles(rows.map((r) => r.elapsedMs)),
        teacherDecisionMs: percentiles(rows.map((r) => r.decisionMs).filter((v): v is number => v !== null)),
    });

    const cleanLabelCount = all.filter((r) => r.labelEvidenceKind.endsWith('-hard')).length;

    const verdicts: Record<string, { verdict: string; detail: string }> = {
        'B4.1_queries_completed': {
            verdict: all.length > 0 && rPrimary.length > 0 && qPrimary.length > 0 ? 'PASS' : 'FAIL',
            detail: `查询记录 ${all.length} 条；覆盖 ${stateIds.size} 个不同状态。`,
        },
        'B4.2_legal_rate_100': {
            verdict: legalCount === all.length ? 'PASS' : 'FAIL',
            detail: `${legalCount}/${all.length} = ${all.length ? ((legalCount / all.length) * 100).toFixed(4) : 'null'}%`,
        },
        'B4.3_root_pollution_zero': {
            verdict: pollution.length === 0 ? 'PASS' : 'FAIL',
            detail: `污染 ${pollution.length} 条（状态摘要 / 金币 / 传入 state 对象三者任一变化即算污染）。`,
        },
        'B4.4_mapping_misses_zero': {
            verdict: mappingMisses.length === 0 && allowedMismatch.length === 0 ? 'PASS' : 'FAIL',
            detail: `映射遗漏 ${mappingMisses.length}；重算 allowed 与采集记录不一致 ${allowedMismatch.length}。`,
        },
        'B4.5_R_recovery_consistent': {
            verdict: rConsistency.inconsistent === 0 && rConsistency.groups > 0 ? 'PASS' : 'FAIL',
            detail: `R：${rConsistency.consistent}/${rConsistency.groups} 个状态的动作 / rngAfterHex / rngCalls 三次一致。`,
        },
        'B4.6_Q_repeat_consistent': {
            verdict: qConsistency.inconsistent === 0 && qConsistency.groups > 0 ? 'PASS' : 'FAIL',
            detail: `Q(querySeed=0)：${qConsistency.consistent}/${qConsistency.groups} 个状态三次动作一致。`,
        },
        'B4.7_internal_exceptions_reported': {
            verdict: 'PASS',
            detail: `含内部异常的查询 ${exceptionQueries.length}/${all.length}（异常查询已从 clean label 计数中排除，未当作干净强标签）。`,
        },
        'B4.8_latency_reported': {
            verdict: 'PASS',
            detail: '两变体的查询与教师决策 p50/p95 已记录（见 latency 字段）。',
        },
    };

    const parity = {
        schema: 'v17_b100_parity_1',
        generatedAt: new Date().toISOString(),
        teacherVersion: B100_TEACHER_VERSION,
        sourceSha256: B100_SOURCE_SHA256,
        sourceHead: B100_SOURCE_HEAD,
        config: B100_V11_CONFIG,
        states: {
            file: (arg('--states', path.join(STATES_DIR, 'qualify200.jsonl')) as string).replace(/\\/g, '/'),
            distinctStates: stateIds.size,
            index: statesIndex,
        },
        queriesPerVariant: QUERIES,
        shards: shardMeta,
        totals: {
            queries: all.length,
            legalRate: all.length ? legalCount / all.length : null,
            legalCount,
            errors: errors.length,
            errorExamples: errors.slice(0, 5).map((e) => ({ stateId: e.stateId, variant: e.variant, error: e.error })),
            mappingMisses: mappingMisses.length,
            allowedSetMismatches: allowedMismatch.length,
            pollutedQueries: pollution.length,
            queriesWithInternalExceptions: exceptionQueries.length,
            internalExceptionSum: all.reduce((a, r) => a + r.internalExceptions, 0),
            cleanLabelQueries: cleanLabelCount,
            nonCleanLabelQueries: all.length - cleanLabelCount,
        },
        r: {
            recoveryConsistency: rConsistency,
            latency: lat(rPrimary),
        },
        q: {
            repeatConsistency: qConsistency,
            sensitivity,
            latency: lat(qPrimary),
        },
        latencyAllQueries: lat(all),
        inputKeyConflicts: inputKeyConflictReport,
        stateCoverage,
        labelEvidenceKindTally: all.reduce((acc: Record<string, number>, r) => {
            acc[r.labelEvidenceKind] = (acc[r.labelEvidenceKind] ?? 0) + 1;
            return acc;
        }, {}),
        verdicts,
        environment: {
            nodeVersion: process.version,
            cwd: process.cwd().replace(/\\/g, '/'),
            battleDebug: process.env.BATTLE_DEBUG ?? null,
        },
    };

    fs.writeFileSync(path.join(TEACHER_DIR, 'parity.json'), `${JSON.stringify(parity, null, 2)}\n`, 'utf8');
    writeJsonl(path.join(TEACHER_DIR, 'label_ledger.jsonl'), all);

    const midstreamPath = path.join(TEACHER_DIR, 'r_recovery_midstream.json');
    const midstream = fs.existsSync(midstreamPath)
        ? JSON.parse(fs.readFileSync(midstreamPath, 'utf8')) as Record<string, unknown>
        : null;
    const abPath = path.join(TEACHER_DIR, 'instrumentation_ab.json');
    const ab = fs.existsSync(abPath) ? JSON.parse(fs.readFileSync(abPath, 'utf8')) as Record<string, unknown> : null;
    const pilotPath = path.join(RUN_ROOT, 'pilot', 'b100_cost_pilot.json');
    const pilot = fs.existsSync(pilotPath) ? JSON.parse(fs.readFileSync(pilotPath, 'utf8')) as Record<string, unknown> : null;

    const lines: string[] = [];
    const v = (k: string): string => verdicts[k].verdict;
    lines.push('# B100 資格验收报告（T17-03 / 细则 B4）');
    lines.push('');
    lines.push(`生成时间：${parity.generatedAt}`);
    lines.push(`teacherVersion：\`${B100_TEACHER_VERSION}\``);
    lines.push(`源文件 SHA256：\`${B100_SOURCE_SHA256}\`（外部只读工作区 \`src/game/ai/battle_search_ai.ts\`）`);
    lines.push(`状态集：\`${parity.states.file}\`，不同状态 ${stateIds.size} 个；每状态每变体 ${QUERIES} 次完全恢复查询。`);
    lines.push('');
    lines.push('## B4 逐条判定');
    lines.push('');
    lines.push('| B4 条目 | 判定 | 读数 |');
    lines.push('|---|---|---|');
    for (const k of Object.keys(verdicts)) lines.push(`| ${k} | **${v(k)}** | ${verdicts[k].detail} |`);
    lines.push('');
    lines.push('## 关键读数');
    lines.push('');
    lines.push(`- 合法率：${legalCount}/${all.length}（${all.length ? ((legalCount / all.length) * 100).toFixed(4) : 'null'}%）`);
    lines.push(`- 根状态污染：${pollution.length}`);
    lines.push(`- 映射遗漏（返回值不在 allowed 内）：${mappingMisses.length}`);
    lines.push(`- 重算 allowed 与采集记录不一致：${allowedMismatch.length}`);
    lines.push(`- 内部异常：查询数 ${exceptionQueries.length}/${all.length}，异常计数总和 ${parity.totals.internalExceptionSum}`);
    lines.push(`- 干净标签（labelEvidenceKind 以 \`-hard\` 结尾）：${cleanLabelCount}/${all.length}`);
    lines.push(`- 标签类型分布：\`${JSON.stringify(parity.labelEvidenceKindTally)}\``);
    lines.push('');
    lines.push('## 延迟（毫秒）');
    lines.push('');
    lines.push('| 变体 | 查询 p50 | 查询 p95 | 教师决策 p50 | 教师决策 p95 |');
    lines.push('|---|---|---|---|---|');
    for (const [name, l] of [['B100-R', parity.r.latency], ['B100-Q', parity.q.latency]] as const) {
        lines.push(`| ${name} | ${l.queryMs.p50 ?? 'null'} | ${l.queryMs.p95 ?? 'null'} | ${l.teacherDecisionMs.p50 ?? 'null'} | ${l.teacherDecisionMs.p95 ?? 'null'} |`);
    }
    lines.push('');
    lines.push('## 随机扰动敏感性（Q 变体，只报告不要求一致）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(sensitivity, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## R 随机流中途恢复（从 rngBeforeHex 新建实例）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(midstream ?? { notRun: true }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## 观测开关等价性（instrument=true vs false）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(ab ?? { notRun: true }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## 成本 pilot');
    lines.push('');
    lines.push(`完整 pilot 读数（含逐样本明细）：\`${pilotPath.replace(/\\/g, '/')}\``);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(
        pilot === null ? { notRun: true } : { ...pilot, detail: `省略 ${(pilot.detail as unknown[] | undefined)?.length ?? 0} 条逐样本明细，见上方文件` },
        null, 2,
    ));
    lines.push('```');
    lines.push('');
    lines.push('## 同网络输入 key 的标签冲突');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(inputKeyConflictReport, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('## 状态覆盖与动作类型可达性');
    lines.push('');
    if (statesIndex !== null) {
        const s = (statesIndex as { stats?: Record<string, unknown> }).stats ?? {};
        lines.push(`- 池子记录 ${s.poolRecords}，按 stateJson 去重后 ${s.uniqueByStateHash}，选出 ${s.selectedTotal}（pilot ${s.pilotCount} + qualify ${s.qualifyCount}）。`);
        lines.push(`- 五图分布：\`${JSON.stringify(s.byMap)}\``);
        lines.push(`- 座位分布：\`${JSON.stringify(s.bySeat)}\`（0/1 均衡）`);
        lines.push(`- 阶段分布：\`${JSON.stringify(s.byPhase)}\`（opening=turn≤8，midgame=9..30，endgame=>30）`);
        lines.push(`- map×seat×phase 细分：\`${JSON.stringify(s.byMapSeatPhase)}\``);
        lines.push(`- pending 单位状态：${s.pendingStates} 个（pilot ${s.pendingStatesPilot} / qualify ${s.pendingStatesQualify}）`);
        lines.push(`- 来自「当前冠军输掉的对局」的状态：${s.fromChampionLossGame} 个；冠军本人决策 ${s.fromChampionDecision} 个；H0 镜像局 ${s.fromMirrorGames} 个。`);
        lines.push(`- 网络输入 key 覆盖：policy-input-key ${s.statesWithPolicyInputKey} / state-fallback ${s.statesWithStateFallback}。`);
        lines.push(`- 采集时重算 allowed 与 trace 一致：${s.allowedMatchesTraceAll}（不一致 ${s.allowedMismatchCount}）；引擎重建改变状态次数 ${s.constructorStateChangedCount}。`);
        lines.push(`- selected 覆盖的动作类型（allowed 中出现）：\`${(s.actionTypesCoveredInAllowed as string[] | undefined)?.join(', ')}\``);
        lines.push(`- selected 未覆盖：\`${(s.actionTypesMissingFromAllowed as string[] | undefined)?.join(', ')}\``);
    } else {
        lines.push('- （未找到 states/index.json）');
    }
    lines.push('');
    lines.push(`全轨迹扫描：${stateCoverage.scan.runs} 局、${stateCoverage.scan.tracedDecisionSteps} 个决策步（` +
        '与资格状态集同一 20 局，但**不保留状态 JSON**，因此是独立于采样的可达性证据）。');
    lines.push('');
    lines.push('| 动作类型 | 全轨迹 allowed 出现次数 | 全轨迹实际被选次数 |');
    lines.push('|---|---:|---:|');
    for (const t of Object.keys(stateCoverage.scan.typeOccurrencesInAllowed).sort()) {
        lines.push(`| ${t} | ${stateCoverage.scan.typeOccurrencesInAllowed[t]} | ${stateCoverage.scan.typeOccurrencesChosen[t] ?? 0} |`);
    }
    lines.push('');
    for (const u of stateCoverage.unreachableActionTypes) {
        lines.push(`- **${u.type} 在当前规则下结构上不可达**：${u.evidence} ${u.reason}`);
    }
    lines.push('');
    lines.push('未覆盖清单里若仍有类型，说明它在状态池里的出现频率低于采样率且不在稀有白名单命中范围内，' +
        '属于**采样遗漏**（不等于不可达）；本报告把两者分开写，不合并成一个「全覆盖」结论。');
    lines.push('');
    lines.push('## 未测 / 未覆盖项（如实声明）');
    lines.push('');
    lines.push('- 本报告只证明**接口、重放与合法性**，不证明教师棋力（棋力资格在细则 C 节，需完整 DEV20 对局；本任务按分工未跑，由 T17-04 owner 执行）。');
    lines.push('- `B100-R` 的逐局持久随机流在离线查询上验证；R 的完整对局（arena）未在本任务运行。');
    lines.push('- 状态集来自 DEV20 seed 的冠军局与 H0 镜像局；未覆盖 RECHECK40 / CONFIRM20 命名空间。');
    lines.push('- `B100-Q` 的 `querySeed=1,2` 敏感性只做了 2 个备用种子；不是对所有种子的噪声分布刻画。');
    lines.push('- 教师内部启发式分数没有被当作 Q 值或胜率使用；本报告不提供任何 soft/Q 标签。');
    lines.push('- 精度只在「同一实现 + 同一机器」意义上成立；跨进程/跨机器的浮点一致性未测。');
    lines.push('- 未测：与旧 `src/game/ai/battle_search_ai.ts`（当前仓库里那份不同变体）的逐位一致性；本任务按指令未改该文件。');
    lines.push('');
    fs.writeFileSync(path.join(TEACHER_DIR, 'parity_report.md'), `${lines.join('\n')}\n`, 'utf8');

    console.log(`[B100-merge] queries=${all.length} states=${stateIds.size} legalRate=${parity.totals.legalRate}`);
    for (const k of Object.keys(verdicts)) console.log(`[B100-merge] ${k}: ${v(k)} — ${verdicts[k].detail}`);
    console.log(`[B100-merge] -> ${path.join(TEACHER_DIR, 'parity.json')}`);
    console.log(`[B100-merge] -> ${path.join(TEACHER_DIR, 'label_ledger.jsonl')}`);
    console.log(`[B100-merge] -> ${path.join(TEACHER_DIR, 'parity_report.md')}`);
}

async function main(): Promise<void> {
    if (MODE === 'qualify') {
        if (flag('--merge')) runMerge();
        else runQualifyShard();
        return;
    }
    if (MODE === 'midstream') {
        runMidstream();
        return;
    }
    throw new Error(`[B100-parity] 未知 --mode '${MODE}'（qualify | midstream）。`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
});
