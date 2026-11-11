# C++ Node-API 与 HIP 可选后端

后续CPU缓存依赖优化将地形位置表、关闭阻挡的移动图、带阻挡移动图与完整视图分开失效。关闭阻挡图使用每AI额外64 KiB估算限额，地形／元数据改变仍清空；每次查询继续完整检查临时网格。完整32局累计CPU减少6.00%，平均占用未下降，详见[最新报告](../../hard_replica_gpu_20261029/cpu_v5/REPORT.md)。正式采集保持暂停。

2026-10-29后续优化：只读威胁路径直接消费Int16范围，并以范围对象弱引用缓存同队伍／占领能力／建筑类型结果；网格与元数据变化仍失效，普通范围返回仍隔离。评分／范围GPU算法不变，减少重复CPU对象转换与调用。完整32局同期总157.19→143.91秒、CPU累计减少9.84%，写操作减少84.47%；平均CPU仅降0.77个百分点，读取基本不变、RSS峰增加5.07%。[最新完整报告](../../hard_replica_gpu_20261029/cpu_io_v4/REPORT.md)说明限制，正式采集继续暂停。

独立benchmark可在下方完整I/O命令追加`--record-chunk-kib 1024`，使用1 MiB合并记录块；需同时`--compact-records`，允许1—4096 KiB，省略仍128 KiB。块大小写入恢复身份。更大块减少压缩调用与写操作，也扩大强制终止时最后未flush块的潜在损失窗口；正常结束／STOP仍写完，正式记录格式不自动改变。新专项入口为`node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/native/test_cpu_io.ts --out 新证据目录`，拒绝覆盖已有目录。

本模块只服务独立研究入口；公共运行时通过 `ApkHardComputeOptions` 接收纯计算接口，不引用本目录。默认不传 `--native` 时保留原有 CPU／Python-HIP 路径，权威规则与困难 AI 的控制流继续由原实现执行。

## 实现范围

- `cpu.cpp`：从数值视图整理移动代价与阻挡图，计算平均距离、过滤可达建筑威胁。
- `hip.cpp`：直接调用 HIP／HIPRTC；一个共享上下文、持久固定页与设备缓冲、异步工作和原内核，不经过 Python 服务与二进制管道。
- `broker.ts`：多个对局共享微批调度，校验每个请求的候选数，再写回原共享内存。工作线程继续使用 `Atomics.wait` 阻塞等待。
- `monitor.cpp`：Windows PDH 每秒采样当前进程的最大 GPU 引擎占用，保持 50% 软目标。未知样本不记为 0，不制造额外计算。
- `binding.ts`：加载边界、原生错误传播与调用计数。原生错误会中止，不能将原生异常吞掉后继续使用回退教师。
- `distance.hip`：按需计算整数曼哈顿距离场；同视图查询达到阈值后启用，保留CPU的假想落点修正和原取整。
- `worker_bundle.ts`、`build_worker.mjs`：验证权威来源后，主线程读取一次worker包并从内存启动，减少各worker重复模块读盘。
- `throttle.ts`：GPU占用回落后将微小限流尾数归零，避免Node将其持续钳为至少1毫秒等待。

`tools/apk_hard_native_transform.mjs` 在生成阶段注入可选接口；生成的策略文件仍只通过原生成器更新。查询入口核对**当前**网格全部相关字段，仅重编码变更格，并按内容检查队伍／兵种／地形元数据；已证明没有写入的同函数连续计算块可复用视图。图与距离缓存随视图变更失效，阻挡开关和假想击杀另纳入派生图键；每次返回独立移动范围对象，避免调用方修改污染缓存。这覆盖临时移动与恢复，没有按真实 `engine.step` 步号缓存地图。地图检查与视图编码仍在JS，零散计算在C++ CPU，移动搜索、批量评分及可选距离场在HIP；这不是全流程GPU化。

每格视图由八个双精度整数构成：地形索引、建筑标志（房屋名 1／城堡名 2／castle ID 4）、建筑队伍、建筑联盟、单位队伍、单位联盟、单位标志（空军 1／存在单位 2）、严格布尔待命。队伍与联盟采用当前视图的独立编号；未知队伍为 0。原脚本负责兵种、标准占领能力、地形移动代价和特殊状态的解释。

GPU内核保留 `hard_score.hip` 与 `parallel/range.hip` 的原源码身份，并新增距离场分支，因此完整内核SHA与旧Python版本不同。保留FP64、`-ffp-contract=off`、FIFO左下右上、首次发现顺序、剩余移动力和JS `existing || -1` 零值语义；距离场使用有界整数归约。没有更换默认HIP事件同步方式。

客户端评分／范围／距离场缓存按估算载荷分别限制2／8／2MiB；每AI实例的派生图／距离／范围缓存分别限制128／32／256KiB。范围采用紧凑整数缓存，共享返回缓冲为每worker512KiB；实际RSS另行测量，这些限额不是RSS硬上限。

## 本机构建与验证

在项目根目录运行：

```powershell
ai_training/gpu/native/build.cmd
node tools/extract_apk_hard_runtime.mjs
node tools/extract_apk_hard_runtime.mjs --check
node ai_training/run.mjs node gpu/native/build_worker.mjs
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/native/test_native.ts
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/native/test_view_cache.ts
node node_modules/typescript/bin/tsc --noEmit -p ai_training/gpu/tsconfig.json
```

构建脚本使用本机 VS 18 Build Tools、Node 22.18.0 的 Node-API 头文件／导入库及独立 ROCm SDK。更换机器须调整 `build.cmd` 中工具链位置。`build/` 内的二进制和生成内核为本地产物，不提交 Git。

当前状态双算入口示例（仅实际结算一次）：

```powershell
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/新的原生检查目录 --benchmark --workers 8 --limit 32 --max-actions 200 --gpu-range --native --verify
```

该命令的 200 步仅用于正确性检查，截断明确单列。完整性能测试不能传 `--max-actions` 或 `--verify`：

```powershell
node ai_training/run.mjs .venv-rocm/Scripts/python.exe gpu/native/benchmark.py --out hard_replica_gpu_20261029/新的完整性能目录 -- node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/新的完整性能目录 --benchmark --single-batch --workers 32 --limit 32 --gpu-range --native
```

测量器中的 Python 只负责外部只读 CPU／GPU 采样和进程启动，不参与候选后端的计算。Windows PDH 必须可访问；当前桌面沙箱内访问失败，应在允许读取计数器的执行环境运行。保留运行日志、逐秒进程数据、有效／未知 GPU 样本、源码／输入／内核／二进制身份，拒绝覆盖已有测量结果。总墙钟包含启动、退出观察与采样收尾，退出观察轮询误差不超过约 1 秒；另有精确的对局阶段计时。

本轮减少采集I/O的完整入口：

```powershell
node ai_training/run.mjs .venv-rocm/Scripts/python.exe gpu/native/benchmark.py --out hard_replica_gpu_20261029/新的I-O性能目录 -- node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/新的I-O性能目录 --benchmark --single-batch --workers 32 --limit 32 --gpu-range --native --gpu-distance --compact-records --shared-assets --shared-worker-code
```

`--gpu-distance` 默认阈值32，可用 `--distance-threshold` 调整；`--shared-assets` 共用已验证地图原件；`--shared-worker-code` 共用已预打包且校验全部来源的worker代码。`--compact-records` 完整保留JSONL，128KiB合并压缩并每局只打开文件一次，目前限benchmark；正常关闭写完缓冲，强制进程终止可能损失最后未写块。进程I/O计数不等于物理磁盘读写，报告另给出日志逻辑写入和字节。专项脚本默认输出属于本轮证据目录，复测应改用独立新输出，勿覆盖已封存报告。

最新结果与限制见[CPU、内存与采集I/O完整A/B](../../hard_replica_gpu_20261029/native_hotspots_v3/REPORT.md)，上一轮[原生迁移报告](../../hard_replica_gpu_20261029/native_cpp_ab/REPORT.md)保留。正式采集保持暂停，不自动迁移生产身份或清空attempt预算。来源仍为 `project-apk-hard-replica-gpu`，不称原APK原生运行时等价。
