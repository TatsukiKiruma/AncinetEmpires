import { GameEngine } from '../../../src/game/engine';
import { createAppApkSkirmishGameState } from '../../../src/game/apk_skirmish_map_assets';
import { createB100Policy } from '../../v17/teachers/b100_policy';
import { encodeAction } from '../../../src/game/env';

async function testB100() {
    console.log("=== Testing createB100Policy on r4 Rules ===");

    // 1. 初始化 B100-R (逐局持久流)
    const handleR = createB100Policy({
        variant: 'B100-R',
        rootSeed: 20261014,
        seat: 0
    });

    // 2. 初始化 B100-Q (每状态确定性重置)
    const handleQ = createB100Policy({
        variant: 'B100-Q',
        rootSeed: 20261014,
        seat: 0,
        querySeed: 0
    });

    const state = createAppApkSkirmishGameState('(2) Duel.aem', 'SD');
    const engine = new GameEngine(state);

    const legalActions = engine.getLegalActions(0);
    console.log("Legal actions count:", legalActions.length);

    // Test B100-R decision
    const t0 = performance.now();
    const actionR = handleR.policy({
        state: engine.getState(),
        playerId: 0,
        allowed: legalActions,
        seat: 0,
        seed: 20261014
    });
    const timeR = performance.now() - t0;
    console.log("B100-R chose:", encodeAction(actionR), "in", timeR.toFixed(2), "ms");

    // Test B100-Q decision
    const t1 = performance.now();
    const actionQ = handleQ.policy({
        state: engine.getState(),
        playerId: 0,
        allowed: legalActions,
        seat: 0,
        seed: 20261014
    });
    const timeQ = performance.now() - t1;
    console.log("B100-Q chose:", encodeAction(actionQ), "in", timeQ.toFixed(2), "ms");

    // Repeat B100-Q
    const actionQ2 = handleQ.policy({
        state: engine.getState(),
        playerId: 0,
        allowed: legalActions,
        seat: 0,
        seed: 20261014
    });
    console.log("B100-Q repeat query chose:", encodeAction(actionQ2), "Match:", encodeAction(actionQ) === encodeAction(actionQ2));
}

testB100().catch(console.error);
