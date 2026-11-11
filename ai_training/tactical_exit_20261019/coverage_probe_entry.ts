import {GameEngine} from '../../src/game/engine';
import {encodeAction} from '../../src/game/env';
import {calculateDamage} from '../../src/game/rules';
import {isCommanderUnit} from '../../src/game/rule_config';
import {getTileTerrainKey} from '../../src/game/terrain_rules';
import {ModelBattleSearchAI} from './model_battle_search_ai';
import {infer,legalActions} from './policy_runtime';
import {auditSearchRisks} from './audit_search_risks';
import {actorId} from '../tactical_scale_20261018/tactics';
export {GameEngine,encodeAction,auditSearchRisks};

/** 诊断入口返回根编码与实际候选；生产模型、规则和守卫均不修改。 */
export function inspect(state:any,model:any,old:any){
    const engine=new GameEngine(state),legal=legalActions(engine),root=infer(engine,legal,model,old),ai=new ModelBattleSearchAI(model,old),action=ai.getAction(engine,state.currentPlayer,legal,root);
    const decision=ai.lastDecision,primary=decision.traces.find((v:any)=>encodeAction(v.action)===decision.preferred),represented=new Set(decision.traces.map((v:any)=>encodeAction(v.action)));
    const dangerous=!!primary&&(primary.commanderLethal||primary.actorLethal&&primary.highValueActor),closing=['wait','end_turn'].includes(legal[root.out.best].type);
    if(!primary||!dangerous&&!closing)return {engine,legal,root,ai,action,decision,options:[]};
    const priority=(i:number)=>{
        const a=legal[i],code=encodeAction(a);if(represented.has(code)||a.type==='end_turn')return 0;
        const same=primary.actor&&actorId(a,state,state)===primary.actor;
        if(dangerous&&same&&root.x.focus[i][7]&&!root.x.focus[i][1]&&!root.x.focus[i][5])return 12;
        if(a.type==='attack'){
            const target=state.units.find((u:any)=>u.id===a.targetId),damage=calculateDamage(state,a.attackerId,a.targetId);
            if(target&&damage>=target.hp)return isCommanderUnit(state,target,target.ownerId)?20:8;
            return closing&&damage>0?4:0;
        }
        if(a.type==='capture')return 16;
        if(a.type==='move'){
            const tile=state.map.tiles[a.to.y][a.to.x],kind=getTileTerrainKey(tile);
            if(tile.ownerId!==state.currentPlayer&&(kind==='castle'||kind==='town'))return kind==='castle'?18:10;
        }
        if(closing&&a.type.startsWith('recruit_'))return 2;
        return dangerous&&same?3:0;
    };
    const options=legal.map((_:any,i:number)=>({i,priority:priority(i)})).filter(v=>v.priority>0).sort((a,b)=>b.priority-a.priority||root.prior[b.i]-root.prior[a.i]||a.i-b.i).slice(0,12);
    return {engine,legal,root,ai,action,decision,options};
}
export function evaluate(info:ReturnType<typeof inspect>,model:any,old:any,index:number){
    return new ModelBattleSearchAI(model,old).evaluateCandidate(info.engine,info.engine.getState().currentPlayer,info.legal[index],index);
}
export function choose(state:any,model:any,old:any,forced:string){
    (globalThis as any).__stage5CoverageProbeCode=forced;
    try{const e=new GameEngine(state),ai=new ModelBattleSearchAI(model,old),a=ai.getAction(e,state.currentPlayer);return {code:encodeAction(a),decision:ai.lastDecision};}
    finally{delete (globalThis as any).__stage5CoverageProbeCode;}
}
