# Stage 6 收官后技术交接指南：APK 规则对齐、高吞吐自对弈架构与 Stage 7–8 演进规范

> **文档定位**：本文档面向后续接手项目的研发、规则修复与训练执行 Agent，汇总截至 **2026-11-07 Stage 6 收官后** 的权威基线状态、**APK 4.2.5.1 规则对齐审计结论与无损修复规范**、**搜索/自对弈吞吐瓶颈诊断与加速架构指南**，以及 **Stage 7 / Stage 8 推荐执行序列**。
>
> **协作红线**：执行任何修改前必须先检查 `git status --short`，严格遵守根目录 [`AGENTS.md`](../../AGENTS.md) 与 [`ai_training/AGENTS.md`](../AGENTS.md)；**严禁删除、覆盖或篡改 Stage 1～6 的任何历史模型权重、对局原件、收据与报告**。

---

## 一、当前项目阶段坐标与权威基线（截至 Stage 6 收官）

### 1. 历代正式基线与当前最高冠军权重
截至 `2026-11-07`，[`continuation_review_20261030`](./) 已完成 Stage 1～6 全部闭环执行，所有后台进程均已干净退出（`activeCount = 0`）：

- **当前全项目唯一正式冠军模型：Stage 5 `C1`（`Omni-Search + H1` 保序校准价值头）**
  - 锁定权重路径：`D:\AncientEmpiresData\continuation_stage5_20261104_v1\heads-v1\H1\`（`value-6000.pt` SHA256: `a0af926f76b3c0358742b3f174484c521ffb91f80d8536524e521ecfb9dff835`；`final.bin` SHA256: `3bedc848d9adccc2df67ffb22950d7a020ca4d3106c174e9974a17fc7647eccf`）
  - 开发集 `Dev-54`：`36/54` 独胜（`2P 16/20, 3P 11/18, 4P 9/16`）
  - 封存集 `Sealed-54`：**`37/54` 独胜**（`2P 14/20, 3P 14/18, 4P 9/16`，人数等权胜率 `68.01%`，等权排名 `0.7657`），历史 40 局 `31/40`（`77.5%`），封存离线 329 父局 Brier `0.2898`、槽位 ECE `0.0418`（详见 [`stage5/STAGE5_REPORT.md`](./stage5/STAGE5_REPORT.md)）。
- **Stage 6（`Omni-Distill & Search V8`）收官结论与可复用资产**（详见 [`stage6/STAGE6_REPORT.md`](./stage6/STAGE6_REPORT.md)）：
  - **搜索纯价值快路径（`valueOnly`）验证通过**：保留价值头必需的 `ReachabilityContext` 寻路与威胁张量，跳过叶节点完整根动作菜单、因子化指针、战术先验与 GPU 策略头计算，64 样本及 515 步固定轨迹 `valueLogits / valueProbs` **最大绝对差严格为 `0`**，固定轨迹编码+前向耗时缩短 `1.248x`。
  - **门禁结果**：候选 `C1` 在 `Dev-18` 取得 `13/18` 胜（`equalWin = 72.22%`），在完整 `Dev-54` 取得 `35/54` 独胜（`equalWin = 64.17%`, `equalRank = 0.7481`），距 `36/54` 硬门控差 1 胜，故严格遵守纪律保持 `sealedAccess = 0`，**正式部署冠军仍维持 Stage 5 `C1`**。
  - **暴露的核心瓶颈**：在 `1500ms` 墙钟预算、双 worker 共享 GPU 的教师采集中，`2,700` 个训练根节点仅有 `1,191` 个（`44.1%`）在时限内完成了至少 2 个未否决完整反扑动作，直接印证了微批 IPC 通信延迟与多 worker 墙钟抢占对蒸馏数据覆盖率的制约。

### 2. 后继阶段（Stage 7 & Stage 8）核心任务定义
1. **Pre-Stage-7（前置规则对齐与新引擎重锚）**：修复 [`docs/apk-analysis/parity-20261107/REPORT.md`](../../docs/apk-analysis/parity-20261107/REPORT.md) 查明的三处 APK 4.2.5.1 动作合法性偏差，并用 Stage 5 `C1` 权重在新引擎 SHA 上重锚评测基线。
2. **Stage 7（高吞吐基础设施 + 全地图混合联赛与闭环专家迭代）**：跳出“固定 20 初态槽 + 单一确定性 `OriginalApkLikeHardAI` 对手”的分布局限，解决多模型互搏时的 IPC 吞吐墙，在全量 20 张官方地图与多样化开局/中盘切入态上建立 **`OriginalApkLikeHardAI` + 历代冻结冠军模型 + 自对弈** 的混合联赛（Mixed-League），开展闭环专家迭代（Expert Iteration）。
3. **Stage 8（`5P/6P` 满槽位激活与最大 `128x128` 大地图扩展）**：突破原版 APK 最多 4 人与 `19x19` 地图限制，激活 [`PLAYER_SLOTS = 6`](../../src/ai_runtime/dual_v2/contract.ts) 中的 `slot 4 / slot 5`，并通过局部战术视窗（ROI）、稀疏寻路缓存与威胁优先反扑队列支持最大 `128x128` 尺寸与 6 人混战/结盟。

---

## 二、APK 4.2.5.1 规则偏差评估与无损迁移规范

依据 [`docs/apk-analysis/parity-20261107/REPORT.md`](../../docs/apk-analysis/parity-20261107/REPORT.md) 及 [`probe.mjs`](../../docs/apk-analysis/parity-20261107/probe.mjs) 独立探针审计：

### 1. 核心战略判断：严禁退回 Stage 1～5 重头训练！
1. **底层物理定律 100% 一致**：21/21 兵种属性与招募费、84/84 地形参数、30/30 遭遇战核心结算（建筑与领主收入公式、HP 整数乘除缩放、先附加致盲/中毒与升级经验再判定反击的时序、指挥官重招阶梯价、特殊地形回血/清状态）均与 APK 原生一致（唯一的 `crystal` 基础移动力 `APK 4 vs 项目 0` 仅限战役目标占位，遭遇战 SD/SO 不含水晶）。Stage 1～5 训练出的 **197 万参数空间-实体双流主干**与 **`H1` 多人校准价值头**表征完全有效。
2. **三处动作偏差全属于“项目多放行了非法分支（超集偏差）”**：修复全部三处偏差后，APK 的真实合法动作集在任意局面下均为原项目合法动作集的**严格子集（Strict Subset）**——没有任何新增动作语义，也没有任何特征通道变更。现有 `dual_v2 / dual_v3` 模型权重在修复后的引擎上**无需重训即可 100% 字节级兼容运行**，小于 `0.5%` 的局部边角分布微差直接在 Stage 7 专家迭代中自然吸收。

### 2. 三处必改动作边界与代码定位

| 编号 | 规则偏差项 | APK 4.2.5.1 原生权威行为 | 当前项目偏差定位与修复要求 |
| :---: | :--- | :--- | :--- |
| **1** | **指挥官占堡且新兵无合法落点时的招募检查** | `C0600q.m4344b` / `C0595l.m4445c`：扣费前按所招兵种试算可移出城堡的合法落点；若无落点则直接拒绝招募（不扣费）。 | [`src/game/rules.ts`](../../src/game/rules.ts) 中 `commanderCastleRecruitUsesPending` 分支（约 L501–L508）漏了落点非空预检。修复时必须**按候选兵种 `c` 逐个预检可走出城堡的非空落点**（注意区分陆军与 `AIR_FORCE` 飞行兵种：当正交四邻被敌军堵死但外圈射程/移动范围内有空地时，恶灵、龙等飞行单位可飞越敌兵落位，仍允许招募）。 |
| **2** | **投石机（`destroyer`）原地摧毁脚下村庄** | `C0600q.m4362a` / `C0595l.m4432i`：毁村走攻击射程判定（投石机射程 `3–5` 格）且要求目标格无人占据；脚下村庄距离为 `0` 且有自身占据，不可摧毁。 | [`src/game/rules.ts`](../../src/game/rules.ts) L410–L421 已正确实现远程空村摧毁（带 `target`），但 **L470–L473 残留了站在 `town` 上生成无 `target` 的 `{ type: 'destroy_town', unitId }` 旧逻辑**。必须移除该原地毁村动作生成及引擎/环境对应许可。 |
| **3** | **突击部队（`assault_troop`）攻击后阶段 3（Canto）未锁定** | `C0595l.m4452b` / `m4460a` / `m4441e`：攻击后仍有剩余移动力的存活突击单位强制进入**阶段 3（`f1298a == 3`）**；该阶段仅允许完成当前突击单位的二次移动（含点原格收尾触发墓碑/中毒结算），严禁切换其他单位或结束回合。 | [`src/game/engine.ts`](../../src/game/engine.ts) L753–L760 已将 `standbyUnitId` 推迟至 `post_attack_move`（L703）结算，但 [`src/game/rules.ts`](../../src/game/rules.ts) L373–L396 未在阶段 3 锁定全局菜单，导致玩家可先动他兵甚至直接 `end_turn` 逃避墓碑消耗与 10 HP 毒伤。修复时：一旦存在**存活**（`u.hp > 0`）的待二次移动突击单位，必须锁定仅生成该单位的 `post_attack_move`（含 `to = unit.pos` 原地收尾），屏蔽其他单位动作、招募、`surrender` 与 `end_turn`。 |

### 3. 执行规则修复时的 4 条硬性防踩坑铁律（必读）
1. **【权重生死线】绝对禁止从 `ACTION_HEADS` 中删除 `'destroy_town'` 字符串！**
   查看 [`src/ai_runtime/dual_v2/contract.ts`](../../src/ai_runtime/dual_v2/contract.ts) L11：
   ```ts
   export const ACTION_HEADS = ['move', 'attack', 'capture', 'repair', 'wait', 'recruit_to_castle', 'recruit_and_deploy', 'heal', 'summon', 'support', 'destroy_town', 'post_attack_move', 'surrender', 'end_turn', 'destroy_town_target'] as const;
   ```
   移除原地毁村规则时，**必须像保留 `'surrender'`（索引 `12`）那样，将 `'destroy_town'` 原位保留在索引 `10` 作为永不生成的空置保留位**！一旦从数组中删掉 `'destroy_town'`，会导致 `'post_attack_move'`（`11`）、`'end_turn'`（`13`）、`'destroy_town_target'`（`14`）下标整体左移，直接造成 Stage 3～6 所有已训练策略头权重矩阵通道错位报废！
2. **【三端与快路径完全一致】**
   修改 [`getLegalActions`](../../src/game/rules.ts) 时，必须同步核对：
   - 所有 `LegalActionQuery` 定向查询快路径（`onlyOrdinaryMoves`、`onlyAttacks`、`skipMovement`、`skipRecruitment`）与 `getActionReadyUnitCount`（阶段 3 锁定时其他单位不可行动）；
   - 突击单位主动攻击时**若被反击致死（`attacker.hp <= 0`）**，绝不能进入阶段 3 锁死全局；
   - [`GameEngine`](../../src/game/engine.ts)（含 `hasLegalAction` 与 `step` 内的缓存合法性校验分支）及 [`AncientEmpiresEnv`](../../src/game/env.ts)（`getFixedActionMask` / `encodeFixedActionIndex`）三端完全一致；
   - 将 [`docs/apk-analysis/parity-20261107/probe.mjs`](../../docs/apk-analysis/parity-20261107/probe.mjs) 中的三个反例及对照组（含飞行单位围城招募正向用例、突击反击致死不锁定正向用例）固化为 `src/game/tests/` 正式单元测试，并通过 `npm run lint`、`npm test`、`npm run build`。
3. **【新引擎同口径基线重锚（Re-baselining）】**
   规则补丁合入后、Stage 7 任何训练开始前，必须使用 **Stage 5 `C1` 冻结权重在新引擎 SHA 上重跑一次 `Dev-54`（及对应基准面板）**，生成新引擎下的权威基准收据；后续 Stage 7 门控一律与该**新引擎同口径基线**做配对比较，严禁跨引擎 SHA 直接混比胜率。
4. **【历史回放校验口径隔离】**
   - 真实 APK 抓包回放本身遵循原生规则，收紧后兼容性更高（仍须遵守 [`APK_RULE_ALIGNMENT_HANDOFF.md`](../../docs/apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md) 中 `forced` 与 `strict` 不互换原则）；
   - Stage 1～6 由旧项目引擎自生成的历史轨迹中，若极少数步包含“突击未收尾先动他兵”等旧超集动作，在新引擎 `strict` 校验下报错属于正常的**跨引擎版本演进差异**——原样保留历史归档及其对应旧引擎 SHA 记录即可，**严禁删除历史数据，也严禁为迁就旧项目自生成轨迹而放宽 APK 原生规则**。

---

## 三、搜索与自对弈吞吐瓶颈拆解及 Stage 7–8 高吞吐架构指南

### 1. 外部“轻量 AlphaZero（`0.40 局/s`）”方案拆解与参照结论
针对外部某轻量级自对弈实现（编译态 `aer.jar` JVM 引擎、`threads=8`、`sims=24`、`dim=128, h=32` 约 4K 参数动作价值网络 `av.bin`、仅限 8 张 2P 地图、每局约 200 步宏动作、总吞吐 `0.40~0.45 局/s`）的技术拆解结论如下：
- **速度真实来源**：8 线程总计 `0.40~0.45 局/s` 折合单线程约 **`3.2~3.6 秒/局`**、每步宏决策 **`~16~36ms`**、每次 MCTS 模拟 **`~0.7~1.5ms`**。其速度并非来自更优的深度学习架构，而是来自 **① 同一 JVM 进程内纯 CPU L1 Cache 标量乘加（零跨进程 IPC / 序列化开销）** 与 **② 极浅的 `sims=24` 搜索及极小的手工特征网络**。
- **能力天花板缺陷**：`dim=128 -> h=32` 手工聚合特征彻底丢失了棋盘精细二维几何（咽喉卡位、凹凸阵型、射程死角、多路包夹），且 `sims=24` 在多兵回合制中连“双方各动 2～3 个兵”的完整战术交换都无法闭合，更无法扩展至 3P～6P 混战与大尺寸地图。

### 2. 对照诊断当前项目 `dual_v3` 在 Stage 7 面临的头号瓶颈
结合 Stage 5/6 实战与采集遥测（[`FINAL_TELEMETRY_AUDIT.json`](./stage5/FINAL_TELEMETRY_AUDIT.json)、[`DEV18_SUMMARY.json`](./stage6/DEV18_SUMMARY.json)、[`STAGE6_REPORT.md`](./stage6/STAGE6_REPORT.md)）：
1. **微批跨进程通信（Micro-Batch IPC）主导了整局耗时**：
   单局 `dual_v3` 对阵 `6ms/步` 的 `HardAI` 时，平均每局触发 **`16,500～19,100` 次** Node↔Python 推理往返，但平均物理批大小 `meanBatchSize` 仅为 **`3.19～3.97`**（峰值 16），单局光跨进程等待（`decisionWireMs`）就消耗 **`260～270 秒`**，GPU 算力绝大部分时间处于饥饿等待状态。
2. **`96%` 的节点与通信消耗集中在 Wave C（对手反扑推演）**：
   根节点与己方回合链（Wave A）仅占总评估节点的 `~3.86%`，而 **`96.14%` 的节点与 `95.5%` 的 IPC 请求均发生在 Wave C 对手反扑推演中**。
3. **Stage 7 模型互搏耗时倍增预警**：
   此前每局只有 **1 个座位**运行神经搜索；进入 Stage 7 混合联赛与自对弈后，场上 **2～4 个（乃至 Stage 8 的 6 个）座位全部运行神经模型**。若不改造推理与搜索调度，单局耗时将飙升至 **15～30 分钟/局**，直接卡死自对弈样本生产；同时纯墙钟预算（`budgetMs`）在多 worker 并发下会像 Stage 6 教师采集那样因抢占导致有效覆盖率大幅缩水（`1191/2700 = 44.1%`）。

### 3. Stage 7 / Stage 8 必须落地的四项高吞吐架构准则（取其精华）
1. **离线教师采集与自对弈一律改用“确定性节点/模拟预算（Deterministic Node Budget）”**
   - 在离线生成 `SearchTeacher` 标签与自对弈轨迹时，**禁止依赖易受 CPU/GPU 并发负载波动污染的纯墙钟 `budgetMs` 截断**，应配置充裕的墙钟安全上限，以**固定节点数 / 固定候选展开配额**作为终止条件。
   - 这既能消除 Stage 6 中“双 worker 抢占导致超过半数 3P/4P 根节点未闭合”的覆盖率损失，也能保证离线数据生成跨机器负载严格可复现；固定墙钟限时（如 `3000ms`）仅保留在最终在线评测面板验收时使用。
2. **跨对局高并发异步合批（Cross-Game Async Batch Multiplexing）**
   - 在自对弈与离线教师采集中，开启 **`32～64` 个异步对局协程/Worker 共享同一个常驻 GPU 推理批处理服务**（设置合理的微秒/毫秒级动态攒批窗口），将每次 GPU 物理前向的 `batch_size` 从 `~3.8` 拉满至 **`64～256`**。
   - 这样单次 Node↔Python IPC 往返延迟被数十局同时分摊，在丝毫不损 `dual_v3` 200 万参数精度的前提下即可获得 **10～20 倍以上** 的样本生成吞吐提升（长期亦可进一步评估 ONNX Runtime / LibTorch Node-API 进程内推理）。
3. **双层异构搜索（Two-Tier Search：重型双流主干管 Root/Wave A + 轻量快路径管 Wave C）**
   - **Root 与己方行动链（Wave A）**：始终使用完整的 `dual_v3` 双流网络（空间 ResUNet + 实体关系 Transformer + 因子化指针策略头）保证复杂几何与集火精度；
   - **对手反扑推演（Wave C，占 96% 节点）**：全面启用 Stage 6 已验证零误差的 `valueOnly` 叶节点快路径；并可在 Stage 7/8 进一步探索**使用蒸馏策略先验或驻留 TypeScript/原生进程内存的超轻量蒸馏草稿打分头（NNUE / `av.bin` 式本地微网）**承担反扑中间层动作排序与预剪枝，仅将最终闭合叶节点集中合批送入 GPU 价值头——从而砍掉绝大部分串行微批往返。
4. **关键决策根采样与“仅限训练采样的残局提前裁定（Training-Only Value Adjudication）”**
   - 自对弈训练缓冲池应聚焦多合法分支的实质决策根（跳过唯一合法动作步），避免低信息量步稀释样本池；
   - 针对自对弈后期胜负早已锁定却仍需数十回合清场的垃圾时间，允许**仅在离线自对弈采样器中**引入高置信度提前裁定（例如校准价值连续 N 回合 `> 0.98` 且经济/兵力绝对碾压时记录裁定标签收束采集），但**必须严格遵守 [`docs/environment/interface.md`](../../docs/environment/interface.md)：所有开发集（`Dev`）与封存集（`Sealed / Historical`）实战评测严禁启用提前裁定，必须 100% 跑至引擎权威自然胜负！**

### 4. 严禁触碰的架构倒退红线（去其糟粕）
- **严禁降级主干表征**：绝不允许为了追求单局速度而抛弃 34 通道空间流与实体关系流、退回全局手工特征 MLP；
- **严禁退回单原子步盲搜**：绝不允许用 `sims=24` 级别的单原子动作浅层 MCTS 替代现有的“己方整回合行动链（Wave A）+ 对手反扑闭合（Wave C）”搜索结构与多人 `maxn_ffa` 估值体系。

---

## 四、后继阶段（Stage 7 & Stage 8）推荐推进路线图

供后续主控与执行 Agent 按序衔接：

1. **阶段七前置步（Pre-Stage-7：APK 规则对齐与同口径重锚）**
   - 按本文第二章修复 [`rules.ts`](../../src/game/rules.ts) / [`engine.ts`](../../src/game/engine.ts) / [`env.ts`](../../src/game/env.ts) 三处动作偏差（**死守 `ACTION_HEADS[10]` 不删铁律**）；
   - 将 [`probe.mjs`](../../docs/apk-analysis/parity-20261107/probe.mjs) 转化为正式回归测试，确保 `npm run lint`、`npm test`、`npm run build` 全部零错误通过；
   - 使用冻结的 **Stage 5 `C1`** 冠军模型在新引擎 SHA 下重跑开发基准面板，锁定新引擎同口径基线。
2. **阶段七（Stage 7：高吞吐自对弈基建 + 全地图混合联赛与闭环专家迭代）**
   - 搭建跨对局高并发 GPU 异步合批采集器，并将离线教师/自对弈搜索切换为**确定性节点预算**；
   - 将训练与开发覆盖面从“固定 20 初态槽 + 纯 `HardAI`”扩展至**全量 20 张官方地图 + 多样化初态/中盘残局切入态**，组建混合对手池（`1/3 OriginalApkLikeHardAI` + `1/3 历代冻结冠军模型` + `1/3 镜像自对弈/多模型混战`）；
   - 执行闭环专家迭代（同步吸收搜索后策略分布与真实联赛终局结果），突破单一规则 AI 对手天花板。
3. **阶段八（Stage 8：`5P/6P` 满槽位激活与最大 `128x128` 地图泛化扩展）**
   - 改造实体相对坐标特征、局部战术视窗（如 `24x24` 动态 ROI）与按需稀疏 `ReachabilityContext`，解除大尺寸地图下的 $O(W \times H)$ 内存与算力膨胀；
   - 将 Wave C 对手反扑队列从“按回合顺位取下 3 家”升级为**“按空间交火紧迫度取威胁最大的 Top-3 对手”**；
   - 构建 `5P/6P` 多人混战与结盟场景开展轻量激活微调，正式点亮 `slot 4` 与 `slot 5` 的价值校准与实体关系推理能力。
