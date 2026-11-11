import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { hierarchicalPrior } from './hierarchical_prior';
import { infer } from './policy_runtime';
import { read,save } from './io';

const groups=[...Array(100).fill('移动'),'待机'],logits=[...Array.from({length:100},(_,i)=>-i*.001),0],p=hierarchicalPrior(groups,['移动','待机'],[Math.log(.7),Math.log(.3)],logits);
assert.equal(p.indexOf(Math.max(...p)),0);assert.ok(p[5]>p[100],'组内可选落点数量不能让低置信待机挤掉高置信移动备选');
const short=hierarchicalPrior(['移动','移动','待机'],['移动','待机'],[Math.log(.7),Math.log(.3)],[0,-.001,0]);assert.equal(p[0],short[0]);assert.equal(p[1],short[1]);assert.equal(p[100],short[2]);
const model=read('teacher-model.json'),old=read('old-schema.json'),checks=[];
for(const [i,item] of read('browser-states.json').entries()){
    const r=infer(new GameEngine(item.state),item.codes.map(decodeAction),model,old),maximum=Math.max(...r.prior);
    assert.ok(Math.abs(r.prior[r.out.best]-maximum)<1e-8,'搜索候选先验必须与主策略分层首选一致，不能因组内归一化常数改选其他单位');
    checks.push({i,candidates:r.x.codes.length,preferred:r.x.codes[r.out.best],prior:r.prior[r.out.best],maximum});
}
const result={passed:true,states:checks.length,syntheticCandidates:101,checks};if(process.env.STAGE5_PRIOR_RECEIPT)save(process.env.STAGE5_PRIOR_RECEIPT,result);console.log({passed:true,states:checks.length});
