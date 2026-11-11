/** 新父局独立生成；原输入保持冻结，派生预设的改动逐字段留痕。 */
import {createJobState} from '../gpu/hard_jobs';
import {APK_UNIT_CLASS_TO_ID} from '../../src/game/apk_compat';
import {hash,originalJobs} from './common.mjs';

export function makeSupplement(origin:any,index:number){
    const job=structuredClone(origin),sequence=3000+index,parentId=`hc7-pc64-20261029-extra-${String(index).padStart(5,'0')}`;
    Object.assign(job,{executionSequence:sequence,parentId,designSlotId:parentId,seed:2041000000+index,batch:4,device:'pc-gpu',observation:false,jsRngMode:'project_seeded_mulberry32_per_player'});
    const changes:any[]=[];
    if(job.state){
        // 各类预设保持地图、编成和技能机会；小幅变化初始资源及生命以产生可追溯新局面。
        for(const p of job.state.players){const before=p.gold;p.gold+=50*(1+(index+p.id)%4);changes.push({field:`players/${p.id}/gold`,before,after:p.gold});}
        for(let i=0;i<job.state.units.length;i++){const u=job.state.units[i],before=u.hp;u.hp=Math.max(1,u.hp-1-(index+i)%3);changes.push({field:`units/${i}/hp`,before,after:u.hp});}
        job.initialStateSha256=hash(job.state);
    }
    job.supplementalLineage={originalSequence:origin.executionSequence,originalParentId:origin.parentId,originalSeed:origin.seed,originalJobSha256:hash(origin),originalInitialStateSha256:origin.initialStateSha256,reason:'补足失败、截断或重复后的同类别人数层缺口',changes,normalAndParameterInitialStateRetained:!job.state};
    createJobState(job);
    return job;
}
