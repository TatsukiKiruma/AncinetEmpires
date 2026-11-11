"""把真实前置收据写入设计和本阶段状态块，不改历史正文。"""
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent;read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
r=read('revisions/r16/candidate-scalars-exact.json');c=read('search-scale/teacher-calibration.json')
assert r['passed'] and c['passed'] and c['collectionTag']=='teacher-r16-best'
text='\n\nR16 v4前置实测：1557根中38个根的候选覆盖发生变化，1个新增/1个取消搜索触发；共同7829候选的叶子、安全、置信分逐项完全相同，全部根输入、来源及阶段4默认策略相同，不称全记录相同。重采47898反扑见证，仍按原网格选0.8；条件训练342行/300父局、开发59行/51父局，开发NLL 1.372203→1.136855、top1 20/59→32/59，与R15开发曲线相同。提议策略真实Chrome前向2.84e-14/梯度1.78e-14，23状态共享编码4817输出0误差。全部旧守卫将逐项重跑，随后才允许150槽资格；尚无专家或最终模型。\n'
for name in ['WORKLOG.md','DESIGN.md']:
    with (HERE/name).open('a',encoding='utf-8') as f:f.write(text)
current=HERE.parent/'status/CURRENT.md';data=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';end=data.index(marker);addition=text.replace('\n','\r\n').encode();current.write_bytes(data[:end]+addition+data[end:]);assert current.read_bytes().split(marker,1)[1]==data.split(marker,1)[1]
print(json.dumps(dict(passed=True,ownedCurrentBlockOnly=True,changedRoots=r['proposalCoverage']['changedRoots'],collectionTag=c['collectionTag']),ensure_ascii=False))
