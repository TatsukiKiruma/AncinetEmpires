import { parentPort } from 'node:worker_threads';
import { WorkerModel } from './worker_model';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { BatchedNeuralBeamSearchAI } from './teacher_search';
import { createHash } from 'node:crypto';
const model = new WorkerModel();
parentPort!.on('message', async job => {
    if (job.type !== 'job') return;
    try {
        const engine = new GameEngine(job.state, { applyInitialTurnStart: false });
        if (job.kind === 'forward') {
            const obs = encodeDualObservation(job.state, engine.getLegalActions(job.state.currentPlayer).filter(a => a.type !== 'surrender'));
            const outputs = await model.forwardBatch([obs], { valueOnly: !!job.valueOnly });
            parentPort!.postMessage({ type: 'job_result', id: job.id, outputs });
        } else {
            const trace: any[] = [];
            for (let step = 0; step < (job.plies ?? 1) && !engine.isTerminal(); step++) {
                const ai = new BatchedNeuralBeamSearchAI(model, job.config);
                const state = engine.getState();
                const action = await ai.getAction(engine, state.currentPlayer);
                if (ai.telemetry.budgetExpirations || ai.telemetry.overBudget) throw Error('教师触及墙钟安全上限，拒绝部分结果');
                if (!engine.hasLegalAction(state.currentPlayer, action)) throw Error('教师返回非法动作');
                engine.step(action);
                trace.push({ action: encodeAction(action), telemetry: ai.telemetry,
                    after: createHash('sha256').update(JSON.stringify(engine.getState())).digest('hex') });
            }
            parentPort!.postMessage({ type: 'job_result', id: job.id, trace });
        }
    } catch (error) { parentPort!.postMessage({ type: 'job_result', id: job.id, error: String(error) }); }
});
