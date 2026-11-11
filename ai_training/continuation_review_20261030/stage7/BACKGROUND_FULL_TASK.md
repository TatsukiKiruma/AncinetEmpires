> 最新决胜授权：Gen1 K1按4P≥11审定晋级，跳过Gen2，执行唯一一次Phase E。先读 FINAL_ADVANCE.md；不得恢复Gen2或重启已打开的封存会话。

> 最新紧急纠偏：先读 FALLBACK_FIX.md。Gen1 K1/K2复用训练资产恢复评测；C/D/E回退只记诊断，Dev18门槛13；Dev54至少39胜且3P≥11或总胜≥40，保留2P/4P及健康门。

> 最新推进授权：P1继承倍率门槛2.4；B-G4/P2明确豁免、不得启动；Phase C并发wire上限35ms。立即接C→D→条件式E。详见PHASE_C_ADVANCE.md。

> 最新用户在线纠偏已生效：先读 ONLINE_CORRECTION.md。禁止恢复额外P1扫描或legacyV6重跑；P2仅6局，并发wire上限35ms。

你是后台执行代理。用户明确授权下发完整任务并后台执行，当前聊天每小时检查。请完整接续Pre-Stage-7到Stage7，不要只给计划，不要重复启动当前在途P1。先读BACKGROUND_HANDOFF.md。后续任务书修改了参数时以后续为准；用户最后明确继续最初整个任务，B-G2按最初明文99%/1e-4门槛已重跑通过，不再位级相等。你负责stage7目录代码、报告和指定D盘任务目录；不是独自工作，不回滚他人编辑。公共目录冻结。实际后续C/D/E尚需实现，不得声称已经全部自动化。保持长任务执行至门禁结论，短暂控制故障按原授权修复恢复，真实门禁失败保留现场。任何退出前清理所属子进程、防休眠锁并记录状态。

# 任务指令：Pre-Stage-7（APK 规则对齐 + 无损高吞吐基建 + 新引擎重锚）→ Stage 7（混合联赛专家迭代）

    ## 〇、必读背景与已确认事实
    1. 先读
    AGENTS.md、ai_training/AGENTS.md、ai_training/continuation_review_20261030/POST_STAGE6_HANDOFF_20261107.md、docs/apk-an
    alysis/parity-20261107/REPORT.md、speed_bench_20261107/SPEED_BENCH_REPORT.md 与 PROTOCOL.md。
    2. 正式冠军：Stage 5 C1（H1）。权重：D:\AncientEmpiresData\continuation_stage5_20261104_v1\heads-v1\H1\final(.bin
    SHA256 3bedc848d9adccc2df67ffb22950d7a020ca4d3106c174e9974a17fc7647eccf；value-6000.pt SHA256
    a0af926f76b3c0358742b3f174484c521ffb91f80d8536524e521ecfb9dff835）。
    3. speed_bench 已确认的事实（本阶段直接继承，不得重新解释）：
       - G1（accurate_reductions(False)，原生 FP32）与 G0 数值等价：价值最大差 1.9e-6，top1 一致 100%；S1 对 S0 选招一致
       100%。G2（BF16）价值差 0.010，禁止用于教师、评测和训练标签。
       - 串行搜索时，单次请求固定开销约 10 ms，主导了耗时；FP32 新形状会出现 76～129 ms/次的冷启动尖峰（疑为 MIOpen
       Find）。
       - 4 局并发共用一个 GPU 服务时，每根耗时与串行几乎相同，说明跨局合批可行。
       - S2/S3/S4 等有损搜索在四人局的选招一致率只有 42%～67%。本阶段的教师搜索禁止使用任何有损裁剪档。
    4. 本阶段的提速原则：只用“无损基建”和“部分根完整搜索（Playout Cap
    Randomization）”两类手段；凡是被选中做完整搜索的根，一律搜满。

    ## 一、铁律
    1. 开工前执行 `git status --short` 并存档；保留他人改动。严禁删除或覆盖 Stage 1～6 及 speed_bench
    的任何模型、数据、收据和报告。
    2. 封存集零触碰：Phase E 之前，sealedAccess 必须恒为 0。训练起点的封存排除，只能沿用 Stage 5/6 已有的隔离机制（例如
    stage5/isolation.py、sealed_guard.py）完成；如果该机制要求打开封存内容，立即停止并汇报。
    3. 公共代码（src/、tools/、docs/）只在 Phase A 修改规则时允许改动，并按 AGENTS.md 同步核对
    getLegalActions、GameEngine、AncientEmpiresEnv 三端，以及编码、mask、初始收益和克隆的一致性。runtime 不得依赖
    ai_training/ 或 node:*。
    4. 环境截断、代理奖励与自然胜负必须分开（docs/environment/interface.md）。所有 Dev、Sealed、Historical
    评测禁止提前裁定，必须 100% 自然完赛。
    5. 输出目录：代码与报告放 ai_training/continuation_review_20261030/stage7/；大文件放
    D:\AncientEmpiresData\continuation_stage7_20261108_v1\。全程使用防休眠锁；任何退出路径都必须释放所有子进程和防休眠锁。
    所有长任务必须支持断点续跑，进度写入采用 O(1) 方式（不得回到 rglob 扫描）。
    6. 任一门禁失败：立即停止、保留现场、写失败报告，不得放宽门禁后继续。

    ## Phase A：APK 4.2.5.1 三处超集偏差修复（公共代码）
    按交接文档第二章修复以下三处：
    - A1
    指挥官占堡招募：扣费前，按所招兵种逐个预检是否存在可移出城堡的非空落点（区分陆军与飞行兵种，飞行单位可越过敌兵落位）。
    - A2 删除 rules.ts 中“站在村庄上、不带 target 的原地
    destroy_town”的生成逻辑，并同步删除引擎与环境中的对应许可。【权重生死线】ACTION_HEADS[10]='destroy_town'
    必须原位保留为永不生成的保留位，所有下标不变。
    - A3 突击部队阶段 3 锁定：只要存在 hp>0、且攻击后仍有剩余移动力的突击单位，就只生成该单位的
    post_attack_move（包括原地收尾），屏蔽其他单位、招募、投降和
    end_turn。若攻击时被反击致死，则不锁定。所有定向查询快路径和 getActionReadyUnitCount 同步修改。
    验收：
    - 把 probe.mjs 的三个反例与两个正向对照（飞行单位围城仍可招募；突击被反击致死不锁定）固化为 src/game/tests/
    下的单元测试。
    - 子集校验：从 Stage 6 Dev 轨迹中抽取 ≥2000 个状态，验证新合法动作集严格包含于旧合法动作集，ACTION_HEADS
    逐字节不变，env mask 与 encode 一致。
    - 跑通 npm run lint、npm test、npm run build。
    - 记录新引擎的源码 SHA。旧轨迹在 strict 校验下的报错只做登记，不得为此放宽规则（forced 回放校验与 strict
    诊断的结论不互换）。

    ## Phase B：无损高吞吐基建（训练工作区内实现，时间上限 1.5 天）
    - B1 推理服务 v2：
      - 用 G1 FP32；改用向量化整理批次；整批只做一次有限性检查和一次回传 CPU；使用 pinned memory；按需提高线程数。
      - 批大小按 {1,2,4,8,16,32,64,128,256} 分桶（不足的用空行填充，空行结果丢弃）。
      - 建立独立的 FP32 MIOpen 缓存目录，用 Dev 面板里出现过的全部地图尺寸 × 所有批大小桶 × valueOnly
      两种模式做离线预热；对比 MIOPEN_FIND_MODE 的默认值与 FAST。
      - 允许并对比“1 个服务”与“2 个服务做流水线”两种方案。
    - B2 跨局异步合批器：采用 Node worker_threads × 每个 worker 多局异步的结构，按请求 ID 分发结果，攒批窗口 ∈ {0.5,1,2}
    ms。
    - 门禁：
      - B-G1 时延：预热后，批大小 ≤4 时端到端每次请求的中位数 ≤ 9 ms，p99 ≤ 30 ms（不得再出现冷启动尖峰）。
      - B-G2 负载下的确定性：取 72 个 Dev 根（speed_bench 的 36 个，再加 36
      个新的三人、四人局根），在确定性节点预算下分别“单独搜索”和“8 局负载下搜索”。选招一致率须 ≥
      99%，任何不一致都必须证明是近似平局（分差 < 1e-4）；教师概率最大差的中位数 ≤ 1e-4。
      - B-G3 吞吐 P1：完整教师配置（见 Phase D 的 T 配置），全座位神经自对弈 12 局（二、三、四人局各 4 局），扫描 workers ∈
      {4,6,8} × 每个 worker 的局数 ∈ {1,2,3}。聚合实质根吞吐须 ≥ 7200 根/小时（串行 S0 约 1200 根/小时，即 ≥ 6
      倍）。记录平均与 p95 物理批大小、排队时间和 GPU 占比。
      - B-G4 吞吐 P2：25% 完整搜索 + 75% 快走，18 局（各人数 6 局）。聚合须 ≥ 10 步/秒（P0 为 0.95
      步/秒）。按人数分别报告“自然局/小时”和“有效教师样本/小时”。
      - B-G5：在 G1 下补跑纯价值路径一致性（valueLogits 最大差 = 0），且进程退出码为 0。
    - B-G1～B-G5 任一不达标：停止并汇报实测值，不进入 Phase C。

    ## Phase C：新引擎 + G1 同口径重锚
    1. 并发竞争审计：用 36 个根、正式 3000 ms 预算，对比 W 个评测 worker 并发与单 worker。取满足“节点数中位数比 ≥
    0.90、超时为 0”的最大 W 作为评测并发数。
    2. 用 Stage 5 C1 正式配置（3000 ms、G1、新引擎 SHA）重跑 Dev-54，得到基线 B（包括 Dev-18 子集 B18）。健康门：54/54
    自然完赛，0 时间判负，0 传输故障。
    3. 写出 PRE_STAGE7_REPORT.md，内容包括 Phase A～C 的门禁结果、吞吐实测，以及 B 与 Stage 5 旧引擎 36/54
    的差异说明（只做描述，不跨引擎下结论）。全部通过后自动进入 Phase D。

    ## Phase D：Stage 7 混合联赛专家迭代（最多 3 代，或 4 天墙钟，先到者为准）
    - D1 对局与对手分布：
      - 每局至少 1 个座位由当前候选使用教师搜索；其余座位按 1/3 OriginalApkLikeHardAI、1/3 冻结冠军池（Stage 5 C1、Stage 4
      V7 C2、Stage 3 Omni-Base，SHA 需从各阶段报告核对；之后每代加入上一代）、1/3 候选自身镜像来分配。
      - 起点：全部官方地图的初始槽位，座位随机轮换；另有 30% 从上一代自对弈轨迹中切入中盘（不使用 Dev 对局轨迹）。
      - 二、三、四人局各占 1/3。
      - 训练对局的轮数上限为相对第 80 轮；截断局的价值标签全部屏蔽，单独计数。
    - D2 教师配置 T（确定性预算）：
      - 采用 Stage 5 C1 正式搜索配置；priorAnchor 取 Stage 5 正式值，不沿用 Stage 6 的 0.07；开启
      castleProductionPenalties。
      - budgetMs 设为 60000 作为安全上限，maxNodes 2500，finalists 8，其余与 speed_bench 的 S1 相同。
      - 禁止 S2、S3、S4 及任何有损裁剪。
    - D3 部分根完整搜索：
      - 对每个实质决策步（非投降合法动作 ≥2），以 25% 概率运行 T，产出策略教师样本；
      - 以 75% 概率走 1-ply 快走：G1 策略 logits + 战术先验，过滤 forbidden 动作，前 3 轮温度 1.0，之后 0.5。
      - 只有当前候选座位上的 T 搜索结果可以作为策略标签；所有自然终局局面都提供 6 槽价值标签。
    - D4 训练（初始化自 Stage 5 C1，G1 FP32）：
      - K1：冻结主干，只训练策略头与价值头。
      - K2：全网训练，主干学习率为头部的 0.1 倍；混入 30% 的 Stage 5/6 回放数据；在回放数据上加入对 C1 策略的 KL
      锚定（λ=0.1）。
      - 所有样本按人数 1:1:1 加权。
      - 导出后，TypeScript runtime 与 Python 的对拍必须达到既有阈值，模型合同不变。
    - D5 每代门禁（K1、K2 分别评估，择优）：
      - 离线：在 Dev（非封存）上，Brier 与槽位 ECE 不得劣于 C1 超过 0.003；策略对教师的子集 KL 下降。
      - Dev-18：须 ≥ B18 + 1，才能进入 Dev-54。
      - Dev-54：总胜场 ≥ B + 2，三人局胜场 ≥ B 的三人局胜场，任一人数组不低于 B 对应组 − 1，健康门 100%。
      - 通过者成为下一代的“当前候选”；连续 2 代无改进则提前结束。
    - D6 每代记录：吞吐（实测局/小时、教师样本/小时）、截断率、联赛内部对冻结池的胜率矩阵（不作门禁，用于监测是否只会打
    HardAI）。

    ## Phase E：最终一次性封存验收（只对 Dev-54 通过的最优候选执行）
    - 在同一次会话、同一引擎 SHA 和同一推理档下，依次运行：Stage 5 C1 重锚的 Sealed-54，候选的 Sealed-54，以及候选的
    Historical-40 和 Sealed-Offline-329。
    - 晋级条件：候选的 Sealed-54 ≥ C1 新引擎 Sealed-54 + 2，人数等权胜率提升，且任一人数组不低于 C1 对应组 − 1。否则保持
    Stage 5 C1 为冠军。

    ## 交付
    stage7/ 下需要有：PRE_STAGE7_REPORT.md、STAGE7_REPORT.md、各门禁 JSON、证据清单（附 SHA256）、sealedAccess 记录、git
    status 前后对比、activeCount=0 的进程核验，以及 lint、test、build 结果。
    汇报时给出：每个 Phase 的门禁结果、实测吞吐倍率、各代 Dev 成绩与人数拆分、失败或停止原因。

 # 任务指令：修复 Phase A 剩余 8 项测试回归并继续执行 Phase B～E（Pre-Stage-7 → Stage 7）

    主控架构师已完成对 `stage7/PRE_STAGE7_REPORT.md` 与 `test.log` 的逐行审计。你在 Phase A
    保留现场停机的操作完全符合规范，2,160 个状态的子集验证已确认核心规则逻辑正确。

    现在请基于当前工作区现场，**精准修复以下 1 处 `env.ts` 空指针边界与 4 处旧测试/报告夹具**，跑通 Phase A
    全部门禁后，无缝继续执行 **Phase B → Phase C → Phase D → Phase E**。

    ---

    ## 一、Phase A 精准修复清单（仅限以下 5 处，严禁放宽已实现的 APK 规则）

    1. **修复 `src/game/env.ts` 无 `target` 的 `destroy_town` 编码空指针（解决 `apk_stage7_alignment.test.ts` 失败）**：
       - 在 [`src/game/env.ts`](C:/code/AncinetEmpires/src/game/env.ts) 的 `getTileIndex`（约 L472）入口增加空值守卫：`if
       (!pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return null;`
       - 在 `encodeFixedActionIndex` 的 `case 'destroy_town':`（约 L603–L609）中，将 `const targetIndex =
       tileIndex(action.target);` 改为 `const targetIndex = action.target ? tileIndex(action.target) : null;`。
    2. **更新 `src/game/tests/engine.test.ts` 突击攻击后收尾夹具（解决 `engine.test.ts` 1 项失败）**：
       - 在 [`src/game/tests/engine.test.ts`](C:/code/AncinetEmpires/src/game/tests/engine.test.ts) 约 L4831（`'APK
       skirmish 默认：指挥官死亡后下一己方回合不自动复活，只能城堡重招募且继承等级经验'`）中，`attacker`
       被改为了带突击能力的 `'dragon'`；在 `engine.step({ type: 'attack', attackerId: attacker.id, targetId: commander.id
       });` 之后、`engine.step({ type: 'end_turn' });`（约 L4837）之前，补充阶段 3 原地收尾：`engine.step({ type:
       'post_attack_move', unitId: attacker.id, to: { ...attacker.pos } });`。
    3. **更新 `src/game/tests/grave_refresh.test.ts` 突击攻击后收尾夹具（解决 `grave_refresh.test.ts` 3 项失败）**：
       - 在 [`src/game/tests/grave_refresh.test.ts`](C:/code/AncinetEmpires/src/game/tests/grave_refresh.test.ts) 约
       L24（`'旧计时玩家 %i、剩余 %i 的墓碑被重新计时'`）中，`attacker` 为 `'dragon'`；在 `engine.step(attack);`
       之后、第一次 `engine.step({ type: 'end_turn' });`（约 L28）之前，补充阶段 3 原地收尾：`engine.step({ type:
       'post_attack_move', unitId: 'attacker', to: { x: 2, y: 2 } });`。
    4. **更新 `tools/apk_language_rule_report.ts` 远程毁村夹具（解决 `apk_language_rule_report.test.ts` 1 项失败）**：
       - 在 [`tools/apk_language_rule_report.ts`](C:/code/AncinetEmpires/tools/apk_language_rule_report.ts) 的
       `buildTileRuleActual`（约 L915–L935）中，原夹具将村庄放在投石车脚下 `tiles[0][0]`
       测试原地毁村。请将该村庄改为投石车射程内的无人格 `villageState.map.tiles[0][3] = { terrainId: 9, ownerId: 1
       };`，并将返回对象中的 `destroyedVillageTerrainId` 与 `destroyedVillageOwnerId` 改为读取
       `destroyEngine.getState().map.tiles[0][3]`。
    5. **更新 `tools/apk_skirmish_rule_report.ts` 及 `.test.ts` 对应夹具与期望（解决 `apk_skirmish_rule_report.test.ts` 2
    项失败）**：
       - 在 [`tools/apk_skirmish_rule_report.ts`](C:/code/AncinetEmpires/tools/apk_skirmish_rule_report.ts) 的
       `buildCommanderAutoReviveActual`（约 L1039–L1045）中，`'dragon'` 攻击指挥官后、执行 `engine.step({ type: 'end_turn'
       });` 之前，补充阶段 3 原地收尾：`engine.step({ type: 'post_attack_move', unitId: attacker.id, to: { ...attacker.pos
       } });`。
       - 在 [`tools/apk_skirmish_rule_report.ts`](C:/code/AncinetEmpires/tools/apk_skirmish_rule_report.ts)（约 L1896）与
       [`tools/apk_skirmish_rule_report.test.ts`](C:/code/AncinetEmpires/tools/apk_skirmish_rule_report.test.ts)（约
       L457）中，`commanderCastleNoDeployTarget` 构造的是 `1x1` 地图指挥官占堡且无任何合法落点的场景；按已实现的 APK 规则
       A1，此时 `'recruit_to_castle'` 同样被拒绝，因此将两处的 `commanderCastleNoDeployTarget.actionTypes` 期望值从
       `['end_turn', 'recruit_to_castle', 'surrender', 'wait']` 同步更新为 `['end_turn', 'surrender', 'wait']`。

    ### Phase A 复验要求
    - 完成上述 5 处修复后，重新运行 `phase_a_audit.ts` 更新 `PHASE_A_SUBSET.json`（更新修改后的引擎/环境文件
    SHA256），并依次执行：
      - `npm run lint`（退出码 0）
      - `npm test`（全部通过，0 失败）
      - `npm run build`（退出码 0）
    - 全部通过后，不再修改 `src/`、`tools/`、`docs/` 下的任何公共文件，锁定新引擎 SHA，立即进入 Phase B。

    ---

    ## 二、继续执行 Phase B ～ Phase E（保持原定硬性铁律与门禁）

    ### 铁律重申
    1. **封存集零触碰**：Phase E 之前，`sealedAccess` 必须恒为 `0`。训练样本的封存排除只能沿用 Stage 5/6
    既有隔离名单机制（如 `stage5/isolation.py`、`sealed_guard.py`），绝不读取封存集对局内容。
    2. **输出目录**：代码与报告位于 `ai_training/continuation_review_20261030/stage7/`；大体积日志、缓存与模型位于
    `D:\AncientEmpiresData\continuation_stage7_20261108_v1\`。严禁删除或覆盖 Stage 1～6、`speed_bench_20261107` 及 Phase A
    首次停机留存的补丁快照（可将首次停机报告备份为 `PRE_STAGE7_REPORT_attempt1.md` 后更新正式报告）。
    3. **进程与防休眠安全**：全程持有防休眠锁，任何完成或失败退出路径必须确保所有 Python/Node 进程与防休眠锁 100%
    释放（`activeCount = 0`）。所有长任务采用 O(1) 增量写入并支持断点续跑。

    ### Phase B：无损高吞吐基建（训练工作区内实现，时间上限 1.5 天）
    - **B1 推理服务 v2**：
      - 使用 `G1` 原生 `FP32`（`accurate_reductions(False)`）；向量化整理批次；整批仅做 1 次 `torch.isfinite` 检查与 1 次
      CPU 回传；启用 pinned memory。
      - 批大小按 `{1, 2, 4, 8, 16, 32, 64, 128, 256}` 分桶（不足补齐空行并在返回前裁掉，消除动态形状抖动）。
      - 建立独立的 FP32 MIOpen 缓存目录（`D:\AncientEmpiresData\continuation_stage7_20261108_v1\miopen-fp32-db` /
      `cache`），用 Dev 面板全部地图尺寸 × 批大小桶 × `valueOnly` 两种模式完成离线预热；对比 `MIOPEN_FIND_MODE` 默认值与
      `FAST`。
      - 允许并对比“单服务”与“双服务流水线”两种部署。
    - **B2 跨局异步合批器**：采用 Node `worker_threads` × 每 Worker 多局异步协程结构，按请求 ID 分发结果，测试攒批窗口
    `coalesceMs ∈ {0.5, 1, 2}` ms。
    - **Phase B 硬门禁**：
      - **B-G1 时延**：预热后，批大小 `≤ 4` 时端到端单次请求中位数 `≤ 9 ms`，`p99 ≤ 30 ms`（消除 76～129ms 冷启动尖峰）。
      - **B-G2 负载下确定性**：在 72 个 Dev 根（`speed_bench` 的 36 根 + 新增 36 个 3P/4P
      根）上，确定性节点预算下对比“单局独立搜索”与“8 局并发负载搜索”：选招一致率 `≥ 99%`（任何不一致须证明分差 `<
      1e-4`），教师概率最大差的中位数 `≤ 1e-4`。
      - **B-G3 吞吐 P1**：使用完整无损教师配置 `T`（见 Phase D），全座位神经自对弈 12 局（2P/3P/4P 各 4 局），扫描 `workers
      ∈ {4, 6, 8}` × 每 worker 局数 `∈ {1, 2, 3}`。聚合实质根吞吐须 `≥ 7,200 根/小时`（即串行 `S0` 的 `≥ 6 倍`）。
      - **B-G4 吞吐 P2**：`25%` 完整搜索 `T` + `75%` 1-ply 快走，跑 18 局（2P/3P/4P 各 6 局）。聚合步速须 `≥ 10
      步/秒`，按人数分别报告自然完赛率、局/小时、有效教师样本/小时。
      - **B-G5 纯价值校验闭合**：在 `G1` 下运行纯价值路径一致性校验（`valueLogits` 最大差 `=
      0`），且确保校验脚本干净退出（`exitCode = 0`）。
      - *注：若 B-G1～B-G5
      任一硬件实测指标确因物理极限差微幅未达标，保留完整实测数据写清报告并停机向我汇报，不擅自篡改口径。*

    ### Phase C：新引擎 + G1 同口径重锚
    1. **并发竞争审计**：用 36 个根、正式 `3000 ms` 墙钟预算，对比 `W` 个评测 Worker 并发与单 Worker；取满足“节点数中位数比
    `≥ 0.90` 且超时 `= 0`”的最大 `W` 作为在线评测并发度。
    2. **新引擎基线重锚**：使用 Stage 5 `C1` 正式配置（`3000 ms`、`G1`、新引擎 SHA）重跑完整 `Dev-54`，锁定新引擎权威基线
    `B`（及 `Dev-18` 子集 `B18`）。健康门：54/54 自然完赛，0 时间判负，0 传输故障。
    3. 更新 `PRE_STAGE7_REPORT.md` 汇总 Phase A～C 全部门禁与基线 `B` 结果，全部通过后进入 Phase D。

    ### Phase D：Stage 7 混合联赛专家迭代（最多 3 代，或 4 天墙钟，先到者为准）
    - **D1 混合联赛对手与开局分布**：
      - 每局至少 1 个座位由当前候选运行教师配置；其余座位按 `1/3 OriginalApkLikeHardAI`、`1/3 冻结历代冠军池`（Stage 5
      `C1`、Stage 4 `V7 C2`、Stage 3 `Omni-Base`，每晋级一代将上一代加入池中）、`1/3 候选自身镜像` 分配。
      - 覆盖全部官方遭遇战地图槽位（座位随机轮换），另有 `30%` 从上一代自对弈中盘状态切入（严禁使用 `Dev`
      评测局轨迹作为训练切入态）。
      - `2P : 3P : 4P = 1 : 1 : 1`；训练对局相对轮数上限为 `80` 轮（截断局屏蔽价值标签并单独统计）。
    - **D2 完整无损教师配置 `T`（确定性节点预算）**：
      - 采用 Stage 5 `C1` 正式搜索参数（`priorAnchor = 0.1` 恢复 Stage 5 正式值，开启
      `castleProductionPenalties`），设置安全墙钟上限 `budgetMs = 60000`，以确定性配额 `maxNodes = 2500, finalists = 8`
      终止；严禁使用 `S2/S3/S4` 有损裁剪。
    - **D3 KataGo 式部分根完整搜索（`25% T + 75% 1-ply`）**：
      - 每个实质决策步（非投降合法动作 `≥ 2`）以 `25%` 概率运行完整搜索 `T` 并记录候选座位的策略教师样本；以 `75%` 概率运行
      `1-ply` 快走（`G1` 策略 logits + 战术先验，过滤 `forbidden` 动作，前 3 轮温度 `1.0`、之后 `0.5`）。所有自然完赛局产出
      6 槽价值标签。
    - **D4 双轨训练（初始化自 Stage 5 `C1`，`G1 FP32`）**：
      - `K1`：冻结双流主干，联合训练策略头与价值头；
      - `K2`：全网微调（主干学习率为头部的 `0.1` 倍），混入 `30%` Stage 5/6 历史非封存回放数据并加 `C1` 策略 KL 锚定（`λ =
      0.1`）；
      - 样本按 `2P:3P:4P = 1:1:1` 等权采样；导出后通过 TS runtime 与 Python 数值对齐校验。
    - **D5 每代晋级门禁（`K1/K2` 择优）**：
      - 离线 `Dev`：Brier 与槽位 ECE 不劣于 `C1` 超过 `0.003`，且策略对教师子集 KL 下降；
      - 在线 `Dev-18`：独胜数 `≥ B18 + 1` 方可进入 `Dev-54`；
      - 在线 `Dev-54`：总独胜 `≥ B + 2`，三人局独胜 `≥ B_3P`，任一人数组不低于 `B` 对应组 `- 1`，健康门 100%。

    ### Phase E：最终一次性封存验收（仅对通过 Phase D `Dev-54` 门禁的最优候选执行 1 次）
    - 在同一会话、同一新引擎 SHA 与 `G1` 推理档下，同场运行 Stage 5 `C1` 重锚的 `Sealed-54`、最优候选的
    `Sealed-54`、`Historical-40` 与 `Sealed-Offline-329`。
    - 晋级条件：候选 `Sealed-54` 独胜 `≥ C1_new_Sealed54 + 2`，人数等权胜率提升，且任一人数组不低于 `C1_new - 1`；否则保留
    Stage 5 `C1` 为正式冠军。

# Pre-Stage-7 Phase B 修复续跑 + Stage 7 高吞吐混合联赛专家迭代任务书

    ## 0. 当前状态与硬性纪律（必须严格遵守）

    1. **全程中文沟通与报告**。
    2. **Phase A 已 100% 通过并锁定，禁止回退或二次修改公共目录**：
       - `src/`、`tools/`、`docs/` 共 646 个公共文件已通过 `npm run lint`、`npm test`（564 通过 / 0 失败）、`npm run build`
       并由 `ai_training/continuation_review_20261030/stage7/PUBLIC_SOURCE_LOCK.json`（整体
       SHA256：`df20a853edcf031f2ae8da1ae379e3dd84ac3f19d77c0765c0dcacef205cb8d1`）冻结。
       - 本轮启动时直接校验 `PUBLIC_SOURCE_LOCK.json` 与 `PHASE_A_SUBSET.json`（`passed: true`），确认无误后**跳过 Phase A
       重跑，直接进入 Phase B 修复与验证**。
       - 保留 `attempt1/` 与 `before/` 快照；可将上一轮 Phase B 失败产物归档至
       `ai_training/continuation_review_20261030/stage7/attempt2/` 备查。
    3. **封存集与历史资产保护**：
       - 在 Phase D 候选模型完全击败 Dev-54 门控前，**严禁读取任何封存（Sealed）集文件**（`sealedAccess` 必须保持 `0`）。
       - 严禁覆盖或删除 Stage 5 正式冠军
       `C1`（`H1`：`D:\AncientEmpiresData\continuation_stage5_20261104_v1\heads-v1\H1\final.bin` 与
       `value-6000.pt`）及历史训练数据。
    4. **防休眠锁与进程卫生**：
       - 运行期间维护 Windows
       防休眠锁（`SetThreadExecutionState`），任务结束或任何门禁停机时必须释放锁，并确认残留工作进程数 `activeCount = 0`。

    ---

    ## Phase B：G1 FP32 推理服务修复与高吞吐跨局合批验证

    ### B.1 必须落地的三项精确修复（根因已定位）

    1. **修复 `B-G5` 在 `19x19` 大桶下 `valueLogitsMaxDiff = 3.539806` 的数值问题（ROCm 7.2.1 `gfx1201` 在 `M > 2^19`
    时的窄矩阵 `F.linear` 溢出 Bug）**：
       - **根因**：在 `dual_v3` 前向中，`m.rel2(F.relu(m.rel1(rel)))` 输入形状为 `(b, n, n, 16)`。在 Windows `PyTorch
       2.9.1+rocm7.2.1`（RX 9070 XT `gfx1201`）上，当展平行数 `M = b * n * n > 524,288 (2^19)` 时（如 `19x19` 的
       `slot-17.json` 实体数 `n ≈ 80`，在 `b = 128/256` 时 `M = 819,200 / 1,638,400 > 524,288`），ROCm 的 `F.linear`（`16
       -> 32 -> 8`）在超过 `524,288` 行的部分会发生行索引溢出并读取未初始化显存；而在 `M <= 524,288` 时 100% 精确确定（差异
       `0.0`）。
       - **修复方法**：在 `ai_training/continuation_review_20261030/stage7/fp32_forward.py` 中，将 `m.rel1` 与 `m.rel2`
       的前向计算按展平行数 `262,144`（`2^18`，处于安全阈值一半以内）分块拼接执行（或在 `load_model` 后将
       `m.rel1`、`m.rel2` 的 `forward` 包装为按 `x.reshape(-1, x.shape[-1]).split(262144, dim=0)` 逐块计算后 `torch.cat`
       并还原形状）。
       - **禁止改动 G1 的数学定义**：该分块对逐元素 MLP（`Linear(16,32) -> ReLU -> Linear(32,8)`）在数学上 100%
       逐行等价，仅规避 ROCm `> 2^19` 行的内核溢出。

    2. **修复 `B-G5` 服务收到正常 EOF 后退出超时（`exitCode = 1`）的问题（Windows ROCm `pin_memory=True` 在 `Py_Finalize`
    阶段死锁）**：
       - **根因**：`batch_v2.py` 的 `Collator.cache` 分配了 `pin_memory=True` 锁页内存；Windows 版 ROCm PyTorch
       在解释器退出 `Py_Finalize()` 析构锁页内存时会在 `hipHostFree` 处死锁，导致 60 秒后被传输层 `taskkill` 强杀返回 `1`。
       - **修复方法**：在 `service_v2.py` 中，当 `main()` 因 `stdin` 正常 EOF 返回后，先调用
       `ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)` 释放防休眠锁，再执行 `sys.stdout.flush()` 和
       `sys.stderr.flush()`，最后直接调用 `os._exit(0)` 干净退出（若 `main()`
       抛出未捕获异常，则打印异常、释放防休眠锁后以非零码退出）。

    3. **修复 `latency_gate.ts` 的 Fail-Fast 断言位置与 `valueOnly` 轻量打包**：
       - **Fail-Fast 立即停机**：在 `latency_gate.ts` 预热循环内，每完成一个 `(mode, size, batch)` 的 `full` vs `value`
       对拍，若发现 `diff !== 0`，**立即抛出包含 `{ mode, size, batch, row, slot, diff }`
       的断言错误并终止**，严禁延迟到全部计时跑完后才检查。
       - **可选轻量优化**：当 `valueOnly === true` 时，`ClientV2.forwardBatch` 可将传入 `packTensorBatch` 的观测副本中
       `actionPointers` 置为空 `Int32Array(0)`（保留 `spatial / entities / relations / players / activePlayerMask`
       原样不变），减少 `valueOnly` 路径无用的动作指针拷贝。

    ### B.2 跨局合批调度器（`BatchMux`）与预热配置

    - 保持并启用已准备好的跨局 `BatchMux`（支持多个并发对局 Worker 通过带 `requestId` 的代理将 `forwardBatch` 汇聚到常驻
    GPU 服务，物理分桶 `1, 2, 4, 8, 16, 32, 64, 128, 256`）。
    - 评测 `default` 与 `FAST`（`MIOPEN_FIND_MODE=FAST`）两档预热与时延，按最差单元中位数更优且通过全部门禁的一档锁定为
    Stage 7 正式推理配置。
    - 在选定配置上扫描跨局合批窗口 `{0.5ms, 1.0ms, 2.0ms}` 与推理服务实例数 `{1, 2}`，选择吞吐最高且 `hardTimeouts = 0`
    的组合。

    ### B.3 Phase B 验收门禁（全部通过方可进入 Phase C；任一失败立即停机汇报）

    - **`B-G5`（无损纯价值与退出健康门禁）**：
      - 在全部 11 种 Dev 初态地图尺寸 × 9 个物理桶（`B=1..256`）下，`valueOnly=false` 与 `valueOnly=true` 的 6 槽
      `valueLogits` 逐行最大绝对差 **`valueLogitsMaxDiff == 0`**（或 `<= 1e-6`）；
      - 推理服务在客户端 `close()` 后 5 秒内自然退出，**`exitCode == 0`**，无 `taskkill` 兜底强杀。
    - **`B-G1`（小批端到端时延与编译尖峰消除门禁）**：
      - 选定模式在 66 个 `B <= 4` 单元（11 种尺寸 × `B∈{1,2,4}` × `valueOnly∈{false,true}`，每单元 100 次）上：
        1. **66 个单元的中位数之全局中位数（median of 66 cell medians）`<= 10.0 ms`**；
        2. **`B = 1` 的 22 个单元中位数均值 `<= 9.5 ms`**；
        3. **任意单个单元中位数 `<= 15.0 ms`（含最重的 `19x19 preset_units B=4 full`），且任意单个单元 `p99 <= 30.0 ms`**。
    - **`B-G2`（并发负载确定性与零超时门禁）**：
      - 在跨局 `BatchMux` 并发合批负载下：`hardTimeouts == 0`、`lateResponses == 0`、无 NaN/Inf，同 seed
      重跑轨迹与估值确定一致。
    - **`B-G3` & `B-G4`（端到端搜索与自对弈吞吐门禁）**：
      - 记录真实完整教师搜索吞吐（`B-G3`）与部分根搜索吞吐（`B-G4`），换算并汇报自然完赛 **局/小时** 与 **教师样本/小时**
      相对 Stage 6 基线的实测加速比（目标端到端吞吐达到 Stage 6 的 **2.5x 以上**，且每步推理 `meanWireMs <= 12.0 ms`）。

    ---

    ## Phase C：对齐规则后的干净基线重测（Clean Baseline `B`）

    Phase B 全部门禁通过后，使用锁定后的推理服务配置，在对齐后的真 APK 规则引擎上对 **Stage 5 冠军权重 `C1`（`H1`）**
    跑一次标准评测：
    1. **快速健康门禁 `B18`（18 局平衡子集，2P/3P/4P 各 6 局）**：
       - 验证 `natural == 18/18`、`hardTimeouts == 0`、`meanWireMs <= 12.0 ms`。
    2. **完整开发集基线 `B`（`Dev-54` 全量 54 局：2P 20 局 + 3P 18 局 + 4P 16 局）**：
       - 必须满足 `natural == 54/54`、`hardTimeouts == 0`；
       - 记录 `C1` 在新规则下的真实基线胜场 $W_B$ 及分人数胜场 $(W_{B,2P}, W_{B,3P}, W_{B,4P})$，落盘为
       `STAGE7_BASELINE_DEV54.json`。

    ---

    ## Phase D：Stage 7 高吞吐混合联赛专家迭代（1～2 代）

    在 `C1` 基线之上执行 **1～2 代（`Gen 1`、可选 `Gen 2`）高吞吐混合联赛专家迭代**：

    1. **教师搜索（保持 100% 无损 S1 搜索质量，禁止启用 S2/S3/S4 有损裁剪）**：
       - 保持完整根搜索预算（`fullRootFraction = 0.25` 采集高置信教师策略分布 + 终局价值；其余步采用 `partRoot`
       推进轨迹），使用快速状态哈希与 G1 FP32 批量前向。
    2. **混合对手池与人数配比（直击 3P 短板与策略过拟合）**：
       - **人数配比**：按 **2P : 3P : 4P = 25% : 45% : 30%** 采样开局（重点加密 3P 三方博弈状态覆盖）；
       - **混合对手池（Mixed League）**：
         - **50% 对局**：对抗 `OriginalApkLikeHardAI`（保持硬规则基线压制力）；
         - **35% 对局**：对抗 `C1`（Stage 5 冠军自我博弈，突破 HardAI 天花板）；
         - **15% 对局**：在 3P/4P 中采用“候选模型 + `C1` + `HardAI`”混编阵容（防止针对单一对手风格的脆弱配合）。
       - 每代采集 **不少于 180 局自然完赛对局**（或 **不少于 6,000 条高质量完整根教师样本** +
       完整轨迹价值样本），与最近历史高质量数据按 **60% 新数据 + 40% 回放缓冲** 混合。
    3. **双轨候选训练（每代训练 2 个候选）**：
       - **候选 `K1`（Value-Head + Global/Entity 顶层微调或干净价值头重训）**：优先修正 3P/4P
       局势评估与新增规则状态（突击锁定、指挥官满城禁招）下的价值偏差；
       - **候选 `K2`（小学习率 Policy + Value 联合微调 + KL 锚定 `C1`）**：`lr <= 3e-5`，对 `C1` 策略施加 KL
       正则防止灾难性遗忘。
    4. **开发集晋级门控（先跑 18 局快筛，通过者跑完整 `Dev-54`）**：
       - 候选模型要晋级，必须在完整 `Dev-54` 上同时满足：
         1. **健康门控**：`natural == 54/54`，`hardTimeouts == 0`，`fallbacks == 0`；
         2. **总分门控**：`Dev-54` 总胜场 **$\ge \max(36, W_B + 1)$**；
         3. **分项不退化与 3P 突破门控**：
            - `2P >= 15/20`（且不低于 $W_{B,2P} - 1$）；
            - **`3P >= 11/18`**（必须比 Stage 6 的 `9/18` 净增至少 2 场）；
            - `4P >= 9/16`（且不低于 $W_{B,4P} - 1$）。

    ---

    ## Phase E：封存集一次性终验（`Sealed-54`）与收官报告

    - **严格门控**：
      - **若 Phase D 无任何候选通过上述 `Dev-54` 晋级门控**：**严禁解封访问 `Sealed-54`**（保持 `sealedAccess = 0`），保留
      Stage 5 `C1` 为正式冠军，如实输出诊断报告。
      - **仅当有候选通过 `Dev-54` 全部门控时**：对该单一最佳候选模型及基线 `C1`（若需同规则对比）执行一次性 `Sealed-54`
      验收（`sealedAccess <= 1`），要求 `Sealed-54` 全部 54/54 自然完赛且总胜场 **$\ge 37/54$**（同时 2P/3P/4P
      均衡达标）方可正式加冕为 Stage 7 新冠军。
    - **收官检查与报告**：
      - 将完整报告写入 `C:\code\AncinetEmpires\ai_training\continuation_review_20261030\stage7\STAGE7_REPORT.md`（并更新
      `PRE_STAGE7_REPORT.md` 索引）；
      - 核对 `PUBLIC_SOURCE_LOCK.json` 未变动、所有进程 `activeCount = 0`、防休眠锁已释放，并附上 SHA256 证据清单。