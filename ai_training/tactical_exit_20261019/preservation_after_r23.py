"""正式计时和失败诊断结束后，再复核立项时实际保留的9925文件。"""
from pathlib import Path
import json,subprocess,sys,time,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;REV=HERE/'revisions/r23'
while not (REV/'post-panel-diagnostic-exit.json').exists():time.sleep(2)
assert json.loads((REV/'post-panel-diagnostic-exit.json').read_text())['passed']
before=REV/'preservation-check-before.snapshot'
if (HERE/'preservation-check.json').exists() and not before.exists():shutil.copy2(HERE/'preservation-check.json',before)
log=REV/f'preservation-{time.time_ns()}.log'
with log.open('x',encoding='utf-8') as out:r=subprocess.run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/preservation_check.py'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
assert r.returncode==0,log
result=json.loads((HERE/'preservation-check.json').read_text());assert result['passed'],result
with (REV/'preservation-after-full-panel.json').open('x',encoding='utf-8') as out:json.dump(result,out,ensure_ascii=False)
print(dict(passed=True,baselineFiles=result['baselineFiles'],missing=len(result['missing']),unexpectedChanged=len(result['unexpectedChanged'])),flush=True)
