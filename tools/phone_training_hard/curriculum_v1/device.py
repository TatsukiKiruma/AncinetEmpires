"""小米首批的版本化下发与只读状态入口，所有动作都限定设备序列号。"""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
import time
from html import make_htmls

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'ai_training/hard_curriculum3000_execution_20261027'
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
DEVICE='c2357770'
REMOTE='/data/local/tmp/aeii-hard-production-parallel-curriculum7-mi8-20261027-v1'
SOURCE=OUT/'collector-v5'
DEPLOY=OUT/'mi8-v1'

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:f.write(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def text(p,s):Path(p).write_text(s,encoding='utf-8',newline='\n')
def call(*args,check=True):
    p=subprocess.run([ADB,'-s',DEVICE,*map(str,args)],capture_output=True,timeout=120)
    record={'timeUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'args':list(map(str,args)),'returncode':p.returncode,'stdout':p.stdout.decode('utf-8','replace'),'stderr':p.stderr.decode('utf-8','replace')}
    with (OUT/'ADB_COMMANDS.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(record,ensure_ascii=False)+'\n')
    if check and p.returncode:raise RuntimeError(record)
    return record['stdout'].strip()
def root(cmd,check=True):
    assert "'" not in cmd
    return call('shell','su','-c',"'"+cmd+"'",check=check)
def identity():
    assert call('get-serialno')==DEVICE
    assert call('shell','getprop','ro.product.model')=='MI 8 UD'
    assert 'uid=0' in root('id')
    return root('getprop ro.product.model\ndf -k /data\ndumpsys battery\nps -A | grep aeii',check=False)
def prepare():
    inventory=identity()
    assert '"phase":"complete"' in root('cat /data/local/tmp/aeii-hard-production-parallel-mi8-20261024-02/STATE.json')
    DEPLOY.mkdir(exist_ok=False)
    write(DEPLOY/'PREFLIGHT.json',{'device':DEVICE,'snapshot':inventory,'utc':dt.datetime.now(dt.timezone.utc).isoformat()})
    old=json.loads((ROOT/'ai_training/hard_native_1000_20261022/PLAN.json').read_text(encoding='utf-8'))
    bridge=Path(old['inputs']['javaBridge']['path']);assert sha(bridge)==old['inputs']['javaBridge']['sha256']
    html=(ROOT/'ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html').read_text(encoding='utf-8')
    htmls=make_htmls(html)
    jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs'][:1000]
    assert len(jobs)==1000 and [j['executionSequence'] for j in jobs]==list(range(1,1001))
    master=DEPLOY/'master';master.mkdir()
    for name in ['master.sh','process-importance.jar','curriculum-audit.jar']:shutil.copy2(SOURCE/name,master/name)
    text(master/'global.env','TOTAL=1000\nINITIAL_DONE=0\nLIMIT=2\nWORKER_COUNT=2\n')
    text(master/'OPERATING_CEILING','2\n')
    workers=[]
    for slot,(pkg,expected) in enumerate([('net.toyknight.aeii.android',old['apkSha256']),('net.toyknight.aeii.worker01','e1c8d41bd50767e1a27026a4ca5efd2c83a379b3e40ed31ff9c4e8844718c41f')]):
        wid=f'w{slot:02d}';phone=REMOTE+'-'+wid;local=DEPLOY/wid;local.mkdir();(local/'configs').mkdir()
        assert not call('shell','pidof',pkg,check=False),pkg+'有进程，不重复启动'
        apk=root('pm path '+pkg).removeprefix('package:');assert re.fullmatch(r'/data/app/[A-Za-z0-9_./=+\-]+/base\.apk',apk)
        assert root('sha256sum '+apk).split()[0]==expected
        uid=int(re.search(r'userId=(\d+)',root('dumpsys package '+pkg)).group(1))
        assert uid==10779+slot
        for name in ['controller.sh','process_thaw.sh','queue_policy.sh']:shutil.copy2(SOURCE/name,local/name)
        shutil.copy2(Path(old['inputs']['baseConfigZip']['path']),local/'base-config.zip')
        text(local/'worker.env',f'PACKAGE={pkg}\nAPP_UID={uid}\nACTIVITY=net.toyknight.aeii.android.AndroidLauncher\nGLOBAL_ROOT={REMOTE}\nWORKER_ID={wid}\nTOTAL=500\n')
        text(local/'attempt-prefix.txt',f'hc7-mi8-20261027-v1-{wid}\n')
        text(local/'inject-path.txt','/data/local/tmp/aeii-hard-inject-17.2.5\n')
        native=(SOURCE/'native_engine.rhino.js').read_text(encoding='utf-8')+'\n'+(SOURCE/'projection.rhino.js').read_text(encoding='utf-8')
        bundle=bridge.read_text(encoding='utf-8')+'\nglobalThis.Java=bridge;\n'
        for key,value in [('HARD_EXPECTED',{'package':pkg,'sha256':expected}),('HARD_NATIVE_SOURCE',native),('HARD_WORKER_SOURCE',(SOURCE/'worker.rhino.js').read_text(encoding='utf-8')),('HARD_HTML_BY_CAP',htmls)]:bundle+='const '+key+'='+json.dumps(value,ensure_ascii=True)+';\n'
        bundle+=(SOURCE/'runtime.frida.js').read_text(encoding='utf-8')
        text(local/'collector.bundle.js',bundle)
        index=[]
        for j in jobs[slot::2]:
            seq=j['executionSequence'];cap=j['setup']['unitLimit']
            cfg={'package':pkg,'job':j,'outputDirectory':f'/data/user/0/{pkg}/files/.aeii-hard-production/__ATTEMPT__','baseConfigZip':phone+'/base-config.zip','baseConfigName':old['inputs']['baseConfigEntry'],'taskRoot':phone,'globalRoot':REMOTE,'workerId':wid,'populationLimit':cap,'populationCaps':[cap]*6,'patchHTMLSha':hashlib.sha256(htmls[str(cap)].encode()).hexdigest(),'planSha256':sha(OUT/'JOBS.json'),'sourceApkSha256':old['apkSha256'],'installedApkSha256':expected,'sequenceIndex':seq,'maxActions':20000,'replay':'disabled_by_user','independentReplayDeferred':False,'strategyFamily':'apk_hard_original_curriculum_v1'}
            write(local/'configs'/f'{seq:04d}.json',cfg)
            index.append(f'{seq} {j["parentId"]} {phone}/configs/{seq:04d}.json\n')
        text(local/'index.txt',''.join(index))
        workers.append({'workerId':wid,'package':pkg,'uid':uid,'remoteRoot':phone,'installedSha256':expected,'sequences':[j['executionSequence'] for j in jobs[slot::2]]})
    text(master/'workers.tsv',''.join(f'{w["workerId"]} {w["package"]} {w["uid"]} {w["remoteRoot"]}\n' for w in workers))
    write(DEPLOY/'PLAN.json',{'device':DEVICE,'model':'MI 8 UD','remoteRoot':REMOTE,'humanGameNumbers':[1,1000],'workers':workers,'limit':2,'sequenceSha256':sha(OUT/'EXECUTION_SEQUENCE.json'),'jobsSha256':sha(OUT/'JOBS.json'),'replay':'disabled_by_user','training':False})
    write(DEPLOY/'SOURCE_SHA256.json',{str(p.relative_to(DEPLOY)).replace('\\','/'):sha(p) for p in DEPLOY.rglob('*') if p.is_file()})
    print(json.dumps({'prepared':str(DEPLOY),'workers':2,'parents':1000},ensure_ascii=False))
def deploy():
    identity();assert not (DEPLOY/'DEPLOYED.json').exists()
    plan=json.loads((DEPLOY/'PLAN.json').read_text(encoding='utf-8'))
    for rel,h in json.loads((DEPLOY/'SOURCE_SHA256.json').read_text(encoding='utf-8')).items():assert sha(DEPLOY/rel)==h
    for w in plan['workers']:assert not call('shell','pidof',w['package'],check=False)
    for local,phone in [(DEPLOY/'master',REMOTE)]+[(DEPLOY/w['workerId'],w['remoteRoot']) for w in plan['workers']]:
        root('test ! -e '+phone);call('push',local,phone)
        actual={p:h for h,p in (line.split(None,1) for line in root('find '+phone+' -type f -exec sha256sum {} +').splitlines())}
        expected={phone+'/'+str(p.relative_to(local)).replace('\\','/'):sha(p) for p in local.rglob('*') if p.is_file()}
        assert actual==expected
        root('chown -R 0:0 '+phone+'\nchmod -R go-w '+phone+'\nchmod 755 '+phone)
        for f in local.glob('*.sh'):root('sh -n '+phone+'/'+f.name)
    root('setsid sh '+REMOTE+'/master.sh '+REMOTE+' </dev/null >'+REMOTE+'/launch.log 2>&1 &')
    write(DEPLOY/'DEPLOYED.json',{'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'device':DEVICE,'remoteRoot':REMOTE,'allFilesShaVerified':True,'computerRequired':False,'physicalUnplugTested':False})
    print(root('cat '+REMOTE+'/STATE.json',check=False))
def status():
    print(root('cat '+REMOTE+'/STATE.json\ncat '+REMOTE+'/OBSERVATION_CHECKED.json\ncat '+REMOTE+'/OBSERVATION_BLOCKED_CELLS.tsv',check=False))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['prepare','deploy','status']);args=parser.parse_args()
    {'prepare':prepare,'deploy':deploy,'status':status}[args.action]()
