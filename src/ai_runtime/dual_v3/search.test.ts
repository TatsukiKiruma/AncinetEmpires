import { describe, it, expect, vi } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { ReachabilityContext } from '../dual_v2/reachability';
import type { DualObservation } from '../dual_v2/contract';
import { softPriors, diverseCandidates, type SearchModel } from './search_policy';
import { NeuralBeamSearchAI } from './beam_search';
const mockModel = (): SearchModel => ({forward:vi.fn((o:DualObservation)=>({logits:new Float32Array(o.actions.sourceIndices.length),actorPrior:new Float32Array(o.actions.actorMask.length),conditionalPrior:new Float32Array(o.actions.sourceIndices.length),valueLogits:Float32Array.of(0,0,-1e9,-1e9,-1e9,-1e9),valueProbs:Float32Array.of(.5,.5,0,0,0,0)}))});
describe('独立网络束搜索合同',()=>{
    it('策略禁用标记变成有限先验，wait和end_turn保留覆盖',()=>{
        const state=createDefaultAppGameState(),engine=new GameEngine(state),legal=engine.getLegalActions(state.currentPlayer).filter(a=>a.type!=='surrender');
        const p=softPriors(state,legal,new ReachabilityContext(state));expect([...p].every(Number.isFinite)).toBe(true);expect(Math.min(...p)).toBeGreaterThan(-1000);
        const ranked=legal.map((action,i)=>({action,code:encodeAction(action),score:p[i],prior:p[i]})).sort((a,b)=>b.score-a.score);
        const candidates=diverseCandidates(ranked,24);expect(candidates.some(r=>r.action.type==='wait')).toBe(true);expect(candidates.some(r=>r.action.type==='end_turn')).toBe(true);
        expect(new Set(candidates.map(r=>r.code)).size).toBe(candidates.length);
    });
    it('自己与反扑节点共用上限，所有见证均可独立合法重放',()=>{
        const engine=new GameEngine(createDefaultAppGameState()),before=engine.getState(),witnesses:any[]=[], model=mockModel();
        const ai=new NeuralBeamSearchAI(model,{modelVersion:'测试固定模型',maxNodes:80,budgetMs:1000,maxUnits:2,onWitness:w=>witnesses.push(w)});
        const action=ai.getAction(engine,before.currentPlayer);expect(engine.hasLegalAction(before.currentPlayer,action)).toBe(true);expect(engine.getState()).toEqual(before);
        expect(ai.telemetry.nodes).toBe(ai.telemetry.ownNodes+ai.telemetry.responseNodes);expect(ai.telemetry.nodes).toBeLessThanOrEqual(80);
        expect(ai.telemetry.networkCalls).toBeGreaterThan(1);
        for(const w of witnesses){const replay=new GameEngine(w.initial,{applyInitialTurnStart:false});for(const a of w.actions){expect(replay.hasLegalAction(replay.getState().currentPlayer,a)).toBe(true);replay.step(a);}expect(replay.getState()).toEqual(w.final);}
    });
    it('完整前态和当前合法性共同控制队列复用',()=>{
        const engine=new GameEngine(createDefaultAppGameState()),state=engine.getState(),action=engine.getLegalActions(state.currentPlayer).find(a=>a.type==='wait')!;
        const ai=new NeuralBeamSearchAI(mockModel(),{modelVersion:'队列测试',budgetMs:1000,maxNodes:10}) as any;
        ai.queue=[{state,action}];expect(ai.getAction(engine,state.currentPlayer)).toEqual(action);expect(ai.telemetry.queued).toBe(true);
        const altered=structuredClone(state);altered.players[0].gold+=1;ai.queue=[{state:altered,action}];
        const selected=ai.getAction(engine,state.currentPlayer);expect(ai.telemetry.queued).toBe(false);expect(engine.hasLegalAction(state.currentPlayer,selected)).toBe(true);
    });
    it('超过4秒的配置拒绝运行',()=>{
        const engine=new GameEngine(createDefaultAppGameState()),ai=new NeuralBeamSearchAI(mockModel(),{modelVersion:'预算测试',budgetMs:4001});
        expect(()=>ai.getAction(engine,engine.getState().currentPlayer)).toThrow('4000');
    });
    it('后手跨全局回合后返回根玩家，不因回合数相同误记反扑截断',()=>{
        const state=createDefaultAppGameState();state.currentPlayer=1;
        const original=new GameEngine(state,{applyInitialTurnStart:false}),end=original.getLegalActions(1).find(a=>a.type==='end_turn')!,next=original.clone();next.step(end);
        const ai=new NeuralBeamSearchAI(mockModel(),{modelVersion:'后手顺位测试'}) as any;
        ai.self=1;ai.deadline=ai.activeEnd=performance.now()+10000;
        ai.evaluate=(engine:GameEngine)=>({value:0,ranked:engine.getLegalActions(engine.getState().currentPlayer).filter(a=>a.type==='end_turn').map(action=>({action,code:encodeAction(action),score:0,prior:0}))});
        const leaf=ai.responseLeaf({engine:next,steps:[{state:original.getState(),action:end}],ends:[1],score:0,value:0,prior:0},0,ai.deadline-20);
        expect(leaf.final.currentPlayer).toBe(1);expect(leaf.complete).toBe(true);expect(leaf.final.turn).toBe(next.getState().turn);
    });
});
