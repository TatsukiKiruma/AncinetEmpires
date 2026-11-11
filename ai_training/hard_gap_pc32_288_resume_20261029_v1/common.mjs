/** 源码在仓库，输入、日志和运行状态统一写入D盘独立目录。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const SOURCE_DIR=import.meta.dirname;
export const ROOT=path.resolve(SOURCE_DIR,'../..');
export const OUT='D:/AncientEmpiresData/collection_20261029_pc32_resume288_v1';
export const PREVIOUS='D:/AncientEmpiresData/collection_20261029_pc32/hard_gap_pc32_320_20261029_v1';
export const PREVIOUS_SOURCE=path.join(ROOT,'ai_training/hard_gap_pc32_320_20261029_v1');
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const hash=v=>sha(JSON.stringify(v));
export const fileSha=file=>sha(fs.readFileSync(file));
export function stable(v){return JSON.stringify(canonical(v));}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function save(name,value){const f=path.join(OUT,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.pending',JSON.stringify(value,null,2));for(let retry=0;;retry++){try{fs.renameSync(f+'.pending',f);break;}catch(e){if(retry>=20)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}}
export function tally(rows,key){const counts={};for(const row of rows){const k=key(row);counts[k]=(counts[k]??0)+1;}return counts;}
export const frozenFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json');
export const originalJobs=read(frozenFile).jobs;
export const phoneFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/pc64-handoff-20261029/PHONE_VERIFIED_PARENTS.json');
export function runsUnder(root){const found=[];function visit(dir){if(fs.existsSync(path.join(dir,'RUN.json'))){found.push(dir);return;}for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isDirectory()&&!e.name.startsWith('parent-')&&!['source','sources','source-freeze','source-snapshot','evidence','build'].includes(e.name))visit(path.join(dir,e.name));}visit(root);return found;}
