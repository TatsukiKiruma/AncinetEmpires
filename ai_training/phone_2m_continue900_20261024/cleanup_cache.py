"""按用户授权清理手机已备份训练缓存；每个文件先核对电脑和手机摘要。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import shlex

from device import HERE,ROOT,root,call,write

BASE=HERE.parent/'phone_2m_scratch100_20261024'
BENCH=HERE.parent/'phone_2m_workers_20261024'
PBASE='/data/local/tmp/aeii-2m-scratch100-20261024'
PBENCH='/data/local/tmp/aeii-2m-workers-20261024'


def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()


def main():
    assert not (HERE/'CACHE_CLEANUP_RESULT.json').exists(),'已有清理结果，不重复执行'
    rows=[]
    def add(remote,local,kind):
        local=Path(local).resolve()
        if local.is_file():
            assert local.is_relative_to(ROOT.resolve())
            assert remote.startswith(('/data/local/tmp/aeii-2m-',)) and '..' not in remote
            rows.append({'remote':remote,'local':str(local),'bytes':local.stat().st_size,'sha256':sha(local),'kind':kind})
    for folder,phone in [(BASE,PBASE),(BENCH,PBENCH)]:
        d=json.loads((folder/'DATASET.json').read_text(encoding='utf-8'))
        for r in d['reports']:
            add(phone+'/job/data/'+r['parentId']+'.frames.gz',folder/'data'/(r['parentId']+'.frames.gz'),'已完成阶段的训练特征缓存')
    transfers={
        '/data/local/tmp/aeii-2m-probe-payload.tar':BASE/'probe-payload.tar',
        '/data/local/tmp/aeii-2m-training-payload.tar':BASE/'training-payload.tar',
        '/data/local/tmp/aeii-2m-scratch100-wheels.tar':BASE/'runtime-assets/wheels.tar',
        '/data/local/tmp/aeii-2m-scratch100-ubuntu-base.tar.gz':BASE/'runtime-assets/ubuntu-base-24.04.5-base-arm64.tar.gz',
        '/data/local/tmp/aeii-2m-workers-payload-20261024.tar':BENCH/'payload.tar',
    }
    for remote,local in transfers.items():add(remote,local,'已验证电脑副本的传输包')
    for p in (BASE/'runtime-assets/wheels').glob('*.whl'):add(PBASE+'/runtime/rootfs/opt/wheels/'+p.name,p,'已安装运行时的离线安装缓存')
    for name in ['checkpoint-0.pt','resume-test-checkpoint.pt']:
        add(PBASE+'/job/output/'+name,BASE/'completion/output'/name,'已在电脑归档的非最终检查点副本')
    assert len({r['remote'] for r in rows})==len(rows)
    write(HERE/'CACHE_CLEANUP_MANIFEST.json',{'createdUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'authorization':'用户要求先清理手机训练缓存，允许删除已转移电脑的手机副本','files':rows,
          'preserved':['100局最终完整检查点','全部历史模型和电脑数据','已安装Python/PyTorch运行时','未核实电脑备份的手机文件'],'recursiveDelete':False})
    listing=HERE/'cleanup-files.tsv'
    listing.write_text(''.join(r['sha256']+' '+r['remote']+'\n' for r in rows),encoding='utf-8',newline='\n')
    script='''#!/system/bin/sh
set -u
LIST=/data/local/tmp/aeii-2m-continue900-cleanup-files.tsv
LOG=/data/local/tmp/aeii-2m-continue900-cleanup-receipts.tsv
while read -r EXPECTED TARGET; do
    case "$TARGET" in /data/local/tmp/aeii-2m-*) ;; *) exit 2 ;; esac
    test -f "$TARGET" || { printf 'missing\t%s\n' "$TARGET" >> "$LOG"; continue; }
    ACTUAL=$(sha256sum "$TARGET" | awk '{print $1}')
    if test "$ACTUAL" != "$EXPECTED"; then printf 'mismatch\t%s\t%s\n' "$TARGET" "$ACTUAL" >> "$LOG"; continue; fi
    SIZE=$(stat -c %s "$TARGET")
    if rm -f -- "$TARGET"; then printf 'removed\t%s\t%s\t%s\n' "$TARGET" "$SIZE" "$ACTUAL" >> "$LOG"; else printf 'failed\t%s\n' "$TARGET" >> "$LOG"; fi
done < "$LIST"
'''
    local=HERE/'cleanup_verified_files.sh';local.write_text(script,encoding='utf-8',newline='\n')
    before=root('df -k /data')
    call('push',listing,'/data/local/tmp/aeii-2m-continue900-cleanup-files.tsv');call('push',local,'/data/local/tmp/aeii-2m-continue900-cleanup.sh')
    root('test ! -e /data/local/tmp/aeii-2m-continue900-cleanup-receipts.tsv && sh /data/local/tmp/aeii-2m-continue900-cleanup.sh',timeout=60)
    raw=root('cat /data/local/tmp/aeii-2m-continue900-cleanup-receipts.tsv');after=root('df -k /data')
    receipts=[line.split('\t') for line in raw.splitlines()]
    value={'status':'complete','before':before,'after':after,'receipts':receipts,'removedFiles':sum(r[0]=='removed' for r in receipts),
           'removedLogicalBytes':sum(int(r[2]) for r in receipts if r[0]=='removed'),'mismatches':[r for r in receipts if r[0]=='mismatch'],
           'failed':[r for r in receipts if r[0]=='failed'],'allRemovedFilesVerifiedAgainstComputer':True,'sourceDataOnComputerPreserved':True,'runtimePreserved':True,
           'final100CheckpointPreserved':True}
    write(HERE/'CACHE_CLEANUP_RESULT.json',value)
    print(json.dumps({k:v for k,v in value.items() if k!='receipts'},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
