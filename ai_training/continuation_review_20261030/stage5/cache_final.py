"""顺序提取三份最终数据特征，任一子任务失败即停，不自动训练。"""
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')
jobs = [('train-encoded-final', 'train-features-final', 10800), ('dev-encoded-final', 'dev-features-final', 2160), ('anchor-encoded-01', 'anchor-features-final', 10800)]
for source, target, expected in jobs:
    report = json.loads((DATA / source / 'ENCODING_REPORT.json').read_text(encoding='utf-8'))
    if report['samples'] != expected:
        raise ValueError('输入样本数量不足')
    subprocess.run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'cache_features.py'), str(DATA / source), str(DATA / target)], check=True,
                   env={**os.environ, 'MIOPEN_USER_DB_PATH': str(DATA / 'final-runtime/db'), 'MIOPEN_CUSTOM_CACHE_DIR': str(DATA / 'final-runtime/kernels')})
    if json.loads((DATA / target / 'CACHE_REPORT.json').read_text())['samples'] != expected:
        raise ValueError('缓存样本数量不足')
with (HERE / 'FINAL_CACHE_COMPLETE.json').open('x', encoding='utf-8') as stream:
    json.dump({'jobs': jobs, 'trainingUpdates': 0, 'sealedAccess': 0}, stream, indent=2)
