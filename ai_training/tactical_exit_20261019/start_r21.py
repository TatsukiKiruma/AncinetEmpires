"""保留失败版本的当前原件，再登记下一轮确定性修复；不按面板胜负调参数。"""
from pathlib import Path
import json,hashlib,time
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r21'
REV.mkdir(exist_ok=False)
files=['model_battle_search_ai.ts','movement_query_cache.ts','combined_tactics.ts','teacher-model.json','leaf.ts','ACTIVE_SEARCH_PROTOCOL.json','search_prior_config.ts','validate_guard_revision.py','prepare_revision.mjs']
for name in files:
    with (REV/(name+'.before.snapshot')).open('xb') as out:out.write((HERE/name).read_bytes())
for name in ['engine','rules']:
    with (REV/(name+'.ts.before.snapshot')).open('xb') as out:out.write((ROOT/f'src/game/{name}.ts').read_bytes())
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
gate=read('teacher-r20-gate.json');assert not gate['passed'] and gate['strictReplay']
text='\n\nR20完整150槽失败收尾：85104实际动作与348103风险见证动作全部strict。固定阶段3/纯策略/搜索22/24/24胜，扩展13/12/11胜；搜索扩展11胜8负1墙钟截断，全步p95=702.1ms、根730.8ms，原胜率/600ms/零超时门禁未过。expanded-teacher_search-r6-s0从R18自然胜变为R20墙钟截断，不能只解释为性能变化；模型和失败轨迹全部保留。普通Value数据不能代替搜索专家，真正专家0。\n\nR20后续因果诊断：6763个根状态、11909次其他完结检查，发现14个更高且安全的完整叶子，其中1个改变实际动作。expanded-teacher_search-r0-s0第641步，move:u_45:5,9后攻击u_56净收益.1660但行动单位可被集火致死；攻击u_55净收益.1545、完整叶子分-.2276→-.1511且无致死，影子选择从attack:u_45:u_60变为该安全连动。见revisions/r20/follow-probe-1792416175576。其余13个差异未改变实际动作，不视作棋力证明。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(text)
current=ROOT/'ai_training/status/CURRENT.md';data=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert data.count(marker)==1
addition='R20完整150槽已失败：85104实际动作及348103风险见证动作全部strict，固定22/24/24胜、扩展13/12/11胜；搜索扩展全步p95=702.1ms、根730.8ms，1墙钟截断，教师不合格、专家0。后续6763状态因果诊断找到1个会改变实际动作的同单位安全完结遗漏；R21将修复已枚举后续的贪心选择，并优化完整权威移动子集查询，全部原门槛不降。\n'.encode()
current.write_bytes(data.replace(marker,addition+marker))
protocol=read('search_scale_protocol_v8_value_continuation.json');protocol.update(version=9,candidateCollectionTag='teacher-r21',revision='r21',previousRevision='r20',deterministicFix={'sameActorRecovery':'保留已执行的同actor完整候选，以真实致死见证排序，最多额外复核两个完整叶子/根；不增加己方step或分支infer','performance':'权威普通移动子集、共享几何的局内路径缓存；所有151维和物理风险必须与R20完全一致','model':'冻结03353a53教师，Policy和Value均不改','selection':'只按原完整叶子分、原安全/净收益条件，不读取评测胜负选择系数'},createdAt=time.strftime('%Y-%m-%dT%H:%M:%S%z'))
name='search_scale_protocol_v9_safe_completion.json';(HERE/name).write_text(json.dumps(protocol,ensure_ascii=False),encoding='utf-8')
(HERE/'ACTIVE_SEARCH_PROTOCOL.json').write_text(json.dumps(dict(path=name,sha256=hashlib.sha256((HERE/name).read_bytes()).hexdigest())),encoding='utf-8')
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase='R20完整失败已strict收尾；R21同actor安全完结和权威移动子集修复，专家0'),ensure_ascii=False),encoding='utf-8')
print({'revision':'r21','preservedFiles':len(files)+2,'teacherExpertGames':0})
