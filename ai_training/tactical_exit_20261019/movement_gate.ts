import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { getMoveCostTo } from '../../src/game/map';
import { read,save,hash } from './io';
let moves=0;
for(const item of read('movement-before.json')){
    const engine=new GameEngine(item.state),before=hash(engine.getState());engine.getLegalActions(item.state.currentPlayer);
    for(const p of item.moves){
        const a=p.action,cost=getMoveCostTo(item.state,a.unitId,a.to);assert.equal(cost,p.cost);
        const clone=engine.clone(),unit=item.state.units.find((u:any)=>u.id===a.unitId);const result=clone.step(a);assert.ok(!result.info.includes('非法动作'));
        const remaining=result.state.units.find((u:any)=>u.id===a.unitId);
        if(remaining&&remaining.hasMoved&&result.state.currentPlayer===item.state.currentPlayer&&a.type==='move'&&unit.movementRemaining!==undefined)assert.equal(remaining.movementRemaining,Math.max(0,unit.movementRemaining-cost));
        assert.equal(hash(engine.getState()),before);moves++;
    }
}
save('movement-gate.json',{passed:true,states:read('movement-before.json').length,moves,exactCostParity:true,cloneIsolation:true});console.log({moves});
