/** 新开发首根的敌方模型失配诊断；不继续整局、不替换成绩、不修改搜索配置。 */
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../../src/game/engine';
import { encodeAction, mulberry32 } from '../../../src/game/env';
import { OriginalApkLikeHardAI } from '../../../src/game/ai/original_apk_like_hard_ai';
import { encodeDualObservation } from '../../../src/ai_runtime/dual_v2/encoder';
import { computeScalarValue, searchTerminal } from '../../../src/ai_runtime/dual_v3/search_value';
import { crossedSelfTurn } from '../../../src/ai_runtime/dual_v3/response_horizon';
import { DATA, HERE, read, save, modelIdentity } from './io';
import { Stage4InferenceClient } from './inference_client';
import { lines } from './analysis';

const folder = path.join(DATA, 'dev-v4-engineering-check/p2-1-s0'), game = read(path.join(folder, 'result.json'));
const options = read(path.join(HERE, 'config-v2-maxn-prior035.json'));
let root: any;
for await (const row of lines(path.join(folder, 'search.jsonl.gz'))) { root = row; break; }
const plans = new Map<string, any>();
for await (const w of lines(path.join(folder, 'witnesses.jsonl.gz'))) {
    if (w.step !== 0) break;
    plans.set(w.actions.map(encodeAction).join(';'), w);
}
const client = new Stage4InferenceClient(modelIdentity().prefix), rows: any[] = [];
try {
    for (const candidate of root.candidates) {
        const witness = plans.get(candidate.id); assert(witness);
        const engine = new GameEngine(witness.final, { applyInitialTurnStart: false });
        const hard = new Map<number, OriginalApkLikeHardAI>(witness.initial.players.filter((p: any) => p.id !== game.modelPlayer).map((p: any) => [p.id, new OriginalApkLikeHardAI({ rng: mulberry32(game.seed + 31 + p.id * 10007) })]));
        const actions = []; let closed = false;
        for (let step = 0; step < 512 && !closed && searchTerminal(engine.getState(), game.modelPlayer) === undefined; step++) {
            const before = engine.getState();
            const action = before.currentPlayer === game.modelPlayer ? engine.getLegalActions(before.currentPlayer).find(a => a.type === 'end_turn')! : hard.get(before.currentPlayer)!.getAction(engine, before.currentPlayer);
            assert(engine.hasLegalAction(before.currentPlayer, action)); engine.step(action); actions.push(action);
            closed = crossedSelfTurn(before, engine.getState(), game.modelPlayer);
        }
        const state = engine.getState(), terminal = searchTerminal(state, game.modelPlayer); assert(closed || terminal !== undefined);
        let value = terminal;
        if (value === undefined) {
            const observation = encodeDualObservation(state, engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender'));
            const [output] = await client.forwardBatch([observation]); value = computeScalarValue(output.valueProbs, state, observation.playerOrder, game.modelPlayer, options);
        }
        rows.push({ rootAction: candidate.rootAction, selected: candidate.selected, networkResponseQ: candidate.value, hardResponseQ: value, responseActions: actions, closed: true });
    }
    await save(path.join(HERE, 'RESPONSE_MODEL_DIAGNOSIS_V4.json'), { rows, newGames: 0, sealedAccess: 0,
        scope: '仅新开发p2-1-s0首根；沿同一己方计划改用独立Hard敌席完成一轮，双方叶值仍用固定模型。不是完整实战，不证明普遍根因，不用于封存调参。' }, true);
    console.log(JSON.stringify(rows.map(({ responseActions, ...r }) => ({ ...r, actions: responseActions.length }))));
} finally { await client.close(); }
