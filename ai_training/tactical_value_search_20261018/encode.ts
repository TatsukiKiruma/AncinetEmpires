import { GameEngine } from '../../src/game/engine';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { decodeAction } from '../../src/game/env';
import { extractFeatures } from '../tactical_scale_20261018/complete_tactics';
import { encodeFeatures,observationState } from '../tactical_scale_20261018/encoding';
import { groupKey } from './action_groups';
import { extendFeatures,valueSummary } from './features';
import { armyFeature } from './value_input';
import type { Action } from '../../src/game/types';

export function encodeEngine(engine:GameEngine,legal:Action[],oldSchema:any,includeArmy=false){
    const s=engine.getState(),packet=observe(observationState(s),legal),actions=packet.codes.map(c=>decodeAction(c)!);
    const base=encodeFeatures(packet,oldSchema,extractFeatures(engine,actions)),focus=extendFeatures(engine,actions);
    return {...base,candidates:base.candidates.map((r,i)=>[...r,...focus[i].map((v,j)=>[141+j,v] as [number,number])]),actionGroups:actions.map(groupKey),valueSummary:valueSummary(s,focus),focus,actions,...(includeArmy?{valueArmy:armyFeature(s)}:{})};
}
