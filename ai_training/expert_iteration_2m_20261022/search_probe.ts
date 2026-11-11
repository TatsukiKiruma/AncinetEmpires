/** 冻结旧模型与新初始化模型的1/2/4秒工程遥测；不把局面探针当作实战胜率。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { NeuralBeamSearchAI } from '../../src/ai_runtime/dual_v3/beam_search';
import { DualStreamModel as NewModel } from '../../src/ai_runtime/dual_v3/model_runtime';
import { DualStreamModel as OldModel } from '../../src/ai_runtime/dual_v2/model_runtime';
import { DualStreamTurnSearchAI } from '../../src/ai_runtime/dual_v2/turn_search_ai';
import { getAppApkSkirmishMapOptions } from '../../src/game/apk_skirmish_map_assets';
const dir = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(dir,'probe-states.json'),'utf8'));
const limit = Number(process.argv[2] ?? rows.length), mode = process.argv[3] ?? 'old-new';
const oldPrefix = path.join(dir,'../pretrain_preflight_20261022/evaluation/assets/phase5-gen03/model');
const prefix = mode === '2m' ? path.join(dir,'initial') : oldPrefix;
const raw = fs.readFileSync(prefix+'.bin'), modelVersion = crypto.createHash('sha256').update(raw).digest('hex');
const Model = mode === '2m' ? NewModel : OldModel;
const model = new Model(JSON.parse(fs.readFileSync(prefix+'.json','utf8')),raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const headBias = mode==='2m'?undefined:JSON.parse(fs.readFileSync(path.join(dir,'../pretrain_preflight_20261022/evaluation/assets/phase5-gen03/head-calibration.json'),'utf8')).headBias;
const valueCalibration = mode==='2m'?undefined:JSON.parse(fs.readFileSync(path.join(dir,'../pretrain_preflight_20261022/evaluation/assets/phase5-gen03/value-config.json'),'utf8'));
const output = path.join(dir,`probe-${mode}`); fs.mkdirSync(output,{recursive:true});
const summaryFile = path.join(output,'roots.jsonl'); if (fs.existsSync(summaryFile)) throw Error('拒绝覆盖遥测');
fs.writeFileSync(path.join(dir,'available-maps.json'),JSON.stringify(getAppApkSkirmishMapOptions(),null,2));
for (const row of rows.slice(0,limit)) for (const budgetMs of mode==='frozen'?[780]:[1000,2000,4000]) {
    const witness: any[] = [], engine = new GameEngine(row.state,{applyInitialTurnStart:false});
    const onWitness = (w:any) => witness.push(w);
    const ai = mode==='frozen'?new DualStreamTurnSearchAI(model as OldModel,{budgetMs,headBias,valueCalibration,maxNodes:220,beamWidth:6,maxUnits:3,onWitness}):new NeuralBeamSearchAI(model,{modelVersion,budgetMs,headBias,valueCalibration,onWitness});
    const start=performance.now(), action=ai.getAction(engine,engine.getState().currentPlayer), elapsed=performance.now()-start;
    assert.ok(engine.hasLegalAction(engine.getState().currentPlayer,action));
    const before=engine.getState(), after=engine.step(action).state;
    const name=`${row.name}-${budgetMs}`;
    fs.writeFileSync(path.join(output,name+'.json.gz'),gzipSync(JSON.stringify({name,mode,budgetMs,initial:before,actions:[action],final:after,witnesses:witness}),{level:1}));
    const result={id:row.name,mode,budgetMs,elapsedMs:elapsed,action:encodeAction(action),telemetry:ai.telemetry,modelVersion,memory:process.memoryUsage(),cpu:process.cpuUsage()};
    fs.appendFileSync(summaryFile,JSON.stringify(result)+'\n'); console.log(JSON.stringify({id:row.name,budgetMs,elapsedMs:elapsed,nodes:ai.telemetry.nodes}));
}
