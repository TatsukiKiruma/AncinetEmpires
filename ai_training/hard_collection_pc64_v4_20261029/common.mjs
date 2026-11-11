/** 只读身份工具及原子账本写入；不执行规则或回放。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const ROOT=path.resolve(import.meta.dirname,'../..');
export const OUT=import.meta.dirname;
export const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const hash=v=>sha(JSON.stringify(v));
export const fileSha=f=>sha(fs.readFileSync(f));
export function stable(v){return JSON.stringify(canonical(v));}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function save(name,v){const f=path.join(OUT,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.pending',JSON.stringify(v,null,2));fs.renameSync(f+'.pending',f);}
export function tally(rows,key){const out={};for(const r of rows){const k=key(r);out[k]=(out[k]??0)+1;}return out;}
export const frozenFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json');
export const originalJobs=read(frozenFile).jobs;
export const phoneFile=path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/pc64-handoff-20261029/PHONE_VERIFIED_PARENTS.json');
export function runsUnder(root){const runs=[];function visit(d){if(fs.existsSync(path.join(d,'RUN.json'))){runs.push(d);return;}for(const e of fs.readdirSync(d,{withFileTypes:true}))if(e.isDirectory()&&!e.name.startsWith('parent-')&&!['source','sources','source-freeze','evidence','build'].includes(e.name))visit(path.join(d,e.name));}visit(root);return runs;}
