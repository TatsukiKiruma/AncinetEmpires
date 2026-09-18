# SD 训练当前状态与后继任务

## 2026-09-18 收官修正与独立验证（最新）

已完成用户要求的四项任务，共 200 场新对局（含 24 场失败快照示范生成），实战验证统一 8 worker。已有 v4＋启发式收官策略的开发回归为正常 6/8、残局 11/12、超时 0/20；独立种子为正常 8/16、残局 11/12、超时 1/28、非法动作 0，独立验收通过。同一独立矩阵的纯 v4 为正常 2/16、残局 8/12、超时 4/28。

新增持续目标、真实路径推进、实际移动历史、撤退例外及己方城镇保护。11 个有效来源导出 885 条训练／148 条验证动作，排除 4 个破坏己方城镇的正标签；完成 10%/25% 两组各 3 轮重训并保存最佳轮次。验证集选出的 25% 新权重实战退步，保留已有 v4 权重及实验策略，游戏默认 AI 未切换。

仍有 Icy Paths 正常开局 0/4、个别残局收官缓慢的问题。445 项测试、类型检查、构建及 54 状态／2,026 候选特征一致性检查通过。完整结果、反例、代码入口和复现命令见 [ENDGAME_ITERATION_20260918.md](ENDGAME_ITERATION_20260918.md)。以下为前序记录。

## 2026-09-18 真人补训与 v4 路径特征（前序）

78 局严格回放全部通过；按真人胜方筛选后 43 局提供有效样本。完成 8 组抽样训练、8 worker 的 120 场实战：原全量 v3 的优势残局自然胜为 6/12，纯 AI 数据 v3 对照为 8/12，真人 25% v3 为 3/12，真人 25% v4 为 7/12；对应总超时 2/20、2/20、5/20、3/20。真人 10% v3/v4 分别为 4/12、6/12 胜，5/20、4/20 超时。全部常规开局均为 0/8，非法动作均为 0。

新增 v4 路径可达性、占领/攻击目标推进特征及兼容模型续训入口；441 项测试、类型检查和构建通过。保留原模型及默认 AI，不扩大训练。完整设置、局限和证据见 [PVP_NAVIGATION_20260918.md](PVP_NAVIGATION_20260918.md)；以下为前序阶段记录。


## 2026-09-18 诊断与迭代验证（前序）

正式模型训练、首轮评估及本轮诊断验证已完成。7组训练对照、176局新实战/快照回归，验证统一8 worker。原模型+BC-blend在同一48局中的正常自然胜为9/24、优势残局收尾17/24，但超时9/48；原纯BC分别为0/24、9/24和5/48。纯BC重训和128条定向补数据暂未显示正常开局收益，未替换游戏默认AI。

已增加逐轮保存、最佳验证轮次及平均权重选项；类型检查、435项测试、构建通过。完整结论与证据见 [BC_ITERATION_20260918.md](BC_ITERATION_20260918.md)。以下保留此前阶段记录，当前决策以本节和迭代报告为准。


## 2026-09-18 当前有效状态

云端生成的 250 批、2,500 局数据已完整下载到 `training_runs/server_archive_20260913/dataset/`，最终清单为 `manifest.json`；977,737 条样本已通过全量校验。

版本兼容性核对和小规模试训已完成：生成器指纹一致，lint / 429 项测试 / build / 8 项 APK 报告通过，forced 回放 112/112 通过；5,000 条训练样本、1,000 条验证样本、1 epoch 试训成功，两局模型加载对战均无非法动作、超时或步数保护停止。试训模型两局均负，不作为正式模型。

下一步为正式全量基线训练及多种子评估。详情与证据见 [PREFLIGHT_20260918.md](PREFLIGHT_20260918.md)。下文为此前本机旧产物的历史快照，其中旧特征丢样与未完成状态不代表本次已校验的云端归档数据。

更新时间：2026-07-14

本文是当前工作区训练产物的唯一状态清单。训练策略背景见 `SD_TRAINING_STRATEGY_HANDOFF.md`，规则对齐前置门槛见 `TRAINING_HANDOFF_GUIDE.md`。

## 统一目录

正式 run 名：

```text
sd_training_plan_20260705_heuristic-apk-like-balanced
```

当前目录约定：

```text
training_runs/episodes/sd_training_plan_20260705_heuristic-apk-like-balanced/
training_runs/features/sd_training_plan_20260705_heuristic-apk-like-balanced/
training_runs/plan_snapshots/sd_training_plan_20260705/
training_runs/archive/duplicate_features/
```

- 从其他机器复制来的 episode 和唯一 feature 已合并到不带 `(1)`、`(2)` 的标准目录。
- 三份单方案 `jobs.jsonl` 已按方案归入 `plan_snapshots/`，避免误认为完整 2500 局 manifest。
- 两份哈希完全相同的 feature 副本已移入 `archive/duplicate_features/`，未删除。
- `datasets/` 和 `models/` 当前不存在。

## 总体完成度

- 训练配置：19 个方案，计划 2500 局。
- 已存在 episode：698 局，完成度 27.9%。
- 尚缺 episode：1802 局。
- 唯一 feature：755865 条，来自 5 个方案。
- 已存在的 698 局中 timeout 205 局，占 29.4%。

| 方案 | 已有/计划 | Episode 状态 | Feature 状态 |
| --- | ---: | --- | --- |
| `sd-normal` | 15/400 | 未跑完 | 无 |
| `sd-low-gold` | 100/100 | 完整 | 已有 |
| `sd-high-gold` | 100/100 | 完整 | 无 |
| `sd-low-unit-limit` | 0/100 | 未运行 | 无 |
| `sd-high-unit-limit` | 0/100 | 未运行 | 无 |
| `sd-3p-normal-extra` | 160/160 | 完整 | 已有 |
| `sd-3p-high-gold-extra` | 60/60 | 完整 | 已有 |
| `sd-3p-low-unit-extra` | 60/60 | 完整 | 已有 |
| `sd-4p-normal-extra` | 0/80 | 未运行 | 无 |
| `sd-4p-high-gold-extra` | 0/40 | 未运行 | 无 |
| `sd-small-advantage-endgame` | 140/140 | 完整 | 已有 |
| `sd-medium-advantage-endgame` | 63/140 | 未跑完 | 无 |
| `sd-large-advantage-endgame` | 0/120 | 未运行 | 无 |
| `sd-small-disadvantage-endgame` | 0/100 | 未运行 | 无 |
| `sd-medium-disadvantage-endgame` | 0/80 | 未运行 | 无 |
| `sd-equal-preset-units` | 0/220 | 未运行 | 无 |
| `sd-high-tier-specialist` | 0/180 | 未运行 | 无 |
| `sd-skill-specialist` | 0/160 | 未运行 | 无 |
| `sd-building-finish` | 0/160 | 未运行 | 无 |

## 已完成的完整性校验

现有 episode：

- JSONL 均可完整解析，文件以换行结束。
- 无重复场景与 seed 组合。
- `illegalActionCount = 0`。
- `stoppedByMaxSteps = 0`。
- 未发现 `random` policy。
- episode 内 `summary.stepCount` 与实际 steps 数一致。

现有唯一 feature：

- JSONL 全量解析通过。
- `featureDim = 4096`、`maxCandidates <= 64`、`featureExtractor = hashed-action-v2`。
- label action 均存在于对应 feature candidates。
- 未发现 `random` policy。
- 755865 条样本均已回溯核对对应 episode 的场景、seed、step、玩家、policy、动作编码和固定动作索引，未发现错配。

重复副本：

| 方案 | SHA-256 |
| --- | --- |
| `sd-low-gold` | `16a427e381d13013762ebc5d517337d4ddbf8699ee521557fce17549deee3d83` |
| `sd-small-advantage-endgame` | `69783bf47af580fe7e6c48cca745a74c82f48515f0da40ac26493a49c7560fa1` |

## 当前风险

### Feature 丢样率过高

现有 5 份 feature 只保留对应 episode 动作的 23.79%。`sd-small-advantage-endgame` 仅保留 6.4%。当前导出器在 label action 没有进入截断后的 64 个候选动作时会跳过整个样本。

这不是文件损坏，但会造成明显训练偏差。在修复或确认候选截断策略前，不应直接开始最终 BC 模型训练。

### 复制产物缺少代码版本元数据

episode 和 feature 可以互相对齐，但记录中没有生产机器的 Git commit。正式续跑前，应使用当前本机代码重放少量复制 episode，确认规则和特征生成逻辑一致。

### Manifest 不是完整计划

现有三份 manifest 快照分别只包含 `sd-normal`、`sd-medium-advantage-endgame` 和 `sd-3p-low-unit-extra`。继续训练前需要重新生成完整 2500 局 manifest。

## 后继任务

按以下顺序推进：

1. 运行规则和工程门槛：`npm run lint`、`npm test`、`npm run build`、`npm run apk:training-report -- --check`。
2. 对每个复制来源至少重放一局 episode，确认当前代码可以无差异重建 dataset。
3. 调整 feature 候选截断：截断到 64 个候选时必须保留 label action；补测试后重新统计保留率。
4. 重新生成完整 manifest：`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 -PrepareOnly`。
5. 利用 runner 的断点续跑完成 `sd-normal` 剩余 385 局和 `sd-medium-advantage-endgame` 剩余 77 局。
6. 运行剩余 11 个尚未启动的方案，共 1340 局。
7. 使用修正后的候选策略，为全部 19 个方案重新导出 dataset 和 feature；`sd-high-gold` 也需要补导出。
8. 全部 feature 验证通过后训练 BC 模型，再跑多 seed 正式回归、timeout 和动作分布报告。

最终模型训练前必须满足：19 个方案 episode 数量完整、所有 feature 位于统一标准目录、无 random 标签、非法动作和步数保护均为 0，并且 feature 丢样率已得到解释或修复。
