import { GameEngine } from '../../src/game/engine';
import { getMoveCostTo } from '../../src/game/map';
import { encodeAction } from '../../src/game/env';
import { read,save } from './io';
const states=[...read('browser-states.json').map((v:any)=>v.state),...read('expert-roots.json').roots.map((v:any)=>read(v.path)),...read('final-battle-plan.json').maps.slice(5).map((v:any)=>read(v.path))];
const probes=states.map(s=>({state:s,moves:new GameEngine(s).getLegalActions(s.currentPlayer).filter(a=>a.type==='move'||a.type==='post_attack_move').map(a=>{if(a.type!=='move'&&a.type!=='post_attack_move')throw Error('类型错误');return {action:a,code:encodeAction(a),cost:getMoveCostTo(s,a.unitId,a.to)};})}));
save('movement-before.json',probes);console.log({states:probes.length,moves:probes.reduce((n,s)=>n+s.moves.length,0)});
