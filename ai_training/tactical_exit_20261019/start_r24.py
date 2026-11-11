"""针对已有Top12外安全战术遗漏，事先登记单一Top16容量方案。"""
from pathlib import Path
import json,hashlib,datetime
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r24';REV.mkdir(exist_ok=False)
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gate=read('teacher-r23-gate.json');assert not gate['passed'] and gate['strictReplay'] and gate['slots']==150
assert read('revisions/r23/preservation-after-full-panel.json')['passed']
for name in ['model_battle_search_ai.ts','search_budget.ts','audit_search_risks.ts','safe_recruitment_coverage.ts','teacher-model.json','leaf.ts','ACTIVE_SEARCH_PROTOCOL.json','search_prior_config.ts','validate_guard_revision.py','prepare_revision.mjs','deliver.py','root_capacity_regression.ts','search_capacity_speed.ts','root-capacity-red-green-gate.json','search-capacity-speed-gate.json']:
    with (REV/(name+'.before.snapshot')).open('xb') as out:out.write((HERE/name).read_bytes())
for name in ['teacher-r23-gate.json','teacher-r23-battle-summary.json','source-freeze-teacher-r23.json']:
    with (REV/name).open('xb') as out:out.write((HERE/name).read_bytes())
frozen=read('source-freeze-teacher-r23.json')['files']['ai_training/tactical_exit_20261019/model_battle_search_ai.ts'];source=HERE/frozen['snapshot'];assert sha(source)==frozen['sha256'];target=HERE/'revisions/r23/model_battle_search_ai.ts.snapshot'
if not target.exists():
    with target.open('xb') as out:out.write(source.read_bytes())
assert sha(target)==frozen['sha256']
p=read('search_scale_protocol_v11_safe_recruitment_coverage.json')
p.update(version='search-scale-v12-top16',revision='r24',previousRevision='r23',candidateCollectionTag='teacher-r24',executeAfter='R23完整150槽84950实际动作/329084风险见证strict，固定23<24失败，扩展13/20已过质量；9925保全缺失0意外0',createdAt=datetime.datetime.now().isoformat(timespec='seconds'),purpose='覆盖已证实原Top12外、先验约第13至15位的真实安全且更高叶子；不以单局失败反选或屏蔽合法收益动作',searchBudget=dict(topK=16,maxFollowNodes=24,maximumOwnNodes=400,oldTopK=12,oldMaximumOwnNodes=300,originalSixPreserved=True,originalTwelvePreserved=True),deterministicFix=dict(capacity='只登记一个Top16方案，保留原Top12全部候选；同单位后续24不增，己方节点显式上限400，分支网络前向0',performanceAdmission='先按原24状态/48次完整根p95<=500ms门禁，再允许全量校准和完整150槽；固定四进程全步/根p95<=600ms及搜索两类超时0不变',leafAndGuards='Policy、Value、全部叶子系数、安全恢复及根Veto/Takeover代码均不变，原合法收益女巫连动不因单局失败而屏蔽',model='冻结03353a53教师和2c9ae3ac提议，原900分区与1557根不变',selection='原NLL网格重新校准，不用实战胜负选择K、系数或样本权重'),causalEvidence=dict(path='revisions/r22/coverage-probe-1792424960789/cases.json',selectedCases=[1,2],reason='真实完整安全候选在原Top12外，追加容量须保留全部旧候选'))
name='search_scale_protocol_v12_top16.json'
with (HERE/name).open('x',encoding='utf-8') as out:json.dump(p,out,ensure_ascii=False)
(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path=name,sha256=sha(HERE/name))),encoding='utf-8')
line='\nR23完整150槽已strict：84950实际动作、329084风险见证，固定22/24/23胜、扩展13/12/13胜；搜索扩展全步p95=426.4993/根445.7018ms，两类超时0。安全弓手遗漏所在r0-s1从257动作负变489动作胜，但apk_like-m4-s1从635动作胜变580动作负，教师仍不合格。第一分歧344步：原wait低价单位，新增女巫移动后免费攻击，确实合法、非致死、净值和叶子更高；原池没有已有安全招募，否定此前猜测，不为胜负屏蔽它。R24事先登记单一Top16/24/400容量，覆盖已证实Top12外第13/15位安全战术，须全量证明原Top12保留，所有胜率/600ms/零超时与单进程500ms门槛不改。9925文件22GB保存基线复核缺失0、意外改动0。专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
current=ROOT/'ai_training/status/CURRENT.md';b=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;current.write_bytes(b.replace(marker,line.encode()+marker))
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R23扩展质量过但固定23<24失败；R24单一Top16先过原性能门禁，专家0'),ensure_ascii=False),encoding='utf-8')
print(dict(revision='r24',topK=16,maximumOwnNodes=400,qualifiedTeacher=False,expertGames=0))
