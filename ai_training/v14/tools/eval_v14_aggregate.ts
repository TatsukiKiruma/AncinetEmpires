/**
 * V14/T14-05：纯函数聚合模块（不依赖引擎，可单元测试）+ CLI。
 *
 * 输入：runner 输出的 games JSONL，每行一个 GameRecord 兼容对象。兼容两种行格式：
 *  1) 双臂行：{ arm: 'CANDIDATE'|'MIRROR', scenarioId, seed, viewedSeat/candidateSeat,
 *     outcomeKind, winnerAllianceId, candidateAllianceId, mapName?, playerCount?, steps? }；
 *     聚合按 (scenarioId, seed, 座位) 把候选臂与镜像臂配成一对。
 *     镜像行的 candidateAllianceId 即“被比较座位”的联盟（v13 playOne 语义），
 *     mirror_view 由本文件的 viewOutcomeForSeat 重推导。
 *  2) 配对行：{ scenarioId, seed, seat/viewedSeat, mapName?, playerCount?,
 *     candidate: {...}, mirror: {...} }，已配好对，直接采用。
 * 无 arm 又无 candidate/mirror 的行无法配对，记入 orphans，不进统计。
 *
 * 统计定义（任务书 7.2）：
 * - 自然终局得分 s：赢=1，规则平局=0.5，输=0，按候选座位联盟视角；
 *   配对差值 d = s_candidate − s_mirror_view。
 * - 完整配对点估计：仅两边 outcomeKind 均为自然（isNatural）才进入；报告配对数与均值。
 *   只报候选自然结束子集胜率不能代表全部计划对局，故点估计与截断界分开报告。
 * - 截断不确定性界：候选/镜像任一侧为 UNDECIDED（STEP/PLY/WALL/CANCELLED，非自然
 *   非错误）时，该侧分数区间为 [0,1]（自然侧为点值，平局=0.5）；差值区间为
 *   [C_low − M_high, C_high − M_low]。这是不确定性界，不是把截断改判胜/负。
 *   全计划对局的总体均值区间按每局区间平均（错误局除外，见错误门）。
 * - 错误门：任一臂为 POLICY_ERROR/ENGINE_ERROR 的局单独计数并列出；错误率 >0 则
 *   experimentValid=false（报告有效性不通过，不靠上下界掩盖策略崩溃）。
 * - 聚类 95% 区间：按 (scenarioId, seed) block 做整块 bootstrap（固定种子 20260925，
 *   B=2000）。先按 block 内各座位（完整配对）的 d 平均得 block 均值，再对 block
 *   均值做百分位区间。无完整配对的 block 不进区间；block 数 <8 时标 smallSample=true，
 *   区间仅供参考。注意：不能把同一种子的多座位行当独立镜像计数。
 * - 分层：按 mapName（缺失时按 scenarioId）、座位、玩家人数（缺失记 null）分别报告
 *   配对均值与计数。
 *
 * CLI：node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/eval_v14_aggregate.ts
 *      --games <games.jsonl> --out <report.json>
 * 报告原子写（先 .tmp 后 rename），stdout 打印关键数字。无 --games 时报错退出码 1。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    isError,
    isNatural,
    isUndecided,
    mulberry,
    type OutcomeKind,
} from '../../v13/tools/eval_v3_core';

/** 聚类 bootstrap 的固定种子与重复次数（写死，保证可复现）。 */
export const CLUSTER_BOOTSTRAP_SEED = 20260925;
/** bootstrap 重复次数。 */
export const CLUSTER_BOOTSTRAP_B = 2000;
/** block 数低于此值时区间仅供参考。 */
export const SMALL_SAMPLE_BLOCKS = 8;

/** 单臂视角：outcomeKind + 获胜联盟 + 本臂所站视角联盟。 */
export interface ArmGameView {
    outcomeKind: OutcomeKind;
    winnerAllianceId: number | null;
    /** 该臂所站视角的联盟：候选臂=候选座位联盟；镜像臂=被比较座位的联盟。 */
    candidateAllianceId: number | null;
    steps?: number;
}

/** GameRecord 兼容输入行（双臂行或配对行，缺失字段允许，由配对阶段校验）。 */
export interface GameRecordLike {
    scenarioId?: string;
    seed?: number;
    mapName?: string | null;
    playerCount?: number | null;
    arm?: string;
    candidateSeat?: number | null;
    viewedSeat?: number | null;
    seat?: number | null;
    outcomeKind?: OutcomeKind;
    winnerAllianceId?: number | null;
    candidateAllianceId?: number | null;
    steps?: number;
    candidate?: ArmGameView | null;
    mirror?: ArmGameView | null;
    pairKey?: string | null;
}

/** 配好对的一局：同一 (scenarioId, seed, 座位) 的候选臂 + 镜像臂。 */
export interface PairRecord {
    pairKey: string;
    scenarioId: string;
    seed: number;
    seat: number | null;
    mapName: string | null;
    playerCount: number | null;
    candidate: ArmGameView;
    mirror: ArmGameView;
}

/**
 * 从指定座位联盟视角重读一局的结果。
 *
 * 中文：与 v13/tools/eval_paired_v3.ts 的 viewOutcomeForSeat 同语义（v13 runner 的该
 * 函数虽导出，但任务要求不 import v13 runner 的函数，故在此重实现；分类谓词
 * isError/isNatural/isUndecided 复用 v13/tools/eval_v3_core.ts）。
 * 这是纯推导：只改变“结果是关于谁的”，不改变发生了什么。错误与截断是发生了什么，
 * 与视角无关，原样传递；规则平局不归属任何联盟；视角缺失时无法重推导，原样返回。
 */
export function viewOutcomeForSeat(
    raw: OutcomeKind,
    winnerAllianceId: number | null,
    viewedAllianceId: number | null,
): OutcomeKind {
    if (isError(raw) || isUndecided(raw)) return raw;
    if (raw === 'NATURAL_DRAW') return 'NATURAL_DRAW';
    if (viewedAllianceId === null || viewedAllianceId === undefined) return raw;
    if (winnerAllianceId === null || winnerAllianceId === undefined) return raw;
    return winnerAllianceId === viewedAllianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS';
}

/**
 * 视角结果的点得分：赢=1，平=0.5，输=0；截断/错误无点值，返回 null。
 */
export function scoreOfViewedOutcome(viewed: OutcomeKind): number | null {
    if (viewed === 'NATURAL_WIN') return 1;
    if (viewed === 'NATURAL_DRAW') return 0.5;
    if (viewed === 'NATURAL_LOSS') return 0;
    return null;
}

/** 单臂分数区间。 */
export interface ScoreInterval {
    low: number;
    high: number;
}

/**
 * 单臂分数区间：自然侧为点值（含平局 0.5）；截断侧未知最终分数，区间 [0,1]；
 * 错误侧返回 null（走错误门，不进区间平均，不靠上下界掩盖崩溃）。
 */
export function intervalOfArm(arm: ArmGameView): ScoreInterval | null {
    const viewed = viewOutcomeForSeat(arm.outcomeKind, arm.winnerAllianceId, arm.candidateAllianceId);
    const point = scoreOfViewedOutcome(viewed);
    if (point !== null) return { low: point, high: point };
    if (isUndecided(arm.outcomeKind)) return { low: 0, high: 1 };
    return null;
}

/** 取双臂行的座位：viewedSeat 优先，其次 candidateSeat。 */
function seatOfArmRow(row: GameRecordLike): number | null {
    if (row.viewedSeat !== undefined && row.viewedSeat !== null) return row.viewedSeat;
    if (row.candidateSeat !== undefined && row.candidateSeat !== null) return row.candidateSeat;
    if (row.seat !== undefined && row.seat !== null) return row.seat;
    return null;
}

/** 配对键：(scenarioId, seed, 座位)。座位缺失记 'none'，只与同样缺失的配对。 */
function pairKeyOf(scenarioId: string, seed: number, seat: number | null): string {
    return `${scenarioId}#seed=${seed}#seat=${seat === null ? 'none' : seat}`;
}

/** buildPairs 的返回：配好的对局 + 无法配对的孤儿行。 */
export interface BuildPairsResult {
    pairs: PairRecord[];
    orphans: GameRecordLike[];
}

function toArmView(row: GameRecordLike, what: string): ArmGameView {
    if (!row.outcomeKind) {
        throw new Error(`[T14-05] 配对失败：${what} 缺少 outcomeKind。`);
    }
    return {
        outcomeKind: row.outcomeKind,
        winnerAllianceId: row.winnerAllianceId ?? null,
        candidateAllianceId: row.candidateAllianceId ?? null,
        steps: row.steps,
    };
}

/**
 * 把输入行配成 (候选臂, 镜像臂) 对。
 *
 * 中文：配对行直接采用；双臂行按 (scenarioId, seed, 座位) 配对，scenarioId/seed
 * 缺失的行无法定位，直接记入 orphans；落单的臂（找不到对侧）也记入 orphans，
 * 不静默丢弃、不捏造配对。
 */
export function buildPairs(games: GameRecordLike[]): BuildPairsResult {
    const pairs: PairRecord[] = [];
    const orphans: GameRecordLike[] = [];
    const candByKey = new Map<string, GameRecordLike>();
    const mirrorByKey = new Map<string, GameRecordLike>();
    for (const row of games) {
        if (row.candidate && row.mirror) {
            // 中文：配对行形式（未来 runner 可直接输出此格式）。
            if (row.scenarioId === undefined || row.seed === undefined) {
                orphans.push(row);
                continue;
            }
            const seat = seatOfArmRow(row);
            pairs.push({
                pairKey: row.pairKey ?? pairKeyOf(row.scenarioId, row.seed, seat),
                scenarioId: row.scenarioId,
                seed: row.seed,
                seat,
                mapName: row.mapName ?? null,
                playerCount: row.playerCount ?? null,
                candidate: row.candidate,
                mirror: row.mirror,
            });
            continue;
        }
        if (row.arm === 'CANDIDATE' || row.arm === 'MIRROR') {
            if (row.scenarioId === undefined || row.seed === undefined) {
                orphans.push(row);
                continue;
            }
            const key = pairKeyOf(row.scenarioId, row.seed, seatOfArmRow(row));
            if (row.arm === 'CANDIDATE') {
                if (candByKey.has(key)) orphans.push(candByKey.get(key) as GameRecordLike);
                candByKey.set(key, row);
            } else {
                if (mirrorByKey.has(key)) orphans.push(mirrorByKey.get(key) as GameRecordLike);
                mirrorByKey.set(key, row);
            }
            continue;
        }
        orphans.push(row);
    }
    for (const [key, c] of candByKey) {
        const m = mirrorByKey.get(key);
        if (!m) {
            orphans.push(c);
            continue;
        }
        mirrorByKey.delete(key);
        const seat = seatOfArmRow(c);
        pairs.push({
            pairKey: key,
            scenarioId: c.scenarioId as string,
            seed: c.seed as number,
            seat,
            mapName: c.mapName ?? m.mapName ?? null,
            playerCount: c.playerCount ?? m.playerCount ?? null,
            candidate: toArmView(c, `候选臂 ${key}`),
            mirror: toArmView(m, `镜像臂 ${key}`),
        });
    }
    for (const m of mirrorByKey.values()) orphans.push(m);
    return { pairs, orphans };
}

/** 单对局的聚合明细。 */
export interface PairDetail {
    pairKey: string;
    scenarioId: string;
    seed: number;
    seat: number | null;
    map: string;
    playerCount: number | null;
    /** COMPLETE=两边自然（有点值）；TRUNCATED=任一侧截断（只有区间）；ERROR=任一臂错误。 */
    kind: 'COMPLETE' | 'TRUNCATED' | 'ERROR';
    candidateOutcome: OutcomeKind;
    mirrorOutcome: OutcomeKind;
    /** COMPLETE 时的配对差值 d。 */
    d: number | null;
    /** 非 ERROR 时的差值区间下/上界（COMPLETE 为点值展开）。 */
    dLow: number | null;
    dHigh: number | null;
}

/** 分层统计：配对数、完整配对数/均值、截断数、错误数。 */
export interface StratumStat {
    key: string;
    pairs: number;
    complete: number;
    completeMean: number | null;
    truncated: number;
    errors: number;
}

/** 聚合报告。 */
export interface AggregateReport {
    schema: string;
    totalPairs: number;
    /** 完整配对点估计：仅两边自然。 */
    completePairs: {
        count: number;
        mean: number | null;
        candidateWins: number;
        candidateDraws: number;
        candidateLosses: number;
    };
    /** 截断局：差值区间明细。 */
    truncatedPairs: {
        count: number;
        details: PairDetail[];
    };
    /** 全计划对局（除错误局外）的总体均值区间：按每局区间平均。 */
    overallMeanInterval: {
        low: number | null;
        high: number | null;
        overPairs: number;
    };
    /** 错误门。 */
    errors: {
        count: number;
        rate: number;
        pairKeys: string[];
        /** 错误率 >0 则 false，报告有效性不通过。 */
        experimentValid: boolean;
    };
    /** 按 (scenarioId, seed) 整块 bootstrap 的聚类 95% 区间（基于完整配对的 d）。 */
    clusterCI: {
        blocks: number;
        blockMeans: number[];
        mean: number | null;
        low95: number | null;
        high95: number | null;
        smallSample: boolean;
        seed: number;
        b: number;
        note: string;
    };
    strata: {
        byMap: StratumStat[];
        bySeat: StratumStat[];
        byPlayerCount: StratumStat[];
    };
    pairDetails: PairDetail[];
    orphanCount: number;
}

function meanOf(values: number[]): number | null {
    if (values.length === 0) return null;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
}

/**
 * 对 block 均值做整块 bootstrap 百分位区间（B=2000，固定种子）。
 *
 * 中文：同 block 的全部座位、共享镜像、重复测量一起抽样——抽样单位是 block，
 * 不是单个座位行。复现性要求种子写死，不许 Math.random。
 */
function bootstrapPercentileCI(
    blockMeans: number[],
    seed: number,
    b: number,
): { mean: number | null; low: number | null; high: number | null } {
    const mean = meanOf(blockMeans);
    if (mean === null) return { mean: null, low: null, high: null };
    const n = blockMeans.length;
    const rng = mulberry(seed);
    const stats: number[] = [];
    for (let i = 0; i < b; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += blockMeans[Math.floor(rng() * n)];
        stats.push(sum / n);
    }
    stats.sort((x, y) => x - y);
    const quantile = (p: number): number => stats[Math.min(b - 1, Math.max(0, Math.floor(p * b)))];
    return { mean, low: quantile(0.025), high: quantile(0.975) };
}

function stratify(pairs: PairDetail[], keyOf: (p: PairDetail) => string): StratumStat[] {
    const groups = new Map<string, PairDetail[]>();
    for (const p of pairs) {
        const key = keyOf(p);
        if (!groups.has(key)) groups.set(key, []);
        (groups.get(key) as PairDetail[]).push(p);
    }
    const out: StratumStat[] = [];
    for (const [key, list] of groups) {
        const ds = list.filter((p) => p.kind === 'COMPLETE').map((p) => p.d as number);
        out.push({
            key,
            pairs: list.length,
            complete: ds.length,
            completeMean: meanOf(ds),
            truncated: list.filter((p) => p.kind === 'TRUNCATED').length,
            errors: list.filter((p) => p.kind === 'ERROR').length,
        });
    }
    out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
}

/**
 * 聚合配好对的对局。
 *
 * 中文：V13 缺口 (d) 的修复——旧聚合把“镜像未截断与否”混在一起算 delta。
 * 这里：两边均自然才进入完整配对点估计；任一侧截断走区间界；任一臂错误走错误门。
 */
export function aggregatePairs(pairs: PairRecord[]): AggregateReport {
    const details: PairDetail[] = [];
    for (const p of pairs) {
        const c = p.candidate;
        const m = p.mirror;
        const map = p.mapName ?? p.scenarioId;
        if (isError(c.outcomeKind) || isError(m.outcomeKind)) {
            // 中文：错误不是正常截断，单独计数并列出，不进区间平均。
            details.push({
                pairKey: p.pairKey,
                scenarioId: p.scenarioId,
                seed: p.seed,
                seat: p.seat,
                map,
                playerCount: p.playerCount,
                kind: 'ERROR',
                candidateOutcome: c.outcomeKind,
                mirrorOutcome: m.outcomeKind,
                d: null,
                dLow: null,
                dHigh: null,
            });
            continue;
        }
        const cNat = isNatural(c.outcomeKind);
        const mNat = isNatural(m.outcomeKind);
        if (cNat && mNat) {
            // 中文：两边均自然结束才进入完整配对点估计。
            const cViewed = viewOutcomeForSeat(c.outcomeKind, c.winnerAllianceId, c.candidateAllianceId);
            const mViewed = viewOutcomeForSeat(m.outcomeKind, m.winnerAllianceId, m.candidateAllianceId);
            const sc = scoreOfViewedOutcome(cViewed) as number;
            const sm = scoreOfViewedOutcome(mViewed) as number;
            const d = sc - sm;
            details.push({
                pairKey: p.pairKey,
                scenarioId: p.scenarioId,
                seed: p.seed,
                seat: p.seat,
                map,
                playerCount: p.playerCount,
                kind: 'COMPLETE',
                candidateOutcome: c.outcomeKind,
                mirrorOutcome: m.outcomeKind,
                d,
                dLow: d,
                dHigh: d,
            });
            continue;
        }
        // 中文：至少一侧截断（UNDECIDED）。差值区间=[C_low−M_high, C_high−M_low]。
        const ci = intervalOfArm(c) as ScoreInterval;
        const mi = intervalOfArm(m) as ScoreInterval;
        details.push({
            pairKey: p.pairKey,
            scenarioId: p.scenarioId,
            seed: p.seed,
            seat: p.seat,
            map,
            playerCount: p.playerCount,
            kind: 'TRUNCATED',
            candidateOutcome: c.outcomeKind,
            mirrorOutcome: m.outcomeKind,
            d: null,
            dLow: ci.low - mi.high,
            dHigh: ci.high - mi.low,
        });
    }

    const complete = details.filter((d) => d.kind === 'COMPLETE');
    const truncated = details.filter((d) => d.kind === 'TRUNCATED');
    const errored = details.filter((d) => d.kind === 'ERROR');
    const completeDs = complete.map((d) => d.d as number);

    // 中文：候选视角原始 W/D/L（仅完整配对）。
    let candidateWins = 0;
    let candidateDraws = 0;
    let candidateLosses = 0;
    for (const d of complete) {
        const c = pairs.find((p) => p.pairKey === d.pairKey) as PairRecord;
        const viewed = viewOutcomeForSeat(
            c.candidate.outcomeKind,
            c.candidate.winnerAllianceId,
            c.candidate.candidateAllianceId,
        );
        if (viewed === 'NATURAL_WIN') candidateWins++;
        else if (viewed === 'NATURAL_DRAW') candidateDraws++;
        else candidateLosses++;
    }

    // 中文：总体均值区间按每局区间平均（错误局除外，已走错误门）。
    const intervaled = details.filter((d) => d.kind !== 'ERROR');
    const overallMeanInterval = {
        low: intervaled.length ? meanOf(intervaled.map((d) => d.dLow as number)) : null,
        high: intervaled.length ? meanOf(intervaled.map((d) => d.dHigh as number)) : null,
        overPairs: intervaled.length,
    };

    // 中文：按 (scenarioId, seed) 分块；先按 block 内各座位（完整配对的 d）平均得
    // block 均值，再对 block 均值做百分位区间。无完整配对的 block 不进区间。
    const blocks = new Map<string, number[]>();
    for (const d of complete) {
        const key = `${d.scenarioId}#seed=${d.seed}`;
        if (!blocks.has(key)) blocks.set(key, []);
        (blocks.get(key) as number[]).push(d.d as number);
    }
    const blockMeans = [...blocks.values()].map((ds) => meanOf(ds) as number);
    const ci = bootstrapPercentileCI(blockMeans, CLUSTER_BOOTSTRAP_SEED, CLUSTER_BOOTSTRAP_B);
    const smallSample = blockMeans.length < SMALL_SAMPLE_BLOCKS;

    const errorRate = details.length ? errored.length / details.length : 0;

    return {
        schema: 'v14_aggregate_report_1',
        totalPairs: details.length,
        completePairs: {
            count: complete.length,
            mean: meanOf(completeDs),
            candidateWins,
            candidateDraws,
            candidateLosses,
        },
        truncatedPairs: { count: truncated.length, details: truncated },
        overallMeanInterval,
        errors: {
            count: errored.length,
            rate: errorRate,
            pairKeys: errored.map((d) => d.pairKey),
            experimentValid: errorRate === 0,
        },
        clusterCI: {
            blocks: blockMeans.length,
            blockMeans,
            mean: ci.mean,
            low95: ci.low,
            high95: ci.high,
            smallSample,
            seed: CLUSTER_BOOTSTRAP_SEED,
            b: CLUSTER_BOOTSTRAP_B,
            note: smallSample
                ? `block 数=${blockMeans.length}<${SMALL_SAMPLE_BLOCKS}，区间仅供参考，不作强度结论。`
                : `按 (scenarioId, seed) 整块 bootstrap 的 95% 区间（B=${CLUSTER_BOOTSTRAP_B}）。`,
        },
        strata: {
            // 中文：按 mapName 分层，缺失时按 scenarioId。
            byMap: stratify(details, (p) => p.map),
            bySeat: stratify(details, (p) => (p.seat === null ? 'null' : String(p.seat))),
            // 中文：玩家人数缺失写 null，不填 0。
            byPlayerCount: stratify(details, (p) => (p.playerCount === null ? 'null' : String(p.playerCount))),
        },
        pairDetails: details,
        orphanCount: 0,
    };
}

/**
 * V15/T15-09A：镜像行「声明值 vs 从 winner 重算值」对照。
 *
 * 中文：任务书 §10.1 第二条要求聚合**先按被测联盟从 winner 重算视角**，不能直接相信
 * 镜像行里写的 `NATURAL_LOSS` 字样。本函数不改变任何历史聚合逻辑，只把「行里声明的
 * outcomeKind」与「按 candidateAllianceId 从 winnerAllianceId 重算的 outcomeKind」
 * 逐行对照，给出差异清单与计数——差异非零说明旧 runner 的镜像行确实写错了视角
 * （镜像行没有候选座位，视角联盟为 null，于是任何 winner 都被记成 LOSS）。
 *
 * 返回按臂、按地图分组的差异计数，并保留逐条明细，便于审核复核。
 */
export interface ViewpointCompareRow {
    scenarioId: string;
    seed: number;
    seat: number | null;
    arm: string;
    declaredOutcome: OutcomeKind;
    recomputedOutcome: OutcomeKind;
    winnerAllianceId: number | null;
    viewedAllianceId: number | null;
    differs: boolean;
}

export interface ViewpointCompareReport {
    rows: number;
    differingRows: number;
    byArm: Array<{ arm: string; rows: number; differing: number }>;
    byOutcome: Array<{ declared: OutcomeKind; recomputed: OutcomeKind; count: number }>;
    details: ViewpointCompareRow[];
}

export function compareDeclaredVsRecomputed(rows: GameRecordLike[]): ViewpointCompareReport {
    const details: ViewpointCompareRow[] = [];
    for (const row of rows) {
        if (!row.outcomeKind) continue;
        if (row.arm !== 'CANDIDATE' && row.arm !== 'MIRROR') continue;
        const viewAlliance = row.candidateAllianceId ?? null;
        const recomputed = viewOutcomeForSeat(row.outcomeKind, row.winnerAllianceId ?? null, viewAlliance);
        details.push({
            scenarioId: row.scenarioId ?? '',
            seed: row.seed ?? Number.NaN,
            seat: seatOfArmRow(row),
            arm: row.arm,
            declaredOutcome: row.outcomeKind,
            recomputedOutcome: recomputed,
            winnerAllianceId: row.winnerAllianceId ?? null,
            viewedAllianceId: viewAlliance,
            differs: recomputed !== row.outcomeKind,
        });
    }
    const armKeys = [...new Set(details.map((d) => d.arm))].sort();
    const outcomeKeys = new Map<string, number>();
    for (const d of details) {
        const k = `${d.declaredOutcome}->${d.recomputedOutcome}`;
        outcomeKeys.set(k, (outcomeKeys.get(k) ?? 0) + 1);
    }
    return {
        rows: details.length,
        differingRows: details.filter((d) => d.differs).length,
        byArm: armKeys.map((arm) => ({
            arm,
            rows: details.filter((d) => d.arm === arm).length,
            differing: details.filter((d) => d.arm === arm && d.differs).length,
        })),
        byOutcome: [...outcomeKeys.entries()].sort().map(([k, count]) => {
            const [declared, recomputed] = k.split('->') as [OutcomeKind, OutcomeKind];
            return { declared, recomputed, count };
        }),
        details,
    };
}

/** 解析 games JSONL（空行跳过；解析失败报行号，不吞错）。 */
export function parseGamesJsonl(text: string): GameRecordLike[] {
    const out: GameRecordLike[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
            out.push(JSON.parse(line) as GameRecordLike);
        } catch (err) {
            throw new Error(`[T14-05] games JSONL 第 ${i + 1} 行解析失败：${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return out;
}

/** 原子写：先写 .tmp 后 rename，评测器永远读不到半截文件。 */
function writeJsonAtomic(outPath: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const tmp = `${outPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmp, outPath);
}

function argValue(name: string): string | null {
    const i = process.argv.indexOf(name);
    if (i < 0 || i + 1 >= process.argv.length) return null;
    return process.argv[i + 1];
}

/** CLI 入口（同步）。无 --games 时报错退出码 1。 */
function cliMain(): void {
    const gamesPath = argValue('--games');
    const outPath = argValue('--out');
    if (!gamesPath) {
        console.error('[T14-05] 缺少 --games <games.jsonl>；用法：run-tool.mjs v14/tools/eval_v14_aggregate.ts --games <games.jsonl> --out <report.json>');
        process.exit(1);
    }
    if (!outPath) {
        console.error('[T14-05] 缺少 --out <report.json>。');
        process.exit(1);
    }
    const text = fs.readFileSync(gamesPath, 'utf8');
    const games = parseGamesJsonl(text);
    const { pairs, orphans } = buildPairs(games);
    const report = aggregatePairs(pairs);
    report.orphanCount = orphans.length;
    const payload = { ...report, orphans };
    writeJsonAtomic(outPath, payload);
    // V15/T15-09A：可选的视角对照读数（默认不写 ⇒ 历史 CLI 行为不变）。
    const viewpointOut = argValue('--viewpoint-report');
    if (viewpointOut) {
        const comparison = compareDeclaredVsRecomputed(games);
        writeJsonAtomic(viewpointOut, {
            schema: 'v14_viewpoint_compare_1',
            gamesJsonl: gamesPath.replace(/\\/g, '/'),
            ...comparison,
        });
        console.log(
            `[T15-09A] 视角对照：rows=${comparison.rows} differing=${comparison.differingRows} -> ${viewpointOut}`,
        );
    }
    // 中文：stdout 打印关键数字，方便人眼核对。
    console.log(`[T14-05] pairs=${report.totalPairs} orphans=${orphans.length}`);
    console.log(
        `[T14-05] complete=${report.completePairs.count} mean=${report.completePairs.mean === null ? 'null' : report.completePairs.mean.toFixed(4)} ` +
            `(W/D/L=${report.completePairs.candidateWins}/${report.completePairs.candidateDraws}/${report.completePairs.candidateLosses})`,
    );
    console.log(
        `[T14-05] truncated=${report.truncatedPairs.count} ` +
            `overallMeanInterval=[${report.overallMeanInterval.low === null ? 'null' : report.overallMeanInterval.low.toFixed(4)}, ` +
            `${report.overallMeanInterval.high === null ? 'null' : report.overallMeanInterval.high.toFixed(4)}] over=${report.overallMeanInterval.overPairs}`,
    );
    console.log(
        `[T14-05] errors=${report.errors.count} rate=${report.errors.rate.toFixed(4)} experimentValid=${report.errors.experimentValid}`,
    );
    console.log(
        `[T14-05] clusterCI blocks=${report.clusterCI.blocks} mean=${report.clusterCI.mean === null ? 'null' : report.clusterCI.mean.toFixed(4)} ` +
            `95%=[${report.clusterCI.low95 === null ? 'null' : report.clusterCI.low95.toFixed(4)}, ` +
            `${report.clusterCI.high95 === null ? 'null' : report.clusterCI.high95.toFixed(4)}] smallSample=${report.clusterCI.smallSample}`,
    );
    console.log(`[T14-05] report -> ${outPath}`);
}

// 中文：只有直接以本文件为入口运行时才走 CLI；被自测 import 时只导出纯函数，不执行。
const entryPath = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entryPath.endsWith('v14/tools/eval_v14_aggregate.ts')) {
    try {
        cliMain();
    } catch (err) {
        console.error(`[T14-05] 聚合失败：${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}
