"""按领先配方的完整父子链复核第二seed，固定数据和超参，不只重跑末轮。"""
import sys,pathlib,json,subprocess,os,hashlib
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1];chain=sys.argv[1:];assert chain
mapping={name:name+'_s2026' for name in chain};diffs=[]
for name in chain:
    old=json.loads((S/f'configs/train_{name}.json').read_text(encoding='utf8'));new=dict(old);new['id']=mapping[name];new['seed']=2026
    if old.get('init'):
        for parent in chain:
            if pathlib.Path(old['init']).resolve()==(S/f'checkpoints/{parent}/best.json').resolve():new['init']=str(S/f'checkpoints/{mapping[parent]}/best.json')
    differences={k:{'original':old.get(k),'secondSeed':new.get(k)} for k in old.keys()|new.keys() if old.get(k)!=new.get(k)}
    assert set(differences)<=set(['id','seed','init'])
    p=S/f'configs/train_{mapping[name]}.json'
    if p.exists():assert json.loads(p.read_text(encoding='utf8'))==new
    else:
        with p.open('x',encoding='utf8') as f:json.dump(new,f,ensure_ascii=False,indent=2)
    diffs.append({'stage':name,'differences':differences})
manifest={'chain':chain,'mapping':mapping,'diffs':diffs,'interpretation':'数据、更新数、损失、优化器和选模规则相同；seed不同；多轮init跟随对应seed的前轮best，id为产物命名差异。DAgger使用同一冻结数据集。'}
p=S/'identity/second_seed_recipe.json'
if p.exists():assert json.loads(p.read_text(encoding='utf8'))==manifest
else:
    with p.open('x',encoding='utf8') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
env=os.environ.copy();env.update(PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
for name in chain:
    flag=S/f'evidence/candidate_completed_{mapping[name]}.json'
    if flag.exists():
        completed=json.loads(flag.read_text(encoding='utf8'));assert completed['modelSha256']==hashlib.sha256((S/f'checkpoints/{mapping[name]}/best.json').read_bytes()).hexdigest();assert completed['configSha256']==hashlib.sha256((S/f'configs/train_{mapping[name]}.json').read_bytes()).hexdigest()
        print('复用已完成的同配方第二seed前缀',mapping[name],flush=True);continue
    subprocess.run([sys.executable,str(S/'research/run_candidate.py'),mapping[name]],cwd=R,env=env,check=True)
(S/'evidence/second_seed_completed.json').write_text(json.dumps({'completed':True,'chain':[mapping[x] for x in chain]}),encoding='utf8')
