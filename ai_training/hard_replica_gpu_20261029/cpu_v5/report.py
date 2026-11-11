"""汇总已核验的本轮性能结果，不执行历史回放。"""
import json
from pathlib import Path
p=Path(__file__).resolve().parent
c=json.loads((p/'COMPARISON.json').read_text('utf-8'));a=c['baseline'];b=c['candidate']
rows=[]
for title,key in [('总墙钟秒','totalWallSeconds'),('对局阶段秒','phaseWallSeconds'),('累计CPU秒','cpuSeconds'),('CPU平均百分比','averageCpuPercent'),('CPU采样峰百分比','peakCpuPercent')]:rows.append((title,round(a[key],3),round(b[key],3)))
rows.append(('RSS峰GiB',round(a['nodePeakRssBytes']/1024**3,3),round(b['nodePeakRssBytes']/1024**3,3)))
for title,key in [('GPU平均百分比','averagePercent'),('GPU峰百分比','peakPercent'),('GPU有效样本','validSamples'),('GPU未知样本','unknownSamples')]:rows.append((title,a['gpuPhase'][key],b['gpuPhase'][key]))
for key in ['readOperations','writeOperations','readBytes','writeBytes']:rows.append((key,a['io'][key],b['io'][key]))
rows.append(('原生移动输入调用',a['nativeQueries']['movementInput'],b['nativeQueries']['movementInput']))
table='\n'.join('|'+ '|'.join(map(str,row))+'|' for row in rows)
text=f'''# CPU缓存依赖优化：完整32局对照

2026-10-29，北京时间。正式采集保持暂停。

从cpu_io_v4最终版本出发，同期顺序运行相同2001—2032号32局，两批均32 worker、每worker一次一局、不补局、不设100步上限。完整批次不启用CPU双算，原job保护保留。两批均32自然结束、44,310步，错误／停止／保护截断均0。解压日志逐字节SHA一致，每臂1,234,311,366字节；job、初态、终态、胜者与telemetry一致。

|指标|本轮基线|优化后|
|---|---:|---:|
{table}

总墙钟减少{c['changes']['totalWallReductionPercent']:.2f}%，累计CPU减少{c['changes']['cpuSecondsReductionPercent']:.2f}%；平均CPU由{a['averageCpuPercent']:.3f}%变为{b['averageCpuPercent']:.3f}%，没有下降，采样峰也没有下降。CPU百分比按16逻辑处理器归一，C++计时包含在Node内，不重复相加。单次对照不是稳定固定收益保证；两批后台负载不同，近似背景CPU均值{a['backgroundAverageCpuPercent']:.2f}%／{b['backgroundAverageCpuPercent']:.2f}%，整机均值{a['systemAverageCpuPercent']:.2f}%／{b['systemAverageCpuPercent']:.2f}%。不能拿不同时间窗口的旧墙钟直接比较。

GPU采样为Windows PDH当前进程最大引擎占用，未知样本不补0；原50%软目标、HIP源码、二进制与同步方式不变。总墙钟含启动和退出观察，采样器观察误差约1秒。进程I/O不是SSD物理读写。本轮记录块仍1 MiB，日志格式、压缩级别、共享源码／地图参数均不变。

## 采样和修改依据

先对2个新开局各最多200步做V8采样，保留`profiles/`及[函数汇总](PROFILE_TOP.json)。`readHardNativeView`、`prepareHardNativeMovement`的自身采样分别426／300；`transfer`的2224次包含Atomics等待，不能解释成CPU忙算百分比。短开局采样只定位调查方向，不代表完整32局时间分布。

检查发现：任意网格相关变化原先都清空移动图并重建地形位置表；临时单位移动也触发这类重复工作。现在按依赖拆分：

- 地形位置表只在地形布局或元数据变化后重建。
- 关闭敌军阻挡时，移动输入只依赖地形和兵种能力，用单独64 KiB估算限额缓存跨临时单位移动复用；能力、联盟、特殊参数仍在原键中，元数据变化整体重建。
- 带阻挡移动图／范围在地形、单位或单位队伍变化时失效；建筑归属和待命改变无需重算移动图。
- 距离、距离场和威胁仍在全部相关视图变化时失效；每次查询仍完整检查当前网格和元数据，没有用引擎步号替代临时状态检查。

新增64 KiB是每AI实例的估算缓存预算，不是进程RSS上限。权威规则和GPU算法没有重写；只修改生成器，再由生成器更新策略资产。

## 验证及证据

- [专项结果](VIEW_CACHE_TEST.json)：原15类视图／紧凑缓存检查、108个距离修正，以及6个依赖失效／复用检查通过，覆盖临时移动与恢复、待命与建筑归属、地形、兵种、联盟和阻挡开关。
- `verify_current/`：32新开局、3,183步CPU参考双算，动作、随机流、telemetry及数值／候选顺序一致；1自然、31明确检查截断，不混入完整对照。
- 公共lint、GPU类型检查、生成器检查、3文件15项困难AI定向测试及公共build通过。既有大chunk与重复DOM键警告保留，没有执行被禁止历史回放的全量测试。
- [机器结果](COMPARISON.json)、[完整记录摘要](TRACE_IDENTITY.json)、两臂原始采样、来源快照和[封存清单](DELIVERY_MANIFEST.json)保留。比较器仅解压摘要，不执行规则回放。

正式production-v2继续暂停；未修改生产RUN或attempt预算，未操作手机、训练、生成张量或修改2414／268分区。strict／forced／APK原生历史回放均未执行。
'''
(p/'REPORT.md').write_text(text,encoding='utf-8')
print(json.dumps({'changes':c['changes'],'movementInput':[a['nativeQueries']['movementInput'],b['nativeQueries']['movementInput']]}))
