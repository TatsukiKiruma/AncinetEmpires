import { expect, it } from 'vitest';
import { GameEngine } from '../../game/engine';
import { createDefaultAppGameState } from '../../game/default_state';
import { encodeAction } from '../../game/env';
import { retaliationFirst } from './retaliation_order';
import { tacticalActionPriors } from './tactical_prior';

it('真实合法前缀中的精确首选与全量困难战术排序相同，且不改引擎状态或随机流', () => {
    const engine = new GameEngine(createDefaultAppGameState());
    for (let step = 0; step < 45 && !engine.isTerminal(); step++) {
        const before = engine.getState(), legal = engine.getLegalActions(before.currentPlayer).filter(a => a.type !== 'surrender');
        const old = tacticalActionPriors(before, legal).map((p, i) => ({ ...p, action: legal[i] })).filter(p => !p.forbidden).sort((a, b) => b.prior - a.prior)[0];
        const chosen = retaliationFirst(engine);
        expect(chosen && encodeAction(chosen.action)).toBe(old && encodeAction(old.action));
        expect(engine.getState()).toEqual(before);
        engine.step(chosen?.action ?? legal[0]);
    }
});
