import { parentPort } from 'node:worker_threads';
import { WorkerModel } from './worker_model';
import { leagueGame } from './league_game';

const model = new WorkerModel();
parentPort!.on('message', async job => {
    if (job.type !== 'job') return;
    try {
        const result = await leagueGame(job, model);
        parentPort!.postMessage({ type: 'job_result', id: job.id, result });
    } catch (error) { parentPort!.postMessage({ type: 'job_result', id: job.id, error: String(error) }); }
});
