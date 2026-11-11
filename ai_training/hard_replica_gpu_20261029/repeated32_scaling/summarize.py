"""汇总顺序完整单批；仅核对记录摘要，不执行游戏回放。"""
import json, math, hashlib, gzip
from pathlib import Path
P=Path(__file__).resolve().parent
ROOT=P.parents[2]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while b:=f.read(1048576):h.update(b)
    return h.hexdigest()
def summarize(n):
    d=P/f'batch-{n}';m=read(d/'CPU_GPU_MEASUREMENT.json');r=read(d/'RESULTS.json');p=read(d/'PROGRESS.json');run=read(d/'RUN.json')
    assert m['exitCode']==0 and p['phase']=='complete' and run['singleBatch'] and not run.get('maxActions') and not run['verify']
    assert len(r)==n and run['limit']==run['workers']==p['maxActive']==n and run['repeatFirst']==32
    assert all(x['natural'] and not x['error'] for x in r) and sum(x['steps'] for x in r)==44310*(n//32)
    assert sorted(x['executionSequence'] for x in r)==list(range(2001,2001+n)) and all(x['attempt']==1 for x in r)
    nodes=[x for x in m['processes'] if x['name'].lower()=='node.exe'];cpu=sum(x['cpuSeconds'] for x in nodes);wall=m['totalWallSeconds']
    samples=[json.loads(x) for x in (d/'CPU_TIMESERIES.jsonl').read_text().splitlines()]
    begin=p['measurementStartedAt']/1000;end=begin+p['measuredSeconds']
    gpu=[json.loads(x) for x in (d/'EXTERNAL_GPU.jsonl').read_text().splitlines()];gpu=[x for x in gpu if begin<=x.get('epoch',0)<=end]
    v=sorted(x['processMaxEnginePercent'] for x in gpu if x.get('available'))
    ios={k:sum(x['io'][k] for x in nodes) for k in ['readOperations','writeOperations','readBytes','writeBytes','otherOperations','otherBytes']}
    steps=sum(x['steps'] for x in r);natural=sum(x['natural'] for x in r)
    return dict(workers=n,totalSeconds=wall,phaseSeconds=p['measuredSeconds'],actions=steps,natural=natural,nonNatural=[{k:x[k] for k in ['executionSequence','steps','stop','error']} for x in r if not x['natural']],cpuSeconds=cpu,cpuAveragePercent=cpu/wall/m['logicalProcessors']*100,cpuPeakPercent=max(sum(x['normalizedPercent'] for x in s['processes'] if x['name'].lower()=='node.exe') for s in samples),rssPeakBytes=max(x['peakRss'] for x in nodes),rssAverageBytes=sum(sum(x['rss'] for x in s['processes'] if x['name'].lower()=='node.exe') for s in samples)/len(samples),gpuAveragePercent=sum(v)/len(v) if v else None,gpuP95Percent=v[math.ceil(.95*len(v))-1] if v else None,gpuPeakPercent=max(v) if v else None,gpuValidSamples=len(v),gpuUnknownSamples=len(gpu)-len(v),systemCpuAveragePercent=m['systemCpuAveragePercent'],backgroundCpuAveragePercent=sum(max(0,s['systemCpuPercent']-sum(x['normalizedPercent'] for x in s['processes'])) for s in samples[1:])/len(samples[1:]),io=ios,actionsPerSecond=steps/wall,naturalPerHour=natural/wall*3600,recordWriteOperations=sum(x['recording']['members'] for x in r),recordRawBytes=sum(x['recording']['rawBytes'] for x in r),recordCompressedBytes=sum(x['recording']['compressedBytes'] for x in r),artifactBytes=sum(f.stat().st_size for f in d.rglob('*') if f.is_file()),identity=run['identity'],gpu=p['gpu'])
results=[summarize(n) for n in [32,64,128]]
assert all(r['identity']==results[0]['identity'] for r in results)
for file,value in results[0]['identity']['sources'].items():assert sha(ROOT/file)==value,file
checks=[]
for n in [32,64,128]:
    for index in range(n):
        seq=2001+index;source=2001+index%32
        left=P/'batch-32'/f'parent-{source}/attempt-1';right=P/f'batch-{n}'/f'parent-{seq}/attempt-1'
        job=read(right/'job.json');original=read(left/'job.json')
        assert job['benchmarkSourceSequence']==source and job['benchmarkReplica']==index//32+1
        for key in ['benchmarkSourceSequence','benchmarkReplica','executionSequence']:job.pop(key);original.pop(key)
        assert job==original
        hashes={}
        for name in ['initial.json','final.json','decisions.jsonl.gz']:
            h=sha(left/name);assert h==sha(right/name),(n,seq,name);hashes[name]=h
        lr=read(left/'result.json');rr=read(right/'result.json')
        for key in ['steps','stop','winner','finalSha256','telemetry']:assert lr[key]==rr[key]
        checks.append(dict(workers=n,sequence=seq,source=source,hashes=hashes))
for seq in range(2001,2033):
    for name in ['initial.json','final.json','decisions.jsonl.gz']:
        assert sha(P/'batch-32'/f'parent-{seq}/attempt-1'/name)==sha(P/'../cpu_v5/candidate_full'/f'parent-{seq}/attempt-1'/name)
(P/'IDENTITY_CHECKS.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
(P/'COMPARISON.json').write_text(json.dumps(dict(runs=results,physicalDiskIoMeasured=False,sharedRecordComparisons=len(checks),production='paused'),indent=2),encoding='utf-8')
cols=[]
base=results[0]['totalSeconds']
def add(label,fn):cols.append('|'+label+'|'+'|'.join(str(fn(r)) for r in results)+'|')
add('总耗时（秒）',lambda r:round(r['totalSeconds'],2));add('对局阶段（秒）',lambda r:round(r['phaseSeconds'],2));add('自然结束／其他',lambda r:f"{r['natural']}／{len(r['nonNatural'])}")
add('总动作',lambda r:r['actions']);add('动作／秒',lambda r:round(r['actionsPerSecond'],2));add('自然局／小时',lambda r:round(r['naturalPerHour'],2));add('累计CPU秒',lambda r:round(r['cpuSeconds'],2));add('CPU平均／峰值',lambda r:f"{r['cpuAveragePercent']:.2f}%／{r['cpuPeakPercent']:.2f}%");add('GPU平均／P95／峰值',lambda r:f"{r['gpuAveragePercent']:.2f}%／{r['gpuP95Percent']:.2f}%／{r['gpuPeakPercent']:.2f}%");add('GPU有效／未知样本',lambda r:f"{r['gpuValidSamples']}／{r['gpuUnknownSamples']}");add('RSS平均／峰值 GiB',lambda r:f"{r['rssAverageBytes']/1024**3:.2f}／{r['rssPeakBytes']/1024**3:.2f}")
add('进程读／写操作',lambda r:f"{r['io']['readOperations']}／{r['io']['writeOperations']}");add('进程读／写 MiB',lambda r:f"{r['io']['readBytes']/1024**2:.2f}／{r['io']['writeBytes']/1024**2:.2f}");add('日志追加次数',lambda r:r['recordWriteOperations']);add('日志压缩后 MiB',lambda r:round(r['recordCompressedBytes']/1024**2,2));add('本批落盘文件合计 MiB',lambda r:round(r['artifactBytes']/1024**2,2));add('整机平均CPU',lambda r:f"{r['systemCpuAveragePercent']:.2f}%");add('近似背景平均CPU',lambda r:f"{r['backgroundCpuAveragePercent']:.2f}%")
add('相对32并发总耗时倍数',lambda r:round(r['totalSeconds']/base,3));add('相对吞吐倍率',lambda r:round((r['workers']/32)*base/r['totalSeconds'],3));add('每32局等效秒',lambda r:round(r['totalSeconds']/(r['workers']/32),2))
text='''# 同一32局重复1／2／4份：32／64／128并发完整单批比较

2026-10-29，北京时间。正式采集保持暂停。三组按32、64、128顺序独立运行，同一cpu_v5源码、原生二进制、GPU内核与冻结job文件，每worker一次一局、不补局、不设100步上限。各组均取2001—2032号相同32个job，分别重复1／2／4份，全部副本同时派发。每个副本保留原父局标识、地图、初态、种子和原异常保护，只分配独立测试编号及输出目录。使用native、GPU范围／距离场、共享地图／worker源码、1 MiB完整记录块。

|指标|32并发|64并发|128并发|
|---|---:|---:|---:|
'''+ '\n'.join(cols)+'''

CPU为被测Node累计时间归一到16逻辑处理器，包含C++，不重复相加；峰值为约1秒采样。内存是Node工作集RSS，不是系统已提交内存或显存。GPU为Windows PDH当前进程最大引擎占用，未知不补0；50%为软目标。总墙钟包含初始化／退出观察，轮询约1秒误差，另列对局阶段。

硬盘数据采用Windows进程I/O计数，可能包含设备／管道与文件缓存，不是SSD物理读写、活跃时间或延迟。日志追加和压缩字节直接来自记录器；本批文件总量含日志、身份、进度与外部采样文件。没有进行磁盘清理。

各组场景组成、难度与随机流完全相同，总工作量是1／2／4倍。总耗时倍率衡量增加并发后的整批延迟；相对吞吐倍率=(并发数/32)×T32/T组，1代表吞吐不变。每32局等效秒为整批时间除以副本份数，不是单个对局的延迟。三档各运行一次，机器后台负载仍会影响结果。本任务各批未互相重叠，没有构建或验证负载重叠。

224个副本逐份核对实际job输入（剔除独立测试编号与副本标记）、初态、终态、完整压缩日志SHA一致；基准32局另与cpu_v5最终结果核对；比较仅读取和摘要，不执行历史游戏回放。[机器汇总](COMPARISON.json)、[身份核对](IDENTITY_CHECKS.json)、各批逐秒CPU/GPU、RUN、RESULTS与日志原件保留。

非自然结果：
'''+json.dumps([{ 'workers':r['workers'],'results':r['nonNatural']} for r in results],ensure_ascii=False,indent=2)+'''

没有恢复正式production-v2、清空attempt或覆盖旧RUN；没有手机操作、训练、生成张量、改变2414／268分区或执行strict／forced／APK原生历史回放。
'''
(P/'REPORT.md').write_text(text,encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['workers','totalSeconds','natural','actions','cpuAveragePercent','gpuAveragePercent','rssPeakBytes','io']} for r in results]))
