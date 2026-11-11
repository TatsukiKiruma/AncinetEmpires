/** 补缺选择、尝试预算、初态与跨格式动作语义回归；不结算任何动作。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readCollectionInput} from '../gpu/parallel/collection_input';
import {createJobState} from '../gpu/hard_jobs';
import {initialSemantics,nativeTokens,projectTokens} from './audit';
import {makeSupplement} from './supplement';
import {ROOT,OUT,read,save,hash,sha,stable,originalJobs} from './common.mjs';
const checks:any[]=[];
function test(name:string,fn:()=>void){fn();checks.push({name,passed:true});}
const fixture=path.join(OUT,'contract-input.json');
const input={schema:'hard-collection-pc64-input-v1',jobs:[originalJobs[6]],attemptOffsets:{7:1}};
const write=(v:any)=>fs.writeFileSync(fixture,JSON.stringify(v));
test('缺口原槽保留父局种子初态',()=>{write(input);assert.equal(readCollectionInput(fixture).jobs[0].executionSequence,7);});
test('拒绝改写原槽seed',()=>{const v=structuredClone(input);v.jobs[0].seed++;write(v);assert.throws(()=>readCollectionInput(fixture));});
test('拒绝重置已耗尽版本预算',()=>{write({...input,attemptOffsets:{7:3}});assert.throws(()=>readCollectionInput(fixture));});
test('拒绝重复父局',()=>{write({...input,jobs:[input.jobs[0],input.jobs[0]]});assert.throws(()=>readCollectionInput(fixture));});
let adapted=0;test('全部3000冻结输入初态可适配',()=>{for(const j of originalJobs){createJobState(j);adapted++;}});
const phone=read(path.join(OUT,'PHONE_AUDITED.json')),mismatches:any[]=[];
test('1512手机实际初态与GPU语义投影一致',()=>{for(const row of phone){const j=originalJobs.find((j:any)=>j.parentId===row.parentId),semantic=initialSemantics(j,createJobState(j));if(sha(stable(semantic))!==row.initialSemanticSha256)mismatches.push({sequence:row.executionSequence,project:semantic,native:initialSemantics(j,read(path.join(row.localDirectory,'initial-state-receipt.json')).actual,true)});}save('INITIAL_SEMANTIC_MISMATCHES.json',mismatches);assert.equal(mismatches.length,0);});
test('复合移动攻击与项目原子位置语义相同',()=>{
    const raw={a:1,b:1,c:2,d:1,e:3,f:1,g:3,h:2,i:-1,j:'ATTACK'},state={units:[{id:'a',pos:{x:1,y:1}},{id:'b',pos:{x:3,y:2}}]};
    const tokens=[...projectTokens(state,{type:'move',unitId:'a',to:{x:2,y:1}}),...projectTokens({units:[{id:'a',pos:{x:2,y:1}},{id:'b',pos:{x:3,y:2}}]},{type:'attack',attackerId:'a',targetId:'b'}),...projectTokens({units:[{id:'a',pos:{x:2,y:1}}]},{type:'post_attack_move',unitId:'a',to:{x:3,y:1}})];assert.deepEqual(nativeTokens(raw),tokens);
});
const cells=new Map();for(const j of originalJobs)cells.set(`${j.category}/${j.actualPlayerCount}`,j);
test('新槽七类21格保留来源及独立身份',()=>{let n=1;for(const j of cells.values()){const extra=makeSupplement(j,n++);assert.notEqual(extra.parentId,j.parentId);assert.notEqual(extra.seed,j.seed);assert.equal(extra.supplementalLineage.originalJobSha256,hash(j));write({schema:input.schema,jobs:[extra],attemptOffsets:{}});readCollectionInput(fixture);}});
write(input);save('CONTRACTS.json',{passed:true,checks,adapted,phoneInitialProjections:phone.length,actionsExecuted:0,historicalReplay:false});console.log(JSON.stringify({passed:true,checks:checks.length,adapted,phoneInitialProjections:phone.length}));
