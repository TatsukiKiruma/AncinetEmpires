import { GameEngine } from '../../src/game/engine';
import { encodeAction, decodeAction } from '../../src/game/env';
import { observe } from '../../src/ai_runtime/sd_v1/observation';
import { encode as oldEncode, forward as oldForward } from '../sd64x3_phone_20261016/model';
import { tacticalFeatures as oldTactics } from '../sd64x3_phone_20261016/tactics';
import { extractFeatures } from './complete_tactics';
import { encodeFeatures, observationState } from './encoding';
import { forward, decode, type Decoder } from './model';
import { groupKey } from './sources';
import type { Action } from '../../src/game/types';
import { hash } from './io';
import { forwardGroup } from './group_model';

export function choosePolicy(engine: GameEngine, legal: Action[], model: any, oldSchema: any, decoder: Decoder | 'hierarchical', baseline: boolean) {
    const state = engine.getState(), packet = observe(observationState(state), legal);
    const actions = packet.codes.map(code => decodeAction(code)!);
    const groups = actions.map(groupKey);
    let logits: number[], value: number, extra: number[][] | null = null, input: unknown;
    let hierarchicalIndex: number | undefined;
    if (baseline) {
        input = oldEncode(packet, model.schema, oldTactics(engine, actions));
        ({ logits, value } = oldForward(input as any, model.schema, model.weights));
    } else {
        const features = extractFeatures(engine, actions);
        extra = features.extra;
        input = encodeFeatures(packet, oldSchema, features);
        if (model.schema.version.startsWith('sd-hierarchical-residual-ln-')) {
            const result = forwardGroup({ ...input as any, actionGroups: groups }, model);
            ({ logits, value } = result); hierarchicalIndex = result.best;
        } else ({ logits, value } = forward(input as any, model));
    }
    const index = hierarchicalIndex ?? decode(logits, groups, decoder as Decoder);
    const action = actions[index];
    if (!legal.some(a => encodeAction(a) === encodeAction(action))) throw Error('策略返回非法动作');
    return { action, index, extra: extra?.[index] ?? null, code: packet.codes[index], inputHash: hash(input), logitsHash: hash(logits), value,
        decoder, chosenLogit: logits[index], candidates: logits.length };
}
