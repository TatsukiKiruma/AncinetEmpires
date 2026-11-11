"""在新性能与实战之前登记单一Top12容量方案，保留原Top6立项协议。"""
from pathlib import Path
import json,hashlib,datetime,shutil
HERE=Path(__file__).resolve().parent;read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
save=lambda n,v:(HERE/n).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
assert read('teacher-r16-stopped-summary.json')['strictPassed'];gap=read('teacher-r16-root-coverage-gate.json');assert gap['coverageGap']
assert not (HERE/'search_scale_protocol_v5.json').exists()
rev=HERE/'revisions/r17';rev.mkdir(parents=True,exist_ok=True)
for n in ['teacher-r16-stopped-summary.json','teacher-r16-root-coverage-gate.json','search_budget.ts']:
    target=rev/('registered-'+n);assert not target.exists();shutil.copy2(HERE/n,target)
p=read('search_scale_protocol_v4.json');p.update(version='search-scale-v5',registeredAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),candidateCollectionTag='teacher-r17',executeAfter='R16全部88槽53800实际动作strict通过',purpose='真实Top6外安全防守连动缺失；只增加根覆盖容量，完整保留原六根与全部原守卫',candidateCollection='原六根含扩量首选提议全部保留，再按原主策略先验补至Top12；每根后续24，己方节点硬上限300，分支网络前向0',searchBudget=dict(topK=12,maxFollowNodes=24,maximumOwnNodes=300,oldTopK=6,oldMaximumOwnNodes=150,originalSixPreserved=True),capacityEvidence=dict(path='teacher-r16-root-coverage-gate.json',sha256=sha(HERE/'teacher-r16-root-coverage-gate.json'),beforeHash=gap['beforeHash']),capacitySelection='仅登记一个Top12方案，由具体可重放覆盖缺口提出；不按对战胜负在多个K之间择优，原始Top6协议与全部失败原件保留',performanceAdmission='完整根探针p95<=500ms，正式四进程两面板原全步及根决策p95<=600ms、两类超时0，原胜率门禁全部保留')
save('search_scale_protocol_v5.json',p);save('ACTIVE_SEARCH_PROTOCOL.json',dict(path='search_scale_protocol_v5.json',version=p['version'],sha256=sha(HERE/'search_scale_protocol_v5.json'),baseRootProtocol='search_scale_protocol.json'))
text='\n\n## R17 根候选覆盖容量\n\nR16在88槽/53800实际动作、94024反扑见证动作strict通过后停止，固定搜索28槽21胜，未运行2槽即使全胜也低于pure24，不补胜负。v4提议权重三端通过但棋力未达要求，专家0。实际第58步发现Top6外同actor安全移动连动：原wait叶子-0.240833，新增-0.229209，满足原完整、已知非致死、指挥官健康及原actor保护；49风险见证重放通过，不把更高叶子当胜率证明。\n\nv5在新性能与实战之前登记单一Top12方案。原六根完整保留，再按同一主策略先验补足12；单单位后续仍24，己方总节点硬上限明确从150改300，分支策略前向仍0，不扩展到队友回合或强行end_turn。所有原系数、原安全守卫、固定根池/分区、p95<=600及0超时/两面板胜率门禁不放宽。需先完整根探针p95<=500，再重采全部1557根并按原开发NLL网格校准，不按实战胜负择K。原preregister.json及v1至v4协议不改写。\n'
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(text)
current=HERE.parent/'status/CURRENT.md';data=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';end=data.index(marker);current.write_bytes(data[:end]+text.replace('\n','\r\n').encode()+data[end:])
print(json.dumps(dict(passed=True,version=p['version'],searchBudget=p['searchBudget']),ensure_ascii=False))
