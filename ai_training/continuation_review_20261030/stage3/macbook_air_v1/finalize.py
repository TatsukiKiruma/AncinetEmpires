"""完成Mac下发交接与单次500更新测速归档，之后不再轮询。"""
import datetime as dt
import json
import shlex
from device import HERE,DATA,REMOTE,STAGE3,ssh,save
from prepare_inputs import PAYLOAD,read,sha

def main():
    monitor=read(HERE/'MONITOR_500_RESULT.json')
    assert monitor['passed'] and monitor['updates']==500 and monitor['monitoringStopped'] and not monitor['trainingStopped']
    names=['MAC_INPUTS_VERIFIED.json','PROBE-cpu.json','FORMAL_PILOT.json','INDEPENDENT_SESSION.json','SINGLETON_VERIFIED.json','SSH_DISCONNECT_VERIFIED.json','DEVICE_SELECTION.json','LAUNCH_AGENT.json','MONITOR_500_RESULT.json']
    for name in ['MAC_INPUTS_VERIFIED.json','PROBE-cpu.json','INDEPENDENT_SESSION.json','SINGLETON_VERIFIED.json','SSH_DISCONNECT_VERIFIED.json']:
        assert read(HERE/name)['passed'],name
    runtime=read(PAYLOAD/'MAC_RUNTIME.json');assert runtime['device']=='cpu'
    assert sha(STAGE3/'SCIENCE_CONTRACT.json')==runtime['hostScienceContractSha256']
    after=monitor['after'];observed=monitor['lastObservedUpdate'];check=after['latestCheckpoint']
    assert after['progress']['phase']=='training' and not after['flags']
    assert check['updates']>=5000 and check['permanent']
    probe=read(HERE/'PROBE-cpu.json');launch=read(HERE/'LAUNCH_AGENT.json')
    result=dict(schema='mac4500-independent-delivery-v1',ready=True,
        localTime=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),host='macbook',user='larovinson',root=REMOTE,
        hardware='MacBook Air M4 16GB',device='cpu',torch='2.14.0',numpy='2.5.4',
        sourceUpdate=4500,sourceSamples=144000,sourceCheckpointSha256=runtime['originalCheckpointSha256'],
        targetUpdates=100000,targetSamples=3200000,latestObservedUpdate=observed,latestObservedSamples=observed*32,
        latestCheckpoint=check,resource=after['resource'],controller=after['controller'],trainer=after['trainer'],launchAgent=launch,
        resumeExact=True,encoderBytesExact=True,singleMeasuredEngineeringUpdateSeconds=probe['singleMeasuredUpdateSeconds'],
        monitorStartUpdate=monitor['startUpdate'],monitorEndUpdate=monitor['endUpdate'],monitorUpdates=500,
        monitorSeconds=monitor['seconds'],secondsPerUpdate=monitor['secondsPerUpdate'],updatesPerSecond=monitor['updatesPerSecond'],
        samplesPerSecond=monitor['samplesPerSecond'],estimatedRemainingHours=monitor['estimatedRemainingHours'],
        monitoringStopped=True,trainingStopped=False,futurePollingScheduled=False,
        sourcePhoneNotStopped=True,sourcePhoneNotModified=True,phoneCurrentProgressNotRead='手机当前未通过USB连接；未发送停止或修改指令',
        windowsRequired=False,networkRequired=False,wallSeconds=None,sealedParentsTransferred=0,sealedTestsRun=0,
        automaticResultsReturn=False,finalGlobalCandidateBudgetUnchanged=True,noStage4=True,
        lidClosureTested=False,physicalRebootTested=False,macContractSha256=sha(PAYLOAD/'MAC_CONTRACT.json'),proofs={name:sha(HERE/name) for name in names})
    receipt=json.dumps(result,ensure_ascii=False,indent=2)
    # 只写交接收据；测速完成后不再查询进度。
    ssh('printf %s '+shlex.quote(receipt)+' > '+REMOTE+'/DELIVERY_RECEIPT.json')
    save(HERE/'DELIVERY.json',result);save(DATA/'DELIVERY.json',result)
    text=f'''# MacBook Air独立续训下发及500更新测速

已从4500完整断点建立独立分支，当前观测{observed}更新、{observed*32}样本。目标累计100000更新、3200000样本，沿用原早停规则。当前仅下发运行和测速完成，阶段三最终验收尚未执行。用户要求的500更新监听已经结束，没有安排后续轮询。

Mac为M4、16GB、macOS26.5.1；通过用户配置的SSH别名macbook、账户larovinson操作。专属根目录：`{REMOTE}`。既有Python3.12和Node复用，Torch2.14.0与NumPy2.5.4装入专属venv。未使用sudo、读取凭据、修改全局Python或系统电源设置。新增专属用户LaunchAgent `{launch['file']}`，用户登录后启动。首次缓慢直连pip下载的日志及预检配置原件均保留，正式环境由本机下载的官方PyPI离线轮子校验安装。

初始完整断点SHA256：`{runtime['originalCheckpointSha256']}`。模型1966910参数、AdamW所有一二阶矩与步数、scheduler、精确采样器游标、dropout RNG和CPU RNG均已恢复。Mac与三星各自继续独立训练，不合并优化器或重复计作同一条续训轨迹。采样old2/new2/new3/new4为0.17/0.17/0.33/0.33，effective32、真实四微批8、单候选策略mask、priorDropout0.25、100k学习率和priorScale余弦日程均不变。原4500步并入累计计数，新增预算95500更新。Mac按用户“同样执行”要求沿用离线100k目标，墙钟不加固定上限，仍执行原开发早停。

输入包4827351040字节、16299文件已在Mac逐文件核SHA，包含4604准入训练父局及固定1299态开发缓存。封存父局原态和OMNI测试初态未装入。MPS预检因scatter_reduce_mps缺少确定性实现失败，原日志及预检合同已归档；采用通过全部门槛的M4 CPU，未降低确定性要求、改用混合精度或修改目标函数。技术参考：[PyTorch2.14 MPS](https://docs.pytorch.org/docs/2.14/notes/mps.html)、[确定性算法说明](https://docs.pytorch.org/docs/2.14/generated/torch.use_deterministic_algorithms.html)。

CPU工程自检：权威编码字节完全相同；前向最大误差{max(probe['hostPhoneForwardMaxErrors'].values()):.8g}；微批8与全批32梯度相对L2为{probe['microVsFullRelativeL2']:.8g}，与原网络为{probe['originalNetworkRelativeL2']:.8g}；下一次更新恢复误差0，模型与AdamW逐位一致。工程权重没有晋升。正式4501更新保存退出后，LaunchAgent从该断点逐位恢复并继续推进。控制器PPID1、训练器独立会话、本机stdio、caffeinate、互斥验证通过。40秒完全不连接SSH期间由4707推进至4799，进程身份不变。最新已持久化完整断点为{check['updates']}更新，SHA `{check['sha256']}`。

500更新测速窗口：{monitor['startUpdate']}→{monitor['endUpdate']}，16000样本，精确训练墙钟{monitor['seconds']:.3f}秒。平均{monitor['secondsPerUpdate']:.6f}秒/更新、{monitor['updatesPerSecond']:.3f}更新/秒、{monitor['samplesPerSecond']:.2f}样本/秒，包含编码等待和周期保存。按该窗口粗估剩余约{monitor['estimatedRemainingHours']:.2f}小时；后续样本、20k开发诊断、热压力和资源等待会改变时长。测速结束后停止外部监听，Mac训练继续。

本机保护：每500更新永久完整断点、每300秒双槽恢复、原子替换与fsync。macOS热压力达到严重(2)时保存等待，降至温暖及以下(≤1)后继续；电量20/25%、剩余空间10/12GiB作为暂停/恢复阈值。保持接电和开盖，屏幕可熄灭；没有执行合盖或物理重启测试。Caffeinate只防止空闲休眠，未调整全局pmset。输入或数值异常保留最后完整断点并阻断，不跳过坏批；单纯进程中断最多恢复三次。完成或原规则早停后保存停止，不自动传回、实战筛选、封存验收或进入第四阶段。

只读查询：`ssh macbook "cd {REMOTE} && runtime/venv/bin/python status.py"`。Mac根目录也有`查看训练.command`，可双击查看状态。需要暂停或取回时再明确通知。两条分支的结果回收后仍按原全局最多三个开发实战候选和唯一一次封存验收规则统一选择，不能因多一个计算设备而重复开启封存测试。

三星任务未被停止或修改。本次最后尝试只读时USB未连接，因此没有声称读取到手机最新进度。Windows原训练和原100k自动跟进保持暂停。
'''
    (HERE/'REPORT.md').write_text(text,'utf-8');(DATA/'REPORT.md').write_text(text,'utf-8')
    handoff=STAGE3/'HANDOFF.md';old=handoff.read_text('utf-8')
    insertion=f'''2026-10-30最新Mac分支：用户授权从4500检查点在MacBook Air独立训练，三星不停止。已在`{REMOTE}`通过用户LaunchAgent启动M4 CPU分支，冻结合同SHA `{result['macContractSha256']}`。MPS因确定性scatter_add未通过，已归档预检并选择通过梯度和逐位恢复验证的CPU。正式4501闭合后由独立进程精确恢复。用户追加要求只监听500更新，已完成{monitor['startUpdate']}→{monitor['endUpdate']}、{monitor['seconds']:.3f}秒，{monitor['secondsPerUpdate']:.6f}秒/更新；当前末次观测{observed}更新。监听已停止，训练继续；不要新增自动跟进。完整证据见 `macbook_air_v1/REPORT.md`、`macbook_air_v1/DELIVERY.json` 和 `macbook_air_v1/MONITOR_500_RESULT.json`。Mac完成后保存停止，待用户通知取回，最终全局候选/唯一封存验收预算不翻倍，未执行任何封存测试。三星未发送停止或修改指令，手机当前未连接USB。Windows训练/自动跟进仍暂停。

'''
    handoff.write_text(old.replace('# 第三阶段当前接手入口\n\n','# 第三阶段当前接手入口\n\n'+insertion,1),'utf-8')
    print(json.dumps({k:result[k] for k in ['ready','device','latestObservedUpdate','monitorStartUpdate','monitorEndUpdate','monitorSeconds','secondsPerUpdate','updatesPerSecond','samplesPerSecond','estimatedRemainingHours','monitoringStopped','trainingStopped']}),flush=True)

if __name__=='__main__':main()
