import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { movingThreat as reference,beginThreatScope as oldBegin,movingThreatExhaustive as oldFull } from '../tactical_scale_20261018/threat';
import { movingThreat,beginThreatScope,movingThreatExhaustive } from './shared_single_threat';
import { read,save,hash } from './io';
const states=[...read('browser-states.json').map((v:any)=>v.state),...read('expert-roots.json').roots.map((v:any)=>read(v.path)),...read('final-battle-plan.json').maps.slice(5).map((v:any)=>read(v.path))];
let targets=0,witnessActions=0;
for(const [i,s] of states.entries())for(const mode of ['cold','warm']){
    const e=new GameEngine(s),state=e.getState(),before=hash(state),units=state.units.filter(u=>u.ownerId!==state.currentPlayer);
    oldBegin();beginThreatScope();
    for(const full of [false,true]){
        const expected=(full?oldFull:reference)(e,units),actual=(full?movingThreatExhaustive:movingThreat)(e,units);
        assert.deepEqual(actual,expected,i+'/'+mode+'/'+full);targets+=units.length;assert.equal(hash(e.getState()),before);
        for(const r of actual.values())if(r.witness){const w=r.witness as any,b=e.clone();for(const a of [...(w.move?[w.move]:[]),w.attack]){assert.ok(b.getLegalActions(b.getState().currentPlayer).some(v=>encodeAction(v)===encodeAction(a)));assert.ok(!b.step(a).info.includes('非法动作'));witnessActions++;}}
    }
}
save('revisions/r19/shared-single-gate.json',{passed:true,states:states.length,targets,witnessActions,fullAndOptimizedExact:true,engineUnchanged:true,coldWarmExact:true});console.log({passed:true,states:states.length,targets,witnessActions});
