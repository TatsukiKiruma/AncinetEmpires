"""独立生成Mac适配层，复用手机已核验目标函数，不修改三星任务。"""
import ast
import hashlib
import json
from pathlib import Path
import shlex
import tarfile
from device import HERE,STAGE3,DATA,REMOTE,save,ssh,scp
from prepare_inputs import PAYLOAD,SOURCE,CHECKPOINT,read,sha

def replace_required(source,old,new):
    if old not in source:raise ValueError('适配锚点缺失：'+old[:90])
    return source.replace(old,new)

def build():
    runtime=read(HERE/'RUNTIME_VERIFIED.json')
    assert runtime['mpsAvailable'] and runtime['machine']=='arm64'
    node_sha=ssh('shasum -a256 /opt/homebrew/bin/node').split()[0]
    save(PAYLOAD/'MAC_RUNTIME.json',dict(schema='macbook-air4500-omni-v1',branchId='macbook-air-m4-from4500-20261030-v1',
        sourceUpdate=4500,resumeUpdate=4500,resumeSamples=144000,targetUpdates=100000,remainingUpdates=95500,effectiveBatch=32,microbatch=8,
        device='mps',cpuThreads=4,encoderProcesses=1,nodeExecutable='/opt/homebrew/bin/node',nodeSha256=node_sha,
        originalCheckpointSha256=sha(CHECKPOINT),sourceMobileContractSha256='07d9c528739b223bc44e83787d350ef78021fccb0ad86bf4a33f5b32095fb9c6',
        hostScienceContractSha256=sha(STAGE3/'SCIENCE_CONTRACT.json'),wallSeconds=None,
        thermalPauseAtLeast=2,thermalResumeAtMost=1,batteryPause=20,batteryResume=25,
        freeSpacePauseBytes=10*2**30,freeSpaceResumeBytes=12*2**30,
        noAutomaticResultTransfer=True,finalArenaAndSealedTestAfterReturn=True,phoneContinuesIndependently=True))
    phone=STAGE3/'phone_samsung_v1'
    source=(phone/'phone_core.py').read_text('utf-8');tree=ast.parse(source)
    names=['read','sha','sync_directory','atomic','tensor_digest','Encoder','Checkpoints']
    selected='\n\n'.join(ast.get_source_segment(source,node) for node in tree.body if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and node.name in names)
    selected=selected.replace("str(WORK/'node/bin/node')","read(WORK/'MAC_RUNTIME.json')['nodeExecutable']").replace('PHONE_RUNTIME.json','MAC_RUNTIME.json').replace('手机','Mac')
    header='''"""Mac原子保存、编码和设备恢复接口；本分支与三星互相独立。"""
import hashlib,json,os,pickle,queue,struct,subprocess,threading,time,uuid
from pathlib import Path
import torch
from data import decode,exact
WORK=Path(os.environ.get('OMNI_WORK',str(Path(__file__).resolve().parent)))
OUT=WORK/'training'
'''
    core=header+selected+'\n\n'+(HERE/'mac_core_extra.py').read_text('utf-8')
    core=core.replace('from math_core import update as science_update','from math_core import update as science_update,move')
    (PAYLOAD/'mac_core.py').write_text(core,'utf-8')
    (PAYLOAD/'mac_platform.py').write_text((HERE/'mac_platform.py').read_text('utf-8'),'utf-8')
    source=(phone/'train_mobile.py').read_text('utf-8').replace('phone_core','mac_core').replace('phone_offline','mac_offline').replace('PHONE_RUNTIME.json','MAC_RUNTIME.json')
    source=replace_required(source,'tensor_digest,update','tensor_digest,update,device')
    source=source.replace('2761','4500').replace('88352','144000').replace("torch.device('cpu')",'device()')
    source=source.replace('SM-N9500 ARM64 CPU','MacBook Air M4').replace('phonePid','macPid').replace('phoneWallSeconds','macWallSeconds')
    source=source.replace('computerRequired=False','windowsRequired=False').replace('hostGpuStateOnlyAsProvenance=True','sourcePhoneStateRestored=True')
    source=source.replace('mobile_initial_full_barrier','mac_initial_full_barrier').replace('手机','Mac')
    source=source.replace('手机本地','Mac本地').replace('三星','MacBook Air')
    (PAYLOAD/'train_mac.py').write_text(source,'utf-8')
    source=(phone/'phone_offline.py').read_text('utf-8').replace('phone_core','mac_core').replace('手机','Mac').replace('三星ARM64 CPU','MacBook Air')
    source=replace_required(source,'resource,resource_bad','resource,resource_bad,device,move')
    source=replace_required(source,'x=collate(batch);out=forward_batch(model,x)','x=move(collate(batch),device());out=forward_batch(model,x)')
    source=replace_required(source,"torch.tensor(source['prior'])","torch.tensor(source['prior'],device=out['logits'].device)")
    source=replace_required(source,"records.append(record);log.write", "\n                        if not all(__import__('math').isfinite(record[k]) for k in ['policyNll','valueCe','brier']):raise ValueError('开发诊断指标非有限')\n                        records.append(record);log.write")
    (PAYLOAD/'mac_offline.py').write_text(source,'utf-8')
    source=(phone/'probe_mobile.py').read_text('utf-8').replace('phone_core','mac_core')
    source=replace_required(source,'tensor_digest,update','tensor_digest,update,move,cpu_tree')
    source=replace_required(source,'def main():','def main(target):')
    source=replace_required(source,"folder=WORK/'engineering';folder.mkdir(exist_ok=False)","folder=WORK.parent/'engineering'/(target.type+'-'+__import__('uuid').uuid4().hex);folder.mkdir(exist_ok=False)")
    source=source.replace('instantiate(saved,config)','instantiate(saved,config,target)').replace('instantiate(restored,config)','instantiate(restored,config,target)')
    source=source.replace("str(WORK/'node/bin/node')","read(WORK/'MAC_RUNTIME.json')['nodeExecutable']")
    source=source.replace('forward_batch(model,collate([row]))','forward_batch(model,move(collate([row]),target))').replace("out[key][0]-expected","out[key][0].cpu()-expected")
    source=source.replace("torch.device('cpu')",'target').replace('p.grad.flatten().clone()','p.grad.flatten().clone().cpu()')
    source=source.replace('2762','4501').replace('2763','4502')
    source=source.replace('copy.deepcopy(model.state_dict())','cpu_tree(model.state_dict())').replace('copy.deepcopy(optimizer.state_dict())','cpu_tree(optimizer.state_dict())')
    source=source.replace("(p-expected_model[k])","(p.cpu()-expected_model[k])")
    source=source.replace("WORK/'PROBE_PASSED.json'","WORK/('PROBE-'+target.type+'.json')")
    source=source.replace('singleMeasuredUpdateSeconds=seconds','device=str(target),singleMeasuredUpdateSeconds=seconds').replace('phone.frames','mac.frames')
    source=source.replace('if __name__==\'__main__\':main()',"if __name__=='__main__':\n    import argparse\n    parser=argparse.ArgumentParser();parser.add_argument('--device',choices=['mps','cpu'],required=True);args=parser.parse_args();main(torch.device(args.device))")
    (PAYLOAD/'probe_mac.py').write_text(source,'utf-8')
    save(PAYLOAD/'AUTHORIZATION.json',dict(userRequest='基于4500更新在MacBook Air同样独立执行训练任务，三星不用停止',
        sshAlias='macbook',user='larovinson',remoteRoot=REMOTE,sourceCheckpointSha256=sha(CHECKPOINT),targetUpdates=100000,
        separateBranch=True,noSudo=True,noGlobalEnvironmentChanges=True,sealedAccess=0,finalAcceptanceAfterReturn=True))
    scripts=DATA/'runtime-scripts';scripts.mkdir(exist_ok=True)
    for name in ['controller.py','status.py']:
        (scripts/name).write_text((HERE/name).read_text('utf-8'),'utf-8',newline='\n')
    (scripts/'查看训练.command').write_text('#!/bin/zsh\n# 只读查看本机训练进度。\ncd '+shlex.quote(REMOTE)+'\n'+shlex.quote(REMOTE+'/runtime/venv/bin/python')+' '+shlex.quote(REMOTE+'/status.py')+'\necho "按回车关闭窗口"\nread line\n','utf-8',newline='\n')
    print('MAC_RUNTIME_CODE_BUILT',flush=True)

def deploy():
    names=['mac_core.py','mac_platform.py','train_mac.py','mac_offline.py','probe_mac.py','MAC_RUNTIME.json','AUTHORIZATION.json']
    critical={name:sha(file) for name in ['model.py','accurate_ops.py','batch_model.py','data.py','common.py','ragged_batch.py','ragged_map.py','math_core.py',
        'sampler_mobile.py','encoder.bundle.mjs','SCIENCE_CONFIG.json','SAMPLER_PARENTS.json','ENCODER_PARENTS.json','PROBE_REQUESTS.json','PROBE_REFERENCE.json','BASE_INPUTS_INDEX.json'] for file in [PAYLOAD/name]}
    critical.update({name:sha(PAYLOAD/name) for name in names})
    scripts=DATA/'runtime-scripts'
    for file in scripts.iterdir():critical[REMOTE+'/'+file.name]=sha(file)
    critical['/opt/homebrew/bin/node']=read(PAYLOAD/'MAC_RUNTIME.json')['nodeSha256']
    contract=dict(schema='mac4500-omni-contract-v1',files=critical,inputsIndexSha256=sha(PAYLOAD/'BASE_INPUTS_INDEX.json'),
        source4500CheckpointSha256=sha(CHECKPOINT),hostScienceContractSha256=sha(STAGE3/'SCIENCE_CONTRACT.json'),
        original2414CheckpointSha256='338dea17879354363c7e76a9921eb97ec0bf9e2d87709661b55a9b82af86a34b',
        branch='MacBook Air从4500续训；三星独立继续；全局实战候选与唯一封存验收预算不翻倍',targetUpdates=100000,sealedAccess=0)
    if (PAYLOAD/'MAC_CONTRACT.json').exists():raise ValueError('Mac合同已存在，变更须先版本化归档')
    save(PAYLOAD/'MAC_CONTRACT.json',contract);names.append('MAC_CONTRACT.json')
    archive=DATA/'runtime-code-v1.tar'
    with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
        for name in names:tar.add(PAYLOAD/name,arcname='work/'+name)
        for file in scripts.iterdir():
            info=tar.gettarinfo(str(file),arcname=file.name);info.mode=0o700
            with file.open('rb') as stream:tar.addfile(info,stream)
    scp(archive,REMOTE+'/runtime-code-v1.tar')
    assert ssh('shasum -a256 '+REMOTE+'/runtime-code-v1.tar').split()[0]==sha(archive)
    ssh('cd '+REMOTE+' && tar --no-same-owner -xf runtime-code-v1.tar')
    verify()

def verify():
    output=ssh('cd '+REMOTE+'/work && ../runtime/venv/bin/python -m compileall -q . && ../runtime/venv/bin/python -c '+shlex.quote('from mac_core import validate,resource;import json;print(validate());print(json.dumps(resource(),ensure_ascii=False))'),timeout=120)
    save(HERE/'MAC_CODE_VERIFIED.json',dict(passed=True,contractSha256=sha(PAYLOAD/'MAC_CONTRACT.json'),raw=output));print(output,flush=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['build','deploy','verify']);args=parser.parse_args();globals()[args.action]()
