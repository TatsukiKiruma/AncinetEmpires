"""等待最终数据和门禁后执行PC训练、最佳权重离线门禁与同集比较。"""
from pathlib import Path
import subprocess,time,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
PY=r'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe'
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
while True:
    contract=HERE/'scale-contract.json';strict=HERE/'strict-exit.json';summary=HERE/'battle-speed-summary.json'
    if contract.exists() and strict.exists() and summary.exists() and read(contract).get('canonicalV3Threshold') and read(summary).get('complete'):
        assert not any(read(strict)['codes'])
        assert all(x['strictPassed'] and not x['classification'].get('error',0) for x in read(summary)['panels'])
        break
    time.sleep(.5)
def run(args,log):
    with (HERE/log).open('w',encoding='utf-8') as stream:
        subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),*args],cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,check=True)
start=time.time();run([PY,'-X','utf8','tactical_scale_20261018/group_train.py','train'],'group-training.log')
run([PY,'-X','utf8','tactical_scale_20261018/group_train.py','parity','best'],'group-python-best.log')
run(['node','--import','tsx','tactical_scale_20261018/group_parity.ts','best'],'group-ts-best.log')
run([PY,'-X','utf8','tactical_scale_20261018/compare_scale.py'],'compare-scale.log')
(HERE/'remaining-exit.json').write_text(json.dumps(dict(passed=True,seconds=time.time()-start)),encoding='utf-8')
