import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { GameEngine } from '../../../src/game/engine';
import { encodePolicy } from '../encode';
import { legalActions } from '../policy_runtime';
import { pooledContext,stateTokens,stateSummary,valueInput } from '../value_state';
import { forwardGroup } from '../group_model';
import { forwardValue } from '../../tactical_value_search_20261018/value_model';
import { kernelPlugin } from './kernel_optimization';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(here,'revisions/xiaomi_20261020','zero-kernel-parity-'+Date.now());fs.mkdirSync(target);
const entry=path.join(target,'entry.ts');fs.writeFileSync(entry,`export {forwardGroup} from ${JSON.stringify(path.join(here,'group_model.ts'))};export {forwardValue} from ${JSON.stringify(path.join(here,'../tactical_value_search_20261018/value_model.ts'))};`,{flag:'wx'});
const output=path.join(target,'kernels.mjs');await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile:output,plugins:[kernelPlugin(target)]});
const actual=await import(pathToFileURL(output).href),read=(name:string)=>JSON.parse(fs.readFileSync(path.join(here,name),'utf8').replace(/^\uFEFF/,''));
const old=read('old-schema.json'),states=read('browser-states.json'),models=[read('teacher-model.json'),read('base-policy-final.json'),read('../tactical_value_search_20261018/model-final.json')];
let policyCalls=0,valueCalls=0,policyGradients=0,valueGradients=0;
for(const [index,item] of states.entries()){
    const engine=new GameEngine(item.state),x={...encodePolicy(engine,legalActions(engine),old),target:0};
    for(const model of models){
        assert.ok(model.weights.every(Number.isFinite));
        for(const gradient of [false,true]){
            const expected=forwardGroup(x as any,model,gradient),result=actual.forwardGroup(x,model,gradient);
            assert.deepEqual(result,expected);policyCalls++;if(gradient)policyGradients+=expected.gradient.length;
        }
    }
    const model=models[0],input=valueInput(pooledContext(stateTokens(item.state,old),model),stateSummary(engine));
    assert.ok(model.valueWeights.every(Number.isFinite));
    for(const gradient of [false,true]){
        const expected=forwardValue(input,model.valueWeights,index%2?1:-1,gradient),result=actual.forwardValue(input,model.valueWeights,index%2?1:-1,gradient);
        assert.deepEqual(result,expected);valueCalls++;if(gradient)valueGradients+=expected.gradient.length;
    }
}
const report={passed:true,states:states.length,policyCalls,valueCalls,policyGradients,valueGradients,forwardAndFullGradientsExactlyEqual:true,gamesStarted:0};
fs.writeFileSync(path.join(target,'PARITY.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({output:target,...report}));
