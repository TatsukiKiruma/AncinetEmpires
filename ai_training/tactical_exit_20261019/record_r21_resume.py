"""追加恢复与strict收尾进展，只改本阶段拥有的CURRENT标记块。"""
from pathlib import Path
import json,datetime,subprocess,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
r=json.loads((HERE/'revisions/r21/resume1/stopped-strict-gate.json').read_text(encoding='utf-8'))
assert r['passed'] and r['actualActions']==82278
line=f'\n用户于{datetime.datetime.now().isoformat(timespec="seconds")}授权恢复。R21停止现场135完整局与4中断前缀共82278实际动作、{r["riskWitnessActions"]}风险见证动作已全部strict。独立teacher-r21-resume1逐字节保留135局完整结果及原计时；4中断和11未开始槽按原初态/模型/种子重跑，原件不覆盖。硬链接被本机拒绝后已事前追加逐字节复制协议。原质量/600ms/零超时门槛保持，完整复验未结束前教师不合格、搜索专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
p=ROOT/'ai_training/status/CURRENT.md';before=p.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert before.count(marker)==1
p.write_bytes(before.replace(marker,line.encode()+marker))
subprocess.run([sys.executable,'-X','utf8',str(HERE/'check_current_scope.py'),'revisions/r21/resume1/current-outside-scope-resume.json'],cwd=ROOT,check=True)
