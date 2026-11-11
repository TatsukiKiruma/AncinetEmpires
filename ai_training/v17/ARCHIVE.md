# V16 审核存档与恢复说明

## 文档修订与原存档边界（2026-09-26）

V17尚未执行。本次只读评估 `C:\code\AncinetEmpires-100pct` 的BattleSearchAI后，新增 `BATTLESEARCH_TEACHER_REVIEW.md` 和 `V17_B100_TEACHER_ADDENDUM.md`，并修订任务书/启动说明/README为r2。评估文档保存外部HEAD、原始记录路径、SHA及逐局重算结论；没有复制或修改外部训练产物，也未运行新训练/对战。

**下述V16目录与zip保持原样，是r2之前的历史快照；包内V17任务文档不是最新执行版本。** 恢复V16证据仍按原manifest；执行后继任务以当前 `v17/V17_TASKBOOK.md` + `v17/V17_B100_TEACHER_ADDENDUM.md` 为准。分发新任务时一并携带本次评估与启动说明，不用新结论覆盖历史报告或旧压缩包。

## 存档位置

- 证据目录：`v17/archive/v16_20260926_core_reviewed/`
- 同内容压缩包：`v17/archive/v16_20260926_core_reviewed.zip`
- 完整文件索引：目录内 `archive_manifest.json`
- 本次审核：`v17/V16_AUDIT.md`；后继任务：`v17/V17_TASKBOOK.md`

这是一份**精选证据和模型快照，附全部V16运行文件SHA索引**，不是把约4.9GB原始数据全部重新复制的自包含包。V16原目录完整保留，没有删除、移动或覆盖。

## 包内内容

`payload/`保留仓库相对路径，包含：

- 原执行报告、task_status、progress、模型卡、身份manifest及原任务书。
- 小型JSON/JSONL证据，包括正式逐局games、可容纳的反事实/汇总记录。
- P1三个seed的final权重与训练state，以及所选的小型训练元数据/其他权重。
- 审核时当前游戏运行源码、Python训练/导出代码、V16工具，以及V17审核脚本、结果和任务文档。
- 每个V16原始文件的路径、大小、SHA256、是否内嵌；超过大小阈值的JSONL数据/ledger保留外置引用。

**源码快照是审核时的工作区状态。** manifest另列与V16原冻结清单相比的差异，不能把当前快照冒充已经证明的历史执行源码。对手/规则新执行前仍需重新冻结实际身份。

## 结论标签

- 总体：`PARTIAL_EXECUTION / NO_PROMOTION`。
- 最佳纯模型：P1:s2026，DEV20 **5/20**，未执行独立确认。
- 原T16-04数据PASS已被审核否定；旧88%验证准确率受已见输入影响。
- 搜索S1c两轮配置未实际生效；原相关因果结论不可沿用。
- 目标仍为纯模型独立20局≥18胜，归档不表示训练目标完成。

## 恢复方法

1. 解压到一个新目录；不要直接覆盖当前共享工作区。
2. 根据 `archive_manifest.json` 验证内嵌文件SHA；复用外置数据前也核对SHA。
3. 大数据仍位于 `C:\code\AncinetEmpires\v16\out\v16_20260926_core\`。若迁移机器，按manifest把所有非内嵌payload另行复制；缺少它们时不能精确恢复训练。
4. 仅推理开发冠军，可使用包内对应 `P1_final.json`，沿用26/20/53、2blocks、GAP=false的兼容推理及稳定候选排序。
5. 精确恢复训练还需要同一数据、split、优化器/调度器/RNG状态与完整命令；修复去重后数据改变，应新run warm start，不能称旧run精确续训。
6. 后继执行从 `V17_AGENT_START.md` 开始，不能直接照搬旧resume中的反斜杠PowerShell命令。

## 本次复算命令

在仓库根目录执行，输出只写V17审核目录：

```powershell
python v17/review/audit_v16.py
& 'C:\Users\SHIINA\AppData\Local\Programs\Python\Python312\python.exe' v17/review/evaluate_clean_val.py
node --openssl-legacy-provider v12/tools/run-tool.mjs v17/review/probe_teacher_rounds.ts
```

归档脚本 `v17/review/archive_v16.py` 首次运行生成目录与zip；目标存在即拒绝覆盖。它记录原始证据与审核结论，未修改生产模型。
