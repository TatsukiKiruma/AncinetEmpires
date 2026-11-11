import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { encodePolicy } from './encode';
import { forwardGroup } from './group_model';
import { hierarchicalPrior } from './hierarchical_prior';
import type { Action } from '../../src/game/types';

/** 根策略只前向一次；价值头不作为策略选择的隐式副作用。 */
export function infer(engine:GameEngine,legal:Action[],model:any,oldSchema:any){
    const x=encodePolicy(engine,legal,oldSchema),out=forwardGroup(x,model),jointPrior=Array(x.codes.length).fill(0);
    const logSoftmax=(z:number[])=>{const m=Math.max(...z),s=m+Math.log(z.reduce((n,v)=>n+Math.exp(v-m),0));return z.map(v=>v-s);};
    const gp=logSoftmax(out.groupLogits);
    out.groupNames.forEach((name,g)=>{const members=x.actionGroups.map((_,i)=>i).filter(i=>x.actionGroups[i]===name),wp=logSoftmax(members.map(i=>out.logits[i]));members.forEach((i,j)=>jointPrior[i]=gp[g]+wp[j]);});
    const prior=hierarchicalPrior(x.actionGroups,out.groupNames,out.groupLogits,out.logits);
    return {x,out,prior,jointPrior};
}
export type Inference=ReturnType<typeof infer>;
export const legalActions=(engine:GameEngine)=>engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender').sort((a,b)=>encodeAction(a)<encodeAction(b)?-1:1);
export function topIndexes(root:Inference,k=6){return [root.out.best,...root.prior.map((_,i)=>i).filter(i=>i!==root.out.best).sort((a,b)=>root.prior[b]-root.prior[a]||a-b)].slice(0,k);}
