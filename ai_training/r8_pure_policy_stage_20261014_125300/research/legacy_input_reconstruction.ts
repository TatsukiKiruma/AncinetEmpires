// P1使用26通道；旧日志的通用34通道诊断hash不能冒称P1实际网络输入身份。
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {GameEngine,strictStep,hash,inputHash,features} from './common';
import {encodeGameStateSpatial,encodeCandidateActionsSpatialForSchema,ENCODER_SCHEMA_ID_V15} from '../frozen/src/game/ai/spatial_tensor_encoder';
const S=path.resolve(__dirname,'..'),out:any[]=[];
for(let g=0;g<20;g++){
 const p=path.join(S,`runs/dev_old_p1/game_${g}`);const r=JSON.parse(fs.readFileSync(p+'.json','utf8'));const events=fs.readFileSync(p+'.jsonl','utf8').trim().split('\n').map(x=>JSON.parse(x));const e=new GameEngine(events.find(x=>x.type==='ready').initialState);
 for(const x of events.filter(x=>x.type==='step')){
  const st=e.getState(),legal=e.getLegalActions(st.currentPlayer);assert.equal(hash(st),x.beforeHash);
  if(x.player===r.candidateSeat){
   const enc=encodeGameStateSpatial(st,st.currentPlayer,'v2',{channels:26});const acts=encodeCandidateActionsSpatialForSchema(st,st.currentPlayer,legal,'v2',ENCODER_SCHEMA_ID_V15);const coord=(a:any)=>a?[a.x,a.y]:[-1,-1];
   const f={spatial:Array.from(enc.spatialTensor),global:Array.from(enc.globalFeatures),candidateActorCoords:acts.map(a=>coord(a.actorCoord)),candidateLandingCoords:acts.map(a=>coord(a.landingCoord)),candidateTargetCoords:acts.map(a=>coord(a.targetCoord)),candidateSemantics:acts.map(a=>Array.from(a.semantics))};
   assert.equal(x.inputHash,inputHash(features(st,legal)));out.push({game:g,step:x.step,stateHash:x.beforeHash,loggedDiagnostic34InputHash:x.inputHash,actual26InputHash:inputHash(f)});
  }
  strictStep(e,legal,x.action);
 }
}
fs.writeFileSync(path.join(S,'evidence/legacy_p1_input_reconstruction.json'),JSON.stringify({passed:true,scope:'只读重建P1真实26通道输入hash，原逐局日志保留；胜负不变',rows:out},null,2));console.log('重建P1实际输入',out.length);
