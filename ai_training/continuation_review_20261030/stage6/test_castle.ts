import fs from 'node:fs';
import path from 'node:path';
import {strict as assert} from 'node:assert';
import {fileURLToPath} from 'node:url';
import {GameEngine} from '../../../src/game/engine';
import {ReachabilityContext} from '../../../src/ai_runtime/dual_v2/reachability';
import {castleProductionPenalties} from '../../../src/ai_runtime/dual_v3/castle_production';
import {getTileTerrainKey} from '../../../src/game/terrain_rules';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(fs.readFileSync(path.join(here,'diagnostic-fixtures/p2-3-s1_step25.json'),'utf8'));
function penalties(state:any) {
    const e=new GameEngine(state,{applyInitialTurnStart:false}), legal=e.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');
    return castleProductionPenalties(state,legal,new ReachabilityContext(state));
}
assert.ok([...penalties(fixture.state)].some(x=>x<0));
const poor=structuredClone(fixture.state); poor.players.find((p:any)=>p.id===poor.currentPlayer).gold=0;
assert.ok([...penalties(poor)].every(x=>x===0));
const commander=structuredClone(fixture.state); commander.units.find((u:any)=>u.id==='u_4').unitClass='commander';
const ce=new GameEngine(commander,{applyInitialTurnStart:false}), legal=ce.getLegalActions(commander.currentPlayer).filter(a=>'unitId' in a&&a.unitId==='u_4');
assert.ok([...castleProductionPenalties(commander,legal,new ReachabilityContext(commander))].every(x=>x===0));
const multiple=structuredClone(fixture.state), castle=multiple.map.tiles.flat().find((t:any)=>getTileTerrainKey(t)==='castle'&&t.ownerId===multiple.currentPlayer);
let added=false;
for(let y=0;!added&&y<multiple.map.height;y++)for(let x=0;!added&&x<multiple.map.width;x++) {
    if (!multiple.units.some((u:any)=>u.pos.x===x&&u.pos.y===y)&&getTileTerrainKey(multiple.map.tiles[y][x])!=='castle') {
        multiple.map.tiles[y][x]={...castle}; added=true;
    }
}
assert.ok([...penalties(multiple)].every(x=>x===0));
console.log('堵城惩罚及金币、指挥官、多城堡例外回归通过');
