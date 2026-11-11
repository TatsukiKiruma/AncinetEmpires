import json,hashlib,pathlib,shutil,time
from device import ROOT,adb
REPO=ROOT.parent.parent
def read(n):return json.loads((ROOT/n).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
gate=read('HOST_GATE.json')
for n,h in gate['bindings'].items():assert sha(REPO/n)==h,n
for e in read('phone-audit-archive.json')['artifacts']:assert adb('shell','sha256sum',e['remotePath']).split()[0]==e['sha256']
preserved=[]
for name in ['sd_300_parent_pilot_20261016','sd_300_pilot_battles_20261016']:
    folder=ROOT.parent/name;m=json.loads((folder/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
    for e in m['artifacts']:assert sha(folder/e['path'])==e['sha256']
    preserved.append(dict(directory=name,checkedFiles=len(m['artifacts']),manifestSha256=sha(folder/'DELIVERY_MANIFEST.json')))
results=read('training-results.json');best=read('candidate.json')['bestEpoch'];audit=read('data-audit.json');browser=read('trained-browser-parity.json')
assert browser['trainedCheckpointBrowserPassed'] and read('checkpoint-audit.json')['candidateSha256']==sha(ROOT/'candidate.json')
metrics=read('best-metrics.json') if best else None
processes=[read(f'train-epoch-{e["epoch"]}.process.json') for e in results['epochs']]
partials=[json.loads(p.read_text(encoding='utf-8')) for p in ROOT.glob('train-epoch-*.partial-process.json')]
processes+=partials
samples=[s for p in processes for s in p['samples']]
resource=dict(trainingWallSeconds=sum(p['wallSeconds'] for p in processes),trainingWallSecondsIncludesLowerBound=bool(partials),maximumObservedTemperature=max(s['temperature'] for s in samples),minimumObservedAvailableMemory=min(s['memAvailableBytes'] for s in samples),minimumObservedPhoneFreeBytes=min(s['freeBytes'] for s in samples),minimumPCFreeBytes=shutil.disk_usage(ROOT).free)
result=dict(passed=True,trainDevice='phone',parents=900,trainParents=720,validationParents=180,parameters=20646,hidden=32,candidateDimensions=109,rows=312413,trainRowsPerEpoch=249317,validationRows=63096,updatesPerEpoch=31165,lastBatch=5,epochs=len(results['epochs']),bestEpoch=best,candidateSha256=sha(ROOT/'candidate.json'),fullTrainingStarted=False,independentEvaluation=False,optimizerUpdatesOnPC=0,metrics=metrics,resources=resource,preserved=preserved)
(ROOT/'RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
lines=['# 900父局扩大模型手机训练报告','',f'已完成900父局阶段：720训练、180开发验证；仅MI 8 UD手机执行优化器更新，实际{len(results["epochs"])}轮，最佳第{best}轮。没有进行1922或3000父局全量训练。','', '模型实体维度8→32，候选特征77→109，总参数3566→20646。固定新初始化，batch8、SGD0.005、梯度范数裁剪1；value头冻结，未晋升或接入应用。','', '900父局完整转换312413条合格原子标签；每轮训练249317条、31165次更新，末批5条保留。7类计划在开发验证中均有覆盖；来源reader、权威引擎、候选码与前后态摘要逐条核对通过。','', '| 轮次 | 在线训练loss | 开发验证loss | 验证top1 |','|---|---:|---:|---:|']
for e in results['epochs']:lines.append(f'| {e["epoch"]} | {e["onlineTrainingLoss"]:.6f} | {e["validation"]["policyLoss"]:.6f} | {e["validation"]["top1"]*100:.2f}% |')
lines+=['',f'初始化验证loss为{results["baseline"]["policyLoss"]:.6f}。在线训练loss随训练过程权重变化；最佳checkpoint固定权重的训练/验证指标另存best-metrics.json。', '',f'手机训练进程墙钟合计{resource["trainingWallSeconds"]:.2f}秒，实测最高温度{resource["maximumObservedTemperature"]:.1f}°C。单核低优先级后台，持续监测温度、内存、存储及采集APK；未操作采集APK或Frida。','', '1024条训练用途探针、62886候选完成独立Python/TypeScript/真实Chrome/手机Go前向与梯度验收；批8和末批5的加权梯度通过，训练后最佳权重在Python和真实Chrome复验通过。电脑训练入口硬拒绝优化器更新。','', '验证父局此前已被方法开发消费，且共享标准初态；这是开发验证，不能作为独立最终评测或据loss宣称棋力提升。具体状态/输入重合及重复轨迹见data-audit.json。后续按固定五图交换先后手10槽进行开发实战，结果存独立对战目录。','', '为满足本会话累计512MiB预算，本阶段两份完整逐行审计原件迁存手机独立目录；PC重复副本在手机SHA逐字节验证后移除。恢复路径、字节数和摘要见phone-audit-archive.json。旧模型、数据和报告均保留且封存SHA复核通过。','',f'候选SHA：`{result["candidateSha256"]}`。源码、schema、数据、初始化与工具身份见HOST_GATE.json，文件封存见DELIVERY_MANIFEST.json。']
(ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
artifacts=[]
for p in sorted(ROOT.rglob('*')):
    if p.is_file() and p.name!='DELIVERY_MANIFEST.json' and '__pycache__' not in p.parts and not p.name.endswith('.live.json'):
        artifacts.append(dict(path=str(p.relative_to(ROOT)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p)))
(ROOT/'DELIVERY_MANIFEST.json').write_text(json.dumps(dict(sealedAt=time.time(),artifacts=artifacts,externalArtifacts=read('phone-audit-archive.json')['artifacts']),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
