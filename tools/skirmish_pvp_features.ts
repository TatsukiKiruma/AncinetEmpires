import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { AncientEmpiresEnv, encodeAction, decodeAction } from '../src/game/env';
import { GameEngine } from '../src/game/engine';
import { HeuristicAI } from '../src/game/ai/heuristic_ai';
import { buildLiveBcSample } from './skirmish_training_runner';
import { createDefaultEnvFactory, replayEpisodeDatasetItems, type SkirmishDatasetSample } from './skirmish_dataset_export';
import { buildCandidateFeatures, sparseFeaturesToEntries, type SkirmishFeatureSample } from './skirmish_bc_train';
import { selectStratifiedHardNegativeCandidates } from './skirmish_candidate_sampling';
import type { GameState } from '../src/game/types';

const root = 'training_runs/pvp_navigation_20260918';
interface Job { kind: 'pvp' | 'ai'; id: number; split: string; file: string; humanPlayers?: number[] }
function hash(text: string) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
async function run(job: Job) {
    const lines: Record<string, string[]> = { v3: [], v4: [] };
    const stats = { ...job, samples: 0, labelBelowTeacher: 0, legalCandidates: 0, exportedCandidates: 0, labelTypes: {} as Record<string, number> };
    const convert = (sample: SkirmishDatasetSample, state: GameState) => {
        const key = `${sample.scenario.id}:${sample.seed}:${sample.step}`;
        const preselected = selectStratifiedHardNegativeCandidates(sample.legalActionCodes.filter(code => code !== 'surrender').map(actionCode => ({ actionCode, teacherScore: 0 })), sample.label.actionCode,
            { maxCandidates: 96, hardNegativeRatio: 0, deterministicKey: key });
        const teacher = new HeuristicAI(() => 0.5).scoreCandidateActions(new GameEngine(state), sample.playerId, preselected.map(c => decodeAction(c.actionCode)!));
        const selected = selectStratifiedHardNegativeCandidates(preselected.map((c,i) => ({ actionCode: c.actionCode, teacherScore: teacher[i].score })), sample.label.actionCode,
            { maxCandidates: 64, hardNegativeRatio: 0.5, deterministicKey: key });
        // 候选顺序独立于标签和教师分，避免离线命中率被首位标签抬高。
        selected.sort((a,b) => hash(`${key}:${a.actionCode}`) - hash(`${key}:${b.actionCode}`));
        if (!selected.length) throw new Error('缺少真实动作标签');
        const labelScore = selected.find(c => c.actionCode === sample.label.actionCode)!.teacherScore;
        if (labelScore < Math.max(...selected.map(c => c.teacherScore))) stats.labelBelowTeacher++;
        for (const version of ['v3','v4'] as const) {
            const featureExtractor = `hashed-action-${version}` as const;
            const output: SkirmishFeatureSample = { kind: 'skirmish_feature_sample', version: 1, featureDim: 4096, featureExtractor,
                source: sample.source, scenario: sample.scenario, seed: sample.seed, step: sample.step, turn: sample.turn,
                playerId: sample.playerId, policy: sample.policy, label: { actionCode: sample.label.actionCode, fixedActionIndex: sample.label.fixedActionIndex },
                candidates: selected.map(c => ({ actionCode: c.actionCode, teacherScore: c.teacherScore, features: sparseFeaturesToEntries(buildCandidateFeatures(sample, c.actionCode, 4096, featureExtractor)!) })) };
            lines[version].push(JSON.stringify(output));
        }
        stats.samples++;
        stats.legalCandidates += sample.legalActionCodes.length;
        stats.exportedCandidates += selected.length;
        const type = sample.label.action.type;
        stats.labelTypes[type] = (stats.labelTypes[type] ?? 0) + 1;
    };
    if (job.kind === 'pvp') {
        const snapshots = (await readFile(job.file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
        for (const snapshot of snapshots) {
            const state: GameState = snapshot.state;
            if (!job.humanPlayers?.includes(state.currentPlayer)) continue;
            if ((state.rules?.alliances?.[state.currentPlayer] ?? state.currentPlayer) !== snapshot.source.finalWinner) continue;
            const env = new AncientEmpiresEnv({ initialState: state });
            const result = env.reset();
            const label = encodeAction(snapshot.action);
            const entry = result.legalActionEntries.find(e => e.code === label);
            if (!entry || entry.fixedActionIndex === null) throw new Error(`真人动作无法编码：${label}`);
            const sample = buildLiveBcSample({ result, playerId: state.currentPlayer, stepNumber: snapshot.actionIndex,
                episodeSeed: job.id, scenario: { id: `PVP:${snapshot.source.sha256}`, mode: 'SD', mapName: snapshot.source.fileName, resourcePath: snapshot.source.copiedPath } });
            sample.source = { inputFile: snapshot.source.copiedPath, episodeIndex: job.id, stepIndex: snapshot.actionIndex };
            sample.policy = 'human-winner';
            sample.label = { actionCode: label, fixedActionIndex: entry.fixedActionIndex, action: snapshot.action };
            convert(sample, result.state);
        }
    } else {
        const episode = JSON.parse(await readFile(job.file, 'utf8'));
        const factory = await createDefaultEnvFactory('APK/_analysis/unpack', 'training_configs/sd_training_plan_20260705.json');
        const env = await factory.createEnv(episode);
        const winnerIds = new Set(episode.players.filter((p: { allianceId: number; policy: string }) => p.allianceId === episode.summary.winnerAlliance && p.policy === 'heuristic').map((p: {id:number}) => p.id));
        const eligible = episode.steps.map((s: { playerId:number }, i:number) => winnerIds.has(s.playerId) ? i : -1).filter((i:number) => i >= 0);
        const count = Math.min(128, eligible.length);
        const indexes = new Set(Array.from({length: count}, (_,i) => eligible[Math.floor((i+0.5)*eligible.length/count)]));
        let i = 0;
        for (const { sample, result } of replayEpisodeDatasetItems(episode, env, { observationMode: 'none', inputFile: job.file, episodeIndex: job.id })) {
            if (indexes.has(i)) { sample.observation = result.observation; convert(sample, result.state); }
            i++;
        }
    }
    for (const version of ['v3','v4']) await writeFile(`${root}/features/${job.kind}-${job.id}-${version}.jsonl`, lines[version].join('\n') + '\n');
    return stats;
}
async function main() {
    await mkdir(`${root}/features`, { recursive: true });
    const audit = JSON.parse(await readFile(`${root}/audit.json`, 'utf8'));
    const ai = JSON.parse(await readFile(`${root}/ai-selection.json`, 'utf8'));
    const identities = JSON.parse(await readFile(`${root}/identity-audit.json`, 'utf8')).rows;
    const jobs: Job[] = [...audit.filter((e: {accepted: boolean}) => e.accepted).map((e: {id:number;split:string}) => ({kind:'pvp',id:e.id,split:e.split,file:`${root}/states/${e.id}.jsonl`,
        humanPlayers: identities.find((r:{id:number})=>r.id===e.id).playerTypes.flatMap((type:number,id:number)=>type===1?[id]:[]) })),
        ...ai.map((e: {id:number;split:string;file:string}) => ({...e,kind:'ai'}))];
    let next = 0;
    const rows: Awaited<ReturnType<typeof run>>[] = [];
    const pool: Worker[] = [];
    try {
        await Promise.all(Array.from({length:8}, () => new Promise<void>((resolve,reject) => {
            const bridge = `(async()=>{const {register}=await import('tsx/esm/api');register();await import(${JSON.stringify(import.meta.url)});})().catch(e=>{console.error(e);process.exit(1)});`;
            const worker = new Worker(bridge, {eval:true,workerData:{pvpFeatures:true}});pool.push(worker);
            worker.on('message', message => { if (!message.ready) {rows.push(message);console.log(`特征 ${rows.length}/${jobs.length} ${message.kind} #${message.id} 样本=${message.samples}`);}worker.postMessage(jobs[next++] ?? null); });
            worker.on('error',reject);worker.on('exit',code=>code===0?resolve():reject(new Error(`特征 worker 退出 ${code}`)));
        })));
        await writeFile(`${root}/feature-summary.json`, JSON.stringify(rows,null,2));
    } finally {await Promise.all(pool.map(w=>w.terminate()));}
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});
else if(workerData.pvpFeatures){parentPort!.on('message',async job=>{if(!job){parentPort!.close();return;}try{parentPort!.postMessage(await run(job));}catch(e){console.error(e);process.exit(1);}});parentPort!.postMessage({ready:true});}
