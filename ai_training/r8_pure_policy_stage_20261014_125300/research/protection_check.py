"""只读复核登记的保护文件与冻结闭包；绝不递归进入支持链接。"""
import pathlib,json,hashlib,sys,time
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1]
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
t=time.monotonic();before=json.loads((S/'identity/protected_before.json').read_text(encoding='utf8'));diff=[]
for name,v in before['files'].items():
    p=R/name
    if not p.exists():diff.append({'path':name,'reason':'missing'});continue
    if p.stat().st_size!=v['bytes'] or sha(p)!=v['sha256']:diff.append({'path':name,'reason':'changed'})
frozen=[]
for v in json.loads((S/'identity/manifest.json').read_text(encoding='utf8'))['files']:
    if sha(S/v['frozen'])!=v['frozenSha256']:frozen.append(v['frozen'])
report={'passed':not diff and not frozen,'protectedFiles':len(before['files']),'changed':diff,'frozenChanged':frozen,'elapsedSeconds':time.monotonic()-t,'checkedUnix':time.time()}
p=S/'identity'/f'protection_{sys.argv[1]}.json'
with p.open('x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False));assert report['passed'],'保护身份漂移，停止依赖任务'
