import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { getAllianceId,isCommanderUnit } from '../../src/game/rule_config';
import type { Action,GameState } from '../../src/game/types';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { friendlyEvents,verifiedTakeover,type FriendlyEvents } from './verified_events';
import { actorId } from '../tactical_scale_20261018/tactics';
import { movingThreat,beginThreatScope } from '../tactical_scale_20261018/threat';
import { beginFocusScope,focusThreat } from './focus_threat';
import { infer,legalActions,topIndexes,type Inference } from './policy_runtime';
import { evaluateLeaf,type Leaf } from './leaf';

export interface SearchMemory { queue?:{state:string;action:Action}[]; }
export interface ModelBattleSearchOptions {
    topK?:number;oppProbeK?:number;friendlyRolloutSteps?:number;takeoverThreshold?:number;vetoMargin?:number;dangerLine?:number;
    maxNodes?:number;maxDecisionMs?:number;arm?:'value_rerank'|'bounded';
}
interface Evaluation extends Leaf {complete:boolean;maxCommanderLost:number;maxCriticalActorLost:number;friendlyEvents:FriendlyEvents;friendlyPlan:{state:string;action:Action}[];responses:any[];rootIndex:number;code:string;}

/**
 * 直接移植公共BattleSearchAI的默认保底、缓存叶子、必胜直取、Takeover/Veto控制框架。
 * 基础策略、TopK与己方连动全部改用分层网络；叶子改用神经价值及引擎实际净变化。
 * 对手回应扩展移动后攻击和三单位集火，不调用公共版本的启发式依赖。
 */
export class ModelBattleSearchAI {
    private options:Required<ModelBattleSearchOptions>;
    private before!:GameState;private player=0;private criticalActor:string|undefined;private started=0;private nodes=0;private triggerProbes=0;
    private inferenceCache=new Map<string,Inference>();private root!:Inference;private evaluations=new Map<number,Evaluation>();
    public lastDecision:any=null;
    constructor(private model:any,private oldSchema:any,options:ModelBattleSearchOptions={}){
        this.options={topK:options.topK??6,oppProbeK:options.oppProbeK??3,friendlyRolloutSteps:options.friendlyRolloutSteps??3,
            takeoverThreshold:options.takeoverThreshold??.08,vetoMargin:options.vetoMargin??.03,dangerLine:options.dangerLine??-.5,
            maxNodes:options.maxNodes??48,maxDecisionMs:options.maxDecisionMs??29000,arm:options.arm??'bounded'};
    }
    private check(){if(performance.now()-this.started>this.options.maxDecisionMs)throw Error('有界搜索单步墙钟预算耗尽');return this.nodes<this.options.maxNodes;}
    private step(engine:GameEngine,action:Action){if(!this.check())return false;this.nodes++;if(engine.step(action).info.includes('非法动作'))throw Error('模型化BattleSearch分支非法');return true;}
    private policy(engine:GameEngine,actions:Action[]=legalActions(engine)){
        const key=JSON.stringify([engine.getState(),actions.map(encodeAction)]);let result=this.inferenceCache.get(key);
        if(!result){result=infer(engine,actions,this.model,this.oldSchema);this.inferenceCache.set(key,result);}return result;
    }
    private leaf(engine:GameEngine){return evaluateLeaf(this.before,engine,this.player,this.criticalActor,this.model,this.oldSchema);}
    private criticalOpportunity(engine:GameEngine,action:Action){
        const state=engine.getState(),enemy=state.players.find(p=>p.id!==this.player)!.id;
        if(action.type==='attack')return state.units.filter(u=>u.ownerId===enemy).length===1||state.units.some(u=>u.id===action.targetId&&isCommanderUnit(state,u,enemy));
        if(action.type==='capture'){
            const unit=state.units.find(u=>u.id===action.unitId)!;const tile=state.map.tiles[unit.pos.y][unit.pos.x];return getTileTerrainKey(tile)==='castle'&&tile.ownerId===enemy;
        }
        if(action.type!=='move')return false;
        // 仅作有界触发探测，不代替网络连动；最多TopK次，耗时包含在决策墙钟。
        this.check();this.triggerProbes++;const branch=engine.clone();if(branch.step(action).info.includes('非法动作'))throw Error('事件守卫触发探测非法');if(branch.isTerminal())return branch.getState().winner===getAllianceId(state,this.player);
        const previousTile=state.map.tiles[action.to.y][action.to.x],nextTile=branch.getState().map.tiles[action.to.y][action.to.x];
        if(getTileTerrainKey(previousTile)==='castle'&&previousTile.ownerId===enemy&&nextTile.ownerId===this.player)return true;
        if(branch.getState().currentPlayer!==this.player)return false;
        return branch.getLegalActions(this.player,{unitId:action.unitId,skipMovement:true,skipRecruitment:true}).some(a=>{
            if(a.type==='attack')return state.units.filter(u=>u.ownerId===enemy).length===1||state.units.some(u=>u.id===a.targetId&&isCommanderUnit(state,u,enemy));
            if(a.type!=='capture')return false;const unit=branch.getState().units.find(u=>u.id===a.unitId)!;const tile=branch.getState().map.tiles[unit.pos.y][unit.pos.x];return getTileTerrainKey(tile)==='castle'&&tile.ownerId===enemy;
        });
    }
    private critical(engine:GameEngine){
        const state=engine.getState();return state.units.filter(u=>u.ownerId===this.player&&(u.id===this.criticalActor||isCommanderUnit(state,u,this.player)));
    }
    private responseCandidates(engine:GameEngine,candidateActor:string|undefined){
        const s=engine.getState(),targets=s.units.filter(u=>u.ownerId===this.player&&(u.id===candidateActor||u.id===this.criticalActor||isCommanderUnit(s,u,this.player)));
        beginFocusScope();beginThreatScope();const singles=movingThreat(engine,targets),out:{actions:Action[];kind:string;damage:number;lethal:number}[]=[];
        for(const target of targets){
            const focus=focusThreat(engine,target.id),single=singles.get(target.id),w=single?.witness as {move:Action|null;attack:Action}|undefined;
            if(focus.witness.length)out.push({actions:focus.witness,kind:'三单位集火:'+target.id,damage:focus.damage,lethal:focus.lethal});
            if(w&&(!focus.witness.length||(single?.damage??0)>focus.damage||(single?.lethal??0)>focus.lethal))out.push({actions:[...(w.move?[w.move]:[]),w.attack],kind:'单军移动攻击:'+target.id,damage:single!.damage,lethal:single!.lethal});
        }
        out.sort((a,b)=>b.lethal-a.lethal||b.damage-a.damage||(a.kind<b.kind?-1:1));
        const proposed=this.policy(engine);for(const i of topIndexes(proposed,2))out.push({actions:[proposed.x.actions[i]],kind:'对手策略候选',damage:0,lethal:0});
        const seen=new Set<string>();return out.filter(p=>{const key=p.actions.map(encodeAction).join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,this.options.oppProbeK);
    }

    /** 原evaluateCandidate结构：根动作→己方模型连动→回合末→对手Maximin。 */
    public evaluateCandidate(engine:GameEngine,playerId:number,action:Action,rootIndex=-1):Evaluation{
        if(rootIndex<0){this.before=engine.getState();this.player=playerId;this.started=performance.now();this.nodes=0;this.inferenceCache=new Map();this.criticalActor=actorId(action,this.before,this.before);}
        const sim=engine.clone(),plan:{state:string;action:Action}[]=[],responses:any[]=[];let complete=true;
        const friendlyActions:Action[]=[];let freeAttacks=0,events=friendlyEvents(this.before,this.before,playerId,[],0);
        const ownHp=(s:GameState,id:number)=>s.units.filter(u=>u.ownerId===id).reduce((n,u)=>n+u.hp,0),enemy=this.before.players.find(p=>p.id!==playerId)!.id;
        const takeFriendly=(a:Action)=>{const old=sim.getState();if(!this.step(sim,a))return false;friendlyActions.push(a);const after=sim.getState();if(a.type==='attack'&&ownHp(after,playerId)>=ownHp(old,playerId)&&ownHp(after,enemy)<ownHp(old,enemy))freeAttacks++;return true;};
        let maxCommanderLost=0,maxCriticalActorLost=0;
        const observed=(branch:GameEngine)=>{const v=this.leaf(branch);maxCommanderLost=Math.max(maxCommanderLost,v.ownCommanderLost);maxCriticalActorLost=Math.max(maxCriticalActorLost,v.criticalActorLost);return v;};
        const packed=(v:Leaf,done:boolean):Evaluation=>({...v,complete:done,maxCommanderLost,maxCriticalActorLost,friendlyEvents:events,friendlyPlan:plan,responses,rootIndex,code:encodeAction(action)});
        if(!takeFriendly(action))return packed(observed(sim),false);
        const id=actorId(action,this.before,sim.getState());
        if(this.options.arm==='bounded')for(let i=0;i<this.options.friendlyRolloutSteps;i++){
            if(sim.isTerminal()||sim.getState().currentPlayer!==playerId)break;
            const nonEnd=legalActions(sim).filter(a=>a.type!=='end_turn');if(!nonEnd.length)break;
            if(!this.check()){complete=false;break;}
            const policy=this.policy(sim,nonEnd),follow=policy.x.actions[policy.out.best],state=JSON.stringify(sim.getState());
            if(!takeFriendly(follow)){complete=false;break;}plan.push({state,action:follow});
        }
        events=friendlyEvents(this.before,sim.getState(),playerId,friendlyActions,freeAttacks);
        if(!sim.isTerminal()&&sim.getState().currentPlayer===playerId){
            const end=sim.getLegalActions(playerId,{skipMovement:true,skipRecruitment:true}).find(a=>a.type==='end_turn');
            if(end){if(!this.step(sim,end))complete=false;}else complete=false;
        }
        const neutral=observed(sim);let worst=neutral,hasResponse=false;
        if(this.options.arm==='value_rerank'||sim.isTerminal()||!complete)return packed(worst,complete);
        if(sim.getState().currentPlayer===playerId)return packed(worst,false);
        const probes=this.responseCandidates(sim,id);
        for(const proposal of probes){
            if(this.nodes+proposal.actions.length>this.options.maxNodes){complete=false;break;}
            const probe=sim.clone();for(const response of proposal.actions){if(!this.step(probe,response)){complete=false;break;}}
            let candidate=observed(probe);const responseActions=[...proposal.actions];
            const last=proposal.actions.at(-1);
            // 修复公共版本只走一个原子的问题：移动回应后继续展开同一单位的合法攻击。
            if(last?.type==='move'&&!probe.isTerminal()&&probe.getState().currentPlayer===sim.getState().currentPlayer){
                const attacks=probe.getLegalActions(probe.getState().currentPlayer,{unitId:last.unitId,onlyAttacks:true});
                if(attacks.length){
                    const ranked=this.policy(probe,attacks),indexes=topIndexes(ranked,Math.min(2,attacks.length));
                    for(const index of indexes){
                        if(!this.check()){complete=false;break;}
                        const child=probe.clone(),attack=ranked.x.actions[index];if(!this.step(child,attack)){complete=false;break;}
                        const attacked=observed(child);if(attacked.score<candidate.score){candidate=attacked;responseActions.splice(0,responseActions.length,...proposal.actions,attack);}
                    }
                }
            }
            responses.push({kind:proposal.kind,actions:responseActions,...candidate});if(!hasResponse||candidate.score<worst.score)worst=candidate;hasResponse=true;
            if(worst.score<=-4)break;
        }
        return packed(worst,complete);
    }

    public getAction(engine:GameEngine,playerId:number,preparedActions?:readonly Action[],preparedRoot?:Inference,memory:SearchMemory={}):Action{
        this.before=engine.getState();this.player=playerId;this.started=performance.now();this.nodes=0;this.triggerProbes=0;this.inferenceCache=new Map();this.evaluations=new Map();
        const pool=(preparedActions?.slice()??legalActions(engine)).filter(a=>a.type!=='surrender');if(!pool.length)throw Error('模型搜索没有合法非投降候选');
        this.root=preparedRoot??this.policy(engine,pool);const root=this.root,preferred=root.out.best;
        this.criticalActor=actorId(root.x.actions[preferred],this.before,this.before);
        const finish=(index:number,reason:string,commit=false)=>{
            const evaluation=this.evaluations.get(index);if(commit&&evaluation?.friendlyPlan.length)memory.queue=evaluation.friendlyPlan;
            this.lastDecision={index,nodes:this.nodes,triggerProbes:this.triggerProbes,variant:'verified_events',preferred:root.x.codes[preferred],selected:root.x.codes[index],triggered:this.evaluations.size>0,reason,traces:[...this.evaluations.values()].map(v=>({...v,friendlyPlan:v.friendlyPlan.map(p=>({action:p.action}))}))};return root.x.actions[index];
        };
        const queued=memory.queue?.[0];
        if(queued&&queued.state===JSON.stringify(this.before)){
            const index=root.x.codes.indexOf(encodeAction(queued.action));if(index>=0){memory.queue!.shift();return finish(index,'执行已验证的己方模型连动');}
        }
        delete memory.queue;
        if(pool.length===1)return finish(preferred,'唯一合法动作');
        if(this.options.maxNodes<2)return finish(preferred,'整局节点预算耗尽，保留模型默认');
        const indexes=topIndexes(root,this.options.topK),selected=root.x.actions[preferred],risk=root.x.focus[preferred];
        const danger=!!risk[1]||!!risk[5];
        const opportunity=indexes.some(i=>this.criticalOpportunity(engine,root.x.actions[i]));
        const closing=['end_turn','wait'].includes(selected.type)&&indexes.some(i=>['attack','capture','recruit_to_castle','recruit_and_deploy'].includes(root.x.actions[i].type));
        const probe=engine.clone();probe.step(selected);this.nodes++;const immediateLoss=probe.isTerminal()&&probe.getState().winner!==-1&&probe.getState().winner!==getAllianceId(this.before,playerId);
        if(this.options.arm==='bounded'&&!danger&&!opportunity&&!closing&&!immediateLoss)return finish(preferred,'非关键局面，保留模型默认');
        // 与原框架相同，缓存默认叶子，并只在显著优势或危险否决时接管。
        const leafOf=(index:number)=>{let result=this.evaluations.get(index);if(!result){result=this.evaluateCandidate(engine,playerId,root.x.actions[index],index);this.evaluations.set(index,result);}return result;};
        const primary=leafOf(preferred);if(!primary.complete)return finish(preferred,'默认分支未完成，保留模型默认');
        let bestIndex=preferred,best=primary;
        for(const index of indexes){
            if(index!==preferred&&!this.check())break;const result=leafOf(index);if(!result.complete)continue;
            if(result.naturalWin&&result.score>=4)return finish(index,'自然必胜直取',true);
            if(result.score>best.score+1e-10){best=result;bestIndex=index;}
        }
        if(bestIndex===preferred)return finish(preferred,'默认模型叶子最优');
        if(this.options.arm==='value_rerank'&&best.score>primary.score+.03)return finish(bestIndex,'Value单步重排');
        const unsafe=immediateLoss||danger||primary.maxCommanderLost>0||primary.maxCriticalActorLost>0;
        const complete=[...this.evaluations.values()].filter(v=>v.complete);
        const safer=complete.filter(v=>v.maxCommanderLost===0&&v.maxCriticalActorLost===0&&v.score>=primary.score+this.options.vetoMargin).sort((a,b)=>b.score-a.score||indexes.indexOf(a.rootIndex)-indexes.indexOf(b.rootIndex))[0];
        if(unsafe&&safer)return finish(safer.rootIndex,'Veto危险否决',true);
        const takeover=complete.filter(v=>verifiedTakeover(selected.type,primary.friendlyEvents,v.friendlyEvents)&&v.maxCommanderLost<=primary.maxCommanderLost&&v.maxCriticalActorLost<=primary.maxCriticalActorLost&&v.score>=primary.score+this.options.takeoverThreshold).sort((a,b)=>b.score-a.score||indexes.indexOf(a.rootIndex)-indexes.indexOf(b.rootIndex))[0];
        if(takeover)return finish(takeover.rootIndex,'Takeover实际事件接管',true);
        return finish(preferred,'未达接管/否决阈值，保留模型默认');
    }
}
