import { describe, expect, it } from 'vitest';
import { AncientEmpiresEnv, encodeAction, mulberry32 } from '../env';
import { createDefaultAppGameState } from '../default_state';
import { ApkLikeAI } from './apk_like_ai';

describe('APK 风格近似策略的公共规则接口', () => {
    it('固定种子重复产生相同动作，且每步遵守引擎合法集合', () => {
        const run = () => {
            const env = new AncientEmpiresEnv({ initialState: createDefaultAppGameState(), seed: 42, maxPlies: 200 });
            const ai = new ApkLikeAI(mulberry32(42));
            let result = env.reset();
            const trace: string[] = [];
            for (let step = 0; step < 25 && !result.done; step += 1) {
                const action = ai.getAction(env.getEngine(), env.getCurrentPlayer(), result.legalActions);
                const code = encodeAction(action);
                expect(result.legalActions.map(encodeAction)).toContain(code);
                trace.push(code);
                result = env.stepAction(action);
                expect(result.info).not.toContain('非法动作');
            }
            return trace;
        };
        const trace = run();
        expect(trace.length).toBeGreaterThan(0);
        expect(run()).toEqual(trace);
    });
});
