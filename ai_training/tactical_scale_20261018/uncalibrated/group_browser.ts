import { forwardGroup } from './group_model';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { extractFeatures } from './complete_tactics';
import { observationState, encodeFeatures } from './encoding';

async function main(){
    const name=new URL(location.href).searchParams.get('model')??'initial';
    const fileSha256:Record<string,string>={};
    const load=async(file:string)=>{
        const r=await fetch(file);if(!r.ok)throw Error(file);const text=await r.text();
        fileSha256[file]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');
        return JSON.parse(text);
    };
    const [model,inputs,reference,states,oldSchema]=await Promise.all([load(`group-${name}.json`),load('group-inputs.json'),load(`group-python-${name}.json`),load('browser-states.json'),load('old-schema.json')]);
    let maxForwardError=0,maxGradientError=0,maxLossError=0,argmax=true,encodingMismatches=0;
    const outputs:ReturnType<typeof forwardGroup>[]=[];
    for(let i=0;i<inputs.length;i++){
        const item=states[i],x=inputs[i],engine=new GameEngine(item.state),packet=observe(observationState(item.state),item.codes.map(decodeAction));
        const encoded=encodeFeatures(packet,oldSchema,extractFeatures(engine,packet.codes.map(decodeAction)));
        for(const key of ['tokens','groups','candidates','refs','codes'] as const)if(JSON.stringify(encoded[key])!==JSON.stringify(x[key]))encodingMismatches++;
        const out=forwardGroup({...encoded,actionGroups:x.actionGroups,target:x.target} as any,model,true),expected=reference.out[i];
        outputs.push(out);
        const inference=forwardGroup({...encoded,actionGroups:x.actionGroups} as any,model);
        for(const key of ['logits','groupLogits'] as const)out[key].forEach((v,j)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-expected[key][j])));
        for(const key of ['logits','groupLogits'] as const)inference[key].forEach((v,j)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-expected[key][j])));
        maxForwardError=Math.max(maxForwardError,Math.abs(out.value-expected.value));maxLossError=Math.max(maxLossError,Math.abs(out.loss-expected.loss));
        out.gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-expected.gradient[j])));argmax&&=out.best===expected.best&&inference.best===expected.best;
    }
    for(const batch of reference.batchChecks){
        const total=batch.indexes.reduce((s:number,i:number)=>s+inputs[i].weight,0),gradient=Array(model.weights.length).fill(0);let loss=0;
        batch.indexes.forEach((i:number,j:number)=>{
            const ratio=inputs[i].weight/total,out=outputs[i];loss+=out.loss*ratio;out.gradient.forEach((v,k)=>gradient[k]+=v*ratio);
            for(const key of ['logits','groupLogits'] as const)out[key].forEach((v,k)=>maxForwardError=Math.max(maxForwardError,Math.abs(v-batch.out[j][key][k])));
            argmax&&=out.best===batch.out[j].best;
        });
        gradient.forEach((v,j)=>maxGradientError=Math.max(maxGradientError,Math.abs(v-batch.gradient[j])));maxLossError=Math.max(maxLossError,Math.abs(loss-batch.loss));
    }
    const result={passed:maxForwardError<1e-8&&maxGradientError<1e-8&&maxLossError<1e-8&&argmax&&encodingMismatches===0,probes:inputs.length,maxForwardError,maxGradientError,maxLossError,argmax,encodingMismatches,batchParity:true,batchSizes:reference.batchChecks.map((b:any)=>b.size),rawStatesReencoded:true,fileSha256,userAgent:navigator.userAgent};
    document.body.textContent=JSON.stringify(result,null,2);await fetch('/complete',{method:'POST',body:JSON.stringify(result)});
}
main().catch(async e=>{const result={passed:false,error:String(e)};document.body.textContent=JSON.stringify(result);await fetch('/complete',{method:'POST',body:JSON.stringify(result)});});
