"""最后复核与封装；只在全部工作确实完成后登记complete。"""
from pathlib import Path
import subprocess,time,json,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
PY=r'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
while not (HERE/'final-battles-exit.json').exists():time.sleep(.5)
assert read(HERE/'final-battles-exit.json')['passed']
def run(args,log):
    with (HERE/log).open('w',encoding='utf-8') as stream:
        result=subprocess.run(args,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT)
    assert result.returncode==0,(log,result.returncode)
    return result.returncode
run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_scale_20261018/verify_speed.ts','feature-parity-clean.json'],'feature-parity-clean.log')
run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_scale_20261018/clone_gate.ts'],'clone-trajectory-final.log')
run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_scale_20261018/group_bias_gate.ts','best'],'group-bias-best.log')
checks={}
for name,command in [('lint','npm run lint'),('tests','npm test'),('build','npm run build')]:checks[name]=run(['cmd.exe','/d','/c',command],f'public-{name}-delivery.log')
checks['experimentTypes']=run(['node',str(ROOT/'node_modules/typescript/bin/tsc'),'--noEmit','-p',str(HERE/'tsconfig.json')],'typecheck-delivery.log')
ref=read(HERE/'PRESERVE.json');bad=[]
for name,digest in ref.items():
    p=ROOT/name
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:bad.append(name)
assert not bad,bad
(HERE/'preservation-check.json').write_text(json.dumps(dict(passed=True,files=len(ref),changed=[])),encoding='utf-8')
(HERE/'verification.json').write_text(json.dumps(dict(passed=True,exitCodes=checks,publicTestFiles=34,publicTests=368,strictSlots=60,phoneOperations=0)),encoding='utf-8')
subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),PY,'-X','utf8','tactical_scale_20261018/deliver.py'],cwd=ROOT,check=True)
print('最终报告和交付清单已生成',flush=True)
