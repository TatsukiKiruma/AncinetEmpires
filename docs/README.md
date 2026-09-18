# 项目文档索引

根目录只保留项目入口 `README.md`。其余文档按职责归档如下。

## 训练

- [`training/CURRENT_TRAINING_STATUS.md`](training/CURRENT_TRAINING_STATUS.md)：本机训练产物、完整性结论和后继任务的唯一当前清单。
- [`training/TRAINING_HANDOFF_GUIDE.md`](training/TRAINING_HANDOFF_GUIDE.md)：规则对齐后的训练交接流程。
- [`training/SD_TRAINING_STRATEGY_HANDOFF.md`](training/SD_TRAINING_STRATEGY_HANDOFF.md)：2500 局 SD 训练方案、策略和命令参考。
- [`training/远古帝国AI训练规则整理.md`](training/远古帝国AI训练规则整理.md)：AI 训练规则手册。

## APK 规则与反编译分析

- [`apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md`](apk-analysis/APK_RULE_ALIGNMENT_HANDOFF.md)：APK 规则对齐和回放门槛的当前交接文档。
- [`apk-analysis/APK规则分析-4.2.5.1.md`](apk-analysis/APK规则分析-4.2.5.1.md)：APK 4.2.5.1 规则总览。
- [`apk-analysis/OPENCODE_APK_Project_Rules_Comparison.md`](apk-analysis/OPENCODE_APK_Project_Rules_Comparison.md)：APK 与项目规则对比入口。
- 其余 GLM、OPENCODE 和专项分析统一保存在 `apk-analysis/`。

## 项目背景

- [`project/远古帝国AI训练项目上下文.md`](project/远古帝国AI训练项目上下文.md)：项目背景和历史上下文。
- [`project/远古帝国1-6步开发修改Prompt.md`](project/远古帝国1-6步开发修改Prompt.md)：历史开发 Prompt。
- [`project/plan.md`](project/plan.md)：原项目计划。

## 参考与归档

- `reference/`：表格等原始参考资料。
- `archive/`：不再作为当前入口的历史文档。

`training_runs/` 是本机大文件产物目录，已被 Git 忽略；不要把其中的 JSONL 当作仓库文档入口，也不要未经校验直接删除归档副本。
