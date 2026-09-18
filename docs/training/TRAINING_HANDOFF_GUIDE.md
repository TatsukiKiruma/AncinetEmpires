# AncientEmpires 训练交接指南

本文用于新对话继续 `C:\code\AncinetEmpires` 的 SD skirmish AI 训练工作。当前规则刚完成一轮 APK 对齐，训练任务的优先级是先建立新的规则稳定基线，再重新生成训练数据和模型。

当前本机训练产物的实际完成情况，以 `docs\training\CURRENT_TRAINING_STATUS.md` 为准。

## 基本约定

- 项目路径：`C:\code\AncinetEmpires`
- 沟通使用中文。
- 新增代码注释使用中文。
- UI 文案默认中文。
- 不要回滚用户或前序对话留下的未提交改动。
- 新对话开始先运行 `git status --short`。
- `training_runs/` 很大且被忽略，不要随手删除。

## 当前训练结论

旧训练数据和旧模型都应视为“规则对齐前产物”。它们仍可作为历史参考，但不适合作为新规则下的最终模型。

原因：

- APK 规则已经修复多处关键差异，包括治疗、墓碑、pending 招募、光环、突击后移动、回放动作展开、地形语义和训练 observation 字段。
- 旧数据是在旧规则下生成的，包含旧规则行为分布。
- 如果直接继续训练旧数据，模型会学习到已经过期的状态转移和动作偏好。

当前不建议直接扩大旧 curated 数据，也不建议继续沿用旧 v3 curated-prepend 结论作为新规则下判断。

## 训练前置门槛

训练前先确认 APK 规则门槛：

```powershell
npm run lint
npm test
npm run build
npm run apk:language-rule-report -- --check
npm run apk:skirmish-rule-report -- --check
npm run apk:unit-report -- --check
npm run apk:terrain-report -- --check
npm run apk:script-report -- --check
npm run apk:map-report -- --check
npm run apk:dex-report -- --check
npm run apk:training-report -- --check
```

回放门槛：

- forced 现有 112 个唯一 APK 回放必须保持全通过。
- strict 剩余 065/078/097 不作为训练阻塞。
- 目标 120 个唯一回放还缺 8 个样本；补样后再复跑 forced。

参考文档：

```text
docs\apk-analysis\APK_RULE_ALIGNMENT_HANDOFF.md
docs\training\CURRENT_TRAINING_STATUS.md
```

## 当前安全参考模型

历史安全参考仍是：

```text
training_runs\models\skirmish-bc-apk-distill-v2-e25-f4096-c64-e5.json
```

历史表现：

```text
v2/global-noheurcut：正式 120 局 50/120，timeout 4，非法动作 0，步数保护 0。
```

注意：这是旧规则下的参考模型，不代表新规则下仍是最优模型。它只能用于训练流程 sanity check 或历史对比。

旧 v3 curated-prepend 模型不应作为默认模型：

```text
training_runs\models\skirmish-bc-apk-distill-v3-curated-prepend-e25-f4096-c64-e5.json
```

旧回归结果：

```text
43/120，timeout 7，弱于 v2 参考。
```

## 重新训练推荐流程

### 1. 固定规则基线

先不要改训练逻辑，确认当前规则门槛全部通过。

```powershell
git status --short
npm run lint
npm test
npm run build
npm run apk:training-report -- --check
```

如果这些失败，先修规则或报告，不要开始训练。

### 2. 重新生成 episode/dataset

旧 `training_runs/datasets` 体积很大，先不要删除。新数据建议使用带日期或规则版本的新文件名，避免覆盖旧产物。

建议命名包含：

```text
apk-rules-20260705
```

例如：

```text
training_runs\datasets\skirmish-sd-apk-rules-20260705-episodes.jsonl
training_runs\datasets\skirmish-sd-apk-rules-20260705-dataset.jsonl
training_runs\features\skirmish-sd-apk-rules-20260705-distill-f4096-c64.jsonl
training_runs\models\skirmish-bc-apk-rules-20260705-f4096-c64-e5.json
```

### 3. 先跑小规模 smoke

不要一开始就跑完整大训练。先做小规模：

- 少量 episode。
- 少量地图。
- 少量 seed。
- 验证导出、切分、训练、runner 都还能跑。

### 4. 再跑正式训练

确认 smoke 通过后，再重新导出完整 distill feature、训练 BC ranker，并跑正式回归。

保留旧模型作为参考，但不要把旧规则下的胜负结果当成新规则模型结论。

## 已有训练工具链

`package.json` 中已有脚本：

```powershell
npm run train:skirmish:baseline
npm run eval:skirmish:baseline
npm run export:skirmish:dataset
npm run split:skirmish:dataset
npm run export:skirmish:features
npm run export:skirmish:distill
npm run export:skirmish:curated
npm run train:skirmish:bc
npm run report:skirmish:timeout
```

关键工具：

```text
tools\skirmish_training_runner.ts
tools\skirmish_dataset_export.ts
tools\skirmish_dataset_split.ts
tools\skirmish_feature_export.ts
tools\skirmish_distill_export.ts
tools\skirmish_distill_batch.py
tools\skirmish_bc_train.ts
tools\skirmish_curated_feature_export.ts
tools\skirmish_timeout_focus_report.ts
tools\skirmish_eval_action_report.py
```

`tools\skirmish_training_runner.ts` 支持：

```text
random
heuristic
heuristic-vs-random
bc
bc-vs-random
bc-vs-heuristic
bc-hybrid
bc-hybrid-vs-random
bc-hybrid-vs-heuristic
bc-blend
bc-blend-vs-random
bc-blend-vs-heuristic
```

## 新训练重点

新规则下建议先解决两个方向：

1. 终局推进
   - 旧模型容易在优势局里不清建筑、不占领、不结束比赛。
   - 重点关注 `Liberty Port`、`classic 2`、`Crossroads`。
   - 不要只靠延长 `max-turns` 掩盖 timeout。

2. 高阶兵种与召唤
   - 行为克隆只能学数据中出现过的行为。
   - 如果新规则下高阶兵种样本仍少，需要单独构造或筛选局面。
   - 不建议把高阶兵种样本和残局清建筑样本无差别混成高权重集合。

## 不建议继续的路线

- 不要修改 `HeuristicAI.getAction`，让它后期强制低收益 `end_turn`。
- 不要只调 blend 权重。
- 不要只把 `max-turns` 从 150 拉到 180 或 250。
- 不要直接扩大旧 curated 数据量。
- 不要在 forced 回放不稳定时开始重新训练。

## 新模型保留标准

新模型至少满足：

- `npm run lint` 通过。
- `npm test` 通过。
- APK 静态报告门槛通过。
- forced 回放主门槛保持通过。
- 非法动作为 0。
- runner 步数保护停止为 0。
- 正式多 seed 回归不能只在一个 seed 改善、另一个 seed 明显回退。
- timeout 不能明显高于参考模型。

建议正式比较仍用 120 局或更大样本，不要只看单 seed 或热点 9 局。

## 建议接续命令

新对话开始：

```powershell
git status --short
npm run lint
npm test
npm run build
npm run apk:training-report -- --check
```

读取 APK 状态：

```powershell
Get-Content docs\apk-analysis\APK_RULE_ALIGNMENT_HANDOFF.md -TotalCount 220
Get-Content docs\training\CURRENT_TRAINING_STATUS.md -TotalCount 260
```

读取旧训练报告作为历史参考：

```powershell
Get-Content training_runs\reports\skirmish-v3-curated-regression-decision.md -TotalCount 220
Get-Content training_runs\reports\v3-curated-prepend-timeout-focus-report.md -TotalCount 220
```

## 新对话开场提示

```text
请阅读 C:\code\AncinetEmpires\docs\training\TRAINING_HANDOFF_GUIDE.md、C:\code\AncinetEmpires\docs\training\CURRENT_TRAINING_STATUS.md 和 C:\code\AncinetEmpires\docs\apk-analysis\APK_RULE_ALIGNMENT_HANDOFF.md，然后继续 AncientEmpires 的 SD skirmish AI 训练任务。

当前状态：
1. APK forced 主门槛现有 112 个唯一回放全部通过。
2. strict 剩 065/078/097 三个诊断分歧；065/078 已确认为 mod，对训练不阻塞；097 不应改单位配置或伤害公式。
3. 旧训练数据和旧模型是 APK 规则对齐前产物，只能作为历史参考。
4. 下一步应先跑 lint/test/build/APK training report，确认规则稳定，再重新生成新规则下的数据和模型。
5. 不要直接扩大旧 curated 数据量，不要回滚用户改动。
```
