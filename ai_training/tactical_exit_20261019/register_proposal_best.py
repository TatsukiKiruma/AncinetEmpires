"""保留v3前置失败，限定扩量首选确实未被覆盖时才提议。"""
from pathlib import Path
import json,hashlib,datetime,shutil
HERE=Path(__file__).resolve().parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
save=lambda n,v:(HERE/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
assert not (HERE/'search_scale_protocol_v4.json').exists()
p=read('search_scale_protocol_v3.json')
p.update(version='search-scale-v4',registeredAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),candidateCollectionTag='teacher-r16-best',proposalRule='仅在扩量策略分层首选未被原Top6覆盖时加入该首选；已覆盖则不替换任何候选，不继续寻找更低排名动作',preflightRejection='v3在原回归中发现扩量首选已覆盖时仍补低排名动作，挤掉已验证防守解；未进入任何新实战，不放宽回归，保留其完整1557根及校准原件')
save('search_scale_protocol_v4.json',p);save('ACTIVE_SEARCH_PROTOCOL.json',dict(path='search_scale_protocol_v4.json',version=p['version'],sha256=sha(HERE/'search_scale_protocol_v4.json'),baseRootProtocol='search_scale_protocol.json'))
for name in ['teacher-calibration.json']:
    target=HERE/'revisions/r16'/('v3-'+name);assert not target.exists();shutil.copy2(HERE/'search-scale'/name,target)
with (HERE/'WORKLOG.md').open('a',encoding='utf-8') as f:f.write('\n\nv3未进入实战：原Veto回归发现扩量首选已在Top6时，继续找低排名外部动作会挤掉更高叶子值且满足全部原守卫的防守解。失败完整记录保留。v4只允许未被覆盖的扩量首选进入，不强行补低排名候选；原Top6已覆盖则不改变候选，原守卫/预算/系数网格不动，重新采集校准。另一个固定坐标夹具扩量策略实际发现更高分的同弓手移动攻击，已改为核验同actor真实完结、非致死、分数不低参考及队友未动；旧R5仍失败，并未放宽安全性。\n')
print(json.dumps(dict(passed=True,version=p['version'],candidateCollectionTag=p['candidateCollectionTag']),ensure_ascii=False))
