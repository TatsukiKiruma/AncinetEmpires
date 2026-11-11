import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {OUT,makeEnv,readEpisode,sha,clone,encodeAndLabel,verifyFreeze,validateState} from './recovery_core';
import {replayEpisodeDatasetItems} from './frozen/tools/strict_replay';
const meta=JSON.parse(fs.readFileSync(path.join(OUT,'selection_100.json'),'utf8')).selected.find((m:any)=>m.players===2),old=readEpisode(meta),env=makeEnv(old),initial=env.reset(old.seed),entry=initial.legalActionEntries[0];
const next=env.stepAction(entry.action);
const synthetic={...old,initialObservationHash:sha(initial.observation),initialLegalActionCount:initial.legalActions.length,fixedActionSpaceSize:initial.fixedActionSpaceDescriptor.size,steps:[{step:1,turnBefore:initial.state.turn,playerId:initial.state.currentPlayer,policy:'fixture',legalActionCount:initial.legalActions.length,fixedLegalActionCount:initial.fixedLegalActionIndexes.length,fixedActionIndex:entry.fixedActionIndex,actionCode:entry.code,reward:next.reward,done:next.done,winnerAfter:next.state.winner,illegal:false}]};
const results=[];
assert.equal([...replayEpisodeDatasetItems(synthetic,makeEnv(old),{observationMode:'none'})].length,1);
for(const [name,mutate,pattern] of [
 ['initial',(e:any)=>e.initialObservationHash='bad','初始 observation hash'],
 ['legal',(e:any)=>e.steps[0].legalActionCount++,'合法动作数'],
 ['code',(e:any)=>e.steps[0].actionCode='bad','动作编码'],
 ['reward',(e:any)=>e.steps[0].reward=123,'reward'],
 ['done',(e:any)=>e.steps[0].done=!e.steps[0].done,'done'],
 ['winner',(e:any)=>e.steps[0].winnerAfter=999,'winner']
] as any[]){const e=clone(synthetic);mutate(e);assert.throws(()=>[...replayEpisodeDatasetItems(e,makeEnv(old),{observationMode:'none'})],new RegExp(pattern));results.push({name,passed:true});}
const state=makeEnv(old).reset(old.seed).state,a=encodeAndLabel(state),b=encodeAndLabel(state);assert.deepEqual(a,b);
const excessive=clone(state);excessive.units[0].hp=excessive.units[0].maxHp+1;assert.throws(()=>validateState(excessive),/血量/);
const grave=clone(state);grave.graves=[{id:'fixture-grave',pos:{x:0,y:0},remainingTurns:0,ownerId:state.currentPlayer}];validateState(grave);
const recruitEnv=makeEnv(old),recruitInitial=recruitEnv.reset(old.seed),recruit=recruitInitial.legalActions.find((x:any)=>x.type==='recruit_to_castle');assert.ok(recruit);validateState(recruitEnv.stepAction(recruit).state);
assert.equal(a.spatial.length,34*20*20);assert.equal(a.global.length,20);assert.ok(a.candidateSemantics.every((s:any)=>s.length===53));
fs.writeFileSync(path.join(OUT,'checks.json'),JSON.stringify({freezeIdentity:verifyFreeze(),syntheticValidReplay:true,negativeControls:results,teacherRepeatability:true,excessiveHpRejected:true,zeroLifetimeGraveAccepted:true,legalRecruitPendingAccepted:true,schemaDimensions:[34,20,20,20,53],note:'合成单步用于验证校验器故障拦截，不计入历史恢复通过数'},null,2));console.log('校验器负对照与编码教师一致性检查通过');
