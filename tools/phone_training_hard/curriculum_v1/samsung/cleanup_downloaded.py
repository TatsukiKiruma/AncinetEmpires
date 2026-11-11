"""三星本批文件先完整备份、逐文件核验，再按固定白名单清理。"""
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tarfile
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,REMOTE,TEST_REMOTE,ADB,DEVICE,shell,app

def main():
    dest=OUT/'delivery-20261029/cleanup';dest.mkdir(exist_ok=False)
    state=json.loads(shell('cat '+REMOTE+'/STATE.json'))
    assert state['phase']=='workers_exited' and all(not w['controllerAlive'] for w in state['workers'])
    for pkg in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12']:
        assert not shell('pidof '+pkg,check=False)
    before=shell('df -k /data');records=[];plans=[]
    def raw(command):
        p=subprocess.run([ADB,'-s',DEVICE,'exec-out',command],capture_output=True,timeout=240)
        assert p.returncode==0,p.stderr
        return p.stdout.decode('utf-8').strip()
    def backup(label,base,names,pkg=None):
        assert names
        prefix=('run-as '+pkg+' ') if pkg else ''
        command=prefix+'sh -c "cd '+base+' && find '+' '.join(names)+' -type f -exec sha256sum {} +"'
        hashes=raw(command);expected={}
        for line in hashes.splitlines():
            digest,name=line.split(None,1);assert re.fullmatch('[0-9a-f]{64}',digest)
            expected[name]=digest
        (dest/(label+'-remote-sha256.txt')).write_text(hashes,encoding='utf-8')
        archive=dest/(label+'.tar')
        with archive.open('xb') as stream:
            result=subprocess.run([ADB,'-s',DEVICE,'exec-out',prefix+'tar -C '+base+' -cf - '+' '.join(names)],stdout=stream,stderr=subprocess.PIPE,timeout=1200)
        assert result.returncode==0,result.stderr
        seen={}
        with tarfile.open(archive) as tar:
            for m in tar:
                assert not m.name.startswith('/') and '..' not in Path(m.name).parts
                if m.isfile():seen[m.name]=hashlib.file_digest(tar.extractfile(m),'sha256').hexdigest()
                else:assert m.isdir(),m.name
        assert seen==expected,(label,len(seen),len(expected))
        # 清理前二次读取摘要，防止备份后内容改变。
        assert raw(command)==hashes
        records.append({'label':label,'base':base,'names':names,'package':pkg,'filesVerified':len(seen),'archive':str(archive.resolve()),'bytes':archive.stat().st_size,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()})
        plans.append((pkg,base,names))
        print('已备份核验',label,len(seen),flush=True)
    roots=[r+s for r in [REMOTE,TEST_REMOTE] for s in ['', '-w00','-w01']]
    assert all(re.fullmatch(r'/data/local/tmp/aeii-hard-production-parallel-curriculum7-samsung-20261028-(?:v1|preflight)(?:-w0[01])?',r) for r in roots)
    existing=[r for r in roots if shell('test -d '+r+' && echo yes',check=False)=='yes']
    backup('task-roots','/data/local/tmp',[r.rsplit('/',1)[1] for r in existing])
    for pkg in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12']:
        names=app(pkg,'ls files/.aeii-hard-production').split()
        names=[n for n in names if re.fullmatch(r'hc7-samsung-20261028-v1-w0[01]-\d{4}-r\d{4}',n)]
        backup(pkg.rsplit('.',1)[1]+'-raw','/data/user/0/'+pkg+'/files/.aeii-hard-production',names,pkg)
        current=json.loads(app(pkg,'cat files/current.json'));assert current['globalRoot'] in [REMOTE,TEST_REMOTE]
        backup(pkg.rsplit('.',1)[1]+'-bootstrap','/data/user/0/'+pkg+'/files',['current.json','collector.bundle.js'],pkg)
    # 全部目标备份核验成功后才开始删除，绝不清空应用数据或卸载APK。
    manifest={'device':DEVICE,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'before':before,'backups':records,'scope':'仅20261028三星curriculum7本批任务和该批尝试目录及启动输入','deleted':[]}
    path=dest/'CLEANUP.json'
    def save():path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    save()
    for pkg,base,names in plans:
        for name in names:
            full=base+'/'+name
            if pkg:
                assert base.startswith('/data/user/0/'+pkg+'/files') and (re.fullmatch(r'hc7-samsung-20261028-v1-w0[01]-\d{4}-r\d{4}',name) or name in ['current.json','collector.bundle.js'])
                app(pkg,'rm -rf -- '+full)
                assert app(pkg,'test ! -e '+full+' && echo removed')=='removed'
            else:
                assert full in roots
                shell('rm -rf -- '+full)
                assert shell('test ! -e '+full+' && echo removed')=='removed'
            manifest['deleted'].append({'package':pkg,'path':full});save()
    manifest['after']=shell('df -k /data');manifest['completed']=True
    manifest['preserved']=['所有已安装APK','原用户游戏和个人存档','旧采集任务及其他前缀目录','hc7-before-20261028启动输入备份','电脑完整原件、清单、失败链和冻结输入']
    save();print(json.dumps({'deletedTargets':len(manifest['deleted']),'filesVerified':sum(r['filesVerified'] for r in records),'before':before,'after':manifest['after']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
