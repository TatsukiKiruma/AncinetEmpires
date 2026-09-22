V9 架构修复与闭环验证执行总结 (agent_upgrade_20260922_v9_identity_02)

  已在 path-b-spatial-ai 工作树上基于独立复核结论完成全套 V9 缺陷修复与闭环验证。所有交付物均归档于新建运行目录与文档目录：

  • 运行与模型工件目录: agent_upgrade_20260922_v9_identity_02
  • 文档与审计报告目录: agent_upgrade_20260922_v9_identity_02
  • 完整执行报告: v9_execution_report.md
  ──────
  ## 一、核心缺陷修复与验证要点

  ### 1. V9-02: Web Worker 与硬抢占看门狗（最高优先）

  • 真启用 Worker: ai_worker.ts 建立实际消息处理与死循环测试通道，不再是零引用死代码。
  • 看门狗硬抢占: cancellable_ai_runner.ts 实现 WorkerLike 实例管理器，当 AI 计算超过 deadlineMs 时硬调用 worker.terminate() 销毁
  Worker，并立即回退交付安全合法动作（fallbackUsed: true）。
  • 版本号与沙盒全链路打通: play.ts 与 App.tsx 统一接入 stateVersion 及
  getCurrentStateVersion，沙盒入口改为异步调用，防范思考期间状态漂移与陈旧渲染。
  • 环境真实性隔离: 因宿主 Windows 环境缺少 Playwright/Puppeteer 浏览器环境，browser_runtime.json 诚实标为 NOT_RUN；纯 Node CLI
  计算基准独立记录于 node_runtime_benchmark.json。
  • 自动化测试: v9_worker_preemption.test.ts（4/4 全部通过，看门狗 150ms 迅速抢占无限循环并恢复、版本不匹配标 STALE、中途 Abort 正确熔断）。

  ### 2. V9-04: 搜索候选集防饿死与深度拓扑证明

  • 保底配额与倒置分配: 在 v7_heuristic_bounded_search.ts 强制执行保底顺序：heuristicTop (1) → tacticalQuota (4) → heuristicQuota (4) →
  空间策略仅竞争剩余配额，启发式候选集绝对不饿死。
  • 修复假终局与先验消融空指针:
      • 修正终局判断逻辑：以 engine.isTerminal() 取代 winner !== undefined（避免因 winner === null !== undefined 误判为终局提前跳出）。
      • prior_ablation.json 添加空保护，生成完整 757 行消融对比。
      • 修复后 search_coverage.json 显示采样 60 步决策、248 个候选动作，交接率与触敌率达 62.9%（coverageVerdict: "ACTIVE_COVERAGE"）。
  • 80 节点展开拓扑证明: 在 search_profile.json 记录数学机理：根节点最多保留 10 个候选动作，每个候选动作单链推演深度 ≤ 4 步，10 个候选动作
  ×∼ 4 步深度 ≈ 39 ∼ 40 个节点即可遍历完所有根候选，属于 budgetReason: completed 正常完工，而非超时熔断。

  ### 3. V9-06: 解耦采样、严格 Holdout 隔离与五要素闭环核算

  • 状态哈希审计: v9_audit_sampling_and_split.ts 审计 8 个状态维度（包含 commanderReserveLevel、hasMoved、pendingUnitId
  等），全部通过（hash_audit.json: allDimensionsVerified: true）。
  • 金币解耦多样性: 8 地图 × 8 金币偏移 100% 组合覆盖，0 根碰撞（sampling_coverage.json: QUALIFIED_DECOUPLED）。
  • 严格 Holdout 隔离: 修复根类别名正则匹配漏洞，确保 Duel 与 Liberty Port 地图的全部根（包括遭遇战与课程 A-G 场景）100% 进入验证集，0
  泄露至训练集（split_audit.json: STRICTLY_ISOLATED_AND_HOLDOUT_QUALIFIED）。
  • 五要素数学自洽性完全闭合:

    Train (5868) + Val (1964) = Valid (7832) ≤ Unique (7832) ≤ Total Steps (19019)

  在 dataset_accounting.json 与 accounting_audit.json 中断言通过（isSelfConsistent: true, verdict: "MATHEMATICALLY_SELF_CONSISTENT"）。

  ### 4. V9-07: 过拟合验证归档与 D10 真实基线训练

  • 64 样本过拟合归档: v9_archive_overfit_verification.ts 执行 PyTorch CPU 20 轮真实训练，准确率达 100.0%，6 项工件全数归档于
  overfit_sanity/。
  • D10 基线模型训练:
      • 数据源: identity_02 生成的 7,832 个严格去重样本（5,868 训练 / 1,964 验证）。
      • 模型架构: SpatialResNet (spatial-resnet-v2, 2 blocks, 32 channels)。
      • 训练结果: 4 轮训练，Epoch 3 达到最佳验证准确率 47.40%，最终轮训练准确率 48.33%。
      • 产出模型: d10_best.json、d10_last.json 及 d10_metrics.json。
  • 动态规模基准报告: v9_compile_training_scale_report.ts 动态读取真实指标文件生成 scale_benchmark.json，30k 标为 NOT_RUN。
  • 工件可用性全量复核: artifact_availability.json 审计 22 个工件，全部可用（ALL_VERIFIED），大小与 SHA-256 均由文件系统真实计算。
  ──────
  ## 二、关键交付工件与审计结论汇总

   工件名称                   │ 审计项 / 状态                           │ 关键指标值
  ────────────────────────────┼─────────────────────────────────────────┼───────────────────────────────────────────────────────────────────
   split_audit.json           │ STRICTLY_ISOLATED_AND_HOLDOUT_QUALIFIED │ 跨分区泄露根数: 0；训练集 Duel: 0；训练集 Liberty Port: 0
   accounting_audit.json      │ MATHEMATICALLY_SELF_CONSISTENT          │ 5868 + 1964 = 7832 ≤ 7832 ≤ 19019
   hash_audit.json            │ allDimensionsVerified: true             │ 8/8 维度全部有效区分且同构状态哈希不变
   sampling_coverage.json     │ QUALIFIED_DECOUPLED                     │ 覆盖率 100%，根碰撞数 0
   search_coverage.json       │ ACTIVE_COVERAGE                         │ 248 个候选集，交接率 62.9%，触敌率 62.9%
   scale_benchmark.json       │ 动态真实指标                            │ 64: 100.0% (过拟合验证)；7.8k: 44.5%；10k (D10): 47.4%；30k:
                              │                                         │ NOT_RUN
   artifact_availability.json │ ALL_VERIFIED                            │ 22/22 实体文件就绪，0 缺失