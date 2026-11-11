import type {GameState} from '../../src/game/types';
import type {Inference} from './policy_runtime';

/** 收尾只补一个已有根特征提示安全且有后续收益的空城新兵，不改变评分或预算。 */
export function coverSafeRecruitment(before:GameState,root:Inference,indexes:number[],originalCount:number):number[]{
    const preferred=root.x.actions[root.out.best];
    if(!['wait','end_turn'].includes(preferred.type)||indexes.length<=originalCount)return indexes;
    const usable=(i:number)=>{
        const a=root.x.actions[i],f=root.x.focus[i],v=root.x.extra[i];
        if(a.type!=='recruit_to_castle'||before.units.some(u=>u.pos.x===a.castlePos.x&&u.pos.y===a.castlePos.y))return false;
        return !!f[7]&&!f[1]&&!f[5]&&(v[0]>0||!!v[1]||!!v[2]||!!v[3]);
    };
    if(indexes.some(usable))return indexes;
    const present=new Set(indexes),candidate=root.prior.map((_,i)=>i).filter(i=>!present.has(i)&&usable(i)).sort((a,b)=>root.prior[b]-root.prior[a]||a-b)[0];
    if(candidate===undefined)return indexes;
    return [...indexes.slice(0,-1),candidate];
}
