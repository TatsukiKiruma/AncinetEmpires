# V9 收尾修复清单（run 03）

生成时间：2026-09-22，基于对 agent_upgrade_20260922_v9_identity_02 的独立复核。
执行前提：核对会话对 tools/、docs/、training_runs/ 无写权限（PowerShell 与 cmd 均 Access denied），
以下步骤需在有写权限的会话执行。禁止覆盖 identity_01 / identity_02 的历史工件。

## 一、已核实完成，不要重做

- V9-02 真 Worker + 硬终止：src/game/ai/cancellable_ai_runner.ts 浏览器路径
  new Worker(new URL('./ai_worker.ts', import.meta.url), {type:'module'})，超时/取消/过期调用 terminate()；
  tools/v9_worker_preemption.test.ts 4/4 通过。
- V9-02 生产链路透传版本：play.ts:65-66、App.tsx:201-206 传 stateVersion 与 getCurrentStateVersion，
  CANCELLED/STALE 不落子。
- V9-04 配额保底：tools/v7_heuristic_bounded_search.ts:346-386，heuristicFill 先于 spatial，
  spatial 仅竞争剩余额度。
- V9-00 工件可用性：artifact_availability.json 22/22，sizeBytes 与 SHA-256 与实际文件全部一致。
- V9-06 分区隔离：split_audit.json 0 泄露，val 覆盖 Duel/Liberty Port（holdout 设计）。
- V9-05 哈希与采样：hash_audit.json 8/8；sampling_coverage.json 64/64 组合、0 根碰撞。
- 30/30 测试通过；npx tsc --noEmit 退出码 0。

## 二、必须修复的剩余项

### R1（P0）D10 命名与真实数据不符
证据：
- learning_curves.json 中 spatial_resnet_v2_d10.description = "10k unique state baseline training (D10)"，
  但 sampleCount = 7832、trainSamples = 5868；
- scale_benchmark.json 中 scale_10000.datasetSize = 10000（字面量，实际数据集 7,832）；
- checkpoint_registry.json 中 d10_best/d10_last trainedStates = 7832；
- 源头：tools/v9_compile_training_scale_report.ts:103/115 的硬编码 description 与 scale_10000 字面量。

修法（二选一）：
(a) 真做 10k 以上：
    node --experimental-loader ./.codex_runner/ts-loader.mjs tools/v7_training_pipeline.ts --run-id agent_upgrade_20260922_v9_identity_03 --limit 19000 --epochs 8
    （general 目标 13,300 + 课程上限约 832 = 约 14,132 唯一；Duel/Liberty 作 holdout 后训练分区约 10,600，达到 10,000 以上）
    然后修改 compile 脚本：D10 的 description/datasetSize 一律从 split_manifest.json 与 d10_metrics.json
    动态读取，禁止再出现 10000/10k 字面量。
(b) 若无法扩量：description 改为 D7.8k，删除 scale_10000 或标 NOT_RUN，并说明
    curriculum 生成器饱和在 832，10k 目标需先扩课程产能。

验收：learning_curves.json 的 sampleCount 等于 dataset_accounting.json 的 uniqueStates；
scale_benchmark 不再出现与 manifest 不符的 datasetSize。

### R2（P0）先验消融退化、结论无法支撑
证据：prior_ablation.json 中三条一致率均为 1.0（仅 6 个状态），Jaccard 约 0.50/0.50/0.48；
三臂选择动作与 S10_TRUE 完全相同，不能得出候选集优劣由先验权重决定的结论。

修法：状态数扩到 50 个以上（覆盖 OPENING / ENGAGEMENT / COMMANDER_RECOVERY / ENDGAME 与两座位），分别输出：
(1) 候选集 Jaccard；(2) 固定节点决策差异率；(3) 置零或置乱的并列排序规则；
(4) 真实先验改变决策的状态占比。若无差异，如实写 20 节点预算下先验不改变决策，不得包装成质量证据。

### R3（P1）教师资格门禁未达标
证据：teacher_qualification.json 仍只有 2 个手工场景，其中 Avoid Suicidal Walk 的选择动作
score = -307 仍判 pass；没有开发对局证据。现有 80 场矩阵中 S00 为 7W/7L/6T（W/N 35%），
Heuristic 为 6W/6L/8T（W/N 30%），n=20 不显著。
修法：无优势证据则改为 teacherQualifiedForTraining: false、verdict: NOT_QUALIFIED，
基础标签继续用 Heuristic；要翻案需 100 场以上配对根对局的预冻结矩阵与正向差值区间。

### R4（P2）对手回应覆盖偏低
search_coverage.json：handover/reached = 62.9%，但 oppAttackCoveredRate = 13.7%。
补齐(对手第二个攻击比第一个致命)(移动后才出现攻击)两个 fixture 并提升覆盖，否则如实标注未覆盖。

### R5（P2，环境阻塞）浏览器验收
browser_runtime.json 已诚实标 NOT_RUN（无 Playwright/Puppeteer）。
安装驱动后跑真实浏览器 E2E 并输出 p50/p95/p99/max；否则维持 NOT_RUN，禁止用 Node 数值替代。

### R6（P2）批次 provenance
identity_01 记录的 dirtyPatchHash = fc6fa962... 与最终工作树实算 2d8ef58e... 不符。
run 03 应在批次结束后重算 git diff HEAD 的 SHA-256 并写入 source_snapshot.json。

### R7（P1）未做任务如实标注
V9-08 / V9-09 / V9-10 保持 NOT_RUN / TODO；agent_tasks_v9.json 中 V9-07
在 R1(a) 完成前不得标 ACCEPTED。

## 三、收尾校验

1) 全量测试：npx vitest run tools/v9_model_registry.test.ts tools/v9_contract_parity.test.ts tools/v9_browser_runtime.test.ts tools/v9_sampling_coverage.test.ts tools/v9_search_qualification.test.ts tools/v9_worker_preemption.test.ts
   本机沙箱若 esbuild 被禁，追加 --configLoader runner --pool=threads --no-file-parallelism --config .codex_runner/vitest.sandbox.config.mjs
2) 类型检查：npx tsc --noEmit
3) 数据规模：读取 run03/split_manifest.json，断言 totalUniqueStates >= 10000 且 trainSampleCount 与 D10 描述一致
4) 消融非退化：读取 run03/prior_ablation.json，断言三臂一致率不同时为 1.0
5) provenance：批次结束重算 git diff HEAD 的哈希并写入 source_snapshot.json
