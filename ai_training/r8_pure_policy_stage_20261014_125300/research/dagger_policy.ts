// 仅用于DAgger采集的教师roll-in；严禁将这个worker用于纯模型DEV/FINAL。
import {policy as basePolicy} from './policy';import {RNG} from './common';
export function policy(cfg:any,seed:number,seat:number){
 const base=basePolicy(cfg,seed,seat);const probability=cfg.rollInProbability??0;if(!probability)return base;
 if(cfg.type!=='model'||probability<0||probability>1)throw Error('非法DAgger roll-in配置');
 const rng=new RNG(seed^0x83e105af),teacher=basePolicy({type:'heuristic'},seed^0x591bed27,seat);let modelDecisions=0,teacherDecisions=0;
 return {rng,act:(state:any,legal:any[])=>{if(rng.next()<probability){teacherDecisions++;return teacher.act(state,legal);}modelDecisions++;return base.act(state,legal);},diagnostics:()=>({collectionOnly:true,behavior:'DAgger教师roll-in',probability,modelDecisions,teacherDecisions,teacherRng:teacher.rng.snapshot()})};
}
