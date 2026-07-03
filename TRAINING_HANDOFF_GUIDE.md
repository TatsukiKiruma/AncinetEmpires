# AncientEmpires AI 训练交接指南

本文档用于下一次在 macOS 平台继续 AncientEmpires 的 SD skirmish AI 训练任务。新对话请先阅读本文件，再继续工作。

## 1. 基本约定

- 所有沟通使用中文。
- 新增代码注释使用中文。
- 不要修改 `demo` 目录。
- 不要回滚用户或前序对话留下的未提交改动。
- 工作区可能是 dirty 状态，新对话第一步必须先看 `git status --short`。
- Windows 原路径是 `C:/code/AncinetEmpires`；macOS 上请以实际 clone 路径为准，例如：

```bash
cd /path/to/AncinetEmpires
```

下面命令默认使用 macOS / zsh 风格路径。若本地 `python` 不存在，请改用 `python3`。

## 2. 当前阶段一句话

v2/global-noheurcut 仍是当前安全基线；v3 特征链路已经打通，但本轮追加的残局/高阶兵种 curated 数据没有通过回归，不应直接扩大或作为默认模型。

## 3. 已完成工作

已完成：

- 复用现有 dataset 导出 `hashed-action-v3` 特征。
- 训练基础 v3 模型。
- 追加一小批残局/高阶兵种定制数据。
- 用 `seed19000`、`seed23000`、三张热点图 9 局做回归。
- 生成 timeout 终局聚焦报告和回归决策报告。
- `npm run lint` 通过。
- `npm test -- --run` 通过，20 个测试文件、340 个测试。

新增/扩展的主要工具：

- `tools/skirmish_bc_train.ts`
  - 支持 `hashed-action-v3`。
  - 支持 `--extra-train`。
  - 支持 `--extra-train-repeat`。
- `tools/skirmish_feature_export.ts`
  - 支持 v3 feature 导出。
- `tools/skirmish_distill_export.ts`
  - 支持 v3 distill feature 导出。
- `tools/skirmish_curated_feature_export.ts`
  - 新增 curated 残局/高阶兵种样本导出。
- `tools/skirmish_timeout_focus_report.ts`
  - 新增 timeout 终局聚焦报告。
- `tools/skirmish_eval_action_report.py`
  - 用于动作分布和评估报告。

`package.json` 已有相关脚本：

```bash
npm run export:skirmish:dataset
npm run export:skirmish:features
npm run export:skirmish:distill
npm run export:skirmish:curated
npm run split:skirmish:dataset
npm run train:skirmish:bc
npm run train:skirmish:baseline
npm run report:skirmish:timeout
```

## 4. 当前安全基线

当前仍建议保留的安全基线是：

```text
bc-blend + global late-pressure + no heuristic getAction cut
```

核心模型：

```text
training_runs/models/skirmish-bc-apk-distill-v2-e25-f4096-c64-e5.json
```

正式 120 局表现：

| 模型 | seed19000 | seed23000 | 合计胜率 | 合计 timeout |
| --- | ---: | ---: | ---: | ---: |
| v2/global-noheurcut | 23/60, timeout 2 | 27/60, timeout 2 | 50/120 | 4 |

热点 9 局：

```text
timeout 3/9
```

这个版本不是强度突破，但它是当前最稳的可回退基线。

不要恢复这些失败路线：

- 修改 `HeuristicAI.getAction`，在后期强制低收益动作 `end_turn`。
- 只继续调 blend 权重。
- 只把 `max-turns` 从 150 拉到 180 或 250。
- 直接扩大本轮 curated 数据量。

## 5. v3 特征状态

v3 特征已经加入，目标是让模型看到更多“残局意识”和“目标导向”信息。

已经编码的方向包括：

- 回合区间。
- 军力差。
- 敌方剩余单位。
- 是否明显优势。
- 当前候选动作是否能攻击、占领、拆城、召唤。
- 移动后是否更接近敌城或敌指挥官。
- 是否低收益等待、治疗、无进展移动。

关键产物：

| 类型 | 路径 |
| --- | --- |
| v3 全量特征 | `training_runs/features/skirmish-sd-apk-distill-v3-e25-f4096-c64.jsonl` |
| v3 train split | `training_runs/features/skirmish-sd-apk-distill-v3-e25-train-f4096-c64.jsonl` |
| v3 val split | `training_runs/features/skirmish-sd-apk-distill-v3-e25-val-f4096-c64.jsonl` |
| 基础 v3 模型 | `training_runs/models/skirmish-bc-apk-distill-v3-e25-f4096-c64-e5.json` |

基础 v3 模型验证准确率：

```text
best val acc 58.625%
```

基础 v3 链路可保留，后续不需要从零重做导出链路，除非修改特征定义。

## 6. 本轮 curated 数据实验

本轮追加了一小批残局/高阶兵种定制数据：

```text
training_runs/features/skirmish-curated-v3-endgame-hightier-f4096-c64.jsonl
```

来源包括：

- seed19000 / seed23000 的 timeout 热点局。
- 既有训练集中的高阶兵种/召唤相关样本。

导出规模：

```text
exportedSamples 8422
endgameSamples 4000
highTierSamples 4000
summonSamples 1000
```

尝试过三种训练方式：

| 模型 | 训练方式 | 结果 |
| --- | --- | --- |
| curated repeat=10 | 全量 + curated 重复 10 次 | 验证集约 38%，过拟合，淘汰 |
| curated repeat=3 | 全量 + curated 重复 3 次 | 验证集仍约 38%，淘汰 |
| curated prepend | 每轮先跑 curated，再跑全量主集 | best val acc 58.642%，进入回归 |

当前回归模型：

```text
training_runs/models/skirmish-bc-apk-distill-v3-curated-prepend-e25-f4096-c64-e5.json
```

但该模型不应作为默认模型。

## 7. v3 curated 回归结论

正式 120 局对比：

| 模型 | seed19000 | seed23000 | 合计胜率 | 合计 timeout | 非法动作 | 步数保护 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 旧 v2/global-noheurcut | 23/60, timeout 2 | 27/60, timeout 2 | 50/120 | 4 | 0 | 0 |
| v3 curated prepend | 25/60, timeout 2 | 18/60, timeout 5 | 43/120 | 7 | 0 | 0 |

热点 9 局：

| 场景 | timeout |
| --- | ---: |
| `SD:(2) Liberty Port.aem` | 2/3 |
| `SD:(3) classic 2.aem` | 1/3 |
| `SD:(4) Crossroads.aem` | 0/3 |
| 合计 | 3/9 |

结论：

- `seed19000` 小幅改善。
- `seed23000` 明显回退。
- 正式总胜率从 50/120 降到 43/120。
- timeout 从 4 增到 7。
- 热点 9 局 timeout 只是刚好压线，没有安全余量。
- 暂不建议扩大当前同类 curated 数据量。

决策报告：

```text
training_runs/reports/skirmish-v3-curated-regression-decision.md
```

## 8. timeout 终局发现

报告：

```text
training_runs/reports/v3-curated-prepend-timeout-focus-report.md
```

关键结论：

- 7/8 个 timeout 终局中，裁定优势方之外已经没有存活单位，但仍未自然结束。
- 8/8 个 timeout 最后 25 回合没有 `capture` / `destroy_town`。
- 8/8 个 timeout 的最后选择点已经没有 `attack` / `capture` / `destroy` / `summon`。
- 问题不是最后一步选错，而是更早阶段没有把单位推向“清建筑/结束比赛”的目标。
- 残留目标主要是敌方或中立建筑，尤其集中在 `Liberty Port`。

重点场景继续保留：

```text
SD:(2) Liberty Port.aem
SD:(3) classic 2.aem
SD:(4) Crossroads.aem
```

## 9. 关于高阶兵种学习

如果训练对局里双方几乎没有召唤或使用高阶兵种，模型不能可靠学会高阶兵种使用。

原因很直接：

- 行为克隆只能学数据里出现过的行为分布。
- teacher-rank 也只能在候选动作和 teacher 偏好里学到相对排序。
- 如果高阶兵种样本稀少，模型最多学到零散相关性，不会形成稳定战术。

可以增加残局/高阶兵种训练集，也可以预先在地图上部署兵种后对战。这个方向是对的，但本轮 curated 数据说明：不能只是“多加样本”，还要让 oracle 更精确，否则会污染普通局面分布。

## 10. 下一步该做什么

下一轮不要直接扩大现有 curated 数据。建议做 v3.1，小范围修正后再回归。

优先任务：

1. 改 curated oracle
   - 只在优势方、敌方剩建筑或低价值单位时强推终局目标。
   - 明确奖励接近敌城、占领、拆城。
   - 明确惩罚远离目标、重复等待、无收益治疗、无进展移动。

2. 加终局反样本或 margin
   - 对 `wait` / `end_turn` / 无进展移动设置更低 teacher score。
   - 不靠重复正样本硬压模型。

3. 先只修 `Liberty Port`
   - 该图是最稳定 timeout 来源。
   - 先做小量可解释样本。
   - 热点 9 局 timeout 必须低于 3/9，再考虑正式 120 局。

4. 再考虑高阶兵种专门数据
   - 可以构造预部署局面或从 full observation dataset 筛选高阶单位局面。
   - 重点看高阶单位是否参与有效攻击、推进、守城、清建筑。
   - 不建议把高阶兵种样本和残局清建筑样本混成一个无差别大权重集合。

## 11. macOS 接续建议命令

先检查状态：

```bash
git status --short
npm run lint
npm test -- --run
```

阅读关键报告：

```bash
sed -n '1,220p' training_runs/reports/skirmish-v3-curated-regression-decision.md
sed -n '1,220p' training_runs/reports/v3-curated-prepend-timeout-focus-report.md
```

如果需要重跑 v3 curated 回归模型的热点 9 局：

```bash
npm run train:skirmish:baseline -- --mode SD \
  --scenario "SD:(2) Liberty Port.aem" \
  --scenario "SD:(4) Crossroads.aem" \
  --scenario "SD:(3) classic 2.aem" \
  --episodes 3 \
  --seed 25000 \
  --preset bc-blend-vs-heuristic \
  --model training_runs/models/skirmish-bc-apk-distill-v3-curated-prepend-e25-f4096-c64-e5.json \
  --workers 3 \
  --max-turns 150 \
  --out training_runs/diagnostics/v3-curated-prepend-hotspots-vs-heuristic-turn150-e3.jsonl \
  --no-temp-log \
  --no-progress \
  --json
```

如果要生成 timeout 聚焦报告：

```bash
npm run report:skirmish:timeout -- \
  --file seed19000=training_runs/skirmish-bc-blend-v3-curated-prepend-vs-heuristic-sd-e3-seed19000.jsonl \
  --file seed23000=training_runs/skirmish-bc-blend-v3-curated-prepend-vs-heuristic-sd-e3-seed23000.jsonl \
  --file hotspot=training_runs/diagnostics/v3-curated-prepend-hotspots-vs-heuristic-turn150-e3.jsonl \
  --out training_runs/reports/v3-curated-prepend-timeout-focus-report.md \
  --tail-turns 25 \
  --json
```

如果要重新生成动作分布报告：

```bash
python3 tools/skirmish_eval_action_report.py \
  --file seed19000=training_runs/skirmish-bc-blend-v3-curated-prepend-vs-heuristic-sd-e3-seed19000.jsonl \
  --file seed23000=training_runs/skirmish-bc-blend-v3-curated-prepend-vs-heuristic-sd-e3-seed23000.jsonl \
  --out training_runs/reports/skirmish-bc-blend-v3-curated-prepend-final-report.md
```

## 12. 后续模型保留标准

新模型只有满足以下条件才值得保留：

- `npm run lint` 通过。
- `npm test -- --run` 通过。
- 正式 120 局总胜率高于 50/120，或者不低于 50/120 且 timeout 明显下降。
- 热点 9 局 timeout 低于 3/9；至少不能高于 3/9。
- 非法动作必须为 0。
- runner 步数保护停止必须为 0。
- 不能只在一个 seed 上改善，另一个 seed 明显回退。

如果只降低平均步数，但胜率和 timeout 不改善，不要当作强度提升。

## 13. 新对话开场提示

可以直接复制给新 Codex：

```text
请阅读 /path/to/AncinetEmpires/TRAINING_HANDOFF_GUIDE.md，然后继续 AncientEmpires 的 SD skirmish AI 训练任务。

当前状态：
1. v2/global-noheurcut 仍是安全基线，模型是 training_runs/models/skirmish-bc-apk-distill-v2-e25-f4096-c64-e5.json。
2. v3 feature 链路已经完成，基础 v3 可用。
3. 本轮 v3 curated-prepend 模型没有通过回归：正式 120 局 43/120、timeout 7，弱于旧基线 50/120、timeout 4。
4. 不要直接扩大当前 curated 数据量。
5. 下一步做 v3.1：改残局 oracle、加 wait/end_turn/无进展移动反样本，先聚焦 Liberty Port。
6. 开始前先运行 git status --short、npm run lint、npm test -- --run。
```
