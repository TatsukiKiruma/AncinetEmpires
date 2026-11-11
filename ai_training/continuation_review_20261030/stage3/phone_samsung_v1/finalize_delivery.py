"""只在真实部署、完整恢复和断ADB运行均通过后签发可拔线交接。"""
import datetime as dt
import json
import shlex
from device import HERE,save
from prepare_data import STAGE3,BASE,read,sha
from runtime_setup import termux
from linux_setup import PHONE
from handoff_verify import get,metric

def main():
    proofs=['DEPLOY_VERIFIED.json','PROBE_PASSED.json','INDEPENDENT_SESSION.json','SINGLETON_VERIFIED.json','ADB_DISCONNECT_VERIFIED.json']
    for name in proofs:assert read(HERE/name)['passed'],name
    pilot=read(HERE/'FORMAL_PILOT.json');assert pilot['updates']==2762
    assert read(BASE/'run-v2-batch8/PIPELINE_STATUS.json')['status']=='stopped'
    runtime=read(BASE/'phone_samsung_v1/payload/PHONE_RUNTIME.json')
    assert sha(STAGE3/'SCIENCE_CONTRACT.json')==runtime['hostScienceContractSha256']
    current=metric();progress=get('work/training/PROGRESS.json');resource=get('work/training/RESOURCE.json');checkpoint=get('work/training/LATEST.json')
    assert current['update']>2762 and current['samples']==current['update']*32
    assert progress['phase']=='training' and resource['valid']
    assert termux('test ! -e '+PHONE+'/work/STOP && test ! -e '+PHONE+'/work/training/BLOCKED.json && echo READY')=='READY'
    lines=termux('ls -t '+PHONE+'/work/training/METRICS-*.jsonl | head -1 | xargs tail -10')
    records=[json.loads(line) for line in lines.splitlines()]
    elapsed=records[-1]['phoneWallSeconds']-records[0]['phoneWallSeconds']
    count=records[-1]['update']-records[0]['update']
    average=elapsed/count if count else None
    result=dict(schema='samsung-offline-delivery-v1',readyToDisconnect=True,
        localTime=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),serial='ce071717887a94940b7e',model='SM-N9500',
        phoneRoot=PHONE,hostPausedUpdate=2761,hostTrainingStopped=True,hostHeartbeatPaused=True,
        targetUpdates=100000,latestObservedUpdate=current['update'],latestObservedSamples=current['samples'],
        latestCheckpoint=checkpoint,resource=resource,controller=get('CONTROLLER_IDENTITY.json'),
        observedAverageSecondsPerUpdate=average,observedWindowUpdates=count,
        nominalRemainingDays=(100000-current['update'])*average/86400 if average else None,
        estimateExcludesThermalAndResourceWaiting=True,
        fullResumeExact=True,priorAndLr100kSchedulePreserved=True,computerRequired=False,networkRequired=False,
        wallSeconds=None,physicalUsbUnplugTested=False,adbDisconnected40SecondsPassed=True,
        engineeringStatesNotPromoted=True,sealedStateTransferred=0,sealedTestsRun=0,
        developmentArenaAfterReturn=True,noAutomaticResultTransfer=True,userWillNotifyReturn=True,
        mobileContractSha256=read(HERE/'PACKAGE.json')['mobileContractSha256'],proofs={name:sha(HERE/name) for name in proofs})
    receipt=json.dumps(result,ensure_ascii=False,indent=2)
    termux('printf %s '+shlex.quote(receipt)+' > '+PHONE+'/DELIVERY_RECEIPT.json')
    save(HERE/'DELIVERY.json',result);save(HERE/'SAFE_TO_DISCONNECT.json',result)
    report=HERE/'PHONE_DISPATCH_REPORT.md'
    text=report.read_text('utf-8').replace('状态：完整任务包正在下发和核验，尚未确认可以拔线。最终就绪以同目录 `SAFE_TO_DISCONNECT.json` 为准。',
        f'状态：已交付，可以拔线。{result["localTime"]} 现场观察累计 {current["update"]} 更新、{current["samples"]} 样本，三星本地独立续训中。详见同目录 `SAFE_TO_DISCONNECT.json`。')
    text+='\n验收证据：主机/手机编码字节完全相同；前向最大绝对误差3.814697265625e-5；微批8与全批32梯度相对L2为5.871529883198681e-7；与原网络相对L2为1.205479328639361e-6。保存恢复后的下一次更新模型和AdamW均逐位一致。正式2762完整断点经关闭进程、重新启动控制器后精确恢复。控制器PPID=1、独立会话、无终端、stdin=/dev/null、stdout/stderr指向手机日志；重复开机入口没有新增训练器。熄屏并停止电脑ADB服务40秒期间，训练更新继续增加，Termux部分唤醒锁仍持有。没有执行物理拔线或物理重启测试。\n'
    if average:text+=f'\n最近{count}次更新平均约{average:.2f}秒，按短窗口外推剩余约{result["nominalRemainingDays"]:.1f}天。样本开销、热降频和资源等待会改变时长；100k为目标，允许既定开发早停。通知每分钟刷新，本地进度每10次更新刷新。\n'
    report.write_text(text,'utf-8')
    handoff=f'''# 第三阶段当前接手入口

最新用户要求已执行：电脑暂停，三星独立离线续训，目标累计100k，允许超过12小时。用户通知后才取回成果；不要恢复主机训练或自动取回。手机交付已通过，可拔线。当前观测累计{current['update']}更新、{current['samples']}样本，完整交付见 `phone_samsung_v1/PHONE_DISPATCH_REPORT.md` 和 `phone_samsung_v1/SAFE_TO_DISCONNECT.json`。

主机在2761更新、88352样本完整安全点闭合。检查点：`D:/AncientEmpiresData/continuation_stage3_20261030_v1/run-v2-batch8/training/checkpoint-02761-fefbb2c8a29c4393abb2ff00562824f8.pt`，SHA256 `865312b2a0950f180d2e374e457f41d3d8c72f1688095d4ca5400ff3ce1db360`。100k日程没有重启或拼接。同臂主机累计894.5950205秒。原84更新串行记录和v2原件均保留。PIPELINE_STATUS为stopped/explicit_stop，自动跟进100k已PAUSED。阶段一、二和原2414起点未修改。

手机：SM-N9500/Android9/ARM64，ADB序列号ce071717887a94940b7e，任务根目录 `{PHONE}`。非root Termux0.118.3、Termux:Boot0.8.1、Termux:API0.53.0、私有Ubuntu24.04、Python3.12、PyTorch2.14.0+cpu、NumPy2.5.4、Node22.14。运行时已全部装齐。首次引导失败目录和日志保留；初始化、签名来源、逐文件摘要、CPU网络与断点恢复证据均在手机子目录。仅移除已验证且D盘完整归档的一次传输tar临时副本，没有删除模型或历史证据。

载荷4604训练父局（old2414/new2190）、紧凑3555175位置表、冻结1299态开发张量。完整输入包4.944680960GB、16311文件，SHA逐文件通过。封存测试原态和OMNI测试初态没有打包，最终测试执行次数0。手机保留原effective32、真实micro8、配比、mask、dropout、学习率和先验100k余弦日程；每20k固定开发诊断及原早停，500更新永久检查点、300秒双槽恢复、原子fsync持久化。温度45/42℃、电量20/25%、磁盘2/2.25GiB暂停/恢复。控制器和训练器独立会话、本机stdio、部分唤醒锁、互斥及意外进程退出限3次重试；开机解锁入口已设置，物理重启未测试。

交付工程自检权重明确不可晋升；正式手机从原2761起点完成一次更新至2762、闭合进程后独立控制器恢复。完整模型、AdamW、采样器、dropout和CPU RNG已精确恢复，GPU状态只保留来源原件及身份，未伪称跨硬件GPU随机状态可运行。ADB停止40秒及熄屏期间训练继续推进。原始12小时上限不约束手机墙钟，但更新边界100k和既定早停继续生效。完成保存停止，手机通知用户，不自动传回、不执行实战选择/封存测试、不进入第四阶段。

用户以后通知连接取回时：先只读核验手机DELIVERY_RECEIPT、MOBILE_CONTRACT、检查点链、COMPLETE/RESULT、metrics及RUN_CLOSURE；保留手机原件，复制到新的D盘成果目录并校验SHA。若仍在途先按完整边界停止后取回。继续阶段三开发候选选择：40k/100k及最多一个离线最佳、OMNI开发54局和既有历史40局对照。只在锁定唯一候选及先验后，执行一次329父局封存离线+54局配对最终验收。最终完成前不要记阶段三通过。完成后停所有进程并提交stage3/REPORT.md。禁止自动部署或第四阶段。
'''
    (STAGE3/'HANDOFF.md').write_text(handoff,'utf-8')
    print(json.dumps({k:result[k] for k in ['readyToDisconnect','latestObservedUpdate','latestObservedSamples','observedAverageSecondsPerUpdate','nominalRemainingDays']},ensure_ascii=False))

if __name__=='__main__':main()
