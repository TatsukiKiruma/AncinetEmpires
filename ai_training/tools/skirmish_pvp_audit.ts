import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { GameEngine } from '../src/game/engine';
import { encodeAction } from '../src/game/env';
import { expandApkReplayRecordToProjectActions, createRecordExpansionOptions } from '../src/game/apk_replay';
import { parseRemoteReplay } from './apk_game_get_validate';

const root = 'training_runs/pvp_navigation_20260918';
interface Entry { copiedPath: string; inputPath: string; sha256: string; actionCount: number; finalWinner: number; fileName: string; split: string; id: number }
async function audit(entry: Entry) {
    const hash = createHash('sha256').update(await readFile(entry.copiedPath)).digest('hex');
    if (hash !== entry.sha256) throw new Error(`原始文件哈希变化：${entry.fileName}`);
    const parsed = await parseRemoteReplay(entry.copiedPath, {
        inputs: [], rootDir: '', outPath: null, json: false, mode: 'SD', maxRecords: 100000,
        offset: 0, limit: null, uniqueOffset: null, uniqueLimit: null, dedupe: true,
        allowAmbiguousRecruit: true, strictTerrain: false, forceExecuteReplayActions: false,
    });
    const engine = new GameEngine(parsed.initialState, { disableAutoAdvanceWhenNoMeaningfulAction: true, applyInitialTurnStart: true });
    const chosen = new Set(Array.from({ length: Math.min(80, parsed.actions.length) }, (_, i) => Math.floor((i + 0.5) * parsed.actions.length / Math.min(80, parsed.actions.length))));
    const snapshots: string[] = [];
    let error: string | null = null;
    let records = 0;
    let actions = 0;
    let index = 0;
    try {
        for (; index < parsed.actions.length; index++) {
            const expanded = expandApkReplayRecordToProjectActions(parsed.actions[index], engine.getState(),
                createRecordExpansionOptions(parsed.actions, index, { allowAmbiguousRecruitDeployFirstMatch: true }));
            for (const action of expanded) {
                const state = engine.getState();
                // 只保留严格合法的实际玩家动作；不强制执行、不改成人工教师标签。
                const label = encodeAction(action);
                if (!engine.getLegalActions(state.currentPlayer).some(a => encodeAction(a) === label)) throw new Error(`候选集中不存在真实动作 ${label}`);
                if (chosen.has(index) && action.type !== 'surrender') snapshots.push(JSON.stringify({ source: entry, recordIndex: index, actionIndex: actions, action, state }));
                const result = engine.step(action);
                if (result.info.includes('非法动作')) throw new Error(result.info);
                actions++;
            }
            records++;
            if (index % 300 === 0) parentPort!.postMessage({ progress: true, id: entry.id, records: index });
        }
    } catch (e) { error = String(e); }
    const final = engine.getState();
    const accepted = error === null && records === entry.actionCount && final.winner === entry.finalWinner;
    if (accepted) await writeFile(`${root}/states/${entry.id}.jsonl`, snapshots.join('\n') + '\n');
    return { ...entry, accepted, records, actions, expectedRecords: entry.actionCount, finalWinner: final.winner,
        finalTurn: final.turn, samples: accepted ? snapshots.length : 0, error: error ?? (accepted ? null : '记录数或终局胜者与历史清单不一致'), failureRecord: error ? index : null };
}
async function main() {
    await mkdir(`${root}/states`, { recursive: true });
    const entries = (await readFile('training_runs/replay_cleaning/sd_20260907_existing/training_full.jsonl', 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line)).sort((a, b) => a.sha256.localeCompare(b.sha256));
    if (entries.length !== 78 || new Set(entries.map(e => e.sha256)).size !== 78) throw new Error('78 局唯一性检查失败');
    const jobs: Entry[] = entries.map((e, id) => ({ ...e, id, split: id < 54 ? 'train' : id < 66 ? 'validation' : 'test' }));
    await writeFile(`${root}/split.json`, JSON.stringify({ workers: 8, splitMethod: '整局 SHA256 排序，54/12/12；校验失败整局剔除', jobs }, null, 2));
    let next = 0;
    const rows: Awaited<ReturnType<typeof audit>>[] = [];
    const pool: Worker[] = [];
    try {
        await Promise.all(Array.from({ length: 8 }, () => new Promise<void>((resolve, reject) => {
            const bridge = `(async()=>{const {register}=await import('tsx/esm/api');register();await import(${JSON.stringify(import.meta.url)});})().catch(e=>{console.error(e);process.exit(1)});`;
            const worker = new Worker(bridge, { eval: true, workerData: { pvpAudit: true } });
            pool.push(worker);
            worker.on('message', message => {
                if (message.progress) { console.log(`回放 #${message.id} 已核对 ${message.records} 条`); return; }
                if (!message.ready) { rows.push(message); console.log(`完成 ${rows.length}/78 #${message.id} 通过=${message.accepted} ${message.error ?? ''}`); }
                worker.postMessage(jobs[next++] ?? null);
            });
            worker.on('error', reject);
            worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`回放 worker 退出 ${code}`)));
        })));
        await writeFile(`${root}/audit.json`, JSON.stringify(rows.sort((a,b)=>a.id-b.id), null, 2));
    } finally { await Promise.all(pool.map(w => w.terminate())); }
}
if (isMainThread) main().catch(e => { console.error(e); process.exitCode = 1; });
else if (workerData.pvpAudit) parentPort!.on('message', async entry => {
    if (!entry) { parentPort!.close(); return; }
    try { parentPort!.postMessage(await audit(entry)); } catch(e) { console.error(e); process.exit(1); }
});
if (!isMainThread && workerData.pvpAudit) parentPort!.postMessage({ ready: true });
