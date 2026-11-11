import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { infer,legalActions } from './policy_runtime';
import { read,save,DIR,quantiles } from './io';
const Proposed=(await import(pathToFileURL(path.join(DIR,'performance_legal_clone/proposed-engine.mjs')).href)).GameEngine as typeof GameEngine;
const frames=read('performance_query_cache/slow-frames.json').results,model=read('teacher-model.json'),schema=read('old-schema.json'),results=[];
for(const frame of frames){
    const state=read(`performance_query_cache/slow-state-${frame.id}.json`),times={old:[] as number[],proposed:[] as number[]};
    for(let repeat=0;repeat<3;repeat++){
        const outputs:any={};for(const name of repeat%2?['proposed','old']:['old','proposed']){
            const engine=new (name==='old'?GameEngine:Proposed)(state),legal=legalActions(engine),t=performance.now();outputs[name]=infer(engine,legal,model,schema);times[name as keyof typeof times].push(performance.now()-t);
        }
        assert.deepEqual(outputs.proposed,outputs.old,'动作隔离复制不得改变任何编码、网络结果和候选概率');
    }
    const result={id:frame.id,checks:3,old:quantiles(times.old),proposed:quantiles(times.proposed)};results.push(result);save('performance_legal_clone/compare.live.json',results);console.log(result);
}
save('performance_legal_clone/compare-gate.json',{passed:true,allRootEncodingsOutputsAndPriorsByteExact:true,diagnosticOnly:true,concurrency:1,results});
