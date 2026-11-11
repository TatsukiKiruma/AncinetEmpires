import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { encodeEngine } from './encode';
import { forwardGroup } from './group_model';
import { forwardValue } from './value_model';
import { valueInput } from './value_input';
import type { Action } from '../../src/game/types';
const logSoftmax=(z:number[])=>{const max=Math.max(...z),lse=max+Math.log(z.reduce((s,v)=>s+Math.exp(v-max),0));return z.map(v=>v-lse);};
export function infer(engine:GameEngine,legal:Action[],model:any,oldSchema:any){
    const x=encodeEngine(engine,legal,oldSchema,!!model.valueArmyFeature),out=forwardGroup(x,model),gp=logSoftmax(out.groupLogits),prior=Array(x.codes.length).fill(0);
    out.groupNames.forEach((name,g)=>{const members=x.actionGroups.map((_,i)=>i).filter(i=>x.actionGroups[i]===name),within=logSoftmax(members.map(i=>out.logits[i]));members.forEach((i,k)=>prior[i]=gp[g]+within[k]);});
    const value=forwardValue(valueInput(out.context,x.valueSummary,model,x.valueArmy),model.valueWeights).value;
    return {x,out,prior,value};
}
export type Inference=ReturnType<typeof infer>;
export function legalActions(engine:GameEngine){return engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender').sort((a,b)=>encodeAction(a)<encodeAction(b)?-1:encodeAction(a)>encodeAction(b)?1:0);}

/** 保留分层默认选择；余下候选按联合路径概率稳定排序。 */
export function topIndexes(result:Inference,k:number){return [result.out.best,...result.prior.map((_,i)=>i).filter(i=>i!==result.out.best).sort((a,b)=>result.prior[b]-result.prior[a]||a-b)].slice(0,k);}
