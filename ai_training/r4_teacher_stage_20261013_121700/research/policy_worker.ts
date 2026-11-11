import fs from 'fs';
import { GameEngine } from '../env/src/game/engine';
import { GameState, Action } from '../env/src/game/types';
import { HeuristicAI } from '../env/src/game/ai/heuristic_ai';
import { ApkLikeAI } from '../env/src/game/ai/apk_like_ai';
import { encodeAction } from '../env/src/game/env';

/**
 * 独立的子进程策略执行器
 * 通过子进程运行策略，支持被主裁判进程硬强杀
 */
async function main() {
    try {
        const inputStr = fs.readFileSync(0, 'utf-8');
        if (!inputStr) {
            console.log(JSON.stringify({ success: false, error: 'Empty stdin' }));
            return;
        }

        const data = JSON.parse(inputStr);
        const { policyType, state, playerId } = data;

        if (policyType === 'infinite_loop_test') {
            // 模拟死循环阻塞计算，测试主裁判的硬强杀能力
            const start = Date.now();
            while (Date.now() - start < 1000000) {
                // 阻塞循环
            }
        }

        const engine = new GameEngine(state as GameState);
        const legalActions = engine.getLegalActions(playerId);

        if (legalActions.length === 0) {
            console.log(JSON.stringify({ success: false, error: 'No legal actions' }));
            return;
        }

        let chosenAction: Action | null = null;
        if (policyType === 'heuristic') {
            const ai = new HeuristicAI();
            chosenAction = ai.getAction(engine, playerId);
        } else if (policyType === 'apk_like') {
            const ai = new ApkLikeAI();
            chosenAction = ai.getAction(engine, playerId);
        } else if (policyType === 'first_legal') {
            chosenAction = legalActions[0];
        } else {
            console.log(JSON.stringify({ success: false, error: `Unknown policyType: ${policyType}` }));
            return;
        }

        if (!chosenAction) {
            console.log(JSON.stringify({ success: false, error: 'Policy returned null' }));
            return;
        }

        const actionCode = encodeAction(chosenAction);
        console.log(JSON.stringify({ success: true, actionCode }));
    } catch (err: any) {
        console.log(JSON.stringify({ success: false, error: err?.message || String(err) }));
    }
}

main();
