"""固定轮1验证集，将学生访问的新标签并入训练；不覆盖任何已锁定数据。"""
import pathlib,json,gzip,collections,sys,hashlib,shutil
from curate import ih,sha,rows
S=pathlib.Path(__file__).resolve().parents[1]
tag,base,pattern=sys.argv[1:4];out=S/'data'/tag;out.mkdir(exist_ok=False)
def read(p):
    with gzip.open(p,'rt',encoding='utf8') as f:
        for line in f:yield json.loads(line)
vh=set();vg=set()
for s in read(S/f'data/{base}/val.jsonl.gz'):vh.add(s['inputHash']);vg.add(s['familyId'])
def core(s):return hashlib.sha256(json.dumps({k:s['stateJson'].get(k) for k in ['currentPlayer','players','units','graves','pendingUnitId','map','ruleConfig']},sort_keys=True,separators=(',',':')).encode()).hexdigest()
train={s['inputHash']:('base',s['targetActionIndex'],core(s)) for s in read(S/f'data/{base}/train.jsonl.gz')};basecount=len(train);conflicts=set();aliases=set();new=set();dups=0;leaks=0
files=sorted(p for p in (S/'data/raw').glob(pattern) if pathlib.Path(str(p).replace('.jsonl.gz','.json')).exists())
for p,s in rows(files):
    h=ih(s);assert h==s['inputHash'];assert s['split']=='train' and s['familyId'] not in vg
    if h in vh:leaks+=1;continue
    if h in train:
        dups+=1
        if train[h][1]!=s['targetActionIndex']:conflicts.add(h)
        if train[h][2]!=core(s):aliases.add(h)
        continue
    train[h]=((p.name,s['stepIndex']),s['targetActionIndex'],core(s));new.add(h)
for h in conflicts|aliases:train.pop(h,None);new.discard(h)
counts={};groups={};actions={};slices=collections.Counter()
def selected_rows():
    for s in read(S/f'data/{base}/train.jsonl.gz'):
        if s['inputHash'] in train and train[s['inputHash']][0]=='base':yield s
    for p,s in rows(files):
        if s['inputHash'] in train and train[s['inputHash']][0]==(p.name,s['stepIndex']):yield s
for split,samples in [('train',selected_rows()),('val',read(S/f'data/{base}/val.jsonl.gz'))]:
    c=collections.Counter();g=collections.defaultdict(set);a=collections.Counter()
    with gzip.open(out/f'{split}.jsonl.gz','wt',encoding='utf8',compresslevel=1) as f:
        for s in samples:
            c[s['mapName']]+=1;g[s['mapName']].add(s['familyId']);t=max(range(14),key=lambda i:s['candidateSemantics'][s['targetActionIndex']][i]);a[str(t)]+=1
            if split=='train':
                st=s['stateJson'];slices['end_turn_target']+=t==13;slices['pending']+=bool(st.get('pendingUnitId'));slices['low_gold']+=st['players'][st['currentPlayer']]['gold']<100;slices['capture_target']+=t==2;slices['commander_low_hp']+=any(u['ownerId']==st['currentPlayer'] and u['unitClass']=='commander' and u['hp']<=40 for u in st['units'])
            f.write(json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n')
    counts[split]=dict(c);groups[split]={k:len(v) for k,v in g.items()};actions[split]=dict(a)
# 验证集沿用完整压缩文件字节，保证不仅样本集合相同。
shutil.copyfile(S/f'data/{base}/val.jsonl.gz',out/'val.jsonl.gz')
assert sha(out/'val.jsonl.gz')==sha(S/f'data/{base}/val.jsonl.gz')
report={'tag':tag,'baseDataset':base,'baseManifestSha256':sha(S/f'data/{base}/manifest.json'),'baseRowsBeforeConflicts':basecount,'newUniqueDaggerRows':len(new),'rawFiles':{p.name:sha(p) for p in files},'duplicateRows':dups,'conflictingInputsExcluded':len(conflicts),'stateCoreAliasesExcludedConservatively':len(aliases),'crossSplitOccurrencesExcludedFromTrain':leaks,'trainCount':len(train),'valCount':len(vh),'counts':counts,'groups':groups,'actionTypes':actions,'slices':dict(slices),'splitInputOverlap':0,'splitFamilyOverlap':0,'validationIdentityPreserved':True,'trainSha256':sha(out/'train.jsonl.gz'),'valSha256':sha(out/'val.jsonl.gz')}
(out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='rawFiles'},ensure_ascii=False))
