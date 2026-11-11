import { getEffectiveStats,hasAbility } from '../../src/game/abilities';
import { calculateDamage,inRange } from '../../src/game/rules';
import { areEnemyPlayers,areAlliedPlayers,isCommanderUnit } from '../../src/game/rule_config';
import { getTileTerrainKey } from '../../src/game/terrain_rules';
import { encodeAction } from '../../src/game/env';
import type { Action,GameState,Unit } from '../../src/game/types';

/** 只给已有合法移动排序；几何预估不作合法性或收益证明，实际分支仍由权威引擎执行。 */
export function deploymentCandidates(s:GameState,unit:Unit,actions:Action[]):Extract<Action,{type:'move'}>[] {
    const stats=getEffectiveStats(unit),enemy=s.units.filter(u=>areEnemyPlayers(s,unit.ownerId,u.ownerId));
    const priority=(a:Extract<Action,{type:'move'}>)=>{
        const tile=s.map.tiles[a.to.y][a.to.x],key=getTileTerrainKey(tile),canTake=tile.ownerId===null||!areAlliedPlayers(s,unit.ownerId,tile.ownerId);
        let score=canTake&&key==='castle'&&hasAbility(unit,'castle_capturer')?.18:canTake&&key==='town'&&hasAbility(unit,'village_capturer')?.09:0;
        const projected={...s,units:s.units.map(u=>u.id===unit.id?{...u,pos:a.to,hasMoved:true}:u)};
        for(const target of enemy)if(inRange(a.to,target.pos,stats.minRange,stats.maxRange)){
            const damage=calculateDamage(projected,unit.id,target.id);
            score=Math.max(score,damage/1024+(damage>=target.hp?(isCommanderUnit(s,target,target.ownerId)?.5:.01):0));
        }
        return score;
    };
    return actions.filter((a):a is Extract<Action,{type:'move'}>=>a.type==='move').map(a=>({a,score:priority(a)})).filter(v=>v.score>0).sort((a,b)=>b.score-a.score||encodeAction(a.a).localeCompare(encodeAction(b.a))).slice(0,4).map(v=>v.a);
}
