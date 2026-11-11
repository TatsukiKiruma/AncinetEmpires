/** 本次补足3000局的源码位于C盘，所有运行数据位于D盘。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const SOURCE_DIR=import.meta.dirname;
export const ROOT=path.resolve(SOURCE_DIR,'../..');
export const OUT='D:/AncientEmpiresData/collection_20261030_pc64_to3000_v1';
export const PREVIOUS='D:/AncientEmpiresData/collection_20261030_pc64_after32_v1';
export const PC320='D:/AncientEmpiresData/collection_20261029_pc32/hard_gap_pc32_320_20261029_v1';
export const PC288='D:/AncientEmpiresData/collection_20261029_pc32_resume288_v1';
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const hash=v=>sha(JSON.stringify(v));
export const fileSha=file=>sha(fs.readFileSync(file));
export function stable(v){return JSON.stringify(canonical(v));}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function save(name,value){const file=path.join(OUT,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.pending',JSON.stringify(value,null,2));for(let retry=0;;retry++){try{fs.renameSync(file+'.pending',file);break;}catch(e){if(retry>=20)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}}
export function tally(rows,key){const counts={};for(const row of rows){const k=key(row);counts[k]=(counts[k]??0)+1;}return counts;}
export const frozenFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json');
export const originalJobs=read(frozenFile).jobs;
export const phoneFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/pc64-handoff-20261029/PHONE_VERIFIED_PARENTS.json');
