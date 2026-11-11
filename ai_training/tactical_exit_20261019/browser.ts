import { compare } from './numeric';
import { encodeEngine } from './encode';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { evaluateValue } from './value_state';
async function main(){
    const name=new URL(location.href).searchParams.get('model')??'initial',fileSha256:Record<string,string>={};
    const load=async(file:string)=>{const r=await fetch(file);if(!r.ok)throw Error(file);const text=await r.text();fileSha256[file]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');return JSON.parse(text);};
    const model=await load(`numeric-model-${name}.json`),[inputs,reference,states,old]=await Promise.all([load('inputs.json'),load(`python-${name}.json`),load('browser-states.json'),load('old-schema.json')]);
    let mismatches=0,maxStandaloneValueError=0;
    const actual=inputs.map((x:any,i:number)=>{const item=states[i],engine=new GameEngine(item.state),encoded=encodeEngine(engine,item.codes.map(decodeAction),old);for(const key of ['tokens','groups','candidates','refs','codes','valueSummary'])if(JSON.stringify(encoded[key as keyof typeof encoded])!==JSON.stringify(x[key]))mismatches++;for(let repeat=0;repeat<3;repeat++)maxStandaloneValueError=Math.max(maxStandaloneValueError,Math.abs(evaluateValue(engine,model,old)-reference.out[i].value));return {...x,...encoded};});
    const result={...compare(actual,reference,model),encodingMismatches:mismatches,rawStatesReencoded:true,maxStandaloneValueError,standaloneValueColdWarmChecks:states.length*3,fileSha256,userAgent:navigator.userAgent};result.passed&&=mismatches===0&&maxStandaloneValueError<1e-8;
    document.body.textContent=JSON.stringify(result);await fetch('/complete',{method:'POST',body:JSON.stringify(result)});
}
main().catch(async e=>{await fetch('/complete',{method:'POST',body:JSON.stringify({passed:false,error:String(e)})});});
