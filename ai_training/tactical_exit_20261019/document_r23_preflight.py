"""R23准备完成后只追加已完成事实，不提前宣布教师通过。"""
from pathlib import Path
import json,time,subprocess,sys,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r23'
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
while not (HERE/'r23-ready.json').exists():time.sleep(2)
r=read('r23-ready.json');assert r['passed'] and r['safeRecruitmentCoverageChange']
speed=read('teacher-r23-speed.json')['latency'];roots=read('search-capacity-speed-gate.json')['latency']
line=f'\nR23前置通过：收尾安全生产性招募根覆盖的真实反例旧红/新绿，保持原默认、原六根和完整守卫；1557根中142根各替换最后一个容量补充候选，15779共同候选的物理叶子精确相同、根输入/先验不变。原74行条件开发NLL=1.4239868、33/74，仍按原网格选0.8，不当作实战胜率。初始/教师/提议三模型PyTorch、TS及三个新实际Chrome155全部通过，前向/全梯度约1e-14、argmax100%、重编码0。Value230次p95={speed["p95"]:.4f}/max{speed["max"]:.4f}ms，单进程完整根p95={roots["p95"]:.4f}ms。原安全/公共/类型检查均过，训练工作区63失败/448通过和4加载错误单列；开始完整150槽之前仍不计合格教师，真正专家0。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
p=ROOT/'ai_training/status/CURRENT.md';b=p.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;p.write_bytes(b.replace(marker,line.encode()+marker))
subprocess.run([sys.executable,'-X','utf8',str(HERE/'check_current_scope.py'),'revisions/r23/current-outside-scope-preflight.json'],cwd=ROOT,check=True)
with (REV/'preflight-documented.json').open('x',encoding='utf-8') as out:json.dump(dict(passed=True,readySha256=hashlib.sha256((HERE/'r23-ready.json').read_bytes()).hexdigest()),out)
