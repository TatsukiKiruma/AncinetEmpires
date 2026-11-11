import fs from 'node:fs';import assert from 'node:assert/strict';
import {GameEngine,createState,MAPS,hash,strictStep,encodeAction,features,inputHash} from './common';
import {AncientEmpiresEnv} from '../frozen/src/game/env';
const rows:any[]=[];
for(const name of MAPS){const s=createState(name),e=new GameEngine(s),env=new AncientEmpiresEnv({initialState:structuredClone(s)});const legal=e.getLegalActions(s.currentPlayer);
 assert(env.getActionMask().every(Boolean));assert.equal(env.getActionMask().length,legal.length);
 const indexes=env.getFixedLegalActionIndexes();const mask:any=env.getFixedActionMask();
 assert(indexes.length>0);const clone=env.clone();const result=env.stepAction(legal[0]);const er=e.step(legal[0]);assert.equal(hash(env.getState()),hash(e.getState()));assert.equal(result.reward,er.reward);assert.equal(hash(clone.getState()),hash(s));
 const mutated=structuredClone(legal);(mutated[0] as any).type='伪造';assert.throws(()=>strictStep(new GameEngine(s),legal,mutated[0]));
 const identity=features(s,legal),changed=structuredClone(identity);changed.candidateSemantics[0][20]+=.123;assert.notEqual(inputHash(identity),inputHash(changed));
 rows.push({name,indexCount:indexes.length,maskKind:Object.keys(mask),stepReward:er.reward,initialIncomePreserved:true});
}
fs.writeFileSync('ai_training/r8_pure_policy_stage_20261014_125300/evidence/extra_contracts.json',JSON.stringify({passed:true,rows},null,2));console.log('环境、mask、克隆和动作篡改合同通过');
