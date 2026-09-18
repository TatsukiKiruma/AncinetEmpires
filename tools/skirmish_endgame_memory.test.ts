import { describe,it,expect } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { AncientEmpiresEnv } from '../src/game/env';
import { EndgameMemory } from './skirmish_endgame_memory';
import { createEndgamePolicy } from './skirmish_endgame_policy';

function state(){
    const s=createDemoState();
    s.map={width:5,height:2,tiles:Array.from({length:2},()=>Array.from({length:5},()=>({terrainId:6 as const,ownerId:null})))};
    s.map.tiles[0][4]={terrainId:10,ownerId:1};
    s.units=[{...s.units[0],pos:{x:0,y:0}},{...s.units[1],pos:{x:4,y:1}}];
    return s;
}
const observation=(s:ReturnType<typeof state>)=>new AncientEmpiresEnv({initialState:s}).getObservation();
describe('收官历史与持续目标',()=>{
    it('仅对已实际发生的往返施加惩罚，受伤撤退允许回访',()=>{
        const s=state(),m=new EndgameMemory();
        m.observe(observation(s),1);
        m.selected({type:'move',unitId:'u1',to:{x:1,y:0}});
        s.turn=2;s.units[0].pos={x:1,y:0};m.observe(observation(s),2);
        s.turn=3;s.units[0].pos={x:0,y:0};const o=observation(s);m.observe(o,3);
        const move={type:'move' as const,unitId:'u1',to:{x:1,y:0}};
        const fresh=new EndgameMemory();fresh.observe(o,3);
        expect(m.adjustment(o,move)).toBeLessThan(fresh.adjustment(o,move)-5000);
        s.units[0].hp=20;const hurt=observation(s);m.observe(hurt,4);
        expect(m.adjustment(hurt,move)).toBeGreaterThanOrEqual(0);
    });
    it('多次候选评分不会写入未执行的移动，重置对局清除历史',()=>{
        const s=state(),m=new EndgameMemory(),o=observation(s),move={type:'move' as const,unitId:'u1',to:{x:1,y:0}};
        m.observe(o,10);const a=m.adjustment(o,move);expect(m.adjustment(o,move)).toBe(a);
        s.units[0].pos={x:1,y:0};s.turn=2;m.observe(observation(s),11);
        s.units[0].pos={x:0,y:0};s.turn=1;const reset=observation(s);m.observe(reset,1);
        expect(m.adjustment(reset,move)).toBe(a);
    });
    it('目标被占领后失效，且不鼓励破坏自己的城镇',()=>{
        const s=state();s.units[1].pos={x:4,y:1};const m=new EndgameMemory();
        const a=observation(s);m.observe(a,1);m.adjustment(a,{type:'move',unitId:'u1',to:{x:1,y:0}});
        s.map.tiles[0][4].ownerId=0;s.units[1].hp=0;
        const b=observation(s);m.observe(b,2);m.adjustment(b,{type:'move',unitId:'u1',to:{x:1,y:0}});
        expect(m.stats.targetsInvalidated).toBeGreaterThan(0);
        s.map.tiles[0][0]={terrainId:9,ownerId:0};
        expect(m.adjustment(observation(s),{type:'destroy_town',unitId:'u1'})).toBe(-18000);
    });
    it('紧急攻击仍然从合法动作中选择，不被历史约束阻止',()=>{
        const s=state();s.units[1].pos={x:1,y:0};s.units[1].hp=1;
        const env=new AncientEmpiresEnv({initialState:s}),result=env.reset();
        const selected=createEndgamePolicy().selectFixedActionIndex({result,playerId:0,stepNumber:1,episodeSeed:1,scenario:{id:'test',mode:'SD',mapName:'test',resourcePath:'test'}});
        const entry=result.legalActionEntries.find(e=>e.fixedActionIndex===selected)!;
        expect(entry.action.type).toBe('attack');
        expect(env.stepAction(entry.action).info).not.toContain('非法动作');
    });
});
