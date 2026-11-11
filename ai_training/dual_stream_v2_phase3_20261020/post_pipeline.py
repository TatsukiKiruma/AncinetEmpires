"""等待最终Node门禁后执行真实Chrome及固定实战，不改变模型。"""
import json
import hashlib
import subprocess
import time
from pathlib import Path
DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]


def status(**values):
    (DIR / 'post-training-status.json').write_text(json.dumps(values, ensure_ascii=False, indent=2), encoding='utf-8')


try:
    while True:
        current = json.loads((DIR / 'pipeline-status.json').read_text('utf-8'))
        if current['status'] == 'error':
            raise RuntimeError('前置流水线失败：' + current.get('error', ''))
        if current['status'] == 'ready_for_browser_and_battles' and (DIR / 'FINAL_MODEL_FROZEN.json').exists():
            break
        status(status='waiting_for_offline_gates_and_model_freeze')
        time.sleep(10)
    frozen = json.loads((DIR / 'FINAL_MODEL_FROZEN.json').read_text('utf-8'))
    assert frozen['weightsSha256'] == hashlib.sha256((DIR / 'dual-v2-stage3-pure.bin').read_bytes()).hexdigest()
    status(status='browser_running')
    with (DIR / 'browser-run.log').open('w', encoding='utf-8') as log:
        result = subprocess.run(['node', str(ROOT / 'ai_training/run.mjs'), 'node', 'dual_stream_v2_phase3_20261020/browser_runner.mjs', 'dual-v2-stage3-pure'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        status(status='browser_failed', code=result.returncode)
        raise SystemExit(result.returncode)
    status(status='battles_running', lanes=4)
    children = []; logs = []
    for lane in range(4):
        log = (DIR / f'battle-{lane}.log').open('w', encoding='utf-8'); logs.append(log)
        children.append(subprocess.Popen(['node', str(ROOT / 'ai_training/run.mjs'), 'node', '--import', 'tsx', 'dual_stream_v2_phase3_20261020/battle.ts', 'play', str(lane), '4'], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT))
    codes = [p.wait() for p in children]
    for log in logs:
        log.close()
    status(status='battles_complete' if all(c == 0 for c in codes) else 'battle_worker_failed', codes=codes)
except Exception as e:
    status(status='error', error=str(e))
    raise
