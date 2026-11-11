/** 版本化补缺输入：原槽逐字匹配冻结job，新槽保留独立父局、种子及谱系。 */
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,hash} from '../hard_jobs';

export function readCollectionInput(file:string){
    const input=JSON.parse(fs.readFileSync(file,'utf8'));
    if(input.schema!=='hard-collection-pc64-input-v1'||!Array.isArray(input.jobs)||!input.jobs.length||input.jobs.length>1000)throw Error('补缺输入格式不符');
    const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,'ai_training/hard_curriculum3000_execution_20261027/JOBS.json'),'utf8')).jobs as any[];
    const originals=new Map(frozen.map(j=>[j.executionSequence,j]));
    const parents=new Set(frozen.map(j=>j.parentId)),seeds=new Set(frozen.map(j=>j.seed));
    const seen=new Set<number>(),seenParents=new Set<string>(),seenSeeds=new Set<number>();
    for(const j of input.jobs){
        if(!Number.isSafeInteger(j.executionSequence)||seen.has(j.executionSequence)||seenParents.has(j.parentId)||seenSeeds.has(j.seed))throw Error('补缺输入局号、父局或种子重复');
        seen.add(j.executionSequence);seenParents.add(j.parentId);seenSeeds.add(j.seed);
        if(j.executionSequence<=3000){if(hash(j)!==hash(originals.get(j.executionSequence)))throw Error(`冻结原槽被修改：${j.executionSequence}`);}
        else{
            const origin=originals.get(j.supplementalLineage?.originalSequence);
            if(!origin||parents.has(j.parentId)||seeds.has(j.seed)||j.parentId===origin.parentId||j.seed===origin.seed||j.supplementalLineage.originalJobSha256!==hash(origin))throw Error('新槽谱系不符');
            for(const key of ['category','profile','actualPlayerCount','activeNativePlayerIds','map','mapAssetSha256','setup','maxActions','maxEffectiveSeconds','mode','requestedPlayerType','replay'])if(hash(j[key])!==hash(origin[key]))throw Error(`新槽改变课程或异常保护：${key}`);
            if(j.state&&hash(j.state)!==j.initialStateSha256)throw Error('新槽初态摘要不符');
        }
        const offset=input.attemptOffsets?.[j.executionSequence]??0;
        if(!Number.isInteger(offset)||offset<0||offset>=3)throw Error('本机版本化attempt预算已耗尽');
    }
    return {jobs:input.jobs as any[],attemptOffsets:input.attemptOffsets??{}};
}
