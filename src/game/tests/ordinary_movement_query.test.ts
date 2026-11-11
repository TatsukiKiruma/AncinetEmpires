import {describe,expect,it} from 'vitest';
import {GameEngine} from '../engine';
import {AncientEmpiresEnv,buildFixedActionMask,encodeAction} from '../env';
import {getLegalActions,type LegalActionQuery} from '../rules';
import {createDemoState} from '../demo_map';
import {UNIT_CONFIGS} from '../constants';
import type {UnitClass} from '../types';

describe('普通移动子集查询',()=>{
    it('真实行动序列中保持完整集合的有序子集，缓存和克隆不受外部改写影响',()=>{
        const e=new GameEngine(createDemoState());
        for(let i=0;i<120&&!e.isTerminal();i++){
            const s=e.getState(),full=e.getLegalActions(s.currentPlayer),expected=full.filter(a=>a.type==='move');
            expect(e.getActionReadyUnitCount(s.currentPlayer)).toBe(full.filter(a=>a.type==='wait').length);
            const query={onlyOrdinaryMoves:true};
            expect(e.getLegalActions(s.currentPlayer,query)).toEqual(expected);
            for(const unit of s.units.filter(u=>u.ownerId===s.currentPlayer)){
                const q={unitId:unit.id,onlyOrdinaryMoves:true,skipRecruitment:!!(i%2)};
                const actions=e.getLegalActions(s.currentPlayer,q),subset=expected.filter(a=>a.unitId===unit.id);
                expect(actions).toEqual(subset);
                const branch=e.clone();
                if(actions[0]?.type==='move')actions[0].to.x=-99;
                actions.length=0;
                expect(branch.getLegalActions(s.currentPlayer,q)).toEqual(subset);
                if(subset.length){
                    const fresh=new GameEngine(s);
                    expect(branch.step(subset[0])).toEqual(fresh.step(subset[0]));
                }
            }
            expect(e.getLegalActions(s.currentPlayer,{onlyOrdinaryMoves:true,skipMovement:true})).toEqual([]);
            expect(e.getLegalActions(s.currentPlayer,{onlyOrdinaryMoves:true,onlyAttacks:true})).toEqual([]);
            const env=new AncientEmpiresEnv({initialState:s});
            expect(env.clone().getState()).toEqual(env.getState());
            expect(buildFixedActionMask(s,full)).toEqual(buildFixedActionMask(s,getLegalActions(s,s.currentPlayer)));
            expect(e.getState()).toEqual(s);
            const next=full[(i*37)%full.length];e.step(next);
        }
    });

    it('pending和静态锁仍生效，突击二次移动不会混入普通移动或污染完整缓存',()=>{
        const initial=createDemoState(),owner=initial.currentPlayer,own=initial.units.filter(u=>u.ownerId===owner);
        expect(own.length).toBeGreaterThan(1);
        const kind=(Object.keys(UNIT_CONFIGS) as UnitClass[]).find(k=>UNIT_CONFIGS[k].abilities.includes('assault_troop'))!;
        expect(kind).toBeTruthy();
        for(const pending of [undefined,'stacked','empty_castle'] as const){
            const s=structuredClone(initial),a=s.units.find(u=>u.id===own[0].id)!,b=s.units.find(u=>u.id===own[1].id)!;
            a.unitClass=kind;a.hasActed=true;a.hasMoved=true;a.hasPostAttackMoved=false;a.movementRemaining=3;
            b.apkStatic=true;
            if(pending){s.pendingUnitId=a.id;a.apkPendingRecruitSource=pending==='stacked'?'commander_castle':'empty_castle';}
            const e=new GameEngine(s),snapshot=e.getState(),expected=getLegalActions(snapshot,owner);
            expect(e.getActionReadyUnitCount(owner)).toBe(expected.filter(v=>v.type==='wait').length);
            expect(e.getLegalActions(owner,{onlyOrdinaryMoves:true})).toEqual(expected.filter(v=>v.type==='move'));
            expect(e.getLegalActions(owner).map(encodeAction)).toEqual(expected.map(encodeAction));
            expect(e.getLegalActions(owner,{unitId:a.id,onlyOrdinaryMoves:true})).toEqual([]);
            const post=expected.find(v=>v.type==='post_attack_move');
            if(!pending)expect(post).toBeTruthy();
            if(post)expect(e.clone().step(post)).toEqual(new GameEngine(snapshot).step(post));
            expect(e.getLegalActions(owner,{onlyAttacks:true})).toEqual(expected.filter(v=>v.type==='attack'));
        }
    });

    it('非常规查询绕过规范缓存，切换真假标志及reset后不会复用错误集合',()=>{
        const e=new GameEngine(createDemoState()),s=e.getState(),full=e.getLegalActions(s.currentPlayer);
        const inherited=Object.create({onlyOrdinaryMoves:true}) as LegalActionQuery;
        const getter={get onlyOrdinaryMoves(){return true;}};
        for(const q of [inherited,getter,{onlyOrdinaryMoves:1} as unknown as LegalActionQuery]){
            expect(e.getLegalActions(s.currentPlayer,q)).toEqual(getLegalActions(s,s.currentPlayer,q));
        }
        expect(e.getLegalActions(s.currentPlayer,{onlyOrdinaryMoves:false})).toEqual(full);
        const changed=structuredClone(s);changed.units.forEach(u=>u.hasMoved=true);e.reset(changed);
        expect(e.getLegalActions(e.getState().currentPlayer,{onlyOrdinaryMoves:true})).toEqual([]);
    });
});
