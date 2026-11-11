# 项目困难AI的GPU采集

2026-10-29当前入口见[采集简短指南](DATA_COLLECTION_QUICKSTART.md)与[完整优化汇总](OPTIMIZATION_SUMMARY.md)。正式production-v2已暂停，当前优选C++ HIP后端；下文的单局Python实现、运行状态和接续命令为历史记录，不能直接用于恢复当前生产。

这条路径复用 `OriginalApkLikeHardAI` 和提取的APK困难决策脚本，**不加载2M模型、不训练权重、不需要安卓环境**。来源为 `project-apk-hard-replica-gpu`，不能标成手机原APK原生对局。

GPU负责所有可达候选的敌方平均距离、己方平均距离、移动后己方距离，以及困难AI分段落点评分。候选坐标、敌我/城堡归属、突击快照和单位价值仍由原脚本提供。CPU继续负责选单位、招募、攻击/技能估值、合法性和权威GameEngine结算。当前不是全GPU游戏引擎。

## 实现路线

1. 在 `tools/apk_hard_compute_transform.mjs` 中给生成器增加可选计算钩子；通过 `tools/extract_apk_hard_runtime.mjs` 重建资产，不手工编辑生成文件或原HTML。不开启钩子时保留原CPU表达式。
2. `hard_kernel.py` 提供PyTorch双精度参考后端；使用广播张量处理“候选×敌我位置”，实际GPU数值已验证。
3. 正式采用 `hard_score.hip` 的单次HIP内核，把距离归约、两位小数取整、分段公式合并计算。`hard_hip.py` 通过AMD HIPRTC编译并装载，使用PyTorch已分配的GPU内存和当前stream，无需安装另一套编译环境。
4. FP64、禁用浮点乘加融合；按原JS的舍入方向处理半整数，不使用银行家舍入。所有矩阵输入和输出均有长度/数值检查。
5. `hard_bridge.ts` 的工作线程维持常驻Python进程，通过共享内存返回结果；最多缓存2048组完整输入对应的**真实GPU计算结果**，缓存命中与GPU实际调用分别计数。GPU失败不会静默改CPU：采集器在结算前检查桥接状态并停止。

采用这一路线是因为本机已有可用ROCm，且困难脚本使用JS双精度数值。WebGPU需要额外实现和数值验证，本次未引入。把全部分支、寻路和模拟状态移到GPU是更大的实现工作，不能通过给现有JavaScript添加一个device参数完成。

参考：[AMD HIPRTC运行时编译](https://rocm.docs.amd.com/projects/HIP/en/docs-7.2.3/how-to/hip_rtc.html)、[PyTorch HIP接口语义](https://docs.pytorch.org/docs/main/notes/hip.html)、[Clang浮点融合控制](https://clang.llvm.org/docs/UsersManual.html)。这次不运行机器学习训练，因此先前Windows ROCm“不支持ML训练”的说明不能直接解释为不能执行这些HIP计算。

## 当前第三批

执行目录：`ai_training/hard_replica_gpu_20261029/production-v1/`。

输入读取此前冻结的 `hard_curriculum3000_pc_gpu_20261029/JOBS.json`，保留执行局号2001—3000、slot、parent、seed、20地图原字节、七类以及400/300/300人数配额。派生初态按既有快照恢复，不再次发放收益；正常开局结算一次。原脚本人口常量通过独立实例选项匹配20/30/50；不改变GUI默认行为。1000份初态已全部检查，原近似地形标记保留。

新来源已经由用户本轮“项目已复刻困难AI，不一定使用安卓环境，请修改代码调用GPU采集”的要求授权。手机前两批仍是原生来源，电脑第三批是项目复刻来源，不能将三者合并宣传为3000局原APK原生数据。

前3个正式父局已完成，分别是双人、三人、四人，累计3887动作，全部自然结束。每一步在同一当前状态下双算CPU/GPU决策，仅执行一次实际动作；没有历史轨迹重放。所有动作相同，四人局的2次项目合法性回退在CPU/GPU两边一致，不能把它说成GPU错误。

前42个观察初态覆盖七类×三人数，评分表达式逐项对照、最终动作和错误/回退计数均一致。正式流程先完成这42个观察父局，每格至少一自然结束后继续该格；失败和截断单列，不换seed填配额。每父局最多3个实际尝试，成功局跳过；每局默认20000动作/6小时，空间低于2GiB停止。源代码与输入摘要变化会拒绝直接恢复。

## 运行与状态

读取状态即可，不要再启动第二个生产进程：

```powershell
Get-Content ai_training/hard_replica_gpu_20261029/production-v1/PROGRESS.json
```

以下是接续命令，**只在确认原进程已结束且运行锁已妥善核实后使用**：

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/hard_collect.ts --out hard_replica_gpu_20261029/production-v1 --limit 1000
```

`RUNNING.lock`防止重复执行。进程异常消失后不要直接删锁重开；先核对PID和启动身份，保留并归档失效锁及未完成尝试，再接续。程序会保留旧attempt且最多允许3次启动，不具备恢复AI内部回合记忆的逐动作断点续跑能力。完成局不会重采。

需要正常暂停时，在生产目录创建 `STOP` 文件；当前动作完成后保存状态并退出。以后恢复前先确认已停止，归档STOP记录，继续原目录。电脑重启/休眠后不保证自动续跑，没有修改开机任务或电源策略。

每父局保存冻结job、实际项目初态、压缩逐决策前态/动作、结果、GPU调用与缓存计数、原脚本/回退计数。截断不产生自然胜负。禁止的strict、forced、APK原生重放保持关闭；不调用神经模型采集链的verify/prepare，不生成训练张量，不改2414/268冻结分区。

## 多局批处理更新（2026-10-29）

当前正式入口已改为[多局共享GPU采集](parallel/README.md)，旧单局目录已正常停止并保留56个成功父局。新目录`production-v2`采用8个worker和单GPU服务；跨局批量调度、二进制传输、固定页内存和持久缓冲区均已启用。42完整对局、67,309步CPU/GPU逐步记录一致。并行提升吞吐，但没有证明GPU稳定超过同并发CPU，具体计时见[并行优化报告](../hard_replica_gpu_20261029/PARALLEL_REPORT.md)。下列单局性能与入口为历史实现记录，不应重复启动旧生产目录。

## 验证与性能

```powershell
node tools/extract_apk_hard_runtime.mjs --check
node node_modules/typescript/bin/tsc --noEmit -p ai_training/gpu/tsconfig.json
ai_training/.venv-rocm/Scripts/python.exe -X utf8 -m unittest discover -s ai_training/gpu -p test_hard_kernel.py -v
```

专门测试3项通过，包含64组不同规模、空集合、舍入和非法输入；42初态及3完整对局通过当前决策双算验证。公共lint/build通过，困难AI相关3文件15项测试通过。本轮未运行含历史重放用例的全量测试，不将旧的全量通过结论当成本轮证据。

**目前没有证明整体加速。** 清空跨局面结果缓存、预热后交错先后顺序的84次决策：CPU 2.091秒，GPU混合版2.609秒，即本次GPU约慢25%。保留重复初态热缓存时另一轮为CPU2.683秒/GPU2.467秒，不能用这个约9%的表面优势宣称新对局也会加速。纯数值HIP融合已显著减少多算子调度，但同步IPC、传输以及大量CPU分支/寻路仍占主导。

已按用户优先使用GPU的要求接续生产。后续若以吞吐为首要目标，应进一步研究跨多局的异步批量调度和更大计算块迁移，并与同并发CPU基准比较；不应只增加GPU利用率或用图形渲染冒充AI计算加速。

实测证据、启动信息和阶段结果见[第三批报告](../hard_replica_gpu_20261029/REPORT.md)。
