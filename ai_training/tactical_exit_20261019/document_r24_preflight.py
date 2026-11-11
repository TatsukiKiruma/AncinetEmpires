"""登记Top16前置事实及历史回归的明确容量作用域。"""
from pathlib import Path
import json,time,subprocess,sys,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r24'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
while not (HERE/'r24-ready.json').exists():time.sleep(2)
r=read('r24-ready.json');assert r['passed'] and r['rootCapacityExpansion']['originalTwelvePreserved']
speed=read('teacher-r24-speed.json')['latency'];roots=read('search-capacity-speed-gate.json')['latency']
line=f'\nR24前置通过：Top16/24/400单一方案先过原完整根p95<=500门禁，校准后p95={roots["p95"]:.4f}ms；实际Top12外安全攻击旧红/新绿。1557根全部原15921候选保留且物理字段精确相同，新增5307候选及9触发，原六根和原Top12全部保留；新条件开发78行/65父局、33/78、NLL=1.5557472，仍按原网格选0.8，分母变化不与74行直接比。原Top12招募覆盖组件在显式Top12接口下保留回归，默认Top16另有新增容量红绿及全量旧候选保留证明。全部旧安全/引擎/公共/类型门禁通过；初始/教师/提议三个新实际Chrome155及PyTorch/TS全参数梯度约1e-14、argmax100%。Value230次p95={speed["p95"]:.4f}/max{speed["max"]:.4f}ms。原600ms、两面板胜率和0超时门槛不变，进入完整150槽资格；尚未合格、专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
p=ROOT/'ai_training/status/CURRENT.md';b=p.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;p.write_bytes(b.replace(marker,line.encode()+marker))
subprocess.run([sys.executable,'-X','utf8',str(HERE/'check_current_scope.py'),'revisions/r24/current-outside-scope-preflight.json'],cwd=ROOT,check=True)
with (REV/'preflight-documented.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,readySha256=hashlib.sha256((HERE/'r24-ready.json').read_bytes()).hexdigest()),out)
