"""同一冻结面板只采集一次基线；最终阶段重新严格重放，保留复用谱系。"""
from pathlib import Path
import hashlib,json,shutil
HERE=Path(__file__).resolve().parent
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def reuse(slot,target):
    if slot['model'] not in ['hierarchical','pure']:return False
    required=['source-freeze-teacher.json','source-freeze-final.json','teacher-model-identities.json','final-model-identities.json']
    if not all((HERE/n).exists() for n in required):return False
    before,after=[read(HERE/n)['files'] for n in required[:2]]
    # 任意运行源码变化都停止复用；不根据结果胜负选择是否复用。
    if {k:v['sha256'] for k,v in before.items()}!={k:v['sha256'] for k,v in after.items()}:return False
    identities=[read(HERE/n)['models'][slot['model']] for n in required[2:]]
    if identities[0]!=identities[1]:return False
    teacher=read(HERE/'teacher-battle-plan.json');final=read(HERE/'final-battle-plan.json')
    original=next((s for s in teacher['slots'] if s['id']==slot['id']),None)
    if original!=slot or teacher['maps']!=final['maps'] or teacher['budgets']!=final['budgets']:return False
    summary=read(HERE/'teacher-battle-summary.json')
    source=HERE/summary.get('evidenceFolder','teacher-battles')/'slots'/slot['id']
    if not (source/'strict-replay.json').exists():return False
    result=read(source/'result.json');strict=read(source/'strict-replay.json')
    assert strict['passed'] and strict['actions']==result['actions']
    assert result['slot']==slot and result['modelHash']==identities[0]['semanticSha256']
    if target.exists() and any(target.iterdir()):return False
    target.mkdir(parents=True,exist_ok=True)
    files={}
    for p in source.iterdir():
        if p.is_file() and p.name!='strict-replay.json':
            shutil.copy2(p,target/p.name);files[p.name]=sha(p)
    receipt=dict(reused=True,source=str(source),slot=slot,files=files,sourceStrictSha256=sha(source/'strict-replay.json'),
        sourceFreezeSha256=sha(HERE/'source-freeze-teacher.json'),finalFreezeSha256=sha(HERE/'source-freeze-final.json'),
        reason='模型、源码、初态、种子、座位和预算完全相同，固定基线观测复用；不计为独立重复试验',finalStrictReplayRequired=True)
    (target/'reused-evidence.json').write_text(json.dumps(receipt,ensure_ascii=False),encoding='utf-8')
    return True
