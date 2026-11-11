"""区分登记停止时的观测值与在途结束后的实际槽数，不补未运行结果。"""
from pathlib import Path
HERE=Path(__file__).resolve().parent
old='固定搜索28槽21胜，未运行2槽即使全胜也低于pure24，不补胜负。'.encode()
new='停止登记时固定搜索28槽21胜，最多23胜而触及停止条件；在途结束后实际固定搜索29槽22胜、6负、1动作截断，余1槽未运行不补。R16纯策略实际29槽23胜，门槛24胜来自同模型、同面板、同种子的此前完整基线；本次部分结果不伪装完整30槽。'.encode()
for p in [HERE/'WORKLOG.md',HERE/'DESIGN.md',HERE.parent/'status/CURRENT.md']:
    data=p.read_bytes();assert data.count(old)==1,p;updated=data.replace(old,new)
    if p.name=='CURRENT.md':
        start=b'<!-- tactical-exit-20261019 -->';end=b'<!-- end-tactical-exit-20261019 -->';assert updated.split(start)[0]==data.split(start)[0] and updated.split(end)[1]==data.split(end)[1]
    p.write_bytes(updated)
print('停止时点与实际收尾数已分别登记；历史块外字节未变')
