import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { evaluateValue } from './value_state';
import { read,save } from './io';
const states=read('browser-states.json'),old=read('old-schema.json'),results:any[]=[],names=process.argv[2]?[process.argv[2]]:['initial','teacher'];
for(const name of names){
    const model=read(name==='initial'?'initial.json':name==='teacher'?'teacher-model.json':'model-final.json'),reference=read(`python-${name}.json`);let error=0;
    for(let i=0;i<states.length;i++){
        const e=new GameEngine(states[i].state);
        for(let repeat=0;repeat<3;repeat++)error=Math.max(error,Math.abs(evaluateValue(e,model,old)-reference.out[i].value));
    }
    assert.ok(error<1e-8);results.push({name,checks:states.length*3,maxError:error});
}
save(process.argv[2]?`standalone-value-parity-${process.argv[2]}.json`:'standalone-value-parity.json',{passed:true,results,fullStateReencoded:true,coldAndIdentityCacheHits:true});console.log(results);
