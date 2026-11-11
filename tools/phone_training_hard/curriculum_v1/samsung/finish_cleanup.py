"""继续固定清单中已完成备份的清理，按组执行并逐项确认。"""
from pathlib import Path
import hashlib
import json
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,REMOTE,TEST_REMOTE,DEVICE,shell,app

def main():
    path=OUT/'delivery-20261029/cleanup/CLEANUP.json';manifest=json.loads(path.read_text(encoding='utf-8'))
    assert manifest['device']==DEVICE
    allowed=[r+s for r in [REMOTE,TEST_REMOTE] for s in ['', '-w00','-w01']]
    for entry in manifest['backups']:
        archive=Path(entry['archive'])
        assert archive.resolve().parent==path.resolve().parent
        assert archive.stat().st_size==entry['bytes'] and hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==entry['sha256']
    deleted={(v['package'],v['path']) for v in manifest['deleted']}
    for entry in manifest['backups']:
        pkg=entry['package'];base=entry['base'];names=entry['names'];targets=[]
        if pkg:assert pkg in ['net.toyknight.aeii.worker11','net.toyknight.aeii.worker12'] and not shell('pidof '+pkg,check=False)
        for name in names:
            full=base+'/'+name
            if pkg:
                if name in ['current.json','collector.bundle.js']:assert base=='/data/user/0/'+pkg+'/files'
                else:assert base=='/data/user/0/'+pkg+'/files/.aeii-hard-production' and re.fullmatch(r'hc7-samsung-20261028-v1-w0[01]-\d{4}-r\d{4}',name)
            else:assert full in allowed
            targets.append(full)
        # 全部参数来自已核验的固定任务白名单，不涉及父目录或其他任务。
        # 分组避免Windows进程命令行长度上限。
        for offset in range(0,len(targets),30):
            chunk=targets[offset:offset+30]
            command='rm -rf -- '+' '.join(chunk)+'; for p in '+' '.join(chunk)+'; do test ! -e "$p" || exit 1; done; echo removed'
            response=app(pkg,command,timeout=180) if pkg else shell(command,timeout=180)
            assert response=='removed',response
        for full in targets:
            if (pkg,full) not in deleted:manifest['deleted'].append({'package':pkg,'path':full});deleted.add((pkg,full))
        path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        print('已清理并确认',entry['label'],len(targets),flush=True)
    manifest['after']=shell('df -k /data');manifest['completed']=True
    manifest['preserved']=['所有已安装APK','原用户游戏和个人存档','其他采集任务及非本批前缀目录','hc7-before-20261028输入备份','电脑完整原件、清单、失败链和冻结输入']
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'completed':True,'deletedTargets':len(manifest['deleted']),'filesVerified':sum(e['filesVerified'] for e in manifest['backups']),'before':manifest['before'],'after':manifest['after']},ensure_ascii=False))

if __name__=='__main__':main()
