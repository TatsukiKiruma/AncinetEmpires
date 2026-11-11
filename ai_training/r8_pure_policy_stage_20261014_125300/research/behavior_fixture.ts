import fs from 'node:fs';
import {GameEngine,hash,encodeAction} from './common';import {policy} from './policy';
const stage='ai_training/r8_pure_policy_stage_20261014_125300';const samples=JSON.parse(fs.readFileSync(`${stage}/data/parity_fixture.json`,'utf8'));
const rows=samples.map((s:any)=>{const e=new GameEngine(s.stateJson),legal=e.getLegalActions(s.stateJson.currentPlayer);const seed=parseInt(hash(s.stateHash).slice(0,8),16);const a=policy({},seed,s.stateJson.currentPlayer).act(structuredClone(s.stateJson),structuredClone(legal));return {...s,targetActionIndex:legal.map(encodeAction).indexOf(encodeAction(a)),teacherActionType:a.type};});
fs.writeFileSync(`${stage}/evidence/behavior_fixture.json`,JSON.stringify(rows));console.log('行为切片',rows.reduce((a:any,s:any)=>(a[s.teacherActionType]=(a[s.teacherActionType]??0)+1,a),{}));
