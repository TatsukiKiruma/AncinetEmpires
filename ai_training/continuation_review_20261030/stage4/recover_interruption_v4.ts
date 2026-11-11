/** 冻结异常退出原件，只恢复完整JSON行和可核验动作前缀，不续跑中断局。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync, constants } from 'node:zlib';
import { GameEngine } from '../../../src/game/engine';
import { HERE, ROOT, S3, DATA, read, save, fileSha, sha } from './io';
import { verifyPreservation } from './resume_records';

const original = path.join(DATA, 'resume-v4-full-maxn-prior035');
const out = path.join(DATA, 'interruption-v4-source-view');
const id = 'p3-14-s1', partial = path.join(original, id);
assert(!fs.existsSync(out));
assert(!fs.existsSync(path.join(HERE, 'STAGE4_CANDIDATE_LOCK.json')));
const preserved = { ...read(path.join(HERE, 'PRESERVED_GAMES_VERIFIED_V4.json')).files };
verifyPreservation(preserved);
for (const [file, hash] of Object.entries(read(path.join(HERE, 'RESUME_RUN_STARTED_V4.json')).runtime.files)) assert.equal(fileSha(path.join(ROOT, file)), hash);
const freeze = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) freeze(p); else if (e.isFile()) preserved[p] = fileSha(p); } };
freeze(original);
for (const name of ['controller-resume-v4.stdout.log', 'controller-resume-v4.stderr.log']) preserved[path.join(DATA, name)] = fileSha(path.join(DATA, name));
const panel = read(path.join(S3, 'OMNI_ARENA_DEV_PANEL.json')), manifest = read(path.join(S3, 'DEV_INITIAL_MANIFEST.json'));
const match = panel.matches.find((m: any) => m.id === id), slot = manifest.slots[match.slot];
const initial = read(path.join(S3, slot.file)); assert.equal(fileSha(path.join(S3, slot.file)), slot.sha256);
const parse = (name: string) => {
    const bytes = gunzipSync(fs.readFileSync(path.join(partial, name)), { finishFlush: constants.Z_SYNC_FLUSH });
    const text = bytes.toString('utf8'), lastNewline = text.lastIndexOf('\n');
    return text.slice(0, lastNewline + 1).split('\n').filter(Boolean).map(line => JSON.parse(line));
};
const steps = parse('steps.jsonl.gz'), search = parse('search.jsonl.gz'), witnesses = parse('witnesses.jsonl.gz');
const engine = new GameEngine(initial, panel.engineOptions);
for (const [i, row] of steps.entries()) {
    assert.equal(row.step, i); assert.equal(sha(JSON.stringify(engine.getState())), row.before);
    assert(engine.hasLegalAction(engine.getState().currentPlayer, row.action)); engine.step(row.action);
    assert.equal(sha(JSON.stringify(engine.getState())), row.after);
}
let witnessActions = 0;
for (const w of witnesses) {
    const replay = new GameEngine(w.initial, panel.engineOptions);
    for (const a of w.actions) { assert(replay.hasLegalAction(replay.getState().currentPlayer, a)); replay.step(a); witnessActions++; }
    assert.deepEqual(replay.getState(), w.final);
}
const ids = initial.players.filter((p: any) => p.isAlive).map((p: any) => p.id).sort((a: number, b: number) => a - b);
const run = read(path.join(original, 'RUN.json'));
const result = { ...match, players: ids.length, map: slot.map, category: slot.category, modelPlayer: ids[match.seat], initialSha256: slot.sha256,
    natural: false, classification: 'runtime_error', winner: null, firstPlace: null, normalizedRank: null,
    error: '执行进程在无退出收据的情况下消失；压缩日志未正常关闭。精确退出原因未证实，不改判为时间判负或自然负局。',
    runtimeSha256: run.runtimeSha256, steps: steps.length, rounds: engine.getState().turn - initial.turn,
    roots: search.filter((t: any) => !t.queued && t.stopReason !== 'unique_action').length,
    witnessCount: witnesses.length, witnessActions, allSavedWitnessesLegal: true, eliminations: [],
    eliminatedBeforeFinalOpponent: null, earlyEliminated: null, wallMs: null, transportFault: null,
    recoveredPrefixOnly: true, finalIsPartialSnapshot: true, telemetryIncomplete: true, countsAreObservedLowerBounds: true,
    verifiedActionsLastStep: steps.at(-1)?.step, observedTelemetryLastStep: search.at(-1)?.step,
    originalArtifactDirectory: partial, recoveryDoesNotRerunGame: true };
fs.mkdirSync(out); fs.copyFileSync(path.join(original, 'RUN.json'), path.join(out, 'RUN.json'), fs.constants.COPYFILE_EXCL);
let completed = 0;
for (const entry of fs.readdirSync(original, { withFileTypes: true })) if (entry.isDirectory() && fs.existsSync(path.join(original, entry.name, 'result.json'))) {
    fs.symlinkSync(path.join(original, entry.name), path.join(out, entry.name), 'junction'); completed++;
}
assert.equal(completed, 19);
const recovered = path.join(out, id); fs.mkdirSync(recovered);
for (const [name, rows] of [['steps', steps], ['search', search], ['witnesses', witnesses]] as const) fs.writeFileSync(path.join(recovered, `${name}.jsonl.gz`), gzipSync(rows.map((r: any) => JSON.stringify(r) + '\n').join('')), { flag: 'wx' });
await save(path.join(recovered, 'final.json'), engine.getState(), true);
await save(path.join(recovered, 'result.json'), result, true);
freeze(out); verifyPreservation(preserved);
await save(path.join(HERE, 'PRESERVED_INTERRUPTION_V4.json'), { files: preserved, originalGames: 57, newlyCompletedGames: 19, interruptedGames: 1, noGameRetried: true }, true);
await save(path.join(HERE, 'INTERRUPTION_INCIDENT_V4.json'), { detected: new Date().toISOString(), original, sourceView: out,
    completedGames: 19, interruptedId: id, remainingUnstartedGames: 13, result,
    cause: '未取得退出码或控制器异常收据。退出接近原工具会话启动后两小时，仅为宿主会话生命周期线索，不认定GPU故障。',
    telemetryPolicy: '仅审计实际保存的完整行，最终全量健康度标记不完整；不能拿观测比例证明严格>90%门槛。',
    launchRepair: '新后继用Win32_Process独立隐藏宿主，避免继续绑定旧工具会话。', sealedAccess: 0 }, true);
const plan = read(path.join(HERE, 'RESUME_V4_PLAN.json'));
const recorded = new Set([...plan.approvedRemainingIds.filter((x: string) => fs.existsSync(path.join(out, x, 'result.json')))]);
const remaining = plan.approvedRemainingIds.filter((x: string) => !recorded.has(x)); assert.equal(remaining.length, 13);
await save(path.join(HERE, 'RESUME_V4_RECOVERY_PLAN.json'), { ...plan, schema: 'stage4-no-retry-interruption-recovery-v4',
    approvedRemainingIds: remaining, preservationSha256: fileSha(path.join(HERE, 'PRESERVED_INTERRUPTION_V4.json')),
    sourcesByConfig: { ...plan.sourcesByConfig, 'maxn-prior035': [...plan.sourcesByConfig['maxn-prior035'], out] },
    interruptedId: id, expectedRecordedGames: 41, telemetryCompletenessRequired: true,
    runtimeMixtureDisclosure: plan.runtimeMixtureDisclosure + '；p3-14-s1异常中断仅恢复可核验前缀，非自然分留空，遥测不完整，不能证明全量健康门槛。' }, true);
console.log(JSON.stringify({ completed, interrupted: id, verifiedSteps: steps.length, searchRows: search.length, witnesses: witnesses.length, remaining }));
