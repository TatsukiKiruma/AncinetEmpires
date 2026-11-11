"""登记Top12真实分母与完整预算变化，不沿用Top6候选等价声明。"""
from pathlib import Path
import json,shutil
HERE=Path(__file__).resolve().parent;read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
ready=read('r17-pre-browser-ready.json');assert ready['passed']
r=read('revisions/r17/candidate-scalars-exact.json');assert r['originalSixPreserved'] and r['proposalCoverage']['removedCandidates']==0
fresh=read('fresh-search-calibration-gate.json');assert fresh['passed'] and fresh['collectionTag']=='teacher-r17'
old=HERE/'revisions/r17/fresh-calibration-before-capacity-wording.json';assert not old.exists();shutil.copy2(HERE/'fresh-search-calibration-gate.json',old)
fresh['reason']='新登记Top12/24/300容量，全量重采1557根；原六根完整保留，共同7871候选的真实叶子与安全字段完全相同，新增覆盖及触发单列，按原开发NLL网格校准'
fresh['capacityProtocol']='search_scale_protocol_v5.json';(HERE/'fresh-search-calibration-gate.json').write_text(json.dumps(fresh,ensure_ascii=False),encoding='utf-8')
p=HERE/'validate_guard_revision.py';source=p.read_text(encoding='utf-8');needle="reason='共享根编码提议改变最多一条候选覆盖";assert source.count(needle)==1;source=source.replace(needle,"reason='Top12容量完整保留原六根，全量重采并核验共同候选，新增覆盖与触发变化单列' if revisionNumber>=17 else '共享根编码提议改变最多一条候选覆盖");compile(source,str(p),'exec');p.write_text(source,encoding='utf-8')
text='\n\nR17前置结果：1557根重采98497风险见证；原7871个候选全部保留且叶子/安全/置信字段逐项相同，新增8050候选、47个搜索触发，丢失旧候选0。完整根探针24状态48次p95=227.36ms/max252.47ms，不能替代四进程面板时延与胜率。新条件训练411行/349父局、开发72行/60父局（普通69/Veto3），按原网格选0.8，开发NLL 1.986499→1.428416、top1 17/72→32/72；分母改变，不与Top6的59行曲线混比。全部原安全与新容量红绿、公共376测试/lint/build及独立类型通过；训练总检查仍63失败/448通过、4加载错误，单独保留。三端数值程序与权重不变：原初始/教师真实Chrome证据复用，扩量提议有独立真实Chrome验收。专家0，蒸馏、最终Value和最终200槽未完成。\n'
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(text)
current=HERE.parent/'status/CURRENT.md';data=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';end=data.index(marker);current.write_bytes(data[:end]+text.replace('\n','\r\n').encode()+data[end:])
print('R17真实前置分母、容量与检查边界已登记')
