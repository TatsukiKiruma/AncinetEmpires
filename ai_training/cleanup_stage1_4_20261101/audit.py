import json,tarfile,hashlib,collections
from pathlib import Path
BASE=Path('D:/AncientEmpiresData');OUT=Path('C:/code/AncinetEmpires/ai_training/cleanup_stage1_4_20261101')
roots=[BASE/n for n in ['continuation_stage1_20261030_v1','continuation_stage2_20261030_v1','continuation_stage3_20261030_v1','continuation_stage4_20261031_v1']]
index=collections.defaultdict(list)
for root in roots:
 for p in root.rglob('*'):
  if p.is_file() and p.suffix!='.tar':index[(p.name,p.stat().st_size)].append(p)
cache={}
def sha(p):
 if str(p) not in cache:
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
  cache[str(p)]=h.hexdigest()
 return cache[str(p)]
archives=sorted(roots[2].rglob('*.tar'),key=lambda p:p.stat().st_size,reverse=True)
plan=[]
for num,p in enumerate(archives):
 if p.stat().st_size<100_000_000:continue
 records=[]
 with tarfile.open(p) as t:
  for m in t:
   if not m.isfile():
    if m.issym() or m.islnk():records.append({'member':m.name,'link':m.linkname})
    continue
   h=hashlib.sha256();f=t.extractfile(m)
   for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
   digest=h.hexdigest();match=None
   for candidate in index[(Path(m.name).name,m.size)]:
    if sha(candidate)==digest:match=candidate;break
   if match is None:
    # 未匹配的原件独立保存，禁止依据文件名推断为可删。
    match=OUT/'preserved'/str(num)/Path(m.name)
    assert match.resolve().is_relative_to((OUT/'preserved').resolve())
    match.parent.mkdir(parents=True,exist_ok=True)
    with match.open('xb') as out:
     f=t.extractfile(m)
     for b in iter(lambda:f.read(4*1024*1024),b''):out.write(b)
    assert sha(match)==digest
    index[(match.name,m.size)].append(match)
   records.append({'member':m.name,'size':m.size,'sha256':digest,'retained':str(match)})
 manifest=OUT/f'archive-{num}.json';manifest.write_text(json.dumps(records,ensure_ascii=False),encoding='utf-8')
 plan.append({'path':str(p),'size':p.stat().st_size,'sha256':sha(p),'manifest':str(manifest)})
 print(json.dumps({'archive':str(p),'verifiedMembers':len(records)},ensure_ascii=False),flush=True)
(OUT/'DELETE_PLAN.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
