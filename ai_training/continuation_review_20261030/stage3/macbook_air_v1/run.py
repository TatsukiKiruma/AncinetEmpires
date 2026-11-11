"""Mac工程自检、真实一次更新和用户级独立启动入口。"""
import argparse
import json
import plistlib
import shlex
import time
from device import HERE,DATA,REMOTE,ssh,scp,save
from prepare_inputs import read,sha

LABEL='com.ancientempires.stage3.omni.mac4500.v1'
ENV='PYTORCH_MPS_FAST_MATH=0 PYTORCH_ENABLE_MPS_FALLBACK=0 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 VECLIB_MAXIMUM_THREADS=4'

def probe(target):
    log=REMOTE+'/logs/probe-'+target+'-'+str(time.time_ns())+'.log'
    command='cd '+REMOTE+'/work && '+ENV+' ../runtime/venv/bin/python -u probe_mac.py --device '+target+' > '+log+' 2>&1; code=$?; tail -18 '+log+'; exit $code'
    try:output=ssh(command,timeout=1800)
    except BaseException as error:
        save(HERE/('PROBE_FAILED-'+target+'-'+str(time.time_ns())+'.json'),dict(error=repr(error),remoteLog=log));raise
    result=json.loads(ssh('cat '+REMOTE+'/work/PROBE-'+target+'.json'))
    assert result['passed'];save(HERE/('PROBE-'+target+'.json'),result);print(json.dumps(result),flush=True)

def pilot():
    log=REMOTE+'/logs/formal-handoff-pilot.log'
    output=ssh('cd '+REMOTE+'/work && '+ENV+' ../runtime/venv/bin/python -u train_mac.py --handoff-probe 1 > '+log+' 2>&1; code=$?; tail -10 '+log+'; exit $code',timeout=900)
    result=json.loads(ssh('cat '+REMOTE+'/work/training/RESULT.json'))
    assert result['updates']==4501 and result['stopReason']=='handoff_probe'
    save(HERE/'FORMAL_PILOT.json',result);print(json.dumps({k:result[k] for k in ['phase','updates','samples','lastCheckpoint']}),flush=True)

def start():
    assert read(HERE/'FORMAL_PILOT.json')['updates']==4501
    uid=int(ssh('id -u'));gui=ssh('launchctl print gui/'+str(uid)+' >/dev/null 2>&1 && echo yes || echo no')=='yes'
    domain=('gui/' if gui else 'user/')+str(uid)
    root=REMOTE
    plist=dict(Label=LABEL,ProgramArguments=[root+'/runtime/venv/bin/python',root+'/controller.py'],WorkingDirectory=root,
        RunAtLoad=True,KeepAlive=dict(SuccessfulExit=False),ThrottleInterval=30,
        StandardOutPath=root+'/logs/launchd.stdout.log',StandardErrorPath=root+'/logs/launchd.stderr.log',
        EnvironmentVariables=dict(OMNI_WORK=root+'/work',PYTHONUNBUFFERED='1',OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='4',VECLIB_MAXIMUM_THREADS='4',PYTORCH_MPS_FAST_MATH='0',PYTORCH_ENABLE_MPS_FALLBACK='0'))
    file=DATA/(LABEL+'.plist');file.write_bytes(plistlib.dumps(plist))
    scp(file,root+'/launch-agent.plist')
    target='/Users/larovinson/Library/LaunchAgents/'+LABEL+'.plist'
    ssh('test ! -e '+target+' && mkdir -p /Users/larovinson/Library/LaunchAgents && cp '+root+'/launch-agent.plist '+target+' && chmod 600 '+target+' && launchctl bootstrap '+domain+' '+target,timeout=60)
    save(HERE/'LAUNCH_AGENT.json',dict(label=LABEL,domain=domain,file=target,sourceSha256=sha(file),root=root,physicalRebootTested=False,startsAfterLogin=True,
        noSystemPowerSettingsChanged=True,noSudo=True))
    time.sleep(4)
    print(ssh('cat '+root+'/CONTROLLER_IDENTITY.json; cat '+root+'/TRAINER_IDENTITY.json'),flush=True)

def status():
    code='import json,pathlib;root=pathlib.Path('+repr(REMOTE)+');names=["work/training/PROGRESS.json","work/training/RESOURCE.json","work/training/LATEST.json","work/training/BLOCKED.json","work/training/COMPLETE.json","CONTROLLER_FATAL.json","CONTROLLER_EXIT.json"];print(json.dumps({name:json.loads((root/name).read_text()) for name in names if (root/name).is_file()},ensure_ascii=False))'
    output=ssh('cd '+REMOTE+' && runtime/venv/bin/python -c '+shlex.quote(code));print(output,flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['probe','pilot','start','status']);parser.add_argument('--device',choices=['mps','cpu'],default='mps');args=parser.parse_args()
    probe(args.device) if args.action=='probe' else globals()[args.action]()
