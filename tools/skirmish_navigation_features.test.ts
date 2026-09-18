import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv } from '../src/game/env';
import { createDemoState } from '../src/game/demo_map';
import type { GameState } from '../src/game/types';
import { navigationFeatureTokens } from './skirmish_navigation_features';

function state(): GameState {
    const s = createDemoState();
    s.map = { width: 5, height: 3, tiles: Array.from({length:3},()=>Array.from({length:5},()=>({terrainId:6 as const,ownerId:null}))) };
    s.map.tiles[1][4] = { terrainId: 10, ownerId: 1 };
    s.units = [{ ...s.units[0], id: 'walker', ownerId: 0, unitClass: 'commander', pos: {x:0,y:1}, apkMoveOverrides: {3:999999} }];
    s.rules = { ...s.rules, alliances: {0:0,1:1} };
    return s;
}
function tokens(s: GameState, to = {x:0,y:0}) {
    return new Map(navigationFeatureTokens(new AncientEmpiresEnv({initialState:s}).getObservation(),{type:'move',unitId:'walker',to}));
}
describe('v4 可达性与推进目标', () => {
    it('绕过不可通行山脉时，允许曼哈顿距离增加但真实路径缩短', () => {
        const s = state();
        for(let x=1;x<4;x++)s.map.tiles[1][x]={terrainId:3,ownerId:null};
        const t=tokens(s);
        expect(t.get('nav:castle:move:reachable:true')).toBe(1);
        expect(t.get('nav:castle:move:progress')).toBeGreaterThan(0);
    });
    it('敌军封死走廊时不宣称后方城堡可达，同盟可穿过', () => {
        const s = state();
        for(const y of [0,2])for(let x=0;x<5;x++)s.map.tiles[y][x]={terrainId:3,ownerId:null};
        s.units.push({...s.units[0],id:'blocker',ownerId:1,pos:{x:2,y:1}});
        expect(tokens(s,{x:1,y:1}).get('nav:castle:move:reachable:false')).toBe(1);
        s.units[1].ownerId=0;
        expect(tokens(s,{x:1,y:1}).get('nav:castle:move:reachable:true')).toBe(1);
    });
    it('不把飞行战斗单位当成占城单位，攻击位置考虑最小射程', () => {
        const s=state();
        s.units[0].unitClass='dragon';
        expect(tokens(s).get('nav:castle:move:reachable:false')).toBe(1);
        s.units[0].unitClass='catapult';
        s.units.push({...s.units[0],id:'enemy',ownerId:1,unitClass:'soldier',pos:{x:3,y:1}});
        const observation=new AncientEmpiresEnv({initialState:s}).getObservation();
        const u=observation.units[0];
        u.minRange=2;u.maxRange=3;
        const t=new Map(navigationFeatureTokens(observation,{type:'move',unitId:'walker',to:{x:2,y:1}}));
        expect(t.get('nav:attack:move:ready:false')).toBe(1);
    });
    it('同一 observation 缓存不会污染下一局面的占位和地形',()=>{
        const s=state();
        const a=tokens(s,{x:1,y:1});
        s.map.tiles[1][4].ownerId=0;
        const b=tokens(s,{x:1,y:1});
        expect(a.get('nav:castle:move:reachable:true')).toBe(1);
        expect(b.get('nav:castle:move:reachable:false')).toBe(1);
    });
});
