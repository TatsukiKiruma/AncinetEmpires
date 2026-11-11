"""记录已下发事实与验证边界；不访问设备或启动后续工作。"""
from pathlib import Path
import datetime as dt
import hashlib
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import ROOT,TASK,OUT,REMOTE,DEVICE,sha,write,text

def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def main():
    deployed=load(OUT/'production/DEPLOYED.json');offline=load(OUT/'PRODUCTION_OFFLINE_CONFIRMED.json');pref=load(OUT/'PREFLIGHT_CONFIRMED.json')
    assert pref['passed'] and offline['passed'] and deployed['allFilesShaVerified']
    latest=load(OUT/'LATEST_SYNC.json');index=load(Path(latest['path'])/'INDEX.json')
    snapshot=load(offline['after']);state=snapshot['phoneState'];stamp=dt.datetime.fromisoformat(snapshot['utc']).astimezone(dt.timezone(dt.timedelta(hours=8))).isoformat()
    statuses={'schema':'hard-curriculum-samsung-running-v1','device':DEVICE,'model':'SM-N9500','localTime':stamp,'phase':'collecting','remoteRoot':REMOTE,'humanGameNumbers':[1001,2000],
      'parentsDispatched':1000,'maximumWorkers':2,'initialTestParentsIncluded':3,'additionalParents':997,'qualifiedNaturalParentsOnPc':index['syncedNaturalParents'],
      'snapshotMaster':offline['master'],'snapshotState':state,'offlineVerification':str(OUT/'PRODUCTION_OFFLINE_CONFIRMED.json'),'preflightVerification':str(OUT/'PREFLIGHT_CONFIRMED.json'),
      'physicalUsbDisconnectTested':False,'computerRequired':False,'hostNetworkForwardRequired':False,'replay':'disabled_by_user','training':False,'tensorGeneration':False,'automaticDatasetAdmission':False,
      'batch3Device':'未指定，不执行','mi8OperationsThisStage':0,'continueMonitoringAfterDelivery':False}
    write(OUT/'RUNNING_CONFIRMED.json',statuses)
    write(TASK/'SAMSUNG_ACTIVE_COLLECTION.json',{'device':DEVICE,'plan':str(OUT/'production/PLAN.json'),'segmentPlan':str(OUT/'SEGMENT_PLAN.json'),'remoteRoot':REMOTE,'range':[1001,2000],
       'status':str(OUT/'RUNNING_CONFIRMED.json'),'report':str(OUT/'REPORT.md'),'sourceJobsSha256':sha(TASK/'JOBS.json'),'replay':'disabled_by_user'})
    tests='\n'.join(f'|{r["sequence"]}|{r["initialPlayers"]}|{r["actions"]}|{r["attemptId"]}|' for r in sorted(pref['results'],key=lambda r:r['sequence']))
    report=f'''# 三星第1001—2000局独立采集已下发

本次用户授权日期为2026-10-28。运行核对时间为{stamp}。设备为三星Note8 `SM-N9500`，序列号 `{DEVICE}`，Android9/API28。全部1000父局配置、代码、困难HTML、原生配置、保活辅助、日志检查和本地门禁已上传并逐文件核对SHA，最高2个worker；手机当前自行运行，电脑和本对话可以退出。

正式目录：`{REMOTE}`。两份分片为其 `-w00` 与 `-w01` 目录，各500父局，使用 `net.toyknight.aeii.worker11/worker12`。没有重新安装APK，原用户游戏及旧任务原件保留。本阶段没有连接或操作小米。

## 正式配额与身份

执行局号来自冻结的 `EXECUTION_SEQUENCE.json`，不是设计槽位文件的行号。1001—2000局为正常100、参数100、残局300、多单位200、高阶100、技能100、建筑100；实际双人400、三人300、四人300。完整job字段与修复后的权威JOBS逐项一致，保留slotId、种子、setup、完整state和初态SHA。第2001—3000局未指定设备，没有下发。

仍调用APK原始 `c.a.b.c.j.b.call`，保留困难Java回退和真实路径计数。没有修改困难AI评分或随机策略；JavaScript仍使用原WebView随机源。人口20/30/50的原生配置、HTML常量、只读标记和实际首决策回读一致。每局核对地图字节、活跃阵营、独立联盟、队长、完整原生单位字段、人口、金币、建筑、墓地、回合与待处理状态，初始化结算一次，投影后不再次发放收入。

## 先测试，再正式下发

设备端非root保活接口权限、应用UID下日志审核、资源/CPU守护与shell语法检查通过。1000份任务字段和配额检查通过。1001起始编号的42局门禁合成检查通过，验证单局失败保留缺口、整格没有自然终局时仅暂停该格。检查没有执行任何游戏动作或重放。

三个实际测试父局均属于本批正式配额，全部自然完成：

|执行局号|实际阵营|提交动作|成功尝试|
|---|---:|---:|---|
{tests}

三局均通过首决策实际初态、全部文件SHA、gzip、动作索引、状态帧数、自然终局和线程退出核对。其成功记录、全部失败尝试、已启动账本一并带入正式队列，因此只再启动其余997个父局，不重采这三个成功局或重置预算。失败尝试单列，不能算自然结果。

## 独立运行证据

测试队列和正式队列都已在启动ADB shell退出后，从独立连接读取进度。正式总调度PID为{offline['master']['pid']}，PPID为1、TTY为0，标准输入为 `/dev/null`，标准输出/错误均在手机任务目录。Gadget在应用进程内读取本地脚本，控制器从手机文件复制输入，没有电脑Frida会话、主机循环、网络转发或在线对话依赖。

正式队列锁屏25秒内真实动作继续推进；屏幕OFF/Dozing证据在观察快照。CPU触及90%后自动逐档降至1/0，并在低负载冷却后自行恢复，未放宽保护阈值。此项验证的是会话独立和锁屏续跑，尚未真正物理拔线测试。

## 守护与停止边界

最高2worker，CPU达到90%降档，低于75%持续30秒并满足冷却后逐档恢复；失败密集也会降档。温度45℃暂停/42℃恢复，电量低于20%暂停/25%恢复，空间低于2GiB暂停/2.25GiB恢复。设备初检可用约18.2GiB，空间裕度明显高于早期日志估算；手机应持续供电，断开电脑后改接充电器。

每父局最多3次实际启动，账本在 `STARTED_ATTEMPTS/<执行局号>/`；配置预留不计启动，分配ID与实际runOrdinal分别记录。每次最多20000动作与6小时有效运行，资源/CPU暂停不计有效时间。截断不重采，失败预算耗尽不换seed补局。前42局每格两父局结案后在手机本地检查，有自然完成证据的格继续；没有自然完成证据的格单列暂停。最终自然完成数不足1000时必须按原槽位报告缺口，不冒充完成。

## 启动交付快照

已取回并核对{index['syncedNaturalParents']}个唯一自然完成父局（包含上述3个测试父局），失败尝试{len(index['failedAttempts'])}次另存；该数字不是本批最终结果。原始尝试继续保存在手机应用私有 `files/.aeii-hard-production/<attemptId>/`，电脑已取回的数据在本目录 `parents/`。当前取回样本的重复轨迹分组为{len(index['duplicateTrajectoryGroups'])}组，不据此声称全部1000条轨迹独立，也不重采成功重复局。

重连后的只读查询：

```powershell
python -X utf8 tools/phone_training_hard/curriculum_v1/samsung/verify.py snapshot --label production
python -X utf8 tools/phone_training_hard/curriculum_v1/samsung/sync.py
```

旧 `second_device/control.py` 仍指向旧采集，不能用它查询本轮。不要重复prepare/deploy/promote。

strict、forced、APK原生重放均为 `disabled_by_user`，不留自动补跑依赖。没有训练、生成张量、改模型或自动数据集准入；既有训练/dev分区保持。按用户要求，下发核验完成后结束本对话，不创建持续监控或电脑侧后台驱动；手机采集继续。
'''
    with (OUT/'REPORT.md').open('x',encoding='utf-8',newline='\n') as f:f.write(report)
    status_path=ROOT/'ai_training/status/CURRENT.md';raw=status_path.read_bytes();marker='<!-- hard-curriculum7-samsung-20261028 -->'
    if marker.encode() not in raw:
        entry=f'''\n{marker}
## 2026-10-28 七类困难场景三星第二批已独立下发

设备`{DEVICE} / SM-N9500`，新执行局号1001—2000、最高2worker，全部资源已下发到`{REMOTE}`。双人/三人/四人三个本批父局均自然完成并核对原始文件；成功与实际启动账本复用，不额外采父局。锁屏和启动会话退出后继续推进，PPID1，电脑/USB/网络转发/对话不参与运行；物理拔线未实测。当前已取回{index['syncedNaturalParents']}局为带时间快照，实时状态读手机新root。资源守护和每父局三次实际启动上限保留，失败/截断单列；未训练或重放，第三批未下发。用户要求下发后结束对话，手机任务继续。详见[报告](../hard_curriculum3000_execution_20261027/samsung-v1/REPORT.md)与[本轮路由](../hard_curriculum3000_execution_20261027/SAMSUNG_ACTIVE_COLLECTION.json)。小米本阶段未操作，不能据此更新其实时进度。
{marker.replace('<!-- ','<!-- end-')}
\n'''
        at=raw.index(b'\n')+1;status_path.write_bytes(raw[:at]+entry.replace('\n','\r\n').encode('utf-8')+raw[at:])
    manifest=[]
    for p in sorted(OUT.rglob('*')):
        if p.is_file() and p.name not in ['DELIVERY_MANIFEST.json','ADB_COMMANDS.jsonl'] and '__pycache__' not in p.parts:
            manifest.append({'path':str(p.relative_to(OUT)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':sha(p)})
    write(OUT/'DELIVERY_MANIFEST.json',{'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'snapshot':True,'phase':'deployed_running','files':manifest,'replay':'disabled_by_user'})
    print(json.dumps({'report':str(OUT/'REPORT.md'),'device':DEVICE,'dispatched':1000,'workers':2,'verifiedNaturalParents':index['syncedNaturalParents'],'computerRequired':False,'deliveryFiles':len(manifest)},ensure_ascii=False))
if __name__=='__main__':main()
