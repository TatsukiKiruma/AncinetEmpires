import { GameEngine } from '../../src/game/engine';
import { calculateDamage, getLegalActions } from '../../src/game/rules';
import { getEffectiveStats } from '../../src/game/abilities';
import type { Action, Unit,GameState } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';
import { beginMovementScope,movementGeometry as geometryCosts,cachedThreatMoves as legalMoves } from './movement_query_cache';
export { MOVEMENT_CACHE_AUDIT as FOCUS_GEOMETRY_AUDIT,clearMovementCache as clearFocusGeometryCache } from './movement_query_cache';

export interface FocusRisk { damage:number; lethal:number; relaxed:number; attackers:number; single:number; witness:Action[]; afterHashInput:string; }
let cache=new WeakMap<GameState,Map<string,FocusRisk>>();
export const FOCUS_AUDIT={calls:0,byTarget:new Map<string,number>()};
// 风险只在当前快照作用域复用；移动查询与单军威胁共用完整签名缓存。
export function beginFocusScope(){cache=new WeakMap();beginMovementScope();FOCUS_AUDIT.calls=0;FOCUS_AUDIT.byTarget.clear();}

/** 松弛候选只作提议；实际累计损血必须由不同敌军的权威动作见证。 */
function proposals(engine:GameEngine,target:Unit,used:Set<string>,snapshot?:GameState){
    const s=snapshot??engine.getState(),out:{id:string;damage:number;move:Action|null;attack:Action;key:string}[]=[];
    for(const unit of s.units){
        if(unit.ownerId!==s.currentPlayer||unit.hasActed||unit.apkStatic||used.has(unit.id))continue;
        const st=getEffectiveStats(unit),distance=Math.abs(unit.pos.x-target.pos.x)+Math.abs(unit.pos.y-target.pos.y);
        if(distance>Math.max(st.move,unit.movementRemaining??0)+st.maxRange&&geometryCosts(s,unit).positive)continue;
        const moves=unit.hasMoved?[]:legalMoves(engine,unit,s);
        let best:typeof out[number]|undefined;
        for(const move of [null,...moves]){
            const pos=move&&move.type==='move'?move.to:unit.pos,d=Math.abs(pos.x-target.pos.x)+Math.abs(pos.y-target.pos.y);
            if(d<st.minRange||d>st.maxRange)continue;
            const projectedUnit=move?{...unit,pos,hasMoved:true}:unit,pending=s.units.find(u=>u.id===s.pendingUnitId);
            // onlyAttacks只依赖行动者、目标和pending锁；其余单位不参与此纯攻击查询。
            // 真正的移动与攻击仍在包含全部单位的引擎分支上逐步复核执行。
            const units=[projectedUnit,...(target.id===unit.id?[]:[target]),...(pending&&pending.id!==unit.id&&pending.id!==target.id?[pending]:[])];
            const projected={...s,units};
            const attack=getLegalActions(projected,s.currentPlayer,{unitId:unit.id,onlyAttacks:true}).find(a=>a.type==='attack'&&a.targetId===target.id);
            if(!attack)continue;
            const damage=Math.min(target.hp,calculateDamage(projected,unit.id,target.id)),key=(move?encodeAction(move):'')+'|'+encodeAction(attack);
            if(!best||damage>best.damage||damage===best.damage&&key<best.key)best={id:unit.id,damage,move,attack,key};
        }
        if(best)out.push(best);
    }
    return out.sort((a,b)=>b.damage-a.damage||(a.key<b.key?-1:a.key>b.key?1:0));
}

/** 最多三个不同单位逐次执行；每次重算合法落点，因此不会占用同一非空格。 */
export function focusThreat(engine:GameEngine,targetId:string,snapshot?:GameState):FocusRisk{
    FOCUS_AUDIT.calls++;FOCUS_AUDIT.byTarget.set(targetId,(FOCUS_AUDIT.byTarget.get(targetId)??0)+1);
    const initial=snapshot??engine.getState(),target=initial.units.find(u=>u.id===targetId);
    // 无敌军可进入射程时直接返回零风险，避免克隆、状态序列化和空贪心循环。
    // 只有全部步价至少1的兵种才使用曼哈顿下界；零代价地形仍走完整权威路径。
    if(target&&!engine.isTerminal()){
        const reachable=initial.units.some(u=>{
            if(u.ownerId!==initial.currentPlayer||u.hasActed||u.apkStatic)return false;
            const st=getEffectiveStats(u),distance=Math.abs(u.pos.x-target.pos.x)+Math.abs(u.pos.y-target.pos.y);
            return distance<=Math.max(st.move,u.movementRemaining??0)+st.maxRange||!geometryCosts(initial,u).positive;
        });
        if(!reachable){let encoded:string|undefined;return {damage:0,lethal:0,relaxed:0,attackers:0,single:0,witness:[],get afterHashInput(){return encoded??=JSON.stringify(initial);}};}
    }
    // 快照在当前作用域只读，以身份缓存即可；完整状态字符串仅在审计真正读取时生成。
    let states=cache.get(initial);if(!states){states=new Map();cache.set(initial,states);}const prior=states.get(targetId);if(prior)return prior;
    let encoded:string|undefined;
    const out:FocusRisk={damage:0,lethal:0,relaxed:0,attackers:0,single:0,witness:[],get afterHashInput(){return encoded??=JSON.stringify(initial);}};
    if(!target||engine.isTerminal()){states.set(targetId,out);return out;}
    const used=new Set<string>(),player=initial.currentPlayer;
    const first=proposals(engine,target,used,initial);out.single=first[0]?.damage??0;out.relaxed=first.slice(0,3).reduce((s,p)=>s+p.damage,0);
    if(!first.length){states.set(targetId,out);return out;}
    const branch=engine.clone();let state=initial;
    for(let i=0;i<3&&!branch.isTerminal()&&state.currentPlayer===player;i++){
        const live=state.units.find(u=>u.id===targetId);if(!live)break;
        const p=(i===0?first:proposals(branch,live,used,state))[0];if(!p)break;
        // 自动换手或光环会改变后续动作，提交前重新核对权威合法集合。
        if(p.move){const result=branch.step(p.move);if(result.info.includes('非法动作'))throw Error('集火移动见证非法');state=result.state;out.witness.push(structuredClone(p.move));}
        if(branch.isTerminal()||state.currentPlayer!==player)break;
        const attack=branch.getLegalActions(player,{unitId:p.id,onlyAttacks:true}).find(a=>encodeAction(a)===encodeAction(p.attack));
        if(!attack)break;
        const result=branch.step(attack);if(result.info.includes('非法动作'))throw Error('集火攻击见证非法');state=result.state;
        out.witness.push(attack);used.add(p.id);out.attackers++;
    }
    const remaining=state.units.find(u=>u.id===targetId)?.hp??0;
    out.damage=Math.max(0,target.hp-remaining);out.lethal=Number(!state.units.some(u=>u.id===targetId));
    states.set(targetId,out);return out;
}
