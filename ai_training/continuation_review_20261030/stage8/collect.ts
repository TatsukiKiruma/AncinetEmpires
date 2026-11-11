import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { rotatingCuts, assertCutSources } from './cut_rotation';
import { orderedJobs } from './dispatch_queue';
import { ScheduleMetrics } from './schedule_metrics';
import { frozenPlan, verifyFrozenReceipt, registerFile, checkpoint, verifyReceipt } from './resume_plan';
import { WorkerPool } from './worker_pool';
import { schedule, aliveSeats, migrateCut } from './scenarios';
import { data, here, K1, guard, read, save, sha, fileSha, stopRequested, DrainStop } from './io';
import type { ModelIdentity } from '../stage7/client_v2';

export async function collect(generation: number, model: ModelIdentity, blocks = 10) {
    guard(); assert(read(path.join(here, 'PHASE_A.json')).passed);
    assert.equal(fileSha(model.prefix + '.bin'), model.sha256);
    const config = { ...read(path.join(here, '../stage7/TEACHER_CONFIG.json')), modelVersion: K1.sha256, modelPrefix: K1.prefix };
    const out = path.join(data, `gen${generation}`); fs.mkdirSync(out, { recursive: true });
    const source = Object.fromEntries(['scenarios.ts', 'league_game.ts', 'worker_pool.ts', 'league_worker.bundle.mjs', 'collect.ts','dispatch_queue.ts','resume_plan.ts','schedule_metrics.ts','cut_rotation.ts'].map(f => [f, fileSha(path.join(here, f))]));
    const identity = sha(JSON.stringify({ source, config, model, anchor: K1, blocks }));
    const receipts: any[] = [], plans:any[][]=[];
    // 只生成本代既定10个block；Gen2只读取已通过门禁的上一代完整SUMMARY。

        for (let block = 0; block < blocks; block++) {
            guard();
            const plan = path.join(out, `block-${block}.json`);
            const frozen = frozenPlan(plan);
            const jobs = frozen ?? schedule(generation, block).map(job => ({ ...job, revision: 'plan-b', config, sourceIdentity: identity,
                database: path.join(out, `${job.gameId}.sqlite`), candidateModelSha256: model.sha256, deadlineMs: Number.MAX_SAFE_INTEGER }));
            if (!frozen && generation > 1 && block > 0) {
                const prior = read(path.join(data, `gen${generation - 1}`, 'SUMMARY.json'));
                assertCutSources(prior,generation,path.join(data,`gen${generation-1}`));
                const cuts = prior.games.flatMap((g: any) => {
                    if (!g.natural) return [];
                    const db = new DatabaseSync(g.database, { readOnly: true });
                    try { return db.prepare('SELECT step,state FROM cuts ORDER BY ABS(turn-15) LIMIT 3').all().map(c => ({
                        state: JSON.parse(String(c.state)), sourceStep: c.step, sourceGame: g.gameId, generation: generation - 1 })); }
                    finally { db.close(); }
                });
                const selectedJobs = jobs.filter((_, i) => i % 3 === 0);
                const selectedCuts = rotatingCuts(cuts, selectedJobs.map(j => j.players), block);
                for (const [index, job] of selectedJobs.entries()) {
                    const cut: any = selectedCuts[index];
                    if (!cut) continue;
                    job.roles = migrateCut(cut.state, job.roles); job.state = structuredClone(cut.state);
                    job.map = cut.state.metadata?.apkMapName ?? cut.state.metadata?.customSkirmishMapId ?? job.map;
                    job.candidate = Number(Object.keys(job.roles).find(id => job.roles[Number(id)] === 'candidate'));
                    (job as any).cut = { ...cut, state: undefined, players: job.players };
                }
            }
            if (!frozen) { save(plan, jobs); registerFile(plan,identity); }
            assert(jobs.every(j => j.generation === generation && j.candidateModelSha256 === model.sha256));
            if (!frozen) assert(jobs.every(j=>j.sourceIdentity===identity));
            plans.push(jobs);
        }
    const ordered = orderedJobs(plans);
    assert.equal(new Set(ordered.map(t=>t.transportJobId)).size,blocks*20);
    assert.equal(new Set(ordered.map(t=>t.job.gameId)).size,blocks*20);
    const starts=new Map<string,any>();
    const pending=ordered.filter(item=>{
        const j=item.job, p=checkpoint(j,item.transportJobId), file=path.join(out,`${j.gameId}.receipt.json`);
        if(fs.existsSync(file)){
            verifyFrozenReceipt(file);const receipt=read(file);verifyReceipt(j,p,receipt);receipts.push(receipt.result);return false;
        }
        assert(!p?.complete,'数据库已完成但缺少收据，必须单独核对恢复，禁止重跑');
        starts.set(j.gameId,p);return true;
    });
    const runId=`gen${generation}-${Date.now()}-${process.pid}`;
    const metrics=new ScheduleMetrics(path.join(data,'schedule'),runId);
    save(path.join(out,`${runId}.queue.json`),{identity,reused:receipts.map(r=>r.gameId),queue:pending.map(t=>({gameId:t.job.gameId,block:t.block,index:t.index,
        transportJobId:t.transportJobId,players:t.job.players,checkpointStep:starts.get(t.job.gameId)?.step??0})),source});
    for(const item of pending)metrics.event('enqueue',item);
    const progress=(last?:any)=>save(path.join(here,'PROGRESS.json'),{phase:'B',generation,scheduler:'plan-b',runId,
        completed:receipts.length,targetGames:blocks*20,natural:receipts.filter(g=>g.natural).length,
        teachers:receipts.reduce((n,g)=>n+g.validTeachers,0),lastGame:last?.gameId,
        byBlock:plans.map((jobs,block)=>({block,completed:receipts.filter(r=>jobs.some(j=>j.gameId===r.gameId)).length,total:jobs.length})),sealedAccess:0});
    progress();guard();
    const pool = new WorkerPool(4, 2, 2, 2, 'default', 'league_worker.bundle.mjs', model, model.sha256 !== K1.sha256, false, K1);
    const byId=new Map(pending.map(item=>[item.transportJobId,item]));
    pool.onProgress=message=>{
        const item=byId.get(message.id);assert(item&&message.event.gameId===item.job.gameId,'进度任务身份不符');
        metrics.event(message.event.event,item,{...message.event,event:undefined,quality:message.quality});
    };
    let drained=false;const finished=new Set<string>();
    try {
        await pool.run(pending.map(item=>({...item.job,transportJobId:item.transportJobId})),(reply,index)=>{
            const item=pending[index],r=reply.result,j=item.job;
            assert(r.gameId===j.gameId&&r.database===j.database&&r.complete&&!r.wallLimit,'结果归属或完整性不符');
            assert(r.natural||r.classification==='round_truncation','错误不得计作自然结束');
            const file=path.join(out,`${r.gameId}.receipt.json`);assert(!fs.existsSync(file),'完成收据已存在');
            save(file,{sourceIdentity:j.sourceIdentity,executionRevision:identity,result:r,quality:reply.quality});registerFile(file,identity);
            receipts.push(r);finished.add(r.gameId);progress(r);
            metrics.event('result',item,{step:r.step,validTeachers:r.validTeachers,quality:reply.quality,natural:r.natural,classification:r.classification});
            console.log(JSON.stringify({game:r.gameId,block:item.block,natural:r.natural,teachers:r.validTeachers,steps:r.step}));
        },{
            shouldDispatch:()=>!stopRequested(),
            onStart:event=>{const item=pending[event.index],p=starts.get(item.job.gameId);metrics.event('start',item,{...event,beforeSteps:p?.step??0,beforeTeachers:p?.validTeachers??0});},
            onFinish:event=>{const item=pending[event.index];metrics.event('finish',item,{...event,completed:finished.has(item.job.gameId)});}
        });
        drained=pool.lastRun.stopped||stopRequested();
    }catch(error){metrics.event('error',undefined,{error:String(error)});throw error;}
    finally{await pool.close();metrics.event('services_closed',undefined,{active:0});}
    if(drained){metrics.event('drained',undefined);throw new DrainStop();}
    guard();assert.equal(receipts.length,blocks*20,'本代尚未全部完成，禁止进入训练');
    receipts.sort((a,b)=>ordered.find(t=>t.job.gameId===a.gameId)!.transportJobId-ordered.find(t=>t.job.gameId===b.gameId)!.transportJobId);
    const coverage = [2, 3, 4, 5, 6].map(players => ({ players, natural: receipts.filter(g => g.players === players && g.natural).length,
        teachers: receipts.filter(g => g.players === players).reduce((n, g) => n + g.validTeachers, 0) }));
    const serviceDiagnostics = [...pool.mux.clients, ...(pool.opponentMux?.clients ?? [])].map(c => ({...c.transport.diagnostics, exitCode: c.exitCode, forcedTermination: c.transport.forcedTermination}));
    const healthy = serviceDiagnostics.every(d => !d.failure && d.hardTimeouts === 0 && d.exitCode === 0 && !d.forcedTermination);
    const result = { serviceDiagnostics, passed: healthy && coverage.every(c => c.natural > 0 && c.teachers > 0), generation, sourceIdentity: identity,
        model, anchor: K1, source, config, resumeBaselineSha256: fileSha(path.join(here, 'RESUME_BASELINES.json')), schedulerMigrationSha256:fileSha(path.join(here,'SCHEDULER_MIGRATION.json')), coverage, games: receipts, sealedAccess: 0 };
    save(path.join(out, 'SUMMARY.json'), result); return result;
}
if (process.argv[1]?.endsWith('collect.ts')) {
    const r = await collect(1, K1); assert(r.passed, '各人数自然局与有效教师门禁未通过');
}
