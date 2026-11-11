// 比较独立重新运行的Python与TypeScript候选前向。
import fs from 'node:fs';import assert from 'node:assert/strict';
import {loadSpatialResNetFromJson,SpatialResNetPredictor} from '../r8_pure_policy_stage_20261014_125300/frozen/src/game/ai/spatial_conv_net';
const S='ai_training/r8_pure_policy_stage_20261014_125300',O='ai_training/review_r8_20261014_212059';
const f=JSON.parse(fs.readFileSync(S+'/data/parity_fixture.json','utf8'));const py=JSON.parse(fs.readFileSync(O+'/fresh_python_predictions.json','utf8'));
const p=new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(S+'/checkpoints/r1_warm/best.json','utf8')));let maxLogit=0,maxValue=0,matches=0;
for(let i=0;i<f.length;i++){
 const s=f[i];assert.equal(s.sampleId,py[i].sampleId);const c=(v:number[])=>v[0]<0?null:{x:v[0],y:v[1]};
 const pred=p.predict({spatialTensor:new Float32Array(s.spatial),globalFeatures:new Float32Array(s.global)} as any,s.candidateSemantics.map((v:number[],k:number)=>({actorCoord:c(s.candidateActorCoords[k]),landingCoord:c(s.candidateLandingCoords[k]),targetCoord:c(s.candidateTargetCoords[k]),semantics:new Float32Array(v)})));
 assert.equal(pred.actionLogits.length,py[i].logits.length);assert(pred.actionLogits.every(Number.isFinite));assert(Number.isFinite(pred.value));
 maxLogit=Math.max(maxLogit,...pred.actionLogits.map((v,k)=>Math.abs(v-py[i].logits[k])));maxValue=Math.max(maxValue,Math.abs(pred.value-py[i].value));
 matches+=Number(pred.actionLogits.indexOf(Math.max(...pred.actionLogits))===py[i].argmax);
}
const r={states:f.length,maxLogit,maxValue,argmaxMatches:matches,passed:maxLogit<=1e-4&&maxValue<=1e-4&&matches===f.length};
fs.writeFileSync(O+'/fresh_parity_results.json',JSON.stringify(r,null,2));console.log(r);assert(r.passed);
