import { GameEngine } from '../../src/game/engine';
import { calculateDamage,calculateDamageAtHp } from '../../src/game/rules';
import { read,save } from './io';
const states=read('browser-states.json').map((v:any)=>new GameEngine(v.state).getState());
const probes=states.map((state:any)=>{const pairs:any[]=[];for(const a of state.units)for(const b of state.units)if(a.ownerId!==b.ownerId)pairs.push({attacker:a.id,defender:b.id,normal:calculateDamage(state,a.id,b.id),low:calculateDamageAtHp(state,a.id,b.id,37),leveled:calculateDamageAtHp(state,a.id,b.id,83,{level:2,maxHp:120})});return {state,pairs};});
save('damage-before.json',probes);console.log({states:probes.length,pairs:probes.reduce((n,s)=>n+s.pairs.length,0)});
