"""单次运行预算账本及子进程看门狗；截止只终止本轮拥有的进程树。"""
import os
import subprocess
import time
from core import HERE, read, write_new

STAGES = dict(admission=3600, teacher=21600, training=10800, battle=46800, summary=3600)


def now_ms():
    return int(time.time() * 1000)


class Budget:
    def __init__(self):
        self.start = now_ms()
        self.total_deadline = self.start + 86400000
        self.stage_deadline = self.start
        self.stage = None
        write_new(HERE / 'run-start.json', dict(startedAtEpochMs=self.start, totalDeadline=self.total_deadline, hours=24, automaticNewRound=False))

    def enter(self, name):
        assert name in STAGES
        self.stage = name
        self.stage_deadline = min(self.total_deadline, now_ms() + STAGES[name] * 1000)
        path = HERE / 'budget' / (name + '.json')
        write_new(path, dict(startedAtEpochMs=now_ms(), totalDeadline=self.total_deadline, stageDeadline=self.stage_deadline, stage=name, secondsLimit=STAGES[name]))
        os.environ['E6_BUDGET'] = str(path)

    def remaining(self):
        return max(0., (min(self.total_deadline, self.stage_deadline) - now_ms()) / 1000)

    def run(self, command, log, timeout=None, env=None):
        seconds = min(self.remaining(), timeout if timeout is not None else self.remaining())
        if seconds <= 0:
            raise TimeoutError('阶段或24小时预算到期')
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open('xb') as f:
            p = subprocess.Popen(command, stdout=f, stderr=subprocess.STDOUT, env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            try:
                code = p.wait(timeout=seconds)
            except BaseException:
                terminate_owned(p)
                raise
        if code:
            raise RuntimeError(f'子任务退出{code}：{log.relative_to(HERE)}')


def terminate_owned(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill(); process.wait()
