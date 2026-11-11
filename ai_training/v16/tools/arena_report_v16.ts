/**
 * V16/T16-01：对局面板汇总（owner：T16-01）。
 *
 * 从 `arena/<panel>/**.games.jsonl` 读**全部**行（不挑赢家），按协议 §5 的口径输出：
 * - 每个模型：DEV20 自然胜数 / 局数、五图各 0..4、先手（seat 0）与后手（seat 1）各 0..10；
 * - 终止分类分布（自然胜负/平/截断/错误）、自然完成率、错误与回退计数；
 * - H0 镜像：按座位视角报告，**不计入任何候选模型的胜局**；
 * - 延迟 p50/p95/p99/max 与原子动作数分布。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v16/tools/arena_report_v16.ts \
 *     --run-id v16_20260926_core --panel dev
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { V16_MAPS, V16_PANELS } from './eval_v16_protocol';
import { isError, isNatural } from '../../v13/tools/eval_v3_core';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const RUN_ID = arg('--run-id', 'v16_20260926_core') as string;
const RUN_ROOT = path.resolve(arg('--run-root', `v16/out/${RUN_ID}`) as string);
const PANEL = arg('--panel', 'dev') as string;
const INCLUDE_SUPERSEDED = process.argv.includes('--include-superseded');

interface Row {
    gameId?: string;
    arm?: string;
    modelTag?: string;
    checkpointSha256?: string | null;
    outcomeKind?: string;
    winnerAllianceId?: number | null;
    candidateAllianceId?: number | null;
    blockId?: string;
    mapName?: string;
    rootSeed?: number;
    candidateSeat?: number | null;
    viewedSeat?: number | null;
    steps?: number;
    turns?: number;
    plies?: number;
    wallMs?: number;
    error?: string | null;
    fallbackUsed?: boolean;
    latencyMs?: { p50: number | null; p95: number | null; p99: number | null; max: number | null; mean: number | null };
    maxSteps?: number;
    wallTimeoutMs?: number;
    encoderSchema?: string;
    cacheIdentity?: { fields?: Record<string, string | number | null> };
}

function percentile(sorted: number[], q: number): number | null {
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function mapIndex(mapName: string | undefined): number {
    const index = V16_MAPS.indexOf(mapName ?? '');
    return index < 0 ? -1 : index;
}

/** 从一个目录递归收集 games.jsonl（跳过 .errors/.progress/.blocks/.run）。 */
function collectGames(dir: string, includeSuperseded: boolean): string[] {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!includeSuperseded && /caps\d+s|superseded/i.test(entry.name)) continue;
            out.push(...collectGames(abs, includeSuperseded));
            continue;
        }
        if (!entry.name.endsWith('.games.jsonl')) continue;
        if (/_t16smoke|_smoke/.test(entry.name)) continue;
        out.push(abs);
    }
    return out;
}

const spec = V16_PANELS[PANEL];
if (!spec) throw new Error(`[T16-01] 未知面板 '${PANEL}'。`);
const dir = path.join(RUN_ROOT, 'arena', PANEL === 'dev' ? 'dev' : PANEL === 'recheck' ? 'recheck' : PANEL === 'confirm' ? 'confirm' : 'preflight');
const files = collectGames(dir, INCLUDE_SUPERSEDED);
if (files.length === 0) throw new Error(`[T16-01] ${dir} 下没有 games.jsonl。`);

interface ModelAggregate {
    modelTag: string;
    checkpointSha256: string | null;
    encoderSchema: string | null;
    files: string[];
    candidateRows: number;
    mirrorRows: number;
    wins: number;
    losses: number;
    draws: number;
    truncated: number;
    errors: number;
    fallbacks: number;
    byMap: Array<{ mapName: string; played: number; wins: number; losses: number; other: number }>;
    bySeat: Array<{ seat: number; played: number; wins: number; losses: number; other: number }>;
    outcomeKinds: Record<string, number>;
    naturalCompletionRate: number;
    stepsSorted: number[];
    wallSorted: number[];
    latencyP95Sorted: number[];
    maxStepsCap: number | null;
    wallTimeoutCap: number | null;
}

const aggregates = new Map<string, ModelAggregate>();
const allRows: Row[] = [];

for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as Row;
        allRows.push(row);
        const tag = row.arm === 'MIRROR' ? 'H0-mirror' : (row.modelTag ?? 'unknown');
        let agg = aggregates.get(tag);
        if (!agg) {
            agg = {
                modelTag: tag,
                checkpointSha256: row.checkpointSha256 ?? null,
                encoderSchema: row.encoderSchema ?? null,
                files: [],
                candidateRows: 0, mirrorRows: 0,
                wins: 0, losses: 0, draws: 0, truncated: 0, errors: 0, fallbacks: 0,
                byMap: V16_MAPS.map((mapName) => ({ mapName, played: 0, wins: 0, losses: 0, other: 0 })),
                bySeat: [0, 1].map((seat) => ({ seat, played: 0, wins: 0, losses: 0, other: 0 })),
                outcomeKinds: {},
                naturalCompletionRate: 0,
                stepsSorted: [], wallSorted: [], latencyP95Sorted: [],
                maxStepsCap: null, wallTimeoutCap: null,
            };
            aggregates.set(tag, agg);
        }
        if (!agg.files.includes(path.basename(file))) agg.files.push(path.basename(file));
        if (row.arm === 'MIRROR') agg.mirrorRows += 1; else agg.candidateRows += 1;
        agg.maxStepsCap = row.maxSteps ?? agg.maxStepsCap;
        agg.wallTimeoutCap = row.wallTimeoutMs ?? agg.wallTimeoutCap;

        const kind = row.outcomeKind ?? 'UNKNOWN';
        agg.outcomeKinds[kind] = (agg.outcomeKinds[kind] ?? 0) + 1;
        const seat = row.arm === 'MIRROR' ? (row.viewedSeat ?? null) : (row.candidateSeat ?? null);
        const mi = mapIndex(row.mapName);
        const isWin = kind === 'NATURAL_WIN';
        const isLoss = kind === 'NATURAL_LOSS';
        if (row.arm !== 'MIRROR') {
            if (isWin) agg.wins += 1;
            else if (isLoss) agg.losses += 1;
            else if (kind === 'NATURAL_DRAW') agg.draws += 1;
            else if (kind === 'STEP_LIMIT' || kind === 'PLY_LIMIT' || kind === 'WALL_TIMEOUT' || kind === 'CANCELLED') agg.truncated += 1;
            else if (isError(kind)) agg.errors += 1;
            if (mi >= 0) {
                const bucket = agg.byMap[mi];
                bucket.played += 1;
                if (isWin) bucket.wins += 1;
                else if (isLoss) bucket.losses += 1;
                else bucket.other += 1;
            }
            if (seat === 0 || seat === 1) {
                const bucket = agg.bySeat[seat];
                bucket.played += 1;
                if (isWin) bucket.wins += 1;
                else if (isLoss) bucket.losses += 1;
                else bucket.other += 1;
            }
        }
        if (row.fallbackUsed) agg.fallbacks += 1;
        agg.stepsSorted.push(row.steps ?? 0);
        agg.wallSorted.push(row.wallMs ?? 0);
        if (row.latencyMs?.p95 !== null && row.latencyMs?.p95 !== undefined) agg.latencyP95Sorted.push(row.latencyMs.p95);
    }
}

const models = [...aggregates.values()].map((agg) => {
    agg.stepsSorted.sort((a, b) => a - b);
    agg.wallSorted.sort((a, b) => a - b);
    agg.latencyP95Sorted.sort((a, b) => a - b);
    const planned = agg.candidateRows + 0;
    const natural = Object.entries(agg.outcomeKinds)
        .filter(([kind]) => isNatural(kind as never))
        .reduce((sum, [, n]) => sum + n, 0);
    return {
        modelTag: agg.modelTag,
        checkpointSha256: agg.checkpointSha256,
        encoderSchema: agg.encoderSchema,
        files: agg.files,
        candidateGames: agg.candidateRows,
        mirrorRows: agg.mirrorRows,
        wins: agg.wins,
        losses: agg.losses,
        draws: agg.draws,
        truncated: agg.truncated,
        errors: agg.errors,
        fallbacks: agg.fallbacks,
        winRate: planned > 0 ? agg.wins / planned : null,
        byMap: agg.byMap.map((b) => `${b.wins}/${b.played}`),
        byMapDetail: agg.byMap,
        bySeat: agg.bySeat.map((b) => `seat${b.seat} ${b.wins}/${b.played}`),
        bySeatDetail: agg.bySeat,
        outcomeKinds: agg.outcomeKinds,
        naturalCompletionRate: (planned + agg.mirrorRows) > 0
            ? natural / (planned + agg.mirrorRows)
            : null,
        steps: {
            p50: percentile(agg.stepsSorted, 0.5),
            p95: percentile(agg.stepsSorted, 0.95),
            max: agg.stepsSorted.length ? agg.stepsSorted[agg.stepsSorted.length - 1] : null,
        },
        wallSeconds: {
            p50: percentile(agg.wallSorted, 0.5) === null ? null : Number(((percentile(agg.wallSorted, 0.5) as number) / 1000).toFixed(1)),
            p95: percentile(agg.wallSorted, 0.95) === null ? null : Number(((percentile(agg.wallSorted, 0.95) as number) / 1000).toFixed(1)),
            max: agg.wallSorted.length ? Number((agg.wallSorted[agg.wallSorted.length - 1] / 1000).toFixed(1)) : null,
        },
        modelLatencyP95Ms: {
            p50: percentile(agg.latencyP95Sorted, 0.5),
            max: agg.latencyP95Sorted.length ? agg.latencyP95Sorted[agg.latencyP95Sorted.length - 1] : null,
        },
        caps: { maxStepsAtomicActions: agg.maxStepsCap, wallTimeoutMs: agg.wallTimeoutCap },
    };
}).sort((a, b) => b.wins - a.wins || a.modelTag.localeCompare(b.modelTag));

const report = {
    schema: 'v16_arena_report_1',
    runId: RUN_ID,
    panelId: PANEL,
    panelLabel: spec.label,
    official: spec.official,
    generatedAt: new Date().toISOString(),
    maps: V16_MAPS,
    gamesFiles: files.map((f) => f.replace(/\\/g, '/')),
    rowsTotal: allRows.length,
    scoringRule: '胜 = 真实 engine terminal 且 winnerAllianceId == candidateAllianceId；负/平/超时/步数截断都不计胜。',
    seatRule: 'seat 0 = 先手（首次收入结算方）；只交换策略座位，不改地图拥有者与开局结算顺序。',
    models,
    mirrorNote: 'H0-mirror 行是 H0 对 H0 的实体按座位展开视角，只复用计算，不增加独立样本，也不计入任何候选模型的胜局。',
};
const outJson = path.join(dir, 'report.json');
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const lines: string[] = [];
lines.push(`# V16 ${spec.label}（panel=${PANEL}${spec.official ? '' : '，非正式'}）`);
lines.push('');
lines.push(`生成时间：${report.generatedAt}`);
lines.push('');
lines.push('| 模型 | 胜/局 | 五图 (m0..m4) | 先手 | 后手 | 终止分类 | 自然完成率 | wall p50/p95/max(s) |');
lines.push('|---|---:|---|---:|---:|---|---:|---|');
for (const m of models) {
    lines.push(
        `| ${m.modelTag} | ${m.wins}/${m.candidateGames} | ${m.byMap.join(' , ')} | `
        + `${m.bySeatDetail[0].wins}/${m.bySeatDetail[0].played} | ${m.bySeatDetail[1].wins}/${m.bySeatDetail[1].played} | `
        + `${Object.entries(m.outcomeKinds).map(([k, v]) => `${k}:${v}`).join(' ')} | `
        + `${m.naturalCompletionRate === null ? 'n/a' : (m.naturalCompletionRate * 100).toFixed(1) + '%'} | `
        + `${m.wallSeconds.p50}/${m.wallSeconds.p95}/${m.wallSeconds.max} |`,
    );
}
lines.push('');
lines.push(`地图顺序：${V16_MAPS.map((m, i) => `m${i}=${m}`).join('，')}`);
lines.push('');
const outMd = path.join(dir, 'report.md');
fs.writeFileSync(outMd, `${lines.join('\n')}\n`, 'utf8');

console.log(lines.join('\n'));
console.log(`[T16-01] 写入 ${outJson.replace(/\\/g, '/')} 与 ${outMd.replace(/\\/g, '/')}`);
