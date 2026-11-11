# 多局共享GPU采集

当前调用方式见[简短指南](../DATA_COLLECTION_QUICKSTART.md)，架构、缓存、CPU与I/O、固定32局重复并发数据见[汇总文档](../OPTIMIZATION_SUMMARY.md)。当前原生模式使用C++ HIP，不经过下文历史Python服务；正式生产仍暂停，下方生产接续命令不能绕过旧源码身份不匹配。

最新状态：按用户要求正式采集已暂停。16/32/64并发两轮测试及进一步GPU迁移见[新报告](../../hard_replica_gpu_20261029/concurrency_16_32_64/REPORT.md)。旧生产源码身份不再与当前版本相同，禁止改写旧RUN.json绕过恢复检查。

## 更多计算交给GPU：移动搜索实验入口

增加`--gpu-range`后，原困难脚本的移动范围FIFO搜索由HIP内核执行，跨局共享服务合批。原脚本仍生成地形代价和敌方阻挡；GPU返回原顺序的可达格与剩余移动力。原JS的零剩余值处理和左、下、右、上遍历顺序均保留。没有更换游戏规则或教师策略。

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/独立GPU搜索测试 --workers 32 --backend gpu --benchmark --limit 100 --max-actions 100 --gpu-range
```

这是GPU承担更多工作的一条可选路径，不能等同于全流程GPU化或保证提速。当前支持最多768格、整数移动力0—32、正整数移动代价，搜索队列容量4096；超界、队列溢出或GPU错误会中止，禁止返回近似范围或静默降级。输出只传必要的可达格，缓存键覆盖完整代价图、阻挡图、起点和移动预算；每次返回新对象，避免修改污染缓存。使用`--verify`可逐次对照原CPU搜索和最终决策。

图搜索可并行的部分受顺序依赖限制；状态转换、规则结算、部分评分分支、压缩写盘仍在CPU。用户允许的50%是GPU占用软上限，不是人为制造负载的目标。

`run.ts`调度多个独立对局worker，`worker.ts`复用项目困难AI及权威引擎。每名玩家保留独立随机流、原脚本状态和计划缓存，游戏之间没有共享AI记忆。同步评分调用在worker内等待，主线程持续收集其他局请求，单个`broker.ts`将请求合并后交给唯一Python/HIP进程。各局的候选顺序和实际结算顺序不变。

GPU传输采用二进制浮点数组、固定页内存、持久GPU缓冲区、异步HIP拷贝。一个批次只上传一次、启动一次内核、下载一次。批次可含不同数量的候选和单位，输出经候选数验证后分别唤醒对应worker。内核从现有`hard_score.hip`生成，仅对有界整数曼哈顿距离求和做并行归约，FP64舍入和评分表达式保持原样，禁用FMA。GPU故障会中止采集，不能静默切成CPU教师。

## 验证和性能对照

```powershell
node node_modules/typescript/bin/tsc --noEmit -p ai_training/gpu/tsconfig.json
ai_training/.venv-rocm/Scripts/python.exe ai_training/gpu/parallel/test_batch.py
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/独立检查目录 --workers 8 --benchmark --limit 7 --max-actions 20 --verify
```

`--verify`对当前新状态双算原CPU/GPU动作和回退行为，仅实际结算一次，不读取历史轨迹。`--benchmark --backend cpu`使用原CPU表达式；GPU对照用相同局号、并发数及动作预算。`--max-actions`是明确标记的基准截断，不能算自然完成；省略后按冻结job预算跑完整对局。`--probe`只计算初态动作，不进行结算。

## 生产接续

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/production-v2 --previous hard_replica_gpu_20261029/production-v1 --workers 8 --limit 1000
```

新目录引用旧成功局原件和SHA，不复制、覆盖或重新采集成功父局。旧目录必须没有运行锁，并核对冻结jobs及旧规则源码身份；前42观察父局须已自然完成。旧未完成尝试仍占启动预算，新目录从下一attempt编号开始，最多三次实际启动。正在运行的AI内部记忆不能恢复，因此中途停止后只能保留尝试并按原seed重新开始该父局，不能称为逐动作续跑。

`PROGRESS.json`记录本次完成、合计自然完成、排队和活动对局、GPU批大小、候选数及占用采样；`RESULTS.json`包含旧成功局引用和本次结果。初始化及恢复检查会拒绝源码身份变化。创建`STOP`文件可使各worker在当前动作后保存结果退出；不要同时启动同目录。异常退出后先检查PID，再归档失效锁，不应盲删。剩余磁盘低于2GiB会触发停止。

GPU占用通过Windows PDH的当前服务进程计算引擎采样，每秒更新，目标50%，超过目标时逐步限流；这是软控制，不能保证瞬时严格不超过50%。低负载不会人为增加无用计算来凑占用。采样权限不足会显示未知，不记作0%。其他应用GPU负载另行记录。只保留最近60条详细采样及累计平均/最大值，避免长任务进度文件无限增长。

正式来源仍为`project-apk-hard-replica-gpu`，不是原APK运行时等价。没有改动手机任务、冻结训练划分、模型权重或训练张量；不开启历史重放。

设计参考：[AMD HIP性能指南](https://rocm.docs.amd.com/projects/HIP/en/latest/how-to/performance_guidelines.html)关于合并小传输和固定页内存；[Microsoft PDH数组采样API](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhgetformattedcounterarrayw)。实际收益以本机对照证据为准。
