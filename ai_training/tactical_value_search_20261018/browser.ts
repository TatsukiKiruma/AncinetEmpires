import { compare } from './numeric';
import { encodeEngine } from './encode';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
async function main(){
    const name=new URL(location.href).searchParams.get('model')??'initial',fileSha256:Record<string,string>={};
    const load=async(file:string)=>{const r=await fetch(file);if(!r.ok)throw Error(file);const text=await r.text();fileSha256[file]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');return JSON.parse(text);};
    const model=await load(`numeric-model-${name}.json`);
    const [inputs,reference,states,old]=await Promise.all([load(model.valueArmyFeature?'inputs-army.json':'inputs.json'),load(`python-${name}.json`),load('browser-states.json'),load('old-schema.json')]);
    let mismatches=0;const actual=inputs.map((x:any,i:number)=>{const item=states[i],encoded=encodeEngine(new GameEngine(item.state),item.codes.map(decodeAction),old,!!model.valueArmyFeature);for(const key of ['tokens','groups','candidates','refs','codes','valueSummary',...(model.valueArmyFeature?['valueArmy']:[])])if(JSON.stringify(encoded[key as keyof typeof encoded])!==JSON.stringify(x[key]))mismatches++;return {...x,...encoded};});
    const result={...compare(actual,reference,model),encodingMismatches:mismatches,rawStatesReencoded:true,fileSha256,userAgent:navigator.userAgent};result.passed&&=mismatches===0;
    document.body.textContent=JSON.stringify(result);await fetch('/complete',{method:'POST',body:JSON.stringify(result)});
}
main().catch(async e=>{await fetch('/complete',{method:'POST',body:JSON.stringify({passed:false,error:String(e)})});});
