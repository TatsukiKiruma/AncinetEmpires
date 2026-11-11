import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { chooseBounded } from './search';
import { evaluateValue } from './value_runtime';
import { combined } from './numeric';
import { runtimeValueSummary } from './value_summary_runtime';
import { read,save,hash } from './io';
const name=process.argv[2]??'initial',model=read(`numeric-model-${name}.json`),old=read('old-schema.json'),states=read('browser-states.json');
const results=[];
let maxValueError=0,maxSummaryError=0;
for(const [i,x] of read(model.valueArmyFeature?'inputs-army.json':'inputs.json').entries()){
    const engine=new GameEngine(states[i].state),legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender');
    const summary=runtimeValueSummary(engine,legal);assert.deepEqual(summary,x.valueSummary);summary.forEach((v,j)=>maxSummaryError=Math.max(maxSummaryError,Math.abs(v-x.valueSummary[j])));
    maxValueError=Math.max(maxValueError,Math.abs(evaluateValue(engine,legal,model,old)-combined(x,model).value));
}
assert.ok(maxValueError<1e-8);
for(const index of [0,3,states.length-1]){
    const engine=new GameEngine(states[index].state),legal=engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type!=='surrender'),before=hash(engine.getState());
    const a=chooseBounded(engine,legal,model,old,'bounded'),b=chooseBounded(engine,legal,model,old,'bounded');
    assert.equal(hash(engine.getState()),before);assert.equal(a.search.selected,b.search.selected);assert.deepEqual(a.search.traces,b.search.traces);assert.ok(a.search.nodes<=48);
    results.push({index,selected:a.search.selected,nodes:a.search.nodes,ms:[a.search.elapsedMs,b.search.elapsedMs],triggers:a.search.triggered});
}
const result={passed:true,model:name,results,deterministic:true,sourceUnchanged:true,maxValueError,maxSummaryError,summaryProbeStates:states.length};save('search-gate.json',result);save(`search-gate-${name}.json`,result);console.log({results,maxValueError,maxSummaryError});
