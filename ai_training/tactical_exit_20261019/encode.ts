import { GameEngine } from '../../src/game/engine';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { decodeAction } from '../../src/game/env';
import { encodeFeatures,observationState } from '../tactical_scale_20261018/encoding';
import { groupKey } from '../tactical_value_search_20261018/action_groups';
import { extractFeatures } from './combined_tactics';
import { stateSummary } from './value_state';
import type { Action } from '../../src/game/types';
export function encodePolicy(engine:GameEngine,legal:Action[],old:any){
    // 完整集合同时为所有同初态克隆提供权威合法性缓存。
    engine.getLegalActions(engine.getState().currentPlayer);
    const packet=observe(observationState(engine.getState()),legal),actions=packet.codes.map(c=>decodeAction(c)!),features=extractFeatures(engine,actions),base=encodeFeatures(packet,old,features),focus=features.focus;
    return {...base,candidates:base.candidates.map((r,i)=>[...r,...focus[i].map((v,j)=>[141+j,v] as [number,number])]),actionGroups:actions.map(groupKey),focus,actions,extra:features.extra};
}
export function encodeEngine(engine:GameEngine,legal:Action[],old:any){const x=encodePolicy(engine,legal,old);return {...x,valueSummary:stateSummary(engine)};}
