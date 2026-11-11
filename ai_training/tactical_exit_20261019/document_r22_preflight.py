"""前置完成后追加事实，不把即将开始的面板当作通过。"""
from pathlib import Path
import json,time,hashlib,subprocess,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r22'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
while not (HERE/'r22-ready.json').exists():time.sleep(2)
r=read('r22-ready.json');assert r['passed'] and r['deploymentCompletionChange']
speed=read('teacher-r22-speed.json')['latency'];roots=read('search-capacity-speed-gate.json')['latency'];changes=read('revisions/r22/candidate-scalars-exact.json')
line=f'\nR22前置已通过：空城部署真实因果反例旧红/新绿，原普通移动安全完结与全部守卫仍过；1557根15920候选相同，仅1个部署物理叶子变为完整安全且更高，根输入/默认/覆盖/先验相同。原74行条件开发仍选0.8。初始/教师/提议PyTorch、独立TS和三个新实际Chrome155全部通过，前向/全梯度最大约2.84e-14/1.78e-14、argmax100%、重编码0；受限Chrome crashpad失败及正常权限重试原件都保留。Value230次p95={speed["p95"]:.4f}/max{speed["max"]:.4f}ms，单进程完整根p95={roots["p95"]:.4f}ms。公共/类型/全部原安全门禁已过，历史训练工作区失败单列；完整150槽资格开始前不计合格教师，专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
p=ROOT/'ai_training/status/CURRENT.md';b=p.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;p.write_bytes(b.replace(marker,line.encode()+marker))
subprocess.run([sys.executable,'-X','utf8',str(HERE/'check_current_scope.py'),'revisions/r22/current-outside-scope-preflight.json'],cwd=ROOT,check=True)
with (REV/'preflight-documented.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,readySha256=hashlib.sha256((HERE/'r22-ready.json').read_bytes()).hexdigest()),out)
