import assert from 'node:assert/strict';
import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { opponentSnapshot } from './value_state';
import { ledger } from './leaf';
import { actorId } from '../tactical_scale_20261018/tactics';
import { commanderHealthProtection } from './commander_health_guard';
import type { Action } from '../../src/game/types';
import {SEARCH_TOP_K,SEARCH_FOLLOW_NODES} from './search_budget';

/** 离线核验每个搜索分支及其风控见证，不重跑策略网络或重新搜索。 */
export function auditSearchRisks(engine:GameEngine,search:any){
    const counts={branches:0,targets:0,witnessActions:0,lethalWitnesses:0,baselineProjections:0,legacyDeferredActorFlags:0};
    if(search?.rootCandidateLimit!==undefined){
        assert.ok(search.rootCandidateLimit<=SEARCH_TOP_K&&search.followNodeLimit<=SEARCH_FOLLOW_NODES&&(search.traces??[]).length<=search.rootCandidateLimit);
        assert.equal(search.nodes,(search.traces??[]).reduce((sum:number,v:any)=>sum+v.nodes,0),'己方搜索节点必须等于实际各根节点之和');
        assert.ok((search.traces??[]).every((v:any)=>v.nodes<=search.followNodeLimit+1)&&search.nodes<=search.rootCandidateLimit*(search.followNodeLimit+1),'完整连动必须受登记的根数与同单位节点硬上限约束');
    }
    const step=(branch:GameEngine,action:Action)=>{
        assert.ok(branch.getLegalActions(branch.getState().currentPlayer).some(a=>encodeAction(a)===encodeAction(action)),'风险见证动作必须属于权威完整合法集合');
        assert.ok(!branch.step(action).info.includes('非法动作'));
    };
    const audit=(branch:GameEngine,risks:any[],known?:boolean)=>{
        const player=engine.getState().currentPlayer;
        const reply=opponentSnapshot(branch,player);
        assert.ok(reply.known||!risks.length,'未知投影不能记录已知致死风险');
        if(known!==undefined)assert.equal(reply.known,known,'原位风险已知标志必须来自相同投影');
        for(const risk of risks){
            counts.targets++;const start=reply.state.units.find(u=>u.id===risk.id),attack=reply.branch.clone();
            for(const action of risk.witness??[]){step(attack,action);counts.witnessActions++;}
            const end=attack.getState().units.find(u=>u.id===risk.id);
            const actualDamage=start?Math.max(0,start.hp-(end?.hp??0)):risk.hp;
            assert.ok(Math.abs(actualDamage-risk.damage)<1e-9,`风险损血不符：${risk.id} ${actualDamage}/${risk.damage}`);
            assert.equal(Number(!end),risk.lethal,'风险致死标记必须由同一见证复现');
            counts.lethalWitnesses+=Number(!!risk.lethal);
        }
    };
    const replayed=new Map<number,GameEngine>();
    for(const trace of search?.traces??[]){
        const branch=engine.clone();step(branch,trace.action);counts.branches++;
        for(const follow of trace.plan??[])step(branch,follow.action);
        replayed.set(trace.index,branch);
        audit(branch,trace.risks??[]);
        if(trace.deploymentDeferred){
            const state=branch.getState(),actor=state.units.find(u=>u.id===trace.actor),player=engine.getState().currentPlayer;
            assert.ok(trace.action.type==='recruit_to_castle'&&!trace.complete&&trace.deploymentMoveAvailable&&!trace.plan.length,'延后部署必须明确未完成且没有模拟待机计划');
            assert.ok(actor&&!actor.hasMoved&&!actor.hasActed&&state.currentPlayer===player&&branch.getLegalActions(player,{unitId:actor.id,skipRecruitment:true}).some(a=>a.type==='move'),'延后叶子必须是真实招募后仍可移动的新兵状态');
            const actual=ledger(engine.getState(),state,player);for(const key of ['captures','enemyKills','recruits','healingNet'] as const)assert.equal(actual[key],trace[key]);assert.ok(Math.abs(actual.net-trace.net)<1e-9);
            if(encodeAction(trace.action)===search.selected)assert.ok(!search.planCommitted,'延后部署不能排入任何待机队列');
        }
        if(search.productiveFollowCommitted&&encodeAction(trace.action)===search.selected){
            const state=branch.getState(),player=engine.getState().currentPlayer,actual=ledger(engine.getState(),state,player);
            assert.ok(search.planCommitted&&search.preferred===search.selected&&trace.complete&&trace.riskKnown&&!trace.commanderLethal&&!trace.actorLethal,'生产性默认连动必须完整、已知且安全');
            assert.ok((trace.risks??[]).every((r:any)=>!r.lethal)&&state.units.some(u=>u.id===trace.actor)&&!actual.ownCommanderLost,'默认提交的完整连动必须有真实存活与非致死见证');
            for(const key of ['captures','enemyKills','healingNet'] as const)assert.equal(actual[key],trace[key]);assert.ok(Math.abs(actual.net-trace.net)<1e-9);
            assert.ok(trace.plan.some((p:any)=>p.action.type!=='wait'),'普通无收益待机不能作为生产性连动提交');
            assert.ok(actual.captures>0||actual.enemyKills>0||actual.net>0||actual.healingNet>0||trace.freeAttacks>0||trace.plan.some((p:any)=>p.action.type==='summon'||p.action.type==='support'));
            assert.ok(branch.isTerminal()||state.currentPlayer!==player||!branch.getLegalActions(player,{unitId:trace.actor,skipRecruitment:true}).some(a=>actorId(a,state,state)===trace.actor),'生产性连动不能假称单位已完成行动');
        }
        if(trace.finishRecovery){
            const rejected=trace.finishRecovery,old=engine.clone();step(old,trace.action);counts.branches++;
            for(const follow of rejected.plan??[])step(old,follow.action);
            audit(old,rejected.risks??[],rejected.riskKnown);
            assert.ok((rejected.commanderLethal||rejected.actorLethal)&&trace.riskKnown&&!trace.commanderLethal&&!trace.actorLethal&&trace.score>rejected.score,'安全完结纠正必须由更高叶子分及双方风险见证支持');
        }
    }
    const primary=(search?.traces??[]).find((v:any)=>encodeAction(v.action)===search.preferred);
    for(const trace of search?.traces??[])if(trace.vetoCommanderHealth){
        assert.ok(primary&&replayed.has(primary.index)&&replayed.has(trace.index));
        const proof=commanderHealthProtection(engine.getState(),engine.getState().currentPlayer,{...primary,state:replayed.get(primary.index)!.getState()},{...trace,state:replayed.get(trace.index)!.getState()});
        assert.deepEqual(trace.vetoCommanderHealth,proof,'Veto指挥官健康比较必须来自相同已重放分支及风险见证');
        if(search.reason.startsWith('Veto')&&encodeAction(trace.action)===search.selected)assert.ok(proof.every(r=>r.preserved),'Veto不能以降低原有指挥官的见证后剩余HP换取普通单位安全');
    }
    if(search?.vetoSameActorPreferred){
        const chosen=(search.traces??[]).find((v:any)=>encodeAction(v.action)===search.selected);
        // R15旧日志在更换尚未出生的新兵类型时也标记相同预分配ID；这不是已有单位的完整连动。
        const legacyDeferred=!!(search.vetoLeafRanked&&primary?.action.type==='recruit_to_castle'&&chosen?.action.type==='recruit_to_castle'&&chosen.deploymentDeferred&&!chosen.complete&&!engine.getState().units.some(u=>u.id===primary.actor));
        assert.ok(search.reason.startsWith('Veto')&&primary?.actor&&chosen?.actor===primary.actor&&(chosen.complete||legacyDeferred)&&chosen.riskKnown&&!chosen.commanderLethal&&!chosen.actorLethal,'同单位Veto优先必须有完整且已知非致死的同actor实际分支');
        assert.ok(chosen.vetoCommanderHealth?.every((v:any)=>v.preserved),'同单位优先不能绕过指挥官健康守卫');
        const branch=replayed.get(chosen.index)!,state=branch.getState();
        if(legacyDeferred){assert.ok(!chosen.plan.length&&!state.units.find(u=>u.id===chosen.actor)!.hasActed&&branch.getLegalActions(state.currentPlayer,{unitId:chosen.actor,skipRecruitment:true}).some(a=>a.type==='move'));counts.legacyDeferredActorFlags++;}
        else assert.ok(branch.isTerminal()||state.currentPlayer!==engine.getState().currentPlayer||!branch.getLegalActions(state.currentPlayer,{unitId:chosen.actor,skipRecruitment:true}).some(a=>actorId(a,state,state)===chosen.actor),'同单位Veto不能假称行动完结');
    }
    if(search?.vetoLeafRanked){
        const chosen=(search.traces??[]).find((v:any)=>encodeAction(v.action)===search.selected);
        assert.ok(search.reason.startsWith('Veto')&&chosen?.riskKnown&&!chosen.commanderLethal&&!chosen.actorLethal&&Number.isFinite(chosen.score),'叶子排序Veto仍必须通过原有已知非致死守卫');
        assert.ok(chosen.vetoCommanderHealth?.every((v:any)=>v.preserved),'叶子排序不能绕过逐指挥官健康守卫');
    }
    // 原位风险只用于致死归因对照，不提交任何友军动作；同样逐个重放见证。
    if(search?.baselineRisk){counts.baselineProjections++;audit(engine.clone(),search.baselineRisk.risks??[],search.baselineRisk.known);}
    if(search?.preservesActingDefender){
        const primary=(search.traces??[]).find((v:any)=>encodeAction(v.action)===search.preferred);
        assert.ok(primary?.actor&&(search.traces??[]).some((v:any)=>v.index!==primary.index&&v.actor===primary.actor&&v.complete&&v.riskKnown&&!v.commanderLethal),'保留防守者必须有同actor完整连动与已核验风险记录');
    }
    return counts;
}
