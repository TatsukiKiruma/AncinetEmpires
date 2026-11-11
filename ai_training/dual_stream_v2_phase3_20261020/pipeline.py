"""顺序执行本阶段已冻结流程，等待采样收据时持续记录状态。"""
import json
import subprocess
import sys
import time
from pathlib import Path
DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]


def run(command, log):
    (DIR / 'pipeline-status.json').write_text(json.dumps(dict(status='running', command=command, log=log)), encoding='utf-8')
    with (DIR / log).open('w', encoding='utf-8') as output:
        p = subprocess.run(command, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
    if p.returncode:
        raise RuntimeError(f'{log}失败：{p.returncode}')


try:
    while not all((DIR / f'corpus-receipt-{i}.json').exists() for i in range(4)):
        (DIR / 'pipeline-status.json').write_text(json.dumps(dict(status='waiting_for_corpus', completedLanes=[i for i in range(4) if (DIR / f'corpus-receipt-{i}.json').exists()])), encoding='utf-8')
        time.sleep(10)
    python = [sys.executable, '-X', 'utf8']
    run(['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase3_20261020/ensure_coverage.ts'], 'ensure-coverage.log')
    run(python + [str(DIR / 'train.py'), 'train'], 'training.log')
    run(python + [str(DIR / 'calibrate.py')], 'calibration.log')
    run(python + [str(DIR / 'reference.py')], 'reference.log')
    run(['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase3_20261020/parity.ts', 'node'], 'node-parity.log')
    (DIR / 'pipeline-status.json').write_text(json.dumps(dict(status='ready_for_browser_and_battles')), encoding='utf-8')
except BaseException as e:
    (DIR / 'pipeline-status.json').write_text(json.dumps(dict(status='error', error=str(e))), encoding='utf-8')
    raise
