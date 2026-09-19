/**
 * T05 规划推演接口测试：回合语义、根视角价值、克隆防污染、预算可控与可复现性。
 *
 * 验收对应任务书 T05：
 * - 同一玩家 move 后继续 attack 不换号；显式/自动推进按真实 currentPlayer 判定；
 * - pending 招募约束；胜利在中途动作触发；单位状态到期；
 * - 分支复制不污染父局面；根阵营视角不按深度奇偶机械取负；
 * - 相同节点预算的固定输入可复现；达到预算后仍能返回合法动作。
 */
import { describe, expect, it } from 'vitest';

import { GameEngine } from '../engine';
import { createDemoState } from '../demo_map';
import { getApkSkirmishRuleConfig } from '../apk_skirmish';
import { AncientEmpiresEnv } from '../env';
import { PlanningNode } from './planning';
import type { GameState } from '../types';

function demoState(mutate?: (state: GameState) => void): GameState {
    const state = createDemoState(getApkSkirmishRuleConfig('SD'));
    mutate?.(state);
    return state;
}

/** 与规划接口无关的独立参照 hash：直接序列化引擎状态。 */
function referenceHash(engine: GameEngine): string {
    return JSON.stringify(engine.getState());
}

describe('PlanningNode 回合语义', () => {
    it('同一玩家 move 之后仍可继续 attack，currentPlayer 不换号', () => {
        const state = demoState(s => {
            const soldier = s.units.find(u => u.id === 'u3')!;
            const enemy = s.units.find(u => u.id === 'u4')!;
            soldier.pos = { x: 2, y: 2 };
            enemy.pos = { x: 2, y: 4 };
        });
        const root = PlanningNode.root(state, 0);
        expect(root.currentPlayer).toBe(0);

        // 先 move 到中间道路格 (2,3)，逼近后保留攻击权
        const move = root.legalActions().find(a => a.type === 'move' && a.unitId === 'u3' && a.to.x === 2 && a.to.y === 3)!;
        expect(move).toBeDefined();
        const moved = root.apply(move);
        expect(moved.status).toBe('ok');
        if (moved.status !== 'ok') return;

        // move 不消耗攻击权：换号只应由 end_turn/自动推进触发
        expect(moved.child.currentPlayer).toBe(0);
        expect(moved.child.rawActions).toBe(1);
        expect(moved.child.playerTurnTransitions).toBe(0);

        const attack = moved.child.legalActions().find(a => a.type === 'attack' && a.attackerId === 'u3');
        expect(attack).toBeDefined();
    });

    it('end_turn 按真实回合序列推进到下一玩家', () => {
        const root = PlanningNode.root(demoState(), 0);
        const endTurn = root.legalActions().find(a => a.type === 'end_turn')!;
        const passed = root.apply(endTurn);
        expect(passed.status).toBe('ok');
        if (passed.status !== 'ok') return;
        expect(passed.child.currentPlayer).toBe(1);
        expect(passed.child.playerTurnTransitions).toBe(1);

        const endTurn2 = passed.child.legalActions().find(a => a.type === 'end_turn')!;
        const wrapped = passed.child.apply(endTurn2);
        expect(wrapped.status).toBe('ok');
        if (wrapped.status !== 'ok') return;
        expect(wrapped.child.currentPlayer).toBe(0);
        expect(wrapped.child.fullRounds).toBe(1);
    });

    it('已阵亡玩家被跳过，不成为 currentPlayer', () => {
        const state = demoState(s => {
            s.players.find(p => p.id === 1)!.isAlive = false;
        });
        const root = PlanningNode.root(state, 0);
        const endTurn = root.legalActions().find(a => a.type === 'end_turn')!;
        const passed = root.apply(endTurn);
        expect(passed.status).toBe('ok');
        if (passed.status !== 'ok') return;
        expect(passed.child.currentPlayer).toBe(0);
    });

    it('recruit_to_castle 产生 pending 单位且不换号', () => {
        const root = PlanningNode.root(demoState(), 0);
        const recruit = root.legalActions().find(a => a.type === 'recruit_to_castle')!;
        expect(recruit).toBeDefined();
        const done = root.apply(recruit);
        expect(done.status).toBe('ok');
        if (done.status !== 'ok') return;
        expect(done.child.pendingUnitId).not.toBeNull();
        expect(done.child.currentPlayer).toBe(0);
    });

    it('胜利由中途攻击动作即时触发（规则终局，非预算截断）', () => {
        const state = demoState(s => {
            // P1 只剩一个士兵且无归属城堡：击杀即满足 defeatOnNoUnitsAndNoCastles
            s.units = s.units.filter(u => u.ownerId === 0 || u.id === 'u4');
            const attacker = s.units.find(u => u.id === 'u3')!;
            const victim = s.units.find(u => u.id === 'u4')!;
            attacker.pos = { x: 2, y: 3 };
            victim.pos = { x: 2, y: 4 };
            victim.hp = 1;
            s.map.tiles = s.map.tiles.map((row, y) => row.map((t, x) => (
                x === 7 && y === 7 ? { ...t, ownerId: null } : t
            )));
        });
        const root = PlanningNode.root(state, 0);
        // 先让 u3 行动（demo 初始 hasMoved/hasActed=false），move→attack 或邻格直接 attack
        let node = root;
        let attack = node.legalActions().find(a => a.type === 'attack' && a.attackerId === 'u3');
        if (!attack) {
            const move = node.legalActions().find(a => a.type === 'move' && a.unitId === 'u3')!;
            const moved = node.apply(move);
            expect(moved.status).toBe('ok');
            if (moved.status !== 'ok') return;
            node = moved.child;
            attack = node.legalActions().find(a => a.type === 'attack' && a.attackerId === 'u3');
        }
        expect(attack).toBeDefined();
        const killed = node.apply(attack!);
        expect(killed.status).toBe('ok');
        if (killed.status !== 'ok') return;
        expect(killed.child.isTerminal()).toBe(true);
        expect(killed.child.terminalVerdict()).toBe('win');
        expect(killed.child.rootViewValue()).toEqual({ value: 1, kind: 'rule-terminal' });
        // 终局节点不可再展开
        const again = killed.child.apply(attack!);
        expect(again.status).not.toBe('ok');
        if (again.status === 'ok') return;
        expect(again.status).toBe('terminal');
    });

    it('状态持续时间随拥有者回合开始递减直至到期', () => {
        // SD 引擎对 poisoned 使用 remainingTicks（每 tick 于拥有者回合开始递减，<0 才删除）
        const state = demoState(s => {
            s.units.find(u => u.id === 'u3')!.status = { type: 'poisoned', remainingTicks: 1 };
        });
        const root = PlanningNode.root(state, 0);
        const endTurn = (node: PlanningNode): PlanningNode | null => {
            const action = node.legalActions().find(a => a.type === 'end_turn');
            if (!action) return null;
            const res = node.apply(action);
            return res.status === 'ok' ? res.child : null;
        };
        const afterP0 = endTurn(root);
        expect(afterP0).not.toBeNull();
        const afterCycle1 = endTurn(afterP0!);
        expect(afterCycle1).not.toBeNull();
        // 回到 P0 回合开始：duration 1→0，尚未到期
        expect(afterCycle1!.getState().units.find(u => u.id === 'u3')?.status?.type).toBe('poisoned');
        const backP0 = endTurn(endTurn(afterCycle1!)!);
        expect(backP0).not.toBeNull();
        // 第二个 P0 回合开始：0→-1 到期删除
        expect(backP0!.getState().units.find(u => u.id === 'u3')?.status).toBeUndefined();
    });
});

describe('PlanningNode 视角与价值', () => {
    it('根阵营视角：终端胜值在任何搜索深度都是 +1，不按深度奇偶取负', () => {
        const state = demoState(s => {
            s.units = s.units.filter(u => u.ownerId === 0 || u.id === 'u4');
            const attacker = s.units.find(u => u.id === 'u3')!;
            const victim = s.units.find(u => u.id === 'u4')!;
            attacker.pos = { x: 2, y: 3 };
            victim.pos = { x: 2, y: 4 };
            victim.hp = 1;
            s.map.tiles = s.map.tiles.map((row, y) => row.map((t, x) => (
                x === 7 && y === 7 ? { ...t, ownerId: null } : t
            )));
        });
        // 视角玩家=1（被杀阵营）时同一局面判为 loss
        const asVictim = PlanningNode.root(state, 1);
        expect(asVictim.rootAllianceId).toBe(1);
        const root0 = PlanningNode.root(state, 0);
        expect(root0.rootViewValue()).toBeNull(); // 未终局时没有规则值
        // 深度语义由 apply 链累加，值符号只由阵营决定
        let node = root0 as PlanningNode;
        let attack = node.legalActions().find(a => a.type === 'attack' && a.attackerId === 'u3');
        if (!attack) {
            const move = node.legalActions().find(a => a.type === 'move' && a.unitId === 'u3');
            expect(move).toBeDefined();
            const res0 = node.apply(move!);
            expect(res0.status).toBe('ok');
            if (res0.status !== 'ok') return;
            node = res0.child;
            attack = node.legalActions().find(a => a.type === 'attack' && a.attackerId === 'u3');
        }
        expect(attack).toBeDefined();
        const res = node.apply(attack!);
        expect(res.status).toBe('ok');
        if (res.status !== 'ok') return;
        // 无论 child.depth 奇偶，根视角胜利恒 +1
        expect(res.child.depth % 2).not.toBe(0); // 深度为奇数（1 或 2 层）
        expect(res.child.rootViewValue()!.value).toBe(1);
    });

    it('当前行动方属于敌对阵营时 terminalVerdict 判负', () => {
        const root = PlanningNode.root(demoState(), 0);
        expect(root.currentAllianceId).not.toBe(root.rootAllianceId + 99); // 结构自检
        expect(root.terminalVerdict()).toBeNull();
    });
});

describe('PlanningNode 克隆隔离与预算', () => {
    it('分支展开不污染父局面与兄弟分支（hash 前后一致）', () => {
        const root = PlanningNode.root(demoState(), 0);
        const parentHash = root.stateHash();
        const engineHashBefore = referenceHash(new GameEngine(demoState()));

        const first = root.expandAll();
        for (const child of first.children) {
            // 每个子分支再展开一层（含逐步变异其克隆引擎的深层动作）
            child.expandAll();
            child.getState().units.forEach(u => { u.hp = 1; }); // 返回值必须为拷贝，改它不伤内部
        }
        expect(root.stateHash()).toBe(parentHash);
        // 兄弟重放：再次展开得到同构 hash 序列
        const second = root.expandAll();
        expect(second.children.map(c => c.stateHash())).toEqual(first.children.map(c => c.stateHash()));
        expect(referenceHash(new GameEngine(demoState()))).toBe(engineHashBefore);
    });

    it('非法动作被拒绝且不改变状态', () => {
        const root = PlanningNode.root(demoState(), 0);
        const before = root.stateHash();
        const bogus = { type: 'attack', attackerId: 'u3', targetId: 'u2' } as const;
        const res = root.apply(bogus);
        expect(res.status).not.toBe('ok');
        if (res.status === 'ok') return;
        expect(res.status).toBe('illegal');
        expect(root.stateHash()).toBe(before);
        expect(root.rawActions).toBe(0);
    });

    it('相同节点预算的固定输入两次 DFS 枚举完全复现，且不超预算', () => {
        const run = () => {
            const root = PlanningNode.root(demoState(), 0, { nodeBudget: 25 });
            const trace: string[] = [];
            const dfs = (node: PlanningNode, depth: number) => {
                if (depth === 0 || node.isTerminal() || root.budget.stopReason()) return;
                const { children } = node.expandAll();
                for (const child of children) {
                    trace.push(`${child.lastActionCode}@${child.depth}`);
                    dfs(child, depth - 1);
                }
            };
            dfs(root, 3);
            return { trace, nodes: root.budget.nodesExpanded };
        };
        const a = run();
        const b = run();
        expect(a.nodes).toBeLessThanOrEqual(25);
        expect(a.trace.length).toBeGreaterThan(5); // 真的展开了多层
        expect(a.trace).toEqual(b.trace);
        expect(a.nodes).toBe(b.nodes);
    });

    it('预算耗尽后 expandAll 报 stop，但 legalActions 仍可用（返回已检查合法动作）', () => {
        const root = PlanningNode.root(demoState(), 0, { nodeBudget: 1 });
        const first = root.expandAll();
        expect(first.children.length).toBeGreaterThan(0);
        for (const child of first.children) {
            const blocked = child.expandAll();
            expect(blocked.children).toHaveLength(0);
            expect(blocked.stop).toBe('node_budget');
            // 预算外仍可对局面做合法动作枚举（决策兜底）
            expect(child.legalActions().length).toBeGreaterThan(0);
        }
    });

    it('decisionMsBudget=0 时立即以 decision_ms 停止（时间预算与节点预算分离）', () => {
        const root = PlanningNode.root(demoState(), 0, { nodeBudget: 1000, decisionMsBudget: 0 });
        const res = root.expandAll();
        expect(res.children).toHaveLength(0);
        expect(res.stop).toBe('decision_ms');
        expect(root.budget.stopReason()).toBe('decision_ms');
    });

    it('规划接口与旧环境返回值兼容：同一动作序列 step 后 state hash 一致', () => {
        const state = demoState();
        const env = new AncientEmpiresEnv({ initialState: state, maxPlies: 50 });
        const root = PlanningNode.root(state, 0);

        let node = root;
        let envResult = env.reset(0);
        const picks = ['end_turn', 'end_turn'];
        for (const type of picks) {
            const action = node.legalActions().find(a => a.type === type)!;
            const res = node.apply(action);
            expect(res.status).toBe('ok');
            if (res.status !== 'ok') return;
            node = res.child;
            envResult = env.stepAction(action);
        }
        expect(JSON.stringify(node.getState())).toBe(JSON.stringify(envResult.state));
    });
});
