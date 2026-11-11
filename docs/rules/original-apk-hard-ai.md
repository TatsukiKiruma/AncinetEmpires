# Original-APKlikeAI-Hard：困难补丁 APK 移植

本次分析于 2026-10-21 开始，2026-10-22 完成验证。对象是用户提供的
`aer-4.2.5.1-patch.apk.1`，SHA-256：
`a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48`。

## 已确认的 APK 调用路径

补丁保留普通 AI `c.a.b.c.j.a` 的原有方法指令，新增困难类 `c.a.b.c.j.b`。
`AiSelection` 将玩家类型 3 标记为困难；`AiStrategyFactory.create` 据此选择普通类或困难类。
困难类 `call()` 先运行 `ResourcePackHardAi.choose`，后者把棋盘转换成 JSON，交给 WebView 中的
`assets/hard-ai/runtime.html` / `hardAiDecide` 决策。脚本异常、桥接失败或水晶等不支持的单位
才触发 Java 困难 AI 回退。困难版不能仅通过调整普通 AI 的几个常数来完整实现。

比较基准是仓库本地 `APK/aer-release-4.2.5.1.apk`，SHA-256：
`51b00185f300dd8899284aa91986aee9a1cc73fa012262a0d9eebc97fad1aa7b`。
静态 DEX 比较发现新增 140 个方法、修改 22 个原有方法、未删除方法；修改涉及 AI 工厂、
选择界面、资源包及悔棋等接入代码。普通 AI 类与原有核心规则方法的指令未改动。

证据来自本地 Androguard 的 DEX 指令和 DAD 反编译，以及 APK 内直接提取的 HTML。
REA Android 接口缺少 `REA_JADX_MCP_JAR`，诊断已保存；这些文件不是 REA Evidence，
也不是 Android 运行轨迹。DAD 对类型和双精度常量存在展示缺陷，Java 新评分的系数以 DEX 指令核对。

## JS 主路径的关键规则

以下行号指本次保存的
`deliverables/original_apk_hard_20261021/static/hard-ai-runtime.html`。
脚本的页面分是原始整数分除以 5，比较普通版时需先统一尺度。

| 规则 | 困难版实现与差异 | 源码函数 / HTML 行号 |
| --- | --- | --- |
| 战力态势 | 我方战力为联盟单位实际价值加金币，敌方另加下回合收入的一半；单位价值含等级、指挥官加值，不按剩余 HP 折损。战力比低于 1.3 时仅经营敌城距离不小于友城距离的区域；达到 1.3 扩一格，以后每增加 0.2 再扩一格 | `calculateHardAiBattlePower` 3381、`calculateHardAiBuildingTargetSet` 3450 |
| 建筑分配 | 原始安全区域优先于扩张区，无主城堡→村庄→破房→敌城；指挥官先选，再给其他占领/修复单位分配未占用目标。推进潜力奖励要求占领单位 HP 严格大于 80 | `calculateHardAiPriorityBuildingPlan` 18360、`getHardAiAssignedBuildingMovementGoal` 21004 |
| 单位顺序 | 少于 15 个待行动单位时，先考虑可攻击/占领目标少者，再比可用落点数和最佳完整行动分；零目标按无穷处理。达到 15 个时改用城堡单位、夺城指挥官、占敌村单位等优先级 | `calculateHardAiTeamActionOrder` 18627、`getHardAiActionPriority` 17855 |
| 双单位组合 | 唯一最高攻击/占领专项分落点被友军占用时，试算 A→B 和 B→A；仅严格优于正常顺序才采用。仅用于小部队且无夺城等更高优先事项，是有限让位试算 | `findHardAiPairPlan` 18197、`evaluateHardAiPairOrder` 18144 |
| 即时夺城与封锁 | 能进空敌城的指挥官提前，有守军时排后等待清除；敌盟只剩一城、至多一单位且暂不能夺城时，优先派受敌方最大攻击后仍有超过 50 HP 的非指挥官封城 | `getHardAiCastleSeizureState` 18457、`getHardAiCastleBlockadeState` 18537 附近 |
| 集火评分 | 基础伤害价值乘距离、目标攻击前残血、防御三个系数；女巫未击杀改为保留主体分后减原始 200，普通移植此前将主体分覆盖为 -1000 | `calculateAttackScores` 21877，公式 22458–22469，女巫 22565 附近 |
| 落点评分 | 用友敌距离差、地形防御、射程、战力比的分段函数评估站位；困难模式跳过普通版统一的过线处罚，真实动作另加单位价值与落点防御修正 | `calculateHardAiLandingPositionScore` 3645、`hardAiCandidateCorrection` 3673 |
| 村庄守卫 | 逐敌人试算最大合法伤害，一人可击杀不给守卫分，两人合击可击杀给半分，两人仍杀不死给全分；非占领单位挡住本回合可占村庄时罚页面 100 分 | `getHardAiHouseGuardMultiplier` 20947、候选处罚 22876 |
| 支援 | 临时恢复受援单位行动、标记已被支援，重算完整移动与行动候选的最高分，再恢复局面；普通移植使用战斗/位置价值粗估 | `calculateHardAiSupportScores` 23004 |
| 招募与经济动作 | 先决定兵种，再遍历可招募城堡，模拟扣金和新兵完整行动后选最好落点；占敌城/无主城为原始 25000/10000，占敌村/无主村为 1500/1000，修复 500 | `chooseRecruitActionPlan` 7751、`chooseDemoRecruitPlan` 7942、`getOccupyScoreForCell` 22784、`getRepairScoreForCell` 22799 |

攻击的新增伤害项为：

```text
基础 = trunc(预计完整伤害 × 目标价值 / 20)
距离系数 = 1 + clamp(敌均距 − 友均距, −2, 2) / 10
生命系数 = 1 + max(100 − 目标攻击前 HP, −50) / 100
防御系数 = 1 + (真实防御 + 地形防御) / 100
新增伤害分 = trunc(基础 × 距离系数 × 生命系数 × 防御系数)
```

此后仍有击杀、状态和反击等评分；上式不是整个攻击总分。

落点新增项以 `g=友均距−敌均距`、`t=地形防御−10`、`U=单位价值`、`s=战力比`
表示：`g>0` 为 `−(g−s+1)U/10+2t`；`−1≤g≤0` 为 `10g+2t`；
`−2≤g<−1` 为 `10(g+最大射程−1)+t`；更靠后的区域此新增项为 0。
非有限战力比在该公式取 1。

## 项目实现

| 文件 | 职责 |
| --- | --- |
| `src/game/ai/original_apk_like_hard_ai.ts` | 主入口、桥接回退、复合动作计划与完整合法性预校验 |
| `src/game/ai/original_apk_like_hard_snapshot.ts` | 地形、队伍、经验、状态、指挥官和坐标协议映射 |
| `src/game/ai/runtime/apk_hard_runtime.ts` | 私有无界面运行环境和随机流 |
| `src/game/ai/runtime/apk_hard_policy.generated.js` | APK 原始决策脚本的静态生成资产，禁止手工修改 |
| `src/game/ai/original_apk_like_hard_native_ai.ts`、`original_apk_like_hard_native_scoring.ts` | Java 困难回退规则，独立文件避免改变普通 AI |
| `tools/inspect_apk_hard_patch.py` | DEX 与 APK 资源差异证据提取 |
| `tools/extract_apk_hard_runtime.mjs` | 从保存的 HTML 重建和核对生成模块 |
| `tools/arena_original_apk_hard_20261021.ts` | 5 图换边的顺序对局、源码冻结和严格动作检查 |
| `tools/verify_apk_hard_arena_20261021.ts` | 不调用 AI 的独立逐步严格重放 |

脚本 HTML SHA-256：`6076f354362f89c0a0abbcb10ef4de04d321f96aa7de90e61f0fb33a2ea883eb`。
生成器保留全部上游算法和初始化顺序，剥除注释后放入独立静态函数作用域，未使用 eval。
每个实例有独立随机流、棋盘和回合计划，不操作真实页面；网络、定时器、弹窗和文件操作不可用。

APK 脚本中的内部估值和局部模拟予以保留，避免另写困难算法；真实状态、合法动作、伤害、回合、
收益和胜负只由项目 `GameEngine` 结算。每个复合动作在引擎克隆上完整预校验，跨原子动作带完整状态签名。
不兼容计划和脚本错误会计数、记录原因，并使用独立 Java 困难回退，来源不会伪装成 JS 主路径。

应用策略为 `original_apk_like_hard`，双方策略下拉框均显示 `Original-APKlikeAI-Hard（APK 困难版）`。
普通 `APKlikeAI`、`OriginalApkLikeAI`、HeuristicAI、BattleSearchV2AI、引擎及训练代码未修改。

```ts
const ai = new OriginalApkLikeHardAI({ rng });
const action = ai.getAction(engine, playerId);
// 新对局或外部接管时清除脚本的回合记忆。
ai.reset();
```

## 对局与验证

Duel、Crossed swords、Mourningstar、Liberty Port、The Crossing 五图，每个对手正反手各一局：
困难版对 HeuristicAI **10 胜 0 负**，对 BattleSearchV2AI **10 胜 0 负**。
20 局全部自然结束，无平局、截断或运行错误；严格校验 **7852** 个动作，非法动作 **0**。
JS 主路径 **3325** 次，Java 回退、拒绝计划、脚本错误均为 **0**。
独立严格重放再次核对全部动作和 **15704** 个前后状态 SHA-256，胜负一致。

对局使用 SD 模式、默认地图开局、4000 原子步/120 完整回合上限；单进程依次执行。
BattleSearchV2AI 保持默认 180ms 预算。依赖的 40 个本地源码文件在对局前后 SHA-256 相同，
并保存开局副本。固定随机种子不能消除 V2 墙钟截止对机器负载的敏感性。
这次 20 局是小规模固定地图评测，不能代表所有地图或一般胜率。

公共验证：`npm run lint` 通过；`npm test -- --maxWorkers=1` 共 55 个文件、481 项通过、20 项跳过
（已有的显式扩展竞技场实验未启用）；`npm run build -- --outDir deliverables/original_apk_hard_20261021/build`
通过，构建输出独立保存，保留现有 dist。构建仍提示较大的应用包。

详细逐局结果、轨迹和证据位于
[本次交付报告](../../deliverables/original_apk_hard_20261021/REPORT.md)。

## 边界

已移植 APK 正常困难决策主路径及 Java 困难回退的新增评分；没有采集 Android 实机逐动作差分，
因此不声称原生运行时等价。Java 回退继承普通 Original 移植已有的招募控制流、迭代顺序、
目标分配和规则模拟近似，详见 [普通版说明](original-apk-ai.md)。
主路径保留 APK 自带兵种定义和估值模拟；自定义兵种、规则、静态单位或非标准局面可能与项目引擎不兼容。
快照将项目静态单位标为待机；水晶按 APK 桥接限制触发 Java 回退。本批标准地图未发生回退。

所有新增算法、工具与证据均使用独立文件；现有共享文件只新增策略类型、适配分支、双方下拉选项和文档索引。
没有进入训练工作区编辑文件，也没有停止已有训练进程。
