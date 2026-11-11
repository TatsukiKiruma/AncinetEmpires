"""仅核对和登记本审核交付，历史产物保持只读。"""
import pathlib,json,hashlib,subprocess,re,datetime
O=pathlib.Path(__file__).resolve().parent;ROOT=O.parents[1];S=O.parent/'r8_pure_policy_stage_20261014_125300'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
a=json.loads((O/'audit_results.json').read_text(encoding='utf8'));r=json.loads((O/'replay_results.json').read_text(encoding='utf8'));p=json.loads((O/'fresh_parity_results.json').read_text(encoding='utf8'));c=json.loads((O/'checkpoint_results.json').read_text(encoding='utf8'))
assert a['panels']['final_r8']['counts']=={'natural_loss':19,'natural_win':1}
assert r['passed'] and r['checkedGames']==40 and len(r['cross'])==2 and len(r['within'])==1
assert p['passed'] and p['argmaxMatches']==250 and len(c)==10
assert not a['protection']['mismatches'] and not a['delivery']['mismatches']
current={rel:sha(S/rel)==h for rel,h in json.loads((S/'identity/candidate_freeze.json').read_text())['files'].items()};assert all(current.values())
missing=[]
for f in O.glob('*.md'):
 for link in re.findall(r'\]\(([^)]+)\)',f.read_text(encoding='utf8')):
  if '://' not in link and not (f.parent/link.split('#')[0]).exists():missing.append([f.name,link])
assert not missing,missing
status=subprocess.check_output(['git','status','--short'],cwd=ROOT);(O/'git_status_after.txt').write_bytes(status)
before=set((O/'git_status_before.txt').read_text(encoding='utf-8-sig').splitlines());after=set(status.decode('utf8').splitlines())
done={'completedBeijing':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'r8FrozenFilesEndCheck':current,'gitStatusAdded':sorted(after-before),'gitStatusRemoved':sorted(before-after),'cleanupDeleted':[],'trainingStarted':False,'published':False,'qa':'中文文档链接、结构化统计、独立回放/前向/恢复产物与结束候选身份通过'}
(O/'completion_check.json').write_text(json.dumps(done,ensure_ascii=False,indent=2),encoding='utf8')
files={f.name:{'bytes':f.stat().st_size,'sha256':sha(f)} for f in O.iterdir() if f.is_file() and f.name!='DELIVERY_SHA256.json'}
(O/'DELIVERY_SHA256.json').write_text(json.dumps(files,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'frozenFiles':len(current),'allMatch':all(current.values()),'gitStatusAdded':done['gitStatusAdded'],'gitStatusRemoved':done['gitStatusRemoved'],'deliveredFiles':len(files)},ensure_ascii=False))
