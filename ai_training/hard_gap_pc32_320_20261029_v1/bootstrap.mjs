/** 冻结核验工具来源，保留旧目录；本次只授权固定320父局。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const out=import.meta.dirname,root=path.resolve(out,'../..'),old=path.join(root,'ai_training/hard_collection_pc64_v4_20261029');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const name of ['common.mjs','audit.ts'])fs.copyFileSync(path.join(old,name),path.join(out,name),fs.constants.COPYFILE_EXCL);
const file=path.join(out,'audit.ts');let code=fs.readFileSync(file,'utf8');
const before='export async function auditPhone(row:any){\n    const job:any=byParent.get(row.parentId);';
if(!code.includes(before))throw Error('手机静态核验锚点改变');
code=code.replace(before,'export async function auditPhone(row:any,suppliedJob?:any){\n    const job:any=suppliedJob??byParent.get(row.parentId);');
fs.writeFileSync(file,code);
fs.writeFileSync(path.join(out,'AUDITOR_SOURCE.json'),JSON.stringify({originalDirectory:old,sources:Object.fromEntries(['common.mjs','audit.ts'].map(name=>[name,hash(fs.readFileSync(path.join(old,name)))])),adaptation:'手机任务支持已冻结的独立补充父局，语义归一化与帧合同不变',historicalReplay:false},null,2),{flag:'wx'});
