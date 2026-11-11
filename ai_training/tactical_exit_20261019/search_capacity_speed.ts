import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameEngine } from '../../src/game/engine';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { SEARCH_MAX_OWN_NODES,SEARCH_TOP_K } from './search_budget';
import { read,save,quantiles,sha } from './io';
const states=[...read('browser-states.json').map((v:any)=>v.state),read('teacher-r16-root-coverage-gate.json').state],model=read('teacher-model.json'),old=read('old-schema.json'),times:number[]=[];
let nodes=0,roots=0;
for(const state of states){
    const engine=new GameEngine(state);
    for(let repeat=0;repeat<3;repeat++){
        const ai=new ModelBattleSearchAI(model,old),started=performance.now();ai.getAction(engine,state.currentPlayer);const ms=performance.now()-started;
        assert.ok(ai.lastDecision.nodes<=SEARCH_MAX_OWN_NODES&&ai.lastDecision.branchPolicyCalls===0);nodes=Math.max(nodes,ai.lastDecision.nodes);roots=Math.max(roots,ai.lastDecision.traces.length);
        if(repeat)times.push(ms);
    }
}
const latency=quantiles(times),result={passed:latency.p95<=500,coreSha256:sha(fs.readFileSync(new URL('./model_battle_search_ai.ts',import.meta.url))),budgetSha256:sha(fs.readFileSync(new URL('./search_budget.ts',import.meta.url))),topK:SEARCH_TOP_K,maximumOwnNodes:SEARCH_MAX_OWN_NODES,maximumObservedNodes:nodes,maximumObservedRoots:roots,states:states.length,latency,fullRootEncodingIncluded:true,branchPolicyCalls:0,scope:'单进程完整根探针，不替代固定四进程完整面板p95、胜率与0超时门禁'};save('search-capacity-speed-gate.json',result);console.log(result);assert.ok(result.passed);
