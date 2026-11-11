"""保存平衡配置的工程与正式续跑证据；不再轮询训练。"""
import datetime as dt
import json
import shlex
from device import HERE,DATA,REMOTE,STAGE3,ssh,save
from prepare_inputs import PAYLOAD,read,sha

bench=read(HERE/'TUNING_BENCHMARK.json');applied=read(HERE/'TUNING_APPLIED.json');live=read(HERE/'TUNING_LIVE_VERIFIED.json')
assert bench['passed'] and applied['passed'] and live['passed'] and live['monitoringStopped']
assert live['averageWholeCpuPercent']<=55 and live['p95WholeCpuPercent']<=70
assert sha(PAYLOAD/'MAC_CONTRACT.json')==applied['newContractSha256']
runtime=read(PAYLOAD/'MAC_RUNTIME.json')
assert runtime['cpuThreads']==2 and runtime['encoderProcesses']==2
baseline=next(r for r in bench['results'] if r['passed'] and r['threads']==4 and r['workers']==1)
chosen=bench['chosen'];speedup=baseline['secondsPerUpdate']/chosen['secondsPerUpdate']
result=dict(schema='mac-balanced-tuning-active-v3',active=True,localTime=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
    cpuThreads=2,encoderWorkers=2,trainingProcesses=1,effectiveBatch=32,microbatch=8,
    sourceUpdate=applied['sourceUpdate'],sourceCheckpointSha256=applied['sourceCheckpointSha256'],
    macContractSha256=applied['newContractSha256'],branchId=runtime['branchId'],
    engineeringBaselineSecondsPerUpdate=baseline['secondsPerUpdate'],engineeringChosenSecondsPerUpdate=chosen['secondsPerUpdate'],
    engineeringThroughputRatio=speedup,engineeringAverageWholeCpuPercent=chosen['averageWholeCpuPercent'],
    liveStartUpdate=live['startUpdate'],liveEndUpdate=live['endUpdate'],lastObservedUpdate=live['lastObservedUpdate'],
    liveSecondsPerUpdate=live['secondsPerUpdate'],liveAverageWholeCpuPercent=live['averageWholeCpuPercent'],
    liveP95WholeCpuPercent=live['p95WholeCpuPercent'],livePeakRssBytes=live['peakRssBytes'],
    latestCheckpoint=live['latestCheckpoint'],resource=live['resource'],
    estimatedRemainingHours=(100000-live['lastObservedUpdate'])*live['secondsPerUpdate']/3600,
    targetUpdates=100000,learningRateAndPriorScheduleNotReset=True,orderedSamplesVerified=True,
    firstGradientRelativeL2=chosen['firstGradientRelativeL2'],fullResumeVerified=True,engineeringModelsPromoted=False,
    monitoringStopped=True,trainingStopped=False,noFuturePollingScheduled=True,phoneNotModified=True,sealedTestsRun=0,
    previousSourceBackup=applied['oldSourcesAndStopPreserved'],
    proofs={name:sha(HERE/name) for name in ['TUNING_PAUSE.json','TUNING_BENCHMARK.json','TUNING_APPLIED.json','TUNING_LIVE_VERIFIED.json']})
save(HERE/'ACTIVE_TUNING.json',result);save(DATA/'ACTIVE_TUNING.json',result)
ssh('printf %s '+shlex.quote(json.dumps(result,ensure_ascii=False,indent=2))+' > '+REMOTE+'/ACTIVE_TUNING.json')
table='\n'.join(f'| {r["threads"]} | {r["workers"]} | {r["secondsPerUpdate"]:.4f} | {r["averageWholeCpuPercent"]:.1f}% | {r["p95WholeCpuPercent"]:.1f}% | {r["peakRssBytes"]/2**30:.2f} |' for r in bench['results'] if r['passed'])
report=f'''# Mac线程及编码worker调优

按用户“测试后采用最佳配置，尽量不要满载”的要求，已选择并恢复 **1训练进程＋2计算线程＋2编码worker**。监听已结束，正式训练继续；三星任务没有修改。

原Mac正式进程在10958更新、350656样本完整保存退出，断点SHA `{applied['sourceCheckpointSha256']}`。旧源码、配置、合同、导出权重、暂停标记及指针原件保存在 `{applied['oldSourcesAndStopPreserved']}`。调优后从原模型、AdamW、scheduler、采样器和RNG续接，不从4500重新训练，也没有重置100k退火日程。新增衔接合同只允许唯一该SHA/旧合同/更新数三者同时匹配的来源。最终合同SHA `{applied['newContractSha256']}`。

六组工程对照均从该暂停点恢复，每组8更新预热＋80更新计时，使用完全相同的88批、2816个样本及原prior-dropout顺序。工程模型标记engineeringOnly且不可晋升，不计正式模型更新；正式模型继续使用暂停点原件。跨worker的张量与源身份摘要、样本顺序、采样器和dropout状态全部一致。相同4线程下，1/2/4 worker执行88更新后的模型与AdamW均逐位相同。所选2线程首步梯度相对原4线程基准L2差异为{chosen['firstGradientRelativeL2']:.9g}，低于1e-4门槛。游戏引擎、编码合同、训练目标和有效批量没有修改。

| 计算线程 | 编码worker | 秒/更新 | 整机CPU平均 | 整机CPU P95 | 训练峰值RSS GiB |
|---:|---:|---:|---:|---:|---:|
{table}

选择规则：仅考虑整机平均CPU≤55%、P95≤70%、热压力低于严重级别的配置；距离最快合格配置不超过10%时优先CPU和内存占用更低者。本次2线程2worker同时取得最快短基准速度及较低占用，同批数据吞吐约为原4线程1worker的{speedup:.3f}倍。此为短基准结果，不保证所有后续样本取得同一加速倍率。

实现保持单个AdamW优化器，编码池由两个独立Node权威引擎进程组成；每批32请求分成有序分片并行读取，再按原顺序合并。采样器只在主进程推进，worker不抽样、不改变随机状态。前反向仍是四个真实8样本微批，损失分母取完整32样本，单候选策略mask、先验dropout与既定日程不变。CPU线程、OMP和Accelerate线程环境均统一为2；没有提高系统优先级、使用sudo或修改全局电源策略。

部署后完成一次真实10959更新、保存退出，再由LaunchAgent恢复该点。模型、AdamW、CPU RNG、采样器及dropout精确恢复已验证。随后正式{live['startUpdate']}→{live['endUpdate']}共200更新，平均{live['secondsPerUpdate']:.6f}秒/更新、{live['updatesPerSecond']:.3f}更新/秒；整机CPU平均{live['averageWholeCpuPercent']:.2f}%、P95 {live['p95WholeCpuPercent']:.2f}%，相关进程峰值RSS {live['peakRssBytes']/2**30:.2f}GiB，热压力{live['resource']['thermalState']}（正常）。末次观测{live['lastObservedUpdate']}更新。实际续跑分布与工程基准不同，性能以各自窗口为准。

最新已核验完整永久断点为{live['latestCheckpoint']['updates']}更新，检查点runtime记录2线程、合同身份正确。每500更新永久保存、300秒双槽恢复、低电量/磁盘/严重热压力保护与100k边界继续生效，继承原开发早停。按正式验证窗口粗估剩余约{result['estimatedRemainingHours']:.2f}小时，后续样本与诊断/资源等待可能改变。没有安排后续轮询；Mac本机控制器、日志和保护正常继续。仍建议接电、保持开盖。没有执行封存验收、候选实战或应用模型部署。

当前记录：ACTIVE_TUNING.json。原始工程结果：TUNING_BENCHMARK.json。正式续跑与CPU样本：TUNING_LIVE_VERIFIED.json。源码路径和SSH入口保持原Mac下发目录不变。
'''
(HERE/'TUNING_REPORT.md').write_text(report,'utf-8');(DATA/'TUNING_REPORT.md').write_text(report,'utf-8')
for report_path in [HERE/'REPORT.md',DATA/'REPORT.md']:
    previous=report_path.read_text('utf-8')
    report_path.write_text('最新：按用户授权已调为2计算线程＋2编码worker；正式恢复和200更新占用验证通过，监听已停止，训练继续。当前配置与实测见同目录TUNING_REPORT.md及ACTIVE_TUNING.json。下文为首次下发历史记录。\n\n'+previous,'utf-8')
handoff=STAGE3/'HANDOFF.md';old=handoff.read_text('utf-8')
entry=f'''2026-10-30最新Mac平衡调优：用户授权测试后选择有CPU余量的配置。Mac已在10958更新完整暂停、备份旧代码与状态，六组工程对照后采用1训练进程＋2计算线程＋2编码worker。编码样本/顺序和采样随机状态核验一致；工程权重未晋升。已从原点正式完成10959、闭合并由LaunchAgent精确恢复，不重置学习率或prior日程。新合同 `{applied['newContractSha256']}`。正式额外200更新平均{live['secondsPerUpdate']:.6f}秒/更新，整机平均CPU{live['averageWholeCpuPercent']:.2f}%、P95 {live['p95WholeCpuPercent']:.2f}%；末次观测{live['lastObservedUpdate']}更新。监听已结束，训练继续，三星未修改。当前信息优先读 `macbook_air_v1/ACTIVE_TUNING.json`、`macbook_air_v1/TUNING_REPORT.md`，旧DELIVERY/500测速为历史；不要恢复旧运行配置、重新启动重复训练或新增自动监听。Mac仍在原目录，用户LaunchAgent标识不变。

'''
handoff.write_text(old.replace('# 第三阶段当前接手入口\n\n','# 第三阶段当前接手入口\n\n'+entry,1),'utf-8')
print(json.dumps({k:result[k] for k in ['active','cpuThreads','encoderWorkers','lastObservedUpdate','liveSecondsPerUpdate','liveAverageWholeCpuPercent','liveP95WholeCpuPercent','engineeringThroughputRatio','monitoringStopped','trainingStopped']}),flush=True)
