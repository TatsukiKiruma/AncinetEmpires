# OriginalApkLikeAI：C1275a 源码级移植说明

更新日期：2026-10-20。对象：APK `aer-release-4.2.5.1`，反编译源码
`APK/_analysis/jadx_output/java/p036c/p037a/p039b/p061c/p064j/C1275a.java`。

## 结论先行

- **已实现**：`OriginalApkLikeAI` 按 `C1275a.java` 的决策主流程、单位选择、目标选择、
  候选动作枚举、动作/位置评分、招募选择逐方法翻译，并接入策略 `original_apk_like`。
- **没有实现**：不能宣称与 APK 原生 AI 逐动作等价。JADX 在 `m2330p()`、`m2347h()`
  存在控制流还原失败；项目规则是独立实现；目前没有 APK 实机逐步决策差分轨迹。
- **正确标签**：`project-original-apk-like`（源码级移植），不是 `apk-native`。
  数据集与战报不得把它标成原生 AI 或原生动作标签。

## 文件与入口

| 文件 | 职责 |
| --- | --- |
| `src/game/ai/original_apk_like_ai.ts` | 决策主流程、单位/目标选择、候选枚举、动作序列、招募 |
| `src/game/ai/original_apk_like_scoring.ts` | APK 单位价值、战斗价值、位置价值、动作/攻击评分 |
| `src/game/ai/neural_ai_adapter.ts` | 策略 `original_apk_like` 适配器 |
| `src/App.tsx` | 自动对局下拉框入口 |

## C1275a 方法对照

| APK 方法 | 移植位置 | 说明 |
| --- | --- | --- |
| `call()` | `OriginalApkLikeAI.getAction` | 全局收集、单位选择、招募/结束回合 |
| `m2331o()` | `selectUnit` | 城堡单位 → 六项特殊能力 → 死神 → 可移动单位（含不在城堡上的指挥官） |
| `m2343i()` | `selectObjective` | 支援、占领、修复、治疗、最近敌人 |
| `m2365a()` / `m2364a()` | `generateCandidates` | 待机、攻击、治疗、召唤、支援、占领、修复 |
| `m2371a()` | `apkActionScore` | 各动作基础分 |
| `m2369a()` | `apkAttackScore` | 伤害、击杀、状态、反击、修理工/召唤师特例 |
| `m2367a()` | `apkPositionScore` | 地形、治疗地形、距离、攻防距离、城堡/村庄、光环 |
| `m2370a()` | `applyPostAttackMove` | 突击部队攻击后二次移动 |
| `m2337k()` | `apkUnitValue` | 单位价值 |
| `m2340j()` | `apkCombatValue` | 战斗价值 |
| `m2346h()` | `apkPositionValue` | 位置价值 |
| `m2363b()` | `apkHealValue` | 治疗价值 |
| `m2357d()` / `m2341j()` / `m2361c()` | `available` / `apkPerTurnRecruitCap` / `apkRecruitCap` | 招募资格、每回合上限、兵种上限 |
| `m2344i()` | `chooseRecruitType` | 兵种需求权重 |
| `m2347h()` | `chooseRecruitType` | 招募优先级 |
| `m2330p()` | `selectRecruitAction` | 指挥官重招募、招募城堡、结束回合 |
| `m2336l()` | `buildThreatMap` | 敌方本回合能威胁到的己方城堡/村庄（`f3104o`）、威胁来源（`f3105p`）、敌方城堡占领者计数（`f3106q`） |
| `m2338k()` | `buildTerrainRatios` | 村庄包围盒水域/开阔陆地比例 |

保留的 APK 常量：

- 特殊能力顺序 `f3090v`：净化 → 治疗 → 村庄占领 → 虚弱光环 → 施毒 → 致盲。
- 早期招募 `f3091w`：`[1, 18]`。
- 偏好招募 `f3092x`：`[7, 12, 6, 13, 18]`。
- 低成本偏好 `f3093y`：`[6, 2, 0]`。
- 兵种上限 `m2361c`：0→999、1/7→4、3→1、8→5、17/18/19 按地形比例等。
- 每回合上限 `m2341j`：`ceil(村庄数 / 对手数 * 0.3 + 1)` 或 `population / 7`。

## 源码纠偏：指挥官并非“不自动行动”

旧分析文档 `docs/apk-analysis/OPENCODE_APK_AI_Analysis.md` 曾写“指挥官不自动行动”，但当前
JADX 的 `m2358d()` 只过滤 `f1311i`（已行动）和队伍归属，并没有过滤指挥官；`m2331o()` 的
城堡扫描会选城堡上的任意己方单位，最后的可移动集合也包含不在城堡上的指挥官。

移植版按源码允许指挥官作为普通可移动单位行动。早期实现曾错误排除非城堡上的指挥官，
结果是在 0 单位方仍保有城堡时无法完成最后占领，产生大量假截断；该问题已修正并重新跑完
20 局评测。

## 与 APK 的已知差异

这些差异是显式保留的，不是“已经对齐”：

1. **伤害/反击/状态使用项目权威规则**：`calculateDamage`、`estimateCounterDamage`、
   `canCounterAttack`，而不是 Java `m4339b` 的单位拷贝模拟。项目规则已按 APK 逐项对齐，
   但两者仍是两套实现，边缘数值不保证逐位相同。
2. **复合动作拆分**：APK 一次返回 `C0578b`（移动 + 事件 + 二次移动）；项目原子动作
   一次只能执行一个。移植版用 `move → attack/heal/... → post_attack_move` 计划队列，
   计划带状态签名，跨 `GameEngine` 克隆也不会串局。
3. **同分选择确定化**：APK 使用 `HashSet` 迭代，顺序不保证；移植版按位置、单位 ID
   排序，保证同一状态同一随机流可复现。
4. **`m2330p()` / `m2347h()` 的 JADX 控制流不完整**：招募城堡比较、部分兵种优先级
   使用源码可读部分 + 明确近似；不能声称与 DEX 指令逐分支一致。
5. **`m2371a()` 占领分**：JADX 在 OCCUPY 分支出现可疑 fallthrough；按项目既有分析
   采用城堡 10000、村庄 15000（村庄 = 城堡 + 5000），并在此记录。
6. **脚本 tagged 单位**：APK `m4407b` 读取脚本 tag；项目以 `apkTargeted` 近似。
7. **反击预测的经验/升级**：项目 `estimateCounterDamage` 已投影攻击者获得经验与升级；
   APK `m2369a` 使用拷贝单位直接加伤害，二者的升级时序可能有细微差异。
8. **目标分配表 `f3096g` 未完整复刻**：APK 会把已选中的占领/修复目标记入
   `f3096g`，避免多个单位重复选择同一目标；移植版每次决策重建上下文，没有跨决策的
   `f3096g` 记忆。`m2342i()`（被威胁城堡的防守招募）只实现了“从合法招募动作中选被威胁
   城堡”的近似分支。
9. **敌城堡目标条件**：按 `m2353e` 还原为“敌方存活单位 ≤1 且敌方金币 <400”，
   其余占领/修复/治疗目标按 `m2343i` 的优先级近似；没有复刻 `f3096g` 的逐目标占用。
10. **没有原生差分**：当前没有 APK 实机/模拟器的逐步动作轨迹，因此无法计算动作一致率，
   也无法证明“完全对齐”。如果后续要升级为行为级对齐，必须先采集原生轨迹并做
   strict 差分，覆盖移动攻击、致盲/治疗/召唤、占领、指挥官复活、攻击后移动、同盟/多人、
   同分动作和特殊地图脚本。

## 验证

已执行：

- `npx tsc --noEmit` 通过。
- `npm test` 全量 45 个测试文件、428 个测试通过，其中
  `src/game/ai/original_apk_like_ai.test.ts` 5 项通过。
- `npm run build` 通过。
- 默认地图测试内 160 步连续对局无非法动作；覆盖 move / capture / recruit / attack /
  heal / summon / repair / post_attack_move / wait / end_turn。
- 计划队列冒烟：多步计划由 `move → action` 组成，每个动作都先通过引擎合法集合校验；
  状态签名用于跨 `GameEngine` 克隆验证计划没有过期。

未执行/未证明：

- 未做 APK 原生 AI 逐动作差分，因此没有动作一致率数字。
- 未验证手机/浏览器实时性能与 600ms 决策预算。
- 未进入训练集/战报；在完成上述差分前，只能作为实验策略使用。

## 20 局评测记录

2026-10-20 用 5 张 1v1 图（Duel、Crossed swords、Mourningstar、Liberty Port、The Crossing）
正反手各一局，分别运行 HeuristicAI / BattleSearchV2AI vs `OriginalApkLikeAI`。
评测入口是 `tools/arena_original_apk_20261020.ts`，结果保存在
`deliverables/original_apk_arena_20261020/`（REPORT.md、summary.json、games.jsonl）。
截断与自然胜负分开统计，不把截断计为胜利。

## 使用方式

自动对局 UI 中选择 `Original APK AI (C1275a 源码移植 - 实验)`；代码中：

```ts
const ai = new OriginalApkLikeAI({ rng });
const action = ai.getAction(engine, playerId);
```

`getAction` 返回项目原子动作；多步计划由同一个 `OriginalApkLikeAI` 实例保存。
如果每次新建实例，多步计划会退化为逐步重算，但每个动作仍然合法。
