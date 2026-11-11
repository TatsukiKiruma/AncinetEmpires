"""R22完整失败后登记一个安全生产性招募覆盖，不按胜负选择系数。"""
from pathlib import Path
import json,hashlib,datetime
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r23';REV.mkdir(exist_ok=False)
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
gate=read('teacher-r22-gate.json');assert not gate['passed'] and gate['strictReplay'] and gate['slots']==150
fixture=HERE/'revisions/r22/coverage-probe-1792424960789/cases.json';cases=json.loads(fixture.read_text());assert cases[0]['oldSelected'].startswith('wait:') and cases[0]['newRootCode'].startswith('recruit_to_castle:archer:')
for name in ['model_battle_search_ai.ts','completion_recovery.ts','deployment_recovery.ts','movement_query_cache.ts','teacher-model.json','leaf.ts','ACTIVE_SEARCH_PROTOCOL.json','search_prior_config.ts','validate_guard_revision.py','prepare_revision.mjs','verify_deployment_completion.mjs','deliver.py']:
    with (REV/(name+'.before.snapshot')).open('xb') as out:out.write((HERE/name).read_bytes())
for name in ['teacher-r22-gate.json','teacher-r22-battle-summary.json','source-freeze-teacher-r22.json']:
    with (REV/name).open('xb') as out:out.write((HERE/name).read_bytes())
frozen=read('source-freeze-teacher-r22.json')['files']['ai_training/tactical_exit_20261019/model_battle_search_ai.ts'];source=HERE/frozen['snapshot'];assert sha(source)==frozen['sha256']
target=HERE/'revisions/r22/model_battle_search_ai.ts.snapshot'
if not target.exists():
    with target.open('xb') as out:out.write(source.read_bytes())
assert sha(target)==frozen['sha256']
p=read('search_scale_protocol_v10_deployment_completion.json');p.update(version='search-scale-v11-safe-recruitment-coverage',revision='r23',previousRevision='r22',candidateCollectionTag='teacher-r23',executeAfter='R22完整150槽83989实际动作/342894风险见证strict；扩展全步p95=415.2032、根427.6001ms且两类超时0；12胜仍低于阶段3的13胜',createdAt=datetime.datetime.now().isoformat(timespec='seconds'),purpose='默认wait/end_turn时覆盖一个已有根特征提示已知安全且可生产性的空城招募，避免原招募代表致死而漏掉可接管兵种',deterministicFix=dict(rootCoverage='仅在原池不存在已知非致死且followup有伤害/击杀/占领/技能提示的空城招募时，从池外同样条件候选中按原策略先验选最高者，替换最后一个容量补充根；原六根保留，Top12/24/300不增',leafAndGuards='R22全部叶子、完结恢复、Veto/Takeover及队列守卫逐字不变；已有安全提示只是覆盖理由，真实接管仍靠原完整叶子及守卫',model='冻结03353a53 Policy与Value和2c9ae3ac提议策略，全部根输入和先验不改',performance='只用已算好的根特征，不新增编码或网络前向；每个根仍是原有有界同单位搜索',selection='完整1557根重采并按原条件NLL网格校准；所有已消费面板含中断前缀隔离，不读取实战胜负拟合参数'),causalEvidence=dict(path=fixture.relative_to(HERE).as_posix(),sha256=sha(fixture),selectedCase=0,otherTwoCasesNotPartOfThisFix=True))
name='search_scale_protocol_v11_safe_recruitment_coverage.json'
with (HERE/name).open('x',encoding='utf-8') as out:json.dump(p,out,ensure_ascii=False)
(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path=name,sha256=sha(HERE/name))),encoding='utf-8')
line='\nR22完整150槽已收尾：83989实际动作及342894风险见证strict，固定22/24/24胜、扩展13/12/12胜，搜索两类超时0，扩展全步p95=415.2032/根427.6001ms，时延达到500ms目标但质量未合格。真实部署反例所在r0-s0从676动作自然负变为338动作自然胜，整体仍差阶段3一胜。突击探针71根/329备选无安全或因果反例，保留零发现、不修不存在的证据。候选覆盖影子诊断101根/260备选发现3个因果遗漏；R23只处理首个收尾漏招募：原池仅含致死美人鱼，池外弓手已知安全且可完成正收益攻击。登记以已有根特征补一个最高先验的安全生产性空城招募，替换最后补充根，原六根和全部守卫/预算不变。真正专家0，尚未蒸馏。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
current=ROOT/'ai_training/status/CURRENT.md';b=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;current.write_bytes(b.replace(marker,line.encode()+marker))
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R22时延过但质量12<13；R23补一个安全生产性招募根，教师不合格、专家0'),ensure_ascii=False),encoding='utf-8')
print(dict(revision='r23',teacherQualified=False,expertGames=0))
