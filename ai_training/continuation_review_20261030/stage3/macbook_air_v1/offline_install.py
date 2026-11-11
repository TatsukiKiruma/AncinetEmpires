"""本机下载的官方PyPI轮子经SHA验证转传，替代Mac缓慢的直连下载。"""
import json
from pathlib import Path
import shlex
import tarfile
from device import HERE,DATA,REMOTE,scp,ssh,save
from prepare_inputs import sha

files=sorted((DATA/'wheels').glob('*.whl'))
assert len(files)==11
archive=DATA/'runtime-wheels-v1.tar'
with tarfile.open(archive,'w',format=tarfile.GNU_FORMAT) as tar:
    for file in files:tar.add(file,arcname='runtime/wheels/'+file.name)
manifest={file.name:dict(bytes=file.stat().st_size,sha256=sha(file)) for file in files}
save(HERE/'WHEELS_MANIFEST.json',manifest)
scp(archive,REMOTE+'/runtime-wheels-v1.tar')
assert ssh('shasum -a256 '+REMOTE+'/runtime-wheels-v1.tar').split()[0]==sha(archive)
# 只终止此前本任务目录的那个下载进程，不操作其他Python或用户环境。
identity=ssh('/bin/ps -p 21353 -o command=',check=False)
if identity:
    assert '-m pip' in identity and REMOTE+'/cache/pip' in identity,identity
    ssh('kill -TERM 21353; sleep 2; echo OWN_PIP_DOWNLOAD_STOPPED')
output=ssh('cd '+REMOTE+' && tar --no-same-owner -xf runtime-wheels-v1.tar && runtime/venv/bin/python -m pip --isolated install --no-index --find-links runtime/wheels torch==2.14.0 numpy==2.5.4 --report runtime/PIP_OFFLINE_REPORT.json > logs/runtime-offline-install.log 2>&1; code=$?; tail -12 '+REMOTE+'/logs/runtime-offline-install.log; exit $code',timeout=300)
save(HERE/'RUNTIME_OFFLINE_INSTALL.json',dict(passed=True,raw=output,wheels=manifest))
code='import torch,numpy,platform,json;print(json.dumps(dict(torch=torch.__version__,numpy=numpy.__version__,machine=platform.machine(),mpsBuilt=torch.backends.mps.is_built(),mpsAvailable=torch.backends.mps.is_available())))'
result=json.loads(ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code),timeout=120))
save(HERE/'RUNTIME_VERIFIED.json',result);print(json.dumps(result),flush=True)
