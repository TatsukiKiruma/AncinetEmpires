import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import * as current from './focus_threat';
import * as reference from './focus_threat_reference';
import { read,save } from './io';
let targets=0,multi=0;
for(const item of read('browser-states.json')){
    const engine=new GameEngine(item.state);current.beginFocusScope();reference.beginFocusScope();
    for(const target of item.state.units.filter((u:any)=>u.ownerId!==item.state.currentPlayer)){
        const a=current.focusThreat(engine,target.id),b=reference.focusThreat(engine,target.id);assert.deepEqual(a,b);targets++;multi+=Number(a.attackers>1);
    }
}
save('focus-cache-parity.json',{passed:true,targets,multi,exactWitnessEquality:true});console.log({targets,multi});
