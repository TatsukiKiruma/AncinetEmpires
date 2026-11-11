import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8')),proof=read('revisions/r21/performance-proof-0.json'),variants={},bindings={};
for(const name of ['baseline','optimized']){
    const files=fs.readdirSync(here).filter(n=>n.startsWith('r21-performance-proof-'+name+'-0-')&&n.endsWith('.mjs'));assert.equal(files.length,1);const file=path.join(here,files[0]);assert.equal(sha(fs.readFileSync(file)),proof.bindings[name].bundleSha256);variants[name]=await import(pathToFileURL(file));bindings[name]={...proof.bindings[name],file:files[0]};
}
const input='revisions/r21/profile-1792416550518/state.json',fixture=read(input),model=read('teacher-model.json'),old=read('old-schema.json'),samples=[];let expected;
for(let repeat=0;repeat<5;repeat++)for(const variant of repeat%2?['optimized','baseline']:['baseline','optimized']){
    const value=variants[variant].run(fixture.state,model,old),identity=sha(JSON.stringify([value.code,value.decision]));expected??=identity;assert.equal(identity,expected);samples.push({repeat,variant,ms:value.ms});
}
const groups={};for(const name of ['baseline','optimized']){const times=samples.filter(v=>v.variant===name&&v.repeat>0).map(v=>v.ms).sort((a,b)=>a-b);groups[name]={count:times.length,p50:times[Math.ceil(times.length*.5)-1],p95:times[Math.ceil(times.length*.95)-1],totalMs:times.reduce((n,v)=>n+v,0)};}
const report={passed:true,fixture:{slot:fixture.slot,row:fixture.row,units:fixture.state.units.length,originalMs:fixture.originalMs,stateFileSha256:sha(fs.readFileSync(path.join(here,input)))},allDecisionsAndTracesExact:true,bindings,groups,samples,scope:'失败面板最大慢帧的同机交替冻结性能分支对照；不含安全完结修复，不替代四进程完整面板门禁'};fs.writeFileSync(path.join(here,'revisions/r21/large-root-ab-'+Date.now()+'.json'),JSON.stringify(report),{flag:'wx'});console.log({...report,samples:undefined,bindings:undefined});
