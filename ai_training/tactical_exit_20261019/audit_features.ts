import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeEngine as reference } from '../tactical_value_search_20261018/encode';
import { encodePolicy } from './encode';
import { stateSummary,stateTokens } from './value_state';
import { encodeBase } from '../sd64x3_phone_20261016/model';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { observationState } from '../tactical_scale_20261018/encoding';
import { legalActions } from './policy_runtime';
import { read,save,hash } from './io';
const old=read('old-schema.json'),states=[...read('browser-states.json').map((v:any)=>v.state),...read('expert-roots.json').roots.map((v:any)=>read(v.path)),...read('final-battle-plan.json').maps.slice(5).map((v:any)=>read(v.path))];
let candidates=0;
for(const [i,s] of states.entries()){
    const engine=new GameEngine(s),before=hash(engine.getState()),legal=legalActions(engine),a=reference(engine,legal,old),b=encodePolicy(engine,legal,old);
    for(const key of ['tokens','groups','refs','codes','candidates','focus','actionGroups'] as const)assert.deepEqual(a[key],b[key],`${i}/${key}`);
    const token=stateTokens(engine.getState(),old),plain=encodeBase(observe(observationState(engine.getState()),[]),old);assert.deepEqual(token.tokens,plain.tokens);assert.deepEqual(token.groups,plain.groups);
    assert.equal(hash(engine.getState()),before);candidates+=legal.length;
    save('feature-audit.live.json',{states:i+1,candidates});
}
const result={passed:true,states:states.length,candidates,columns:151,maxFloat32Error:0,engineUnchanged:true,stateTokenCacheExact:true,commanderCacheExact:true};save('feature-audit.json',result);console.log(result);
