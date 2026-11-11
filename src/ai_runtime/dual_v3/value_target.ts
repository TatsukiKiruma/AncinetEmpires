import type { GameState } from '../../game/types';
import { getAllianceId } from '../../game/rule_config';
import type { PlayerOrder,OutcomeTarget } from '../dual_v2/contract';

/** 六槽标签只分配给有效槽；平局按联盟均分，避免联盟人数差异制造偏置。 */
export function trainingValueTarget(state:GameState,order:PlayerOrder,reliable:boolean,winner:number|null):OutcomeTarget {
    const target=new Float32Array(6);if(!reliable||winner===null)return {target,valueMask:false};
    const groups=new Map<number,number[]>();
    for(let s=0;s<6;s++){const id=order.playerIds[s];if(id===null||!order.active[s])continue;const alliance=getAllianceId(state,id);if(winner!==-1&&alliance!==winner)continue;const slots=groups.get(alliance)??[];slots.push(s);groups.set(alliance,slots);}
    if(!groups.size)throw Error('可靠自然终局没有有效目标槽');
    for(const slots of groups.values())for(const slot of slots)target[slot]=1/groups.size/slots.length;
    return {target,valueMask:true};
}
