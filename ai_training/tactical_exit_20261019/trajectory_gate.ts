import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { AncientEmpiresEnv,buildFixedActionMask,encodeAction } from '../../src/game/env';
import { read,save,hash } from './io';
// 原始引擎快照独立打包，只用于前后版本逐动作审计。
import { GameEngine as LegacyEngine } from './legacy-engine.reference.mjs';
const maps=read('final-battle-plan.json').maps;let steps=0,clones=0,masks=0;
for(let game=0;game<24;game++){
    const initial=read(maps[game%maps.length].path),a=new GameEngine(initial),b=new LegacyEngine(initial),env=new AncientEmpiresEnv({initialState:initial});
    assert.deepEqual(a.getState(),b.getState());assert.equal(env.getState().players[0].gold,a.getState().players[0].gold);
    for(let i=0;i<300&&!a.isTerminal();i++){
        const s=a.getState(),la=a.getLegalActions(s.currentPlayer).filter(v=>v.type!=='surrender'),lb=b.getLegalActions(s.currentPlayer).filter((v:any)=>v.type!=='surrender');assert.deepEqual(la,lb);
        assert.deepEqual(buildFixedActionMask(s,la),buildFixedActionMask(b.getState(),lb));masks++;
        const action=la[(i*7919+game*37)%la.length];
        if(i%13===0){const ca=a.clone(),cb=b.clone();assert.deepEqual(ca.step(action),cb.step(action));clones++;assert.equal(hash(a.getState()),hash(s));}
        assert.deepEqual(a.step(action),b.step(action));assert.equal(hash(a.getState()),hash(b.getState()));steps++;
    }
    save('trajectory-gate.live.json',{games:game+1,steps,clones,masks});
}
const result={passed:true,games:24,steps,clones,masks,stateAndRewardByteEquivalent:true,initialIncomeUnchanged:true,reference:'立项前engine.ts完整快照；移动成本另有3313条旧值对照'};save('trajectory-gate.json',result);console.log(result);
