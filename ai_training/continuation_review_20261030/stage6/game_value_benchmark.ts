import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {GameEngine} from '../../../src/game/engine';
import {encodeDualObservation} from '../../../src/ai_runtime/dual_v2/encoder';
import {Stage4InferenceClient} from './arena_client';
import {HERE,read,fileSha,sha} from './arena_io';
import {writeNew} from './storage';

// 固定同一已完成开发对局的全部模型决策前态，排除搜索改变走法和局长造成的计时混淆。
const source='D:/AncientEmpiresData/continuation_stage5_20261104_v1/development-v2/C1/p2-0-s0/p2-0-s0';
const initial=read(path.join(source,'INITIAL.json')), engine=new GameEngine(initial.state,initial.engineOptions);
const steps=gunzipSync(fs.readFileSync(path.join(source,'steps.jsonl.gz'))).toString().trim().split('\n').map(s=>JSON.parse(s));
const states=[];
for(const row of steps) {
    const state=engine.getState();
    if(sha(JSON.stringify(state))!==row.before||!engine.hasLegalAction(state.currentPlayer,row.action))throw Error('基准回放不符');
    if(row.side==='model')states.push(state);
    engine.step(row.action);
    if(sha(JSON.stringify(engine.getState()))!==row.after)throw Error('基准后态不符');
}
const client=new Stage4InferenceClient(read(path.join(HERE,'config-C1.json')).modelPrefix);
let fullMs=0,valueMs=0,maxAbs=0;
try {
    const warm=encodeDualObservation(states[0],new GameEngine(states[0],{applyInitialTurnStart:false}).getLegalActions(states[0].currentPlayer));
    await client.forwardBatch([warm]);
    for(let start=0;start<states.length;start+=8) {
        const batch=states.slice(start,start+8);
        const results:any[]=[];
        // 两种路径交替先后，减少缓存预热及后台负载对单侧计时的偏置。
        for(const valueOnly of Math.floor(start/8)%2?[true,false]:[false,true]) {
            const tick=performance.now();
            const obs=batch.map(s=>encodeDualObservation(s,valueOnly?[]:new GameEngine(s,{applyInitialTurnStart:false}).getLegalActions(s.currentPlayer).filter(a=>a.type!=='surrender')));
            const out=await client.forwardBatch(obs,{deadline:performance.now()+120000,valueOnly});
            const elapsed=performance.now()-tick;
            if(valueOnly)valueMs+=elapsed;else fullMs+=elapsed;
            results[Number(valueOnly)]=out;
        }
        batch.forEach((_,i)=>{for(let k=0;k<6;k++)maxAbs=Math.max(maxAbs,Math.abs(results[0][i].valueProbs[k]-results[1][i].valueProbs[k]));});
    }
}finally{await client.close();}
writeNew(path.join(HERE,'SINGLE_GAME_VALUE_BENCHMARK.json'),{source,sourceSha256:fileSha(path.join(source,'steps.jsonl.gz')),actions:steps.length,modelStates:states.length,fullMs,valueMs,speedup:fullMs/valueMs,reduction:1-valueMs/fullMs,maxAbs,parityPassed:maxAbs<1e-6,gpuExited:client.exited,sealedAccess:0,scope:'单局固定轨迹的完整编码/前向对比纯价值编码/前向；不等同于限时搜索整局墙钟加速'});
console.log(JSON.stringify({fullMs,valueMs,maxAbs,states:states.length}));
