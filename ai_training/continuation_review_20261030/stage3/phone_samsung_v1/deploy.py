"""仅向已授权三星下发独立包；日志全部保存在专属目录。"""
import json
import shlex
from device import HERE,call,shell,save
from runtime_setup import termux,PREFIX,HOME
from linux_setup import PHONE,WORK,guest
from prepare_data import read,sha

def push():
    package=read(HERE/'PACKAGE.json');remote='/data/local/tmp/aeii-omni-samsung-independent-v1.tar'
    call('push',package['file'],remote,timeout=1200)
    assert shell('sha256sum '+remote,timeout=300).split()[0]==package['sha256']
    shell('cat '+remote+' | run-as com.termux '+PREFIX+'/bin/tar --no-same-owner -xf - -C '+PHONE,timeout=900)
    output=termux('cd '+PHONE+' && '+PREFIX+'/bin/sha256sum -c SHA256SUMS > logs/INPUT_SHA256_VERIFY.log 2>&1 && echo ALL_INPUT_HASHES_PASSED',timeout=900)
    assert output.strip()=='ALL_INPUT_HASHES_PASSED',output
    command='''import json,time,hashlib,pathlib
w=pathlib.Path('/work');p=w/'PAYLOAD_INDEX.json'
v={'passed':True,'payloadManifestSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'epoch':time.time(),'allInputFilesVerified':True,'sealedParentsTransferred':0}
(w/'INPUTS_VERIFIED.json').write_text(json.dumps(v))
print(json.dumps(v))'''
    verified=guest('/opt/torch-env/bin/python -c '+shlex.quote(command),timeout=60)
    save(HERE/'PHONE_INPUTS_VERIFIED.json',json.loads(verified))
    output=guest('/opt/torch-env/bin/python -m compileall -q /work && /opt/torch-env/bin/python -c "from phone_core import validate;print(validate())" && /work/node/bin/node --version',timeout=120)
    syntax=termux('for f in '+PHONE+'/*.sh; do bash -n "$f" || exit 1; done; echo SHELL_SYNTAX_PASSED')
    save(HERE/'DEPLOY_VERIFIED.json',dict(passed=True,package=package,raw=output,nativeScripts=syntax,sealedAccess=0))
    print(output,flush=True)

def probe():
    output=guest('/opt/torch-env/bin/python -u /work/probe_mobile.py > /phone/logs/engineering-probe.log 2>&1; code=$?; tail -5 /phone/logs/engineering-probe.log; exit $code',timeout=1800)
    save(HERE/'PHONE_PROBE_OUTPUT.json',dict(raw=output))
    output=guest('cat /work/PROBE_PASSED.json',timeout=60)
    save(HERE/'PROBE_PASSED.json',json.loads(output));print(output,flush=True)

def pilot():
    output=guest('/opt/torch-env/bin/python -u /work/train_mobile.py --handoff-probe 1 > /phone/logs/formal-handoff-pilot.log 2>&1; code=$?; tail -5 /phone/logs/formal-handoff-pilot.log; exit $code',timeout=900)
    result=json.loads(guest('cat /work/training/RESULT.json'))
    assert result['updates']==2762 and result['stopReason']=='handoff_probe' and result['phase']=='paused'
    save(HERE/'FORMAL_PILOT.json',result);print(json.dumps({k:result[k] for k in ['phase','updates','samples','lastCheckpoint','contractSha256']},ensure_ascii=False),flush=True)

def start():
    boot=HOME+'/.termux/boot/aeii-omni-stage3-v1'
    content='''#!/data/data/com.termux/files/usr/bin/bash
# 解锁后由Termux:Boot启动，控制器互斥并尊重完成、暂停和异常标记。
PREFIX=/data/data/com.termux/files/usr
export PREFIX PATH="$PREFIX/bin:/system/bin" HOME=/data/data/com.termux/files/home TMPDIR="$PREFIX/tmp"
ROOT="$HOME/aeii-omni-stage3-20261030-v1"
setsid "$PREFIX/bin/bash" "$ROOT/controller.sh" </dev/null >>"$ROOT/logs/controller.log" 2>&1 &
'''
    termux('mkdir -p '+HOME+'/.termux/boot && printf %s '+shlex.quote(content)+' > '+boot+' && chmod 700 '+boot)
    activity=shell('cmd package resolve-activity --brief com.termux.boot').splitlines()[-1].strip()
    shell('am start -n '+activity,check=False)
    activity2=shell('cmd package resolve-activity --brief com.termux').splitlines()[-1].strip()
    shell('am start -n '+activity2,check=False)
    termux('bash '+boot+'; sleep 3')
    save(HERE/'BOOT_ENTRY.json',dict(file=boot,content=content,package='com.termux.boot',bootActivity=activity,
        physicalRebootTested=False,startsAfterUnlock=True))
    print(termux('cat '+PHONE+'/CONTROLLER_IDENTITY.json; cat '+PHONE+'/TRAINER_IDENTITY.json'),flush=True)

def status():
    command='for f in CONTROLLER_IDENTITY.json TRAINER_IDENTITY.json work/training/PROGRESS.json work/training/RESOURCE.json work/training/LATEST.json work/training/BLOCKED.json work/training/COMPLETE.json; do if test -f '+PHONE+'/$f; then echo "$f"; cat '+PHONE+'/$f; fi; done; tail -3 '+PHONE+'/logs/train-*.log 2>/dev/null || true'
    print(termux(command,timeout=60),flush=True)

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['push','probe','pilot','start','status']);args=parser.parse_args();globals()[args.action]()
