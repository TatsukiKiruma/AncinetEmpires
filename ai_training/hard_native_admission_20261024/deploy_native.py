"""把独立重放输入与执行器部署到小米本地，不启动采集或训练。"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import shlex
import subprocess
import tarfile
import time

from phone import HERE, ROOT, ADB, SERIAL, root, write
from prepare import FILES, load, sha


def tar_bytes(tar, name, data):
    entry=tarfile.TarInfo(name);entry.size=len(data);entry.mode=0o600
    tar.addfile(entry,io.BytesIO(data))


def deploy(label, package, parents):
    assert re.fullmatch(r'(smoke|all)[0-9]{2}',label)
    assert package in {'net.toyknight.aeii.worker01','net.toyknight.aeii.worker02'}
    plan=load(ROOT/'ai_training/hard_native_1000_20261022/production-parallel-01/PLAN.json')
    worker=next(w for w in plan['workers'] if w['package']==package)
    app_uid=worker['uid']
    apk=root('pm path '+package)[8:]
    assert root('sha256sum '+shlex.quote(apk)).split()[0]==worker['installedSha256']
    private=f'/data/user/0/{package}/files/.aeii-hard-admission-20261024/{label}'
    control='/data/local/tmp/aeii-hard-production-admission-20261024-'+package[-8:]+'-'+label
    local=HERE/'native-deploy'/label/package
    local.mkdir(parents=True,exist_ok=False)
    root('test ! -e '+private+' && test ! -e '+control+' && mkdir -p '+private+'/inputs '+private+'/receipts '+control)
    replay=(HERE/'native_replay.rhino.js').read_bytes()
    jobs=[{k:p[k] for k in ['parentId','attemptId','seed','expectedActions']} |
          {'artifactHashes':{n:p['files'][n]['sha256'] for n in FILES},'verifierSourceSha256':hashlib.sha256(replay).hexdigest()}
          for p in parents]
    queue=(json.dumps(jobs,ensure_ascii=True)+'\n').encode()
    bridge_info=load(ROOT/'ai_training/hard_native_1000_20261022/PLAN.json')['inputs']['javaBridge']
    assert sha(bridge_info['path'])==bridge_info['sha256']
    bundle=Path(bridge_info['path']).read_text(encoding='utf-8')+'\nglobalThis.Java=bridge;\n'
    bundle+='const ADMISSION_ROOT='+json.dumps(private)+';\nconst ADMISSION_QUEUE='+json.dumps((HERE/'native_queue.rhino.js').read_text(encoding='utf-8'))+';\n'
    bundle+=(HERE/'native_bootstrap.frida.js').read_text(encoding='utf-8')
    (local/'bootstrap.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
    checksum=[hashlib.sha256(queue).hexdigest()+'  '+private+'/queue.json',hashlib.sha256(replay).hexdigest()+'  '+private+'/native_replay.rhino.js']
    # 某些ADB exec-in/su组合会提前退出；先传完整tar，再独立解包和校验。
    from phone import call
    archive=local/'inputs.tar'
    with tarfile.open(archive,mode='w') as tar:
            tar_bytes(tar,'queue.json',queue);tar_bytes(tar,'native_replay.rhino.js',replay)
            for p in parents:
                for name in FILES:
                    source=Path(p['directory'])/name
                    assert sha(source)==p['files'][name]['sha256']
                    tar.add(source,arcname='inputs/'+p['parentId']+'/'+name,recursive=False)
                    checksum.append(p['files'][name]['sha256']+'  '+private+'/inputs/'+p['parentId']+'/'+name)
            tar_bytes(tar,'SHA256SUMS',('\n'.join(checksum)+'\n').encode())
    staging='/data/local/tmp/aeii-admission-'+label+'-'+package[-8:]+'.tar'
    call('push',archive,staging,timeout=180)
    assert root('sha256sum '+staging).split()[0]==sha(archive)
    root('tar -xf '+staging+' -C '+private,timeout=60)
    root('sha256sum -c '+private+'/SHA256SUMS > '+control+'/upload-hashes.log',timeout=60)
    root(f'chown {app_uid}:{app_uid} /data/user/0/{package}/files/.aeii-hard-admission-20261024\n'+f'chown -R {app_uid}:{app_uid} '+private+'\nchmod 700 '+private)
    env=f'PACKAGE={package}\nAPP_UID={app_uid}\nGLOBAL_ROOT={control}\n'
    (local/'worker.env').write_text(env,encoding='utf-8',newline='\n')
    payload=io.BytesIO()
    with tarfile.open(fileobj=payload,mode='w') as tar:
        tar_bytes(tar,'bootstrap.bundle.js',bundle.encode())
        tar_bytes(tar,'worker.env',env.encode())
        tar_bytes(tar,'process-importance.jar',(ROOT/'tools/phone_training_hard/process-importance.jar').read_bytes())
    (local/'control.tar').write_bytes(payload.getvalue())
    control_staging='/data/local/tmp/aeii-admission-'+label+'-'+package[-8:]+'-control.tar'
    call('push',local/'control.tar',control_staging)
    root('tar -xf '+control_staging+' -C '+control)
    root('chown -R 0:0 '+control+'\nchmod -R go-w '+control)
    root('am start -n '+package+'/net.toyknight.aeii.android.AndroidLauncher',timeout=30)
    pid=None
    for _ in range(15):
        value=root('pidof '+package,check=False)
        if value.strip().isdigit():pid=int(value);break
        time.sleep(1)
    assert pid is not None
    stat=root(f'cat /proc/{pid}/stat');ticks=int(stat.rsplit(')',1)[1].split()[19])
    assert re.search(r'(?m)^Uid:\s+'+str(app_uid)+r'\s',root(f'cat /proc/{pid}/status'))
    # 新任务只为其明确登记的宿主持有重要性令牌，不操作任何旧任务。
    target=f'{pid}\t{ticks}\t{app_uid}\n'
    root('printf '+shlex.quote(target)+' > '+control+'/important-targets.tsv')
    launch='env CLASSPATH='+control+'/process-importance.jar app_process /system/bin ProcessImportance '+control+f' {pid} {ticks} {app_uid} '+package
    importance=root('setsid sh -c '+shlex.quote('exec '+launch)+' </dev/null >'+control+'/importance.log 2>&1 & echo $!')
    inject=root('setsid /data/local/tmp/aeii-hard-inject-17.2.5 -p '+str(pid)+' -s '+control+'/bootstrap.bundle.js </dev/null >'+control+'/bootstrap.log 2>&1 & echo $!')
    receipt={'label':label,'serial':SERIAL,'package':package,'privateRoot':private,'controlRoot':control,'pid':pid,'startTicks':ticks,'uid':app_uid,
             'importancePid':int(importance),'injectPid':int(inject),'total':len(jobs),'expectedInstalledApkSha256':worker['installedSha256'],
             'nativeVerifierSha256':hashlib.sha256(replay).hexdigest(),'bundleSha256':sha(local/'bootstrap.bundle.js'),
             'queueSha256':hashlib.sha256(queue).hexdigest(),'allInputHashesVerifiedOnPhone':True,'computerRequired':False,'trainingStarted':False}
    write(local/'DEPLOYED.json',receipt)
    print(json.dumps(receipt,ensure_ascii=False),flush=True)
    return receipt


if __name__=='__main__':
    if (HERE / 'USER_STOP_RECEIPT.json').exists():
        raise SystemExit('用户已停止本轮重放，不允许继续部署或重试。')
    parser=argparse.ArgumentParser();parser.add_argument('label');parser.add_argument('--shard',type=int,default=0);parser.add_argument('--shards',type=int,default=1);args=parser.parse_args()
    manifest=load(HERE/'SOURCE_MANIFEST.json')
    parents=(load(HERE/'SMOKE.json')[:1] if args.label.startswith('smoke') else manifest['parents'])
    parents=[p for i,p in enumerate(parents) if i%args.shards==args.shard]
    package=['net.toyknight.aeii.worker02','net.toyknight.aeii.worker01'][args.shard]
    deploy(args.label,package,parents)
