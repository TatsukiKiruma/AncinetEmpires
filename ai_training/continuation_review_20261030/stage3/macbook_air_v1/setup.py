"""专属目录与隔离Python环境，不使用sudo或覆盖已有环境。"""
import argparse
import json
import shlex
from device import HERE,REMOTE,ssh,save

def prepare():
    command='test ! -e '+REMOTE+' && mkdir -p '+REMOTE+'/runtime '+REMOTE+'/work '+REMOTE+'/logs '+REMOTE+'/cache '+REMOTE+'/engineering && /usr/local/bin/python3 -m venv '+REMOTE+'/runtime/venv'
    ssh(command,timeout=120)
    save(HERE/'REMOTE_ROOT.json',dict(root=REMOTE,venv=REMOTE+'/runtime/venv',systemPython='/usr/local/bin/python3',node='/opt/homebrew/bin/node',sudoUsed=False))
    print('PRIVATE_VENV_PREPARED',flush=True)

def install():
    command='cd '+REMOTE+' && '+REMOTE+'/runtime/venv/bin/python -m pip --isolated --cache-dir '+REMOTE+'/cache/pip install --only-binary=:all: --index-url https://pypi.org/simple torch==2.14.0 numpy==2.5.4 --report '+REMOTE+'/runtime/PIP_REPORT.json > '+REMOTE+'/logs/runtime-install.log 2>&1; code=$?; tail -15 '+REMOTE+'/logs/runtime-install.log; exit $code'
    output=ssh(command,timeout=1200)
    save(HERE/'RUNTIME_INSTALL.json',dict(passed=True,raw=output,globalEnvironmentUnchanged=True));print(output,flush=True)
    command='cd '+REMOTE+' && '+REMOTE+'/runtime/venv/bin/python -c '+shlex.quote('import torch,numpy,platform,json; print(json.dumps(dict(torch=torch.__version__,numpy=numpy.__version__,machine=platform.machine(),mpsBuilt=torch.backends.mps.is_built(),mpsAvailable=torch.backends.mps.is_available())))')
    result=json.loads(ssh(command,timeout=120));save(HERE/'RUNTIME_VERIFIED.json',result);print(json.dumps(result),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','install']);args=parser.parse_args();globals()[args.action]()
