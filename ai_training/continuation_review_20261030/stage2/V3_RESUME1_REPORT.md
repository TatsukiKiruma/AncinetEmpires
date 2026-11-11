# 获批接续再次受阻：首次写入前期限耗尽

2026-10-30。依据协调者 `reviews/stage2-review-3.json` 正式执行repair3精确恢复，原生进程退出1，RUN_CLOSURE=failed。**在开始下一次优化之前出现新的心跳保存期限异常，真实新增更新/样本/离线预测/实战均为0。** 后两臂未启动，不重试、重开或重置预算，阶段二筛选仍未完成。

## 真实执行与范围

- 控制合同仍为 `2f2c10828fcced34e5ecba44c90bc24989a4a6a513905e84d9f0377012b5ff0b`；冻结V2科学/运行器原件不改。
- 执行批准文件SHA `a60ee34cc12a2e3def073512b6ae489b8af5a9840f6a68c6e4e256462c87dcab`，明确approved_to_run。
- 使用本机ROCm GPU、原独立D盘MIOpen缓存和相同科学配置，从精确原checkpoint `317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32` 开始。
- 输出 `D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4-v3-resume1`。未覆盖原失败目录或checkpoint，沿用原armId及原账本路径。
- 工具非沙箱执行获允许，不是自动审批拒绝；只监看普通进度/RESTORE、stderr及RUN_CLOSURE，进程退出后才读取闭合账本。
- GPU设备和模型恢复初始化已发生，但没有模型前向、样本请求或优化器更新；第一处循环ledger.check即拒绝。METRICS为0字节。

命令、缓存、工具会话及退出码见 [RESUME1_EXECUTION.json](RESUME1_EXECUTION.json)。

## 故障证据与结论边界

原始stderr/IO_EVENTS/闭合记录在新输出目录，另保留C盘小型快照 `revisions/v3-resume1-fault/`。

心跳在 `io_control.py:69` 进入atomic_save循环顶部时发现deadline已过，报告“暂时文件访问拒绝超过保存期限”；随后主线程 `train.py:131` 的ledger.check抛出HeartbeatFailure。IO_EVENTS仅1条heartbeat_failed，**sharing_retry为0，traceback没有PermissionError cause或WinError5**。此分支位于attempts首次增加和序列化/替换尝试之前，不能据该错误文案断言再次发生文件锁拒绝。

错误发生在初始化期间，完整批次数仍7758，deferredHeartbeats=0。它不是上一轮R4“正常优化持锁被误判”的同一分支。可能涉及线程/GIL调度或目录/唯一临时名准备耗时，但没有足够证据确定具体来源；下一步需审查首次实际写入前即超时的计时语义。本轮没有擅自修代码、放宽期限或吞掉故障。

收尾另记录 `encoder.close: RuntimeError('编码进程失败：1')`，encoder.stderr为空。它作为附加收尾错误保留，未覆盖原始HeartbeatFailure，不能解释为坏标签或游戏运行错误。

## 最后完整状态与预算

| 项目 | 当前记录 |
|---|---|
| 完整位置 | 7758更新／62064样本，globalStep249657 |
| 原checkpoint | 原317e3bf8…、recoveryAllowed=false，原字节保持 |
| 新异常checkpoint | `checkpoint-007758-0f026e6c5cfc48b8819513e6425bddf2.pt` |
| 新SHA | `74b326d3981af8364252442991641e4d697b8b674b6eaa683f5a94cdf3181175` |
| 新恢复资格 | false；无pending梯度 |
| 同一armId | `f167ec70-dd0b-48bd-9af0-fb6a45452d3e` |
| 同一账本 | 原D盘lr-1e-4/ARM_BUDGET.json，现正常闭合为exception |
| 当前闭合账本SHA | `0475e1532ef21df8b0627de8cdf8ca9fab6c2c357ecedba84eec75ab47e17b8b` |
| 原累计扣账 | 2466.9585621000006秒 |
| 新段观测耗时 | 9.474516300018877秒 |
| 新段保守扣账 | 14.473777500010328秒，含5秒收尾预留 |
| 当前累计扣账 | 2481.432339600011秒 |
| 剩余上限 | 17936样本／2242更新／11918.56766039999秒 |

CPU只读取证验证新旧模型、完整AdamW、scheduler、Sampler及Python/NumPy/Torch/GPU RNG逐项相同；194项AdamW步数均未增加。模型摘要仍 `45f7b31a…`、优化器仍 `c7dc06b0…`。这证明恢复后的完整状态得以保存，没有新优化或样本游标变化。见 [V3_RESUME1_FAULT.json](V3_RESUME1_FAULT.json)。

原闭合账本SHA9e8d1bf2…在 `revisions/submission-1/original-ARM_BUDGET.json` 保留。原D盘账本按批准同路径继续写入新累计时间，是合法接续产生的变化，不应再拿旧SHA去核验活动后的账本或把原异常目录的旧LATEST当新段LATEST。

原7758更新只有7757条指标的差异继续保留；本次0条新指标，没有补造缺失的第7758条。

## 后继状态

只读验证当前三种自动恢复均被拒绝：原317检查点的原闭合账本已变化；新74b异常资格为false；新段初始完整checkpoint并非账本登记的最新SHA。没有尝试实际重启这些检查点。后续如需恢复，须协调者独立核验新状态、当前预算及新故障，不能重复使用原精确桥接来回退或获得新预算。

两后继学习率仍为0更新/0样本/0对局，同样依赖该控制入口，故本轮一并暂停。没有合格终点，因此新增困难/简单实战均0；原基线40局复用，最终测试继续封存。已有20k/40k/60k离线诊断不变，不把60k模型挑为异常终点替代品。

当前无通过候选，含义是实验因工程故障未完成，并非三个学习率都已被证伪。第三阶段预算保持0。

本轮请求协调者审查新的启动期限异常及下一步安排。代码与合同未改、未清理资产、未操作手机或部署。仅更新本地REPORT/REVIEW_REQUEST供既有heartbeat读取，不重试跨对话发送。
