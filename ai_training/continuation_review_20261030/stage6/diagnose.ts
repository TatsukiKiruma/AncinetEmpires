import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction } from '../../../src/game/env';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../../src/ai_runtime/dual_v2/reachability';
import { tacticalPriorBundle } from '../../../src/ai_runtime/dual_v3/search_policy';
import { castleProductionPenalties } from '../../../src/ai_runtime/dual_v3/castle_production';
import { BatchedNeuralBeamSearchAI } from '../../../src/ai_runtime/dual_v3/batched_beam_search';
import { Stage4InferenceClient } from './arena_client';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const config = read(path.join(here, 'config-C1.json')), client = new Stage4InferenceClient(config.modelPrefix);
const results = [];
try {
    for (const file of fs.readdirSync(path.join(here, 'diagnostic-fixtures')).filter(f => f.endsWith('.json'))) {
        const fixture = read(path.join(here, 'diagnostic-fixtures', file)), state = fixture.state;
        const engine = new GameEngine(state, {applyInitialTurnStart: false});
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        const context = new ReachabilityContext(state), obs = encodeDualObservation(state, legal, context);
        const output = (await client.forwardBatch([obs]))[0];
        const penalties = castleProductionPenalties(state, legal, context), priors = tacticalPriorBundle(state, legal, context, true);
        const ranked = Array.from(obs.actions.sourceIndices).map((j, i) => ({action: legal[j], score: output.logits[i] + priors.priors[j], penalty: penalties[j]})).sort((a,b) => b.score-a.score);
        const ai = new BatchedNeuralBeamSearchAI(client, config);
        const chosen = await ai.getAction(engine, state.currentPlayer);
        const chosenIndex = legal.findIndex(a => encodeAction(a) === encodeAction(chosen));
        results.push({file, recorded: fixture.recordedAction, chosen, chosenPenalty: penalties[chosenIndex], legal: engine.hasLegalAction(state.currentPlayer, chosen), top: ranked.slice(0, 12), penalized: ranked.filter(r => r.penalty < 0), telemetry: ai.telemetry});
        console.log(JSON.stringify({file, chosen, chosenPenalty: penalties[chosenIndex], penalized: ranked.filter(r => r.penalty < 0).length}));
    }
} finally {await client.close();}
const passed = results.every(r => r.legal) && results.filter(r => r.file.startsWith('p2-')).every(r => r.penalized.length > 0 && r.chosenPenalty === 0);
fs.writeFileSync(path.join(here, 'DIAGNOSTIC_FIXTURE_AUDIT.json'), JSON.stringify({passed, results, sealedAccess: 0, gpuExited: client.exited, scope: '四个固定开发前态；不据此保证所有未来对局永不堵城'}, null, 2), {flag: 'wx'});
if (!passed) throw Error('诊断夹具未通过');
