import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { decodeAction,encodeAction } from '../../src/game/env';
import { encodeEngine } from './encode';
import { compare } from './numeric';
import { read,save,hash } from './io';
import { beginFocusScope,focusThreat } from './focus_threat';
const mode=process.argv[2]??'probes',name=process.argv[3]??'initial';
if(mode==='probes'){
    const states=read('../tactical_scale_20261018/browser-states.json'),old=read('../tactical_scale_20261018/old-schema.json'),prior=read('../tactical_scale_20261018/group-inputs.json');
    const inputs=states.map((item:any,i:number)=>{
        const engine=new GameEngine(item.state),before=hash(engine.getState()),x=encodeEngine(engine,item.codes.map(decodeAction),old);
        assert.equal(hash(engine.getState()),before);assert.deepEqual(x.codes,prior[i].codes);
        const clean=(r:[number,number][])=>r.filter(([i,v])=>i<141&&v!==0).sort((a,b)=>a[0]-b[0]);
        assert.deepEqual(x.candidates.map(clean),prior[i].candidates.map(clean));
        return {...x,actions:undefined,target:prior[i].target,weight:prior[i].weight,valueMask:i%3!==0,valueTarget:i%3!==0?(i%2?1:-1):null};
    });
    save('inputs.json',inputs);save('browser-states.json',states);save('old-schema.json',old);
    let verified=0,multi=0;
    for(const item of states){
        const engine=new GameEngine(item.state);beginFocusScope();
        for(const target of item.state.units.filter((u:any)=>u.ownerId!==item.state.currentPlayer).slice(0,2)){
            const r=focusThreat(engine,target.id),b=engine.clone(),attackers=new Set();
            for(const a of r.witness){const legal=b.getLegalActions(b.getState().currentPlayer);assert.ok(legal.some(v=>encodeAction(v)===encodeAction(a)));assert.ok(!b.step(a).info.includes('非法动作'));if(a.type==='attack'){assert.ok(!attackers.has(a.attackerId));attackers.add(a.attackerId);}}
            const hp=b.getState().units.find(u=>u.id===target.id)?.hp??0;assert.equal(r.damage,Math.max(0,target.hp-hp));assert.equal(r.lethal,Number(!b.getState().units.some(u=>u.id===target.id)));verified++;multi+=Number(r.attackers>=2);
        }
    }
    save('feature-gate.json',{passed:true,states:states.length,oldColumnsUnchanged:141,focusWitnesses:verified,multiUnitWitnesses:multi});
}else{
    const model=read(`numeric-model-${name}.json`),result=compare(read(model.valueArmyFeature?'inputs-army.json':'inputs.json'),read(`python-${name}.json`),model);save(`numeric-${name}.json`,result);console.log(result);assert.ok(result.passed);
}
