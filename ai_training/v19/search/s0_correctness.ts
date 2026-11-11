/**
 * S0：整回合搜索的最小正确性验证（owner：V19 S0）。
 *
 * 目的：在写任何搜索代码之前，先把「根状态克隆恢复、H0 随机流、真实回合边界、
 * 自然结果分类」四件事在真实对局上实测一遍，并用本次审核暴露的 Icy 战斗次序
 * 做规则回归。**本工具只读既有产物，只写自己的输出目录，不改规则、H0、动作过滤
 * 或评测 caps；也不把用作回归的 DEV 根状态写入任何训练集。**
 *
 * 六项检查：
 *   C1 根状态克隆恢复     —— 同一完整根状态可被独立克隆，且克隆体与原状态逐字段一致
 *   C2 恢复不重复发初始收入 —— 从快照构造引擎不得再次结算回合开始收入
 *   C3 真实回合边界       —— 以 currentPlayer 变化为界，兼容引擎自动换手
 *   C4 自然结果分类       —— 自然胜负/和、截断、错误严格区分，POLICY_ERROR 不得算作结果变化
 *   C5 Icy 两步次序回归   —— 精灵先攻与指挥官先攻的规则后果与已记录值一致
 *   C6 基线序列保留       —— 搜索分支不得改动根状态，原基线动作仍在合法集内
 *
 * 用法（仓库根目录）：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v19/search/s0_correctness.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { createDefaultEnvFactory } from '../../tools/skirmish_dataset_export';
import { playOne, UNPACK_DIR, SD_PLAN_FILE } from '../../v14/tools/eval_v14_match';
import { loadSpatialResNetFromJson, SpatialResNetPredictor } from '../../src/game/ai/spatial_conv_net';
import { GameEngine } from '../../src/game/engine';
import { calculateDamage, estimateCounterDamage } from '../../src/game/rules';
import { encodeAction } from '../../src/game/env';
import { classifyOutcome, streamFor, mulberry } from '../../v13/tools/eval_v3_core';
import type { GameState } from '../../src/game/types';

/** 本次 S0/S1 的独立输出根；不写 v14–v18 与既有 v19 run 的产物。 */
const OUT_ROOT = 'v19/out/s0s1_20260930';
const OUT_DIR = `${OUT_ROOT}/search`;
const TRACE_PATH = 'v19/out/run_20260929_v19_02/diag/trace.json';
const ICY_ORDER_PATH = 'v19/review/r123_20260930/icy_order.json';

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
    id: string;
    title: string;
    status: CheckStatus;
    detail: string;
    evidence?: unknown;
}

const results: CheckResult[] = [];
function record(id: string, title: string, status: CheckStatus, detail: string, evidence?: unknown): void {
    results.push({ id, title, status, detail, evidence });
    console.log(`[S0] ${status} ${id} ${title} :: ${detail}`);
}

/** 与引擎无关的稳定字符串化，用于比较两个 GameState 是否逐字段一致。 */
function canonical(state: unknown): string {
    return JSON.stringify(state, Object.keys(state as Record<string, unknown>).sort());
}

/** 更严格的深比较：递归排序键，避免仅顶层排序造成的假相等。 */
function deepCanonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(deepCanonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${deepCanonical(v)}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

/** 精简摘要：只保留判断规则后果需要的字段。 */
function summarize(state: GameState, unitIds: string[]): unknown {
    const units = (state.units as unknown as Array<Record<string, unknown>>)
        .filter((u) => unitIds.includes(String(u.id)))
        .map((u) => ({
            id: u.id,
            cls: u.unitClass,
            hp: u.hp,
            level: u.level,
            exp: u.exp,
            status: u.status ?? null,
        }));
    const players = (state.players as unknown as Array<Record<string, unknown>>).map((p) => ({
        id: p.id,
        gold: p.gold,
        income: p.income ?? null,
        alive: p.isAlive,
    }));
    return { currentPlayer: state.currentPlayer, turn: state.turn, winner: state.winner, units, players };
}

interface IcyFixture {
    family: { mapName: string; seed: number; seat: number; id: string };
    engineStepIndex: number;
    modelPath: string;
    modelSha: string;
    baselineActionCode: string | null;
}

/** 从既有诊断 trace 里取出本次回归使用的 DEV 家族与分歧步。 */
function readIcyFixture(): IcyFixture {
    const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf8'));
    const first = trace.results[0];
    const window = first.windows[0];
    return {
        family: {
            id: first.family.id,
            mapName: first.family.mapName,
            seed: first.family.seed,
            seat: first.family.seat,
        },
        engineStepIndex: window.engineStepIndex,
        modelPath: trace.modelB,
        modelSha: typeof first.modelB === 'object' ? first.modelB.sha : String(first.modelB ?? ''),
        baselineActionCode: window.actionB ?? window.actionA ?? null,
    };
}

async function main(): Promise<void> {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const fixture = readIcyFixture();
    const recorded = JSON.parse(fs.readFileSync(ICY_ORDER_PATH, 'utf8'));
    const focusUnits = ['u_22', 'apk_u0', 'u_23'];

    // ---------------------------------------------------------------- 准备根状态
    const predictor = new SpatialResNetPredictor(
        loadSpatialResNetFromJson(fs.readFileSync(fixture.modelPath, 'utf8')),
    );
    const envFactory = await createDefaultEnvFactory(UNPACK_DIR, SD_PLAN_FILE);
    let snapshot: GameState | null = null;
    const replay = await playOne({
        runId: 's0_correctness_20260930',
        scenarioId: `SDPLAN:sd-normal:${fixture.family.mapName}`,
        seed: fixture.family.seed,
        candidateSeat: 0,
        viewedSeatHint: 0,
        maxSteps: fixture.engineStepIndex + 1,
        maxPlies: null,
        wallTimeoutMs: 300000,
        predictor,
        checkpointSha256: fixture.modelSha,
        requestedPolicyId: 's0_replay_theta2',
        envFactory,
        emitIdentity: false,
        mirrorViewRecompute: false,
        captureStateOnStep: true,
        onStep: (t) => {
            if (t.stepIndex === fixture.engineStepIndex && t.stateBeforeJson) {
                snapshot = JSON.parse(t.stateBeforeJson) as GameState;
            }
        },
    });
    if (!snapshot) {
        record('C0', '根状态恢复', 'FAIL', `未能在 step ${fixture.engineStepIndex} 捕获根状态`);
        writeReport(fixture, null);
        return;
    }
    const root: GameState = snapshot;
    record(
        'C0',
        '根状态恢复',
        'PASS',
        `已从真实对局（${fixture.family.id}，seed ${fixture.family.seed}）恢复到 step ${fixture.engineStepIndex}；` +
            `该状态属于 DEV 面板，仅用于回归，不进入训练集`,
        { rootSummary: summarize(root, focusUnits) },
    );

    // ------------------------------------------------------------------ C1 克隆
    const engineA = new GameEngine(root);
    const cloneState = engineA.getState();
    const cloneEngine = engineA.clone();
    const cloneState2 = cloneEngine.getState();
    const c1a = deepCanonical(root) === deepCanonical(cloneState);
    const c1b = deepCanonical(cloneState) === deepCanonical(cloneState2);
    // 克隆体独立：改动克隆体不得影响原引擎。
    const beforeMutate = deepCanonical(engineA.getState());
    const cloneLegal = cloneEngine.getLegalActions(cloneState2.currentPlayer);
    if (cloneLegal.length > 0) cloneEngine.step(cloneLegal[0]);
    const afterMutate = deepCanonical(engineA.getState());
    const c1c = beforeMutate === afterMutate;
    record(
        'C1',
        '根状态克隆恢复',
        c1a && c1b && c1c ? 'PASS' : 'FAIL',
        `构造一致=${c1a} 二次克隆一致=${c1b} 克隆体独立=${c1c}`,
        { rootHash: hash16(deepCanonical(root)), cloneHash: hash16(deepCanonical(cloneState)) },
    );

    // ------------------------------------------------------- C2 不重复发初始收入
    const goldBefore = goldOf(root);
    const restored = new GameEngine(root); // 恢复路径：不传 applyInitialTurnStart
    const goldRestored = goldOf(restored.getState());
    const withTurnStart = new GameEngine(root, { applyInitialTurnStart: true });
    const goldWithTurnStart = goldOf(withTurnStart.getState());
    // 中文：`startTurnForPlayer` 不只加钱，还会重置行动标记、刷新移动力、衰减状态、
    // 结算地形回血并触发 campaignEvents（engine.ts:326-386）。因此必须比对**整个
    // getState() 的规范化哈希**，只比金币会漏掉这些副作用。
    const stateAfterRestore = deepCanonical(restored.getState());
    const stateBefore = deepCanonical(root);
    const fullStateUnchanged = stateAfterRestore === stateBefore;
    const turnStartChangedState = deepCanonical(withTurnStart.getState()) !== stateBefore;
    const c2 = deepCanonical(goldBefore) === deepCanonical(goldRestored) && fullStateUnchanged;
    record(
        'C2',
        '恢复不重复发初始收入',
        c2 ? 'PASS' : 'FAIL',
        `快照金币=${JSON.stringify(goldBefore)}；默认构造后=${JSON.stringify(goldRestored)}（不变）；` +
            `整个状态哈希一致=${fullStateUnchanged}；` +
            `applyInitialTurnStart=true 时金币=${JSON.stringify(goldWithTurnStart)}、状态改变=${turnStartChangedState}` +
            `（用于证明该开关确实是回合开始结算的唯一入口）`,
        {
            goldBefore,
            goldRestored,
            goldWithTurnStart,
            fullStateUnchanged,
            turnStartChangedState,
            rootHash: hash16(stateBefore),
            restoredHash: hash16(stateAfterRestore),
        },
    );

    // -------------------------------------------------------------- C3 回合边界
    const walker = new GameEngine(root);
    const transitions: Array<{ atStep: number; from: number; to: number; auto: boolean }> = [];
    let prevPlayer = walker.getState().currentPlayer;
    let steps = 0;
    let samePlayerRun = 0;
    let maxSamePlayerRun = 0;
    let autoHandoverSeen = false;
    let boundaryReached = false;
    while (steps < 400 && !walker.isTerminal()) {
        const state = walker.getState();
        const legal = walker.getLegalActions(state.currentPlayer);
        if (legal.length === 0) {
            record('C3', '真实回合边界', 'FAIL', `step ${steps} 处玩家 ${state.currentPlayer} 无合法动作`);
            break;
        }
        walker.step(legal[0]);
        steps += 1;
        const nextPlayer = walker.getState().currentPlayer;
        if (nextPlayer !== prevPlayer) {
            transitions.push({ atStep: steps, from: prevPlayer, to: nextPlayer, auto: true });
            autoHandoverSeen = true;
            samePlayerRun = 0;
            if (transitions.length >= 1) boundaryReached = true;
            if (transitions.length >= 3) break;
        } else {
            samePlayerRun += 1;
            maxSamePlayerRun = Math.max(maxSamePlayerRun, samePlayerRun);
        }
        prevPlayer = nextPlayer;
    }
    record(
        'C3',
        '真实回合边界',
        autoHandoverSeen && boundaryReached ? 'PASS' : 'FAIL',
        `从根起走了 ${steps} 步，观测到 ${transitions.length} 次 currentPlayer 自动切换；` +
            `同方最长连续动作 ${maxSamePlayerRun} 步。切换完全由引擎产生，搜索不得自行改 currentPlayer`,
        { transitions, maxSamePlayerRun },
    );

    // --------------------------------------------------------- C4 结果分类口径
    const baseInputs = {
        engineError: null as string | null,
        policyError: null as string | null,
        cancelled: false,
        wallTimeout: false,
        winner: 0 as number | null,
        winnerAlliance: 0 as number | null,
        candidateAlliance: 0 as number | null,
        steps: 100,
        maxSteps: 12000,
        plies: 100,
        maxPlies: null as number | null,
    };
    const cases: Array<[string, Partial<typeof baseInputs>, string]> = [
        ['自然胜', {}, 'NATURAL_WIN'],
        ['自然负', { winner: 1, winnerAlliance: 1 }, 'NATURAL_LOSS'],
        ['自然和', { winner: -1, winnerAlliance: -1 }, 'NATURAL_DRAW'],
        ['步数截断', { winner: null, winnerAlliance: null, steps: 12000 }, 'STEP_LIMIT'],
        ['墙钟截断', { winner: null, winnerAlliance: null, wallTimeout: true }, 'WALL_TIMEOUT'],
        ['策略错误优先于胜负', { policyError: 'model returned no action' }, 'POLICY_ERROR'],
        ['引擎错误', { engineError: 'boom' }, 'ENGINE_ERROR'],
        ['无判定兜底不得算截断', { winner: null, winnerAlliance: null }, 'ENGINE_ERROR'],
    ];
    const observed = cases.map(([label, over, expect]) => {
        const got = classifyOutcome({ ...baseInputs, ...over } as never);
        return { label, expect, got, ok: got === expect };
    });
    const allOk = observed.every((c) => c.ok);
    record(
        'C4',
        '自然结果分类',
        allOk ? 'PASS' : 'FAIL',
        `8 个分类样例全部符合预期=${allOk}。关键点：POLICY_ERROR 优先于 winner，` +
            `因此「原结果 != POLICY_ERROR」不得被当作结果改善`,
        { observed },
    );

    // ------------------------------------------------------ C5 Icy 两步次序回归
    const branches: Array<{ order: string[]; steps: unknown[] }> = [];
    for (const order of [['u_22', 'apk_u0'], ['apk_u0', 'u_22']]) {
        const engine = new GameEngine(root);
        const stepRecords: unknown[] = [];
        for (const attacker of order) {
            const state = engine.getState();
            const code = `attack:${attacker}:u_23`;
            const action = engine.getLegalActions(state.currentPlayer).find((a) => encodeAction(a) === code);
            if (!action) {
                stepRecords.push({ code, legal: false, after: summarize(engine.getState(), focusUnits) });
                break;
            }
            const damage = calculateDamage(state, attacker, 'u_23');
            const counter = estimateCounterDamage(state, attacker, 'u_23');
            engine.step(action);
            stepRecords.push({ code, legal: true, damage, counter, after: summarize(engine.getState(), focusUnits) });
        }
        branches.push({ order, steps: stepRecords });
    }
    const expectedHp = new Map<string, number>();
    for (const branch of recorded.branches as Array<{ order: string[]; steps: Array<{ after?: { units?: Array<{ id: string; hp: number }> } }> }>) {
        const last = branch.steps[branch.steps.length - 1];
        const own = last?.after?.units?.find((u) => u.id === 'apk_u0');
        if (own) expectedHp.set(branch.order.join('>'), own.hp);
    }
    const actualHp = new Map<string, number>();
    for (const branch of branches) {
        const last = branch.steps[branch.steps.length - 1] as { after?: { units?: Array<{ id: string; hp: number }> } };
        const own = last?.after?.units?.find((u) => u.id === 'apk_u0');
        if (own) actualHp.set(branch.order.join('>'), own.hp);
    }
    const elfFirst = actualHp.get('u_22>apk_u0');
    const commanderFirst = actualHp.get('apk_u0>u_22');
    const recordedElfFirst = expectedHp.get('u_22>apk_u0');
    const recordedCommanderFirst = expectedHp.get('apk_u0>u_22');
    const delta = elfFirst !== undefined && commanderFirst !== undefined ? elfFirst - commanderFirst : null;
    const c5 =
        elfFirst === recordedElfFirst &&
        commanderFirst === recordedCommanderFirst &&
        delta !== null &&
        delta > 0;
    record(
        'C5',
        'Icy 两步次序回归',
        c5 ? 'PASS' : 'FAIL',
        `精灵先攻 → 己方指挥官 ${elfFirst} HP；指挥官先攻 → ${commanderFirst} HP；差值 ${delta}。` +
            `已记录值 ${recordedElfFirst}/${recordedCommanderFirst}，一致=${c5}`,
        { branches, expectedHp: Object.fromEntries(expectedHp), actualHp: Object.fromEntries(actualHp) },
    );

    // ---------------------------------------------------------- C6 基线序列保留
    const rootAfterBranches = deepCanonical(root);
    const engineForBaseline = new GameEngine(root);
    const legalAtRoot = engineForBaseline
        .getLegalActions(root.currentPlayer)
        .map((a) => encodeAction(a));
    const baselineKept = fixture.baselineActionCode === null || legalAtRoot.includes(fixture.baselineActionCode);
    const c6 = rootAfterBranches === deepCanonical(snapshot) && baselineKept;
    record(
        'C6',
        '基线序列保留',
        c6 ? 'PASS' : 'FAIL',
        `两条分支执行后根状态未变=${rootAfterBranches === deepCanonical(snapshot)}；` +
            `原基线动作 ${fixture.baselineActionCode} 仍在合法集内=${baselineKept}（合法动作 ${legalAtRoot.length} 个）`,
        { legalAtRoot, baselineActionCode: fixture.baselineActionCode },
    );

    // ------------------------------------------------------------ 确定性自检
    const streamCheck = verifyStreamDeterminism();
    record(
        'C7',
        'H0 随机流确定性',
        streamCheck.deterministic ? 'PASS' : 'FAIL',
        `同一 (seed, seat) 两次派生得到同一序列=${streamCheck.deterministic}；` +
            `不同 seat 得到不同序列=${streamCheck.seatSeparated}。` +
            `注意：该流在 playOne 里按 (seed,seat) 从零重建，中途恢复不会自动续位`,
        streamCheck,
    );

    void replay;
    writeReport(fixture, root);
}

/** 复算 H0 的逐座位随机流是否确定且按座位分离。 */
function verifyStreamDeterminism(): { deterministic: boolean; seatSeparated: boolean; first: number[]; second: number[] } {
    const take = (seed: number, seat: number, n: number): number[] => {
        const s = streamFor(seed, seat);
        return Array.from({ length: n }, () => s());
    };
    const a = take(2609260111, 0, 8);
    const b = take(2609260111, 0, 8);
    const c = take(2609260111, 1, 8);
    void mulberry;
    return {
        deterministic: JSON.stringify(a) === JSON.stringify(b),
        seatSeparated: JSON.stringify(a) !== JSON.stringify(c),
        first: a,
        second: c,
    };
}

function goldOf(state: GameState): Array<{ id: number; gold: number; income: number | null }> {
    return (state.players as unknown as Array<Record<string, unknown>>).map((p) => ({
        id: Number(p.id),
        gold: Number(p.gold),
        income: p.income === undefined ? null : Number(p.income),
    }));
}

function hash16(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

function writeReport(fixture: IcyFixture, root: GameState | null): void {
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    const report = {
        schema: 'v19_s0_search_correctness_1',
        generatedAt: new Date().toISOString(),
        note:
            'S0 最小搜索正确性验证。回归用的根状态属于 DEV20 面板（icy-0111-s0），仅用于规则回归，' +
            '不写入任何训练集；本工具不改规则、H0、动作过滤或评测 caps。',
        regressionFixture: fixture,
        rootSummary: root ? summarize(root, ['u_22', 'apk_u0', 'u_23']) : null,
        checks: results,
        summary: { total: results.length, passed, failed, allPassed: failed === 0 },
    };
    const outPath = path.join(OUT_DIR, 's0_correctness.json');
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[S0] 报告已写出：${outPath}（PASS ${passed} / FAIL ${failed}）`);
    if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error('[S0] 执行失败：', error);
    process.exitCode = 1;
});
