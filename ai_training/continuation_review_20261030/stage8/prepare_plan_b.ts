import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {here,root,read,save,fileSha} from './io';
const archive=path.join(here,'revisions/plan-b-20261110');
const baseline=read(path.join(archive,'AUDIT.json'));
const prefix=read(path.join(archive,'PREFIX_REPLAY.json'));assert(prefix.passed&&prefix.checked.length===7);
// 原始计划与已完成收据逐文件精确迁移；不改变历史sourceIdentity。
for(const f of baseline.files)assert.equal(fileSha(f.file),f.sha256);
const changed=['collect.ts','worker_pool.ts','league_game.ts','league_worker.ts','resume_plan.ts','run.ts','io.ts','cut_rotation.ts'];
save(path.join(here,'SCHEDULER_MIGRATION.json'),{revision:'plan-b',authorizedScope:'同代共享队列与只读观测；不改变游戏、模型、搜索参数、持久化和实验规模',
    beforeAuditSha256:fileSha(path.join(archive,'AUDIT.json')),previousSourceLockSha256:baseline.previousSourceLockSha256,
    allowedInheritedSourceIdentities:[...new Set(baseline.tasks.map((t:any)=>t.sourceIdentity))],files:baseline.files,tasks:baseline.tasks,
    sourceChanges:changed.map(file=>({file,before:fileSha(path.join(archive,file+'.before.txt')),after:fileSha(path.join(here,file))})),
    sealedAccess:0,scope:'仅精确登记的旧文件可继承，未知或篡改文件拒绝'});
const dirs=[path.join(root,'src'),here,path.join(here,'../stage7')];
const files=dirs.flatMap(dir=>fs.readdirSync(dir,{recursive:true,withFileTypes:true}).filter(f=>f.isFile()&&/\.(?:ts|tsx|py|mjs)$/.test(f.name)).map(f=>path.join(f.parentPath,f.name))).sort();
const current=Object.fromEntries(files.map(file=>[path.relative(root,file),fileSha(file)]));
const old=read(path.join(archive,'SOURCE_LOCK.json.before.txt'));
const differences=Object.keys(current).filter(file=>current[file]!==old[file]);
assert(differences.every(file=>file.replaceAll('\\','/').startsWith('ai_training/continuation_review_20261030/stage8/')),'存在本次范围外源码变更');
save(path.join(here,'SOURCE_LOCK.json'),current);
save(path.join(here,'PLAN_B_SOURCE_TRANSITION.json'),{differences,migrationSha256:fileSha(path.join(here,'SCHEDULER_MIGRATION.json')),sourceLockSha256:fileSha(path.join(here,'SOURCE_LOCK.json')),publicSourceUnchanged:true});
console.log(JSON.stringify({registeredFiles:baseline.files.length,sourceChanges:differences.length,preservedComplete:baseline.completed,preservedPending:baseline.pending.length}));
