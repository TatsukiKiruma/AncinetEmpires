import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { decodeAction } from '../../src/game/env';
import { encodeEngine } from './encode';
import { read,save,hash } from './io';
const states=read('browser-states.json'),old=read('old-schema.json'),inputs=read('inputs.json');
const result=inputs.map((x:any,i:number)=>{
    const item=states[i],engine=new GameEngine(item.state),before=hash(engine.getState()),encoded=encodeEngine(engine,item.codes.map(decodeAction),old,true);
    for(const key of ['tokens','groups','candidates','refs','codes','valueSummary'])assert.deepEqual(encoded[key as keyof typeof encoded],x[key]);
    assert.equal(hash(engine.getState()),before);assert.ok(Number.isFinite(encoded.valueArmy));return {...x,valueArmy:encoded.valueArmy};
});
save('inputs-army.json',result);save('army-input-gate.json',{passed:true,states:result.length,previousFieldsUnchanged:true,sourceUnchanged:true,armyValues:result.map((x:any)=>x.valueArmy)});
console.log({passed:true,states:result.length});
