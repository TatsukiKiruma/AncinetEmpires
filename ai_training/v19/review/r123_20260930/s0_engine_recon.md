# S0 引擎能力清点（整回合搜索前置）

- 生成时间：2026-09-30
- 范围：`src/game/**` 权威引擎、`v19/env/subject_episode.ts`、`v14/tools/eval_v14_match.ts`、`v19/tools/diagnose_dev_families.ts` 及其引用链
- 性质：**只读分析**，未修改任何既有文件；本文件是本次唯一新增产物
- 对应任务：`v19/V19_R123_REVIEW_AND_SEARCH_20260930.md:51-55` 的 S0 最小搜索正确性

---

## 0. 结论先行

| # | 问题 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | GameState 能否安全深拷贝 | **能**。全部是 JSON 可表达数据，无 Map/Set/函数/类实例。`structuredClone` 已在仓库里对 GameState 使用；引擎自身口径是 `JSON.parse(JSON.stringify())`；`GameEngine.clone()` 现成可用 | `src/game/types.ts:238-256`、`src/game/engine.ts:114,132-142`、`v19/review/probe_rules_and_encoding.ts:37` |
| 2 | RNG 在哪 | **不在 GameState 内**。引擎本体零随机；随机只来自 H0(`HeuristicAI`) 被注入的 `rng`。整局随机流是 `streamFor(seed, seat)` 闭包，**内部状态不可导出** | `src/game/ai/heuristic_ai.ts:16-18`、`v14/tools/eval_v14_match.ts:101-116,349` |
| 3 | 回合边界 | `currentPlayer` 只在 4 处被改写；引擎会**自动换手**两处：`ensureCurrentPlayerCanAct`（每步末尾）与 `ensureCurrentPlayerHasMeaningfulAction`（每步末尾，可关闭）。边界判据：`state.currentPlayer !== 己方座位` | `src/game/engine.ts:166-189,861-891,940-946,988-1009` |
| 4 | 初始收入 | 不是独立函数，而是**第一次 `startTurnForPlayer`**，由构造参数 `applyInitialTurnStart` 触发。所有恢复路径都不传该参数 ⇒ 不重发。已有测试锁定 | `src/game/engine.ts:122-129,278-323`、`src/game/tests/initial_turn_income.test.ts:25-46` |
| 5 | 自然结果分类 | 引擎只给 `state.winner`；分类在评测侧 `classifyOutcome`、训练侧 `SubjectOutcomeKindV19`。**`AncientEmpiresEnv.stepAction` 在 maxPlies 处会伪造代理胜负，必须避开** | `src/game/engine.ts:956-986`、`v13/tools/eval_v3_core.ts:57-73`、`v19/env/subject_episode.ts:38-46,559-573`、`src/game/env.ts:710-743` |
| 6 | 合法动作接口 | 返回 `Action[]`；语义码 `type:字段:字段`。**存在必须避开的旧数组索引接口**：`env.step(actionIndex)`、`env.getActionMask()`、`fixedActionIndex` | `src/game/rules.ts:295-488`、`src/game/env.ts:684-691,784-787,1071-1091`、`src/game/ai/action_ordering.ts:71-86` |
| 7 | 模型推理 | 单状态 + 候选列表的批量打分；**没有跨状态批推理**。`predict` 复用内部缓冲，返回值 `spatialFeaturesZ` 会被下一次调用覆盖 | `src/game/ai/spatial_conv_net.ts:435-635`、`src/game/ai/shared_spatial_policy.ts:65-156` |
| 8 | 测试覆盖 | 克隆隔离、回合轮转、结果分类、流确定性**已有**；H0 随机流跨状态恢复、搜索级自动换手边界、恢复不重发收入的端到端**缺失** | 见 §8 |

**一句话结论**：整回合搜索所需的「状态克隆 + 边界判定 + 结果分类」三块已经有可复用的权威实现（`PlanningNode`、`completeSideTurn`、`classifyOutcome`），真正缺的不是引擎能力，而是**H0 随机流的位置无法从根状态恢复**——S0 必须显式选择「从对局起点重放」或「独立固定续弈流」之一，并把该选择写进合同。

---

## 1. GameState 结构、派生字段与深拷贝

### 1.1 权威定义

`GameState` 定义在 `src/game/types.ts:238-256`：

```ts
export interface GameState {
    turn: number;            // 游戏总回合数
    currentPlayer: number;   // 当前行动的玩家ID (例如 0, 1)
    map: { width: number; height: number; tiles: Tile[][]; };
    units: Unit[];           // 场上所有单位
    players: PlayerState[];  // 玩家状态
    winner: number | null;   // 获胜联盟ID，未结束则为null，-1 表示平局
    graves?: Grave[];
    nextUnitId?: number;     // 确定性单位ID计数
    nextGraveId?: number;    // 确定性墓碑ID计数
    pendingUnitId?: string;
    rules?: RuleConfig;
    metadata?: GameMetadata;      // 不参与规则判定
    apkScriptState?: ApkScriptState;
}
```

### 1.2 字段分类

| 类别 | 字段 | 证据 |
|---|---|---|
| **规则状态（必须随克隆完整带走）** | `turn`、`currentPlayer`、`map.width/height/tiles`、`units[*]`、`players[*]`、`winner`、`graves`、`nextUnitId`、`nextGraveId`、`pendingUnitId`、`rules` | `types.ts:238-256`；`engine.ts:232-244`（`nextGraveId` 参与生成）、`engine.ts:659-661,790-792,819-821`（`nextUnitId` 参与生成） |
| **规则状态但易被忽略** | `rules.campaignEvents` 的 `once` 触发记录**不在 rules 里**，而是写进 `apkScriptState.booleans['#campaignEvent:<id>']` | `src/game/campaign_events.ts:47,246-266`；`src/game/env.ts:852-857` |
| **派生/缓存（可重算，但为了逐位复现建议一并克隆）** | 无。`GameState` 内没有派生字段；所有派生量（有效属性、收入、合法动作）都由 `getEffectiveStats`/`getTileIncome`/`getLegalActions` 现算 | `src/game/abilities.ts`、`src/game/rule_config.ts:298-315`、`src/game/rules.ts:295-488` |
| **非规则元数据（不影响判定）** | `metadata.*` | `types.ts:254`；`state_snapshot.ts:55-63` 明确把 `metadata` 排除出行为摘要 |

`Unit`（`types.ts:26-50`）、`PlayerState`（`types.ts:52-59`）、`Grave`（`types.ts:19-24`）、`Tile`（`src/game/terrain.ts:3-12`）全部是纯标量/数组/普通对象。

### 1.3 是否含 Map/Set/函数/类实例

**不含**。全量字段只有 `number | string | boolean | null | undefined`、数组、普通对象与字符串字面量联合。`RuleConfig`（`types.ts:203-236`）里的 `prices`、`alliances`、`commanderUnitIds`、`teams` 都是 `Record`；`CampaignEventEffect`（`types.ts:175-193`）是纯数据联合，没有回调函数。

**唯一注意点**：`Unit.apkMoveOverrides?: Record<number, number>`（`types.ts:49`）数字键经 JSON 往返后会变成字符串键，读取侧仍用数字下标（`src/game/abilities.ts:101,108,113`），JS 会隐式转换，行为不变。该字段只由 APK Stage 脚本写入（`src/game/apk_stage.ts:439-440`），SD 对局路径下恒为 `undefined`。

### 1.4 可靠的克隆方法（按推荐顺序）

**(a) `structuredClone(state)` —— 可用，仓库已在用。**

```ts
// v19/review/probe_rules_and_encoding.ts:33-39
const a = createDemoState();
a.map = { width: 10, height: 10, tiles: /* ... */ };
a.units = [/* ... */];
const b: GameState = structuredClone(a);
b.units.find(u => u.id === 'near')!.unitClass = 'water_elemental';
```

同款用法还有 `v19/representation/schema_v19.test.ts:46,135,160`、`tools/skirmish_network_features.test.ts:61,79,129`。`GameState` 无函数/类实例，`structuredClone` 不会抛 `DataCloneError`。

**(b) `JSON.parse(JSON.stringify(state))` —— 引擎自身的权威口径。**

- `GameEngine` 构造：`engine.ts:114` `this.state = JSON.parse(JSON.stringify(initialState));`
- `getState()`：`engine.ts:132-135`
- `reset()`：`engine.ts:156-164`
- `estimateCounterDamage` 的投影：`rules.ts:188`

两种方式对 `GameState` 结果等价。差异仅在 `undefined` 键会被 JSON 丢弃（`pendingUnitId` 等可选字段），而 `structuredClone` 会保留 `undefined` 值——**两者都不影响规则判定**，但会让 `JSON.stringify` 摘要不同。搜索里做状态哈希时请统一用一种口径。

**(c) 现成方法：`GameEngine.clone()`。**

```ts
// src/game/engine.ts:137-142
public clone(): GameEngine {
    return new GameEngine(this.state, {
        unsafeBypassValidationForTests: this.unsafeBypassValidationForTests,
        disableAutoAdvanceWhenNoMeaningfulAction: this.disableAutoAdvanceWhenNoMeaningfulAction
    });
}
```

**注意**：`clone()` **没有**透传 `applyInitialTurnStart`（对比 `engine.ts:122`），所以克隆不会重发初始收入（见 §4）；但构造函数末尾会执行 `this.ensureCurrentPlayerCanAct()`（`engine.ts:121`），若当前玩家已不活跃，克隆出来的 `currentPlayer` 会与输入快照不同。搜索里若要「逐位相同的根」，必须显式核对 `clone.getState().currentPlayer === root.currentPlayer`。

**(d) 已封装好的搜索节点：`PlanningNode`（推荐直接用）。**

`src/game/ai/planning.ts:113-273` 已经是「克隆 + 预算 + 终局裁决」的完整实现：

```ts
// src/game/ai/planning.ts:220-252（节选）
public apply(action: Action): ApplyResult {
    const stop = this.budgetRef.stopReason();
    if (stop !== null) return { status: 'budget', stop };
    if (this.isTerminal()) return { status: 'terminal' };
    const code = encodeAction(action);
    const legalCodes = this.legalActions().map(encodeAction);
    if (!legalCodes.includes(code)) return { status: 'illegal' };
    const before = this.engine.getState();
    const sim = this.engine.clone();
    const res = sim.step(action);
    if (res.info.includes('非法动作')) return { status: 'illegal' };
    const after = sim.getState();
    // ... 计数 ...
    return { status: 'ok', child: new PlanningNode(sim, this.rootPlayerId, this.budgetRef, this.depth + 1, action) };
}
```

`PlanningNode.root(state, rootPlayerId, spec)`（`planning.ts:142-145`）构造根节点；`terminalVerdict()`（`planning.ts:194-199`）返回 `'win' | 'loss' | 'draw' | null`，`rootViewValue()`（`planning.ts:202-209`）返回 `+1/0/-1`，**未终局返回 `null` 而不是猜测**。文件头注释（`planning.ts:5-6`）明确「`unsafeBypassValidationForTests` 恒为 false」。

### 1.5 深拷贝的已知代价（搜索性能红线）

`estimateCounterDamage` 内部对整个 state 做一次 JSON 深拷贝：

```ts
// src/game/rules.ts:188-193（节选）
const projected = JSON.parse(JSON.stringify(state)) as GameState;
const projectedAttacker = projected.units.find(u => u.id === attackerId);
const projectedTarget = projected.units.find(u => u.id === defenderId);
projectedTarget.hp = targetHpAfter;
applyCombatStatusEffectsForProjection(attacker, projectedTarget);
```

而候选编码 `encodeCandidateActionSpatial` 对每个 `attack` 候选都会走这条路（`src/game/ai/spatial_tensor_encoder.ts:611-618` → `estimateCounterDamageForVariant`，`spatial_tensor_encoder.ts:301-329`）。**在整回合搜索里，每个节点的每个攻击候选都会深拷贝一次局面**，这是必须提前量化的吞吐瓶颈。

---

## 2. RNG：随机源、位置与复现所需最小状态

### 2.1 引擎本体零随机

对 `src/game/**` 全目录检索 `Math.random | randomSeed | mulberry | seedrandom | xorshift | prng`，命中仅 7 处，**全部在 AI 层或 env 的工具函数**：

| 位置 | 内容 |
|---|---|
| `src/game/ai/heuristic_ai.ts:17` | `this.rng = rng ?? Math.random;` |
| `src/game/ai/apk_like_ai.ts:30` | `this.rng = rng ?? Math.random;` |
| `src/game/ai/random_ai.ts:10` | `this.rng = rng ?? Math.random;` |
| `src/game/ai/battle_search_ai.ts:26,58` | `mulberryDefault(seed)` 默认 `0xBEEF` |
| `src/game/ai/cancellable_ai_runner.ts:92` | `req_${Date.now()}_${Math.random()...}`（仅请求 id，不参与规则） |
| `src/game/env.ts:11` | `export function mulberry32(a: number)`（导出但引擎不调用） |

`GameEngine` 内部没有 RNG 字段，也没有 `Date.now()` / `performance.now()`（`src/game/**` 中的时间调用只在 `planning.ts:44,55` 的预算计时和 AI 适配器的时延统计里）。**结论：引擎是确定性的，同一 `GameState` + 同一 `Action` 序列 ⇒ 逐位相同结果。** 已被 `src/game/tests/engine.test.ts:6152-6160` 钉住。

### 2.2 RNG 不在 GameState 内

`GameState`（`types.ts:238-256`）没有 seed、没有 rng 句柄、没有计数器。H0 的随机流是**闭包**，创建于对局开始时：

```ts
// v14/tools/eval_v14_match.ts:342-349（节选）
const env = await envFactory.createEnv(episode);
env.reset(seed);
const engine = env.getEngine();
const initialState = engine.getState();
const playerIds: number[] = initialState.players.map((p: any) => p.id).sort((a, b) => a - b);
const seatAi = new Map<number, HeuristicAI>();
for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));
```

`streamFor` 的实现（`v14/tools/eval_v14_match.ts:111-116`，与 `v13/tools/eval_v3_core.ts:94-99` 数值等价）：

```ts
export function streamFor(seed: number, seat: number): () => number {
    let h = (seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return mulberry((h ^ (h >>> 16)) >>> 0);
}
```

`mulberry` 把状态 `a` 关在闭包里，**没有任何 `getState()/setState()`**。训练侧同理：`v19/env/subject_episode.ts:331` `for (const seat of playerIds) seatAi.set(seat, new HeuristicAI(streamFor(seed, seat)));`。

**⇒ 从任意中间根状态出发，无法恢复「该局原本的 H0 流位置」。** 这是 S0 最硬的约束。

### 2.3 复现同一序列所需的最小状态

两种可选口径（**必须二选一并写进合同**）：

**口径 A（原流连续，需从对局起点重放）**
- 最小状态 = `(seed, 座位集合, 从第 0 步到根状态的完整 actionCode 序列)`。
- 依据：`streamFor(seed, seat)` 只依赖 `(seed, seat)`；闭包位置只能靠重放同样的调用序列复原。
- 现存范例：`v19/tools/diagnose_dev_families.ts:117-144` 用 `playOne` + `onStep` 重放到分歧点，再用 `maxSteps: window.engineStepIndex + 1` 截断；`v19/review/r123_20260930/probe_icy_order.ts:19-25` 同法恢复 Icy 根状态。
- 代价：每次搜索都要重放前缀；长局前缀可达 7799 步（`V19_R123_REVIEW_AND_SEARCH_20260930.md:33`）。

**口径 B（独立固定续弈流，推荐给搜索）**
- 最小状态 = `(根 GameState, 独立续弈种子, 座位)`；每个支路用 `streamFor(continuationSeed, seat)` 新建 H0。
- 现存范例：`v16/tools/counterfactual_v16.ts:52` `CONTINUATION_SEED = Number(arg('--continuation-seed', '2609900000'))`，`counterfactual_v16.ts:118-120` 每个支路重建引擎与逐座位 H0。
- 这正是 R123 合同「内部搜索与验证续弈使用分离且预登记的随机流」（`V19_R123_REVIEW_AND_SEARCH_20260930.md:67`）的落地方式。
- **代价**：续弈的 H0 与「该局真实 H0 回应」不是同一条流。R123 §1 要求「搜索单位为当前己方完整动作序列→**H0 真实回应**→下一己方边界」，因此口径 B 只适用于超出边界的续弈，**边界内的那一轮 H0 回应必须用口径 A 重放得到**。

### 2.4 H0 随机流身份记录在哪里

| 记录项 | 值 / 位置 |
|---|---|
| H0 策略版本 id | `MIRROR_POLICY_VERSION_V14 = 'heuristic-seatstream-v1'` — `v14/tools/eval_v14_protocol.ts:29` |
| H0 RNG 合同 id（V14/V15） | `RNG_CONTRACT_ID_V15 = 'heuristic-seatstream-v1'` — `v14/tools/eval_v14_protocol.ts:213`（`v14/tools/eval_v14_match.ts:634` 写入 `GameRecord.rngContract`，仅 `--emit-identity true` 时） |
| H0 RNG 合同 id（V16） | `V16_RNG_CONTRACT_ID = 'heuristic-seatstream-v1'` — `v16/tools/eval_v16_protocol.ts:39` |
| H0 RNG 合同 id（V19 冻结清单） | `frozenContracts.rngContractId = "heuristic-seatstream-v1"` — `v19/out/run_20260928_v19_01/identity/manifest.json:236` |
| H0 源码依赖闭包 | `H0_SOURCE_FILES_V16 = ['src/game/ai/heuristic_ai.ts', 'src/game/ai/tactical_evaluation.ts', 'src/game/ai/tactical_pathfinding.ts']` — `v16/tools/eval_v16_identity.ts:67-72`；摘要组 `h0` 见 `v16/tools/eval_v16_identity.ts:97-105` |
| H0 冻结摘要（实际值） | `v17/out/v17_20260926_r2/identity/source_manifest.json:59-69`：`h0.digest = e648bf9464b2656cf2860008aba84aabc0aee5d19805c0c3ff987c672f1d3fa8`，其中 `heuristic_ai.ts` = `304d6e6b…eb94e` |
| 动作过滤合同 | `ACTION_FILTER_ID_V15 = 'filter-surrender-v1'` — `v14/tools/eval_v14_protocol.ts:203` |

**注意**：`rngContractId` 只是字符串标签，`eval_v14_protocol.ts:205-213` 的注释明确说明「实验身份不靠这个字符串区分，而靠 `engineSourceDigest` / `policySourceDigest`」。任何改变启发式实现或 `streamFor` 派生的修改都会改摘要，从而换键。

### 2.5 H0 每次决策消耗多少随机数

`HeuristicAI.getAction`（`heuristic_ai.ts:20-39`）对**全部合法动作**逐个 `scoreAction`，每个分支末尾都调用一次 `this.rng()`：

| 动作类型 | 消耗点 |
|---|---|
| `repair` | `heuristic_ai.ts:87` |
| `summon` | `heuristic_ai.ts:96` |
| `attack` | `heuristic_ai.ts:168` |
| `capture` | `heuristic_ai.ts:179` |
| `heal` | `heuristic_ai.ts:199,204`（分支互斥，实际 1 次） |
| `support` | `heuristic_ai.ts:212` |
| `destroy_town` | `heuristic_ai.ts:220` |
| `move` / `post_attack_move` | `heuristic_ai.ts:274` |
| `recruit_*` | `heuristic_ai.ts:298,302,312,333`（分支互斥） |
| `wait` | `heuristic_ai.ts:344` |

即 **每次决策消耗的随机数 ≈ 该次合法动作数**（`heuristic_ai.ts:30-33` 只 map 一次）。合法动作数随局面变化，因此**流位置不能由状态反推**——只能重放。

---

## 3. 回合边界与自动换手

### 3.1 `currentPlayer` 的全部改写点

| # | 位置 | 触发条件 |
|---|---|---|
| 1 | `engine.ts:183-189` `ensureCurrentPlayerCanAct()` | 当前玩家不活跃（`isAlive === false` 或被 `disabledTeams` 禁用）时切到下一个活跃玩家 |
| 2 | `engine.ts:861-869` `surrender` 分支 | 投降后 `getNextTurnPlayer(prevCurrentPlayer)`，若跨圈则 `turn += 1`，并立刻 `startTurnForPlayer` |
| 3 | `engine.ts:872-890` `end_turn` 分支 | 同上 |
| 4 | `engine.ts:995-1000` `ensureCurrentPlayerHasMeaningfulAction()` | 当前玩家没有任何「非 end_turn / 非 surrender」动作时，自动切到下一个玩家并 `startTurnForPlayer` |

轮转顺序由 `getNextTurnPlayer`（`engine.ts:166-181`）决定，玩家集合来自 `getTurnPlayerIds`（`src/game/rule_config.ts:192-197`，按 id 升序、过滤 `isActivePlayer`）。

### 3.2 引擎确实会自动换手，且有两个层次

**层次 1：跳过已淘汰玩家（无条件）。** `ensureCurrentPlayerCanAct` 在构造（`engine.ts:121`）、`reset`（`engine.ts:159`）和**每一步末尾**（`engine.ts:942`）都会执行：

```ts
// src/game/engine.ts:940-946
this.checkWinConditions();
if (!this.isTerminal()) {
    // APK SD/SO 控制脚本在当前队伍被摧毁且未终局时会 AsyncNextTurn。
    this.ensureCurrentPlayerCanAct();
    if (!this.disableAutoAdvanceWhenNoMeaningfulAction) {
        this.ensureCurrentPlayerHasMeaningfulAction();
    }
}
```

**层次 2：跳过「无有意义动作」的玩家（默认开启，可关闭）。**

```ts
// src/game/engine.ts:988-1009（节选）
private ensureCurrentPlayerHasMeaningfulAction() {
    let guard = 0;
    while (!this.isTerminal() && guard < this.state.players.length) {
        const actions = this.getLegalActions(this.state.currentPlayer);
        const hasMeaningfulAction = actions.some(action => action.type !== 'end_turn' && action.type !== 'surrender');
        if (hasMeaningfulAction) return;
        const nextTurn = this.getNextTurnPlayer(this.state.currentPlayer);
        if (nextTurn.playerId === null || nextTurn.playerId === this.state.currentPlayer) return;
        this.state.currentPlayer = nextTurn.playerId;
        if (nextTurn.wrapped) { this.state.turn += 1; }
        this.startTurnForPlayer(nextTurn.playerId);
        // ... removeDeadUnits / applyCampaignEvents / checkWinConditions ...
        guard += 1;
    }
}
```

关闭方式：构造参数 `disableAutoAdvanceWhenNoMeaningfulAction: true`（`engine.ts:104,118-120`）。现存使用者：`tools/cloud_replay_audit.ts:21`、`tools/skirmish_pvp_audit.ts:19`。**注意：`clone()` 会透传该开关（`engine.ts:140`），但 `PlanningNode.root` 用 `new GameEngine(state)`（`planning.ts:144`）不透传，默认开启自动换手。**

**层次 2 的两个后果，直接影响搜索正确性：**

1. **一次 `step` 可能跨过多个玩家、甚至跨圈（`turn += 1` 多次）。** `getNextTurnPlayer` 每轮只前进一格，但 `while` 循环会连续前进。
2. **可能「绕过 H0」直接回到自己。** 若 H0 侧没有任何有意义动作（例如只剩不能动/不能招募的单位），引擎会在同一个 `step` 内替 H0 结束回合并把 `currentPlayer` 交回己方。此时「己方边界」到达了，但 **H0 一个原子动作都没走**。搜索若以「H0 走过了」作为边界判据就会漏判。

### 3.3 如何判定「当前己方回合结束」

**权威判据（与现存实现一致）：应用一个己方动作后，检查 `state.currentPlayer`。**

```ts
// v17/teachers/battle_search_b100.ts:1040-1042（己方连动展开的边界判据）
for (let i = 0; i < this.friendlyRolloutSteps; i++) {
    if (sim.getState().winner !== null) break;
    if (sim.getState().currentPlayer !== playerId) break;
```

```ts
// v16/tools/teacher_s1_v16.ts:382-385（completeSideTurn 的停止条件）
for (let i = 0; i < phaseActionCap; i += 1) {
    if (now() - startedAt >= wallMs) return { node, actions, stop: 'wall', engineTransitions: transitions };
    if (node.isTerminal()) return { node, actions, stop: 'terminal', engineTransitions: transitions };
    if (node.currentAllianceId !== sideAllianceId) return { node, actions, stop: 'reached-next-own', engineTransitions: transitions };
```

```ts
// v16/tools/counterfactual_v16.ts:142-150（同一判据 + 阵营校验）
while (!engine.isTerminal() && transitions < MAX_TRANSITIONS) {
    if (Date.now() - startedAt > WALL_MS) { wallCapHit = true; truncated = true; break; }
    const st = engine.getState();
    const current = st.currentPlayer;
    const alliance = getAllianceId(st, current);
    if (!reachedBoundary && alliance === rootAllianceId && current === rootPlayer && transitions > 1) {
        reachedBoundary = true;
        if (!TO_TERMINAL) break;
    }
```

**建议的搜索主循环判据（四条同时成立才算「回到己方边界」）：**

1. `state.winner !== null` → 先按自然终局处理（优先级最高，见 §5）；
2. `state.currentPlayer === subjectSeat`（座位相等）；
3. `getAllianceId(state, state.currentPlayer) === subjectAllianceId`（联盟相等；SD 下等价，但联盟配置可被 `rules.alliances` 改写 —— `rule_config.ts:166-169`）；
4. 至少已经推进过 1 个原子动作（`transitions > 1`，`counterfactual_v16.ts:147`），避免把根状态本身误判为边界。

**如何安全地让 H0 走完它的动作：**

```ts
// v19/env/subject_episode.ts:488-499（H0 的权威调用约定）
} else {
    // 主体以外的座位（一律走冻结 H0，
    // 调用约定与正式 arena 完全一致：不传候选集，让 H0 自己用引擎合法集打分。
    try {
        action = seatAi.get(current)?.getAction(engine, current, undefined) ?? null;
    } catch (error) { policyError = ...; break; }
    if (isSubject) subjectDecisions += 1;
    else { opponentSteps += 1; opponentStepsSinceLastSubject += 1; }
}
```

要点：
- **必须传 `undefined` 作为 `preparedActions`**（`subject_episode.ts:492`、`eval_v14_match.ts:407,432` 注释明确：「不传候选集，让启发式自己用引擎合法集打分」）。传候选集会让 H0 看到被裁剪后的集合，与正式对局不可比。
- 每步都要重新 `engine.getState()` 取 `currentPlayer`，**不能缓存**——因为一次 `step` 可能已经自动换手（§3.2）。
- 循环必须有终止条件三件套：`engine.isTerminal()`、`wallTimeout`、原子步上限（`subject_episode.ts:384-385`）。
- H0 返回的 `null` 必须显式记为 `POLICY_ERROR`（`subject_episode.ts:500`），不得静默回退。

### 3.4 边界内的特殊状态：`pendingUnitId`

`pendingUnitId` 会**锁死**己方可选单位集合：

```ts
// src/game/rules.ts:302-313（节选）
const pendingUnitId = state.pendingUnitId;
const pendingUnit = pendingUnitId ? state.units.find(u => u.id === pendingUnitId) : undefined;
const rules = getRuleConfig(state);
const canResolveEmptyCastlePendingWithTurnAction = pendingUnit?.apkPendingRecruitSource === 'empty_castle';
const pendingLocksUnitActions = Boolean(pendingUnitId && pendingUnit?.apkPendingRecruitSource !== 'empty_castle');
let validUnits = state.units.filter(u => u.ownerId === playerId && !u.hasActed && !u.apkStatic);
if (pendingLocksUnitActions) { validUnits = validUnits.filter(u => u.id === pendingUnitId); }
```

搜索里「己方完整动作序列」必须允许 `pendingUnitId` 存在（此时合法动作只有该单位的动作，可能还包括 `end_turn`/`surrender`，见 `rules.ts:477-485`），不能因为候选数骤降就判为异常。

---

## 4. 初始收入与恢复快照不重发

### 4.1 初始收入在哪里发放

**没有独立的「发放初始收入」函数。** 开局收入就是**第一次 `startTurnForPlayer(currentPlayer)`**：

```ts
// src/game/engine.ts:122-129（构造函数）
if (options?.applyInitialTurnStart && isActivePlayer(this.state, this.state.currentPlayer)) {
    this.startTurnForPlayer(this.state.currentPlayer);
    const deadUnits = this.removeDeadUnits();
    for (const deadUnit of deadUnits) {
        applyCampaignEvents(this.state, { type: 'unit_destroyed', unit: deadUnit });
    }
    this.checkWinConditions();
}
```

收入计算本体在 `engine.ts:302-323`（遍历己方地块累加 `getTileIncome` + 指挥官存活收入），`getTileIncome` 在 `rule_config.ts:309-315`（城镇 = `incomeVillage`，城堡 = `incomeCastle`）。

新对局的入口默认开启该参数：

```ts
// src/game/apk_skirmish.ts:276-279
// 新对局在首名玩家行动前结算回合收入；恢复已有局面时由调用方跳过此步骤。
return applyInitialTurnStart
    ? new GameEngine(initialState, { applyInitialTurnStart: true }).getState()
    : initialState;
```

`createApkSkirmishTrainingGameState`（`apk_skirmish.ts:282-307`）→ `createApkSkirmishGameState`（`apk_skirmish.ts:255-280`），`applyInitialTurnStart` 默认 `true`（`apk_skirmish.ts:259`）。SD 五图 `sd-normal`（`training_configs/sd_training_plan_20260705.json:64-68`，`kind: "normal"`）不走派生分支（`tools/sd_training_state_generator.ts:191-194`），因此**初始状态在创建时就已经结算过一次首回合收入**。

### 4.2 重复调用初始化/恢复会不会重发

| 路径 | 是否重发 | 证据 |
|---|---|---|
| `new GameEngine(state)`（不传 option） | **否** | `engine.ts:113-130`，`applyInitialTurnStart` 默认 `undefined` → 条件短路 |
| `engine.clone()` | **否** | `engine.ts:137-142` 只透传 `unsafeBypassValidationForTests` 与 `disableAutoAdvanceWhenNoMeaningfulAction` |
| `engine.reset(state)` | **否** | `engine.ts:156-164` 只做深拷贝 + `ensureCurrentPlayerCanAct()` |
| `new AncientEmpiresEnv({ initialState })` | **否** | `env.ts:666` `new GameEngine(this.initialConfig as any)` 不传 option；随后 `env.ts:668` `this.reset(this.seed)` |
| `env.reset(seed)` | **否** | `env.ts:680` `this.engine = new GameEngine(JSON.parse(JSON.stringify(this.initialConfig)));` |
| `createApkSkirmishGameState(map)`（默认） | **会**（这是设计上的「新对局」） | `apk_skirmish.ts:277-279` |
| `createApkSkirmishGameState(map, { applyInitialTurnStart: false })` | 否（回放入口） | `apk_skirmish.ts:259,279`；使用者 `tools/apk_replay_report.ts:183`、`src/game/apk_replay.test.ts:207-216` |

**⇒ 「恢复快照不应重发初始收入」在代码上的保证是：所有恢复/克隆路径都不传 `applyInitialTurnStart`。** 只要搜索侧重建根引擎时**不写** `{ applyInitialTurnStart: true }`，就不会重发。

### 4.3 已有回归证据

```ts
// src/game/tests/initial_turn_income.test.ts:25-46（节选）
it('新遭遇战与训练环境首回合只结算一次，后续快照不会重复入账', () => {
    const state = createAppApkSkirmishGameState('(2) Duel.aem');
    expect(state.players.map(player => player.gold)).toEqual([450, 300]);
    expect(new GameEngine(state).getState().players.map(player => player.gold)).toEqual([450, 300]);
    // ...
    const env = new AncientEmpiresEnv({ initialState: state });
    expect(env.getState().players.map(player => player.gold)).toEqual([450, 300]);
    env.reset();
    expect(env.getState().players.map(player => player.gold)).toEqual([450, 300]);
});
```

其他旁证：
- `v16/tools/eval_v16_identity.ts:127-129` 定义了 `snapshotRoundTripGold` / `snapshotRoundTripHash` 字段，注释写明「快照往返后（`new GameEngine(state)` 语义）的金币，用于证明没有重复首次结算」。
- `v17/teachers/b100_policy.ts:293-294`：「引擎重建：构造函数深拷贝，**不**执行 `applyInitialTurnStart`（已结算状态不得再发钱）。」
- `v17/tools/b100_config_report.ts:204` 把这条写进了配置报告。

### 4.4 如何自行验证（建议纳入 S0 自检）

在根状态上做**三重断言**：
1. `goldBefore = root.players.map(p => p.gold)`；
2. `engineA = new GameEngine(structuredClone(root))` → `engineA.getState().players` 的金币必须等于 `goldBefore`；
3. `engineB = engineA.clone()` → 同样相等，且 `JSON.stringify(engineB.getState()) === JSON.stringify(engineA.getState())`。

**注意第二个陷阱**：`startTurnForPlayer` 不只发钱，还会重置 `hasMoved/hasActed/hasPostAttackMoved/hasBeenHealedThisTurn/hasBeenSupportedThisTurn`、刷新 `movementRemaining`、衰减状态、结算地形回血并触发 `campaignEvents(turn_start)`（`engine.ts:326-386`）。误传 `applyInitialTurnStart: true` 造成的破坏**远不止金币**，因此自检不能只看金币，必须比整个 `getState()` 的哈希。

---

## 5. 自然结果分类

### 5.1 引擎侧：`winner` 与 `isAlive`

```ts
// src/game/engine.ts:956-986（节选）
private checkWinConditions() {
    if (this.state.winner !== null) return;          // 终局不可撤销
    const ruleConfig = getRuleConfig(this.state);
    for (const player of this.state.players) {
        if (!isActivePlayer(this.state, player.id)) continue;
        const hasUnits = this.state.units.some(u => u.ownerId === player.id && u.hp > 0);
        const hasCommander = getCommanderUnit(this.state, player.id) !== null;
        const hasCastle = this.state.map.tiles.some(row => row.some(tile => (
            tile.ownerId === player.id && getTileTerrainKey(tile) === 'castle')));
        const hasNoUnitsAndNoCastles = !hasUnits && !hasCastle;
        if ((ruleConfig.defeatOnNoUnitsAndNoCastles && hasNoUnitsAndNoCastles)
            || (ruleConfig.defeatOnNoUnits && !hasUnits)
            || (ruleConfig.defeatOnCommanderDeath && !hasCommander)
            || (ruleConfig.defeatOnNoCastles && !hasCastle)) {
            player.isAlive = false;
        }
    }
    const alivePlayers = this.state.players.filter(p => isActivePlayer(this.state, p.id));
    const aliveAlliances = [...new Set(alivePlayers.map(player => getAllianceId(this.state, player.id)))];
    if (aliveAlliances.length === 1) { this.state.winner = aliveAlliances[0]; }
    else if (aliveAlliances.length === 0) { this.state.winner = -1; }  // Draw
}
```

| 概念 | 字段 / 位置 | 语义 |
|---|---|---|
| 自然胜/负 | `state.winner`（联盟 id） | `engine.ts:982`；与己方联盟比较得胜负 |
| 自然和（规则平局） | `state.winner === -1` | `engine.ts:984`；`v13/tools/eval_v3_core.ts:6-8` 明确「`winner === -1` 是真实平局，不是截断」 |
| 未终局 | `state.winner === null` | `types.ts:248`；`engine.ts:148-150` `isTerminal()` |
| 玩家存活 | `PlayerState.isAlive`（`types.ts:55`） | 只由 `checkWinConditions` 置 false（`engine.ts:975`）与 `surrender`（`engine.ts:848`） |
| 活跃性 | `isActivePlayer = isAlive && !disabledTeams` | `rule_config.ts:183-190`；`winner` 只统计**活跃**玩家 |
| 联盟映射 | `getAllianceId(state, playerId) = rules.alliances[playerId] ?? playerId` | `rule_config.ts:166-169`；未配置时每队自成联盟 |
| 终局判定时机 | `checkWinConditions` 调用点：`engine.ts:128`（构造）、`920`、`939`、`1006` | 每步调两次（`920` 在 standby 后、`939` 在清理 `pendingUnitId` 后） |

**重要**：`checkWinConditions` 开头 `if (this.state.winner !== null) return;`（`engine.ts:957`）⇒ **`winner` 一旦写入永不改变**。搜索中只要看到 `winner !== null` 就可以立即停止该支路。

### 5.2 评测侧：`classifyOutcome`

`v14/tools/eval_v14_match.ts:504-513` 调用：

```ts
// v13/tools/eval_v3_core.ts:57-73
export function classifyOutcome(opts: OutcomeInputs): OutcomeKind {
    if (opts.cancelled) return 'CANCELLED';
    if (opts.policyError) return 'POLICY_ERROR';
    if (opts.engineError) return 'ENGINE_ERROR';
    if (opts.winner !== null) {
        if (opts.winner === -1) return 'NATURAL_DRAW';
        return opts.candidateAlliance !== null && opts.winner === opts.candidateAlliance
            ? 'NATURAL_WIN' : 'NATURAL_LOSS';
    }
    if (opts.wallTimeout) return 'WALL_TIMEOUT';
    if (opts.maxPlies !== null && opts.plies >= opts.maxPlies) return 'PLY_LIMIT';
    if (opts.steps >= opts.maxSteps) return 'STEP_LIMIT';
    return 'ENGINE_ERROR';
}
```

- `OutcomeKind` 九分类：`v13/tools/eval_v3_core.ts:12-21`。
- 三个互斥谓词：`isNatural`（`29-41`）、`isUndecided`（`29-31`）、`isError`（`34-36`），`eval_v3_core.test.ts:118-130` 断言九类干净划分。
- **优先级**：错误 > 自然裁决 > 截断。测试 `eval_v3_core.test.ts:107-112` 明确「规则裁决即便同时耗尽预算也算 NATURAL_WIN」。
- 最后一个 `return 'ENGINE_ERROR'`（`eval_v3_core.ts:72`）是兜底：循环退出但既无裁决也无预算 ⇒ 判为引擎缺陷，**不伪装成截断**（注释 `eval_v3_core.ts:70-71`）。

### 5.3 评测侧：`winnerAllianceId` / `candidateAllianceId` 的对应

```ts
// v14/tools/eval_v14_match.ts:497-513（节选）
const finalState = engine.getState();
const winnerAllianceId = finalState.winner;
const viewedSeat = candidateSeat ?? options.viewedSeatHint;
const candidateAllianceId = viewedSeat === null ? null : getAllianceId(finalState, viewedSeat);
const playerCount = Math.max(1, playerIds.length);
const currentIndex = Math.max(0, playerIds.indexOf(finalState.currentPlayer));
const plies = Math.max(0, finalState.turn - 1) * playerCount + currentIndex + 1;
const outcomeKind = classifyOutcome({
    engineError, policyError, cancelled: false, wallTimeout,
    winner: finalState.winner, winnerAlliance: finalState.winner,
    candidateAlliance: candidateAllianceId, steps: steps < maxSteps ? steps : maxSteps,
    maxSteps, plies, maxPlies,
});
```

- `winnerAllianceId` = 终局 `state.winner`，**是联盟号不是座位号**；`candidateAllianceId` = `getAllianceId(finalState, viewedSeat)`，`viewedSeat = candidateSeat ?? viewedSeatHint`（`eval_v14_match.ts:499`）。
- 镜像行只跑一次实体，按座位展开视角（`eval_v14_match.ts:753-775`），座位→联盟表来自真实终局：`mirrorSeatAlliances[mirrorId]`（`eval_v14_match.ts:519-522`，读取在 `307-312`）。
- 可选的按视角重算：`recomputeOutcomeForViewedSeat`（`eval_v14_match.ts:651-661`），错误/截断与视角无关原样返回，`winner=-1` 恒为 `NATURAL_DRAW`。
- `plies` 定义：`(turn - 1) * playerCount + currentIndex + 1`（`eval_v14_match.ts:503`），与 `src/game/env.ts:290-295` 的 `estimatePlyCount` 同式，也与 `v19/env/subject_episode.ts:553-555` 同式。**注意它用的是全部玩家数（含已淘汰），不是活跃玩家数。**
- 辅助字段 `earlyEliminationAux`（`eval_v14_match.ts:516-518`）：`winner === null` 但被测座位 `isAlive === false`，用于识别「已淘汰但未终局」。

### 5.4 训练侧：`SubjectOutcomeKindV19`

```ts
// v19/env/subject_episode.ts:38-46
export type SubjectOutcomeKindV19 =
    | 'NATURAL_WIN' | 'NATURAL_LOSS' | 'NATURAL_DRAW'
    | 'TRUNCATED_STEP_LIMIT' | 'TRUNCATED_PLY_LIMIT' | 'TRUNCATED_WALL_TIMEOUT'
    | 'POLICY_ERROR' | 'ENGINE_ERROR';
```

```ts
// v19/env/subject_episode.ts:559-573（节选）
if (engineError !== null) outcomeKind = 'ENGINE_ERROR';
else if (policyError !== null) outcomeKind = 'POLICY_ERROR';
else if (wallTimeout) outcomeKind = 'TRUNCATED_WALL_TIMEOUT';
else if (finalState.winner !== null) {
    outcomeKind = finalState.winner === -1 ? 'NATURAL_DRAW'
        : (finalState.winner === subjectAllianceId ? 'NATURAL_WIN' : 'NATURAL_LOSS');
} else if (maxPlies !== null && plies >= maxPlies) outcomeKind = 'TRUNCATED_PLY_LIMIT';
else outcomeKind = 'TRUNCATED_STEP_LIMIT';
const truncated = outcomeKind.startsWith('TRUNCATED');
const terminalReturn = naturalTerminal ? rewardForWinnerV19(winnerAllianceId, subjectAllianceId) : null;
```

配套的**硬自检**（违反直接抛错，`subject_episode.ts:604-617`）：截断局不得有终局回报、自然终局局必须有终局回报、最后一条 transition 的奖励必须等于终局回报、截断局不得出现 `terminal` 标记。`rewardForWinnerV19`（`subject_episode.ts:666-671`）返回 `+1 / -1 / 0`，`winnerAllianceId === null` 时返回 0（不是 -1）。

### 5.5 必须避开的旧接口：`AncientEmpiresEnv.stepAction` 的代理胜负

```ts
// src/game/env.ts:710-743（节选）
if (plies >= this.maxPlies && !done) { done = true; finalInfo += ". Max plies reached."; }
if (res.info.includes("非法动作")) { sparseReward = -0.01; }
else if (done) {
    const winner = this.engine.getState().winner;
    if (winner === null && plies >= this.maxPlies) {
        const timeoutWinnerAlliance = evaluateTimeoutWinnerAlliance(state);   // 按军力价值代理判胜
        if (timeoutWinnerAlliance === -1) sparseReward = 0;
        else if (timeoutWinnerAlliance === getAllianceId(state, currentPlayerBefore)) sparseReward = 1;
        else sparseReward = -1;
    } else {
        if (winner === getAllianceId(...)) sparseReward = 1;
        else if (winner === -1) sparseReward = 0;
        else sparseReward = -1;      // ← winner === null 时也会走到这里，伪造 −1
    }
}
```

- 代理胜负函数：`evaluateTimeoutWinnerAlliance`（`env.ts:402-424`），按 `calculateArmyValue`（`env.ts:275-288`，金币 + 单位价值）比较。
- **陷阱 1**：`maxPlies` 截断时给出 `±1` 的**代理**胜负，不是规则结果。
- **陷阱 2**：`winner === null` 且 `done` 为真（例如入口 `env.ts:694` 的 `estimatePlyCount > maxPlies`）时，`else` 分支给出 `sparseReward = -1`——**把「未结束」写成「输」**。
- 现存负例回归：`v19/env/subject_episode.test.ts:174-191` 直接断言旧接口在该条件下 `legacy.reward === -1` 且 `winner === null`，并证明新模块返回 `TRUNCATED_PLY_LIMIT` + `terminalReturn === null`。
- 文件头注释 `subject_episode.ts:7-13` 明确禁止把这两个来源当作 PPO 奖励。

### 5.6 严格区分五类的推荐实现

| 类别 | 判据 | 判定顺序 |
|---|---|---|
| **错误（POLICY_ERROR / ENGINE_ERROR）** | `policyError !== null` / `engineError !== null` | 1（最高） |
| **自然胜** | `winner !== null && winner !== -1 && winner === subjectAllianceId` | 2 |
| **自然负** | `winner !== null && winner !== -1 && winner !== subjectAllianceId` | 2 |
| **自然和** | `winner === -1` | 2 |
| **截断** | `winner === null` 且命中 wall / plies / steps 任一预算 | 3 |

**补充要点（易错）**：
- `engine.step()` **不会因非法动作抛异常**，而是返回 `{ info: '非法动作：当前玩家无法执行该动作' }`（`engine.ts:520-527`）。因此「错误」检测必须查 `res.info.includes('非法动作')`——`planning.ts:234` 正是这么做的。真正的 `throw` 只可能来自规则代码缺陷（`subject_episode.ts:507-512` 的 try/catch）。
- 建议在 `classifyOutcome` 的兜底语义上加一条自己的断言：若循环退出时 `winner === null` 且没有任何预算命中 ⇒ `ENGINE_ERROR`（`eval_v3_core.ts:70-72`）。

---

## 6. 合法动作与动作编码

### 6.1 接口形式

```ts
// src/game/engine.ts:144-146
public getLegalActions(playerId: number): Action[] {
    return getLegalActions(this.state, playerId);
}
```

`rules.ts:295-488` 是权威实现。返回的是**结构化 `Action` 对象数组**（联合类型见 `types.ts:259-273`），不是字符串、不是索引。`rules.ts:298-300`：玩家不活跃时直接返回空数组。

动作产生顺序（**不是合同**）：突击二次移动（`rules.ts:332-339`）→ 逐单位 move/attack/destroy_town/heal/summon/support/capture/destroy_town/repair/wait（`rules.ts:342-435`）→ 招募（`rules.ts:437-475`）→ surrender/end_turn（`rules.ts:477-485`）。**`rules.ts` 文件头没有把顺序写成合同**；`action_ordering.ts:3-8` 明确指出「引擎产生顺序不属于任何冻结合同」。

### 6.2 `encodeAction` 语义码格式

`src/game/env.ts:1071-1091`，模板清单在 `env.ts:1054-1069`（`ACTION_SPACE_SCHEMA`）：

| 动作 | 码格式 | 示例 |
|---|---|---|
| `move` | `move:<unitId>:<x>,<y>` | `move:u_22:4,5` |
| `post_attack_move` | `post_attack_move:<unitId>:<x>,<y>` | `post_attack_move:u_22:4,5` |
| `attack` | `attack:<attackerId>:<targetId>` | `attack:u_22:u_23` |
| `heal` | `heal:<healerId>:<targetId>` | `heal:u_7:u_3` |
| `support` | `support:<supporterId>:<targetId>` | `support:u_7:u_3` |
| `summon` | `summon:<summonerId>:<graveId>:<x>,<y>` | `summon:u_7:g_100:3,4` |
| `recruit_to_castle` | `recruit_to_castle:<unitClass>:<cx>,<cy>` | `recruit_to_castle:soldier:5,5` |
| `recruit_and_deploy` | `recruit_and_deploy:<unitClass>:<cx>,<cy>:<tx>,<ty>` | `recruit_and_deploy:soldier:5,5:5,6` |
| `capture` | `capture:<unitId>` | `capture:u_22` |
| `repair` | `repair:<unitId>` | `repair:u_22` |
| `destroy_town` | `destroy_town:<unitId>[:<x>,<y>]` | `destroy_town:u_22` 或 `destroy_town:u_22:4,5` |
| `wait` | `wait:<unitId>` | `wait:u_22` |
| `surrender` | `surrender` | `surrender` |
| `end_turn` | `end_turn` | `end_turn` |

**占城就是 `capture:<unitId>`**（无坐标，目标格隐含为 `unit.pos`，见 `rules.ts:415-421,729-748`）；**移动/招募如上**。逆变换 `decodeAction`（`env.ts:1101-1182`）对格式做严格校验，非法输入返回 `null`（V14/T14-02 起不再静默产出 `NaN` 坐标，注释 `env.ts:1093-1100`）。

### 6.3 必须避开的「按数组索引」旧接口

| 接口 | 位置 | 问题 |
|---|---|---|
| `AncientEmpiresEnv.step(actionIndex: number)` | `env.ts:684-691` | 索引指向**当前** `getLegalActions()` 数组，随局面变化；越界时返回 `-0.01` 而不抛错 |
| `AncientEmpiresEnv.getActionMask(): boolean[]` | `env.ts:784-787` | 返回 `new Array(actions.length).fill(true)`，**恒为全 true**，不是真正的掩码 |
| `EnvStepResult.actionMask` / `legalActionEntries[].actionMask` | `env.ts:1035`、`env.ts:1020-1025` | 同上，逐条恒为 `true` |
| `EnvStepResult.fixedLegalActionIndexes` / `stepFixedAction(index)` | `env.ts:748-756`、`env.ts:610-623` | 固定动作空间是**按棋盘坐标**编码的索引（`encodeFixedActionIndex`，`env.ts:509-608`），与「合法动作数组下标」是两套不同索引空间，混用会静默选错动作 |

**权威替代**：

```ts
// src/game/ai/action_ordering.ts:71-86（节选）
export function canonicalActionOrderV16(actions: readonly Action[]): OrderedCandidateV16[] {
    const decorated = actions.map((action, inputIndex) => ({ code: encodeAction(action), action, inputIndex }));
    const seen = new Map<string, number>();
    for (const item of decorated) {
        const previous = seen.get(item.code);
        if (previous !== undefined) {
            throw new Error(`[T16-02] canonicalActionOrderV16: 候选 ... actionCode 相同 ... 请在上游去重`);
        }
        seen.set(item.code, item.inputIndex);
    }
    decorated.sort((left, right) => compareActionCodeCanonicalV16(left.code, right.code));
    return decorated.map((item, index) => ({ ...item, index }));
}
```

- `CANDIDATE_ORDERING_ID_V16 = 'actionCode-codepoint-asc-v1'`（`action_ordering.ts:26`），历史顺序记为 `'engine-order-legacy'`（`action_ordering.ts:29`）。
- 并列 logits 取**最小 actionCode**：`stableArgmaxV16`（`action_ordering.ts:94-109`），并在 `shared_spatial_policy.ts:125-131` 与 `predict` 的 `bestActionIndex` 交叉校验。
- 训练侧纪律原文：「候选一律经 `canonicalActionOrderV16` 规范排序，记录的 `orderedActionCodes` 就是策略实际打分的那一维，**禁止混用旧数组下标**」（`v19/env/subject_episode.ts:19-20`）。

### 6.4 合法性自检的推荐写法

```ts
// v19/env/subject_episode.ts:502-505
if (!allowed.some((a: Action) => encodeAction(a) === encodeAction(action as Action))) {
    policyError = `chosen action is not in the policy-allowed set: ${encodeAction(action)}`;
    break;
}
```

按 `actionCode` 比对（不是按对象引用、不是按下标）。搜索里对每个节点同样应先 `canonicalActionOrderV16(engine.getLegalActions(seat))` 再编码。

**过滤约定**：正式对局统一过滤 `surrender`（`ACTION_FILTER_ID_V15 = 'filter-surrender-v1'`，`v14/tools/eval_v14_protocol.ts:203`；实现见 `eval_v14_match.ts:385-390`、`subject_episode.ts:389-393`）。搜索若沿用该合同，必须保持一致并单独计数。

---

## 7. 模型推理接口

### 7.1 加载与预测签名

```ts
// src/game/ai/spatial_conv_net.ts:696
export function loadSpatialResNetFromJson(
    jsonStr: string,
    options?: { expectedEncoderSchemaId?: string | null }
): SpatialResNetWeights
```

- `expectedEncoderSchemaId` 传 `null`/省略时按历史规则推断（v1 → v1 语义，其余 → v13）；显式传入则必须一致，否则抛错（`spatial_conv_net.ts:707-724`）。
- 通道数自检：`spatial_conv_net.ts:727-736`。
- 调用范例（与评测侧完全一致）：`v14/tools/eval_v14_match.ts:699-712`、`v19/tools/diagnose_dev_families.ts:50-58`。

```ts
// src/game/ai/spatial_conv_net.ts:368
constructor(weights: SpatialResNetWeights)
```

只读身份字段：`isV2`（`326`）、`spatialChannels`（`332`）、`semanticDim`（`337`）、`encoderSchemaId`（`345`）、`semanticsVariant`（`346`）、`globalPolicyPool`（`355`）。

```ts
// src/game/ai/spatial_conv_net.ts:435-438
public predict(
    encodedState: SpatialEncodedState,
    candidateActions: SpatialActionFeatures[]
): SpatialInferenceResult
```

返回（`spatial_conv_net.ts:94-105`）：`{ value, actionLogits, actionProbs, bestActionIndex, spatialFeaturesZ }`。

### 7.2 GameState → 张量的编码函数

```ts
// src/game/ai/spatial_tensor_encoder.ts:333-338
export function encodeGameStateSpatial(
    state: GameState,
    playerId: number,
    version: 'v1' | 'v2' = 'v2',
    options?: { channels?: number }
): SpatialEncodedState
```

```ts
// src/game/ai/spatial_tensor_encoder.ts:581-587
export function encodeCandidateActionSpatial(
    state: GameState,
    playerId: number,
    action: Action,
    version: 'v1' | 'v2' = 'v2',
    variant: ActionSemanticsVariant = 'v15_current'
): SpatialActionFeatures
```

- 张量形状：`[C, 20, 20]` 扁平 `Float32Array`（`SPATIAL_TENSOR_MAX_H/W = 20`，`spatial_tensor_encoder.ts:72-73`）；通道数 `24 / 26 / 34`（`spatial_tensor_encoder.ts:42,69,71`），**必须由 `predictor.spatialChannels` 决定**（`shared_spatial_policy.ts:93-100`）。
- 全局特征维度：V1 = 16，V2 = 20（`spatial_tensor_encoder.ts:74-76`）。
- 动作语义维度：V1 = 24，V2 = 32，V3（当前）= 53（`spatial_tensor_encoder.ts:78-85`）。
- schema 常量：`ENCODER_SCHEMA_ID_V13/V14/V15/V19`（`spatial_tensor_encoder.ts:96-117`），`ENCODER_SCHEMA_SEMANTICS_VARIANT`（`152`）。
- `variant` 必须由权重声明的 schema 分派：`actionSemanticsVariantForSchema`（`spatial_tensor_encoder.ts:162`）。

### 7.3 统一推理入口（推荐）

```ts
// src/game/ai/shared_spatial_policy.ts:65-71
export function predictSpatialAction(
    predictor: SpatialResNetPredictor,
    state: GameState,
    playerId: number,
    legalActions: readonly Action[],
    version?: 'v1' | 'v2'
): SpatialPredictionResult
```

返回（`shared_spatial_policy.ts:24-45`）：`action`、`bestActionIndex`（规范顺序下标）、`selectedInputIndex`（原始数组下标）、`orderedActionCodes`、`bestActionCode`、`candidateOrderingId`、`actionLogits`、`actionProbs`、`value`。

- 空合法集抛 `EmptyActionSetError`（`shared_spatial_policy.ts:53-59,72-81`），**不伪造 `end_turn`**。
- 内部流程：编码状态 → `canonicalActionOrderV16` 排序 → 逐候选编码 → `predict` → `stableArgmaxV16` 复核（`shared_spatial_policy.ts:107-131`）。

### 7.4 是否支持批量推理

**不支持跨状态批量推理。** `predict` 的第二个参数是**同一状态下**的候选动作列表（`spatial_conv_net.ts:568-593` 逐个候选跑 `polDense1/polDense2`），没有 batch 维度，没有 `predictBatch`。若要在搜索里同时评估 N 个节点的策略头，只能循环调用 N 次。

**两个必须注意的实现细节：**

1. **内部缓冲复用，非可重入。** `spatial_conv_net.ts:348-366` 预分配了 `bufStem/bufZ/bufPolIn/...`；返回值 `spatialFeaturesZ` 就是 `this.bufZ`（`spatial_conv_net.ts:633`），**下一次 `predict` 会原地覆盖它**。要保留特征必须立刻 `new Float32Array(result.spatialFeaturesZ)` 拷贝。
2. **每次 `predict` 都重算整个 stem + 2/4 个残差块。** 搜索中同一节点的多个候选共享一次状态前向（`predict` 的设计正是如此），但**不同节点之间无法共享**。

### 7.5 编码成本提醒（与 §1.5 呼应）

- `encodeGameStateSpatial` 每次 `new Float32Array(C * 400)`（`spatial_tensor_encoder.ts:354`），26 通道 = 10 400 floats；V19 34 通道 = 13 600 floats。
- `encodeCandidateActionSpatial` 对 `attack` 候选会调用 `calculateDamage` + `estimateCounterDamageForVariant`（`spatial_tensor_encoder.ts:611-618`），后者内部深拷贝整个 state（`rules.ts:188`）。
- 因此「整回合搜索」的单节点成本 ≈ 1 次状态前向 + N 次候选语义编码（其中攻击候选含 N_attack 次全状态 JSON 深拷贝）。S1 的「每窗口最多 10 分钟」预算（`V19_R123_REVIEW_AND_SEARCH_20260930.md:65`）必须在实测吞吐后再冻结。

---

## 8. 现有测试清点

### 8.1 `src/game/tests/` 与 `src/game/**/*.test.ts`

| 文件:行 | 用例 | 作用 | 与 S0 的关系 |
|---|---|---|---|
| `src/game/tests/initial_turn_income.test.ts:9-23` | 蓝方先手时立即获得两座城镇、一座城堡和指挥官的收益 | 锁定 `applyInitialTurnStart` 只结算一次 | **S0-② 直接覆盖** |
| `src/game/tests/initial_turn_income.test.ts:25-46` | 新遭遇战与训练环境首回合只结算一次，后续快照不会重复入账 | `new GameEngine(state)` 与 `env.reset()` 后金币不变 | **S0-② 直接覆盖** |
| `src/game/tests/engine.test.ts:1903-1916` | 初始化与状态克隆不影响原状态 | `engine.clone()` 后改克隆不污染原引擎 | **S0-① 部分覆盖**（只验证隔离，不验证逐位相同） |
| `src/game/tests/engine.test.ts:6152-6160` | 确定性 - 同一初始状态和合法动作产生同样结果 | 两个引擎同状态同动作 ⇒ `getState()` 相等 | **S0-① 部分覆盖** |
| `src/game/tests/engine.test.ts:5089-5120` | 多队伍回合会按队伍 ID 顺序轮转，并跳过禁用队伍 | `end_turn` 的 `currentPlayer`/`turn` 变化 | **S0-③ 部分覆盖** |
| `src/game/tests/engine.test.ts:5122-5130` | 初始当前队伍被禁用时会切到下一个可行动队伍 | 构造期 `ensureCurrentPlayerCanAct` | **S0-③ 部分覆盖** |
| `src/game/tests/engine.test.ts:4867-4896` | APK skirmish 当前队伍被摧毁且未终局时自动交给下一存活队伍 | 自动换手层次 1 | **S0-③ 部分覆盖** |
| `src/game/tests/engine.test.ts:5075-5087` | 只剩同一联盟存活时会以联盟 ID 结束对局 | `winner` 写联盟号 | **S0-④ 部分覆盖** |
| `src/game/tests/engine.test.ts:4545-4563` | 投降动作由规则开关控制并按联盟胜负结算 | surrender 分支的胜负 | S0-④ 旁证 |
| `src/game/tests/engine.test.ts:5904-5936` | 超时结算按军力价值而不是单纯单位数量判断胜负 | **锁定旧接口的代理胜负行为** | **S0-④ 负例**（必须避开该路径） |
| `src/game/ai/planning.test.ts:31-56` | 同一玩家 move 之后仍可继续 attack，currentPlayer 不换号 | 己方连续动作不换手 | **S0-③ 直接覆盖** |
| `src/game/ai/planning.test.ts:57-73` | end_turn 按真实回合序列推进到下一玩家 | 边界推进 | S0-③ 直接覆盖 |
| `src/game/ai/planning.test.ts:74-85` | 已阵亡玩家被跳过，不成为 currentPlayer | 自动换手 | S0-③ 直接覆盖 |
| `src/game/ai/planning.test.ts:86-96` | recruit_to_castle 产生 pending 单位且不换号 | `pendingUnitId` 不破坏边界 | S0-③ 直接覆盖 |
| `src/game/ai/planning.test.ts:97-135` | 胜利由中途攻击动作即时触发（规则终局，非预算截断） | 自然终局即时可见 | **S0-④ 直接覆盖** |
| `src/game/ai/planning.test.ts:162-206` | 根阵营视角：终端胜值在任何深度都是 +1；敌对阵营行动方判负 | 根视角价值 | S0-④ 直接覆盖 |
| `src/game/ai/planning.test.ts:208-225` | 分支展开不污染父局面与兄弟分支（hash 前后一致） | **克隆隔离 + 哈希稳定** | **S0-① 直接覆盖** |
| `src/game/ai/planning.test.ts:238-260` | 相同节点预算的固定输入两次 DFS 枚举完全复现，且不超预算 | 可复现性 | **S0-① 直接覆盖** |
| `src/game/ai/planning.test.ts:261-273` | 预算耗尽后 expandAll 报 stop，但 legalActions 仍可用 | 截断与终局分离 | S0-④ 直接覆盖 |
| `src/game/ai/planning.test.ts:282-300` | 规划接口与旧环境返回值兼容：同一动作序列 step 后 state hash 一致 | `PlanningNode` 与 `env` 语义等价 | S0-① 旁证 |
| `src/game/apk_replay.test.ts:207-219` | 严格回放拒绝缺少合法招募的记录 | `applyInitialTurnStart: false` 的使用范例 | S0-② 旁证 |

### 8.2 `v19/env/*.test.ts`

| 文件:行 | 用例 | 作用 |
|---|---|---|
| `v19/env/subject_episode.test.ts:110-116` | 纯函数回报口径：自然胜 +1 / 自然负 −1 / 平局与未终局 0 | `rewardForWinnerV19` 全分支 | **S0-④ 直接覆盖** |
| `v19/env/subject_episode.test.ts:118-135` | 手工构造：主体自然胜时终局回报为 +1 | 自然胜分类 | S0-④ |
| `v19/env/subject_episode.test.ts:137-147` | 手工构造：主体自然负时终局回报为 −1 | 自然负分类 | S0-④ |
| `v19/env/subject_episode.test.ts:149-160` | 手工构造：双方同时被淘汰时是规则平局 | `winner === -1` 不被当截断 | S0-④ |
| `v19/env/subject_episode.test.ts:164-172` | 步数上限截断：terminalReturn 必须为 null | 截断不伪造胜负 | S0-④ |
| `v19/env/subject_episode.test.ts:174-191` | ply 上限截断：与现有 `winner=null` 探针同条件，本模块不给 −1 | **旧接口负例** | S0-④ |
| `v19/env/subject_episode.test.ts:193-236` | 12 个短局全部满足：截断 ⟺ 无终局回报 | 合同自检 | S0-④ |
| `v19/env/subject_episode.test.ts:240-278` | 记录的 behaviorLogProb 等于对同一状态重新前向后的对数概率 | 前向可重放 | S0-① 旁证 |
| `v19/env/subject_episode.test.ts:280-292` | 采样流确定性：同局同采样种子逐位复现 | 采样 RNG 可复现（**不是 H0 流**） | S0-① 部分 |
| `v19/env/subject_episode.test.ts:376-387` | 回合边界检查点：每个主体回合一条，含完整规范化状态哈希 | `turnSnapshots` 合同 | **S0-③ 直接覆盖**（仅记录侧） |
| `v19/env/subject_episode.test.ts:424-437` | 真实对局跨多块写出 | 长局完整性 | 旁证 |

### 8.3 `v19/tests/`（Python）

| 文件:行 | 用例 | 作用 |
|---|---|---|
| `v19/tests/test_ppo_contract.py:49-62` | `test_gae_natural_loss_is_negative_and_natural_draw_is_zero` | GAE 侧自然负/和的符号 | S0-④ 下游 |
| `v19/tests/test_ppo_contract.py:64-76` | `test_gae_truncated_step_never_writes_terminal_z` | 截断不得写终局 | **S0-④ 直接覆盖（训练侧）** |
| `v19/tests/test_ppo_contract.py:78-90` | `test_gae_terminal_boundary_resets_accumulator` | 终局边界重置 | S0-④ |
| `v19/tests/test_encoder_parity_v19.py:62-120` | 五图 200 快照的 TS/Python 编码一致性 | 编码逐位一致 | S0-① 旁证 |

### 8.4 `v13/tools/eval_v3_core.test.ts`（node runner，非 vitest）

| 行 | 用例 | 作用 |
|---|---|---|
| `v13/tools/eval_v3_core.test.ts:58-130` | 13 条分类断言（含 `winner === -1` 是自然和、错误不折叠成平局/截断、规则裁决优先于预算） | **S0-④ 的权威分类回归** |
| `v13/tools/eval_v3_core.test.ts:134-146` | `streamFor` 对 `(seed, seat)` 确定；不同座位/种子不同 | **S0-① 的 RNG 身份回归（目前唯一）** |
| `v13/tools/eval_v3_core.test.ts:156-162` | 座位奇偶与种子奇偶不是同一个变量 | RNG 派生无混淆 |

注意：该文件通过 `node --openssl-legacy-provider v12/tools/run-tool.mjs v13/tools/eval_v3_core.test.ts` 运行（`eval_v3_core.test.ts:10-13`），**不在 `vitest run` 的默认收集范围内**。

### 8.5 覆盖缺口（S0 四项逐条对照）

| S0 验证项 | 已有覆盖 | **缺失** |
|---|---|---|
| ① 同一完整根状态及 H0 RNG 可克隆恢复 | 状态克隆隔离（`planning.test.ts:207-225`）、克隆确定性（`engine.test.ts:6152`）、`streamFor` 确定性（`eval_v3_core.test.ts:134-146`）、`PlanningNode` 可复现（`planning.test.ts:238-260`） | **没有任何测试证明「从中间根状态可以恢复原 H0 随机流」**；也没有测试记录/恢复 H0 流的消耗计数。`subject_episode.ts` 的 `turnSnapshots` 只存状态哈希（`subject_episode.ts:211-219`），不含 RNG 位置 |
| ② 恢复时不重复发初始收入 | 金币层面已覆盖（`initial_turn_income.test.ts:25-46`） | **没有测试断言「恢复后整个 `getState()` 与快照逐位相同」**（只比金币，漏掉 `hasMoved`/`movementRemaining`/状态衰减/`campaignEvents(turn_start)` 的副作用） |
| ③ 搜索按真实 currentPlayer 判断回合边界、兼容自动换手 | 单步层面已覆盖（`planning.test.ts:31-96`、`engine.test.ts:4867,5089,5122`）、`completeSideTurn` 有实现（`teacher_s1_v16.ts:373-432`） | **没有测试覆盖「H0 无有意义动作时引擎在一次 step 内绕过 H0 回到己方」这一自动换手路径**；也没有「一次 step 跨多个玩家」的边界测试 |
| ④ 基线序列保留 + 自然胜负/截断/错误严格区分 | 分类层面覆盖充分（`eval_v3_core.test.ts:58-130`、`subject_episode.test.ts:110-236`） | **没有测试覆盖「搜索分支不污染基线序列」**（即同一根反复展开后，基线的 actionDigest 不变）；也没有「非法动作被 `engine.step` 静默吞掉（`info` 含 '非法动作'）后必须记为错误」的用例 |

---

## 9. S0 四项验证的实现难度评估

> 难度口径：★ = 直接复用现有代码即可；★★★★★ = 需要新增机制并改变现有数据流。

### ① 同一完整根状态及 H0 RNG 可克隆恢复 —— **★★★★☆（四星，S0 的主要工作量）**

**为什么难**：状态克隆本身是 ★（`structuredClone` / `JSON.parse(JSON.stringify())` / `GameEngine.clone()` / `PlanningNode.root` 四选一，全部现成）；难点全在「H0 RNG」。

**必须做的取舍（二选一，且建议两者都要）**：

- **A. 原流连续（边界内必须用）**：从对局起点重放到根状态。**可直接复用** `v19/review/r123_20260930/probe_icy_order.ts:19-25` 的写法（`playOne` + `onStep` 捕获 `stateBeforeJson` + `maxSteps: engineStepIndex + 1`）。风险：长局前缀昂贵（7799 步量级），需要缓存前缀状态与 H0 流快照点。
- **B. 独立固定续弈流（超出边界后使用）**：**可直接复用** `v16/tools/counterfactual_v16.ts:52,116-120`（`CONTINUATION_SEED` + 逐座位 `streamFor`）。风险：必须在报告里显式声明「边界内是真实 H0 流，边界外是续弈流」，不能混称。

**增强建议（成本低、收益高）**：给 `HeuristicAI` 增加一个可选的 `StatefulRng`（`getState()/setState()`），实现方式已有现成模板——`v17/teachers/battle_search_b100.ts:274-285` 的 `mulberryStateful` 与 `v13/tools/eval_v3_core.test.ts` 的逐值等价自测思路可直接照搬。有了它，**只要在根状态捕获点同时记录 H0 的 uint32 流位置，口径 A 就不需要重放前缀**。这是把 ★★★★☆ 降到 ★★☆ 的唯一途径，但**会改动 `src/game/ai/heuristic_ai.ts`（H0 冻结源码，摘要会变）**，因此必须先确认是否允许（见 §10 未确定项）。

**验收建议**：同一根状态克隆两次 → 用同一 H0 流各跑 K 步 → `actionCode` 序列与 `stateHash` 序列逐位相同。

### ② 恢复时不重复发初始收入 —— **★☆☆☆☆（一星，基本已解决）**

**为什么容易**：所有恢复路径（`new GameEngine(state)`、`clone()`、`reset()`、`env.reset()`）都已经不传 `applyInitialTurnStart`（§4.2 表格），并且 `initial_turn_income.test.ts:25-46` 已锁定金币层面。

**仍需补的工作（半天量级）**：
1. 把自检从「比金币」升级为「比整个 `getState()` 的规范化哈希」——因为 `startTurnForPlayer` 还会重置行动标记、衰减状态、结算地形回血并触发 `campaignEvents(turn_start)`（`engine.ts:326-386`）。
2. 在搜索侧加一条**禁止性断言**：任何重建根引擎的调用点都不得出现 `applyInitialTurnStart`；可用 `grep` 级别的静态检查或代码评审清单固定。
3. 若搜索结果要参与训练，沿用 `v19/env/subject_episode.ts:604-617` 的自检风格（违反即抛错，不静默）。

### ③ 搜索按真实 currentPlayer 判断回合边界，兼容引擎自动换手 —— **★★★☆☆（三星，需要正确处理边界情形）**

**为什么中等**：主判据非常明确（`state.currentPlayer !== 己方座位`），且有两个可照搬的权威实现——`v16/tools/teacher_s1_v16.ts:373-432`（`completeSideTurn` + `SideTurnResult.stop` 六态）与 `v16/tools/counterfactual_v16.ts:142-163`（含 `reachedBoundary` 与 `to-terminal` 开关）。可以直接复用 `completeSideTurn`，不必重写。

**真正的风险点有三个**：

1. **一次 `step` 可能跨多个玩家、甚至跨圈。** `ensureCurrentPlayerHasMeaningfulAction`（`engine.ts:988-1009`）的 `while` 循环会连续 `startTurnForPlayer` 并 `turn += 1`。判据必须每步重新取 `getState()`，不能缓存 `currentPlayer`。
2. **可能绕过 H0 直接回到己方。** 若 H0 无有意义动作，引擎在同一个 `step` 内替它结束回合。此时「己方边界」成立但 `opponentStepsBetween === 0`。**不能用「H0 走过」当判据。**
3. **`PlanningNode.root` 不透传 `disableAutoAdvanceWhenNoMeaningfulAction`**（`planning.ts:144` vs `engine.ts:118-120`），而 `clone()` 会透传（`engine.ts:140`）。若搜索用 `PlanningNode` 而基线用 `playOne` 的引擎，两者的自动换手行为可能不同。**建议统一：要么都用默认（开启），要么都显式关闭。**

**验收建议**：构造一个「H0 只剩不能动/不能招募的单位」的局面，断言搜索能在**有限步内**回到己方边界且不把该步记为 H0 动作；再构造一个「一次 step 跨 2 个玩家」的局面，断言 `turn` 增量被正确记录。

### ④ 同一根的基线序列始终保留 + 自然胜负/截断/错误严格区分 —— **★★☆☆☆（两星，分类已有权威实现，基线保留需要纪律）**

**分类部分（易）**：三套权威实现任选其一——评测口径 `classifyOutcome`（`v13/tools/eval_v3_core.ts:57-73`）、训练口径 `SubjectOutcomeKindV19`（`v19/env/subject_episode.ts:38-46,559-573`）、搜索口径 `PlanningNode.terminalVerdict/rootViewValue`（`planning.ts:194-209`）。分类逻辑与优先级都有测试钉住（`eval_v3_core.test.ts:58-130`、`subject_episode.test.ts:110-236`）。**唯一的硬要求是：不要调用 `AncientEmpiresEnv.stepAction` 取奖励**（§5.5 的两个陷阱），并记住 `engine.step()` 用 `info` 字符串而不是异常报非法动作（`engine.ts:520-527`）。

**基线保留部分（需要纪律，不需要新机制）**：
- 「同一根的基线序列始终保留」= 搜索前后，原始 `playOne` 轨迹的 `actionDigest` 必须不变。现有机制已足够：`playOne` 的 `actionDigest`（`eval_v14_match.ts:615`）与 `trajectoryDigest`（`616`）。
- 实现要点：**搜索必须只读根状态**（`engine.getState()` 已是深拷贝，`engine.ts:132-135`），任何 `engine.step` 都在克隆上执行（`PlanningNode.apply` 已如此，`planning.ts:232-233`）；`PlanningNode` 的父节点状态不被污染已有测试（`planning.test.ts:207-225`）。
- 风险：若搜索直接持有 `playOne` 内部的 `engine` 引用并 `step`，基线就被破坏。**必须传 `GameState` 快照而不是 `GameEngine` 实例**，或在传实例时强制 `clone()`。
- 建议加一条回归：同一根先跑基线记录 `actionDigest`，再跑搜索，再重跑基线，断言两次 `actionDigest` 相同。目前**没有这样的测试**。

### 汇总

| S0 验证项 | 难度 | 可复用实现 | 主要缺口 |
|---|---|---|---|
| ① 根状态 + H0 RNG 克隆恢复 | ★★★★☆ | `structuredClone`/`PlanningNode.root`/`probe_icy_order.ts`/`counterfactual_v16.ts` | H0 流位置不可导出；需二选一并写进合同；若允许改 H0 可加 `StatefulRng` 降到 ★★☆ |
| ② 不重复发初始收入 | ★☆☆☆☆ | 现有全部恢复路径已正确 | 自检从「比金币」升级为「比全状态哈希」 |
| ③ 回合边界 + 自动换手 | ★★★☆☆ | `completeSideTurn`（`teacher_s1_v16.ts:373-432`） | 绕过 H0 的自动换手路径、跨多玩家单步、`PlanningNode` 不透传开关 |
| ④ 基线保留 + 结果分类 | ★★☆☆☆ | `classifyOutcome` / `SubjectOutcomeKindV19` / `PlanningNode.terminalVerdict` | 缺「搜索不污染基线 digest」的回归；必须禁用 `env.stepAction` 取奖励 |

---

## 10. 未确定项（明确标注，不做推测）

1. **是否允许修改 `src/game/ai/heuristic_ai.ts` 以暴露 RNG 状态。** 该文件属于 V16/V17/V19 冻结的 H0 依赖闭包（`v16/tools/eval_v16_identity.ts:67-72`，摘要值见 `v17/out/v17_20260926_r2/identity/source_manifest.json:59-69`）。任何修改都会改变 `h0.digest` 与缓存键（`v14/tools/eval_v14_protocol.ts:205-213` 注释）。**是否允许改、改了之后旧的 DEV20/冠军基线还能否引用，本报告无法判定，需上层决策。** 本报告只陈述：不改 ⇒ 口径 A 必须重放前缀；改 ⇒ 可把流位置写进快照。

2. **S1 的实际搜索吞吐未实测。** 本报告只能指出成本来源（§1.5 的候选编码深拷贝、§7.5 的状态前向），**无法给出「每窗口 10 分钟」是否可行**。`V19_R123_REVIEW_AND_SEARCH_20260930.md:65` 要求「前两个开发窗口实测速度后冻结预算」，该实测尚未进行。

3. **`v19` 是否有独立于 `v17` 的 H0 源码摘要冻结文件。** 已确认 `v19/out/run_20260928_v19_01/identity/manifest.json:236` 记录了 `rngContractId`，并逐组与 V17 比对（`v19/tools/freeze_v19_identity.py:112-131`）；但**该 manifest 是否把 `h0` 组的逐文件 SHA 也完整落盘**，本次只确认了分组比对结构（`manifest.json:81,114`），未逐字段核对全部文件哈希表。判定为**未确定**。

4. **`v19/tests/` 下是否有与 S0 相关的、本次未列出的用例。** 已穷尽该目录（仅 2 个 `.py` 文件 + `__pycache__`），结论确定；但仓库根 `tools/`、`v14/`、`v15/`、`v16/`、`v17/` 下还有大量 `*.test.ts`，本报告只按「与状态恢复/RNG/回合边界/自然结果相关」筛选，**未做全仓穷尽**。

5. **`getLegalActions` 在极端局面下是否会产生重复 actionCode。** `canonicalActionOrderV16`（`action_ordering.ts:71-86`）会对重复候选直接抛错。本次通读 `rules.ts:295-488` 未发现同一动作被推入两次的路径，但**未构造穷尽用例验证**（例如多单位同格、`destroy_town` 同时来自「站在 town 上」与「射程内空 town」两条路径——`rules.ts:364-374` 与 `rules.ts:424-426` 生成的是带/不带 `target` 的两种不同编码，理论上不重复）。判定为**未确定**，建议在 S0 自检里加一条「对根状态与若干随机后继调用 `canonicalActionOrderV16` 不抛错」的断言。

---

## 附：本次分析引用的文件清单（供交叉核对）

- 引擎核心：`src/game/engine.ts`、`src/game/types.ts`、`src/game/rules.ts`、`src/game/env.ts`、`src/game/rule_config.ts`、`src/game/terrain.ts`、`src/game/campaign_events.ts`、`src/game/apk_skirmish.ts`、`src/game/state_snapshot.ts`
- 搜索/规划：`src/game/ai/planning.ts`、`src/game/ai/action_ordering.ts`、`src/game/ai/heuristic_ai.ts`、`src/game/ai/battle_search_ai.ts`
- 推理：`src/game/ai/spatial_conv_net.ts`、`src/game/ai/spatial_tensor_encoder.ts`、`src/game/ai/shared_spatial_policy.ts`
- 评测/训练包装：`v14/tools/eval_v14_match.ts`、`v14/tools/eval_v14_protocol.ts`、`v13/tools/eval_v3_core.ts`、`v16/tools/teacher_s1_v16.ts`、`v16/tools/counterfactual_v16.ts`、`v16/tools/eval_v16_identity.ts`、`v16/tools/eval_v16_protocol.ts`、`v17/teachers/battle_search_b100.ts`、`v17/teachers/b100_policy.ts`、`v19/env/subject_episode.ts`、`v19/tools/diagnose_dev_families.ts`、`v19/review/r123_20260930/probe_icy_order.ts`
- 测试：`src/game/tests/engine.test.ts`、`src/game/tests/initial_turn_income.test.ts`、`src/game/apk_replay.test.ts`、`src/game/ai/planning.test.ts`、`v13/tools/eval_v3_core.test.ts`、`v19/env/subject_episode.test.ts`、`v19/representation/schema_v19.test.ts`、`v19/tests/test_ppo_contract.py`、`v19/tests/test_encoder_parity_v19.py`
- 身份冻结：`v17/out/v17_20260926_r2/identity/source_manifest.json`、`v19/out/run_20260928_v19_01/identity/manifest.json`、`v19/tools/freeze_v19_identity.py`
- 任务合同：`v19/V19_R123_REVIEW_AND_SEARCH_20260930.md`
