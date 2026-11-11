import { GameEngine } from '../../src/game/engine';
import { calculateDamage, getLegalActions } from '../../src/game/rules';
import { getEffectiveStats,getMoveCostForUnit } from '../../src/game/abilities';
import type { Action, Unit } from '../../src/game/types';
import { encodeAction } from '../../src/game/env';

export interface FocusRisk { damage:number; lethal:number; relaxed:number; attackers:number; witness:Action[]; afterHashInput:string; }
let cache=new Map<string,FocusRisk>();
let movesCache=new Map<string,Action[]>();
export function beginFocusScope(){cache=new Map();movesCache=new Map();}

/** 复用权威移动集合；只有全图步价至少1时才裁掉半径外占位。 */
function legalMoves(engine:GameEngine,unit:Unit){
    const s=engine.getState(),distance=Math.max(getEffectiveStats(unit).move,unit.movementRemaining??0);
    const positive=s.map.tiles.every(row=>row.every(t=>getMoveCostForUnit(s,unit,t)>=1));
    const occupants=s.units.filter(u=>!positive||Math.abs(u.pos.x-unit.pos.x)+Math.abs(u.pos.y-unit.pos.y)<=distance).map(u=>[u.id,u.ownerId,u.pos,u.unitClass]);
    const key=JSON.stringify([s.map,s.rules,s.currentPlayer,s.pendingUnitId,s.units.find(u=>u.id===s.pendingUnitId),s.players.map(p=>[p.id,p.isAlive]),unit,occupants]);
    let moves=movesCache.get(key);
    if(!moves){moves=engine.getLegalActions(s.currentPlayer,{unitId:unit.id,skipRecruitment:true}).filter(a=>a.type==='move');movesCache.set(key,moves);}
    return moves;
}

/** 松弛候选只作提议；实际累计损血必须由不同敌军的权威动作见证。 */
function proposals(engine:GameEngine,target:Unit,used:Set<string>){
    const s=engine.getState(),out:{id:string;damage:number;move:Action|null;attack:Action;key:string}[]=[];
    for(const unit of s.units){
        if(unit.ownerId!==s.currentPlayer||unit.hasActed||unit.apkStatic||used.has(unit.id))continue;
        const st=getEffectiveStats(unit),distance=Math.abs(unit.pos.x-target.pos.x)+Math.abs(unit.pos.y-target.pos.y);
        if(distance>Math.max(st.move,unit.movementRemaining??0)+st.maxRange)continue;
        const moves=unit.hasMoved?[]:engine.getLegalActions(s.currentPlayer,{unitId:unit.id,skipRecruitment:true}).filter(a=>a.type==='move');
        let best:typeof out[number]|undefined;
        for(const move of [null,...moves]){
            const pos=move&&move.type==='move'?move.to:unit.pos,d=Math.abs(pos.x-target.pos.x)+Math.abs(pos.y-target.pos.y);
            if(d<st.minRange||d>st.maxRange)continue;
            const projected=move?{...s,units:s.units.map(u=>u.id===unit.id?{...u,pos,hasMoved:true}:u)}:s;
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
export function focusThreat(engine:GameEngine,targetId:string):FocusRisk{
    const initial=engine.getState(),target=initial.units.find(u=>u.id===targetId);
    const key=JSON.stringify([initial,targetId]);const prior=cache.get(key);if(prior)return prior;
    const out:FocusRisk={damage:0,lethal:0,relaxed:0,attackers:0,witness:[],afterHashInput:JSON.stringify(initial)};
    if(!target||engine.isTerminal()){cache.set(key,out);return out;}
    const branch=engine.clone(),used=new Set<string>(),player=initial.currentPlayer;
    const first=proposals(branch,target,used);out.relaxed=first.slice(0,3).reduce((s,p)=>s+p.damage,0);
    for(let i=0;i<3&&!branch.isTerminal()&&branch.getState().currentPlayer===player;i++){
        const live=branch.getState().units.find(u=>u.id===targetId);if(!live)break;
        const p=(i===0?first:proposals(branch,live,used))[0];if(!p)break;
        // 自动换手或光环会改变后续动作，提交前重新核对权威合法集合。
        if(p.move){const result=branch.step(p.move);if(result.info.includes('非法动作'))throw Error('集火移动见证非法');out.witness.push(p.move);}
        if(branch.isTerminal()||branch.getState().currentPlayer!==player)break;
        const attack=branch.getLegalActions(player,{unitId:p.id,onlyAttacks:true}).find(a=>encodeAction(a)===encodeAction(p.attack));
        if(!attack)break;
        const result=branch.step(attack);if(result.info.includes('非法动作'))throw Error('集火攻击见证非法');
        out.witness.push(attack);used.add(p.id);out.attackers++;
    }
    const remaining=branch.getState().units.find(u=>u.id===targetId)?.hp??0;
    out.damage=Math.max(0,target.hp-remaining);out.lethal=Number(!branch.getState().units.some(u=>u.id===targetId));
    cache.set(key,out);return out;
}
