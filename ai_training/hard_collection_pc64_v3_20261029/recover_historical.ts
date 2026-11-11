/** 兼容早期结果未保存finalSha256的格式，仍要求末帧摘要等于完整终态。 */
import path from 'node:path';
import {auditGpu,reconcile} from './audit';
import {OUT,read,save} from './common.mjs';
const inventory=read(path.join(OUT,'HISTORICAL_INVENTORY.json')),gpu=read(path.join(OUT,'HISTORICAL_GPU_AUDITED.json')),done=new Set(gpu.map((r:any)=>r.parentId)),events:any[]=[];
for(const c of inventory.selected.filter((c:any)=>!done.has(c.parentId))){
    for(const candidate of [c,...inventory.candidates.filter((r:any)=>r.parentId===c.parentId&&r.directory!==c.directory)]){
        try{gpu.push(await auditGpu(candidate.directory,candidate.runDirectory));events.push({candidate: candidate.directory,status:'qualified_legacy_final_hash_checked_from_record_chain'});break;}
        catch(e){events.push({candidate:candidate.directory,error:String(e),stack:(e as Error).stack});}
    }
}
save('LEGACY_FORMAT_RECONCILIATION.json',events);save('HISTORICAL_GPU_AUDITED.json',gpu);
const a=reconcile([...read(path.join(OUT,'PHONE_AUDITED.json')),...gpu]);save('INITIAL_RECONCILIATION.json',a);console.log(JSON.stringify(a.summary));
