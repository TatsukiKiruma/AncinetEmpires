import fs from 'node:fs';
import assert from 'node:assert/strict';
import {features,inputHash,fileHash} from './common';
import {loadSpatialResNetFromJson,SpatialResNetPredictor} from '../frozen/src/game/ai/spatial_conv_net';
const stage='ai_training/r8_pure_policy_stage_20261014_125300',model=process.argv[2],id=fileHash(model);
const samples=JSON.parse(fs.readFileSync(`${stage}/data/parity_fixture.json`,'utf8'));
const py=JSON.parse(fs.readFileSync(`${stage}/evidence/parity_py_${id}.json`,'utf8'));
const predictor=new SpatialResNetPredictor(loadSpatialResNetFromJson(fs.readFileSync(model,'utf8')));
const rows:any[]=[];let maxLogit=0,maxValue=0;
for(let i=0;i<samples.length;i++){
 const s=samples[i];const coord=(x:number[])=>x[0]<0?null:{x:x[0],y:x[1]};
 assert.equal(py[i].inputHash,s.inputHash);assert.deepEqual(py[i].actionCodes,s.actionCodes);
 const acts=s.candidateSemantics.map((sem:number[],k:number)=>({actorCoord:coord(s.candidateActorCoords[k]),landingCoord:coord(s.candidateLandingCoords[k]),targetCoord:coord(s.candidateTargetCoords[k]),semantics:new Float32Array(sem)}));
 const pred=predictor.predict({spatialTensor:new Float32Array(s.spatial),globalFeatures:new Float32Array(s.global)} as any,acts);
 assert(pred.actionLogits.every(Number.isFinite));assert(Number.isFinite(pred.value));
 const err=Math.max(...pred.actionLogits.map((v,k)=>Math.abs(v-py[i].logits[k]))),ve=Math.abs(pred.value-py[i].value);maxLogit=Math.max(maxLogit,err);maxValue=Math.max(maxValue,ve);
 const arg=pred.actionLogits.indexOf(Math.max(...pred.actionLogits));rows.push({sampleId:s.sampleId,map:s.mapName,logitError:err,valueError:ve,argmaxMatch:arg===py[i].argmax});
}
const report={model,modelSha256:id,states:rows.length,maxLogit,maxValue,argmaxMatches:rows.filter(x=>x.argmaxMatch).length,passed:maxLogit<=1e-4&&maxValue<=1e-4&&rows.every(x=>x.argmaxMatch),rows};
fs.writeFileSync(`${stage}/evidence/parity_${id}.json`,JSON.stringify(report,null,2));console.log({...report,rows:undefined});assert(report.passed);
