import fs from 'node:fs';
import path from 'node:path';
import { connectSession } from './cdp.mjs';

const connection=await connectSession(process.argv[2]),kind=process.argv[3]??'copies';
const ready=await connection.evaluate(`(async()=>{
    if(document.visibilityState!=='visible')throw Error('页面未在前台');
    globalThis.stage5DiagnosticScreenLock=await navigator.wakeLock.request('screen');
    if(!globalThis.stage5DiagnosticConfig)globalThis.stage5DiagnosticConfig=await(await fetch('/config.json'+location.search)).json();
    return {visible:document.visibilityState,wakeLockHeld:!stage5DiagnosticScreenLock.released,userAgent:navigator.userAgent};
})()`);
let result;
if(kind==='copies')result=await connection.evaluate('Stage5Phone.probeRecordCopies(stage5DiagnosticConfig.rootStates[6])');
else if(kind==='components')result=await connection.evaluate(`(()=>{
    const c=stage5DiagnosticConfig,out=[];
    for(const index of [0,6,10,20]){
        const engine=new Stage5Phone.GameEngine(c.rootStates[index]);
        const tasks={clone:()=>Stage5Phone.cloneGameState(c.rootStates[index]),tokens:()=>Stage5Phone.stateTokens(engine.getState(),c.old),summary:()=>Stage5Phone.stateSummary(engine),value:()=>Stage5Phone.evaluateValue(engine,c.models.teacher_search,c.old)};
        const item={index,times:{}};
        for(const [name,run] of Object.entries(tasks)){
            for(let i=0;i<3;i++)run();const samples=[];
            for(let i=0;i<10;i++){const start=performance.now();run();samples.push(performance.now()-start);}item.times[name]=Stage5Phone.quantiles(samples);
        }
        out.push(item);
    }
    return out;
})()`);
else if(kind==='kernels')result=await connection.evaluate(`(()=>{
    const c=stage5DiagnosticConfig,weights=c.models.teacher_search.weights,floatWeights=new Float64Array(weights),x=Array(64).fill(.25),out={};
    for(const [name,w] of [['array',weights],['float64',floatWeights]]){
        const samples=[];let checksum=0;
        for(let round=0;round<8;round++){
            const start=performance.now();
            for(let repeat=0;repeat<100;repeat++){
                const y=w.slice(10,74);for(let i=0;i<64;i++)for(let j=0;j<64;j++)y[j]+=x[i]*w[100+i*64+j];checksum+=y[0];
            }
            if(round>1)samples.push(performance.now()-start);
        }
        out[name]={samples,checksum};
    }
    return out;
})()`);
else throw Error('未知诊断种类');
connection.close();
const file=path.join(connection.folder,'PROBE-'+kind+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
const report={kind,ready,result,physicalPhone:true,gamesStarted:0,diagnosticOnly:true};
fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({file,...report}));
