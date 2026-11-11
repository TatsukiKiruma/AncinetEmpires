import { forwardGroup } from './group_model';
import { read, save } from './io';
const name=process.argv[2]??'initial',model=read(`group-${name}.json`),inputs=read('group-inputs.json'),reference=read(`group-python-${name}.json`);
let maxForwardError=0,maxGradientError=0,maxLossError=0,argmax=true;
const outputs=inputs.map((x:any)=>forwardGroup(x,model,true));
inputs.forEach((x:any,i:number)=>{
    const out=outputs[i],expected=reference.out[i];
    const inference=forwardGroup(x,model);
    for(const key of ['logits','groupLogits'] as const)out[key].forEach((v,j)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-expected[key][j])));
    for(const key of ['logits','groupLogits'] as const)inference[key].forEach((v,j)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-expected[key][j])));
    maxForwardError=Math.max(maxForwardError,Math.abs(out.value-expected.value));
    maxLossError=Math.max(maxLossError,Math.abs(out.loss-expected.loss));
    out.gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-expected.gradient[j])));
    argmax&&=out.best===expected.best&&inference.best===expected.best;
});
for(const batch of reference.batchChecks){
    const weight=(i:number)=>inputs[i].weight*(inputs[i].actionGroups[inputs[i].target].endsWith('|wait')?(model.schema.waitTargetWeight??1):1);
    const total=batch.indexes.reduce((s:number,i:number)=>s+weight(i),0),gradient=Array(outputs[0].gradient.length).fill(0);let loss=0;
    batch.indexes.forEach((i:number,j:number)=>{
        const ratio=weight(i)/total,out=outputs[i];loss+=out.loss*ratio;
        out.gradient.forEach((v,k)=>gradient[k]+=v*ratio);
        for(const key of ['logits','groupLogits'] as const)out[key].forEach((v,k)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-batch.out[j][key][k])));
        argmax&&=out.best===batch.out[j].best;
    });
    gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-batch.gradient[j])));maxLossError=Math.max(maxLossError,Math.abs(loss-batch.loss));
}
const result={passed:maxForwardError<1e-8&&maxGradientError<1e-8&&maxLossError<1e-8&&argmax,probes:inputs.length,maxForwardError,maxGradientError,maxLossError,argmax,batchParity:true,batchSizes:reference.batchChecks.map((b:any)=>b.size)};
save(`group-numeric-${name}.json`,result);console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
