"""正式更新前归档MPS预检配置，锁定已通过科学自检的M4 CPU运行配置。"""
import json
import shutil
import shlex
import tarfile
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import PAYLOAD,read,sha

assert read(HERE/'PROBE-cpu.json')['passed']
old_sha=sha(PAYLOAD/'MAC_CONTRACT.json')
old=read(PAYLOAD/'MAC_RUNTIME.json');assert old['device']=='mps'
backup=DATA/'revisions/mps-preflight-v1';backup.mkdir(parents=True,exist_ok=False)
for name in ['MAC_RUNTIME.json','MAC_CONTRACT.json']:shutil.copy2(PAYLOAD/name,backup/name)
ssh('test ! -e '+REMOTE+'/work/training/LATEST.json && test ! -e '+REMOTE+'/revisions/mps-preflight-v1 && mkdir -p '+REMOTE+'/revisions/mps-preflight-v1 && cp '+REMOTE+'/work/MAC_RUNTIME.json '+REMOTE+'/work/MAC_CONTRACT.json '+REMOTE+'/revisions/mps-preflight-v1/')
old['device']='cpu';old['deviceSelectionReason']='MPS scatter_add无确定性实现；M4 CPU保持确定性并通过前向、梯度及完整恢复检查'
old['previousEngineeringContractSha256']=old_sha;save(PAYLOAD/'MAC_RUNTIME.json',old)
contract=read(PAYLOAD/'MAC_CONTRACT.json');contract['schema']='mac4500-omni-contract-cpu-v2'
contract['files']['MAC_RUNTIME.json']=sha(PAYLOAD/'MAC_RUNTIME.json');contract['previousEngineeringContractSha256']=old_sha
save(PAYLOAD/'MAC_CONTRACT.json',contract)
archive=DATA/'runtime-cpu-choice-v2.tar'
with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
    for name in ['MAC_RUNTIME.json','MAC_CONTRACT.json']:tar.add(PAYLOAD/name,arcname='work/'+name)
scp(archive,REMOTE+'/runtime-cpu-choice-v2.tar')
assert ssh('shasum -a256 '+REMOTE+'/runtime-cpu-choice-v2.tar').split()[0]==sha(archive)
output=ssh('cd '+REMOTE+' && tar --no-same-owner -xf runtime-cpu-choice-v2.tar && cd work && ../runtime/venv/bin/python -c '+shlex.quote('from mac_core import validate,device;print(validate());print(device())'))
save(HERE/'DEVICE_SELECTION.json',dict(device='cpu',priorEngineeringContract=old_sha,finalContractSha256=sha(PAYLOAD/'MAC_CONTRACT.json'),
    mpsFailure='scatter_reduce_mps has no deterministic implementation',sourceConfigBackedUp=True,formalUpdatesBeforeChange=0,raw=output))
print(output)
