import { GameEngine } from '../../src/game/engine';
import { encodeAction } from '../../src/game/env';
import { isCommanderUnit } from '../../src/game/rule_config';
import { calculateDamage } from '../../src/game/rules';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { actorId } from '../tactical_scale_20261018/tactics';
import { nextOpponent,movingThreat,beginThreatScope } from './shared_single_threat';
import { evaluateLeaf,ledger,retaliation } from './leaf';
import { infer,legalActions,type Inference } from './policy_runtime';
import { SEARCH_PRIOR_WEIGHT } from './search_prior_config';
import { isProductiveFollow } from './plan_commit';
import { deploymentCandidates } from './deployment_candidates';
import { commanderHealthProtection } from './commander_health_guard';
import { proposeRootCandidate } from './candidate_proposal';
import { SEARCH_TOP_K,SEARCH_FOLLOW_NODES } from './search_budget';
import { recoverCompletion,type CompletedOption } from './completion_recovery';
import { recoverDeployment,type RejectedDeployment } from './deployment_recovery';
import { coverSafeRecruitment } from './safe_recruitment_coverage';
import type { Action,GameState } from '../../src/game/types';

export interface PlanStep {state:string;action:Action;}
export interface SearchMemory {queue?:PlanStep[];}
export interface SearchOptions {topK?:number;maxFollowNodes?:number;takeoverThreshold?:number;vetoMargin?:number;priorWeight?:number;}
type Leaf=ReturnType<typeof evaluateLeaf>;
type RejectedCompletion=Pick<Leaf,'score'|'riskKnown'|'commanderLethal'|'actorLethal'|'risks'>&{plan:PlanStep[]};
export interface Evaluation extends Leaf {index:number;action:Action;actor?:string;plan:PlanStep[];state:GameState;branch:GameEngine;deploymentMoveAvailable:boolean;deploymentDeferred?:boolean;finishRecovery?:RejectedCompletion;completionRechecks?:number;vetoProtection?:{id:string;known:boolean;lethal:boolean};vetoCommanderHealth?:ReturnType<typeof commanderHealthProtection>;freeAttacks:number;nodes:number;complete:boolean;policyConfidence?:number;rankScore?:number;}

/** TopK根候选加同单位完整连动；对手投影只参与风控，不进入己方叶子状态。 */
export class ModelBattleSearchAI {
    public lastDecision:any=null;
    private nodes=0;
    private baselineRisk:ReturnType<typeof retaliation>|undefined;
    private commanderVetoDeferred=false;
    private preservesActingDefender=false;
    private vetoSameActorPreferred=false;
    private vetoLeafRanked=false;
    private options:Required<SearchOptions>;
    constructor(private model:any,private oldSchema:any,options:SearchOptions={}){
        this.options={topK:options.topK??SEARCH_TOP_K,maxFollowNodes:options.maxFollowNodes??SEARCH_FOLLOW_NODES,takeoverThreshold:options.takeoverThreshold??.12,vetoMargin:options.vetoMargin??.03,priorWeight:options.priorWeight??SEARCH_PRIOR_WEIGHT};
    }
    private step(engine:GameEngine,a:Action){this.nodes++;const result=engine.step(a);if(result.info.includes('非法动作'))throw Error('同单位搜索分支非法:'+encodeAction(a));return result.state;}
    private completed(b:GameEngine,s:GameState,player:number,id?:string){return !id||b.isTerminal()||s.currentPlayer!==player||!b.getLegalActions(player,{unitId:id,skipRecruitment:true}).some(a=>actorId(a,s,s)===id);}
    /** 空城新兵只展开有即时战术机会的部署；所有节点计入原有同单位预算。 */
    private completeDeployment(before:GameState,root:GameEngine,player:number,id:string,actorStart:NonNullable<GameState['units'][number]>,countFree:(s:GameState,a:Action,after:GameState)=>number){
        const start=this.nodes,s=root.getState(),rootLegal=root.getLegalActions(player,{unitId:id,skipRecruitment:true}),moves=deploymentCandidates(s,actorStart,rootLegal);
        const allowed=(a:Action)=>['attack','capture','heal','summon','destroy_town','repair','support','wait'].includes(a.type);
        const paths:(Extract<Action,{type:'move'}>|undefined)[]=[...(rootLegal.some(a=>allowed(a)&&a.type!=='wait')?[undefined]:[]),...moves];
        let chosen:{branch:GameEngine;state:GameState;plan:PlanStep[];leaf:Leaf;freeAttacks:number;finishRecovery?:RejectedCompletion}|undefined;
        const rejected:RejectedDeployment[]=[];
        const room=()=>this.nodes-start<this.options.maxFollowNodes;
        for(const move of paths){
            if(this.options.maxFollowNodes-(this.nodes-start)<(move?2:1))break;
            const moving=root.clone(),moved=move?this.step(moving,move):s,follows=moving.getLegalActions(player,{unitId:id,skipRecruitment:true}).filter(allowed);
            const priority=(a:Action)=>a.type==='capture'?100:a.type==='attack'?50+calculateDamage(moved,a.attackerId,a.targetId):a.type==='wait'?0:1;
            follows.sort((a,b)=>priority(b)-priority(a)||(encodeAction(a)<encodeAction(b)?-1:1));
            let best:{branch:GameEngine;state:GameState;action:Action;score:number;freeAttacks:number}|undefined;
            const retained:CompletedOption[]=[],stateText=JSON.stringify(moved),movePlan:PlanStep[]=move?[{state:JSON.stringify(s),action:move}]:[];
            for(const follow of follows.slice(0,3)){
                if(!room())break;
                const b=moving.clone(),after=this.step(b,follow),v=ledger(moved,after,player),ready=(t:GameState)=>t.units.filter(u=>u.ownerId===player&&!u.hasActed).length;
                const score=v.net+.05*v.healingNet/1024+(v.goldSpent===0?.03*v.recruitedValue/1024:0)+.025*(ready(after)-ready(moved))/32+.18*v.castles+.09*v.towns+.5*v.enemyCommanderKills;
                retained.push({branch:b,state:after,plan:[...movePlan,{state:stateText,action:follow}],lightScore:score,freeAttacks:countFree(moved,follow,after)});
                if(!best||score>best.score+1e-10)best={branch:b,state:after,action:follow,score,freeAttacks:countFree(moved,follow,after)};
            }
            if(!best)continue;
            const plan:PlanStep[]=[...(move?[{state:JSON.stringify(s),action:move}]:[]),{state:JSON.stringify(moved),action:best.action}];
            const finishes:{branch:GameEngine;state:GameState;plan:PlanStep[]}[]=[];
            if(this.completed(best.branch,best.state,player,id))finishes.push({branch:best.branch,state:best.state,plan});
            else{
                const actor=best.state.units.find(u=>u.id===id),enemies=best.state.units.filter(u=>u.ownerId!==player);
                const posts=best.branch.getLegalActions(player,{unitId:id,skipRecruitment:true}).filter((a):a is Extract<Action,{type:'post_attack_move'}>=>a.type==='post_attack_move');
                const distance=(a:Extract<Action,{type:'post_attack_move'}>)=>Math.min(...enemies.map(u=>Math.abs(u.pos.x-a.to.x)+Math.abs(u.pos.y-a.to.y)),1000);
                posts.sort((a,b)=>Number(b.to.x===actor?.pos.x&&b.to.y===actor?.pos.y)-Number(a.to.x===actor?.pos.x&&a.to.y===actor?.pos.y)||distance(b)-distance(a)||(encodeAction(a)<encodeAction(b)?-1:1));
                for(const post of posts.slice(0,2)){if(!room())break;const b=best.branch.clone(),after=this.step(b,post);if(this.completed(b,after,player,id))finishes.push({branch:b,state:after,plan:[...plan,{state:JSON.stringify(best.state),action:post}]});}
            }
            for(const finished of finishes){
                const leaf=evaluateLeaf(before,finished.branch,player,id,this.model,this.oldSchema,actorStart),candidate={...finished,leaf,freeAttacks:best.freeAttacks};
                if(leaf.riskKnown&&(leaf.commanderLethal||leaf.actorLethal))rejected.push({leaf,plan:finished.plan,options:retained});
                if(!leaf.naturalWin&&!isProductiveFollow({...leaf,complete:true,plan:finished.plan,freeAttacks:best.freeAttacks}))continue;
                if(!chosen||leaf.score>chosen.leaf.score)chosen=candidate;
            }
        }
        // 原贪心路径被风险否决时，仍保留该路径已经执行的其他完结以供有界复核。
        const deferredLeaf=chosen?undefined:evaluateLeaf(before,root,player,id,this.model,this.oldSchema,actorStart);
        const recovered=recoverDeployment(before,player,id,actorStart,chosen?.leaf??deferredLeaf!,rejected,this.model,this.oldSchema);
        if(recovered.chosen){
            const {option,rejected:old}=recovered.chosen;
            chosen={branch:option.branch,state:option.state,plan:option.plan,leaf:recovered.leaf,freeAttacks:option.freeAttacks,finishRecovery:{score:old.leaf.score,riskKnown:old.leaf.riskKnown,commanderLethal:old.leaf.commanderLethal,actorLethal:old.leaf.actorLethal,risks:old.leaf.risks,plan:old.plan}};
        }
        return {chosen,deferredLeaf,rechecks:recovered.rechecks,nodes:this.nodes-start};
    }
    public evaluateCandidate(engine:GameEngine,player:number,action:Action,index=-1):Evaluation{
        const before=engine.getState();let plan:PlanStep[]=[],branch=engine.clone(),freeAttacks=0;
        const countFree=(s:GameState,a:Action,after:GameState)=>{
            if(a.type!=='attack')return 0;
            const actor=s.units.find(u=>u.id===a.attackerId),next=after.units.find(u=>u.id===a.attackerId);
            return Number(!!actor&&!!next&&next.hp>=actor.hp&&calculateDamage(s,a.attackerId,a.targetId)>0);
        };
        let current=this.step(branch,action);freeAttacks+=countFree(before,action,current);
        const id=actorId(action,before,current),actorStart=before.units.find(u=>u.id===id)??current.units.find(u=>u.id===id);let followNodes=0,deploymentMoveAvailable=false;
        if(id&&actorStart&&action.type==='recruit_to_castle'&&actorStart.apkPendingRecruitSource==='empty_castle'&&current.currentPlayer===player&&branch.getLegalActions(player,{unitId:id,skipRecruitment:true}).some(a=>a.type==='move')){
            const deployed=this.completeDeployment(before,branch,player,id,actorStart,countFree),best=deployed.chosen;
            if(best)return {...best.leaf,index,action,actor:id,plan:best.plan,state:best.state,branch:best.branch,deploymentMoveAvailable:true,freeAttacks:best.freeAttacks,nodes:deployed.nodes+1,complete:true,finishRecovery:best.finishRecovery,completionRechecks:deployed.rechecks||undefined};
            // 没有找到可执行的有效部署时，叶子就是实际招募后状态，不能虚构一个未提交的wait。
            const leaf=deployed.deferredLeaf!;
            return {...leaf,index,action,actor:id,plan:[],state:current,branch,deploymentMoveAvailable:true,deploymentDeferred:true,freeAttacks:0,nodes:deployed.nodes+1,complete:false,completionRechecks:deployed.rechecks||undefined};
        }
        let stayCompletion:{branch:GameEngine;state:GameState;plan:PlanStep[];freeAttacks:number}|undefined;
        const completedOptions:CompletedOption[]=[],rootState=current;
        const finishAllowed=action.type!=='recruit_to_castle'||actorStart?.apkPendingRecruitSource==='empty_castle';
        // 仅访问根actor；不会因为队友未行动而提交end_turn。
        for(let depth=0;depth<2&&id&&finishAllowed&&!branch.isTerminal();depth++){
            const s=current,unit=s.units.find(u=>u.id===id);
            let stateText:string|undefined;const serializedState=()=>stateText??=JSON.stringify(s);
            if(s.currentPlayer!==player||!unit)break;
            const allFollow=branch.getLegalActions(player,{unitId:id,skipRecruitment:true});if(depth===0)deploymentMoveAvailable=allFollow.some(a=>a.type==='move');
            const follow=allFollow.filter(a=>['attack','capture','heal','summon','destroy_town','repair','support','wait','post_attack_move'].includes(a.type));
            let best:{action:Action;engine:GameEngine;state:GameState;score:number}|undefined;
            // 待机是完整行动的基准，余下按轻量真实战术收益排序，不调用策略网络。
            const stays=(a:Action)=>a.type==='wait'||a.type==='post_attack_move'&&a.to.x===unit.pos.x&&a.to.y===unit.pos.y;
            follow.sort((a,b)=>Number(stays(b))-Number(stays(a))||(encodeAction(a)<encodeAction(b)?-1:1));
            for(const a of follow){
                if(followNodes>=this.options.maxFollowNodes)break;
                const b=branch.clone(),after=this.step(b,a);followNodes++;
                // 复用本次枚举已执行的原位完结分支；不为安全回退增加己方搜索节点。
                if(depth===0&&stays(a))stayCompletion={branch:b,state:after,plan:[{state:serializedState(),action:a}],freeAttacks:freeAttacks+countFree(s,a,after)};
                const events=ledger(s,after,player),ready=(v:GameState)=>v.units.filter(u=>u.ownerId===player&&!u.hasActed).length;
                // 治疗和无金币支出的召唤单列，仅用于同单位后续的轻量排序。
                let score=events.net+.05*events.healingNet/1024+(events.goldSpent===0?.03*events.recruitedValue/1024:0)+.025*(ready(after)-ready(s))/32+.18*events.castles+.09*events.towns+.5*events.enemyCommanderKills;
                if(depth===0&&action.type==='move'&&!stays(a))completedOptions.push({branch:b,state:after,plan:[{state:serializedState(),action:a}],freeAttacks:freeAttacks+countFree(s,a,after),lightScore:score});
                if(a.type==='post_attack_move'){
                    const reply=nextOpponent(b,player),target=reply.branch.getState().units.find(u=>u.id===id);beginThreatScope();
                    if(reply.known&&target&&!reply.branch.isTerminal())score-=.001*(movingThreat(reply.branch,[target]).get(id)?.damage??0);
                }
                // 相同收益保留当前最佳，避免无收益二次移动改变安全落点。
                if(!best||score>best.score+1e-10)best={action:a,engine:b,state:after,score};
            }
            if(!best)break;
            const old=current;plan.push({state:serializedState(),action:best.action});
            branch=best.engine;current=best.state;freeAttacks+=countFree(old,best.action,current);
        }
        let leaf=evaluateLeaf(before,branch,player,id,this.model,this.oldSchema,actorStart),finishRecovery:RejectedCompletion|undefined;
        const greedyLeaf=leaf,greedyPlan=plan;
        const isComplete=(b:GameEngine,s:GameState)=>this.completed(b,s,player,id);
        if(!leaf.naturalWin&&leaf.riskKnown&&(leaf.commanderLethal||leaf.actorLethal)&&stayCompletion&&isComplete(stayCompletion.branch,stayCompletion.state)&&JSON.stringify(stayCompletion.plan.map(p=>p.action))!==JSON.stringify(plan.map(p=>p.action))){
            const safeLeaf=evaluateLeaf(before,stayCompletion.branch,player,id,this.model,this.oldSchema,actorStart);
            if(safeLeaf.riskKnown&&!safeLeaf.commanderLethal&&!safeLeaf.actorLethal&&safeLeaf.score>leaf.score){
                finishRecovery={score:leaf.score,riskKnown:leaf.riskKnown,commanderLethal:leaf.commanderLethal,actorLethal:leaf.actorLethal,risks:leaf.risks,plan};
                leaf=safeLeaf;branch=stayCompletion.branch;current=stayCompletion.state;plan=stayCompletion.plan;freeAttacks=stayCompletion.freeAttacks;
            }
        }
        let completionRechecks:number|undefined;
        if(id&&actorStart&&!greedyLeaf.naturalWin&&greedyLeaf.riskKnown&&(greedyLeaf.commanderLethal||greedyLeaf.actorLethal)&&completedOptions.length){
            const recovery=recoverCompletion(before,rootState,player,id,actorStart,greedyLeaf,leaf,completedOptions,greedyPlan,this.model,this.oldSchema,isComplete);completionRechecks=recovery.rechecks||undefined;
            if(recovery.completion){
                finishRecovery??={score:greedyLeaf.score,riskKnown:greedyLeaf.riskKnown,commanderLethal:greedyLeaf.commanderLethal,actorLethal:greedyLeaf.actorLethal,risks:greedyLeaf.risks,plan:greedyPlan};
                leaf=recovery.leaf;branch=recovery.completion.branch;current=recovery.completion.state;plan=recovery.completion.plan;freeAttacks=recovery.completion.freeAttacks;
            }
        }
        return {...leaf,index,action,actor:id,plan,state:current,branch,deploymentMoveAvailable,finishRecovery,completionRechecks,freeAttacks,nodes:followNodes+1,complete:isComplete(branch,current)};
    }
    public getAction(engine:GameEngine,player:number,actions:Action[]=legalActions(engine),prepared?:Inference,memory:SearchMemory={}):Action{
        this.nodes=0;this.baselineRisk=undefined;this.commanderVetoDeferred=false;this.preservesActingDefender=false;this.vetoSameActorPreferred=false;this.vetoLeafRanked=false;const before=engine.getState(),queue=memory.queue?.[0];
        // 已验证同单位后续在原始状态和合法动作同时匹配时直接执行，无需重复根网络。
        if(queue&&queue.state===JSON.stringify(before)&&actions.some(a=>encodeAction(a)===encodeAction(queue.action))){
            memory.queue!.shift();this.lastDecision={preferred:encodeAction(queue.action),selected:encodeAction(queue.action),reason:'已验证同单位连动',triggered:false,changed:false,planCommitted:true,nodes:0,branchPolicyCalls:0,rootFeatureEncodes:0,rootPolicyCalls:0,proposalPolicyCalls:0,traces:[]};return queue.action;
        }
        delete memory.queue;
        const root=prepared??infer(engine,actions,this.model,this.oldSchema),primaryIndex=root.out.best,traces:Evaluation[]=[];
        const priorOrder=root.prior.map((_,i)=>i).sort((a,b)=>root.prior[b]-root.prior[a]||a-b);
        const seedK=Math.min(6,this.options.topK);
        let indexes=[primaryIndex,...priorOrder.filter(i=>i!==primaryIndex)].slice(0,seedK);
        let proposalIndex:number|undefined,proposalPolicyCalls=0;
        const finish=(index:number,reason:string)=>{
            const selected=traces.find(v=>v.index===index),productiveFollowCommitted=!!(index===primaryIndex&&selected&&!selected.naturalWin&&!selected.finishRecovery&&isProductiveFollow(selected)),intervention=index!==primaryIndex||!!selected?.naturalWin||!!selected?.finishRecovery||productiveFollowCommitted;
            // 安全且有收益的默认后续也应落实估值；普通无收益待机不能覆盖真实决策。
            const passiveDeploymentWait=!!selected&&selected.action.type.startsWith('recruit_')&&selected.deploymentMoveAvailable&&selected.plan.every(p=>p.action.type==='wait');
            // 未展开的新兵合法部署不能被轻量wait代替；后续由真实状态下的下一次决策处理。
            const planCommitted=!!(intervention&&selected?.complete&&selected.plan.length&&(!passiveDeploymentWait||selected.naturalWin));if(planCommitted)memory.queue=selected!.plan;
            this.lastDecision={preferred:root.x.codes[primaryIndex],selected:root.x.codes[index],reason:reason+(selected?.finishRecovery?'；同单位安全完结纠正':'')+(productiveFollowCommitted?'；落实安全有效同单位后续':''),triggered:traces.length>0,changed:index!==primaryIndex,planCommitted,productiveFollowCommitted,nodes:this.nodes,branchPolicyCalls:0,priorWeight:this.options.priorWeight,
                rootCandidateLimit:this.options.topK,followNodeLimit:this.options.maxFollowNodes,rootFeatureEncodes:1,rootPolicyCalls:1,proposalPolicyCalls,proposalIndex,commanderVetoDeferred:this.commanderVetoDeferred,preservesActingDefender:this.preservesActingDefender,vetoSameActorPreferred:this.vetoSameActorPreferred,vetoLeafRanked:this.vetoLeafRanked,baselineRisk:this.baselineRisk?{known:this.baselineRisk.known,risks:this.baselineRisk.risks.map(r=>({...r,replyState:undefined,focus:undefined}))}:undefined,
                traces:traces.map(v=>({...v,state:undefined,branch:undefined,plan:v.plan.map(p=>({action:p.action})),risks:v.risks.map(r=>({...r,replyState:undefined,focus:undefined})),finishRecovery:v.finishRecovery?{...v.finishRecovery,plan:v.finishRecovery.plan.map(p=>({action:p.action})),risks:v.finishRecovery.risks.map(r=>({...r,replyState:undefined,focus:undefined}))}:undefined}))};return root.x.actions[index];
        };
        if(actions.length===1)return finish(primaryIndex,'唯一合法动作');
        const selected=root.x.actions[primaryIndex],f=root.x.focus[primaryIndex];
        const dangerous=!!f[1]||!!f[5],closing=selected.type==='wait'||selected.type==='end_turn';
        const preferredActor=actorId(selected,before,before);
        const ownCommanders=new Set(before.units.filter(u=>u.ownerId===player&&isCommanderUnit(before,u,player)).map(u=>u.id));
        const safeRoot=(i:number)=>!!root.x.focus[i][7]&&!root.x.focus[i][1]&&!root.x.focus[i][5];
        const sameIntent=(a:Action)=>preferredActor?actorId(a,before,before)===preferredActor:'castlePos' in selected&&'castlePos' in a&&a.castlePos.x===selected.castlePos.x&&a.castlePos.y===selected.castlePos.y;
        const safeCommander=!!f[5]?priorOrder.filter(i=>ownCommanders.has(actorId(root.x.actions[i],before,before)??'')&&safeRoot(i)).slice(0,1):[];
        const safeSameActor=dangerous?priorOrder.filter(i=>sameIntent(root.x.actions[i])&&safeRoot(i)).slice(0,safeCommander.length?1:2):[];
        const eventRanks:number[]=[];
        const eventRank=(i:number):number=>{
            if(eventRanks[i]!==undefined)return eventRanks[i];
            const a=root.x.actions[i],features=root.x.extra[i];
            if(a.type==='attack'){
                const target=before.units.find(u=>u.id===a.targetId);
                if(target&&calculateDamage(before,a.attackerId,a.targetId)>=target.hp)return eventRanks[i]=isCommanderUnit(before,target,target.ownerId)?8:4;
            }
            if(a.type==='capture'||a.type==='move'&&!!features[2]){
                const pos=a.type==='move'?a.to:before.units.find(u=>u.id===a.unitId)?.pos,tile=pos?before.map.tiles[pos.y][pos.x]:undefined;
                if(tile&&getTileTerrainKey(tile)==='castle'&&tile.ownerId!==null&&tile.ownerId!==player)return eventRanks[i]=7;
                if(a.type==='capture')return eventRanks[i]=5;
            }
            if(a.type==='move'&&(!!features[1]||!!features[2]))return eventRanks[i]=4;
            if(a.type==='recruit_to_castle'&&before.units.some(u=>u.pos.x===a.castlePos.x&&u.pos.y===a.castlePos.y))return eventRanks[i]=0;
            if(a.type.startsWith('recruit_'))return eventRanks[i]=2;
            return eventRanks[i]=0;
        };
        // 敌指挥官斩杀和夺敌堡必须在普通动作时也有候选覆盖，不能只在回合收尾时检查。
        const critical=priorOrder.filter(i=>i!==primaryIndex&&eventRank(i)>=7).sort((a,b)=>eventRank(b)-eventRank(a)||root.prior[b]-root.prior[a]||a-b).slice(0,1);
        const eventCandidates=closing?priorOrder.filter(i=>i!==primaryIndex&&eventRank(i)>0).sort((a,b)=>eventRank(b)-eventRank(a)||root.prior[b]-root.prior[a]||a-b):[];
        // 保留根默认，优先覆盖关键事件，再按与主策略一致的分层置信分填满候选。
        const represented=new Set<string>(),events=eventCandidates.filter(i=>{const a=root.x.actions[i],kind=a.type.startsWith('recruit_')?'recruit':a.type;if(represented.has(kind))return false;represented.add(kind);return true;}).slice(0,3);
        indexes=[...new Set([primaryIndex,...critical,...safeCommander,...safeSameActor,...events,...indexes])].slice(0,seedK);
        // 安全与关键事件覆盖优先保留；扩量策略最多替换一个普通候选，不增加TopK预算。
        proposalIndex=proposeRootCandidate(root,indexes).index;proposalPolicyCalls=1;
        if(proposalIndex!==undefined)indexes=[...new Set([primaryIndex,...critical,...safeCommander,...safeSameActor,proposalIndex,...indexes])].slice(0,seedK);
        // 原六根完整保留，再按原策略先验补足容量，不能因扩容丢掉已验证安全解。
        indexes=[...new Set([...indexes,...priorOrder])].slice(0,this.options.topK);
        indexes=coverSafeRecruitment(before,root,indexes,seedK);
        const opportunity=indexes.some(i=>{const a=root.x.actions[i],c=root.x.extra[i];return ['attack','capture','recruit_to_castle','recruit_and_deploy'].includes(a.type)||a.type==='move'&&(!!c[0]||!!c[1]||!!c[2]);});
        if(!dangerous&&!closing&&!opportunity)return finish(primaryIndex,'非关键局面保留策略');
        const evaluate=(a:Action,i:number)=>{const v=this.evaluateCandidate(engine,player,a,i);v.policyConfidence=root.prior[i];v.rankScore=v.score+this.options.priorWeight*v.policyConfidence;return v;};
        const primary=evaluate(selected,primaryIndex);traces.push(primary);
        if(primary.naturalWin)return finish(primaryIndex,'默认动作自然获胜');
        if(!primary.complete&&!primary.deploymentDeferred)return finish(primaryIndex,'当前单位需继续部署或超出连动预算，保留策略默认');
        for(const i of indexes){if(i!==primaryIndex)traces.push(evaluate(root.x.actions[i],i));}
        const wins=traces.filter(v=>v.naturalWin);if(wins.length)return finish(wins[0].index,'Takeover自然获胜');
        const safe=(v:Evaluation)=>(v.complete||v.deploymentDeferred&&v.action.type==='recruit_to_castle'&&v.recruits>0)&&v.riskKnown&&!v.commanderLethal&&!v.actorLethal&&(v.state.winner===null||v.naturalWin||v.state.winner===-1);
        const ranked=[...traces].sort((a,b)=>b.rankScore!-a.rankScore!||indexes.indexOf(a.index)-indexes.indexOf(b.index));
        let commanderVeto=primary.commanderLethal;
        const commitsCommander=primary.risks.some(r=>r.commander&&r.lethal&&r.id===primary.actor);
        const commitsTurn=selected.type==='end_turn'||primary.state.currentPlayer!==player;
        // 只复用已展开的同actor连动：若当前单位能解除指挥官危险，完结它也会消耗防守机会。
        this.preservesActingDefender=commanderVeto&&!!primary.actor&&traces.some(v=>v.index!==primary.index&&v.actor===primary.actor&&v.complete&&v.riskKnown&&!v.commanderLethal&&(v.state.winner===null||v.naturalWin||v.state.winner===-1));
        if(commanderVeto&&!commitsCommander&&!commitsTurn&&!primary.ownCommanderLost&&!this.preservesActingDefender){
            // 原位已有危险不能归咎于一个尚未交出回合的远端行动；逐指挥官比较新危险。
            // 行动指挥官自己的完结、真实换手和即时指挥官损失仍立即执行原Veto。
            this.baselineRisk=retaliation(engine,player);
            const oldLethal=new Set(this.baselineRisk.risks.filter(r=>r.commander&&r.lethal).map(r=>r.id));
            const newLethal=primary.risks.some(r=>r.commander&&r.lethal&&!oldLethal.has(r.id));
            if(this.baselineRisk.known&&!newLethal){commanderVeto=false;this.commanderVetoDeferred=true;}
        }
        if(commanderVeto||primary.actorLethal&&primary.highValueActor){
            const protectsOriginalActor=(v:Evaluation)=>{
                if(commanderVeto||v.actor===primary.actor||!primary.actor||!before.units.some(u=>u.id===primary.actor))return true;
                const present=v.state.units.some(u=>u.id===primary.actor);
                if(!present){v.vetoProtection={id:primary.actor,known:true,lethal:true};return false;}
                // 备选换了行动者时仍检查原高价单位，不能靠更换观察目标制造安全结论。
                const checked=retaliation(v.branch,player,primary.actor),risk=checked.risks.find(r=>r.id===primary.actor);
                v.vetoProtection={id:primary.actor,known:checked.known&&!!risk,lethal:!risk||!!risk.lethal};
                if(risk&&!v.risks.some(r=>r.id===risk.id))v.risks.push(risk);
                return v.vetoProtection.known&&!v.vetoProtection.lethal;
            };
            const preservesCommanderHealth=(v:Evaluation)=>{v.vetoCommanderHealth=commanderHealthProtection(before,player,primary,v);return v.vetoCommanderHealth.every(r=>r.preserved);};
            const checked=new Map<Evaluation,boolean>(),acceptable=(v:Evaluation)=>{
                if(!checked.has(v))checked.set(v,safe(v)&&v.tactical>=primary.tactical-.15&&preservesCommanderHealth(v)&&protectsOriginalActor(v));
                return checked.get(v)!;
            };
            // 策略首选已被致死见证否决后，按叶子真实收益与风控排序；同分才优先原actor。
            const vetoRanked=[...traces].sort((a,b)=>Math.abs(b.score-a.score)>1e-10?b.score-a.score:Number(b.actor===primary.actor)-Number(a.actor===primary.actor)||indexes.indexOf(a.index)-indexes.indexOf(b.index));
            const safer=vetoRanked.find(acceptable);
            this.vetoSameActorPreferred=!!safer&&safer.complete&&safer.actor===primary.actor;
            this.vetoLeafRanked=!!safer&&safer.index!==primaryIndex;
            if(safer&&safer.index!==primaryIndex)return finish(safer.index,'Veto可重放致死风险');
        }
        const candidate=ranked.find(v=>v.index!==primaryIndex&&safe(v)&&(
            v.enemyCommanderKills>primary.enemyCommanderKills||v.enemyCastlesCaptured>primary.enemyCastlesCaptured||
            closing&&(v.recruits>primary.recruits||v.captures>primary.captures||v.enemyKills>primary.enemyKills||v.freeAttacks>primary.freeAttacks&&v.net>0)||
            v.net>=primary.net&&v.tactical>primary.tactical+this.options.takeoverThreshold&&v.rankScore!>primary.rankScore!+this.options.vetoMargin));
        if(candidate)return finish(candidate.index,'Takeover实际战术收益');
        return finish(primaryIndex,this.commanderVetoDeferred?'指挥官既有风险未由当前动作新增，保留后续队友行动':'未达接管或否决条件');
    }
}
