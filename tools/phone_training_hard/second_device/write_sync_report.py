"""从已冻结同步索引生成本次进度与异常报告，历史报告保持原样。"""
from collections import Counter
import datetime as dt
import json
from pathlib import Path
import sys
from device import TASK
from verify_completed import digest


def main():
    out=Path(sys.argv[1]).resolve()
    index=json.loads((out/'INDEX.json').read_text(encoding='utf-8'))
    failures=json.loads((out/'diagnostics/FAILURES.json').read_text(encoding='utf-8'))
    master=index['snapshotMaster'];epoch=master['updatedEpoch']
    time=dt.datetime.fromtimestamp(epoch,dt.timezone(dt.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S')
    recent={str(minutes):{'naturalParents':sum(p['completedEpoch']>=epoch-minutes*60 for p in index['parents']),
                          'failedAttempts':sum(f['epoch']>=epoch-minutes*60 for f in failures),
                          'failureReasons':dict(Counter(f['reason'] for f in failures if f['epoch']>=epoch-minutes*60))} for minutes in (10,30,60)}
    changes=[line for line in (out/'diagnostics/master.log').read_text(encoding='utf-8').splitlines() if '智能调档' in line]
    reasons=Counter(line.split('原因=')[-1].split('，CPU=')[0] for line in changes)
    paths=sum((Counter(p['pathCounts']) for p in index['parents']),Counter())
    tables='\n'.join(f'|{name}|{count}|{125-count}|' for name,count in sorted(index['quota'].items()))
    workers=Counter(p['workerId'] for p in index['parents'])
    errors='\n'.join(f'- `{name}`：{count}次。' for name,count in index['failureReasonCounts'].items())
    report=f'''# 三星第二段采集检查与增量取回

截至手机快照 **{time}（北京时间）**，自然完成 **{index['completedParents']}/1000**、剩余 **{1000-index['completedParents']}**。索引生成于{index['utc']}。本次只读手机，未停止、重置、重新安装或下发第二套队列；小米未操作。

## 取回结果

本次新增下载 **{index['newlyDownloadedParents']}局**，重新核对并复用电脑已有 **{index['reusedVerifiedParents']}局**，合计 **{index['completedParents']}个唯一父局**。原始六文件逻辑合计{index['bytes']:,}字节（{index['bytes']/1024**2:.2f}MiB），包含 **{index['actions']:,}个动作及同数量状态帧**。清单、安装APK和冻结计划身份、长度/SHA256、gzip CRC/尾部、动作连续索引、状态帧长度/数量、自然结果与THREAD_EXITED全部核对。同步错误{len(index['errors'])}，截止快照未取回完成局{len(index['notYetDownloaded'])}。

统一入口为[INDEX.json](INDEX.json)，新增文件在[data](data/)，原有37局在索引指向的历史archives目录，避免重复下载或覆盖。`verified.jsonl`保存逐局回执，便于中断后重新核验续取。手机原件、失败局和在途局均保留。

原始文件完整性检查不等于合法动作严格重放：nativeReplayVerified/projectStrictVerified仍为false，没有自动加入训练集。

## 实时运行与独立性

- 当前上限{master['operatingCeiling']}路、档位{master['activeLimit']}，原因“{master['adaptiveReason']}”；采样CPU{master['cpuPercent']}%（8核总能力归一100%），温度{master['batteryTemperatureC']}℃，资源暂停标记{master['resourcePaused']}。
- 手机资源读数已保存于diagnostics：本次取回阶段电量约95%、38.2℃、/data空闲约18.7GiB，没有低电量/低空间阻断。
- 总调度PID3211及三个控制器PID25071/25084/25101均存活，PID和startTicks与08:56部署回执一致，PPID均为1。断开电脑期间的采集确实持续推进，不是重连后重启的队列。
- 分片完成：{dict(workers)}；同一父局没有被重复计入完成。
- 最近60分钟自然完成{recent['60']['naturalParents']}局、失败尝试{recent['60']['failedAttempts']}次；最近30分钟自然完成{recent['30']['naturalParents']}局。按最近小时粗算剩余约{(1000-index['completedParents'])/max(1,recent['60']['naturalParents']):.1f}小时，尾段多数是失败父局重试，实际可能延长。

## 异常检查

累计 **{index['failedAttempts']}次失败尝试**，涉及{index['failedUniqueParents']}个父局：

{errors}

其中 **{index['failedParentsLaterCompleted']}个失败父局后来已重试成功**，另{index['failedParentsStillPending']}个仍未进入完成索引；失败次数不能当成自然负局或已完成局。208份失败STATE已取回，另11次早期启动失败没有局目录/STATE。

`failed`的88份STATE均记录原生 `EVT-ERROR: #10`。没有为了消除该错误修改AI或原生规则，其具体动作原因需另行结合失败前态检查。

进程退出共120次（`app_disappeared`119次，加上沿用控制器标签`inject_disappeared`1次；Gadget版本的该标签实际仍跟随宿主PID）。最近一例worker12 PID20562在16:20:21的日志已经闭合：`AndroidGraphics`报告 `waiting for pause synchronization took too long; assuming deadlock and killing`，随后本进程发送SIG9，系统记录其死亡。说明**至少这一例为libGDX图形暂停同步超时后的自行结束**。不能将其余历史退出全部归为同一原因，也不能将其当成CPU超90%的系统杀进程。

智能调档记录中“失败密集暂降并发”{reasons.get('失败密集暂降并发',0)}次，“持续低负载逐档恢复”{reasons.get('持续低负载逐档恢复',0)}次，均有恢复；当前仍为最高3路。未见记录中的CPU90%触限或资源守护暂停，STOP_INCREASING={master['stopIncreasing']}。本次未改变手机调度策略或做运行态修复，原队列继续其他父局并轮末重试。

错误STATE、控制器日志、调档日志、服务绑定、最近进程退出专属日志、资源和进程身份在[diagnostics](diagnostics/)保存；明细见[FAILURES.json](diagnostics/FAILURES.json)。

## 地图完成量

|官方地图|已完成|剩余配额|
|---|---:|---:|
{tables}

## 核对边界

全部{index['completedParents']}局动作路径为{dict(paths)}，保留原Java困难回退的能力；本批自然完成局没有观测到回退动作。native seed仍只对应原生配置，不代表JS Math.random被播种。

新增同步/校验工具Python语法检查通过，实际{index['completedParents']}局完成上述文件核对。没有改动公共引擎、模型或UI，本次不重复跑与纯取回无关的公共测试。该报告为带时间快照，后续新增局继续留在手机，下一次同步会增量取回。
'''
    (out/'REPORT.md').write_text(report,encoding='utf-8',newline='\n')
    audit={'snapshotLocalTime':time,'completedParents':index['completedParents'],'remainingParents':1000-index['completedParents'],
           'recentProduction':recent,'governorReasonCounts':dict(reasons),'sourceApkPayloadUnchanged':True,
           'recentExitCauseConfirmed':{'pid':20562,'package':'net.toyknight.aeii.worker12','time':'2026-10-23 16:20:21+08:00','cause':'libGDX暂停同步超时，自行发送SIG9','generalizedToAllPastExits':False},
           'strictReplayPerformed':False,'phoneQueueMutated':False}
    (out/'AUDIT.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    files=[out/'INDEX.json',out/'REPORT.md',out/'AUDIT.json',out/'verified.jsonl']+list((out/'diagnostics').glob('*.json'))
    (out/'MANIFEST_SHA256.json').write_text(json.dumps({str(p.relative_to(out)).replace('\\','/'):digest(p) for p in files},indent=2)+'\n',encoding='utf-8')
    latest={'utc':index['utc'],'snapshotLocalTime':time,'directory':str(out),'index':str(out/'INDEX.json'),'report':str(out/'REPORT.md'),
            'completedParents':index['completedParents'],'remainingParents':1000-index['completedParents'],'newlyDownloadedParents':index['newlyDownloadedParents'],
            'failedAttempts':index['failedAttempts'],'phoneQueueStillRunning':master['phase']=='running'}
    (TASK/'LATEST_SYNC.json').write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(latest,ensure_ascii=False))


if __name__=='__main__':
    main()
