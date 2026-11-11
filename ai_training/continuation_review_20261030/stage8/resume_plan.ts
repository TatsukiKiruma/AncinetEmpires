import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { here, read, fileSha, save, sha } from './io';
const defaultMigration = path.join(here,'SCHEDULER_MIGRATION.json');
function entry(file:string, migration:string) {
    const registry=path.join(path.dirname(file),'PLAN_B_REGISTRY.json');
    const entries=[...(fs.existsSync(migration)?read(migration).files:[]),...(fs.existsSync(registry)?read(registry).files:[])];
    return entries.find((r:any)=>path.resolve(r.file)===path.resolve(file));
}
export function verifyFrozenFile(file:string,migration=defaultMigration) {
    const expected=entry(file,migration);assert(expected,'未登记的计划或收据');
    assert.equal(fileSha(file).toLowerCase(),expected.sha256.toLowerCase(),'冻结文件被改写');
}
export function frozenPlan(file:string,migration=defaultMigration):any[]|undefined {
    if(!fs.existsSync(file))return undefined;
    verifyFrozenFile(file,migration);return read(file);
}
export function verifyFrozenReceipt(file:string,migration=defaultMigration) {verifyFrozenFile(file,migration);}
/** 只登记本执行版本刚创建的文件，绝不重写历史身份或替已有条目换哈希。 */
export function registerFile(file:string,executionIdentity:string) {
    const registry=path.join(path.dirname(file),'PLAN_B_REGISTRY.json');
    const book=fs.existsSync(registry)?read(registry):{files:[]};
    const previous=book.files.find((r:any)=>path.resolve(r.file)===path.resolve(file));
    if(previous)assert.equal(previous.sha256,fileSha(file),'已登记文件变化');
    else book.files.push({file,sha256:fileSha(file),executionIdentity});
    save(registry,book);
}
/** 与worker实际收到的对象及其属性顺序一致，不把调度元数据纳入身份。 */
export function wireJob(job:any,id:number) {return {...job,type:'job',id};}
export function checkpointIdentity(job:any,id:number) {return sha(JSON.stringify({...wireJob(job,id),database:undefined,deadlineMs:undefined}));}
export function checkpoint(job:any,id:number) {
    if(!fs.existsSync(job.database))return undefined;
    const db=new DatabaseSync(job.database,{readOnly:true});
    try {
        const row=db.prepare('SELECT identity,value FROM progress WHERE id=1').get();
        assert(row,'数据库缺少有效断点');assert.equal(row.identity,checkpointIdentity(job,id),'训练断点身份不一致');
        const p=JSON.parse(String(row.value));
        const n=db.prepare('SELECT COUNT(*) n,MAX(step) last FROM steps').get()!;
        assert.equal(n.n,p.step);assert.equal(n.last??0,p.step);
        return p;
    }finally{db.close();}
}
export function verifyReceipt(job:any,p:any,r:any) {
    assert(p?.complete && r.result.complete,'收据与数据库完成状态不符');
    assert.equal(r.sourceIdentity,job.sourceIdentity);assert.equal(r.result.gameId,job.gameId);assert.equal(r.result.database,job.database);
    for(const k of ['step','natural','winner','validTeachers','fullRoots'])assert.equal(r.result[k],p[k]);
}
