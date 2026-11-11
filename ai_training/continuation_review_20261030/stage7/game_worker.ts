import { parentPort } from 'node:worker_threads';
import { WorkerModel } from './worker_model';
import { selfplayGame } from './selfplay_game';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
const model = new WorkerModel();
parentPort!.on('message', async job => {
    if (job.type !== 'job') return;
    try {
        if (job.kind === 'forward') {
            const engine = new GameEngine(job.state, { applyInitialTurnStart: false });
            const obs = encodeDualObservation(job.state, engine.getLegalActions(job.state.currentPlayer).filter(a => a.type !== 'surrender'));
            await model.forwardBatch([obs]);
            parentPort!.postMessage({ type: 'job_result', id: job.id });
        } else {
            const result = await selfplayGame(job, model);
            parentPort!.postMessage({ type: 'job_result', id: job.id, result });
        }
    } catch (error) { parentPort!.postMessage({ type: 'job_result', id: job.id, error: String(error) }); }
});
