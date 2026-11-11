import fs from 'node:fs';
import {GameEngine,createState,encodeAction,strictStep,features,hash} from './common';
import {policy} from './policy';
import {SpatialResNetPredictor,loadSpatialResNetFromJson} from '../frozen/src/game/ai/spatial_conv_net';
const stage='ai_training/r8_pure_policy_stage_20261014_125300';const r7='ai_training/r7_training_stage_20261014_083500';
const predictor=new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(`${r7}/artifacts/models/round3_enhanced_v2_best.json`,'utf8')));
const report=JSON.parse(fs.readFileSync(`${r7}/artifacts/final_eval/final_acceptance_report.json`,'utf8'));
const rows:any[]=[],counterfactuals:any[]=[];
for(const r of report.results){const e=new GameEngine(createState(r.mapName));for(const tr of r.replayTrace){const st=e.getState(),legal=e.getLegalActions(st.currentPlayer);const a=legal.find(a=>encodeAction(a)===tr.actionEncoded)!;
 if(tr.stepIndex>=r.totalSteps-20){const own=st.units.filter(u=>u.ownerId===r.candidateSeat),enemy=st.units.filter(u=>u.ownerId!==r.candidateSeat);rows.push({game:r.gameIndex,map:r.mapName,step:tr.stepIndex,player:st.currentPlayer,action:a.type,gold:st.players.map(x=>x.gold),units:[own.length,enemy.length],hp:[own.reduce((a,u)=>a+u.hp,0),enemy.reduce((a,u)=>a+u.hp,0)],buildings:st.players.map(p=>st.map.tiles.flat().filter(t=>(t.terrainId===9||t.terrainId===10)&&t.ownerId===p.id).length),pending:!!st.pendingUnitId,stateHash:hash(st)});}
 if(a.type==='surrender'){
  const f=features(st,legal),coord=(c:number[])=>c[0]<0?null:{x:c[0],y:c[1]};const pred=predictor.predict({spatialTensor:new Float32Array(f.spatial),globalFeatures:new Float32Array(f.global)} as any,f.candidateSemantics.map((s,i)=>({actorCoord:coord(f.candidateActorCoords[i]),landingCoord:coord(f.candidateLandingCoords[i]),targetCoord:coord(f.candidateTargetCoords[i]),semantics:new Float32Array(s)})));
  const ranked=legal.map((a,i)=>({a,i,l:pred.actionLogits[i]})).sort((a,b)=>b.l-a.l);const alternative=ranked.find(x=>x.a.type!=='surrender')!;const teacher=policy({},137+r.gameIndex,st.currentPlayer).act(structuredClone(st),structuredClone(legal));
  counterfactuals.push({gameIndex:r.gameIndex,mapName:r.mapName,initialState:structuredClone(st),candidateSeat:r.candidateSeat,ranked:ranked.map(x=>({type:x.a.type,code:encodeAction(x.a),logit:x.l})),alternative:alternative.a,teacher:encodeAction(teacher),label:'仅用于因果诊断，不参与纯模型计分'});
 }
 strictStep(e,structuredClone(legal),a);
}}
fs.writeFileSync(`${stage}/evidence/r7_failure_timeline.json`,JSON.stringify(rows,null,2));fs.writeFileSync(`${stage}/evidence/r7_surrender_cases.json`,JSON.stringify(counterfactuals,null,2));console.log('失败时间线',rows.length,'投降反例',counterfactuals.length);
