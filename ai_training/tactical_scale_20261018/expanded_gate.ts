import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { extractFeatures } from './complete_tactics';
import { extractFeatures as reference } from '../tactical_conditional_20261018/complete_tactics';
import { DIR, read, save } from './io';
let states=0,candidates=0;
const root=process.argv[2]??'battles';
for(const name of fs.readdirSync(path.join(DIR,root,'slots'))){
    const prefix=`${root}/slots/${name}`;
    if(!fs.existsSync(path.join(DIR,prefix,'final.json')))continue;
    const state=read(prefix+'/final.json'),engine=new GameEngine(state);
    if(engine.isTerminal())continue;
    const actions=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');
    const old=reference(engine,actions),current=extractFeatures(engine,actions);
    assert.deepEqual(current.old,old.old,`${name}:old`);assert.deepEqual(current.extra,old.extra,`${name}:extra`);
    states++;candidates+=actions.length;console.log(name,actions.length);
}
save('expanded-feature-parity.json',{passed:true,states,candidates,maxFloat32Error:0,scope:'首轮实战所有非终局，包括招募占位兵种缓存故障点'});
