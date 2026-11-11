import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync,gunzipSync } from 'node:zlib';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { infer,legalActions } from './policy_runtime';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { auditSearchRisks } from './audit_search_risks';
import { DIR,read,save,sha,hash } from './io';

const mode=process.argv[2]??'teacher',lane=Number(process.argv[3]??0),tag=process.argv[4]??mode,prefix='search-scale',modelName=mode==='teacher'?'teacher-model.json':'model-final.json',model=read(modelName),old=read('old-schema.json');
const protocolPath=fs.existsSync(path.join(DIR,'ACTIVE_SEARCH_PROTOCOL.json'))?read('ACTIVE_SEARCH_PROTOCOL.json').path:'search_scale_protocol.json';
const freezeName=`source-freeze-search-scale-${tag}.json`,frozen=read(freezeName);for(const [file,item] of Object.entries(frozen.files) as [string,{sha256:string}][])assert.equal(sha(fs.readFileSync(path.resolve(DIR,'../..',file))),item.sha256,'校准采集必须保持冻结源码身份');
const receipt=read(prefix+`/roots-${lane}.receipt.json`),bytes=fs.readFileSync(path.join(DIR,prefix,`roots-${lane}.jsonl.gz`));assert.ok(receipt.passed);assert.equal(sha(bytes),receipt.rootFileSha256);
const roots=gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),records:any[]=[],witnesses:any[]=[];
const audits={branches:0,targets:0,witnessActions:0,lethalWitnesses:0,baselineProjections:0};let sourceLabels=0;
for(const [i,item] of roots.entries()){
    assert.equal(hash(item.state),item.stateHash);const engine=new GameEngine(item.state),legal=legalActions(engine);assert.ok(legal.some(a=>encodeAction(a)===item.label),'离线校准标签必须属于当前完整合法动作集合');sourceLabels++;
    const root=infer(engine,legal,model,old),ai=new ModelBattleSearchAI(model,old,{priorWeight:0});ai.getAction(engine,item.state.currentPlayer,legal,root,{});
    const search=ai.lastDecision,audit=auditSearchRisks(engine,search);for(const key of Object.keys(audits) as (keyof typeof audits)[])audits[key]+=audit[key];
    const x=root.x,inputHash=hash({tokens:x.tokens,groups:x.groups,candidates:x.candidates,refs:x.refs,codes:x.codes,actionGroups:x.actionGroups});
    const candidates=(search.traces??[]).map((v:any)=>({code:encodeAction(v.action),index:v.index,score:v.score,confidence:root.prior[v.index],complete:v.complete,riskKnown:v.riskKnown,commanderLethal:v.commanderLethal,actorLethal:v.actorLethal,naturalWin:v.naturalWin,tactical:v.tactical,net:v.net}));
    assert.ok(candidates.every((v:any)=>Number.isFinite(v.score)&&Number.isFinite(v.confidence)));assert.equal(hash(engine.getState()),item.stateHash);
    records.push({id:item.id,parent:item.parent,split:item.split,phase:item.phase,stateHash:item.stateHash,inputHash,label:item.label,weight:item.weight,preferred:root.x.codes[root.out.best],rankingMode:search.vetoLeafRanked?'veto_leaf':'policy_mixed',candidates});
    witnesses.push({id:item.id,stateHash:item.stateHash,search,audit});
    if((i+1)%5===0)save(prefix+`/${tag}-${lane}.live.json`,{roots:i+1,total:roots.length,audits});
}
const outputs:Record<string,string>={};
for(const [name,rows] of [[`${tag}-${lane}.jsonl.gz`,records],[`${tag}-witness-${lane}.jsonl.gz`,witnesses]] as const){const file=path.join(DIR,prefix,name),data=gzipSync(Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'));assert.ok(!fs.existsSync(file));fs.writeFileSync(file,data,{flag:'wx'});outputs[name]=sha(data);}
save(prefix+`/${tag}-${lane}.receipt.json`,{passed:true,mode,tag,lane,roots:roots.length,sourceLabels,modelSha256:sha(fs.readFileSync(path.join(DIR,modelName))),rootReceiptSha256:sha(fs.readFileSync(path.join(DIR,prefix,`roots-${lane}.receipt.json`))),protocolPath,protocolSha256:sha(fs.readFileSync(path.join(DIR,protocolPath))),sourceFreezeSha256:sha(fs.readFileSync(path.join(DIR,freezeName))),collectorSha256:sha(fs.readFileSync(new URL(import.meta.url))),searchCoreSha256:sha(fs.readFileSync(path.join(DIR,'model_battle_search_ai.ts'))),leafSha256:sha(fs.readFileSync(path.join(DIR,'leaf.ts'))),collectionPriorWeight:0,branchPolicyCalls:0,audits,outputs});console.log({passed:true,mode,tag,lane,roots:roots.length,audits});
