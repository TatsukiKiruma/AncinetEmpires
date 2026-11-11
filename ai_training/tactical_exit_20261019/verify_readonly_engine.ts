import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { readonlyEngine,READONLY_AUDIT,setReadonlyValidation } from './readonly_engine';
import { read,save,hash } from './io';
const maps=read('teacher-battle-plan.json').maps;let steps=0,clones=0,refreshes=0;
setReadonlyValidation(true);
for(let game=0;game<12;game++){
    const initial=read(maps[game%maps.length].path),raw=new GameEngine(initial),reference=new GameEngine(initial);let view=readonlyEngine(raw);
    for(let i=0;i<200&&!raw.isTerminal();i++){
        const s=view.getState(),stable=view.getState();assert.equal(s,stable);assert.deepEqual(s,reference.getState());
        assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.units)&&Object.isFrozen(s.map.tiles[0][0]));
        assert.throws(()=>{s.players[0].gold=-100;},TypeError);assert.equal(hash(raw.getState()),hash(s));
        const legal=view.getLegalActions(s.currentPlayer).filter(a=>a.type!=='surrender');assert.deepEqual(legal,reference.getLegalActions(s.currentPlayer).filter(a=>a.type!=='surrender'));
        const action=legal[(i*7919+game*37)%legal.length];
        if(i%11===0){const child=view.clone(),other=reference.clone();assert.equal(child.getState(),s);assert.deepEqual(child.step(action),other.step(action));assert.equal(view.getState(),s);clones++;}
        if(i%7===0){
            // 对原引擎的真实外部执行不经过视图；再次进入推理必须刷新。
            const result=raw.step(action);assert.deepEqual(result,reference.step(action));view=readonlyEngine(raw);assert.notEqual(view.getState(),s);refreshes++;
        }else assert.deepEqual(view.step(action),reference.step(action));
        assert.deepEqual(view.getState(),reference.getState());assert.deepEqual(raw.getState(),reference.getState());steps++;
    }
    const changed=reference.getState();changed.players[0].gold=0;raw.reset(changed);view=readonlyEngine(raw);assert.deepEqual(view.getState(),raw.getState());
    const before=hash(view.getState());assert.match(view.step({type:'move',unitId:'不存在',to:{x:0,y:0}}).info,/非法动作/);assert.equal(hash(view.getState()),before);
}
const result={passed:true,steps,clones,externalRefreshes:refreshes,authorityResultsByteExact:true,allSnapshotsFrozen:true,originalEngineStateUnchangedByReads:true,audit:{...READONLY_AUDIT}};
save('performance_readonly/readonly-engine-gate.json',result);console.log(result);
