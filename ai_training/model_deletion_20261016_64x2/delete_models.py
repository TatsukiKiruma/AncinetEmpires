import pathlib,json,hashlib,subprocess,time,sys

REPO=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
ADB='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
REMOTE='/data/local/tmp/ae_sd32_900_20261016'
TARGETS={
    'sd_300_parent_pilot_20261016':['best.bin','last.bin','model-header.bin','candidate.json','initial.json'],
    'sd_300_pilot_battles_20261016':['models/pilot.json'],
    'sd32_phone_20261016':['best.bin','candidate.json','initial.json','epoch-1.json','epoch-2.json','epoch-3.json'],
    'sd32_phone_battles_20261016':['models/phone32.json'],
}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def adb(*args,check=True):
    p=subprocess.run([ADB,'-s','c2357770',*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
    if check and p.returncode:raise RuntimeError(p.stdout+p.stderr)
    return p

def pc():
    entries=[]
    for folder,names in TARGETS.items():
        base=(REPO/'ai_training'/folder).resolve()
        assert base.parent==(REPO/'ai_training').resolve()
        for name in names:
            p=base/name
            assert p.resolve()==p and p.is_file() and not p.is_symlink()
            entries.append(dict(path=str(p.relative_to(REPO)).replace('\\','/'),bytes=p.stat().st_size,sha256=sha(p)))
    record=dict(authorizedBy='用户明确要求删除300局和900局的模型数据',scope='仅两轮模型权重、初始化权重、检查点及对战模型副本；源训练数据、源码、schema、报告和历史清单保留',at=time.time(),entries=entries,completed=False)
    path=OUT/'pc-deletion.json';path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    # 精确文件白名单逐项删除，不递归删除目录或训练数据。
    for e in entries:
        p=REPO/e['path'];assert sha(p)==e['sha256'];p.unlink();assert not p.exists()
    record['completed']=True;record['deletedBytes']=sum(e['bytes'] for e in entries)
    path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(completed=True,files=len(entries),deletedBytes=record['deletedBytes'])))

def phone():
    assert adb('shell','realpath',REMOTE).stdout.strip()==REMOTE
    owned=[line for line in adb('shell','ps','-A','-o','PID,ARGS').stdout.splitlines() if REMOTE in line]
    assert not owned,owned
    entries=[]
    for name in ['initial.json','epoch-1.json','epoch-2.json','epoch-3.json','resume.json','resume.json.tmp','best.bin','last.bin','candidate.json','model-header.bin']:
        target=REMOTE+'/'+name
        if adb('shell','test','-f',target,check=False).returncode:continue
        assert adb('shell','realpath',target).stdout.strip()==target
        h=adb('shell','sha256sum',target).stdout.split()[0]
        size=int(adb('shell','stat','-c','%s',target).stdout.strip())
        entries.append(dict(path=target,bytes=size,sha256=h))
    record=dict(authorizedBy='用户明确要求删除300局和900局的模型数据',at=time.time(),entries=entries,completed=False)
    path=OUT/'phone-deletion.json';path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    for e in entries:
        assert adb('shell','sha256sum',e['path']).stdout.split()[0]==e['sha256']
        adb('shell','rm','-f',e['path'])
        assert adb('shell','test','-e',e['path'],check=False).returncode!=0
    record['completed']=True;record['deletedBytes']=sum(e['bytes'] for e in entries)
    path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(completed=True,files=len(entries),deletedBytes=record['deletedBytes'])))

if __name__=='__main__':
    {'pc':pc,'phone':phone}[sys.argv[1]]()
