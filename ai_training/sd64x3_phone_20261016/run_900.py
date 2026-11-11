import pathlib,json,hashlib,subprocess,time,tarfile,io,os,sys
from device import ROOT,REMOTE,ADB,adb,snapshot,suitable,transfer,run

def read(n):return json.loads((ROOT/n).read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()


def payload(config):
    assert suitable(snapshot())
    transfer(['schema.json','initial.json','config.json','GATE.json','kernel.go','main.go','spatial.go','stream.go','lock.go'])
    for i,f in enumerate(config['files']):
        name='tactics/'+pathlib.Path(f['path']).name.replace('.dict.gz','.tac.gz')
        remote=REMOTE+'/'+name
        found=adb('shell','sha256sum',remote,check=False).split()
        if not found or found[0]!=f['tacticSha256']:transfer([name])
        assert adb('shell','sha256sum',remote).split()[0]==f['tacticSha256']
        old='/data/local/tmp/ae_sd32_900_20261016/'+f['path']
        assert adb('shell','sha256sum',old).split()[0]==f['sha256']
        if (i+1)%50==0:print(json.dumps(dict(transferredSidecars=i+1,total=900)),flush=True)
    assert adb('shell','sha256sum',REMOTE+'/trainer').split()[0]==sha(ROOT/'trainer-arm64')
    (ROOT/'payload-receipt.json').write_text(json.dumps(dict(passed=True,files=900,baseReadOnly=True,configSha256=sha(ROOT/'config.json'),gateSha256=sha(ROOT/'GATE.json'),snapshot=snapshot()),indent=2),encoding='utf-8')


def pull(name):
    adb('pull',REMOTE+'/'+name,str(ROOT/name),timeout=120)
    assert sha(ROOT/name)==adb('shell','sha256sum',REMOTE+'/'+name).split()[0]


def host_evaluate(weights,split,tag):
    command=[str(ROOT/'evaluate-windows.exe'),'-root',str(ROOT),'-mode','evaluate','-split',split,'-weights',weights]
    with (ROOT/(tag+'.log')).open('w',encoding='utf-8') as out:
        p=subprocess.run(command,stdout=out,stderr=subprocess.STDOUT,creationflags=0x4000,timeout=3600)
    assert p.returncode==0,(ROOT/(tag+'.log')).read_text(encoding='utf-8')
    return read('eval-'+split+'-'+weights.replace('.json','')+'.json')


def main():
    config=read('config.json');gate=read('HOST_GATE.json');repo=ROOT.parent.parent
    assert gate['passed'] and gate['trainDevice']=='phone'
    for name,h in gate['bindings'].items():assert sha(repo/name)==h,name
    if not (ROOT/'payload-receipt.json').exists():payload(config)
    # 明确验证电脑上的训练入口会拒绝优化器更新，不能悄悄回退到PC。
    forbidden=subprocess.run([str(ROOT/'evaluate-windows.exe'),'-root',str(ROOT),'-mode','train'],capture_output=True,text=True,encoding='utf-8',errors='replace')
    assert forbidden.returncode and '禁止在电脑执行优化器更新' in forbidden.stderr
    (ROOT/'host-training-rejection.json').write_text(json.dumps(dict(passed=True,exitCode=forbidden.returncode,optimizerUpdates=0),indent=2),encoding='utf-8')
    epoch_results=[]
    baseline=host_evaluate('','validation','baseline-readonly')
    best_loss=baseline['policyLoss'];best_epoch=0;stale=0
    for epoch in range(1,4):
        completed=ROOT/f'epoch-{epoch}.json'
        if not completed.exists():
            # 手机已完成但传输中断时直接恢复原checkpoint；未完成时只从保存的批边界继续。
            listing=adb('shell','ls',REMOTE,check=False).splitlines()
            if f'epoch-{epoch}.json' not in listing:
                resume=''
                if 'resume.json' in listing:
                    saved=json.loads(adb('shell','cat',REMOTE+'/resume.json'))
                    if saved['epoch']==epoch and not saved['done']:resume=' -resume'
                result=run(f'env GOMAXPROCS=1 GOMEMLIMIT=384MiB {REMOTE}/trainer -root {REMOTE} -mode train -epoch {epoch}{resume}',f'train-epoch-{epoch}')
                if result['exitCode']==75:raise RuntimeError('手机训练已保存边界checkpoint并暂停，等待恢复；不在PC继续')
            pull(f'epoch-{epoch}.json')
        pull('updates.jsonl')
        state=read(f'epoch-{epoch}.json');assert state['done'] and state['epoch']==epoch and state['rows']==249317 and state['updates']==31165
        if not (ROOT/f'phone-val-epoch-{epoch}.json').exists():
            evaluated=run(f'env GOMAXPROCS=1 GOMEMLIMIT=384MiB {REMOTE}/trainer -root {REMOTE} -mode evaluate -weights epoch-{epoch}.json -split validation',f'validation-epoch-{epoch}')
            assert evaluated['exitCode']==0
            source=f'eval-validation-epoch-{epoch}.json';pull(source)
            (ROOT/f'phone-val-epoch-{epoch}.json').write_bytes((ROOT/source).read_bytes())
        val=read(f'phone-val-epoch-{epoch}.json');assert val['rows']==63096 and val['optimizerUpdates']==0
        improved=val['policyLoss']<best_loss-1e-5
        if improved:best_loss=val['policyLoss'];best_epoch=epoch;stale=0
        else:stale+=1
        epoch_results.append(dict(epoch=epoch,trainingRows=state['rows'],updates=state['updates'],onlineTrainingLoss=state['onlineLoss']/state['weight'],validation=val,bestEpoch=best_epoch,staleEpochs=stale,checkpointSha256=sha(completed)))
        journal=[json.loads(line) for line in (ROOT/'updates.jsonl').read_text(encoding='utf-8').splitlines()]
        actual=[r for r in journal if r['epoch']==epoch]
        assert {r['updates'] for r in actual}==set(range(1,31166))
        attempts=sorted(ROOT.glob(f'train-epoch-{epoch}*.process.json'))+sorted(ROOT.glob(f'train-epoch-{epoch}*.failure-process.json'))
        process_records=[json.loads(p.read_text(encoding='utf-8')) for p in attempts]
        samples=[s for p in process_records for s in p.get('samples',[])]
        epoch_results[-1].update(actualRecordedOptimizerUpdates=len(actual),recomputedUpdatesRecorded=len(actual)-31165,attemptReceipts=[p.name for p in attempts],wallSeconds=sum(p['wallSeconds'] for p in process_records),maximumObservedTemperature=max(s['temperature'] for s in samples),minimumAvailableMemoryBytes=min(s['memAvailableBytes'] for s in samples),minimumPhoneFreeBytes=min(s['freeBytes'] for s in samples),sourceGateSha256=sha(ROOT/'HOST_GATE.json'),phoneContractSha256=sha(ROOT/'GATE.json'),schemaSha256=sha(ROOT/'schema.json'),initialSha256=sha(ROOT/'initial.json'),datasetConfigSha256=sha(ROOT/'config.json'),trainerSha256=sha(ROOT/'trainer-arm64'))
        (ROOT/'training-results.json').write_text(json.dumps(dict(trainDevice='phone',baseline=baseline,epochs=epoch_results,bestEpoch=best_epoch,fullTrainingStarted=False),ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(epoch_results[-1]),flush=True)
        if stale>=2:break
    if best_epoch==0:weights=read('initial.json')
    else:weights=read(f'epoch-{best_epoch}.json')['weights']
    schema=read('schema.json');candidate=dict(schema=schema,weights=weights,bestEpoch=best_epoch,trainDevice='phone',policyOnly=True,valueHeadFrozen=True,valueCalibrated=False,promoted=False,independentEvaluation=False,hostGateSha256=sha(ROOT/'HOST_GATE.json'),selectionSha256=sha(ROOT/'selection.json'))
    initial=read('initial.json');vw=len(initial)-(4*64+4)-1
    assert weights[vw:]==initial[vw:]
    (ROOT/'candidate.json').write_text(json.dumps(candidate,separators=(',',':')),encoding='utf-8')
    chosen=f'epoch-{best_epoch}.json' if best_epoch else ''
    tr=host_evaluate(chosen,'train','best-train-readonly')
    va=host_evaluate(chosen,'validation','best-validation-readonly')
    if best_epoch:phone=read(f'phone-val-epoch-{best_epoch}.json')
    else:
        checked=run(f'env GOMAXPROCS=1 GOMEMLIMIT=384MiB {REMOTE}/trainer -root {REMOTE} -mode evaluate -split validation','validation-initial-best')
        assert checked['exitCode']==0;pull('eval-validation-.json');phone=read('eval-validation-.json')
    assert abs(va['policyLoss']-phone['policyLoss'])<1e-8 and va['top1']==phone['top1']
    (ROOT/'best-metrics.json').write_text(json.dumps(dict(train=tr,validation=va,phoneValidationAgrees=True,optimizerUpdatesOnPC=0),indent=2),encoding='utf-8')
    print(json.dumps(dict(completed=True,bestEpoch=best_epoch,candidateSha256=sha(ROOT/'candidate.json'),fullTrainingStarted=False)),flush=True)


if __name__=='__main__':main()
