import assert from 'node:assert/strict';
import { calculateDamage,calculateDamageAtHp } from '../../src/game/rules';
import { read,save } from './io';
let pairs=0;for(const item of read('damage-before.json'))for(const p of item.pairs){assert.equal(calculateDamage(item.state,p.attacker,p.defender),p.normal);assert.equal(calculateDamageAtHp(item.state,p.attacker,p.defender,37),p.low);assert.equal(calculateDamageAtHp(item.state,p.attacker,p.defender,83,{level:2,maxHp:120}),p.leveled);pairs++;}
save('damage-gate.json',{passed:true,pairs,calculations:pairs*3,exactIntegerParity:true});console.log({pairs});
