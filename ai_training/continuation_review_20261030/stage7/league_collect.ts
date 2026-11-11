import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkerPool } from './worker_pool';
import { leagueBlock, officialMaps, type Cut } from './league_schedule';
import { serviceHealth } from './arena_panel';
import { data, fileSha, h1Sha, here, positiveProgressStop, readJson, readLocal, saveJson, saveLocal, sha } from './phase7_io';
import type { ModelIdentity } from './client_v2';

export function trainingDirectory(generation: number) { return path.join(data, 'league', `gen${generation}`); }
function collectCuts(generation: number): Cut[] {
    if (generation <= 1) return [];
    const prior = readJson(path.join(trainingDirectory(generation - 1), 'SUMMARY.json'));
    assert(prior.passed && prior.generation === generation - 1 && prior.sealedAccess === 0);
    return prior.games.flatMap((g: any) => {
        if (!g.natural) return [];
        assert(path.dirname(g.database) === trainingDirectory(generation - 1));
        const db = new DatabaseSync(g.database, { readOnly: true });
        try {
            const cut = db.prepare('SELECT step,state FROM cuts ORDER BY ABS(turn-15),turn LIMIT 1').get();
            return cut ? [{ state: JSON.parse(String(cut.state)), sourceGame: g.gameId, sourceStep: cut.step,
                generation: generation - 1, players: g.players }] : [];
        } finally { db.close(); }
    });
}

export async function collectLeague(generation: number, candidate: ModelIdentity, deadlineMs: number) {
    assert([1, 2].includes(generation));
    assert.equal(fileSha(candidate.prefix + '.bin'), candidate.sha256);
    const b = readLocal('PHASE_B_DECISION.json'), baseline = readLocal('STAGE7_BASELINE_DEV54.json');
    assert(b.passed && baseline.passed && baseline.sealedAccess === 0, 'C 未通过，禁止联赛采集');
    const config = readLocal('TEACHER_CONFIG.json');
    assert(config.budgetMs === 60000 && config.maxNodes === 2500 && config.priorAnchor === .1 && config.finalists === 8);
    const separateC1 = candidate.sha256 !== h1Sha;
    const launch = { workers: b.chosen.workers, games: b.chosen.games, services: b.chosen.services,
        mode: b.inferenceMode, window: b.chosen.window };
    const sourceIdentity = sha(JSON.stringify({ config, launch, engine: baseline.engineSha256, candidate,
        worker: fileSha(path.join(here, 'league_worker.bundle.mjs')),
        schedule: fileSha(path.join(here, 'league_schedule.ts')) }));
    const out = trainingDirectory(generation);
    fs.mkdirSync(out, { recursive: true });
    const summary = path.join(out, 'SUMMARY.json');
    if (fs.existsSync(summary)) {
        const r = readJson(summary); assert.equal(r.sourceIdentity, sourceIdentity);
        return r;
    }
    const cuts = collectCuts(generation);
    const clockFile = path.join(out, 'CLOCK.json');
    if (!fs.existsSync(clockFile)) saveJson(clockFile, { startedMs: Date.now(), sourceIdentity });
    const clock = readJson(clockFile); assert.equal(clock.sourceIdentity, sourceIdentity);
    const complete: any[] = [], active: string[] = [];
    const counters = { natural: 0, validTeachers: 0, steps: 0, truncations: 0, cuts: 0 };
    const maps = new Set<string>(), seats = new Set<string>(), naturalGroups = new Set<number>();
    const totalSeats = officialMaps().reduce((n, map) => n + map.playerCount, 0);
    const goal = () => (counters.natural >= 180 || counters.validTeachers >= 6000)
        && naturalGroups.size === 3 && seats.size === totalSeats;
    const record = (r: any) => {
        complete.push(r); counters.natural += Number(r.natural); counters.validTeachers += r.validTeachers;
        counters.steps += r.step; counters.truncations += Number(r.classification === 'round_truncation');
        counters.cuts += Number(!!r.cut);
        if (!r.cut) { maps.add(r.map); seats.add(`${r.map}/${r.candidate}`); }
        if (r.natural) naturalGroups.add(r.players);
    };
    let block = 0, dispatchOffset = 0, failure: string | null = null, health: ReturnType<typeof serviceHealth> | null = null;
    const pool = new WorkerPool(launch.workers, launch.games, launch.window, launch.services, launch.mode,
        'league_worker.bundle.mjs', separateC1 ? candidate : undefined, separateC1);
    try {
        while (!goal() && Date.now() < deadlineMs) {
            positiveProgressStop();
            const jobFile = path.join(out, `block-${block}.json`);
            const jobs = leagueBlock(generation, block, cuts, 2026110807).map(job => ({ ...job, config, candidateModelSha256: candidate.sha256, sourceIdentity,
                database: path.join(out, `${job.gameId}.sqlite`) }));
            if (fs.existsSync(jobFile)) assert.equal(sha(JSON.stringify(readJson(jobFile))), sha(JSON.stringify(jobs)), '联赛计划变化');
            else saveJson(jobFile, jobs);
            const pending = jobs.filter(job => {
                const file = path.join(out, `${job.gameId}.receipt.json`);
                if (!fs.existsSync(file)) return true;
                const receipt = readJson(file); assert(receipt.sourceIdentity === sourceIdentity && receipt.result.gameId === job.gameId);
                record(receipt.result); return false;
            });
            await pool.run(pending.map(j => ({ ...j, deadlineMs, transportJobId: dispatchOffset + jobs.indexOf(j) + 1 })), (reply, index) => {
                const row = reply.result;
                if (row.wallLimit) { active.push(row.gameId); return; }
                assert(row.complete && (row.natural || row.classification === 'round_truncation'), '无效对局结果');
                const id = pending[index].gameId;
                saveJson(path.join(out, `${id}.receipt.json`), { sourceIdentity, result: row });
                record(row);
                saveLocal('PHASE_D_PROGRESS.json', { generation, phase: 'collection', block, completed: complete.length,
                    ...counters, maps: maps.size, sealedAccess: 0 });
                positiveProgressStop();
            });
            dispatchOffset += jobs.length;
            block++;
        }
    } catch (e) { failure = String(e); }
    finally { await pool.close(); health = serviceHealth(pool); }
    const hours = (Date.now() - clock.startedMs) / 3600000;
    const matrix = ['hard', 'C1', 'mixed'].map(kind => ({ kind, byPlayers: [2, 3, 4].map(players => {
        const rows = complete.filter(g => g.kind === kind && g.players === players);
        return { players, games: rows.length, natural: rows.filter(g => g.natural).length, candidateWins: rows.filter(g => g.won).length };
    }) }));
    const passed = !failure && health.passed && goal() && active.length === 0;
    const result = { passed, generation, sourceIdentity, games: complete, ...counters, hours,
        naturalPerHour: counters.natural / hours, validTeachersPerHour: counters.validTeachers / hours,
        truncationRate: counters.truncations / Math.max(1, complete.length), coverage: [...maps], seatCoverage: [...seats], totalSeats, matrix,
        wallLimit: Date.now() >= deadlineMs, unfinishedAtWallLimit: active, failure, health, sealedAccess: 0 };
    saveJson(summary, result);
    return result;
}
