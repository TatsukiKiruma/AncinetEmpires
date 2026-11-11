import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { mulberry32 } from '../../../src/game/env';
import { HERE, DATA, read, save, fileSha } from './io';

export const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
export function scores(games: any[]) {
    const groups = Object.fromEntries([2, 3, 4].map(n => {
        const rows = games.filter(r => r.players === n), natural = rows.filter(r => r.natural), missing = rows.length - natural.length;
        const win = rows.reduce((s, r) => s + (r.firstPlace ?? Number(r.classification === 'natural_win')), 0) / Math.max(1, rows.length);
        const rank = rows.reduce((s, r) => s + (r.normalizedRank ?? (r.classification === 'natural_win' ? 1 : 0)), 0) / Math.max(1, rows.length);
        return [n, { attempted: rows.length, natural: natural.length, wins: natural.filter(r => r.classification === 'natural_win').length,
            conservativeWin: win, conservativeRank: rank, winBounds: [win, win + missing / Math.max(1, rows.length)], rankBounds: [rank, rank + missing / Math.max(1, rows.length)],
            earlyEliminations: rows.filter(r => r.eliminatedBeforeFinalOpponent).length, roundTruncations: rows.filter(r => r.classification === 'round_truncation').length,
            wallTruncations: rows.filter(r => r.classification === 'wall_truncation').length, actionTruncations: rows.filter(r => r.classification === 'action_truncation').length,
            errors: rows.filter(r => r.classification === 'runtime_error').length, timeForfeits: rows.filter(r => r.classification === 'time_forfeit').length }];
    }));
    const present = Object.values(groups).filter(g => g.attempted);
    return { byPlayers: groups, equalWin: mean(present.map(g => g.conservativeWin)), equalRank: mean(present.map(g => g.conservativeRank)),
        equalWinBounds: [mean(present.map(g => g.winBounds[0])), mean(present.map(g => g.winBounds[1]))],
        equalRankBounds: [mean(present.map(g => g.rankBounds[0])), mean(present.map(g => g.rankBounds[1]))],
        allNatural: games.every(r => r.natural), missing: games.filter(r => !r.natural).length };
}

export function pairedComparison(before: any[], after: any[], count = 10000, seed = 20261101) {
    const indexed = new Map(before.map(r => [r.id, r]));
    if (indexed.size !== before.length || new Set(after.map(r => r.id)).size !== after.length || after.length !== before.length) throw Error('配对局号数量不符');
    for (const r of after) {
        const b = indexed.get(r.id);
        if (!b || b.initialSha256 !== r.initialSha256 || b.seed !== r.seed || b.seat !== r.seat || b.opponent !== r.opponent) throw Error('配对初态、种子、席位或对手不一致：' + r.id);
    }
    const rng = mulberry32(seed), byPlayers: any = {}, equal: Record<string, number[]> = { win: [], rank: [] };
    const perPlayer: Record<number, Record<string, number[]>> = {};
    for (const n of [2, 3, 4]) perPlayer[n] = { win: [], rank: [] };
    const metric = (r: any, key: string) => key === 'win' ? r.firstPlace ?? Number(r.classification === 'natural_win') : r.normalizedRank ?? 0;
    for (let i = 0; i < count; i++) {
        const totals: Record<string, number[]> = { win: [], rank: [] };
        for (const n of [2, 3, 4]) {
            const rows = after.filter(r => r.players === n); if (!rows.length) continue;
            const clusters = [...new Set(rows.map(r => r.slot))].map(slot => rows.filter(r => r.slot === slot));
            const sampled: any[] = [];
            for (let j = 0; j < clusters.length; j++) sampled.push(...clusters[Math.floor(rng() * clusters.length)]);
            for (const key of ['win', 'rank']) {
                const delta = mean(sampled.map(r => metric(r, key) - metric(indexed.get(r.id), key)));
                perPlayer[n][key].push(delta); totals[key].push(delta);
            }
        }
        for (const key of ['win', 'rank']) equal[key].push(mean(totals[key]));
    }
    const interval = (a: number[]) => { const s = a.slice().sort((a, b) => a - b); return s.length ? [s[Math.floor(s.length * .025)], s[Math.min(s.length - 1, Math.floor(s.length * .975))]] : null; };
    for (const n of [2, 3, 4]) {
        const rows = after.filter(r => r.players === n), complete = rows.every(r => r.natural && indexed.get(r.id).natural);
        byPlayers[n] = { pairs: rows.length, clusters: new Set(rows.map(r => r.slot)).size, allNatural: complete,
            winDelta: mean(rows.map(r => metric(r, 'win') - metric(indexed.get(r.id), 'win'))), rankDelta: mean(rows.map(r => metric(r, 'rank') - metric(indexed.get(r.id), 'rank'))),
            completeNaturalCI: complete ? { win: interval(perPlayer[n].win), rank: interval(perPlayer[n].rank) } : null,
            conservativeScoreCI: { win: interval(perPlayer[n].win), rank: interval(perPlayer[n].rank) } };
    }
    const b = scores(before), a = scores(after), allNatural = before.every(r => r.natural) && after.every(r => r.natural);
    return { samples: count, seed, cluster: '初态槽，槽内全部已冻结席位共同抽样；人数分层等权', byPlayers,
        baseline: b, candidate: a, equal: { winDelta: a.equalWin - b.equalWin, rankDelta: a.equalRank - b.equalRank,
            completeNaturalCI: allNatural ? { win: interval(equal.win), rank: interval(equal.rank) } : null,
            conservativeScoreCI: { win: interval(equal.win), rank: interval(equal.rank) },
            winDeltaBounds: [a.equalWinBounds[0] - b.equalWinBounds[1], a.equalWinBounds[1] - b.equalWinBounds[0]],
            rankDeltaBounds: [a.equalRankBounds[0] - b.equalRankBounds[1], a.equalRankBounds[1] - b.equalRankBounds[0]] },
        missingPolicy: '非自然局原始分留空；保守分以零计只用于评分统计，不是自然负局。确定性上下界不是置信区间。存在缺失时完整自然结果CI为空，保守评分CI另列。' };
}

export async function* lines(file: string): AsyncGenerator<any> {
    const source = fs.createReadStream(file), gzip = createGunzip(); source.on('error', e => gzip.destroy(e)); source.pipe(gzip);
    const stream = createInterface({ input: gzip, crlfDelay: Infinity });
    try { for await (const line of stream) if (line) yield JSON.parse(line); }
    finally { stream.close(); source.destroy(); gzip.destroy(); }
}

export async function telemetryAudit(directory: string, parityFile = 'GPU_BATCH_PARITY.json') {
    const summary = read(path.join(directory, 'SUMMARY.json')), times: number[] = [], own: number[] = [], response: number[] = [], batches: number[] = [];
    let decisions = 0, roots = 0, unique = 0, queued = 0, substantive = 0, over = 0, networkMs = 0, observations = 0, teacherValid = 0, invalidTeacher = 0, vetoed = 0;
    const responseReasons: Record<string, number> = {};
    let responseFullActions = 0, responseProposalActions = 0, budgetExpirations = 0, budgetDiscardedObservations = 0;
    const close = Object.fromEntries([2, 3, 4].map(n => [n, { complete: 0, truncated: 0 }]));
    for (const game of summary.games) for await (const t of lines(path.join(game.artifactDirectory ?? path.join(directory, game.id), 'search.jsonl.gz'))) {
        decisions++; if (t.queued) { queued++; continue; } if (t.stopReason === 'unique_action') { unique++; continue; }
        roots++; times.push(t.rootMs); own.push(t.ownNodes); response.push(t.responseNodes); over += Number(t.overBudget);
        // 实质比较要求至少两个不同根动作有完整反扑Q，单纯clone或中间值不能冒充完成。
        if (new Set(t.candidates.filter((c: any) => c.responseComplete).map((c: any) => c.rootAction)).size >= 2) substantive++;
        batches.push(...t.batchSizes); networkMs += t.networkMs; observations += t.observations;
        close[game.players].complete += t.responseComplete; close[game.players].truncated += t.responseTruncated;
        vetoed += t.candidates.filter((c: any) => c.vetoed).length;
        responseFullActions += t.responseFullActions ?? 0; responseProposalActions += t.responseProposalActions ?? 0;
        budgetExpirations += t.budgetExpirations ?? 0; budgetDiscardedObservations += t.budgetDiscardedObservations ?? 0;
        for (const c of t.candidates) for (const reason of c.responseReasons ?? []) responseReasons[reason] = (responseReasons[reason] ?? 0) + 1;
        if (t.teacher?.evaluatedMask.some(Boolean)) {
            if (Math.abs(t.teacher.probabilities.reduce((s: number, p: number) => s + p, 0) - 1) > 1e-10 || t.teacher.probabilities.some((p: number) => !Number.isFinite(p) || p < 0) || t.teacher.qValues.some((q: any, i: number) => t.teacher.evaluatedMask[i] !== (q !== null))) invalidTeacher++;
            else teacherValid++;
        }
    }
    const sorted = times.slice().sort((a, b) => a - b), parity = read(path.join(HERE, parityFile));
    const services = new Map<number, any>((summary.retiredServices ?? []).map((s: any) => [s.pid, s.diagnostics]));
    if (summary.inferenceDiagnostics) services.set(summary.gpuPid, summary.inferenceDiagnostics);
    const wire = [...services.values()];
    const physicalForward = wire.length ? {
        requests: wire.reduce((n, d) => n + d.decisionRequests, 0), observations: wire.reduce((n, d) => n + d.decisionObservations, 0),
        completedObservations: wire.reduce((n, d) => n + d.completedDecisionObservations, 0), wireMs: wire.reduce((n, d) => n + d.decisionWireMs, 0),
        peakBatchSize: wire.reduce((n, d) => Math.max(n, d.decisionPeakBatchSize), 0), lateResponses: wire.reduce((n, d) => n + d.lateResponses, 0), hardTimeouts: wire.reduce((n, d) => n + d.hardTimeouts, 0), warmupExcluded: true
    } : null;
    return { directory, decisions, nonUniqueNonQueuedRoots: roots, queued, unique, substantiveComparisons: substantive, substantiveRate: substantive / Math.max(1, roots),
        rootMeanMs: mean(times), rootP95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] ?? null, rootMaxMs: sorted.at(-1) ?? null,
        overBudget: over, overBudgetRate: over / Math.max(1, roots), timeForfeits: summary.games.filter((r: any) => r.classification === 'time_forfeit').length,
        meanOwnNodes: mean(own), meanResponseNodes: mean(response), meanBatchSize: physicalForward ? physicalForward.observations / Math.max(1, physicalForward.requests) : mean(batches), peakBatchSize: physicalForward?.peakBatchSize ?? batches.reduce((m, b) => Math.max(m, b), 0), observations, physicalForward,
        networkObservationsPerSecond: observations / Math.max(1e-12, networkMs / 1000), parityBenchSpeedupVsSerial: parity.mixedSpeedupVsSerial, parityFile, paritySha256: fileSha(path.join(HERE, parityFile)),
        responseByPlayers: Object.fromEntries(Object.entries(close).map(([n, x]) => [n, { ...x, rate: x.complete / Math.max(1, x.complete + x.truncated) }])),
        teacherValid, invalidTeacher, teacherUnavailable: roots - teacherValid - invalidTeacher, vetoed, responseReasons, responseFullActions, responseProposalActions, budgetExpirations, budgetDiscardedObservations,
        witnesses: summary.games.reduce((s: number, r: any) => s + r.witnessCount, 0), witnessActions: summary.games.reduce((s: number, r: any) => s + r.witnessActions, 0),
        allSavedWitnessesLegal: summary.games.every((r: any) => r.allSavedWitnessesLegal),
        labels: '只对完整post_response目标归一化；无完整叶时教师标签不可用，零向量不得用于蒸馏；吞吐含IPC，不含CPU编码。' };
}

export async function evidence() {
    const files: Record<string, any> = {};
    function visit(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (!['__pycache__', 'miopen-db', 'miopen-cache'].includes(entry.name)) visit(file); }
            else if (entry.isFile() && !entry.name.endsWith('.pending') && !['EVIDENCE_MANIFEST.json', 'PROGRESS.json'].includes(entry.name) && !/^(controller|evidence-finalizer).*\.(stdout|stderr)\.log$/.test(entry.name)) files[file] = { bytes: fs.statSync(file).size, sha256: fileSha(file) };
        }
    }
    visit(HERE); visit(DATA);
    await save(path.join(HERE, 'EVIDENCE_MANIFEST.json'), { created: new Date().toISOString(), files, noTraining: true, excluded: '当前进度与控制器/收尾标准流日志不列入字节摘要；控制器最后一行写入不会使清单失效，旧清单快照保留' });
}
