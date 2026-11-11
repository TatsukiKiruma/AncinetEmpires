/** 损坏日志和伪自然标签必须拒收；仅修改本目录合成夹具，不执行动作。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {auditGpu} from './audit';
import {OUT,read,save} from './common.mjs';
const good=read(path.join(OUT,'HISTORICAL_GPU_AUDITED.json')).find((r:any)=>r.executionSequence===2001),source=good.localDirectory;
const files=['job.json','initial.json','final.json','result.json','decisions.jsonl.gz'],checks=[];
async function fixture(name:string,edit:(dir:string)=>void){
    const dir=path.join(OUT,'record-contract-fixtures',name);fs.mkdirSync(dir,{recursive:true});for(const f of files)fs.copyFileSync(path.join(source,f),path.join(dir,f));
    edit(dir);await assert.rejects(()=>auditGpu(dir,good.runDirectory));checks.push({name,rejected:true});
}
await fixture('伪自然胜者',dir=>{const r=read(path.join(dir,'result.json'));r.winner=99;fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(r));});
await fixture('截断压缩记录',dir=>{const f=path.join(dir,'decisions.jsonl.gz'),b=fs.readFileSync(f);fs.writeFileSync(f,b.subarray(0,b.length-20));});
await fixture('动作索引断裂',dir=>{const f=path.join(dir,'decisions.jsonl.gz'),lines=zlib.gunzipSync(fs.readFileSync(f)).toString().trim().split('\n'),v=JSON.parse(lines[0]);v.step=1;lines[0]=JSON.stringify(v);fs.writeFileSync(f,zlib.gzipSync(lines.join('\n')+'\n'));});
await fixture('冻结seed篡改',dir=>{const f=path.join(dir,'job.json'),j=read(f);j.seed++;fs.writeFileSync(f,JSON.stringify(j));});
save('RECORD_CONTRACTS.json',{passed:true,checks,historicalReplay:false,actionsExecuted:0});console.log(JSON.stringify({passed:true,checks:checks.length}));
