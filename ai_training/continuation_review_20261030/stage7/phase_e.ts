import { passesPromotion } from './promotion_gate';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { devPanel, runPanel } from './arena_panel';
import { checkH1, checkSourceLock, data, fileSha, h1Sha, here, readJson, readLocal, s3, saveLocal, saveJson } from './phase7_io';
import { runPython } from './export_parity';
import { DatasetPack, type Example } from './dataset_pack';
import { decisions, verifyFiles } from '../stage1/io';

const gateFile = path.join(here, 'PHASE_D_DECISION.json');
const gateHash = fileSha(gateFile), gate = readJson(gateFile, gateHash);
assert(gate.passed && gate.stage === 'Dev54' && gate.sealedAccess === 0 && gate.chosen?.passed, 'Dev-54 未晋级，封存保持关闭');
const chosen = gate.chosen, full = chosen.full, model = chosen.model;
const baselineFile = path.join(here, 'STAGE7_BASELINE_DEV54.json');
const baseline = readJson(baselineFile, gate.baselineSha256), b = readLocal('PHASE_B_DECISION.json');
assert(baseline.passed && b.passed && chosen.training.offlinePassed && chosen.parity.passed);
assert(full.passed && full.natural === 54 && full.timeForfeits === 0
    && full.games.length === 54 && new Set(full.games.map((g: any) => g.id)).size === 54 && full.games.every((g: any) => g.natural && !g.error));
assert(full.panelSha === baseline.panelSha && passesPromotion(full, baseline));
assert([1, 2].includes(chosen.generation) && ['K1', 'K2'].includes(chosen.kind));
const dev = devPanel(), devJobs = new Map(dev.jobs.map((j: any) => [j.match.id, j]));
assert.equal(dev.panelSha, full.panelSha);
for (const g of full.games) {
    const expected: any = devJobs.get(g.id);
    assert(expected && expected.players === g.players && expected.match.seed === g.seed && expected.match.seat === g.seat);
    const receipt = readJson(path.join(data, 'arena', `gen${chosen.generation}-${chosen.kind}-dev`, `${g.id}.receipt.json`));
    assert(receipt.sourceIdentity === full.sourceIdentity && receipt.initialSha256 === expected.initialSha256);
    assert.deepEqual(receipt.result, g);
}
for (const [n, total, wins] of [[2, 20, Math.max(15, baseline.byPlayers[2].wins - 1)], [3, 18, full.wins >= Math.max(36, baseline.B + 1) ? 0 : 11], [4, 16, Math.max(10, baseline.byPlayers[4].wins - 2)]]) {
    const group = full.games.filter((g: any) => g.players === n);
    assert(group.length === total && group.filter((g: any) => g.won).length >= wins);
}
const engine = checkSourceLock(); checkH1();
assert(engine.sha256 === gate.engineSha256 && gate.inferenceMode === b.inferenceMode && baseline.inferenceMode === b.inferenceMode);
assert.equal(fileSha(model.prefix + '.bin'), model.sha256);
const tokenFile = path.join(here, 'STAGE7_SEALED_TOKEN.json');
const token = { sealedAccess: 1, attempts: 1, gateSha256: gateHash, modelSha256: model.sha256, engineSha256: engine.sha256,
    inferenceMode: b.inferenceMode, openedAt: new Date().toISOString(), pid: process.pid };
// 成功独立复核前没有读封存文件；原子占用后，不接受新进程再次开启封存会话。
fs.writeFileSync(tokenFile, JSON.stringify(token, null, 2), { flag: 'wx' });
saveLocal('SEALED_ACCESS.json', { ...token, phaseEStarted: true });
saveLocal('RUN_STATUS.json', { phase: 'E', status: 'running', sealedAccess: 1, updatedAt: token.openedAt });

function finalPanel(split: 'test' | 'historical') {
    const folder = split === 'test' ? s3 : path.join(here, '../stage1');
    const file = path.join(folder, split === 'test' ? 'OMNI_ARENA_TEST_PANEL.json' : 'ARENA_PANEL.json');
    const panelSha = fileSha(file), panel = readJson(file, panelSha);
    const manifest = split === 'test' ? readJson(path.join(folder, 'TEST_INITIAL_MANIFEST.json')) : panel;
    const n = split === 'test' ? 54 : 40;
    if (split === 'test') assert.equal(manifest.panelSha256, panelSha);
    assert(panel.matches.length === n && new Set(panel.matches.map((m: any) => m.id)).size === n);
    const jobs = panel.matches.map((match: any) => {
        const slot = manifest.slots[match.slot], initial = readJson(path.join(folder, slot.file), slot.sha256);
        const players = initial.players.filter((p: any) => p.isAlive).length;
        if (split === 'test') assert.equal(slot.players, players);
        return { kind: 'match', split, match, players, initial, initialSha256: slot.sha256 };
    });
    if (split === 'test') for (const [players, count] of [[2, 20], [3, 18], [4, 16]]) assert.equal(jobs.filter((j: any) => j.players === players).length, count);
    return { panelSha, jobs, limits: { engineOptions: panel.engineOptions, maxActions: panel.maxActions,
        maxRounds: panel.maxRounds, maxWallMs: 7200000, maxDecisionMs: panel.maxDecisionMs } };
}

async function offlinePack() {
    const panelFiles = [path.join(s3, 'acceptance_v1/SEALED_OFFLINE_PANEL.json'), path.join(s3, 'SEALED_OFFLINE_PANEL.json')];
    const file = panelFiles.find(p => fs.existsSync(p)); assert(file, '缺少封存离线冻结面板');
    const panelSha = fileSha(file), offline = readJson(file, panelSha);
    assert.equal(offline.parents, 329);
    const partitionFile = path.join(here, '../stage1/PARTITIONS.json');
    const parents = new Map<string, any>(readJson(partitionFile).parents.filter((p: any) => p.admitted && p.split === 'test')
        .map((p: any) => [p.parentId, p]));
    const requests = new Map<string, Map<string, any>>();
    for (const r of offline.requests) {
        assert(r.split === 'test' && parents.has(r.parentId));
        const group = requests.get(r.parentId) ?? new Map();
        const key = `${r.macro}/${r.sub}`; assert(!group.has(key)); group.set(key, r); requests.set(r.parentId, group);
    }
    assert.equal(requests.size, 329);
    const out = path.join(data, 'sealed-offline'); fs.mkdirSync(out, { recursive: true });
    const dbFile = path.join(out, 'dataset.sqlite'), identity = `${gateHash}/${panelSha}/${engine.sha256}`;
    const pack = new DatasetPack(dbFile, identity);
    try {
        let completed = 0;
        for (const [id, selected] of requests) {
            const p = parents.get(id), macros = new Set<number>([...selected.values()].map(r => r.macro));
            verifyFiles(p);
            const examples: Example[] = [];
            for await (const row of decisions(p, macros)) {
                if (!selected.has(`${row.macro}/${row.sub}`)) continue;
                examples.push({ state: row.state, demonstration: row.action, teacher: null, winner: p.winner, keepActions: true,
                    source: { parentId: id, step: row.macro, players: p.players, category: row.phase, split: 'test', groupId: p.groupId } });
            }
            assert.equal(examples.length, selected.size, `冻结离线前态数量不符：${id}`);
            pack.pack(id, 'sealed-offline', examples);
            saveLocal('PHASE_E_PROGRESS.json', { phase: 'offline329_encoding', completed: ++completed, total: 329, sealedAccess: 1 });
        }
        const stats = pack.stats();
        assert.equal(stats.total?.samples, offline.requests.length);
        const result = { ...stats, parents: requests.size, panelSha, dbFile, identity, sealedAccess: 1 };
        saveJson(path.join(out, 'DATASET.json'), result);
        await runPython('sealed_offline_stage7.py', [model.prefix, model.sha256, dbFile, identity, tokenFile, path.join(out, 'OFFLINE.json')], path.join(out, 'offline.log'));
        return readJson(path.join(out, 'OFFLINE.json'));
    } finally { pack.close(); }
}

const launch = { workers: baseline.workers, services: b.chosen.services, window: b.chosen.window, mode: b.inferenceMode };
const args = { launch, config: baseline.config, strictFallbacks: false, sealedAccess: 1 };
assert.equal(args.config.modelVersion, h1Sha);
const candidateConfig = { ...baseline.config, modelPrefix: model.prefix, modelVersion: model.sha256 };
const candidateLaunch = { ...launch, model };
const test = finalPanel('test');
saveLocal('PHASE_E_PROGRESS.json', { phase: 'sealed54_c1', sealedAccess: 1 });
const c1 = await runPanel({ ...args, ...test, label: 'C1-sealed' });
assert(c1.passed && c1.natural === 54 && c1.timeForfeits === 0, 'C1 封存评测健康失败');
saveLocal('PHASE_E_PROGRESS.json', { phase: 'sealed54_candidate', sealedAccess: 1 });
const candidate = await runPanel({ ...args, ...test, launch: candidateLaunch, config: candidateConfig, label: 'candidate-sealed' });
assert(candidate.passed && candidate.natural === 54 && candidate.timeForfeits === 0, '候选封存评测健康失败');
saveLocal('PHASE_E_PROGRESS.json', { phase: 'historical40', sealedAccess: 1 });
const historical = await runPanel({ ...args, ...finalPanel('historical'), launch: candidateLaunch, config: candidateConfig, label: 'candidate-historical' });
assert(historical.passed && historical.natural === 40 && historical.timeForfeits === 0, 'Historical-40 健康失败');
const offline = await offlinePack();
assert(offline.passed && offline.parents === 329);
const passed = candidate.wins >= Math.max(37, c1.wins + 1) && candidate.equalWin > c1.equalWin
    && candidate.byPlayers[2].wins >= 15 && candidate.byPlayers[3].wins >= 11 && candidate.byPlayers[4].wins >= 10
    && [2, 3, 4].every(n => candidate.byPlayers[n].wins >= c1.byPlayers[n].wins - 2);
saveLocal('PHASE_E_DECISION.json', { passed, c1, candidate, historical, offline, token, sealedAccess: 1 });
saveLocal('PHASE_E_PROGRESS.json', { phase: 'complete', passed, sealedAccess: 1 });
