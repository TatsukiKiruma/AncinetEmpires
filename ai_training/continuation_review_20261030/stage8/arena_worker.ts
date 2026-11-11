import { parentPort } from 'node:worker_threads';
import { GameEngine } from '../../../src/game/engine';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { encodeAction } from '../../../src/game/env';
import { WorkerModel } from '../stage7/worker_model';
import { arenaGame } from './arena_game';

const model = new WorkerModel();
parentPort!.on('message', async job => {
    if (job.type !== 'job') return;
    try {
        let result;
        if (job.kind === 'match') result = await arenaGame(job, model);
        else {
            const state = job.state;
            const engine = new GameEngine(state, { applyInitialTurnStart: false });
            if (job.kind === 'warm') {
                const obs = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
                await model.forwardBatch([obs]); await model.forwardBatch([obs], { valueOnly: true });
                result = null;
            } else if (job.kind === 'audit') {
                const ai = new BatchedNeuralBeamSearchAI(model, job.config);
                const action = await ai.getAction(engine, state.currentPlayer);
                if (!engine.hasLegalAction(state.currentPlayer, action)) throw Error('并发审计返回非法动作');
                const { nodes, rootMs, budgetExpirations, stopReason, overBudget } = ai.telemetry;
                result = { nodes, rootMs, budgetExpirations, stopReason, overBudget, action: encodeAction(action),
                    timeForfeit: rootMs > job.maxDecisionMs };
            } else throw Error('未知评测工作类型');
        }
        parentPort!.postMessage({ type: 'job_result', id: job.id, result });
    } catch (error) { parentPort!.postMessage({ type: 'job_result', id: job.id, error: String(error) }); }
});
