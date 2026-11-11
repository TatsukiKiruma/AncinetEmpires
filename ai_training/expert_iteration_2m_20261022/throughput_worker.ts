/** 单根并发工作量探针，输出CPU、内存及真实展开量。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { DualStreamModel } from '../../src/ai_runtime/dual_v3/model_runtime';
import { NeuralBeamSearchAI } from '../../src/ai_runtime/dual_v3/beam_search';
const dir=path.dirname(fileURLToPath(import.meta.url)),raw=fs.readFileSync(path.join(dir,'initial.bin'));
const model=new DualStreamModel(JSON.parse(fs.readFileSync(path.join(dir,'initial.json'),'utf8')),raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const cases=JSON.parse(fs.readFileSync(path.join(dir,'probe-states.json'),'utf8')),index=Number(process.argv[2]??0),state=cases[index%cases.length].state;
const engine=new GameEngine(state,{applyInitialTurnStart:false}),ai=new NeuralBeamSearchAI(model,{modelVersion:crypto.createHash('sha256').update(raw).digest('hex'),budgetMs:4000});
const begin=process.cpuUsage(),start=performance.now();ai.getAction(engine,state.currentPlayer);
console.log(JSON.stringify({index,elapsedMs:performance.now()-start,cpu:process.cpuUsage(begin),memory:process.memoryUsage(),telemetry:ai.telemetry}));
