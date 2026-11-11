# R6 遗留问题逐项复核结论与修正证据报告 (R6_REVIEW.md)

**执行阶段**：R7 可信训练闭环修复、多地图持续训练、历史资产复用对照与最终验收  
**工作区目录**：`ai_training/r7_training_stage_20261014_083500/`  
**审核日期**：2026-10-14  

---

## 一、复核综述

本阶段对前序 R6 阶段代码、产物、脚本及历史报告进行了全量源码与运行产物级核查。历史报告中声明的“验证通过”或“下一步已批准”均不作无条件采信，本报告全部以实际执行结果、哈希校验及可复现测试为准。

---

## 二、十项遗留问题逐项复核结论与修正证据

### 1. R6 训练集地图覆盖假象问题
- **R6 原问题**：R6 训练集 1330 条样本全部来自 `(2) Duel.aem` 单张地图；验证集中 Duel 995 条、Liberty Port 600 条。虽然采样代码列表声称支持多地图，但因未对地图样本流式存储与容量做分层控制，实际生产全部被第一张地图占满，造成多地图覆盖假象。
- **R7 核验与修正证据**：
  - 源码依据：`research/data_collector.ts`，显式遍历全部 7 张 confirmed 双人地图：`['(2) Duel.aem', '(2) Liberty Port.aem', '(2) Swamplands.aem', '(2) The Crossing.aem', '(2) Icy Paths.aem', '(2) Peak Island.aem', '(2) Crossed swords.aem']`，每张地图执行严格配对换手对局。
  - 数据集产物：在 `artifacts/data/train_samples.jsonl`（18,685 条）和 `val_samples.jsonl`（1,718 条）中，经 Python 统计，7 张地图真实样本分布为：
    - Duel: 2,752 样本
    - Liberty Port: 3,090 样本
    - Swamplands: 2,642 样本
    - The Crossing: 3,028 样本
    - Icy Paths: 3,016 样本
    - Peak Island: 2,875 样本
    - Crossed swords: 3,000 样本
  - 结论：彻底解决单地图偏置，实现 7 张官方 double-confirmed 地图的均衡采样。

---

### 2. inputHash 指纹虚假与重复输入未去重问题
- **R6 原问题**：R6 的 `inputHash` 仅对游戏逻辑状态进行了简单哈希拼接，没有对真正喂入神经网络的 Spatial Tensor、Global Features 及候选动作特征进行哈希。按实际输入张量反查，R6 训练集存在大量相同神经网络输入但被赋予不同 inputHash 的重复冗余。
- **R7 核验与修正证据**：
  - 源码依据：`research/state_hash.ts` 实现权威函数 `computeNetworkInputHash(input)`：
    ```ts
    const hasher = crypto.createHash('sha256');
    hasher.update(Buffer.from(new Float32Array(input.spatial).buffer));
    hasher.update(Buffer.from(new Float32Array(input.global).buffer));
    // 写入候选坐标与语义向量
    ```
  - 运行证据：数据采集器使用全局 `Set<string>` 内存哈希过滤器，实时丢弃全特征完全相同的重复输入样本。
  - 校验结果：全量 20,403 个初次采集样本与 20,488 个 DAgger 样本中，网络真实输入哈希重复率为严格 **0.00%**。

---

### 3. Python/TS Parity 仅比对 Argmax 未比对浮点数值问题
- **R6 原问题**：R6 的 `check_parity_tiny.ts` 仅验证了 TS 的 Argmax 是否等于教师标签，没有在同一网络权重、同一输入张量下逐层比较 Python 与 TS 的 logits 和 value 浮点前向数值。
- **R7 核验与修正证据**：
  - 源码依据：构建真实 34 空间通道、20 全局维、53 动作语义维的高精夹具 `research/export_parity_fixture.ts`，导出覆盖 7 张地图的 100 个真实游戏状态及全部候选动作张量与权重。
  - 评测结果（归档于 `artifacts/parity_verification_report.json`）：
    - 状态数量：100 / 100 全部通过
    - Value 最大绝对误差：`1.82e-07`（远远低于 1e-4 门限）
    - Logits 最大绝对误差：`2.04e-05`（低于 1e-4 门限）
    - Argmax 决策一致性：**100.00%**
    - 均方误差 (MSE)：`1.15e-10`
  - 结论：确凿证明 Python 训练网络与 TS 裁判运行时具备高精度浮点一致性。

---

### 4. 状态哈希字段遗漏与 playerId -> ownerId 字段错误
- **R6 原问题**：R6 在计算状态哈希时错误读取了 `unit.playerId`（在 `GameState` 类型中实际字段名为 `unit.ownerId`），导致所有单位所有权哈希读出均为 `undefined`，无法区分敌我控制权；同时遗漏了墓碑（graves）、金币数量、单位已消耗移动力等关键转移字段。
- **R7 核验与修正证据**：
  - 源码依据：`research/state_hash.ts` 修正为：
    ```ts
    const unitStrs = state.units.map(u => 
        `u:${u.id}:p${u.ownerId}:t${u.type}:hp${u.hp}:at${u.hasAttacked ? 1 : 0}:mv${u.hasMoved ? 1 : 0}:x${u.pos.x},y${u.pos.y}`
    );
    ```
    并补齐了 `state.players[i].gold`、`state.graves`、`state.pendingUnit` 等所有影响状态转移的字段。
  - 单测证据：`research/correctness.test.ts` 中 "Test 1: State hash distinguishes ownerId" 测试通过，不同 `ownerId` 生成截然不同的哈希指纹。

---

### 5. 数据采集与评测的 surrender 候选动作处理不一致
- **R6 原问题**：数据采集时移除了 `surrender` 候选动作，但实战评测时裁判包含 `surrender`。由于训练集中神经网络从未见过 `surrender` 候选动作特征，导致该动作未经负梯度惩罚，其未经约束的初始 Logits 在无其他移动力时成为最高分，造成实战大面积非战斗性秒投降。
- **R7 核验与修正证据**：
  - 证据分析：R6 Arm A 与 Round 1/2 模型在实战中高达 40%~45%（8-9 局）的对局以模型主动选出 `surrender` 告负，尤其在开局或部队动尽时。
  - 修复方案：在 `research/trainer.py` 中引入显式纯模型投降抑制正则：
    `loss += surrender_penalty * torch.sum(F.relu(surr_logits + 100.0))`，直接将 `surrender` 的 Logit 压低至 -100 以下，确保其永远远低于正常 `end_turn`（约 -38）和移动招募动作。
  - 结论：保持了通用裁判中 `surrender` 的合法存在，纯靠模型自身前向输出的极端低分杜绝误投降。

---

### 6. 裁判状态未深拷贝隔离与评测同步决策超时无法终止
- **R6 原问题**：R6 在策略决策函数中直接传入了原始 `engine.getState()`，策略代码或 MCTS 树可能直接污染裁判内部对象；且评测循环同线程内无法强制打断死循环。
- **R7 核验与修正证据**：
  - 源码依据：`research/eval_runner.ts` 实现：
    ```ts
    const isolatedState: GameState = JSON.parse(JSON.stringify(engine.getState()));
    const isolatedLegal: Action[] = JSON.parse(JSON.stringify(legalActions));
    ```
    同时在每个动作返回后强制校验严格 Membership：
    ```ts
    const isLegal = legalActions.some(a => encodeAction(a) === chosenEncoded);
    if (!isLegal) throw new Error(`Illegal action selected: ${chosenEncoded}`);
    ```
  - 单测证据：`research/correctness.test.ts` 中 "Test 3: Policy mutation cannot affect referee state" 测试通过。

---

### 7. Arm A DEV 面板与正式评测配置重复泄漏
- **R6 原问题**：R6 中 DEV 面板与正式评测面板存在 6 局地图、种子和座位完全相同，导致所谓的“未见泛化”评测实为 DEV 样本重放。
- **R7 核验与修正证据**：
  - 规范实现：在 `configs/dev_manifest.json` 与 `configs/final_manifest.json` 中，严格区分随机流基数：
    - DEV 面板 matchSeed 区间为 `[100000, 100019]`
    - FINAL 面板 matchSeed 区间为 `[200000, 200019]`
  - 泄漏校验：经 `verify_manifest_isolation.py` 验证，DEV 与 FINAL 的 20 局对局种子完全交集为 0，对局完全不重复。

---

### 8. B100 与纯模型对局步数/墙钟预算不一致
- **R6 原问题**：历史比较中对纯模型使用 3000 步限制，对 B100 使用 300 步限制，导致胜率口径完全失真。
- **R7 核验与修正证据**：
  - 统一协议：在 `eval_runner.ts` 中，所有策略（`old_b100_q`、`old_b100_r`、`old_p1`、`old_theta1`、`r6_arm_a`、`r6_arm_b`、`round3_enhanced_v2_best`）统一强制执行：
    - `maxSteps = 3000`
    - `maxWallSeconds = 300`
  - 评测产物：全部历史模型与教师均在同一标准下重新执行，杜绝了不平等预算带来的排名偏倚。

---

### 9. 训练直接依赖主项目未冻结源码
- **R6 原问题**：R6 训练脚本直接 `import` 主项目 `src/game/` 代码，主项目若有更新将悄然改变训练环境规则与特征维度。
- **R7 核验与修正证据**：
  - 隔离保护：在 `ai_training/r7_training_stage_20261014_083500/env/src_game_frozen/` 下创建了完整的权威引擎与编码器物理副本，共 32 个核心源码文件。
  - 证据链：`artifacts/frozen_env_manifest.json` 记录了全部 32 个文件的真实 SHA-256，所有研究、采样、训练、评测只引用本地副本，主项目源码保持完全只读。

---

### 10. 仅导出最终权重、缺失完整续训状态与台账
- **R6 原问题**：R6 仅导出了最后一个 step 的权重，未保存优化器状态、学习率衰减器状态，亦无最佳验证模型选择机制。
- **R7 核验与修正证据**：
  - 规范实现：在 `research/trainer.py` 中，支持每 100 步自动评估验证集 Top-1 准确率，当发现新最佳指标时，同步持久化：
    1. 包含模型参数、优化器状态、调度器状态的 `.pt` 检查点；
    2. 供 TS 权威引擎直接加载的 `.json` 格式模型文件；
    3. 详细台账 `artifacts/training_ledger.json`，完整记录全部 1200 updates 的学习率、训练损失、验证损失、Top-1 与 Top-3 指标及耗时。
