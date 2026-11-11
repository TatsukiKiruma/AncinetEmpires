"""取回选定手机版本、完整续训状态与记录，核SHA并导出本机推理权重。"""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile
import time
from device import HERE,ADB,SERIAL,save,call,shell
from runtime_setup import termux,PREFIX
from linux_setup import PHONE,guest
from prepare_data import BASE,OUT,ROOT,STAGE3,read,sha

def paths(tag):
    stage=read(HERE/('RETURN_STAGED-'+tag+'.json'))
    local=BASE/'phone_samsung_v1/returns'/tag
    return stage,local

def transfer(tag):
    stage,local=paths(tag)
    if (local/'TRANSFER_VERIFIED.json').exists():raise ValueError('取回目录已验收，禁止覆盖')
    local.mkdir(parents=True,exist_ok=True)
    source=(HERE/'return_snapshot.py').read_text('utf-8')
    guest_destination='/phone'+stage['remote'][len(PHONE):]
    command=source+'\ncollect("/phone",'+repr(guest_destination)+')\n'
    manifest_file=stage['remote']+'/SNAPSHOT_MANIFEST.json'
    if termux('test -f '+manifest_file+' && echo yes || echo no')=='yes':
        receipt=dict(manifestSha256=termux('sha256sum '+manifest_file).split()[0],reusedFrozenSnapshot=True)
    else:receipt=json.loads(guest('/opt/torch-env/bin/python -c '+shlex.quote(command),timeout=180))
    archive=local/'phone-snapshot-verified.tar'
    if archive.exists():raise ValueError('取回归档已存在，禁止覆盖')
    remote_tar='/data/local/tmp/aeii-stage3-return4500-'+tag+'.tar'
    shell('test ! -e '+remote_tar+' && touch '+remote_tar+' && chmod 0666 '+remote_tar)
    termux(PREFIX+'/bin/tar -cf '+remote_tar+' -C '+stage['remote']+' .',timeout=180)
    archive_expected=termux('sha256sum '+remote_tar,timeout=60).split()[0]
    shell('chmod 0600 '+remote_tar)
    call('pull',remote_tar,archive,timeout=300)
    assert sha(archive)==archive_expected,'归档传输SHA不一致'
    extracted=local/'phone-snapshot'
    if extracted.exists() and any(extracted.iterdir()):raise ValueError('解包目录已有内容，禁止覆盖')
    extracted.mkdir(exist_ok=True)
    with tarfile.open(archive) as tar:
        for item in tar.getmembers():
            path=Path(item.name)
            if path.is_absolute() or '..' in path.parts or not (item.isdir() or item.isfile()):raise ValueError('归档路径不安全：'+item.name)
        tar.extractall(extracted,filter='data')
    manifest=read(extracted/'SNAPSHOT_MANIFEST.json')
    assert sha(extracted/'SNAPSHOT_MANIFEST.json')==receipt['manifestSha256']
    for row in manifest['files']:
        file=extracted/row['file']
        assert file.stat().st_size==row['bytes'] and sha(file)==row['sha256'],row['file']
    save(local/'TRANSFER_VERIFIED.json',dict(passed=True,source=stage,receipt=receipt,files=len(manifest['files']),
        archiveSha256=sha(archive),archiveBytes=archive.stat().st_size,remoteArchive=remote_tar,local=str(local),sealedAccess=0,phoneOriginalsPreserved=True))
    save(HERE/('RETURN_TRANSFER-'+tag+'.json'),read(local/'TRANSFER_VERIFIED.json'))
    print(json.dumps(dict(passed=True,files=len(manifest['files']),bytes=archive.stat().st_size,local=str(local))))

def materialize(tag,updates):
    stage,local=paths(tag);snapshot=local/'phone-snapshot';assert read(local/'TRANSFER_VERIFIED.json')['passed']
    contract=read(snapshot/'records/work/MOBILE_CONTRACT.json')
    assert sha(snapshot/'records/work/MOBILE_CONTRACT.json')==read(HERE/'PACKAGE.json')['mobileContractSha256']
    # 训练输入在电脑已有冻结原件，逐文件重验并记录本地地址，不复制同一份大数据。
    existing=read(HERE/'PAYLOAD_FILES.json')['files'];index=read(snapshot/'records/work/PAYLOAD_INDEX.json')
    assert sha(snapshot/'records/work/PAYLOAD_INDEX.json')==contract['payloadManifestSha256']
    assert read(snapshot/'records/work/INPUTS_VERIFIED.json')['passed']
    sources={r['target']:Path(r['source']) for r in existing}
    verified=[]
    for row in index['files']:
        source=sources.get(row['target'],OUT/row['target'])
        if source.stat().st_size!=row['bytes'] or sha(source)!=row['sha256']:raise ValueError('本机训练输入身份不符：'+row['target'])
        verified.append(dict(row,localFile=str(source)))
    save(local/'LOCAL_DATA_VERIFIED.json',dict(passed=True,files=verified,count=len(verified),bytes=sum(r['bytes'] for r in verified),
        payloadManifestSha256=contract['payloadManifestSha256'],sealedParents=0,meaning='手机所用输入在本机已全部存在，本次逐文件重新核SHA；训练记录从手机新取回。'))
    import torch
    import numpy as np
    sys.path.insert(0,str(OUT));from model import DualStreamModel
    sys.path.insert(0,str(HERE));from phone_core import tensor_digest
    history=[]
    host_metrics=BASE/'run-v2-batch8/training/METRICS.jsonl'
    for line in host_metrics.read_text('utf-8').splitlines():
        row=json.loads(line);history.append((row,str(host_metrics)))
    for file in sorted((snapshot/'records/training').glob('METRICS-*.jsonl')):
        for line in file.read_text('utf-8').splitlines():
            row=json.loads(line);history.append((row,str(file)))
    exports=[]
    for u in updates:
        checkpoint=snapshot/f'checkpoint-{u:06d}.pt';expected=stage['files'][stage['remote']+f'/checkpoint-{u:06d}.pt']
        assert sha(checkpoint)==expected
        saved=torch.load(checkpoint,map_location='cpu',weights_only=False)
        assert saved['updates']==u and saved['sampler']['cursor']==u*32 and saved['scheduler']['last_epoch']==u
        assert not saved.get('engineeringOnly') and not saved.get('pendingAccumulatedGradients')
        assert saved['contractSha256']==sha(snapshot/'records/work/MOBILE_CONTRACT.json')
        assert saved['config']==read(snapshot/'records/work/SCIENCE_CONFIG.json')
        assert sum(s['exp_avg'].numel() for s in saved['optimizer']['state'].values())==1966910
        assert all(k in saved for k in ['rng','dropoutRng','model','optimizer','scheduler','sampler'])
        folder=local/f'version-{u:06d}';folder.mkdir(exist_ok=False)
        model=DualStreamModel(seed=saved['config']['seed']).accurate_reductions(False)
        model.load_state_dict(saved['model'],strict=True);metadata=model.export(folder/f'model-{u:06d}')
        assert metadata['parameters']==1966910
        raw=(folder/f'model-{u:06d}.bin').read_bytes()
        for entry in metadata['tensors']:
            arr=np.frombuffer(raw,dtype='<f4',count=entry['length'],offset=entry['offset']*4).reshape(entry['shape'])
            assert np.array_equal(arr,saved['model'][entry['name']].numpy()),entry['name']
        combined={};provenance={}
        for row,source in history:
            step=row['update']
            if step>u:continue
            if step in combined and row!=combined[step]:raise ValueError('同一步出现不一致指标：'+str(step))
            combined[step]=row;provenance[step]=source
        assert sorted(combined)==list(range(1,u+1)),'训练指标缺失，禁止声称完整历史'
        (folder/'METRICS_THROUGH_CHECKPOINT.jsonl').write_text(''.join(json.dumps(combined[n],ensure_ascii=False)+'\n' for n in range(1,u+1)),'utf-8')
        save(folder/'EXPOSURE.json',saved['sampler']['exposures'])
        save(folder/'SCIENCE_CONFIG.json',saved['config'])
        save(folder/'METRICS_SOURCE.json',dict(sources=sorted(set(provenance.values())),updates=u,eachUpdateExactlyOnce=True))
        result=dict(requestedUpdate=u,originalRequestedUpdate=4400,userConfirmed4500=True,actualUpdate=u,samples=u*32,exact4400Available=False,checkpoint=str(checkpoint),checkpointSha256=expected,
            inferenceModel=str(folder/f'model-{u:06d}.bin'),metadata=str(folder/f'model-{u:06d}.json'),
            inferenceSha256=sha(folder/f'model-{u:06d}.bin'),modelDigest=tensor_digest(saved['model']),optimizerDigest=tensor_digest(saved['optimizer']),
            exportedTensorsBitwiseExact=True,fullResumeStatePresent=True,metricsUpdates=u,inputDataReceipt=str(local/'LOCAL_DATA_VERIFIED.json'),
            original2414Sha256=saved['baseCheckpointSha256'],mobileContractSha256=saved['contractSha256'],phoneTrainingNotStopped=True,
            offlineOrArenaEvaluationRun=False,sealedTestRun=False,hostTrainingStarted=False)
        save(folder/'VERSION.json',result);exports.append(result)
    current=json.loads(termux('cat '+PHONE+'/work/training/PROGRESS.json'))
    assert current['phase'] in ['training','waiting_resources']
    save(local/'RETURN_RECEIPT.json',dict(passed=True,versions=exports,phoneObservedAfterTransfer=current,phoneOriginalsPreserved=True,sealedAccess=0,
        dataVerifiedFiles=len(verified),dataVerifiedBytes=sum(r['bytes'] for r in verified)))
    save(HERE/('RETURN_RECEIPT-'+tag+'.json'),dict(local=str(local),versions=exports,phoneUpdateAfter=current['update']))
    links='\n'.join(f'- {r["actualUpdate"]}次：推理权重 `version-{r["actualUpdate"]:06d}/model-{r["actualUpdate"]:06d}.bin` 与同名json；完整断点 `{Path(r["checkpoint"]).relative_to(local).as_posix()}`。' for r in exports)
    note=f'''# 手机阶段三版本取回

用户最初要求4400更新版本，确认手机没有精确4400快照后，明确选择取回4500版及对应数据。本次按实际更新号保存，没有重新训练。

{links}

完整断点包含模型、AdamW一二阶矩和步数、100k学习率日程、采样器、CPU RNG与先验dropout RNG。推理bin的每个张量已与原检查点逐位核对。版本目录含从本阶段第1次到相应更新的完整训练指标、采样曝光统计与配置；原始手机记录与源码位于phone-snapshot/records，逐文件传输校验见TRANSFER_VERIFIED.json。

手机所用冻结训练输入已在本机D盘存在。本次重新逐文件核SHA，共{len(verified)}文件、{sum(r['bytes'] for r in verified)}字节；具体本机路径见LOCAL_DATA_VERIFIED.json。没有从手机生成新的对局数据，也没有访问封存测试原态。

传输后手机仍在{current['update']}更新继续训练，原件保留。电脑训练保持暂停。此次只备份及导出，没有进行开发实战、封存验收或应用权重部署。
'''
    (local/'README.md').write_text(note,'utf-8')
    print(json.dumps(dict(passed=True,updates=updates,local=str(local),dataFiles=len(verified),phoneUpdate=current['update'])))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['transfer','materialize']);parser.add_argument('--tag',required=True);parser.add_argument('--updates',nargs='+',type=int,default=[4390]);args=parser.parse_args()
    transfer(args.tag) if args.action=='transfer' else materialize(args.tag,args.updates)
