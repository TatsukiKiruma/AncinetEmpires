import assert from 'node:assert/strict';
import { forwardGroup as oldForward } from '../tactical_scale_20261018/group_model';
import { forwardGroup } from './group_model';
import { read,save } from './io';
const old=read('../tactical_scale_20261018/group-best.json'),model=read('initial.json');let maxError=0,argmax=true;
for(const x of read('inputs.json')){
    const a=oldForward({...x,candidates:x.candidates.map((r:[number,number][])=>r.filter(([i])=>i<141))},old),b=forwardGroup(x,model);
    for(const key of ['logits','groupLogits'] as const)a[key].forEach((v,j)=>maxError=Math.max(maxError,Math.abs(v-b[key][j])));
    argmax&&=a.best===b.best;
}
const result={passed:maxError<1e-8&&argmax,maxError,argmax,newInputWeightsZero:true};save('warmstart-gate.json',result);assert.ok(result.passed);console.log(result);
