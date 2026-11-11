import { describe,expect,it } from 'vitest';
import { GameEngine } from '../engine';
import { AncientEmpiresEnv,buildFixedActionMask,encodeAction } from '../env';
import { getLegalActions } from '../rules';
import { createDemoState } from '../demo_map';

describe('完整合法集合的克隆复用',()=>{
    it('冷缓存布尔查询与完整权威集合一致，非法位置及错误玩家均拒绝',()=>{
        const engine=new GameEngine(createDemoState());
        for(let i=0;i<25&&!engine.isTerminal();i++){
            const state=engine.getState(),legal=getLegalActions(state,state.currentPlayer);
            const fresh=new GameEngine(state);
            for(const action of legal)expect(fresh.hasLegalAction(state.currentPlayer,action)).toBe(true);
            expect(fresh.hasLegalAction(state.currentPlayer,{type:'move',unitId:state.units[0].id,to:{x:-1,y:-1}})).toBe(false);
            expect(fresh.hasLegalAction(-999,{type:'end_turn'})).toBe(false);
            expect(fresh.getState()).toEqual(state);
            engine.step(legal[(i*23)%legal.length]);
        }
    });
    it('缓存不受调用者改写影响，失效时机与权威规则和环境mask保持一致',()=>{
        const engine=new GameEngine(createDemoState());
        for(let i=0;i<100&&!engine.isTerminal();i++){
            const s=engine.getState(),full=engine.getLegalActions(s.currentPlayer),codes=full.map(encodeAction);
            expect(full).toEqual(getLegalActions(s,s.currentPlayer));
            const branch=engine.clone(),fresh=new GameEngine(s),env=new AncientEmpiresEnv({initialState:s});
            const action=structuredClone(full[(i*19)%full.length]);
            // 修改返回数组及嵌套落点不能污染主引擎或已克隆分支的合法集合。
            const move=full.find(a=>a.type==='move');if(move&&move.type==='move')move.to.x=-100;
            full.length=0;
            expect(engine.getLegalActions(s.currentPlayer).map(encodeAction)).toEqual(codes);
            expect(branch.getLegalActions(s.currentPlayer).map(encodeAction)).toEqual(codes);
            expect(buildFixedActionMask(s,branch.getLegalActions(s.currentPlayer))).toEqual(buildFixedActionMask(s,getLegalActions(s,s.currentPlayer)));
            expect(env.clone().getState()).toEqual(env.getState());
            expect(branch.step(action)).toEqual(fresh.step(action));
            const next=branch.getState();expect(branch.getLegalActions(next.currentPlayer)).toEqual(getLegalActions(next,next.currentPlayer));
            expect(engine.getState()).toEqual(s);
            engine.step(action);
        }
    });
    it('拒绝非法动作并在reset后清除旧缓存',()=>{
        const engine=new GameEngine(createDemoState()),s=engine.getState();engine.getLegalActions(s.currentPlayer);
        expect(engine.step({type:'move',unitId:'不存在',to:{x:0,y:0}}).info).toContain('非法动作');
        expect(engine.getState()).toEqual(s);
        const changed=structuredClone(s);changed.players.find(p=>p.id===changed.currentPlayer)!.gold=0;engine.reset(changed);
        expect(engine.getLegalActions(changed.currentPlayer)).toEqual(getLegalActions(engine.getState(),changed.currentPlayer));
    });
    it('定向查询在参数重排、分支执行及外部改写后仍与完整权威规则一致',()=>{
        const engine=new GameEngine(createDemoState());
        for(let i=0;i<40&&!engine.isTerminal();i++){
            const s=engine.getState(),id=s.units.find(u=>u.ownerId===s.currentPlayer)?.id;
            for(let flags=0;flags<8;flags++){
                const query={unitId:id,skipMovement:!!(flags&1),skipRecruitment:!!(flags&2),onlyAttacks:!!(flags&4)};
                const expected=getLegalActions(s,s.currentPlayer,query),actual=engine.getLegalActions(s.currentPlayer,query);
                expect(actual).toEqual(expected);
                const move=actual.find(a=>a.type==='move');if(move&&move.type==='move')move.to.x=-100;
                actual.length=0;
                const reordered={onlyAttacks:query.onlyAttacks,skipRecruitment:query.skipRecruitment,unitId:id,skipMovement:query.skipMovement};
                expect(engine.clone().getLegalActions(s.currentPlayer,reordered)).toEqual(expected);
            }
            // 克隆共享查询结果，但执行后不能保留上一状态的动作或金币条件。
            const legal=engine.getLegalActions(s.currentPlayer),action=legal[(i*17)%legal.length],branch=engine.clone();
            branch.step(action);engine.step(action);
            const next=engine.getState(),query={unitId:id,skipRecruitment:true};
            expect(branch.getLegalActions(next.currentPlayer,query)).toEqual(getLegalActions(next,next.currentPlayer,query));
            expect(branch.getState()).toEqual(next);
        }
    });
    it('动作位置复制保持权威列表中的位置别名布局',()=>{
        const engine=new GameEngine(createDemoState());
        const aliases=(actions:ReturnType<GameEngine['getLegalActions']>)=>{
            const seen=new Map<object,number>();
            return actions.flatMap(action=>Object.entries(action).flatMap(([key,value])=>{
                if(!value||typeof value!=='object')return [];
                if(!seen.has(value))seen.set(value,seen.size);return [[key,seen.get(value)]];
            }));
        };
        for(let i=0;i<30&&!engine.isTerminal();i++){
            const s=engine.getState(),actions=engine.getLegalActions(s.currentPlayer),expected=getLegalActions(s,s.currentPlayer);
            expect(actions).toEqual(expected);expect(aliases(actions)).toEqual(aliases(expected));
            engine.step(actions[(i*37)%actions.length]);
        }
    });
});
