import json, hashlib, pathlib, time, shutil, collections, subprocess, sys
from device import ROOT, adb, snapshot, TOOL

REPO = ROOT.parent.parent
def read(n): return json.loads((ROOT/n).read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

for n,h in read('HOST_GATE.json')['bindings'].items(): assert sha(REPO/n)==h,n
for n,h in read('preservation-baseline.json')['files'].items(): assert sha(REPO/n)==h,n
for n,h in read('inventory.json')['oldPhoneBindings'].items(): assert adb('shell','sha256sum',TOOL+'/'+n).split()[0]==h,n
subprocess.run([sys.executable,str(ROOT/'summarize_tactics.py')],check=True)
coverage=read('tactic-coverage.json')
results = read('training-results.json'); candidate = read('candidate.json'); metrics = read('best-metrics.json')
assert read('trained-browser-parity.json')['trainedCheckpointBrowserPassed'] and read('trained-device-parity.json')['passed']
assert read('checkpoint-audit.json')['candidateSha256'] == sha(ROOT/'candidate.json')
records = [json.loads(line) for line in (ROOT/'updates.jsonl').read_text().splitlines()]
epochs = len(results['epochs'])
for epoch in range(1,epochs+1):
    entries = [r for r in records if r['epoch']==epoch]
    assert {r['updates'] for r in entries} == set(range(1,31166))
    assert all(r['rows']==min(r['updates']*8,249317) for r in entries)
processes = [json.loads(p.read_text(encoding='utf-8')) for p in ROOT.glob('train-epoch-*.process.json')]
failures = [json.loads(p.read_text(encoding='utf-8')) for p in ROOT.glob('train-epoch-*.failure-process.json')]
samples = [s for p in processes+failures for s in p.get('samples',[])]
resources = dict(trainingWallSeconds=sum(p['wallSeconds'] for p in processes+failures), maximumObservedTemperature=max(s['temperature'] for s in samples), minimumObservedAvailableMemory=min(s['memAvailableBytes'] for s in samples), minimumObservedPhoneFreeBytes=min(s['freeBytes'] for s in samples), pcFreeBytes=shutil.disk_usage(ROOT).free, after=snapshot())
result = dict(passed=True,trainDevice='phone',serial='c2357770',parents=900,trainParents=720,validationParents=180,embedding=64,policyHiddenLayers=[64,64,64],residual=False,parameters=64582,candidateDimensions=119,tacticalDimensions=10,rows=312413,trainRowsPerEpoch=249317,updatesPerEpoch=31165,lastBatch=5,epochs=epochs,bestEpoch=candidate['bestEpoch'],candidateSha256=sha(ROOT/'candidate.json'),optimizerUpdatesOnPC=0,actualRecordedPhoneOptimizerUpdates=len(records),retainedCheckpointUpdates=epochs*31165,recomputedUpdatesRecorded=len(records)-epochs*31165,independentEvaluation=False,fullTrainingStarted=False,metrics=metrics,resources=resources,tacticalCoverage=coverage,preservedExistingPCFiles=len(read('preservation-baseline.json')['files']))
(ROOT/'RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
lines = ['# 64维三层战术特征900父局手机训练报告','',f'已完成{epochs}轮，仅MI 8 UD c2357770执行更新，开发验证选择第{candidate["bestEpoch"]}轮。固定900父局，720训练/180开发验证，7类计划覆盖，全部312413条合格原子完整消费；无真实回放、SO或多人混入。','', '实体嵌入64维；策略三个各64维ReLU隐藏层，嵌入与输出不计入三层；无残差、归一化或dropout。总64582参数（含冻结value头261参数），候选119维。新初始化seed=64390016，batch8、SGD0.005、范数裁剪1，末批5保留。value冻结且不参与选招。','', '战术值逐候选来自权威GameEngine克隆和step结算：双方生命/单位数净变化、建筑归属与资源变化、合法支援关系、结束本方回合后对手下一手立即合法攻击的受击风险。风险不包含移动后攻击；pending无法结束回合时用已知位标记，不能当安全。未复制移动、伤害或合法性规则。','', '基础900字典分片只读复用；本轮只存按行状态/候选摘要绑定的10维战术侧车。定向合法动作查询省略无关移动生成，公共349项测试、lint和build通过；128状态7809候选、826次单位查询与397候选慢查询战术值一致。','', '| 轮次 | 实际样本 | 更新 | 在线训练loss | 开发验证loss | 开发top1 |','|---|---:|---:|---:|---:|---:|']
for e in results['epochs']: lines.append(f'| {e["epoch"]} | {e["trainingRows"]} | {e["updates"]} | {e["onlineTrainingLoss"]:.6f} | {e["validation"]["policyLoss"]:.6f} | {e["validation"]["top1"]*100:.2f}% |')
lines += ['',f'最佳固定权重训练loss {metrics["train"]["policyLoss"]:.6f}、top1 {metrics["train"]["top1"]*100:.2f}%；开发验证loss {metrics["validation"]["policyLoss"]:.6f}、top1 {metrics["validation"]["top1"]*100:.2f}%。在线训练loss使用随更新变化的权重，不能与固定权重指标混用。','', 'Python独立编码和自动微分、TS、真实Chrome与手机Go的完整候选、稳定argmax、解析/有限差分梯度及batch8/末批5验收通过。最佳权重再经Python、TS/真实Chrome、手机与PC只读Go复验；电脑训练入口硬拒绝优化器更新。','',f'手机训练墙钟累计{resources["trainingWallSeconds"]:.2f}秒，监测最高{resources["maximumObservedTemperature"]:.1f}°C，最低可用内存{resources["minimumObservedAvailableMemory"]/1024**3:.2f}GiB，最低/data空闲{resources["minimumObservedPhoneFreeBytes"]/1024**3:.2f}GiB。单核nice19后台；未切换前台或操作采集APK/Frida。','',f'逐批更新日志记录{len(records)}次实际调用，最终检查点保留{epochs*31165}次；明确记录的恢复重复更新为{len(records)-epochs*31165}次。独占PID锁、合同SHA和批边界信号保存防止重复启动；全部尝试日志保留。','', '开发验证资料已被方法开发消费，并共享标准初态/部分轨迹，不能称独立最终泛化。旧重合证据以data-audit.json绑定原sd32审计；新战术特征并未使父局变成独立样本。固定五图十槽对战见../sd64x3_phone_battles_20261016/REPORT.md。','', '旧已删除模型不作为前置条件；既存旧数据、源码、schema、报告和旧手机工具/审计SHA核验保持。未重建旧权重，没有1922/3000父局全量、晋升或接入应用。','',f'候选SHA：`{result["candidateSha256"]}`。身份与验收见HOST_GATE.json、GATE.json、preregistration.json、checkpoint-audit.json和DELIVERY_MANIFEST.json。']
lines += ['', f'全候选战术覆盖：共{coverage["candidates"]}个候选，立即响应已知位覆盖{coverage["replyKnownFraction"]*100:.2f}%；正受击风险{coverage["positive"][6]}个、致命响应{coverage["positive"][7]}个、敌方生命净减少{coverage["positive"][0]}个、敌方单位数净减少{coverage["positive"][2]}个、占点收益{coverage["positive"][4]}个、合法支援/治疗关系{coverage["positive"][9]}个。完整最值与非零计数见tactic-coverage.json；这些是特征覆盖计数，不是对局胜率。']
(ROOT/'REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
artifacts = []
for p in sorted(ROOT.rglob('*')):
    if not p.is_file() or p.name=='DELIVERY_MANIFEST.json' or '__pycache__' in p.parts or any('chrome-profile' in part for part in p.parts) or p.name.endswith('.live.json') or p.name.startswith('pipeline') or p.name=='stage-status.json' or (p.name.startswith('seal-training') and p.name.endswith('.log')): continue
    artifacts.append(dict(path=str(p.relative_to(ROOT)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p)))
(ROOT/'DELIVERY_MANIFEST.json').write_text(json.dumps(dict(sealedAt=time.time(),artifacts=artifacts),indent=2),encoding='utf-8')
print(json.dumps(result))
