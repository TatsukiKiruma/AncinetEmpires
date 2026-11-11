"""停止新增槽位的R1只报告实际观测，不补齐、不冒充资格通过。"""
from pathlib import Path
import json,collections,math,gzip
HERE=Path(__file__).resolve().parent
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
folder=HERE/'teacher-battles/slots';rows=[];risk=collections.Counter();actions=0
assert not [p for p in folder.glob('*/actions.jsonl') if not (p.parent/'result.json').exists()],'存在在途前缀，必须等待完成'
for p in folder.glob('*/result.json'):
    r=read(p);s=read(p.parent/'strict-replay.json');assert s['passed'] and s['actions']==r['actions'];actions+=s['actions'];risk.update(s['riskWitnessAudit']);rows.append(r)
groups=collections.defaultdict(collections.Counter)
for r in rows:groups['/'.join([r['slot'].get('panel','fixed'),r['slot']['opponent'],r['slot']['model']])][r['classification']]+=1
divergences=[]
for r in rows:
    if r['slot']['model']!='teacher_search':continue
    name=r['slot']['id'];reference=folder/name.replace('teacher_search','pure')
    if not (reference/'result.json').exists():continue
    with gzip.open(folder/name/'actions.jsonl.gz','rt',encoding='utf-8') as left,gzip.open(reference/'actions.jsonl.gz','rt',encoding='utf-8') as right:
        previous=None
        for a,b in zip(left,right):
            a,b=json.loads(a),json.loads(b)
            if a['beforeHash']!=b['beforeHash']:break
            if a['code']!=b['code']:
                q=a.get('search') or {};divergences.append(dict(slot=name,row=a['i'],beforeHash=a['beforeHash'],searchCode=a['code'],pureCode=b['code'],reason=q.get('reason'),changed=q.get('changed'),previous=previous));break
            previous=dict(code=a['code'],search=a.get('search'))
result=dict(stopped=True,qualified=False,plannedSlots=150,completedSlots=len(rows),strictPassed=True,strictActions=actions,riskWitnessAudit=dict(risk),groups=dict(groups),firstDivergences=divergences,reason=read(HERE/'teacher-battles/STOP_NEW_SLOTS.json'),sourceFreeze='source-freeze-teacher.json（R1原件另存revisions/r1）',independentEvaluation=False)
(HERE/'teacher-r1-stopped-summary.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
lines=['# 教师R1停止新增槽位记录','',f'计划150槽，实际完成{len(rows)}槽/{actions}动作，全部strict及反扑见证核验通过。其余槽未提交动作。没有完整资格结论，不允许作为在线纠错教师。','', '定位到默认保底缺陷：未触发Veto/Takeover仍提交轻量plan队列，普通空城新兵被wait覆盖真实移动。停止新槽位后在途对局均完成，原始数据完整保留。','', '|组|实际分类|','|---|---|']
lines.extend(f'|{k}|{json.dumps(dict(v),ensure_ascii=False)}|' for k,v in groups.items());lines+=['','首处分歧的状态hash、默认动作和干预标志见teacher-r1-stopped-summary.json。修订不改变模型、评分系数或候选预算。']
(HERE/'TEACHER_R1_STOPPED.md').write_text('\n'.join(lines),encoding='utf-8');print(json.dumps(dict(completed=len(rows),actions=actions,strict=True),ensure_ascii=False))
