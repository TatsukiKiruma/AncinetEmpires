"""实现检查入口：绑定本轮源码身份，失败时不生成可启动正式计算的回执。"""
import subprocess
import sys
import time
from core import HERE, ROOT, digest, write_new

commands = [
    ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '../node_modules/typescript/bin/tsc', '--noEmit', '-p', str(HERE / 'tsconfig.json')],
    ['node', str(ROOT / 'ai_training/run.mjs'), 'node', '../node_modules/vitest/vitest.mjs', 'run', '--config', str(HERE / 'vitest.config.ts')],
    [sys.executable, '-B', '-X', 'utf8', str(HERE / 'test_e6.py')],
]
attempt = HERE / 'checks' / str(time.time_ns())
attempt.mkdir(parents=True, exist_ok=False)
for i, command in enumerate(commands):
    with (attempt / f'check-{i}.log').open('xb') as f:
        subprocess.run(command, cwd=ROOT, stdout=f, stderr=subprocess.STDOUT, check=True)
files = [*HERE.glob('*.py'), *HERE.glob('*.ts'), HERE / 'protocol.json', HERE / 'PROTOCOL.md']
write_new(HERE / 'checks/unit-tests.json', dict(passed=True, typescript=True, vitestTests=5, pythonTests=4,
                                             files={str(p): digest(p) for p in files}, logs=str(attempt), formalExperimentComputationsStarted=False))
