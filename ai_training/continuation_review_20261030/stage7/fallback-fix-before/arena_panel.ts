import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileSha, here, readJson, s3, sha, data, saveJson, positiveProgressStop } from './phase7_io';
import { WorkerPool } from './worker_pool';
import type { ModelIdentity } from './client_v2';

export function devPanel() {
    const panelFile = path.join(s3, 'OMNI_ARENA_DEV_PANEL.json');
    const panelSha = fileSha(panelFile), panel = readJson(panelFile, panelSha);
    assert(panel.split === 'dev' && !panel.finalTest && panel.matches.length === 54);
    const manifest = readJson(path.join(s3, 'DEV_INITIAL_MANIFEST.json'));
    assert.equal(manifest.panelSha256, panelSha);
    const subset = readJson(path.join(here, '../stage6/DEV_SUBSET.json'));
    assert.equal(subset.panelSha256, panelSha);
    const subsetIds = new Set<string>(subset.ids);
    assert.equal(subsetIds.size, 18);
    const jobs = panel.matches.map((match: any) => {
        const slot = manifest.slots[match.slot];
        assert(slot.slot === match.slot && slot.split === 'dev' && /^dev-initial[/\\]slot-\d+\.json$/.test(slot.file));
        return { kind: 'match', split: 'dev', match, players: slot.players, initial: readJson(path.join(s3, slot.file), slot.sha256), initialSha256: slot.sha256 };
    });
    for (const [n, count] of [[2, 20], [3, 18], [4, 16]]) {
        assert.equal(jobs.filter((j: any) => j.players === n).length, count);
        assert.equal(jobs.filter((j: any) => j.players === n && subsetIds.has(j.match.id)).length, 6);
    }
    return { panelSha, jobs, subsetIds, limits: { engineOptions: panel.engineOptions, maxActions: panel.maxActions,
        maxRounds: panel.maxRounds, maxWallMs: 7200000, maxDecisionMs: panel.maxDecisionMs } };
}

export function arenaStats(rows: any[]) {
    const byPlayers = Object.fromEntries([2, 3, 4].map(players => {
        const group = rows.filter(r => r.players === players);
        return [players, { total: group.length, natural: group.filter(r => r.natural).length, wins: group.filter(r => r.won).length }];
    }));
    return { total: rows.length, natural: rows.filter(r => r.natural).length, wins: rows.filter(r => r.won).length,
        fallbacks: rows.reduce((n, r) => n + r.fallbacks, 0), timeForfeits: rows.reduce((n, r) => n + r.timeForfeits, 0), byPlayers,
        equalWin: Object.values(byPlayers).reduce((n, r) => n + r.wins / Math.max(r.total, 1), 0) / 3 };
}

type Launch = { workers: number; services: number; window: number; mode: string; model?: ModelIdentity };
export function launchArena(p: Launch) { return new WorkerPool(p.workers, 1, p.window, p.services, p.mode, 'arena_worker.bundle.mjs', p.model); }
export function serviceHealth(pool: WorkerPool) {
    const services = [...pool.mux.clients, ...(pool.opponentMux?.clients ?? [])].map(c => ({ ...c.transport.diagnostics, pid: c.transport.pid, exitCode: c.exitCode,
        closeMs: c.closeMs, forcedTermination: c.transport.forcedTermination }));
    const hardTimeouts = services.reduce((n, r) => n + r.hardTimeouts, 0);
    const failure = services.some(r => r.failure || r.exitCode !== 0 || r.forcedTermination || r.inFlight !== null);
    return { services, hardTimeouts, passed: hardTimeouts === 0 && !failure };
}
const wire = (pool: WorkerPool) => pool.mux.clients.reduce((r, c) => {
    const d = c.transport.diagnostics;
    return { completed: r.completed + d.completed, ms: r.ms + d.wireMs };
}, { completed: 0, ms: 0 });

/** 已完成局的收据与逐步数据库绑定；健康错误持久化后立即停止派发。 */
export async function runPanel(args: { label: string; config: any; launch: Launch; panelSha: string; limits: any;
    jobs: any[]; strictFallbacks: boolean; sealedAccess: number; deadlineMs?: number }) {
    assert(/^[a-zA-Z0-9_-]+$/.test(args.label));
    const dir = path.join(data, 'arena', args.label);
    fs.mkdirSync(dir, { recursive: true });
    const sourceIdentity = sha(JSON.stringify({ worker: fileSha(path.join(here, 'arena_worker.bundle.mjs')),
        config: args.config, launch: args.launch, panel: args.panelSha, limits: args.limits }));
    const summaryFile = path.join(dir, 'SUMMARY.json');
    if (fs.existsSync(summaryFile)) {
        const prior = readJson(summaryFile);
        assert.equal(prior.sourceIdentity, sourceIdentity);
        if (!prior.passed) throw Error(`保留已落盘的正式评测失败：${args.label}`);
        if (prior.games.length === args.jobs.length && prior.games.every((g: any, i: number) => g.id === args.jobs[i].match.id)) return prior;
    }
    const completed = new Map<string, any>();
    const pending = [];
    for (const job of args.jobs) {
        assert(/^[a-zA-Z0-9_-]+$/.test(job.match.id));
        const receipt = path.join(dir, `${job.match.id}.receipt.json`);
        const database = path.join(dir, `${job.match.id}.sqlite`);
        if (fs.existsSync(receipt)) {
            const r = readJson(receipt);
            assert(r.sourceIdentity === sourceIdentity && r.initialSha256 === job.initialSha256 && r.result.id === job.match.id);
            if (!r.result.natural || r.result.error || args.strictFallbacks && r.result.fallbacks) throw Error(`已保留失败局：${job.match.id}`);
            completed.set(job.match.id, r.result);
        } else pending.push({ ...job, receipt, database, config: args.config, limits: args.limits, sourceIdentity, deadlineMs: args.deadlineMs });
    }
    const wireLedger = path.join(dir, 'WIRE.json');
    const oldWire = fs.existsSync(wireLedger) ? readJson(wireLedger) : { sourceIdentity, completed: 0, ms: 0 };
    assert.equal(oldWire.sourceIdentity, sourceIdentity);
    let health: ReturnType<typeof serviceHealth> | null = null, error: string | null = null;
    let measured = oldWire;
    if (pending.length) {
        const pool = launchArena(args.launch);
        let start = wire(pool);
        try {
            await pool.run(pending.map(j => ({ kind: 'warm', state: j.initial })));
            start = wire(pool);
            await pool.run(pending, (row, i) => {
                const j = pending[i];
                saveJson(j.receipt, { sourceIdentity, initialSha256: j.initialSha256, result: row.result });
                completed.set(j.match.id, row.result);
                const m = wire(pool);
                saveJson(wireLedger, { sourceIdentity, completed: oldWire.completed + m.completed - start.completed, ms: oldWire.ms + m.ms - start.ms });
                saveJson(path.join(dir, 'PROGRESS.json'), { completed: completed.size, total: args.jobs.length, last: j.match.id, sealedAccess: args.sealedAccess });
                if (!row.result.natural || row.result.error || args.strictFallbacks && row.result.fallbacks) throw Error(`评测健康失败：${j.match.id}`);
                positiveProgressStop();
            });
        } catch (e) { error = String(e); }
        finally { await pool.close(); }
        health = serviceHealth(pool);
        const m = wire(pool);
        measured = { sourceIdentity, completed: oldWire.completed + m.completed - start.completed, ms: oldWire.ms + m.ms - start.ms };
        saveJson(wireLedger, measured);
    }
    const games = args.jobs.map(j => completed.get(j.match.id)).filter(Boolean);
    const result = { games, ...arenaStats(games), health, error, sourceIdentity, panelSha: args.panelSha,
        meanWireMs: measured.completed ? measured.ms / measured.completed : null, sealedAccess: args.sealedAccess,
        passed: !error && (health === null || health.passed) && games.length === args.jobs.length && games.every(r => r.natural) };
    saveJson(summaryFile, result);
    return result;
}
