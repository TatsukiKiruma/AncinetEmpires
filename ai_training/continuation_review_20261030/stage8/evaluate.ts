import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { devPanel } from '../stage7/arena_panel';
import { WorkerPool } from './worker_pool';
import { schedule } from './scenarios';
import { deploymentSearchOptions } from '../../../src/ai_runtime/dual_v3/deployment_config';
import { data, here, K1, read, save, sha, fileSha, guard, stopRequested, DrainStop } from './io';
import type { ModelIdentity } from './client_v2';

export function evaluationJobs() {
    const standard = devPanel();
    const expanded = [100, 101, 102].flatMap(block => schedule(1, block, 'dev').flatMap(j =>
        j.state.players.map((p, seat) => ({kind: 'match', split: 'dev', players: j.players, initial: j.state,
            initialSha256: sha(JSON.stringify(j.state)), population: j.population, gold: j.gold,
            match: {id: `${j.gameId}-seat${p.id}`, seat, seed: j.seed, opponent: 'hard'}, group: 'expanded'}))));
    return {jobs: [...standard.jobs.map(j => ({...j, group: 'standard', gold: null})), ...expanded], limits: standard.limits};
}

/** 60局按人数与金币交叉分层，每人数标准/300/500/1000金币各3局。 */
export function screeningJobs(jobs:ReturnType<typeof evaluationJobs>['jobs']) {
    const groups=[2,3,4,5,6].map(players=>[null,300,500,1000].flatMap(gold=>{
        const pool=jobs.filter(j=>j.players===players&&j.gold===gold);
        assert(pool.length>=3);return pool.slice(0,3);
    }));
    return Array.from({length:12},(_,i)=>groups.map(g=>g[i])).flat();
}
export async function evaluate(label:string,model:ModelIdentity,opponent:'hard'|'K1',screen=false) {
    guard();const panel=evaluationJobs(),all=panel.jobs;
    const jobs=screen?screeningJobs(all):all;
    const limits={...panel.limits,maxDecisionMs:1000};
    const config=deploymentSearchOptions(model.sha256);
    const dir=path.join(data,'arena','deployment-v1',label);fs.mkdirSync(dir,{recursive:true});
    // 同一模型的筛查收据可直接用于全量；身份固定绑定完整面板与部署实现。
    const identity=sha(JSON.stringify({model,opponent,jobs:all,limits,config,worker:fileSha(path.join(here,'arena_worker.bundle.mjs'))}));
    const results:any[]=[];let newCompleted=0,newNatural=0;const started=Date.now();
    const writeProgress=()=>{
        const hours=(Date.now()-started)/3600000,rate=hours>0?newCompleted/hours:0;
        const sampled=[2,3,4,5,6].every(n=>results.some(r=>r.players===n));
        const eta=newCompleted>=10&&sampled&&rate>0?(jobs.length-results.length)/rate:null;
        save(path.join(here,'EVAL_PROGRESS.json'),{label,mode:screen?'screen60':'full294',complete:results.length,total:jobs.length,
            gamesPerHour:rate,naturalGamesPerHour:hours>0?newNatural/hours:0,measurementNewCompleted:newCompleted,measurementHours:hours,rateIncludesNonNatural:true,remainingHoursEstimate:eta,wins:results.filter(r=>r.won).length,natural:results.filter(r=>r.natural).length,
            errors:results.filter(r=>r.error).length,timeForfeits:results.reduce((n,r)=>n+r.timeForfeits,0)});
        fs.writeFileSync(path.join(here,'STAGE8_REPORT.md'),`# Stage 8 实测进度

${label}：${results.length}/${jobs.length}局，${results.filter(r=>r.won).length}胜；${rate.toFixed(2)}局/小时（包括超时结束），自然终局${(hours>0?newNatural/hours:0).toFixed(2)}局/小时。

当前面板剩余时间：${eta===null?'完成样本不足，暂不估计':eta.toFixed(2)+'小时（按当前已完成速度估计）'}。

自然终局${results.filter(r=>r.natural).length}，运行错误${results.filter(r=>r.error).length}，时间判负${results.reduce((n,r)=>n+r.timeForfeits,0)}。
`);
    };
    const pending=jobs.flatMap(j=>{
        const receipt=path.join(dir,`${j.match.id}.json`);
        if(fs.existsSync(receipt)){const old=read(receipt);assert(old.identity===identity);results.push(old.result);return [];}
        return [{...j,match:{...j.match,opponent:opponent==='K1'?'K1':j.match.opponent},config,limits,
            sourceIdentity:identity,anchorSha:K1.sha256,anchorModel:K1,candidateModel:model,database:path.join(dir,`${j.match.id}.sqlite`),receipt}];
    });
    writeProgress();
    const pool=new WorkerPool(4,2,2,2,'default','arena_worker.bundle.mjs',model,opponent==='K1',false,K1);
    try{
        await pool.run(pending,(reply,i)=>{const j=pending[i],result={...reply.result,group:j.group,gold:j.gold};
            assert(result.id===j.match.id);results.push(result);save(j.receipt,{identity,result});newCompleted++;newNatural+=Number(result.natural);writeProgress();
        },{shouldDispatch:()=>!stopRequested()});
    }finally{await pool.close();}
    if(pool.lastRun.stopped||stopRequested())throw new DrainStop();
    const result={label,model,opponent,identity,results,sealedAccess:0,
        healthy:results.length===jobs.length&&results.every(r=>!r.error&&r.timeForfeits===0&&r.natural)};
    save(path.join(dir,screen?'SCREEN.json':'SUMMARY.json'),result);return result;
}
export function screenComparison(baseline:any,candidate:any) {
    if(!baseline.healthy||!candidate.healthy)return {continueFull:false,inconclusive:true,reason:'非自然终局、超时或错误；不形成模型优劣结论',baselineWins:baseline.results.filter((r:any)=>r.won).length,candidateWins:candidate.results.filter((r:any)=>r.won).length,total:candidate.results.length};
    const base=new Map<string,any>(baseline.results.map((r:any)=>[r.id,r]));
    let better=0,worse=0;
    for(const r of candidate.results){const b=base.get(r.id);assert(b);better+=Number(r.won&&!b.won);worse+=Number(!r.won&&b.won);}
    return {continueFull:better>worse,inconclusive:false,better,worse,baselineWins:baseline.results.filter((r:any)=>r.won).length,
        candidateWins:candidate.results.filter((r:any)=>r.won).length,total:candidate.results.length};
}

export function gate(baseline: any, candidate: any, headToHead: any) {
    const base = new Map<string, any>(baseline.results.map((r: any) => [r.id, r]));
    let better = 0, worse = 0;
    for (const r of candidate.results) {const b = base.get(r.id); assert(b); if (r.won && !b.won) better++; if (!r.won && b.won) worse++;}
    // 配对胜负差的单侧精确二项检验，预注册阈值 p<0.05。
    const n = better + worse; let mass = 2 ** -n, p = 0;
    for (let i = 0; i <= n; i++) {if (i >= better) p += mass; mass *= (n - i) / (i + 1);}
    const win = (rows: any[]) => rows.filter(r => r.won).length / Math.max(rows.length, 1);
    const subgroups = {multiplayer: (r: any) => r.players >= 3, highGold: (r: any) => r.gold >= 300,
        fiveSix: (r: any) => r.players >= 5, standard: (r: any) => r.group === 'standard'};
    const groups = Object.entries(subgroups).map(([name, filter]) => ({name, baseline: win(baseline.results.filter(filter)), candidate: win(candidate.results.filter(filter))}));
    const h2h = [2,3,4,5,6].map(players => ({players, win: win(headToHead.results.filter((r: any) => r.players === players)), chance: 1 / players}));
    return {passed: baseline.healthy && candidate.healthy && headToHead.healthy && better > worse && p < .05
        && groups.every(g => g.name === 'standard' ? g.candidate >= g.baseline : g.candidate > g.baseline)
        && h2h.every(g => g.win > g.chance), better, worse, p, groups, h2h, sealedAccess: 0};
}
