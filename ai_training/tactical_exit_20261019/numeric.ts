import { forwardGroup } from './group_model';
import { forwardValue } from '../tactical_value_search_20261018/value_model';
import { valueInput } from './value_state';

export function combined(x:any,model:any,gradient=false){
    const policy=forwardGroup(x,model,gradient),v=forwardValue(valueInput(policy.context,x.valueSummary),model.valueWeights,x.valueTarget??0,gradient&&x.valueMask);
    return {...policy,value:v.value,loss:policy.loss+(x.valueMask?v.loss:0),gradient:gradient?[...policy.gradient,...(x.valueMask?v.gradient:Array(model.valueWeights.length).fill(0))]:[]};
}
export function compare(inputs:any[],reference:any,model:any){
    let maxForwardError=0,maxGradientError=0,maxLossError=0,argmax=true;
    const outputs=inputs.map(x=>combined(x,model,true));
    outputs.forEach((out,i)=>{
        const expected=reference.out[i],inference=combined(inputs[i],model);
        for(const key of ['logits','groupLogits'] as const)for(const v of [out,inference])v[key].forEach((n,j)=>maxForwardError=Math.max(maxForwardError,Math.abs(n-expected[key][j])));
        maxForwardError=Math.max(maxForwardError,Math.abs(out.value-expected.value));maxLossError=Math.max(maxLossError,Math.abs(out.loss-expected.loss));
        if(out.gradient.length!==expected.gradient.length)throw Error('梯度长度不同');
        out.gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-expected.gradient[j])));argmax&&=out.best===expected.best&&inference.best===expected.best;
    });
    for(const batch of reference.batchChecks){
        const rows=batch.indexes.map((i:number,j:number)=>({...inputs[i],...(batch.rowOverrides?.[j]??{})}));
        const actual=batch.rowOverrides?rows.map((r:any)=>combined(r,model,true)):batch.indexes.map((i:number)=>outputs[i]);
        const weights=rows.map((r:any)=>r.weight*(batch.winningWeighted&&r.valueMask&&r.valueTarget===1?1.5:1));
        const total=weights.reduce((s:number,v:number)=>s+v,0),gradient=Array(outputs[0].gradient.length).fill(0);let loss=0;
        actual.forEach((out:any,i:number)=>{const ratio=weights[i]/total;loss+=out.loss*ratio;out.gradient.forEach((v:number,j:number)=>gradient[j]+=v*ratio);});
        gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-batch.gradient[j])));maxLossError=Math.max(maxLossError,Math.abs(loss-batch.loss));
    }
    return {passed:maxForwardError<1e-8&&maxGradientError<1e-8&&maxLossError<1e-8&&argmax,probes:inputs.length,maxForwardError,maxGradientError,maxLossError,argmax,batchSizes:reference.batchChecks.map((b:any)=>b.size),expertBatchChecks:reference.batchChecks.filter((b:any)=>b.rowOverrides).length,allParameters:true,frozenContext:true};
}
