import { GameEngine } from '../../src/game/engine';
import { calculateArmyValue } from '../../src/game/env';
import { getScalarRule,getTileIncome,isCommanderUnit,areEnemyPlayers } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { calculateDamage } from '../../src/game/rules';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { fields,type Sparse } from '../sd64x3_phone_20261016/model';
import { observationState } from '../tactical_scale_20261018/encoding';
import { beginFocusScope,focusThreat,type FocusRisk } from './focus_threat';
import { forwardValue } from '../tactical_value_search_20261018/value_model';
import type { GameState } from '../../src/game/types';

export const VALUE_KEYS=['own','enemy'].flatMap(side=>['gold','units','hp','commander_hp','commanders','income','towns','castles','army','ready','focus_damage','focus_lethal','single_damage','focus_relaxed'].map(k=>side+'.'+k));
export const SUMMARY_KEYS=[...VALUE_KEYS,'turn','phase.opening','phase.middle','phase.late','can_still_recruit','has_free_attack','risk_known.own','risk_known.enemy'];
export interface StateRisk {id:string;owner:number;known:boolean;risk:FocusRisk;}
export const STATE_VALUE_AUDIT={attackWitnessSteps:0};
const emptyRisk=():FocusRisk=>({damage:0,lethal:0,relaxed:0,attackers:0,single:0,witness:[],afterHashInput:''});
export function economy(s:GameState,id:number){
    const units=s.units.filter(u=>u.ownerId===id),commanders=units.filter(u=>isCommanderUnit(s,u,id)),base=getScalarRule(s,'incomeCommanderBase'),growth=getScalarRule(s,'incomeCommanderGrowth');
    let towns=0,castles=0,income=commanders.reduce((n,u)=>n+base+(u.level??0)*growth,0);
    for(const row of s.map.tiles)for(const t of row)if(t.ownerId===id){const k=getTileTerrainKey(t);towns+=Number(k==='town');castles+=Number(k==='castle');income+=getTileIncome(s,t);}
    return {gold:s.players.find(p=>p.id===id)?.gold??0,units,commanders,towns,castles,income,army:calculateArmyValue(s,id)};
}

/** 当前原位风险：仅投影对手回合，不遍历、不执行任何未来候选。 */
export function opponentSnapshot(engine:GameEngine,player:number,snapshot?:GameState){
    const branch=engine.clone();let state=snapshot??engine.getState();
    if(!branch.isTerminal()&&state.currentPlayer===player){
        const end=branch.getLegalActions(player,{skipMovement:true,skipRecruitment:true}).find(a=>a.type==='end_turn');
        if(!end)return {branch,state,known:false};
        state=branch.step(end).state;
    }
    return {branch,state,known:branch.isTerminal()||areEnemyPlayers(state,player,state.currentPlayer)};
}
export function commanderRisks(engine:GameEngine,prepared:StateRisk[]=[],snapshot?:GameState):StateRisk[]{
    const s=snapshot??engine.getState(),out:StateRisk[]=[...prepared];if(!prepared.length)beginFocusScope();
    for(const p of s.players){
        const commanders=s.units.filter(u=>u.ownerId===p.id&&isCommanderUnit(s,u,p.id));
        if(!commanders.length)continue;
        const reply=s.currentPlayer===p.id?opponentSnapshot(engine,p.id,s):{branch:engine,state:s,known:true};
        const after=reply.state;
        for(const u of commanders){
            if(out.some(r=>r.id===u.id))continue;
            const present=after.units.some(v=>v.id===u.id);
            const r=present&&reply.known&&!reply.branch.isTerminal()?focusThreat(reply.branch,u.id,after):emptyRisk();
            out.push({id:u.id,owner:p.id,known:reply.known,risk:present?r:{...r,damage:u.hp,lethal:1}});
        }
    }
    return out;
}

export function stateSummary(engine:GameEngine,providedRisks?:StateRisk[],snapshot?:GameState){
    STATE_VALUE_AUDIT.attackWitnessSteps=0;
    const s=snapshot??engine.getState(),own=s.currentPlayer,enemy=s.players.find(p=>p.id!==own)!.id,risks=providedRisks??commanderRisks(engine,[],s),out:number[]=[];
    for(const id of [own,enemy]){
        const e=economy(s,id),r=risks.filter(v=>v.owner===id);
        out.push(e.gold/1024,e.units.length/32,e.units.reduce((n,u)=>n+u.hp,0)/4096,e.commanders.reduce((n,u)=>n+u.hp,0)/128,e.commanders.length,e.income/512,e.towns/32,e.castles/32,e.army/1024,e.units.filter(u=>!u.hasActed).length/32,
            Math.max(0,...r.map(v=>v.risk.damage))/128,Math.max(0,...r.map(v=>v.risk.lethal)),Math.max(0,...r.map(v=>v.risk.single))/128,Math.max(0,...r.map(v=>v.risk.relaxed))/128);
    }
    // 只查询静态全局合法集合。免费攻击按真实引擎即时结算核验，最多找到一个见证。
    const global=engine.getLegalActions(own,{skipMovement:true});
    const canRecruit=global.some(a=>a.type.startsWith('recruit_'));
    const freeAttack=global.some(a=>{
        if(a.type!=='attack'||calculateDamage(s,a.attackerId,a.targetId)<=0)return false;
        STATE_VALUE_AUDIT.attackWitnessSteps++;
        const old=s.units.find(u=>u.id===a.attackerId)!,after=engine.clone().step(a).state;
        return (after.units.find(u=>u.id===old.id)?.hp??0)>=old.hp;
    });
    out.push(Math.min(s.turn,100)/100,Number(s.turn<=5),Number(s.turn>5&&s.turn<=15),Number(s.turn>15),Number(canRecruit),Number(freeAttack),Number(risks.filter(v=>v.owner===own).every(v=>v.known)),Number(risks.filter(v=>v.owner===enemy).every(v=>v.known)));
    return out.map(Math.fround);
}

const embeddingCaches=new WeakMap<object,WeakMap<Sparse,number[]>>();
/** 实体编码与策略同源，空候选观察不触发候选特征、寻路或引擎step。 */
const tokenCaches=new WeakMap<object,{lookup:Map<string,number>;rows:Map<string,Sparse>}>();
export function stateTokens(s:GameState,oldSchema:any){
    const packet=observe(observationState(s),[]);
    let cache=tokenCaches.get(oldSchema);
    if(!cache){cache={lookup:new Map(oldSchema.token.keys.map((k:string,i:number)=>[k,i])),rows:new Map()};tokenCaches.set(oldSchema,cache);}
    const tokens=packet.tokens.map(record=>{
        const key=JSON.stringify(record);let row=cache!.rows.get(key);
        if(!row){row=fields(record).map(([key,v])=>{const i=cache!.lookup.get(key);if(i===undefined)throw Error('未知状态特征:'+key);return [i,Math.fround(v)] as [number,number];}).sort((a,b)=>a[0]-b[0]);if(cache!.rows.size>16000)cache!.rows.clear();cache!.rows.set(key,row);}
        return row;
    });
    return {tokens,groups:packet.groups,candidates:[],refs:[],codes:[]};
}
export function pooledContext(x:ReturnType<typeof stateTokens>,model:any){
    const h=model.schema.hidden,w=model.weights,eb=model.schema.token.keys.length*h,context=Array(4*h+4).fill(0),counts=[0,0,0,0];
    let cache=embeddingCaches.get(model);if(!cache){cache=new WeakMap();embeddingCaches.set(model,cache);}
    x.tokens.forEach((token,t)=>{
        // 状态token已由内容缓存复用；按只读token身份命中嵌入，减少重复JSON分配。
        let e=cache!.get(token);
        if(!e){e=w.slice(eb,eb+h);for(const [i,v] of token)for(let j=0;j<h;j++)e[j]+=v*w[i*h+j];e=e.map(v=>Math.max(0,v));cache!.set(token,e);}
        const g=x.groups[t];counts[g]++;for(let j=0;j<h;j++)context[g*h+j]+=e[j];
    });
    for(let g=0;g<4;g++){for(let j=0;j<h;j++)context[g*h+j]/=Math.max(1,counts[g]);context[4*h+g]=counts[g]/1024;}
    return context;
}
export function valueInput(context:number[],summary:number[]){return [...context,...summary,summary[8]-summary[22]];}
export function evaluateValue(engine:GameEngine,model:any,oldSchema:any,risks?:StateRisk[],snapshot?:GameState){
    const s=snapshot??engine.getState(),context=pooledContext(stateTokens(s,oldSchema),model),summary=stateSummary(engine,risks,s);
    return forwardValue(valueInput(context,summary),model.valueWeights).value;
}
