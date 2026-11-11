"""阶段5冻结合同与仅对当前实际保留文件建立的保全基线。"""
from pathlib import Path
import os,json,hashlib,subprocess,collections
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def digest(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def save(n,v):
    if (HERE/n).exists():
        assert read(HERE/n)==v,n
        return
    with (HERE/n).open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False)
if __name__=='__main__':
    status=subprocess.run(['git','status','--short'],cwd=ROOT,capture_output=True,check=True)
    (HERE/'initial-git-status.txt').write_bytes(status.stdout)
    selection=read(HERE.parent/'sd64x3_phone_20261016/selection.json')
    counts=collections.Counter(p['split'] for p in selection['parents'])
    assert counts=={'train':720,'validation':180},counts
    save('selection.json',selection)
    save('preregister.json',dict(seed=2026101905,trainParents=720,devParents=180,epochs=4,distillEpochs=1,
        policyWarmStart=digest(HERE.parent/'tactical_value_search_20261018/model-final.json'),
        winningWeight=1.5,expertWeight=2.,teacherGames=40,teacherOpponents=['heuristic','apk_like'],
        search=dict(topK=6,maxFollowNodes=24,maxAttackers=3,forcedEndTurn=False,branchPolicyCalls=0),
        latency=dict(valueMs=5,searchP95TargetMs=500,searchP95GateMs=600,decisionTimeouts=0,wallTruncations=0),
        arms=['hierarchical','pure','stage5_pure','stage5_search'],
        fixedSlotsPerArm=30,expandedSlotsPerArm=20,independentEvaluation=False,
        selectionRule='按开发NLL选择模型与校准，实战胜负不反选超参数；未过门禁如实披露',
        splitRule='原900分区固定，专家仅训练父局合法前缀；标准地图评测已消费，不称独立泛化',phoneOperations=0))
    paths=set()
    # 历史清单只用来定位实际存在的文件，清理前的预期缺件不进入本次分母。
    for folder in ['tactical_conditional_20261018','tactical_scale_20261018','tactical_value_search_20261018']:
        base=HERE.parent/folder
        for name in ['PRESERVE.json','DELIVERY_MANIFEST.json']:
            p=base/name
            if not p.exists():continue
            def visit(x):
                if isinstance(x,dict):
                    for k,v in x.items():
                        for candidate in [ROOT/k,base/k]:
                            if candidate.is_file():paths.add(candidate.resolve())
                        visit(v)
                elif isinstance(x,list):
                    for v in x:visit(v)
            visit(read(p))
        for directory,dirs,files in os.walk(base,followlinks=False):
            dirs[:]=[d for d in dirs if not d.startswith(('chrome-profile','__pycache__')) and not Path(directory,d).is_symlink() and not os.path.isjunction(Path(directory,d))]
            paths.update(Path(directory,n).resolve() for n in files)
    for folder in ['src','docs']:
        paths.update(p.resolve() for p in (ROOT/folder).rglob('*') if p.is_file())
    paths.update((ROOT/n).resolve() for n in ['AGENTS.md','package.json','package-lock.json'])
    result={}
    for i,p in enumerate(sorted(paths)):
        if not p.is_file():continue
        key=str(p.relative_to(ROOT) if p.is_relative_to(ROOT) else p).replace('\\','/')
        result[key]=dict(sha256=digest(p),bytes=p.stat().st_size)
        if i%1000==0:print('保全SHA',i,'/',len(paths),flush=True)
    save('PRESERVE.json',result)
    save('TASK_STATE.json',dict(status='running',phase='实现与回归',complete=False))
    print(json.dumps(dict(parents=counts,preservedFiles=len(result),preservedBytes=sum(v['bytes'] for v in result.values()))))
