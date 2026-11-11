/** 项目权威引擎自对局：CPU执行规则和编码，批量神经网络推理可选GPU。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { createApkSkirmishGameState } from '../../src/game/apk_skirmish';
import { parseAppApkSkirmishMap } from '../../src/game/apk_skirmish_map_assets';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import { softPriors } from '../../src/ai_runtime/dual_v3/search_policy';
import { InferenceClient } from './inference_client';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('collect.ts --python 解释器 --model 模型前缀 --out 新目录 [--device auto|cpu|cuda:0] [--games 100] [--parallel 16] [--max-steps 2000] [--map "(2) Duel.aem"]'); process.exit(0); }
const arg = (key: string, fallback?: string) => { const i = args.indexOf(key); const value = i < 0 ? fallback : args[i + 1]; if (!value) throw Error(`缺少参数${key}`); return value; };
const games = Number(arg('--games', '100')), parallel = Number(arg('--parallel', '16')), maxSteps = Number(arg('--max-steps', '2000'));
if (![games, parallel, maxSteps].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('局数、并发数、动作上限须为正整数');
const model = path.resolve(arg('--model')), out = path.resolve(arg('--out')), map = arg('--map', '(2) Duel.aem');
if (fs.existsSync(out)) throw Error('输出目录已存在');
fs.mkdirSync(out, { recursive: true });
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
const client = new InferenceClient(arg('--python'), path.join(here, 'infer.py'), arg('--device', 'auto'), model);
const started = performance.now(); let encodingMs = 0, inferenceMs = 0, engineMs = 0, actions = 0;
let rng = 20261029;
const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
const results: any[] = [];
save('RUN.json', { games, parallel, maxSteps, map, model, modelSha256: crypto.createHash('sha256').update(fs.readFileSync(model + '.bin')).digest('hex'), device: arg('--device', 'auto'), seed: rng, policy: '全候选softmax温度1及现有softPriors', source: 'project_engine_selfplay_not_native_apk' });
try {
    for (let base = 0; base < games; base += parallel) {
        const slots = Array.from({ length: Math.min(parallel, games - base) }, (_, i) => {
            const initial = createApkSkirmishGameState(parseAppApkSkirmishMap(map), { mode: 'SD', mapName: map });
            return { id: base + i, initial, engine: new GameEngine(initial, { applyInitialTurnStart: false }), steps: 0 };
        });
        while (true) {
            const live = slots.filter(s => s.engine.getState().winner === null && s.steps < maxSteps);
            if (!live.length) break;
            let start = performance.now();
            const requests = live.map(s => {
                const state = s.engine.getState(), legal = s.engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
                const context = new ReachabilityContext(state);
                return { legal, observation: encodeDualObservation(state, legal, context), prior: softPriors(state, legal, context), before: hash(state) };
            });
            encodingMs += performance.now() - start; start = performance.now();
            const outputs = await client.forward(requests.map(r => r.observation));
            inferenceMs += performance.now() - start; start = performance.now();
            for (let i = 0; i < live.length; i++) {
                const slot = live[i], r = requests[i];
                const scores = outputs[i]?.logits as number[];
                if (!scores || scores.length !== r.observation.actions.sourceIndices.length || !scores.every(Number.isFinite)) throw Error('GPU候选响应无效');
                const weighted = scores.map((v, j) => v + r.prior[r.observation.actions.sourceIndices[j]]);
                const max = Math.max(...weighted), probabilities = weighted.map(v => Math.exp(v - max));
                let threshold = random() * probabilities.reduce((a, b) => a + b, 0), selected = probabilities.length - 1;
                for (let j = 0; j < probabilities.length; j++) { threshold -= probabilities[j]; if (threshold <= 0) { selected = j; break; } }
                const action = r.legal[r.observation.actions.sourceIndices[selected]];
                if (!slot.engine.hasLegalAction(slot.engine.getState().currentPlayer, action)) throw Error('权威引擎拒绝动作');
                const result = slot.engine.step(action);
                if (result.info.includes('非法动作')) throw Error('动作执行失败');
                fs.appendFileSync(path.join(out, `game-${slot.id}.jsonl.gz`), gzipSync(JSON.stringify({ step: slot.steps, action, before: r.before, after: hash(result.state) }) + '\n'));
                slot.steps++; actions++;
            }
            engineMs += performance.now() - start;
            if (actions % 100 < live.length) save('PROGRESS.json', { completed: results.length, actions, wallSeconds: (performance.now() - started) / 1000 });
        }
        for (const slot of slots) {
            const winner = slot.engine.getState().winner, natural = winner !== null;
            const result = { id: slot.id, steps: slot.steps, natural, winner: natural ? winner : null, stop: natural ? 'natural' : 'action_truncation', initial: slot.initial };
            save(`game-${slot.id}.json`, result); results.push(result);
        }
        console.log(JSON.stringify({ completed: results.length, games, actions, seconds: (performance.now() - started) / 1000 }));
    }
    save('RESULT.json', { games, actions, natural: results.filter(r => r.natural).length, truncated: results.filter(r => !r.natural).length, wallSeconds: (performance.now() - started) / 1000, encodingMs, inferenceMs, engineAndWriteMs: engineMs, trainingAdmission: '尚未进行独立重放与数据划分，不自动加入训练集' });
} catch (error) { save('ERROR.json', { error: String(error), completed: results.length, actions }); throw error; }
finally { await client.close(); }
