import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { beginFocusScope,focusThreat,clearFocusGeometryCache,FOCUS_GEOMETRY_AUDIT } from './focus_threat';
import { beginFocusScope as oldBegin,focusThreat as oldFocus } from './focus_reference';
import { exactGeometryEquals } from './geometry_equal';
import { read,save,hash } from './io';
import type { GameState } from '../../src/game/types';
const states:GameState[]=[...read('browser-states.json').map((v:any)=>v.state),...read('expert-roots.json').roots.map((v:any)=>read(v.path)),...read('final-battle-plan.json').maps.slice(5).map((v:any)=>read(v.path))];
let targets=0,witnessActions=0;
function check(s:GameState,mode:string){
    const e=new GameEngine(s),snapshot=e.getState(),before=hash(snapshot);
    for(const u of snapshot.units.filter(u=>u.ownerId!==snapshot.currentPlayer).slice(0,4)){
        oldBegin();const expected=oldFocus(e,u.id);beginFocusScope();const actual=focusThreat(e,u.id);
        assert.deepEqual(actual,expected,mode+'/'+u.id);assert.equal(hash(e.getState()),before);
        const replay=e.clone();for(const a of actual.witness){assert.ok(replay.getLegalActions(replay.getState().currentPlayer).some(v=>encodeAction(v)===encodeAction(a)),mode+'/'+u.id+'/'+encodeAction(a));assert.ok(!replay.step(a).info.includes('非法动作'));witnessActions++;}
        // 对外的见证动作不能污染下一作用域中的移动缓存。
        const move=actual.witness.find(a=>a.type==='move');if(move&&move.type==='move')move.to.x=-999;
        beginFocusScope();assert.deepEqual(focusThreat(e,u.id),expected,mode+'/外部改写见证');targets++;
    }
}
clearFocusGeometryCache();for(const s of states){check(s,'跨状态');check(structuredClone(s),'结构相同热缓存');}
const source=structuredClone(states[0]);
const mutations:((s:GameState)=>void)[]=[s=>s.turn++,s=>s.players[0].gold++,s=>s.map.tiles[0][0].ownerId=1,s=>s.map.tiles[0][0].apkMoveCost=0,s=>s.units[0].hp=1,s=>s.units[0].pos={x:1,y:1},s=>s.units[0].movementRemaining=1,s=>s.units[0].hasActed=true,s=>s.pendingUnitId=s.units.find(u=>u.ownerId===s.currentPlayer)?.id,s=>(s.rules as any).__cacheProbe=1,s=>s.players.reverse()];
for(const mutate of mutations){const s=structuredClone(source);mutate(s);check(s,'输入变化');}
// 独立签名副本必须抵御旧输入随后被修改；容量满时不能混淆复用的几何编号。
check(source,'旧输入');source.map.tiles[0][0].ownerId=123;check(source,'旧输入被修改');
const evictionsBefore=FOCUS_GEOMETRY_AUDIT.evictions;
for(let i=0;i<260;i++){const s=structuredClone(states[0]);(s.rules as any).__cacheGeneration=i;check(s,'容量淘汰'+i);}
assert.ok(FOCUS_GEOMETRY_AUDIT.evictions>evictionsBefore);
assert.ok(exactGeometryEquals({a:[1,{b:2}]},{a:[1,{b:2}]}));assert.ok(!exactGeometryEquals({a:1,b:2},{b:2,a:1}));assert.ok(!exactGeometryEquals({a:[1,2]},{a:[1,3]}));
save('revisions/'+(process.argv[2]??'r18')+'/cache-consistency-gate.json',{passed:true,states:states.length,targets,witnessActions,mutations:mutations.length,cacheAudit:FOCUS_GEOMETRY_AUDIT,coldWarmExact:true,sourceStateUnchanged:true,externalWitnessMutationIsolated:true,evictionExact:true,reference:'revisions/r18/focus_threat.ts.before.snapshot'});console.log({passed:true,targets,witnessActions,cacheAudit:FOCUS_GEOMETRY_AUDIT});
