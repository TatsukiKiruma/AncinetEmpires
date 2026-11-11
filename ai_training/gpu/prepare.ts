/** 严格重放项目自对局并编码独立实验训练分片，不向历史冻结集注入数据。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { encodeDualObservation } from '../../src/ai_runtime/dual_v2/encoder';
import { ReachabilityContext } from '../../src/ai_runtime/dual_v2/reachability';
import { trainingValueTarget } from '../../src/ai_runtime/dual_v3/value_target';
import { softPriors, PRIOR_VERSION } from '../../src/ai_runtime/dual_v3/search_policy';
import { packTensorBatch } from '../dual_stream_v2_phase1_20261020/tensor_bridge';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('用法：prepare.ts 采集目录 新数据目录');
const source = path.resolve(input), out = path.resolve(output);
if (fs.existsSync(out)) throw Error('输出目录已存在');
fs.mkdirSync(out, { recursive: true });
const sha = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) => sha(JSON.stringify(value));
const runBytes = fs.readFileSync(path.join(source, 'RUN.json'));
const reports = [];
for (const name of fs.readdirSync(source).filter(n => /^game-\d+\.json$/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const resultBytes = fs.readFileSync(path.join(source, name)), result = JSON.parse(resultBytes.toString());
    const actionBytes = fs.readFileSync(path.join(source, name.replace('.json', '.jsonl.gz')));
    const parentId = `project-gpu-${sha(runBytes).slice(0, 16)}-${result.id}`;
    const file = path.join(out, parentId + '.frames.gz');
    const engine = new GameEngine(result.initial, { applyInitialTurnStart: false });
    let samples = 0, valueLabels = 0;
    for (const line of gunzipSync(actionBytes).toString().trim().split('\n')) {
        const row = JSON.parse(line), state = engine.getState();
        if (samples !== row.step || hash(state) !== row.before || !engine.hasLegalAction(state.currentPlayer, row.action)) throw Error('独立重放前态或动作不符');
        const legal = engine.getLegalActions(state.currentPlayer).filter(a => a.type !== 'surrender');
        const context = new ReachabilityContext(state), observation = encodeDualObservation(state, legal, context);
        const sourceIndex = legal.findIndex(a => encodeAction(a) === encodeAction(row.action));
        const target = observation.actions.sourceIndices.indexOf(sourceIndex);
        if (target < 0) throw Error('示范动作无法编码');
        const outcome = trainingValueTarget(state, observation.playerOrder, result.natural, result.winner);
        const prior = softPriors(state, legal, context);
        const pack = packTensorBatch([observation], [{ target, policyMask: true, valueTarget: outcome.target, valueMask: outcome.valueMask, weight: 1 }]);
        const metadata = Buffer.from(JSON.stringify({ ...pack.metadata, sources: [{ parentId, kind: 'project-selfplay', split: 'engineering-train-only', prior: Array.from(observation.actions.sourceIndices, i => prior[i]), priorVersion: PRIOR_VERSION }] }));
        const header = Buffer.alloc(8); header.writeUInt32LE(metadata.length); header.writeUInt32LE(pack.bytes.length, 4);
        fs.appendFileSync(file, gzipSync(Buffer.concat([header, metadata, pack.bytes])));
        if (hash(engine.step(row.action).state) !== row.after) throw Error('独立重放后态不符');
        samples++; valueLabels += Number(outcome.valueMask);
    }
    if (samples !== result.steps || engine.getState().winner !== result.winner || result.natural !== (engine.getState().winner !== null)) throw Error('终局记录不符');
    reports.push({ parentId, samples, valueLabels, policyLabels: samples, sha256: sha(fs.readFileSync(file)), resultSha256: sha(resultBytes), actionsSha256: sha(actionBytes), natural: result.natural });
}
if (!reports.length) throw Error('采集目录没有对局');
fs.writeFileSync(path.join(out, 'DATASET.json'), JSON.stringify({ schema: 'gpu-project-selfplay-frames-v1', scope: '仅独立工程训练；不是原生APK，不是独立棋力验证集', parents: reports.length, samples: reports.reduce((n, r) => n + r.samples, 0), reports }, null, 2));
console.log(JSON.stringify({ parents: reports.length, samples: reports.reduce((n, r) => n + r.samples, 0) }));
