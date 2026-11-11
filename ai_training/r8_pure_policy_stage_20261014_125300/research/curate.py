"""真实输入去重、家族隔离及样本清单；所有输出仅在本阶段内。"""
import json,gzip,pathlib,hashlib,struct,collections,sys,math
S=pathlib.Path(__file__).resolve().parents[1]
def ih(s):
    h=hashlib.sha256()
    for k in ['spatial','global']:h.update(struct.pack('<'+'f'*len(s[k]),*s[k]))
    h.update(f"candidates:{len(s['candidateSemantics'])};".encode())
    for a,l,t,sem in zip(s['candidateActorCoords'],s['candidateLandingCoords'],s['candidateTargetCoords'],s['candidateSemantics']):
        h.update(f'[{a[0]},{a[1]}][{l[0]},{l[1]}][{t[0]},{t[1]}]:'.encode());h.update(struct.pack('<'+'f'*len(sem),*sem))
    return h.hexdigest()
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def rows(files):
    for p in files:
        pending=None
        with gzip.open(p,'rt',encoding='utf8') as f:
            for line in f:
                d=json.loads(line)
                if d['type']=='sample':pending=d['sample']
                elif d['type']=='step' and pending is not None:
                    if d['step']==pending['stepIndex'] and d['beforeHash']==pending['stateHash']:yield p,pending
                    pending=None
def run(tag,patterns):
    out=S/'data'/tag;out.mkdir(exist_ok=False)
    files=sorted({p for pattern in patterns for p in (S/'data/raw').glob(pattern) if pathlib.Path(str(p).replace('.jsonl.gz','.json')).exists()});first={};conflicts=set();aliases=set();bad=[];duplicates=0;cross=0
    for p,s in rows(files):
        h=ih(s)
        if h!=s['inputHash']:bad.append([p.name,s['stepIndex']]);continue
        assert len(s['spatial'])==34*400 and len(s['global'])==20 and all(len(a)==53 for a in s['candidateSemantics'])
        assert math.isfinite(sum(s['spatial'])+sum(s['global'])+sum(sum(a) for a in s['candidateSemantics']))
        assert len(s['actionCodes'])==len(s['candidateSemantics']) and 0<=s['targetActionIndex']<len(s['actionCodes'])
        st=s['stateJson'];core={k:st.get(k) for k in ['currentPlayer','players','units','graves','pendingUnitId','map','ruleConfig']};core_hash=hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        target_type=max(range(14),key=lambda i:s['candidateSemantics'][s['targetActionIndex']][i])
        key=(p.name,s['stepIndex']);record=(key,s['targetActionIndex'],s['split'],s['gameId'],core_hash,s['mapName'],target_type)
        if h in first:
            duplicates+=1;prev=first[h]
            if prev[1]!=record[1]:conflicts.add(h)
            if prev[4]!=core_hash:aliases.add(h)
            if prev[2]!=record[2]:cross+=1
            if record[2]=='val' and prev[2]!='val':first[h]=record
        else:first[h]=record
    assert not bad,'输入哈希失配'
    # 先按家族再按地图限额，端回合稀有正例优先；其余按输入哈希均匀散列取样。
    by_family=collections.defaultdict(list);selected=set()
    for h,r in first.items():
        if h in conflicts or h in aliases:continue
        if r[2]=='val':selected.add(h)
        else:by_family[(r[5],r[3])].append(h)
    by_map=collections.defaultdict(list)
    for (map_name,game),hs in by_family.items():by_map[map_name].extend(sorted(hs,key=lambda h:(first[h][6]!=13,h))[:400])
    for hs in by_map.values():selected.update(sorted(hs,key=lambda h:(first[h][6]!=13,h))[:5000])
    counts={s:collections.Counter() for s in ['train','val']};groups={s:collections.defaultdict(set) for s in ['train','val']};actions={s:collections.Counter() for s in ['train','val']};slices=collections.Counter();written=set()
    with gzip.open(out/'train.jsonl.gz','wt',encoding='utf8',compresslevel=1) as ft,gzip.open(out/'val.jsonl.gz','wt',encoding='utf8',compresslevel=1) as fv:
        for p,s in rows(files):
            h=s['inputHash']
            if h not in selected or h in written or (p.name,s['stepIndex'])!=first[h][0]:continue
            written.add(h);split=s['split'];counts[split][s['mapName']]+=1;groups[split][s['mapName']].add(s['familyId']);t=max(range(14),key=lambda i:s['candidateSemantics'][s['targetActionIndex']][i]);actions[split][str(t)]+=1
            if split=='train':
                st=s['stateJson'];player=st['currentPlayer'];own=[u for u in st['units'] if u['ownerId']==player]
                slices['end_turn_target']+=t==13;slices['pending']+=bool(st.get('pendingUnitId'));slices['low_gold']+=st['players'][player]['gold']<100;slices['capture_target']+=t==2;slices['commander_low_hp']+=any(u['unitClass']=='commander' and u['hp']<=40 for u in own)
            (ft if split=='train' else fv).write(json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n')
    train_groups=set().union(*groups['train'].values()) if groups['train'] else set();val_groups=set().union(*groups['val'].values()) if groups['val'] else set();assert not train_groups&val_groups
    report={'tag':tag,'rawFiles':{p.name:sha(p) for p in files},'samplingCaps':{'perFamily':400,'perMap':5000,'priority':'端回合正例，然后输入哈希顺序'},'duplicateRows':duplicates,'conflictingInputsExcluded':len(conflicts),'stateCoreAliasesExcludedConservatively':len(aliases),'aliasCaveat':'核心包含单位ID；可能含身份等价，不将所有碰撞宣称为已证明的决策别名。','crossSplitOccurrencesExcludedFromTrain':cross,'hashMismatches':bad,'counts':{k:dict(v) for k,v in counts.items()},'groups':{k:{m:len(v) for m,v in d.items()} for k,d in groups.items()},'actionTypes':{k:dict(v) for k,v in actions.items()},'slices':dict(slices),'trainCount':sum(counts['train'].values()),'valCount':sum(counts['val'].values()),'splitInputOverlap':0,'splitFamilyOverlap':0,'trainSha256':sha(out/'train.jsonl.gz'),'valSha256':sha(out/'val.jsonl.gz')}
    (out/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');(out/'quarantined_conflicts.json').write_text(json.dumps(sorted(conflicts)),encoding='utf8');(out/'quarantined_aliases.json').write_text(json.dumps(sorted(aliases)),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='rawFiles'},ensure_ascii=False,indent=2))
if __name__=='__main__':run(sys.argv[1],sys.argv[2:] or ['base_*.jsonl.gz'])
