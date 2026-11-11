import type { GameState } from '../../src/game/types';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode, type Schema, type Encoded } from '../sd64x3_phone_20261016/model';
import { NEW_KEYS } from './tactics';

/** 仅将人口上限字段可逆重命名到旧观察schema；该副本绝不用于执行规则。 */
export function observationState(state: GameState): GameState {
    if (state.rules?.populationLimit === undefined) return state;
    const copy = structuredClone(state), rules = copy.rules! as NonNullable<GameState['rules']> & { allowZeroPopulationRecruitAtLimit?: boolean };
    if (rules.unitLimit !== undefined || rules.allowZeroPopulationRecruitAtLimit !== true) throw Error('旧schema投影前提不满足');
    rules.unitLimit = rules.populationLimit;
    delete rules.populationLimit;
    delete rules.allowZeroPopulationRecruitAtLimit;
    for (const team of Object.values(rules.teams ?? {})) {
        if (team.populationLimit !== undefined) { if (team.unitLimit !== undefined) throw Error('队伍上限含混'); team.unitLimit = team.populationLimit; delete team.populationLimit; }
    }
    return copy;
}

export function encodeFeatures(packet: ReturnType<typeof observe>, oldSchema: Schema, features: { old: number[][]; extra: number[][] }): Encoded {
    const x = encode(packet, oldSchema, features.old);
    const offset = oldSchema.candidate.keys.length;
    return { ...x, candidates: x.candidates.map((row, i) => [...row, ...features.extra[i].map((v, j) => [offset + j, v] as [number, number])]) };
}

export function newSchema(old: Schema) {
    return { ...old, version: 'sd-tactical-conditional-pc-v2', candidate: { keys: [...old.candidate.keys, ...NEW_KEYS] },
        autoAdvance: true, numericDtype: 'float64', featureCountV2: NEW_KEYS.length, oldCandidateCount: old.candidate.keys.length };
}
