/**
 * T05 只读规划接口（搜索教师 / 评估基础设施共用，不改规则）。
 *
 * 设计要点（对应任务书 T05 执行详情）：
 * 1. 复用真实 GameEngine：读局面、取合法动作、克隆模拟、判真实终局全部走既有规则代码，
 *    不重写引擎、不放松合法性校验（unsafeBypassValidationForTests 恒为 false）。
 * 2. 值视角统一为根阵营视角：终局 +1/0/-1 只由 winner 联盟与 rootAllianceId 决定，
 *    绝不按搜索深度奇偶机械取负（根阵营之外阵营行动的叶子同样按根视角计值）。
 * 3. 正式规则终局与外部预算截断分离：isTerminal()/terminalVerdict() 只反映规则终局；
 *    node/time 预算耗尽由 BudgetStopReason 单独表达，截断节点没有规则值。
 * 4. 四类计数彼此独立：rawActions（成功应用的底层动作数）、playerTurnTransitions
 *    （apply 前后 currentPlayer 变化次数；一次动作内自动推进多玩家只算一次换行）、
 *    fullRounds（state.turn 增量）、nodesExpanded（生成的子节点数）。
 *    折扣/深度语义由上层（T07）显式选择时间单位，本层不隐含"一动作=一回合"。
 * 5. 克隆隔离：每个节点持有自己的 GameEngine 实例（构造时 JSON 深拷贝），
 *    getState() 返回深拷贝；分支展开不污染父节点或其他分支（测试钉桩 hash 不变）。
 * 6. 预算耗尽只拒绝 expandAll/apply，legalActions() 永远可用——保证
 *    "达到预算后能返回已检查合法的动作"。
 *
 * 旧环境（AncientEmpiresEnv）未做任何修改；本模块与 env 的 stepAction 在相同动作
 * 序列下产出相同状态（兼容性测试钉桩），旧 BC 奖励含义不受影响。
 */
import { GameEngine } from '../engine';
import { getAllianceId } from '../rule_config';
import { encodeAction } from '../env';
import type { Action, GameState } from '../types';

export interface PlanningBudgetSpec {
    /** 可复现节点预算：允许生成的子节点总数上限。 */
    nodeBudget: number;
    /** 真实时间预算（毫秒）；仅性能/在线使用，未设置则判定完全确定。 */
    decisionMsBudget?: number;
}

export type BudgetStopReason = 'node_budget' | 'decision_ms';

export class PlanningBudget {
    public nodesExpanded = 0;
    public rawActions = 0;
    public playerTurnTransitions = 0;
    public fullRounds = 0;

    private readonly spec: PlanningBudgetSpec;
    private readonly startMs = Date.now();

    constructor(spec: PlanningBudgetSpec) {
        this.spec = { ...spec };
    }

    public get nodeBudget(): number {
        return this.spec.nodeBudget;
    }

    public elapsedMs(): number {
        return Date.now() - this.startMs;
    }

    /** 非 null 表示预算已耗尽；节点预算优先于时间预算报告。 */
    public stopReason(): BudgetStopReason | null {
        if (this.nodesExpanded >= this.spec.nodeBudget) return 'node_budget';
        if (this.spec.decisionMsBudget !== undefined && this.elapsedMs() >= this.spec.decisionMsBudget) {
            return 'decision_ms';
        }
        return null;
    }

    public hasNodeCapacity(): boolean {
        return this.stopReason() === null;
    }
}

export type TerminalVerdict = 'win' | 'loss' | 'draw';

export interface RootRuleValue {
    value: 1 | 0 | -1;
    /** 只有规则终局才给值；预算截断永远不产生该字段——两者严格分离。 */
    kind: 'rule-terminal';
}

export type ApplyResult =
    | { status: 'ok'; child: PlanningNode }
    | { status: 'illegal' }
    | { status: 'terminal' }
    | { status: 'budget'; stop: BudgetStopReason };

export interface ExpandResult {
    children: PlanningNode[];
    /** 因预算未能全部展开时给出停止原因；全部展开则为 null。 */
    stop: BudgetStopReason | null;
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const entries = Object.keys(value as Record<string, unknown>)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
}

/** FNV-1a 64 位（BigInt）hex：仅用于测试/一致性核对，不在搜索热路径。 */
export function planningStateHash(state: GameState): string {
    const text = stableStringify(state);
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= BigInt(text.charCodeAt(i));
        hash = (hash * prime) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, '0');
}

export class PlanningNode {
    private readonly engine: GameEngine;
    private readonly budgetRef: PlanningBudget;

    /** 根视角阵营（构造时固化；联盟变化在 SD 规则下不存在，若未来支持需显式重算）。 */
    public readonly rootPlayerId: number;
    public readonly rootAllianceId: number;
    public readonly depth: number;
    /** 到达本节点所执行的动作（根节点为 null）。 */
    public readonly lastAction: Action | null;
    public readonly lastActionCode: string | null;

    private constructor(
        engine: GameEngine,
        rootPlayerId: number,
        budget: PlanningBudget,
        depth: number,
        lastAction: Action | null
    ) {
        this.engine = engine;
        this.rootPlayerId = rootPlayerId;
        this.budgetRef = budget;
        const state = engine.getState();
        this.rootAllianceId = getAllianceId(state, rootPlayerId);
        this.depth = depth;
        this.lastAction = lastAction;
        this.lastActionCode = lastAction === null ? null : encodeAction(lastAction);
    }

    public static root(state: GameState, rootPlayerId: number, spec?: PlanningBudgetSpec): PlanningNode {
        const budget = new PlanningBudget(spec ?? { nodeBudget: Number.MAX_SAFE_INTEGER });
        return new PlanningNode(new GameEngine(state), rootPlayerId, budget, 0, null);
    }

    public get budget(): PlanningBudget {
        return this.budgetRef;
    }

    /** 节点便捷视图：整棵已展开搜索树的累计计数（父子共享同一预算）。 */
    public get rawActions(): number {
        return this.budgetRef.rawActions;
    }

    public get playerTurnTransitions(): number {
        return this.budgetRef.playerTurnTransitions;
    }

    public get fullRounds(): number {
        return this.budgetRef.fullRounds;
    }

    public getState(): GameState {
        return this.engine.getState();
    }

    public stateHash(): string {
        return planningStateHash(this.engine.getState());
    }

    public get currentPlayer(): number {
        return this.engine.getState().currentPlayer;
    }

    public get currentAllianceId(): number {
        const state = this.engine.getState();
        return getAllianceId(state, state.currentPlayer);
    }

    public get turn(): number {
        return this.engine.getState().turn;
    }

    public get pendingUnitId(): string | null {
        return this.engine.getState().pendingUnitId ?? null;
    }

    public isTerminal(): boolean {
        return this.engine.isTerminal();
    }

    /** 规则终局裁决（根视角）；未终局返回 null。与预算截断严格分离。 */
    public terminalVerdict(): TerminalVerdict | null {
        const winner = this.engine.getWinner();
        if (winner === null) return null;
        if (winner === -1) return 'draw';
        return winner === this.rootAllianceId ? 'win' : 'loss';
    }

    /** 根视角规则值：胜 +1 / 负 -1 / 平 0；未终局返回 null（绝不猜测）。 */
    public rootViewValue(): RootRuleValue | null {
        const verdict = this.terminalVerdict();
        if (verdict === null) return null;
        return {
            value: verdict === 'win' ? 1 : verdict === 'loss' ? -1 : 0,
            kind: 'rule-terminal'
        };
    }

    /** 合法动作枚举不受预算限制：达到预算后仍须能返回已检查合法动作。 */
    public legalActions(): Action[] {
        return this.engine.getLegalActions(this.engine.getState().currentPlayer);
    }

    /**
     * 在克隆上执行动作。规则终局/非法/预算耗尽分别拒绝；父节点状态不变。
     * 计数语义见文件头第 4 条。
     */
    public apply(action: Action): ApplyResult {
        const stop = this.budgetRef.stopReason();
        if (stop !== null) return { status: 'budget', stop };
        if (this.isTerminal()) return { status: 'terminal' };

        const code = encodeAction(action);
        const legalCodes = this.legalActions().map(encodeAction);
        if (!legalCodes.includes(code)) {
            return { status: 'illegal' };
        }

        const before = this.engine.getState();
        const sim = this.engine.clone();
        const res = sim.step(action);
        if (res.info.includes('非法动作')) {
            return { status: 'illegal' };
        }
        const after = sim.getState();

        this.budgetRef.nodesExpanded += 1;
        this.budgetRef.rawActions += 1;
        if (after.currentPlayer !== before.currentPlayer) {
            this.budgetRef.playerTurnTransitions += 1;
        }
        if (after.turn > before.turn) {
            this.budgetRef.fullRounds += after.turn - before.turn;
        }

        return {
            status: 'ok',
            child: new PlanningNode(sim, this.rootPlayerId, this.budgetRef, this.depth + 1, action)
        };
    }

    /** 展开全部合法子节点；预算耗尽时停止并报告已生成部分与停止原因。 */
    public expandAll(): ExpandResult {
        const actions = this.legalActions();
        const children: PlanningNode[] = [];
        for (const action of actions) {
            if (!this.budgetRef.hasNodeCapacity()) {
                return { children, stop: this.budgetRef.stopReason() };
            }
            const res = this.apply(action);
            if (res.status !== 'ok') {
                if (res.status === 'budget') {
                    return { children, stop: res.stop };
                }
                // terminal/illegal 在此不可达：legalActions 已过滤，终局由上层判断
                continue;
            }
            children.push(res.child);
        }
        return { children, stop: null };
    }
}
