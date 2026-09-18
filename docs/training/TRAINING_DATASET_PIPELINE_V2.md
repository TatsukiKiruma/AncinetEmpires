# 训练数据集流水线 v2

## 结论

新流水线以 episode JSONL 为唯一可重放源，直接生成 compact feature 分片，不再生成或长期保存 full dataset。

现有数据的处理原则：

- 已完成且能重放的 episode 不需要重新生成。它们可以直接进入新导出器，包括旧 timeout 局；新导出器会保留可信前缀并丢弃 timeout 尾部。
- 尚未完成的 episode job 继续补跑，不需要为了轻量 Env、合法动作复用或新 manifest 推倒重跑。
- 旧 feature 需要重新导出，才能获得 v3 特征、分层/hard-negative 候选、样本配额、重标注、train/validation 切分和版本元数据。
- 旧 full dataset 不需要重新生成。新数据集验证通过后，可只保留 episode、feature 分片、manifest 和模型。
- 停滞早停只影响后续 episode 生成；旧 episode 仍可重放，导出时会按其原始终止信息处理。

## 默认正式流水线

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1
```

只生成不可变 job manifest：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 -PrepareOnly
```

先跑单个方案并跳过模型训练：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 `
  -Plans sd-normal `
  -SkipModelTraining
```

脚本现在执行：

1. 生成内容寻址、只读复用的 job manifest。
2. 续跑缺失 episode；已存在的 `scenario + seed` 不重复生成。
3. 按输入顺序预分配全局样本配额，每 10 局一个 checkpoint，由常驻 worker 并行重放并直接写 compact feature。
4. 按 episode 哈希切分 train/validation，避免同一局跨集合泄漏。
5. 每个 checkpoint 内按 50000 个样本上限滚动分片，最终 manifest 按输入批次顺序引用所有分片。
6. 写入源文件哈希、生成参数、Git commit、分片哈希和统计信息。
7. 校验 manifest、分片哈希、样本数、标签候选和 split 泄漏。
8. BC 训练器直接读取 manifest 中的全部训练和验证分片。

### 并行、暂停与继续

`-Workers` 默认同时控制对战生成和特征导出的并行度，也可用 `-FeatureWorkers` 单独指定特征导出进程数。每个进程连续处理多个批次，复用模块及地图缓存。

```powershell
.\tools\sd_train_all.ps1 -Workers 4 -FeatureWorkers 2 -SkipModelTraining
```

`-BatchEpisodes` 默认 10，首次运行时可调整。`-StopAfterFeatureBatches 1` 会在完成一个新 checkpoint 后暂停，适合小批验证；以后去掉该参数执行原命令即可继续。按 Ctrl+C 停止会保留完整 checkpoint，中断批次的半成品会在恢复时移入 `interrupted/` 后重算。完成后重跑会验证并复用最终 manifest。

全局配额由主进程按原串行文件、episode、step 顺序预先计算；worker 继承各批次的配额前缀，所以调整 worker 数量、完成顺序或暂停次数不会改变入选样本、标签、候选及 train/validation 归属。分片边界与旧单体导出不同。

只导出已有棋谱时使用 `npm run export:skirmish:checkpoint-features -- --input <episode.jsonl> --plan <训练计划.json> --workers 4 --out-root <输出目录>`；可重复传入 `--input`，文件顺序应与原正式脚本一致。这个通用入口复用旧迁移器，默认参数沿用旧迁移器（每局 300 条、每分片 5000 条、仅重标注 apk-like），正式脚本会显式传入每局 800 条、每分片 50000 条及原有策略参数。

新版正式导出的数据集 ID 包含实际引擎、教师和特征生成源码指纹，未提交的相关代码变化也会建立新目录。旧的单体 feature 不会自动拼入 checkpoint；它们及原 episode 均保持原样。旧 `migrate_old_training_data.ps1` 的默认迁移 ID 保持兼容，已有完成批次仍可通过原命令续跑。

## 关键默认值

| 项目 | 默认值 |
| --- | ---: |
| 停滞早停最短观察回合 | 40 |
| 连续停滞回合 | 24 |
| timeout 最长保留前缀 | 80 回合 |
| timeout 尾部剔除 | 20 回合 |
| 单 episode 样本配额 | 800 |
| `move` 全局配额 | 400000 |
| `wait` 全局配额 | 200000 |
| 每样本候选上限 | 64 |
| hard-negative 比例 | 0.5 |
| feature 版本 | `hashed-action-v3` |
| validation 比例 | 0.1 |
| 每分片样本数 | 50000 |

候选动作始终保留最终标签。其余候选由教师高分 hard negatives 和动作类型分层共同组成，不再使用“合法动作列表前 64 个”的位置偏置。

正式脚本会对 `apk-like` 标签启用浅层 fast-rollout 重标注；直接使用导出 CLI 时，默认只重标注 `random`。被替换的样本会保留原动作、重标注方法和分差，便于审计。

## 直接导出与验证

```powershell
npm run export:skirmish:episode-features -- `
  --input training_runs\episodes\run\sd-normal-episodes.jsonl `
  --sd-training-plan training_configs\sd_training_plan_20260705.json `
  --artifact-root training_runs\feature_datasets\run `
  --dataset-version sd-feature-v3 `
  --feature-dim 4096 `
  --feature-extractor hashed-action-v3 `
  --max-candidates 64 `
  --max-samples-per-episode 800 `
  --validation-ratio 0.1 `
  --shard-samples 50000
```

```powershell
npm run validate:skirmish:features -- `
  --manifest training_runs\feature_datasets\run\<dataset-id>\manifest.json
```

```powershell
npm run train:skirmish:bc -- `
  --dataset-manifest training_runs\feature_datasets\run\<dataset-id>\manifest.json `
  --feature-dim 4096 `
  --feature-extractor hashed-action-v3 `
  --max-candidates 64 `
  --out training_runs\models\sd-bc-v3.json
```

## 不可变性和版本规则

数据集 ID 由以下内容共同决定：

- 数据集版本名；
- episode 和训练计划文件的绝对路径、字节数及 SHA-256；
- feature、候选采样、timeout、配额、重标注、分片和 split 参数。
- 正式 checkpoint 导出的生成源码指纹；worker 数量和主动暂停参数不参与 ID。

任一参与 ID 的输入或参数变化都会产生新 ID 和新目录。正式 checkpoint 导出会验证并复用完整批次，自动归档没有 manifest 的中断批次；普通单体 `export:skirmish:episode-features` 仍拒绝覆盖已有同 ID 目录，留下 `.partial` 文件时需要先保留现场确认原因，再决定是否归档。

模型会记录训练数据集 ID。后续评估结果应同时记录模型文件哈希和数据集 manifest 路径，避免不同数据版本混用。
