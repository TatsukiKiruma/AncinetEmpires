import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/game/demo_map';
import { getApkSkirmishRuleConfig } from '../src/game/apk_skirmish';
import type { Action, GameState } from '../src/game/types';
import { searchTeacherAction, handToOpponent, type SearchTeacherConfig } from './skirmish_search_teacher';
import { PlanningNode } from '../src/game/ai/planning';
import { encodeAction } from '../src/game/env';

function demo(): GameState {
    return createDemoState(getApkSkirmishRuleConfig('SD') as never);
}

describe('N03 搜索集合保留与真实对手阶段曝光测试（F03 / F04）', () => {
    it('F03反例：低启发式分但模型高推荐的候选动作必须保留在最终展开集合（不被启发式截断抹掉）', () => {
        const s = demo();
        const playerId = 0;
        // 构造一个合法的待选动作，模型打分最高（9999），但启发式打分极低（或默认排序在 beam 之外）
        const testAction = s.units.find(u => u.ownerId === playerId && u.hp > 0);
        expect(testAction).toBeDefined();
        const targetWaitAction: Action = { type: 'wait', unitId: testAction!.id };
        const waitCode = encodeAction(targetWaitAction);

        const config: Partial<SearchTeacherConfig> = {
            beamWidth: 3, // 很窄的 beam
            heuristicTopK: 3,
            modelTopK: 2,
            nodeBudget: 20
        };

        // 模拟 modelScorer：强烈推荐 waitCode
        const modelScorer = (_state: GameState, _pId: number, actions: readonly Action[]) => {
            const map = new Map<string, number>();
            for (const a of actions) {
                map.set(encodeAction(a), encodeAction(a) === waitCode ? 9999 : -1000);
            }
            return map;
        };

        const decision = searchTeacherAction({
            state: s,
            playerId,
            config,
            modelScorer
        });

        // 验证：waitCode 作为模型顶级推荐，必须存在于最终评估的 candidates 中，不能被纯启发式 top 3 挤掉
        const found = decision.candidates.some(c => c.code === waitCode);
        expect(found).toBe(true);
    });

    it('F04反例：处于本方阶段但无 end_turn 时（如 pending 状态），不得谎报已切换至对手阶段', () => {
        const s = demo();
        const commander = s.units.find(u => u.ownerId === 0)!;
        commander.apkPendingRecruitSource = 'commander_castle';
        s.pendingUnitId = commander.id;
        s.currentPlayer = 0;

        // 1. 直接单元测试 handToOpponent：未切换阵营且无 end_turn 时返回 incomplete，绝不能返回 ok
        const node = PlanningNode.root(s, 0, { nodeBudget: 10 });
        const handed = handToOpponent(node, 0);
        expect(handed.stop).toBe('incomplete');
        expect(handed.node.currentAllianceId).toBe(0);

        // 2. 搜索推演测试：当己方后续不补动作（ownFollowupDepth: 0）且候选为 move 时，
        // 移动后依然处于 pending 状态无法交出击，该候选绝不能伪造对手回应
        const decision = searchTeacherAction({
            state: s,
            playerId: 0,
            config: { ownFollowupDepth: 0, nodeBudget: 10 }
        });

        const moveCand = decision.candidates.find(c => c.action.type === 'move');
        if (moveCand) {
            expect(moveCand.sawOpponentPhase).toBe(false);
            expect(moveCand.opponentReplyCodes).toHaveLength(0);
        }
    });

    it('逐候选回应：selectedSawOpponentPhase 必须真实反映选中候选，而非搜索中其他候选', () => {
        const s = demo();
        const decision = searchTeacherAction({
            state: s,
            playerId: 0,
            config: { nodeBudget: 15 }
        });

        const selected = decision.candidates.find(c => c.code === decision.selectedCode);
        expect(selected).toBeDefined();
        expect(decision.selectedSawOpponentPhase).toBe(selected!.sawOpponentPhase);
    });

    it('N03-A 在线预算时效：850ms 停止新增搜索，返回合法 incumbent，不超过 1000ms', () => {
        const s = demo();
        let currentTime = 100000;
        const fakeNow = () => currentTime;

        // 模拟时间流逝：每次 now() 调用增加时间
        let callCount = 0;
        const steppingNow = () => {
            callCount += 1;
            if (callCount > 3) {
                currentTime += 300; // 模拟较慢的推演
            }
            return currentTime;
        };

        const decision = searchTeacherAction({
            state: s,
            playerId: 0,
            config: {
                deadlineMs: 1000,
                searchStopElapsedMs: 850,
                returnTargetElapsedMs: 950
            },
            now: steppingNow
        });

        expect(decision.selectedCode).toBeTruthy();
        expect(decision.candidates.length).toBeGreaterThan(0);
        // 耗时控制
        expect(decision.elapsedMs).toBeLessThanOrEqual(1000);
    });
});
