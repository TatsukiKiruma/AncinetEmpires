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
3. 逐行读取 episode，逐步重放并直接写 compact feature。
4. 按 episode 哈希切分 train/validation，避免同一局跨集合泄漏。
5. 每 50000 个样本滚动一个分片。
6. 写入源文件哈希、生成参数、Git commit、分片哈希和统计信息。
7. 校验 manifest、分片哈希、样本数、标签候选和 split 泄漏。
8. BC 训练器直接读取 manifest 中的全部训练和验证分片。

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

任一输入或参数变化都会产生新 ID 和新目录。已有同 ID 目录不会被覆盖；若上次运行中断并留下 `.partial` 文件，校验器会判定失败，应先保留现场确认原因，再决定是否移入归档目录。

模型会记录训练数据集 ID。后续评估结果应同时记录模型文件哈希和数据集 manifest 路径，避免不同数据版本混用。
