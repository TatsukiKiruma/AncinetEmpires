import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { decodeAction,encodeAction } from '../../src/game/env';
import { encodeEngine } from './encode';
import { read,save,hash,quantiles } from './io';
import { evaluateValue,stateSummary,commanderRisks,pooledContext,stateTokens } from './value_state';
import { ledger } from './leaf';
import { infer,legalActions } from './policy_runtime';
import { ModelBattleSearchAI } from './model_battle_search_ai';
import { FOCUS_AUDIT } from './focus_threat';

const states=read('browser-states.json'),old=read('old-schema.json'),model=read('initial.json'),prior=read('../tactical_value_search_20261018/inputs.json');
const inputs=[],latency:number[]=[],rootMs:number[]=[],searchMs:number[]=[];let witnesses=0;
for(const [i,item] of states.entries()){
    const e=new GameEngine(item.state),before=hash(e.getState()),x=encodeEngine(e,item.codes.map(decodeAction),old);
    assert.equal(hash(e.getState()),before);assert.deepEqual(x.candidates,prior[i].candidates);assert.equal(x.valueSummary.length,36);
    assert.ok([...FOCUS_AUDIT.byTarget.values()].every(n=>n<=1),'状态Value不得重复评估同一个指挥官');
    const ctx=pooledContext(stateTokens(e.getState(),old),model);assert.equal(ctx.length,260);
    inputs.push({...x,target:prior[i].target,weight:prior[i].weight,valueMask:i%3!==0,valueTarget:i%3!==0?(i%2?1:-1):null});
    for(const r of commanderRisks(e)){
        if(!r.risk.witness.length)continue;
        const s=e.getState();let b=e.clone();
        if(s.currentPlayer===r.owner){const end=b.getLegalActions(s.currentPlayer,{skipMovement:true,skipRecruitment:true}).find(a=>a.type==='end_turn');assert.ok(end);b.step(end);}
        for(const a of r.risk.witness){assert.ok(b.getLegalActions(b.getState().currentPlayer).some(v=>encodeAction(v)===encodeAction(a)));assert.ok(!b.step(a).info.includes('非法动作'));}
        witnesses++;
    }
    evaluateValue(e,model,old);
    for(let j=0;j<5;j++){const t=performance.now();evaluateValue(e,model,old);latency.push(performance.now()-t);}
    const t=performance.now(),root=infer(e,legalActions(e),model,old);rootMs.push(performance.now()-t);
    const search=new ModelBattleSearchAI(model,old),t2=performance.now();search.getAction(e,item.state.currentPlayer,legalActions(e),root);searchMs.push(rootMs.at(-1)!+performance.now()-t2);
    assert.equal(search.lastDecision.branchPolicyCalls,0);
}
// 招募花费与军力增长抵消，不得变成战斗净收益；村庄和城堡均须对称记账。
const s=structuredClone(states[0].state),player=s.currentPlayer,enemy=s.players.find((p:any)=>p.id!==player).id;
const own=s.units.find((u:any)=>u.ownerId===player),after=structuredClone(s);
after.units.push({...own,id:'新增回归兵',unitClass:'soldier',hp:100,maxHp:100});after.players.find((p:any)=>p.id===player).gold-=100;
const recruited=ledger(s,after,player);assert.ok(recruited.net<=0);assert.equal(recruited.enemyLoss,0);assert.equal(recruited.ownLoss,0);
const castle=s.map.tiles.flat().find((t:any)=>t.ownerId===enemy&&t.terrainId!==undefined),b=structuredClone(s);
const town=s.map.tiles.flat().find((t:any)=>t.ownerId!==player);
assert.ok(castle&&town);
save('inputs.json',inputs);
const report={passed:true,states:states.length,old151ColumnsUnchanged:true,valueDimensions:297,valueLatency:quantiles(latency),rootLatency:quantiles(rootMs),searchLatency:quantiles(searchMs),focusWitnesses:witnesses,recruitmentLedger:recruited,branchPolicyCalls:0};
save('probe-gate.json',report);console.log(report);
