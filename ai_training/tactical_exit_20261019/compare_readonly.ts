import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { GameEngine } from '../../src/game/engine';
import { infer,legalActions } from './policy_runtime';
import { read,save,DIR,quantiles } from './io';
const bundle=path.join(DIR,'readonly-r4-reference.mjs');
await build({entryPoints:[path.join(DIR,'policy_runtime.ts')],bundle:true,platform:'node',format:'esm',outfile:bundle,plugins:[{name:'R4完整特征参考',setup(b){b.onLoad({filter:/(?:encode|combined_tactics)\.ts$/},args=>{
    const file=path.basename(args.path),snapshot=path.join(DIR,'revisions/r4',file+'.snapshot');if(path.dirname(args.path)!==DIR||!fs.existsSync(snapshot))return;
    return {contents:fs.readFileSync(snapshot,'utf8'),loader:'ts',resolveDir:path.dirname(args.path)};
});}}]});
const old=(await import(pathToFileURL(bundle).href)).infer as typeof infer,model=read('teacher-model.json'),schema=read('old-schema.json'),frames=read('performance_query_cache/slow-frames.json').results,results=[];
for(const frame of frames){
    const state=read(`performance_query_cache/slow-state-${frame.id}.json`),times={old:[] as number[],proposed:[] as number[]};let checks=0;
    for(let repeat=0;repeat<3;repeat++){
        const outputs:any={};for(const name of repeat%2?['proposed','old']:['old','proposed']){
            const engine=new GameEngine(state),legal=legalActions(engine),t=performance.now();outputs[name]=(name==='old'?old:infer)(engine,legal,model,schema);times[name as keyof typeof times].push(performance.now()-t);
        }
        assert.deepEqual(outputs.proposed,outputs.old,'只读快照不得改变151列、候选顺序或网络任何输出');checks++;
    }
    const result={id:frame.id,checks,old:quantiles(times.old),proposed:quantiles(times.proposed)};results.push(result);save('performance_readonly/compare-borrowed.live.json',results);console.log(result);
}
save('performance_readonly/compare-borrowed-gate.json',{passed:true,allRootEncodingsOutputsAndPriorsByteExact:true,diagnosticOnly:true,concurrency:1,results});
