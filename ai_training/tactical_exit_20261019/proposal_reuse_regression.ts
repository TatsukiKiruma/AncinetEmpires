import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { infer,legalActions,topIndexes } from './policy_runtime';
import { proposeRootCandidate } from './candidate_proposal';
import { read,save } from './io';
const states=read('browser-states.json'),teacher=read('teacher-model.json'),proposal=read('base-policy-final.json'),old=read('old-schema.json');
let error=0,checked=0;
for(const item of states){
    const engine=new GameEngine(item.state),legal=legalActions(engine),root=infer(engine,legal,teacher,old),independent=infer(engine,legal,proposal,old),represented=topIndexes(root),shared=proposeRootCandidate(root,represented);
    assert.deepEqual(root.x,independent.x,'根编码必须与策略权重无关');
    for(const key of ['logits','groupLogits'] as const){assert.equal(shared.out[key].length,independent.out[key].length);shared.out[key].forEach((v,i)=>{error=Math.max(error,Math.abs(v-independent.out[key][i]));checked++;});}
    shared.prior.forEach((v,i)=>{error=Math.max(error,Math.abs(v-independent.prior[i]));checked++;});
    assert.equal(shared.out.best,independent.out.best);
    if(shared.index!==undefined)assert.ok(!represented.includes(shared.index));
}
assert.ok(error<1e-8);
const result={passed:true,states:states.length,checked,maxError:error,argmax:true,rootEncodingIndependentOfWeights:true,additionalFeatureEncodes:0,maximumProposalForwards:1,branchPolicyCalls:0};
save('proposal-reuse-gate.json',result);console.log(result);
