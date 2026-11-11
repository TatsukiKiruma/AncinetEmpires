import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parallelRuntime,parallelParity } from './parallel_optimization';

const replaceOnce=(source:string,old:string,next:string)=>{assert.equal(source.split(old).length,2,'借用快照接入点改变');return source.replace(old,next);};
export function borrowedRuntime(source:string){
    source=replaceOnce(source,"import { evaluateValue } from '../value_state';","import { evaluateValue as evaluateCanonicalValue } from '../value_state';\nimport {borrowedEngine} from './borrowed_engine';\nconst evaluateValue=(engine:GameEngine,...args:Parameters<typeof evaluateCanonicalValue> extends [any,...infer R]?R:never)=>evaluateCanonicalValue(borrowedEngine(engine),...args);");
    source=replaceOnce(source,"    if(arm==='hierarchical')return", "    engine=borrowedEngine(engine);\n    if(arm==='hierarchical')return");
    source=replaceOnce(source,"const result=chooseBounded(engine,legal,config.models.teacher_search", "const result=chooseBounded(borrowedEngine(engine),legal,config.models.teacher_search");
    return source;
}
export function borrowedPlugin(repo:string,target:string,validation=false,parallel=false){
    return {name:'Chrome87无Proxy只读快照借用',setup(builder:any){
        builder.onLoad({filter:/[\\/]phone[\\/]runtime\.ts$/},(args:any)=>{
            let contents=borrowedRuntime(fs.readFileSync(args.path,'utf8'));
            if(parallel)contents=parallelRuntime(contents);
            fs.writeFileSync(target+'/runtime.borrowed.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/ai_training/tactical_exit_20261019/phone'};
        });
        builder.onLoad({filter:/[\\/]phone[\\/]performance_parity_entry\.ts$/},(args:any)=>{
            let contents=fs.readFileSync(args.path,'utf8');
            contents=replaceOnce(contents,'const engine=new GameEngine(state),legal=',`const engine=borrowedEngine(new GameEngine(state)),legal=`);
            contents=`import {borrowedEngine,validateBorrowedSnapshots} from './borrowed_engine';\nvalidateBorrowedSnapshots(${validation});\n`+contents;
            if(parallel)contents=parallelParity(contents);
            fs.writeFileSync(target+'/parity.borrowed.ts.snapshot',contents,{flag:'wx'});
            return {contents,loader:'ts',resolveDir:repo+'/ai_training/tactical_exit_20261019/phone'};
        });
    }};
}
