# SD 遭遇战 AI 训练交接文档

本文用于新对话直接接手 `C:\code\AncinetEmpires` 的 SD 遭遇战 AI 训练。接手者应先读本文，然后继续执行训练，不需要重新梳理历史讨论。

本文保留训练策略设计；本机产物的最新完成度、统一目录和后继任务以 `docs\training\CURRENT_TRAINING_STATUS.md` 为准。

## 当前结论

优先目标是训练 `SD` 遭遇战 AI，不混入战役最短回合目标。

当前最稳妥的训练标签来源是：

- `heuristic`
- `apk-like`
- 后续训练出的强 `bc` teacher

`random` 不再作为当前训练 AI 使用；只保留在测速、对照 benchmark、规则 smoke test 里。正式 SD 训练不使用 `random` 作为对手、teacher 或 dataset 标签来源，否则模型会学到随机移动、随机招募、随机待机，降低训练集质量。

因此当前推荐先使用不含 random 标签污染的 preset：

- 主推荐：`heuristic-apk-like-balanced`
- 对照或补充：`heuristic-vs-apk-like`、`apk-like-vs-heuristic`
- 快速 baseline：`apk-like`
- 禁用作为正式训练 preset：`random`、`*-vs-random`

`heuristic-apk-like-balanced` 会在 `heuristic` 和 `apk-like` 之间按 seed 和玩家顺序轮换，不引入 `random`，并减少 P0 固定 teacher 的位置偏差。

如果后续只做 benchmark，可以继续使用 random 对照；如果是训练数据生成，不要启用 random 相关 preset。

## 已实现能力

### 多线程训练

`tools\sd_training_plan_runner.ts` 已支持：

```powershell
--workers <n>
--progress-turn-interval <n>
--no-progress
--preset <name>
--max-turns <n>
--out-dir <dir>
```

推荐训练时使用：

```powershell
--workers 5 --progress-turn-interval 5
```

如果想每回合刷新进度：

```powershell
--progress-turn-interval 1
```

进度显示会原地刷新，内容包括：

- 总局数和已完成局数
- 每个 worker 当前局、回合、动作数
- 各阵营收入、招募消耗、击杀价值、损失价值

### 默认回合

`training_configs\sd_training_plan_20260705.json` 的默认 `maxTurns` 已改为 `200`。

注意：`max-turns=200` 的完整 AI 对战非常慢。实测二人图 `Icy Paths` 上，`heuristic` vs `apk-like` 两局就耗时超过 30 分钟。正式训练需要接受长时间运行，或先用 `apk-like`/较短回合生成快速样本。

### 可切换 AI preset

`tools\sd_training_plan_runner.ts` 当前 SD 正式训练只允许以下非 random preset：

```text
heuristic
apk-like
apk-like-vs-heuristic
heuristic-vs-apk-like
heuristic-apk-like-balanced
bc
bc-vs-heuristic
bc-hybrid
bc-hybrid-vs-heuristic
bc-blend
bc-blend-vs-heuristic
```

`tools\skirmish_training_runner.ts` 作为通用 benchmark/基线工具仍保留 random 相关 preset，但不要用于当前 SD 正式训练。

新增 AI 文件：

```text
C:\code\AncinetEmpires\src\game\ai\apk_like_ai.ts
```

`ApkLikeAI` 的当前设计：

- 尽量贴近 APK AI 的“先选单位，再选该单位动作”流程。
- 只评估候选单位相关动作，速度明显快于全动作评分。
- 复用 `HeuristicAI.scoreCandidateActions()` 批量评分，避免每个候选动作重复构建战术评估器。
- 已修复突击单位 `post_attack_move` 漏选问题。
- 已修复“己方城堡上的指挥官”判断，要求单位确实是 commander 且城堡归属为本队。

相关文件：

```text
C:\code\AncinetEmpires\src\game\ai\heuristic_ai.ts
C:\code\AncinetEmpires\src\game\ai\apk_like_ai.ts
C:\code\AncinetEmpires\tools\skirmish_training_runner.ts
C:\code\AncinetEmpires\tools\sd_training_plan_runner.ts
```

## 已测基准

### 单图 5 局速度对比

配置：

```text
地图 = SD:(2) Duel.aem
局数 = 每个策略 5 局
max-turns = 200
workers = 5
```

结果：

| 策略 | 总耗时 | 平均每局 |
| --- | ---: | ---: |
| `heuristic-vs-random` | `14.468s` | `2.894s` |
| `apk-like-vs-random` | `3.740s` | `0.748s` |

该结果说明 `apk-like` 决策更快，但 `*-vs-random` 不应直接作为高质量正式标签，除非过滤 random step。

### Heuristic vs ApkLike 对战基准

完整 `max-turns=200` 非常慢，30 分钟只完成 2 局 `SD:(2) Icy Paths.aem`，自然胜者均为 `heuristic`。

为了拿到完整对比，跑过一份 `max-turns=20` 的 10 张二人图 × 每图 2 局基准。注意这是“20 回合裁定胜率”，不是自然结束胜率。

结果：

| AI | 裁定胜场 | 裁定胜率 |
| --- | ---: | ---: |
| `heuristic` | `13/20` | `65%` |
| `apk-like` | `7/20` | `35%` |

自然结束只有 3 局，且均为 `heuristic` 胜。其余 17 局是回合上限后的 `adjudicatedWinnerAlliance` 裁定。

决策耗时：

| AI | 决策次数 | 总决策耗时 | 平均单次决策 | 最大单次决策 |
| --- | ---: | ---: | ---: | ---: |
| `heuristic` | `6686` | `1167.998s` | `174.693ms` | `3324.003ms` |
| `apk-like` | `5141` | `185.704s` | `36.122ms` | `809.169ms` |

`apk-like` 平均单次决策约快 `4.84x`。

结果文件：

```text
C:\code\AncinetEmpires\training_runs\benchmarks\sd_ai_duel_20260706_2p_t20\summary.json
C:\code\AncinetEmpires\training_runs\benchmarks\sd_ai_duel_20260706_2p_t20\episodes.csv
C:\code\AncinetEmpires\training_runs\benchmarks\sd_ai_duel_20260706_2p\summary.json
```

基准脚本：

```text
C:\code\AncinetEmpires\tools\skirmish_ai_duel_benchmark.ts
```

## 多阵营策略结论

曾讨论过的多阵营 random 混合设想：

```text
2 个阵营：heuristic + apk-like
3 个阵营：heuristic + apk-like + random
4 个阵营：heuristic + apk-like + random + apk-like
5 个阵营：heuristic + apk-like + random + random + apk-like
```

判断：

- 这个思路适合“制造复杂局面”。
- 当前不纳入正式训练策略。
- 核心原因是：dataset 导出目前会导出 episode 中所有 step，不能按 policy 排除 `random`。
- 如果 random step 进入标签，训练集质量会下降。

如果以后只做研究性尝试，必须先做下面任一项；在当前正式训练中不做：

1. 在 `tools\skirmish_dataset_export.ts` 增加参数，例如 `--include-policy heuristic --include-policy apk-like`。
2. 或在 episode 生成阶段标记 `trainablePolicy`，导出时只采样这些 policy。
3. 或生成 episode 后先过滤 JSONL，只保留非 random step，再导出 feature。

即使未来实现 policy 过滤，random 混合数据也只能作为研究性对照，不作为当前第一版正式训练主线。

当前执行版训练比例：

| 数据类型 | 局数 | 占比 | 说明 |
| --- | ---: | ---: | --- |
| 基础 normal/参数变体 | `800` | `32%` | 保留原地图 2P/3P/4P |
| 3P/4P 补充局 | `400` | `16%` | 提高真实多阵营覆盖 |
| 专项残局/建筑终结/兵种覆盖 | `1300` | `52%` | 2 阵营可控派生局面 |

当前策略：不使用 random 生成正式训练 episode，不使用 random 标签。

当前已经重新分配 2500 局训练计划，在不使用 `random` 训练 AI 的前提下提高真实多阵营比例：

| 实际活跃阵营 | 局数 | 占比 |
| --- | ---: | ---: |
| 2 阵营 | `1620` | `64.8%` |
| 3 阵营 | `440` | `17.6%` |
| 4 阵营 | `440` | `17.6%` |

实现方式：

- 基础 normal/参数变体局保留 `800` 局。
- 新增真实 3P/4P 地图补充局 `400` 局。
- 专项/残局派生局从 `1700` 局降到 `1300` 局，仍保持 2 阵营可控局面。
- `tools\sd_training_state_generator.ts` 已支持 `mapPlayerCounts`，可按地图名中的 `(2)/(3)/(4)` 筛选方案适用地图。

## 训练配置与生成器

训练配置：

```text
C:\code\AncinetEmpires\training_configs\sd_training_plan_20260705.json
```

训练方案 runner：

```text
C:\code\AncinetEmpires\tools\sd_training_plan_runner.ts
```

派生局面生成器：

```text
C:\code\AncinetEmpires\tools\sd_training_state_generator.ts
```

dataset 导出器：

```text
C:\code\AncinetEmpires\tools\skirmish_dataset_export.ts
```

feature 导出器：

```text
C:\code\AncinetEmpires\tools\skirmish_feature_export.ts
```

package scripts：

```powershell
npm run sd:training-plan
npm run train:skirmish:baseline
npm run export:skirmish:dataset
npm run export:skirmish:features
npm run train:skirmish:bc
```

## 回放清洗状态

回放清洗已完成，不要重新扫描全量 `captures`，除非用户明确要求重新做规则校验。

已执行：

```powershell
npm run sd:replay-clean -- --json
```

结果：

```text
forcedPassed = 112
strictPassed = 109
fullClean = 78
partialClean = 31
rejected = 3
```

输出目录：

```text
C:\code\AncinetEmpires\training_runs\replay_cleaning\sd_20260705
```

明确排除：

```text
065 game_get_20260704_132008_065.bin
078 game_get_20260704_132050_078.bin
097 game_get_20260704_132339_097.bin
```

禁止把 `065/078/097` 放入任何训练。

当前第一版训练可以先不使用真实回放。若后续加入玩家行为克隆，只能从以下 clean JSONL 开始：

```text
training_runs\replay_cleaning\sd_20260705\replay_full_clean.jsonl
training_runs\replay_cleaning\sd_20260705\replay_partial_clean.jsonl
```

`partial_clean` 只适合前缀动作监督，不适合作为完整胜负样本。

## 2500 局训练方案

已生成完整 job manifest：

```powershell
npm run sd:training-plan -- --json
```

结果：

```text
selectedJobs = 2500
smokeChecked = 308
smokeFailed = 0
```

输出：

```text
C:\code\AncinetEmpires\training_runs\sd_training_plan_20260705\jobs.jsonl
C:\code\AncinetEmpires\training_runs\sd_training_plan_20260705\prepare_report.md
```

注意：如果用 `--limit-jobs` 做短验证，可能覆盖 `jobs.jsonl` 和 `prepare_report.md`。验证后必须重新执行：

```powershell
npm run sd:training-plan -- --json
```

完整计划分布：

| 方案 ID | 训练方案 | 规模 |
| --- | --- | ---: |
| `sd-normal` | 正常对局 | `400` |
| `sd-low-gold` | 低金币正常局 | `100` |
| `sd-high-gold` | 高金币正常局 | `100` |
| `sd-low-unit-limit` | 低人口局 | `100` |
| `sd-high-unit-limit` | 高人口局 | `100` |
| `sd-3p-normal-extra` | 三阵营正常局补充 | `160` |
| `sd-3p-high-gold-extra` | 三阵营高金币补充 | `60` |
| `sd-3p-low-unit-extra` | 三阵营低人口补充 | `60` |
| `sd-4p-normal-extra` | 四阵营正常局补充 | `80` |
| `sd-4p-high-gold-extra` | 四阵营高金币补充 | `40` |
| `sd-small-advantage-endgame` | 小优势残局 | `140` |
| `sd-medium-advantage-endgame` | 中优势残局 | `140` |
| `sd-large-advantage-endgame` | 大优势残局 | `120` |
| `sd-small-disadvantage-endgame` | 小劣势残局 | `100` |
| `sd-medium-disadvantage-endgame` | 中劣势残局 | `80` |
| `sd-equal-preset-units` | 势力相等预设兵种局 | `220` |
| `sd-high-tier-specialist` | 高阶兵种专项局 | `180` |
| `sd-skill-specialist` | 技能专项局 | `160` |
| `sd-building-finish` | 建筑终结专项局 | `160` |

feature 固定参数：

```text
featureDim = 4096
maxCandidates = 64
featureExtractor = hashed-action-v2
```

## 当前推荐训练流水线

第一阶段建议使用 `heuristic-apk-like-balanced`，因为它不包含 random 标签，并且会在 `heuristic` / `apk-like` 之间换边，减少 P0 位置偏差。为了避免覆盖旧输出，run name 要带 preset。

### 推荐一键脚本

其他设备 clone 项目并准备好 `APK\_analysis\unpack` 后，优先使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1
```

只验证训练计划，不启动长时间训练：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 -PrepareOnly
```

只跑少数方案做短验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sd_train_all.ps1 -Plans sd-normal -SkipModelTraining
```

### 逐方案训练命令

推荐从 `sd-normal` 开始，跑完一个方案就立刻导出 dataset 和 feature。

```powershell
$Preset = "heuristic-apk-like-balanced"
$RunName = "sd_training_plan_20260705_$Preset"

$Plans = @(
  "sd-normal",
  "sd-low-gold",
  "sd-high-gold",
  "sd-low-unit-limit",
  "sd-high-unit-limit",
  "sd-3p-normal-extra",
  "sd-3p-high-gold-extra",
  "sd-3p-low-unit-extra",
  "sd-4p-normal-extra",
  "sd-4p-high-gold-extra",
  "sd-small-advantage-endgame",
  "sd-medium-advantage-endgame",
  "sd-large-advantage-endgame",
  "sd-small-disadvantage-endgame",
  "sd-medium-disadvantage-endgame",
  "sd-equal-preset-units",
  "sd-high-tier-specialist",
  "sd-skill-specialist",
  "sd-building-finish"
)

foreach ($Plan in $Plans) {
  $EpisodeDir = "training_runs\episodes\$RunName"
  $DatasetDir = "training_runs\datasets\$RunName"
  $FeatureDir = "training_runs\features\$RunName"
  $Episode = "$EpisodeDir\$Plan-episodes.jsonl"
  $Dataset = "$DatasetDir\$Plan-dataset.jsonl"
  $Feature = "$FeatureDir\$Plan-f4096-c64.jsonl"

  Write-Host "开始训练方案: $Plan preset=$Preset"

  node --openssl-legacy-provider --import tsx tools/sd_training_plan_runner.ts `
    --plan-id $Plan `
    --run `
    --preset $Preset `
    --out-dir $EpisodeDir `
    --workers 5 `
    --progress-turn-interval 5 `
    --json
  if ($LASTEXITCODE -ne 0) { throw "训练失败: $Plan" }

  npm run export:skirmish:dataset -- `
    --input $Episode `
    --out $Dataset `
    --sd-training-plan training_configs\sd_training_plan_20260705.json `
    --json
  if ($LASTEXITCODE -ne 0) { throw "dataset 导出失败: $Plan" }

  npm run export:skirmish:features -- `
    --input $Dataset `
    --out $Feature `
    --feature-dim 4096 `
    --feature-extractor hashed-action-v2 `
    --max-candidates 64 `
    --json
  if ($LASTEXITCODE -ne 0) { throw "feature 导出失败: $Plan" }

  Write-Host "完成方案: $Plan"
}
```

如果训练时间太长，可以先把 `$Plans` 改成：

```powershell
$Plans = @("sd-normal")
```

如果只想观察更细进度，把：

```powershell
--progress-turn-interval 5
```

改成：

```powershell
--progress-turn-interval 1
```

### 第二阶段可选补充

为减少 P0 位置偏差，可以再跑一套反向 preset：

```powershell
$Preset = "apk-like-vs-heuristic"
$RunName = "sd_training_plan_20260705_$Preset"
```

这套数据速度可能更快，但 teacher 强度预计低于 `heuristic-vs-apk-like`。建议先跑 `sd-normal` 做对比，不要立刻全量跑。

注意：如果主 preset 使用 `heuristic-apk-like-balanced`，通常不需要立即全量再跑反向 preset；它已经在单个 run 内按 seed 轮换了 P0 teacher。

### 已禁用的训练命令

以下命令不再允许用于 `npm run sd:training-plan` 的正式训练，因为会引入 random 训练 AI：

```powershell
--preset apk-like-vs-random
--preset heuristic-vs-random
```

正式训练不要使用 random 对局。如果只是做测速或强弱对照，请使用 benchmark 脚本，不要把输出导入正式训练 dataset。

## feature 汇总训练命令形态

所有 feature 生成后，用 `sd-normal` 作为主训练文件，其他方案作为自然混合 extra train。不要使用 `--extra-train-repeat 2` 放大专项数据。

命令形态：

```powershell
$RunName = "sd_training_plan_20260705_heuristic-apk-like-balanced"

npm run train:skirmish:bc -- `
  --train "training_runs\features\$RunName\sd-normal-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-low-gold-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-high-gold-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-low-unit-limit-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-high-unit-limit-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-3p-normal-extra-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-3p-high-gold-extra-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-3p-low-unit-extra-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-4p-normal-extra-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-4p-high-gold-extra-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-small-advantage-endgame-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-medium-advantage-endgame-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-large-advantage-endgame-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-small-disadvantage-endgame-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-medium-disadvantage-endgame-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-equal-preset-units-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-high-tier-specialist-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-skill-specialist-f4096-c64.jsonl" `
  --extra-train "training_runs\features\$RunName\sd-building-finish-f4096-c64.jsonl" `
  --feature-dim 4096 `
  --feature-extractor hashed-action-v2 `
  --max-candidates 64 `
  --out "training_runs\models\sd-bc-f4096-c64-$RunName.json" `
  --json
```

## 训练质量检查

正式训练前后至少看：

1. `illegalActionCount` 必须为 0。
2. `stoppedByMaxSteps` 必须为 0。
3. timeout 不应靠盲目拉长 `max-turns` 掩盖。
4. 高阶兵种、技能动作、建筑终结动作必须有样本覆盖。
5. 不要把 `20 回合裁定胜率` 当成自然胜率。
6. 正式训练 episode 不应包含 random policy。
7. 每个 preset 输出目录必须独立，避免覆盖 episode/dataset/feature。

需要重点统计：

```text
policy
actorUnitClass
actionType
targetUnitClass
recruit.unitClass
timeout
stoppedByMaxSteps
illegalActionCount
incomeValue
spentValue
killValue
lostValue
```

## 禁止事项

- 不要把 `065/078/097` 放入训练。
- 不要重新扫描未清洗 `captures`。
- 不要把 `SO` 混入正式 `SD` 训练，除非明确是在做对战 benchmark。
- 不要把战役最短回合目标混入 SD 遭遇战训练。
- 不要使用 random 作为正式训练 AI。
- 不要让 random 标签进入正式训练 dataset。
- 不要把 `max-turns=20` 的裁定结果写成真实胜率。
- 不要用短验证命令覆盖完整 manifest 后忘记恢复。
- 不要把 full dataset 当长期保存对象；长期保留 feature 和模型即可。

## 新对话开场提示

把下面这段发给新对话即可：

```text
请阅读 C:\code\AncinetEmpires\docs\training\SD_TRAINING_STRATEGY_HANDOFF.md 和 C:\code\AncinetEmpires\docs\training\CURRENT_TRAINING_STATUS.md，然后继续 SD 遭遇战 AI 训练。

当前状态：
1. 只做 SD 遭遇战 AI 训练，不做战役最短回合。
2. 训练计划在 training_configs\sd_training_plan_20260705.json，默认 maxTurns=200。
3. 多 worker、原地进度刷新、收入/招募/击杀/损失统计已经实现。
4. 已新增 ApkLikeAI，SD 正式训练可用 preset 包括 heuristic-apk-like-balanced、heuristic-vs-apk-like、apk-like-vs-heuristic、apk-like 等；不要使用 random 相关 preset。
5. 当前正式推荐先跑 heuristic-apk-like-balanced，因为没有 random 标签污染，并且会按 seed 换边减少 P0 位置偏差。
6. random 不再作为当前训练 AI；只可用于 benchmark/对照，不得导入正式训练 dataset。
7. 2500 局计划已重新分配为 2P=1620、3P=440、4P=440，jobs 已生成过，smokeFailed=0；如果被 limit-jobs 覆盖，重新执行 npm run sd:training-plan -- --json。
8. 回放已清洗，065/078/097 已 rejected，不要重新加入训练。
9. feature 固定使用 featureDim=4096、maxCandidates=64、featureExtractor=hashed-action-v2。
10. 每个 preset 必须用独立 RunName 和 out-dir，避免覆盖旧数据。

请优先使用 tools\sd_train_all.ps1 跑 episode -> dataset -> feature -> BC 模型训练。也可以从 sd-normal 开始使用文档中的逐方案训练命令；跑完一个方案就导出 feature，不要等全部 episode 跑完；新增的 sd-3p-* 和 sd-4p-* 补充方案也要跑。
```
