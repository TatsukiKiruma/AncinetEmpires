"""只读流式遍历封存原生归档，通过本地Node进程转换，不连接手机。"""
import argparse
import collections
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tarfile
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot',required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--ids',default='')
    parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--include-continuations',action='store_true')
    args=parser.parse_args()
    snapshot=Path(args.snapshot).resolve();out=Path(args.out).resolve()
    if not out.is_relative_to(HERE):
        raise RuntimeError('输出必须位于本次phone研究目录')
    out.mkdir(parents=True,exist_ok=True)
    (out/'configs').mkdir(exist_ok=True)
    catalog=json.loads((snapshot/'00_dataset-3000-index.json').read_text(encoding='utf8'))
    status=json.loads((snapshot/'05_continuation-status.json').read_text(encoding='utf8'))
    games={g['id']:g for g in catalog['games']}
    selected=set(args.ids.split(',')) if args.ids else set(games)
    selected.discard('')
    specs={}
    for ident,g in games.items():
        if ident not in selected:continue
        spec=dict(id=ident,parentId=ident,map=g['map'],seed=g['seed'],expectedActions=g['actions'],globalOffset=0,
                  archive=str(((ROOT/'captures/phone-compressed-2000-20261015')/g['archive']).resolve()),kind='original')
        specs[ident]=spec
    if args.include_continuations:
        for s in status['segments']:
            if s['original_id'] not in selected:continue
            specs[s['id']]=dict(id=s['id'],parentId=s['original_id'],map=games[s['original_id']]['map'],seed=games[s['original_id']]['seed'],
              expectedActions=s['actions'],globalOffset=s['global_offset'],archive=str(ROOT/'captures/phone-continuation-61-20261015'/s['archive']),kind='continuation')
    archives=collections.OrderedDict()
    # 必须先原局，再按提交轮次接续；归档内的目录顺序不用于推断父局。
    for spec in specs.values():
        archives.setdefault(spec['archive'],{})[spec['id']]=spec
    source_paths=[HERE/'consumer.ts',HERE/'projection.ts',HERE/'semantic_actions.ts',HERE/'run_phone.py',HERE.parent/'native_reader/reader.ts',HERE.parent/'native_reader/types.ts']
    historical=json.loads((ROOT/'ai_training/next_stage_research_20261015/replay_audit/current-audit-summary.json').read_text(encoding='utf8'))
    source_paths.extend(ROOT/p for p in historical['sourceHashesAtFinish'])
    identity={str(p.relative_to(ROOT)).replace('\\','/'):digest(p.read_bytes()) for p in source_paths}
    source_id=digest(json.dumps(identity,sort_keys=True).encode())
    source_file=out/'source-identity.json'
    if source_file.exists():
        if json.loads(source_file.read_text())['source']!=identity:raise RuntimeError('源码身份变化，须使用新输出目录')
    else:source_file.write_text(json.dumps({'sourceId':source_id,'source':identity},ensure_ascii=False,indent=2),encoding='utf8')
    command=['node','--import','tsx',str(HERE/'consumer.ts'),str(out)]
    proc=subprocess.Popen(command,cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(out/'consumer-stderr.log').open('ab'))
    completed=0;start=time.monotonic();receipts=[];stop=False

    def send(ident,files):
        nonlocal completed,stop
        free=shutil.disk_usage(ROOT).free
        size=sum(p.stat().st_size for p in HERE.parent.rglob('*') if p.is_file())
        if free<12*1024**3 or size>1024**3:
            raise RuntimeError('本研究磁盘水位触发：只停止自身，保留所有产物')
        spec=specs[ident].copy()
        if spec['kind']=='original':
            config=files.get('config.bin')
            if config is None:raise RuntimeError('归档缺config')
            cp=out/'configs'/(ident+'.bin')
            if cp.exists():
                if cp.read_bytes()!=config:raise RuntimeError('既有config身份不同')
            else:cp.write_bytes(config)
        else:files['config.bin']=(out/'configs'/(spec['parentId']+'.bin')).read_bytes()
        spec['sourceIdentity']=source_id
        spec['files']=[dict(name=n,bytes=len(b)) for n,b in sorted(files.items())]
        head=json.dumps(spec,separators=(',',':')).encode()
        proc.stdin.write(struct.pack('>I',len(head)));proc.stdin.write(head)
        for n,b in sorted(files.items()):proc.stdin.write(b)
        proc.stdin.flush()
        response=proc.stdout.readline()
        if not response:raise RuntimeError('转换子进程退出，参阅consumer-stderr.log')
        row=json.loads(response)
        completed+=1;receipts.append(row)
        if completed<=8 or completed%25==0:print(json.dumps(dict(done=completed,id=ident,seconds=round(time.monotonic()-start,2),**{k:v for k,v in row.items() if k!='id'}),ensure_ascii=False),flush=True)
        if args.limit and completed>=args.limit:stop=True

    try:
        for archive,group in archives.items():
            current=None;files={}
            with tarfile.open(archive,'r|gz') as tar:
                for m in tar:
                    name=m.name.removeprefix('./')
                    ident,_,base=name.partition('/')
                    if current and ident!=current:
                        send(current,files);files={};current=None
                        if stop:break
                    if ident not in group or not m.isfile():continue
                    current=ident
                    if base in ('config.bin','initial.bin','final.bin','actions.jsonl','actions.jsonl.gz','states.bin','states.bin.gz'):
                        files[base]=tar.extractfile(m).read()
                if not stop and current:send(current,files)
            if stop:break
    finally:
        proc.stdin.close();code=proc.wait(timeout=30)
        if code:raise RuntimeError(f'Node退出码{code}')
    after={str(p.relative_to(ROOT)).replace('\\','/'):digest(p.read_bytes()) for p in source_paths}
    if identity!=after:raise RuntimeError('执行中源码身份变化，禁止发布资格')
    report=dict(observed_at=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
                snapshot=str(snapshot),source_id=source_id,source_stable=True,requested_segments=len(specs),processed=completed,
                accepted=sum(r.get('transitionAccepted',False) for r in receipts),seconds=time.monotonic()-start,
                all_requested_processed=completed==len(specs),disk_free_bytes=shutil.disk_usage(ROOT).free)
    target=out/('run-summary-'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'.json')
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':main()
