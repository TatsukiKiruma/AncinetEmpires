import fs from 'node:fs';
import path from 'node:path';
import {createDemoState} from '../../src/game/demo_map';
import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {DIR,read,save} from './io';

const states=[read('aura-guard-probe.json').state];
for(const kind of ['capture','kill']){
    const state=createDemoState();
    state.map.tiles=state.map.tiles.map(row=>row.map(()=>({terrainId:6,ownerId:null})));
    state.units[2].pos={x:1,y:2};state.units[3].pos={x:3,y:2};state.units[3].hp=kind==='kill'?10:100;
    if(kind==='capture')state.map.tiles[2][2]={terrainId:9,ownerId:null};
    states.push(state);
}
for(const name of fs.readdirSync(path.join(DIR,'probe-states')).sort())states.push(read('probe-states/'+name).state);
states.forEach((state,i)=>save(`parity-states/${17+i}.json`,{state,codes:new GameEngine(state).getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender').map(encodeAction)}));
console.log(JSON.stringify({additional:states.length}));
