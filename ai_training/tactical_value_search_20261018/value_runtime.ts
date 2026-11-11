import { GameEngine } from '../../src/game/engine';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode } from '../sd64x3_phone_20261016/model';
import { observationState } from '../tactical_scale_20261018/encoding';
import { offsets } from '../tactical_scale_20261018/model';
import { runtimeValueSummary } from './value_summary_runtime';
import { armyFeature,valueInput } from './value_input';
import { forwardValue } from './value_model';
import type { Action } from '../../src/game/types';

/** 价值叶子不需要策略候选隐藏层或寻路特征；输入与完整前向严格一致。 */
export function evaluateValue(engine:GameEngine,legal:Action[],model:any,oldSchema:any){
    const s=engine.getState(),packet=observe(observationState(s),legal),x=encode(packet,oldSchema,packet.codes.map(()=>Array(10).fill(0)));
    const o=offsets(model.schema),h=o.h,w=model.weights,context=Array(o.k).fill(0),counts=[0,0,0,0];
    x.tokens.forEach((token,t)=>{
        const values=w.slice(o.eb,o.pw);for(const [i,v] of token)for(let j=0;j<h;j++)values[j]+=v*w[i*h+j];
        const g=x.groups[t];counts[g]++;for(let j=0;j<h;j++)context[g*h+j]+=Math.max(0,values[j]);
    });
    for(let g=0;g<4;g++){for(let j=0;j<h;j++)context[g*h+j]/=Math.max(1,counts[g]);context[4*h+g]=counts[g]/1024;}
    // observe保持语义编码排序；摘要聚合对候选排列不敏感。
    const summary=runtimeValueSummary(engine,legal);
    return forwardValue(valueInput(context,summary,model,model.valueArmyFeature?armyFeature(s):undefined),model.valueWeights).value;
}
