"""核对交付入口并索引本阶段普通文件，拒绝穿越链接。"""
import hashlib,json,os,pathlib,re,time
S=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads((S/p).read_text(encoding='utf-8-sig'))
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()
v=read('evidence/final_acceptance_verdict.json')
assert v['games']==v['denominator']==20 and v['naturalWins']==1 and v['verdict']=='REJECTED'
assert digest(S/'checkpoints/r1_warm/best.json')==v['modelSha256']
assert len(v['crossDevFinalIdenticalTrajectories'])==2
assert len(v['withinFinalIdenticalTrajectories'])==1
missing=[]
for name in ['README.md','HANDOFF.md','STAGE_REPORT.md','reports/要求逐项验收.md']:
    p=S/name
    for target in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf8')):
        if '://' not in target and target!='identity/delivery_manifest.json' and not (p.parent/target.split('#')[0]).exists():missing.append([name,target])
assert not missing,missing
qa={'passed':True,'checked':['四份中文交付文档及Markdown链接','裁决固定20局及1胜','模型实际SHA256','跨面板两局及面板内一对完整轨迹重复'],'timeUnix':time.time()}
(S/'identity/delivery_validation.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf8')
items=[];links=[]
def walk(folder):
    for e in sorted(os.scandir(folder),key=lambda x:x.name):
        p=pathlib.Path(e.path);st=e.stat(follow_symlinks=False);rel=p.relative_to(S).as_posix()
        if e.is_symlink() or getattr(st,'st_file_attributes',0)&0x400:links.append(rel);continue
        if e.is_dir(follow_symlinks=False):walk(p)
        elif e.is_file(follow_symlinks=False) and rel!='identity/delivery_manifest.json':
            h=digest(p);after=p.stat()
            assert (st.st_size,st.st_mtime_ns)==(after.st_size,after.st_mtime_ns),f'索引期间文件变化：{rel}'
            items.append({'path':rel,'bytes':st.st_size,'sha256':h})
walk(S)
now=time.time();budget=read('identity/budget.json')
out={'completedUnix':now,'wallSecondsSinceFirstCompute':now-budget['startedUnix'],'withinWallBudget':now<budget['finalDeadlineUnix'],'fileCount':len(items),'totalBytes':sum(x['bytes'] for x in items),'skippedLinks':links,'excluded':['identity/delivery_manifest.json'],'files':items}
assert out['withinWallBudget']
p=S/'identity/delivery_manifest.json';assert not p.exists(),'不覆盖已有交付索引'
p.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in out.items() if k!='files'},ensure_ascii=False))
