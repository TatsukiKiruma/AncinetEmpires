/** 统一默认字段语义后刷新受影响历史GPU摘要，手机原件摘要保持。 */
import path from 'node:path';
import {auditGpu,initialSemantics,reconcile} from './audit';
import {OUT,read,save,sha,stable,originalJobs} from './common.mjs';
const rows=read(path.join(OUT,'HISTORICAL_GPU_AUDITED.json')),updated=[];
for(const r of rows){
    const j=originalJobs.find((j:any)=>j.parentId===r.parentId),initial=read(path.join(r.localDirectory,'initial.json')).projectState;
    if(sha(stable(initialSemantics(j,initial)))!==r.initialSemanticSha256){updated.push(await auditGpu(r.localDirectory,r.runDirectory));}
    else updated.push(r);
}
save('HISTORICAL_GPU_AUDITED.json',updated);const a=reconcile([...read(path.join(OUT,'PHONE_AUDITED.json')),...updated]);save('INITIAL_RECONCILIATION.json',a);console.log(JSON.stringify(a.summary));
