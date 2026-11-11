/** 盘点历史GPU尝试，按真实父局选静态检查候选，重复性能副本只保留引用。 */
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,OUT,read,save,fileSha,hash,originalJobs,runsUnder,phoneFile,tally} from './common.mjs';
const byParent=new Map(originalJobs.map(j=>[j.parentId,j])),candidates=[],failures=[],runs=[];
for(const d of runsUnder(path.join(ROOT,'ai_training/hard_replica_gpu_20261029'))){
    const run=read(path.join(d,'RUN.json'));runs.push({directory:d,runSha256:fileSha(path.join(d,'RUN.json')),source:run.source,backend:run.backend,native:run.native,repeatFirst:run.repeatFirst,locked:fs.existsSync(path.join(d,'RUNNING.lock')),stopped:fs.existsSync(path.join(d,'STOP'))});
    for(const parent of fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('parent-'))){
        const base=path.join(d,parent.name);
        for(const attempt of fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^attempt-\d+$/.test(e.name))){
            const directory=path.join(base,attempt.name),f=path.join(directory,'result.json');if(!fs.existsSync(f))continue;
            const r=read(f),job=read(path.join(directory,'job.json')),origin=byParent.get(job.parentId);
            const row={directory,runDirectory:d,resultSha256:fileSha(f),jobSha256:hash(job),executionSequence:origin?.executionSequence,parentId:job.parentId,recordedSequence:job.executionSequence,seed:job.seed,steps:r.steps,natural:r.natural,stop:r.stop,error:r.error,source:r.source,native:run.native??false,benchmark:run.benchmark??false,replica:job.benchmarkReplica??null};
            if(r.natural&&!r.error&&r.source==='project-apk-hard-replica-gpu'&&origin)candidates.push(row);else failures.push(row);
        }
    }
}
const grouped=new Map();for(const c of candidates){const a=grouped.get(c.parentId)??[];a.push(c);grouped.set(c.parentId,a);}
const selected=[...grouped.values()].map(a=>a.sort((x,y)=>Number(y.native)-Number(x.native)||Number(x.replica!==null)-Number(y.replica!==null)||y.directory.localeCompare(x.directory))[0]);
const phone=read(phoneFile),done=new Set([...phone.map(p=>p.parentId),...selected.map(p=>p.parentId)]);
save('HISTORICAL_INVENTORY.json',{created:new Date().toISOString(),runs,candidates,selected,failures,summary:{runs:runs.length,gpuNaturalCopies:candidates.length,gpuCandidateParents:selected.length,phoneParents:phone.length,originalOutstanding:originalJobs.filter(j=>!done.has(j.parentId)).length,byCategory:tally(selected,r=>byParent.get(r.parentId).category)}});
console.log(JSON.stringify({runs:runs.length,naturalCopies:candidates.length,candidateParents:selected.length,remaining:originalJobs.filter(j=>!done.has(j.parentId)).length,locked:runs.filter(r=>r.locked),selectedRanges:[Math.min(...selected.map(r=>r.executionSequence)),Math.max(...selected.map(r=>r.executionSequence))]}));
