"""完整R21失败收尾后，事先登记空城部署内部安全完结修复。"""
from pathlib import Path
import json,hashlib,datetime
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r22';REV.mkdir(exist_ok=False)
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gate=read('teacher-r21-resume1-gate.json');assert not gate['passed'] and gate['strictReplay'] and gate['slots']==150
caseFile=HERE/'revisions/r21-resume1/retained-deployment-probe-1792422308984/cases.json';case=json.loads(caseFile.read_text())[0];assert case['row']==40 and case['shadowSelected']!=case['oldSelected']
for name in ['model_battle_search_ai.ts','completion_recovery.ts','movement_query_cache.ts','teacher-model.json','leaf.ts','ACTIVE_SEARCH_PROTOCOL.json','search_prior_config.ts','validate_guard_revision.py','prepare_revision.mjs','compare_safe_completion.py','deliver.py']:
    with (REV/(name+'.before.snapshot')).open('xb') as out:out.write((HERE/name).read_bytes())
for name in ['teacher-r21-resume1-gate.json','teacher-r21-resume1-battle-summary.json','source-freeze-teacher-r21-resume1.json']:
    with (REV/name).open('xb') as out:out.write((HERE/name).read_bytes())
protocol=read('search_scale_protocol_v9_safe_completion.json')
protocol.update(version='search-scale-v10-deployment-completion',revision='r22',previousRevision='r21',candidateCollectionTag='teacher-r22',executeAfter='R21完整恢复150槽/84327实际动作/346475风险见证strict，4中断前缀4343动作另行strict且纳入排重',purpose='修复空城新兵部署内部已执行的安全完结被即时贪心丢弃；保留原同单位连动及根守卫、模型和所有门槛',createdAt=datetime.datetime.now().isoformat(timespec='seconds'),deterministicFix=dict(deploymentRecovery='只复用原24节点内已经执行的完整后续，对真实危险贪心路径的备选按风险见证相关性排序，每根最多额外2次完整叶子；只接收已知非致死、生产性、净战术差额不低于原-.15且完整分严格更高的方案',model='冻结03353a53 Policy和Value，根提议和所有数值系数不变',performance='不改变已通过R21的一切移动/风险/引擎缓存依赖；不增加己方step或分支网络前向',rootGuards='getAction根Veto/Takeover代码逐字保持',selection='原1557根与原NLL网格校准，不按面板胜负选择参数'),causalEvidence=dict(path=caseFile.relative_to(HERE).as_posix(),sha256=sha(caseFile),slot=case['slot'],row=40))
name='search_scale_protocol_v10_deployment_completion.json'
with (HERE/name).open('x',encoding='utf-8') as out:json.dump(protocol,out,ensure_ascii=False)
(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path=name,sha256=sha(HERE/name))),encoding='utf-8')
line='\nR21恢复完整150槽已收尾：84327实际动作及346475风险见证strict；4中断前缀4343动作另行strict，全部共同重跑前缀相同。固定22/24/24胜，扩展13/12/11胜，搜索1动作截断、两类超时0；扩展全步p95=509.0254ms、根527.3470ms，原600ms硬门槛已过，质量失败。100基线槽59080共同动作、网络输入/输出和RNG完全一致。全已消费索引含4中断前缀，267381不同前态。首轮部署探针49根无因果反例；补查完整部署内部2156根发现17个安全遗漏、1个改变实际动作：expanded-r0-s0第40步，原招弓手，改为圣骑移动后治疗指挥官可解除致死风险。原贪心攻击使该路径被丢弃。R22事先登记最多2次额外完整叶子、己方节点及根守卫不变；尚未实战验证，专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
p=ROOT/'ai_training/status/CURRENT.md';b=p.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;p.write_bytes(b.replace(marker,line.encode()+marker))
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R21全量strict与时延通过但质量失败；R22部署内部安全完结修复、教师仍不合格、专家0'),ensure_ascii=False),encoding='utf-8')
print(dict(revision='r22',teacherQualified=False,expertGames=0))
