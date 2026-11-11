# APK 原生规则 AI 与项目 HeuristicAI

核对日期：2026-10-13。对象：`aer-release-4.2.5.1.apk`，SHA256 为 `51B00185F300DD8899284AA91986AEE9A1CC73FA012262A0D9EEBC97FAD1AA7B`。

**本交付包含原生 AI 的结构说明，以及可运行的项目启发式基线；没有把 APK 原生 AI 完整移植到 TypeScript。** `HeuristicAI` 是项目类名，不能据此称它为 APK 原生实现。`ApkLikeAI` 是部分模仿 APK 调度方式的近似策略，也没有达到逐动作等价。2026-10-20 新增的 `OriginalApkLikeAI` 按 `C1275a.java` 做了源码级移植，但 JADX 仍有控制流缺口，也没有原生差分轨迹，因此同样不能称为完整移植或原生等价。训练环境的规则正确性、对手策略相似度和模型实际胜率是三个需要分别验证的问题。

## 四种实现的身份

| 名称 | 实际含义 | 可用于什么 |
| --- | --- | --- |
| APK `C1275a` | APK 内置的规则启发式 AI，工厂 `C0652f.mo4100a()` 创建它 | 在 APK 中运行的真实原生对手；反编译材料提供算法证据 |
| 项目 `HeuristicAI` | 项目自己的合法动作评分策略，结合 `RuleTacticalEvaluator` | 可复现的训练、评测对手；不能标成原生 AI 标签 |
| 项目 `ApkLikeAI` | 先按单位优先级筛选，再调用项目 `HeuristicAI.scoreCandidateActions()` | 近似 APK 行动顺序的基线；不能作为原生决策真值 |
| 项目 `OriginalApkLikeAI` | 按 `C1275a.java` 的决策主流程、单位/目标选择、动作枚举与评分逐方法移植，规则执行复用项目引擎 | 源码级对照与实验策略；JADX 控制流缺口和项目规则差异仍在，不能称原生等价 |

## 原生 AI 已核实的结构

证据来自本地既有 JADX 输出，路径相对于原仓库 `APK/_analysis/jadx_output/java/`。交付包无需该目录即可运行项目基线，也不包含原 APK、解包资源或完整反编译代码。

| 证据类/方法 | 已核实行为 |
| --- | --- |
| `p036c/p037a/p039b/p049b/C0652f.java:12` | AI 工厂直接返回 `new C1275a(c0577a)` |
| `p036c/p037a/p039b/p061c/p064j/C1275a.java:1232`，`call()` | 初始化路径缓冲区，统计阵营、招募成本、建筑、地形、能力、部队与可移动单位，然后选择单位；没有单位时进入招募流程 |
| 同类 `:1173`，`m2331o()` | 处理已预选单位；扫描城堡格可指挥单位；选择特殊能力单位；优先 `GRIM_REAPER`；最后选择可移动集合中的单位 |
| 同类 `:31`，`f3090v` | 特殊优先能力表为净化、治疗、村庄占领、虚弱光环、施毒、致盲攻击，共六项 |
| 同类 `:905`，`m2343i()` | 按支援、占领、修复、治疗等能力选择目标，或选择敌方单位目标 |
| 同类 `:423`、`:1118`，`m2365a()`、`m2333m()` | 为所选单位枚举移动后的复合行动并评分；动作结果可携带来源、移动终点、技能目标及攻击后移动终点 |
| 同类 `:226`、`:319`、`:157` | `m2371a()` 评动作，`m2369a()` 评攻击，`m2367a()` 评位置；不是直接使用项目评分表 |
| 同类 `:476`，`m2370a()` | 选择攻击后的再次移动位置 |
| 同类 `:790`、`:1207`，`m2347h()`、`m2330p()` | 依据兵种构成、资源等进入招募或结束回合；部分招募使用 Java `Random.nextInt()` |

这些结论属于静态代码证据，没有经过 Android 实机逐步决策差分。JADX 在 `m2330p()` 明确标记控制流反编译失败，`m2347h()` 也出现条件分支两侧相同的可疑表达式。涉及这些分支的精确阈值和结果必须回查 DEX 指令或运行实测，不能直接把反编译 Java 翻译后宣称完全一致。旧分析文档中的伪代码、推断与行号也需要按当前证据复核。

## 项目近似策略的明确差异

1. `HeuristicAI.getAction()` 对当前全体合法动作评分；原生 AI 先选单位再构造该单位的移动与行动组合。
2. `ApkLikeAI` 接近“先选单位”的框架，但它的特殊能力表有十项，额外包含召唤、支援、修复、城堡占领；原生 `f3090v` 只有上述六项。它优先的是己方城堡上的指挥官；原生对应分支调用的是城堡格单位可指挥性判断，不能直接等同。
3. `ApkLikeAI` 用字符串单位 ID 排定同优先级顺序；APK 使用集合遍历，并有预选单位等运行态。两者的选择顺序不保证一致。
4. 两个项目 AI 都使用自研评分、战术评估与寻路。`ApkLikeAI` 没有移植原生位置、攻击、目标分配和招募评分体系。
5. 项目动作接口分开表达移动、攻击、待命和攻击后移动；APK `C0578b` 可以包含完整的复合决策。项目的重新评分时机也可能导致行为差异。
6. 项目使用可注入的随机函数作评分扰动；APK 使用 Java 随机数及自己的调用顺序。同一个整数种子不代表两个实现会产生相同动作。

## 包内可运行的基线

AI 源文件的最小附加依赖闭包为以下四个文件，其余导入均来自包内公共规则层：

- `src/game/ai/apk_like_ai.ts`
- `src/game/ai/heuristic_ai.ts`
- `src/game/ai/tactical_evaluation.ts`
- `src/game/ai/tactical_pathfinding.ts`

不需要训练脚本、模型权重、神经网络推理、UI 或浏览器。`getAction(engine, playerId, preparedActions?)` 返回普通 `Action`；合法动作和状态执行仍使用公共引擎。传入 `preparedActions` 时必须使用当前状态的动作，不能复用上一步动作缓存。

下面可保存为 `examples/apk_like_ai.ts`，在包根目录用 `node --import tsx examples/apk_like_ai.ts` 执行：

```ts
import { AncientEmpiresEnv, mulberry32 } from '../src/game/env';
import { createDefaultAppGameState } from '../src/game/default_state';
import { ApkLikeAI } from '../src/game/ai/apk_like_ai';

// 两个玩家分别持有固定随机流；这是项目近似基线，不是原生 APK。
const env = new AncientEmpiresEnv({
  initialState: createDefaultAppGameState(), seed: 42, maxPlies: 200,
});
const opponents = new Map<number, ApkLikeAI>();
let result = env.reset();
let steps = 0;
while (!result.done && steps < 100) {
  const player = env.getCurrentPlayer();
  if (!opponents.has(player)) opponents.set(player, new ApkLikeAI(mulberry32(42 + player)));
  const action = opponents.get(player)!.getAction(env.getEngine(), player, env.getLegalActions());
  result = env.stepAction(action);
  if (result.info.includes('非法动作')) throw new Error(result.info);
  steps += 1;
}
console.log(JSON.stringify({
  策略: '项目 ApkLikeAI 近似基线', 步骤: steps,
  环境结束: result.done, 自然终局: env.getEngine().isTerminal(),
  规则胜者: result.state.winner,
}));
```

要使用项目 `HeuristicAI`，替换导入和实例类即可。上例的 100 步上限只用于连贯执行检查，不构成对局胜负评估；环境 `done` 也可能来自截断，应按[环境接口](../environment/interface.md)区分自然终局和代理奖励。

## 训练与评测中的标注

数据和成绩应记录明确的对手身份，例如 `project-heuristic` 或 `project-apk-like`，同时保存代码版本、地图、规则配置、随机种子与终止原因。当前包不能产生“原生 APK AI 动作标签”，也不能证明模型击败了原生 AI。

若后续需要原生 AI 等价版本，应先恢复反编译失败的控制流，保留原生单位枚举、招募、随机数与复合动作语义，再对相同输入状态采集原生实际决策进行差分。覆盖至少包括普通移动攻击、致盲/治疗/召唤、占领、指挥官复活招募、攻击后移动、同盟与多人、同分动作及特殊地图脚本。独立的规则状态差分与 AI 决策差分应分别报告；任一项目基线的胜率都不能替代这些验证。
