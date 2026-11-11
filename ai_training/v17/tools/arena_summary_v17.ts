/**
 * V17：五图面板成绩汇总（读 `*.games.jsonl` 分片，不改写任何原始文件）。
 *
 * 用法：
 *   node --openssl-legacy-provider v12/tools/run-tool.mjs v17/tools/arena_summary_v17.ts `
 *     --dir v17/out/v17_20260926_r2/arena/dev --name P1_s2026 --out .../arena/dev/P1_s2026.summary.json
 *
 * 口径（与 V16 协议一致）：
 * - 胜 = `outcomeKind === 'NATURAL_WIN'`，即真实 engine 终局且 winnerAllianceId == candidateAllianceId。
 * - 平/截断/错误都不计胜；分母固定为该 arm 的行数（DEV20 应为 20）。
 * - 先手 = candidateSeat 0（这些地图默认 P0 先动），后手 = candidateSeat 1（换边）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

function arg(name: string, fallback: string | null): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DIR = path.resolve(arg('--dir', '.') as string);
const NAME = arg('--name', null);
const OUT = arg('--out', null);
const MAPS = ['(2) Duel.aem', '(2) Icy Paths.aem', '(2) Liberty Port.aem', '(2) Mourningstar.aem', '(2) Crossed swords.aem'];

interface Row {
    gameId?: string;
    modelTag?: string;
    policyVersion?: string;
    arm?: string;
    viewedSeat?: number | null;
    candidateSeat?: number | null;
    mapName?: string;
    mapIndex?: number;
    outcomeKind?: string;
    winnerAllianceId?: number | null;
    candidateAllianceId?: number | null;
    steps?: number;
    turns?: number;
    wallMs?: number;
    error?: string | null;
    fallbackUsed?: boolean;
    checkpointSha256?: string | null;
    cacheIdentity?: { gameId?: string; fields?: Record<string, string | number | null> };
}

const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith('.games.jsonl') && (NAME === null || f.startsWith(NAME)))
    : [];
if (files.length === 0) throw new Error(`[summary] ${DIR} 下没有匹配 '${NAME ?? '*'}' 的 .games.jsonl。`);

const rows: Row[] = [];
for (const f of files) {
    for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (t) rows.push(JSON.parse(t) as Row);
    }
}

const candidates = rows.filter((r) => r.arm === 'CANDIDATE');
const perModel = new Map<string, Row[]>();
for (const r of candidates) {
    const key = `${r.modelTag ?? 'unknown'}|${(r.checkpointSha256 ?? 'na').slice(0, 12)}`;
    if (!perModel.has(key)) perModel.set(key, []);
    (perModel.get(key) as Row[]).push(r);
}

function pct(sorted: number[], q: number): number | null {
    return sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const report: Record<string, unknown> = {
    schema: 'v17_arena_summary_1',
    dir: DIR.replace(/\\/g, '/'),
    files,
    generatedAt: new Date().toISOString(),
    models: {},
};

for (const [key, list] of perModel) {
    const wins = list.filter((r) => r.outcomeKind === 'NATURAL_WIN');
    const byMap: Record<string, { wins: number; games: number }> = {};
    for (const m of MAPS) byMap[m] = { wins: 0, games: 0 };
    const bySeat: Record<string, { wins: number; games: number }> = { '0': { wins: 0, games: 0 }, '1': { wins: 0, games: 0 } };
    for (const r of list) {
        const m = r.mapName ?? 'unknown';
        if (!byMap[m]) byMap[m] = { wins: 0, games: 0 };
        byMap[m].games += 1;
        if (r.outcomeKind === 'NATURAL_WIN') byMap[m].wins += 1;
        const seat = String(r.viewedSeat ?? r.candidateSeat ?? 'null');
        if (!bySeat[seat]) bySeat[seat] = { wins: 0, games: 0 };
        bySeat[seat].games += 1;
        if (r.outcomeKind === 'NATURAL_WIN') bySeat[seat].wins += 1;
    }
    const outcomeCounts: Record<string, number> = {};
    for (const r of list) outcomeCounts[r.outcomeKind ?? 'null'] = (outcomeCounts[r.outcomeKind ?? 'null'] ?? 0) + 1;
    const walls = list.map((r) => (r.wallMs ?? 0) / 1000).sort((a, b) => a - b);
    (report.models as Record<string, unknown>)[key] = {
        games: list.length,
        uniqueGames: new Set(list.map((r) => r.gameId ?? r.cacheIdentity?.gameId)).size,
        wins: wins.length,
        winRate: list.length ? Number((wins.length / list.length).toFixed(4)) : null,
        byMap,
        bySeat,
        outcomeCounts,
        naturalCompletionRate: list.length ? Number(((list.length - (outcomeCounts.WALL_TIMEOUT ?? 0) - (outcomeCounts.STEP_LIMIT ?? 0)) / list.length).toFixed(4)) : null,
        errors: list.filter((r) => r.error).length,
        fallbacks: list.filter((r) => r.fallbackUsed === true).length,
        wallSeconds: { p50: pct(walls, 0.5), p95: pct(walls, 0.95), max: walls.length ? walls[walls.length - 1] : null },
        modelIds: [...new Set(list.map((r) => r.modelTag))],
        checkpointSha256: [...new Set(list.map((r) => r.checkpointSha256))],
    };
}

const md: string[] = ['# V17 面板成绩汇总', '', `目录：\`${DIR.replace(/\\/g, '/')}\``, '', '| 模型 | 胜/局 | 五图 (m0..m4) | 先手 | 后手 | 终止分类 | 自然完成率 | wall p50/p95/max(s) |', '|---|---:|---|---:|---:|---|---:|---|'];
for (const [key, vAny] of Object.entries(report.models as Record<string, any>)) {
    const maps = MAPS.map((m) => `${vAny.byMap[m].wins}/${vAny.byMap[m].games}`).join(' , ');
    const oc = Object.entries(vAny.outcomeCounts as Record<string, number>).map(([k, n]) => `${k}:${n}`).join(' ');
    md.push(`| ${key} | ${vAny.wins}/${vAny.games} | ${maps} | ${vAny.bySeat['0'].wins}/${vAny.bySeat['0'].games} | ${vAny.bySeat['1'].wins}/${vAny.bySeat['1'].games} | ${oc} | ${(vAny.naturalCompletionRate * 100).toFixed(1)}% | ${vAny.wallSeconds.p50}/${vAny.wallSeconds.p95}/${vAny.wallSeconds.max} |`);
}
md.push('', '地图顺序：m0=(2) Duel.aem，m1=(2) Icy Paths.aem，m2=(2) Liberty Port.aem，m3=(2) Mourningstar.aem，m4=(2) Crossed swords.aem', '');
(report as Record<string, unknown>).markdown = md.join('\n');

if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.resolve(OUT).replace(/\.json$/, '.md'), `${md.join('\n')}`, 'utf8');
}
console.log(md.join('\n'));
