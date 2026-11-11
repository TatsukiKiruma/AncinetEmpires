import { parentPort } from 'node:worker_threads';
import { WorkerModel } from '../stage7/worker_model';
import { leagueGame } from './league_game';

const model = new WorkerModel();
parentPort!.on('message', async job => {
    if (job.type !== 'job') return;
    try {
        const quality = {searches:0,candidateSearches:0,overBudget:0,budgetExpirations:0,incomplete:0,valid:0};
        let last = Date.now();
        const result = await leagueGame(job, model, event => {
            if(event.searchHealth){const t=event.searchHealth;quality.searches++;quality.candidateSearches+=Number(t.candidate);quality.overBudget+=Number(t.overBudget);quality.budgetExpirations+=t.budgetExpirations;quality.incomplete+=Number(!t.complete);quality.valid+=Number(t.valid);}
            if(event.event==='resume'||event.step%100===0||Date.now()-last>=30000){
                parentPort!.postMessage({type:'job_progress',id:job.id,event:{...event,searchHealth:undefined},quality});last=Date.now();
            }
        });
        parentPort!.postMessage({ type: 'job_result', id: job.id, result, quality });
    } catch (error) { parentPort!.postMessage({ type: 'job_result', id: job.id, error: String(error) }); }
});
