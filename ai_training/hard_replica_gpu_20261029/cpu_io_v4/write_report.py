"""根据已验证的新批次生成报告；只整理证据，不运行对局。"""
import json
from pathlib import Path
here=Path(__file__).resolve().parent
c=json.loads((here/'COMPARISON.json').read_text('utf-8'));a=c['baseline'];b=c['candidate'];d=c['changes']
rows=[
('总墙钟秒',f"{a['totalWallSeconds']:.3f}",f"{b['totalWallSeconds']:.3f}"),
('对局阶段秒',f"{a['phaseWallSeconds']:.3f}",f"{b['phaseWallSeconds']:.3f}"),
('累计CPU秒（含原生计算）',f"{a['cpuSeconds']:.3f}",f"{b['cpuSeconds']:.3f}"),
('CPU平均，占16逻辑处理器',f"{a['averageCpuPercent']:.3f}%",f"{b['averageCpuPercent']:.3f}%"),
('约1秒CPU采样峰',f"{a['peakCpuPercent']:.3f}%",f"{b['peakCpuPercent']:.3f}%"),
('Node RSS峰值',f"{a['nodePeakRssBytes']/1024**3:.3f} GiB",f"{b['nodePeakRssBytes']/1024**3:.3f} GiB"),
('GPU阶段平均／P95／峰值',*[f"{x['gpuPhase']['averagePercent']:.3f}%／{x['gpuPhase']['p95Percent']:.3f}%／{x['gpuPhase']['peakPercent']:.3f}%" for x in [a,b]]),
('GPU有效／未知样本',*[f"{x['gpuPhase']['validSamples']}／{x['gpuPhase']['unknownSamples']}" for x in [a,b]]),
('进程读取操作',a['io']['readOperations'],b['io']['readOperations']),
('进程写入操作',a['io']['writeOperations'],b['io']['writeOperations']),
('进程读取字节',a['io']['readBytes'],b['io']['readBytes']),
('进程写入字节',a['io']['writeBytes'],b['io']['writeBytes']),
('决策日志追加次数',a['recording']['appendOperations'],b['recording']['appendOperations']),
('决策日志压缩字节',a['recording']['compressedBytes'],b['recording']['compressedBytes']),
('原生威胁函数调用',a['nativeQueries']['threat'],b['nativeQueries']['threat']),
]
table='\n'.join('|'+ '|'.join(map(str,row))+'|' for row in rows)
text=f'''# CPU与采集读写继续优化：完整32局对照

2026-10-29，北京时间。正式采集保持暂停，未清理或删除历史数据。

本轮从上一轮最终源码出发，同期顺序重跑相同2001—2032号32局，每worker一次一局、不补局；完整两臂均无100步上限、无重复CPU双算。两臂均32自然结束、44,310动作，错误、停止、保护截断均为0。原job异常保护保留。

总耗时减少 **{d['totalWallReductionPercent']:.2f}%**，累计CPU时间减少 **{d['cpuSecondsReductionPercent']:.2f}%**，进程写操作减少 **{d['writeOperationsReductionPercent']:.2f}%**。平均CPU占用仅下降 **{a['averageCpuPercent']-b['averageCpuPercent']:.3f}个百分点**，采样峰没有下降；读取次数与字节基本不变，RSS峰上升 **{-d['rssReductionPercent']:.2f}%**。这次保留改动的依据是CPU总成本与写入成本下降，不能声称CPU峰值或内存同步改善。

## 同期完整单批结果

|指标|上一轮最终版，本轮重跑|本轮优化版|
|---|---:|---:|
{table}

CPU按被测Node进程累计时间除以墙钟及16逻辑处理器归一，C++已经包含在内，不重复相加。总墙钟包含启动、身份核对、worker启动及退出观察，采样器退出轮询有约1秒误差；另列精确对局阶段时间。GPU使用同一Windows PDH进程最大引擎计数器，未知样本不补0；50%软目标和原同步方式未改。

本轮两批均独立运行，未与本任务构建或检查重叠。机器仍有其他负载：整机CPU均值{a['systemAverageCpuPercent']:.2f}%／{b['systemAverageCpuPercent']:.2f}%，近似背景均值{a['backgroundAverageCpuPercent']:.2f}%／{b['backgroundAverageCpuPercent']:.2f}%。单批数据不能给出稳定固定加速结论，也不能直接把本轮143.9秒与上一轮另一时间窗口138.5秒相减来评判回退；本轮同期基线为157.2秒。没有挑选更慢的历史基线代替本轮基线。

## 代码与I/O变化

1. 只读威胁判断直接消费已有Int16范围，跳过重复坐标对象解包、Float64转换和C++调用；同一范围对象的结果以弱引用缓存，键包含目标队伍、占领能力和建筑类型。网格／元数据变化清空威胁缓存；范围缓存本身仍按字节限额。范围查询仍检查完整相关视图、移动预算、阻挡开关、假想击杀，未跳过状态失效检查。普通范围调用仍返回独立可变对象。
2. 原生平均距离缓存键直接拼接固定顺序数值，减少临时数组及JSON序列化。GPU范围请求直接填充连续Float64数组，取消大数组展开和再复制；54组数组／TypedArray、地图尺寸及移动预算的打包字节一致。
3. 新增`--record-chunk-kib`（1—4096），仅配合独立benchmark的`--compact-records`使用；默认仍128 KiB，本轮候选显式使用1024 KiB。记录格式、JSONL字段、gzip等级1及每局单文件描述符不变。日志追加{a['recording']['appendOperations']}→{b['recording']['appendOperations']}次，减少{d['recordAppendReductionPercent']:.2f}%；压缩字节减少{d['recordBytesReductionPercent']:.2f}%。恢复身份包含块大小，不允许在同一RUN中悄悄更换参数。

记录缓冲上界为块大小与最大单条记录的较大值；正常结束、STOP和可捕获错误仍关闭写完，写失败明确报错。强制终止进程可能丢失最后未flush的一块，1 MiB配置扩大了这部分潜在损失窗口；本轮没有自动迁移正式采集记录格式。

Windows进程I/O计数可能包含管道、设备与文件缓存行为，**不是SSD物理I/O**。本轮读取操作2141→2142，多出的源码测试和小幅源码变化进入身份校验，不能宣称减少了读取。共享地图仍每种只读一次（16次、15,616字节），worker源码包仍只由主线程读取一次；先前已去掉的重复读取继续保持。决策文件打开数两臂都是32，不省略任何动作记录。

原生威胁调用从12,836,358降到3,663,898；移动输入、平均距离、距离场打包调用数量保持。权威engine/rules、HIP源码／完整kernel及原生二进制身份一致，GPU继续处理移动搜索、评分和距离场。本轮不通过空转或故意延时降低CPU百分比，也没有把零散缓存命中重复送入GPU。

## 一致性、验证与状态

- [完整记录摘要](TRACE_IDENTITY.json)：32份job、初态、终态SHA一致，胜者、步骤与telemetry一致；两臂解压均1,234,311,366字节／44,310行，逐字节SHA相同。比较器只流式解压和摘要，未执行规则回放。
- [专项检查](unit/RESULT.json)：威胁真假命中、队伍／建筑／占领能力隔离、待命变化、临时变更与恢复、普通对象修改隔离、元数据失效；54组打包等值；202条包含中文和超大单条的记录完全一致，重复关闭、关闭后追加与写入错误检查通过。
- `verify_current`：32个新开局3,183步逐步参考双算通过，动作、随机流、telemetry及数值／范围顺序一致，每步仅结算一次。1自然、31检查截断；这些截断不进入完整32局性能结果。验证模式实际执行新紧凑威胁路径，再与原范围和原表达式核对。
- 公共lint、GPU TypeScript检查、生成器`--check`、3文件15项困难AI定向测试、公共build通过。既有打包重复DOM键与大chunk提示保留；未执行包含被禁止历史回放的全量测试。
- [机器结果](COMPARISON.json)保留逐秒CPU/GPU、完整RUN身份和原始目录引用；`source_baseline/`与`source_candidate/`保存本轮来源快照，[最终封存](DELIVERY_MANIFEST.json)记录摘要。

正式production-v2继续暂停，没有恢复1000局、修改原RUN、清空attempt预算、操作手机、训练、生成训练张量或改变2414／268分区；strict／forced／APK原生历史回放未执行。来源仍为`project-apk-hard-replica-gpu`，不称原APK原生等价。

## 独立复测命令

从仓库根目录运行，下列输出目录必须更换为新目录，不能覆盖已封存证据。预先运行`node ai_training/run.mjs node gpu/native/build_worker.mjs`生成并核对当前源码包。

```powershell
node ai_training/run.mjs .venv-rocm/Scripts/python.exe gpu/native/benchmark.py --out hard_replica_gpu_20261029/新的优化测试目录 -- node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out hard_replica_gpu_20261029/新的优化测试目录 --benchmark --single-batch --workers 32 --limit 32 --gpu-range --native --gpu-distance --compact-records --record-chunk-kib 1024 --shared-assets --shared-worker-code
```
'''
(here/'REPORT.md').write_text(text,encoding='utf-8')
print('报告已写入')
