// 独立审查探针：只造小型本地fixture，不修改reader、历史分片或手机状态。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { inspectAndRead, confinedFile, type Admission } from './phone/compact_reader';

const project=process.cwd();
const base=path.join(project,'ai_training/data_acceptance_20261016');
const source=path.join(base,'phone/compact_reader.ts');
const before=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const probe=path.join(base,`compact_reader_review_fixture_${Date.now()}`);
fs.mkdirSync(probe);
const original=gunzipSync(fs.readFileSync(path.join(base,'phone/full_v6/candidate_shards/s0005.jsonl.gz'))).toString().trim().split('\n').map(line=>JSON.parse(line));
const header=original[0],actions=original.filter(r=>r.kind==='action'&&r.macro===0);
const receipt=JSON.parse(fs.readFileSync(path.join(base,'phone/full_v6/receipts/s0005.json'),'utf8'));
receipt.summary={...receipt.summary,checkedMacros:1,atomicActions:actions.length,expectedActions:1,observedActions:1,frameCount:1,maxAdmissibleGlobalMacroExclusive:1};
receipt.failure=null;
const footer={kind:'footer',summary:receipt.summary,failure:null};
const entry:Admission={segmentId:header.segmentId,parentId:header.parentId,receipt:'receipt.json',candidateShard:'shard.gz',shardSha256:'',
 inputHash:receipt.inputHash,sourceIdentity:receipt.sourceIdentity,globalOffset:0,maxGlobalMacroExclusive:1,
 policyLabelEligible:true,modelSchemaAccepted:false,valueEligible:false,returnEligible:false,nativeWinningAllianceId:1,outcomeKind:'natural_terminal'};
const findings:any[]=[];
async function run(name:string,mutate:(rows:any[],receipt:any,entry:any)=>void,corrupt?:'crc'|'sha'){
 const dir=path.join(probe,name);fs.mkdirSync(dir);
 const rr=structuredClone([header,...actions,footer]),rec=structuredClone(receipt),e=structuredClone(entry);
 mutate(rr,rec,e);
 if(e._evidence){
  const evidenceBytes=Buffer.from(JSON.stringify(e._evidence));
  e.valueEvidence={path:'value_evidence.json',sha256:createHash('sha256').update(evidenceBytes).digest('hex')};
  fs.writeFileSync(path.join(dir,'value_evidence.json'),evidenceBytes);delete e._evidence;
 }
 let bytes=gzipSync(rr.map(r=>JSON.stringify(r)).join('\n')+'\n');
 if(corrupt==='crc'){bytes=Buffer.from(bytes);bytes[bytes.length-8]^=1;}
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(rec));fs.writeFileSync(path.join(dir,'shard.gz'),bytes);
 e.shardSha256=corrupt==='sha'?'0'.repeat(64):createHash('sha256').update(bytes).digest('hex');
 const emitted:any[]=[];let error:null|string=null,result:any=null;
 try{result=await inspectAndRead(dir,e,row=>{emitted.push({macro:row.macro,subAction:row.subAction,weight:row.weight,actor:row.actor,alliance:row.alliance,valueMask:row.valueMask,outcomeTarget:row.outcomeTarget});});}
 catch(err){error=String(err);}
 findings.push({name,accepted:!error,emitted:emitted.length>4?{count:emitted.length,targets:Object.fromEntries([-1,1].map(t=>[String(t),emitted.filter(r=>r.outcomeTarget===t).length])),sample:emitted.slice(0,2)}:emitted,error,result:result?{admittedAtoms:result.admittedAtoms,admittedMacros:result.admittedMacros,gzipComplete:result.gzipComplete}:null});
}
await run('baseline',()=>{});
await run('missing_weight',rr=>{for(const r of rr)if(r.kind==='action')delete r.weight;});
await run('string_weight',rr=>{for(const r of rr)if(r.kind==='action')r.weight=String(r.weight);});
await run('value_missing_alliance',(rr,_rec,e)=>{for(const r of rr)if(r.kind==='action')delete r.alliance;e.valueEligible=true;});
await run('value_missing_actor',(rr,_rec,e)=>{for(const r of rr)if(r.kind==='action')delete r.actor;e.valueEligible=true;});
await run('value_unknown_winner',(_rr,_rec,e)=>{e.nativeWinningAllianceId=-1;e.valueEligible=true;});
await run('missing_code',rr=>{for(const r of rr)if(r.kind==='action')delete r.code;});
await run('complete_value_perspectives',(rr,rec,e)=>{
 const originalReceipt=JSON.parse(fs.readFileSync(path.join(base,'phone/full_v6/receipts/s0005.json'),'utf8'));
 Object.assign(rec,originalReceipt);rr.splice(0,rr.length,...structuredClone(original));
 e.maxGlobalMacroExclusive=originalReceipt.summary.maxAdmissibleGlobalMacroExclusive;e.valueEligible=true;
 e._evidence={parentId:e.parentId,sourceIdentity:e.sourceIdentity,nativeWinningAllianceId:1,outcomeKind:'natural_terminal',allSegmentsStrict:true,segmentIds:[e.segmentId]};
});
await run('missing_atom',rr=>{rr.splice(2,1);});
await run('crc_failure',()=>{},'crc');
await run('sha_failure',()=>{},'sha');
await run('footer_only_failure',(rr,rec,e)=>{
 rec.summary={...rec.summary,transitionAccepted:false,checkedMacros:0,atomicActions:0,maxAdmissibleGlobalMacroExclusive:0};
 rec.failure={category:'parse_or_projection_error'};rr.splice(0,rr.length,{kind:'footer',summary:rec.summary,failure:rec.failure});e.maxGlobalMacroExclusive=0;
});
await run('footer_before_header',(rr,rec,e)=>{
 rec.summary={...rec.summary,transitionAccepted:false,checkedMacros:0,atomicActions:0,maxAdmissibleGlobalMacroExclusive:0};
 rec.failure={category:'parse_or_projection_error'};rr.splice(0,rr.length,{kind:'footer',summary:rec.summary,failure:rec.failure},structuredClone(header));e.maxGlobalMacroExclusive=0;
});
const junctionRoot=path.join(probe,'junction_root'),outside=path.join(probe,'outside_root');fs.mkdirSync(junctionRoot);fs.mkdirSync(outside);
fs.writeFileSync(path.join(outside,'outside.json'),'{}');
try{
 fs.symlinkSync(outside,path.join(junctionRoot,'linked'),'junction');
 const resolved=confinedFile(junctionRoot,'linked/outside.json');
 findings.push({name:'junction_path_escape',accepted:true,lexicalResolved:resolved,actualResolved:fs.realpathSync(resolved),actualOutsideRoot:!fs.realpathSync(resolved).startsWith(fs.realpathSync(junctionRoot)+path.sep)});
}catch(err){findings.push({name:'junction_path_escape',error:String(err)});}
const after=createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const report={observedAt:new Date().toISOString(),readerSha256:before,readerUnchanged:before===after,probe,findings};
fs.writeFileSync(path.join(probe,'findings.json'),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify(report,null,2)+'\n');
