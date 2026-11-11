"""隐藏宿主下发完整执行指令并持有防休眠锁，状态供小时检查读取。"""
import ctypes
import datetime
import json
from pathlib import Path
import subprocess
import os
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
def status(**fields):
    (HERE / 'BACKGROUND_AGENT_STATUS.json').write_text(json.dumps({
        'guardianPid': os.getpid(), 'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), **fields
    }, ensure_ascii=False, indent=2), encoding='utf-8')

kernel = ctypes.windll.kernel32
if not kernel.SetThreadExecutionState(0x80000001):
    raise RuntimeError('后台防休眠锁获取失败')
child = None
try:
    command = ['C:/Users/SHIINA/AppData/Local/OpenAI/Codex/bin/f71a721e0e6193a9/codex.exe',
        'exec', '--cd', str(ROOT), '--sandbox', 'workspace-write',
        '--add-dir', 'D:/AncientEmpiresData/continuation_stage7_20261108_v1',
        '--json', '--output-last-message', str(HERE / 'BACKGROUND_AGENT_FINAL.md'), '-']
    with (HERE / 'BACKGROUND_FULL_TASK.md').open('rb') as source, (HERE / 'background-agent-events.jsonl').open('ab') as out, (HERE / 'background-agent-stderr.log').open('ab') as err:
        child = subprocess.Popen(command, stdin=source, stdout=out, stderr=err, cwd=ROOT,
            creationflags=subprocess.CREATE_NO_WINDOW)
        status(status='running', agentPid=child.pid, command=command, sleepLockHeld=True)
        code = child.wait()
        status(status='agent_exited', agentPid=child.pid, exitCode=code, sleepLockHeld=False,
            note='执行器退出不等于全任务完成；小时检查须核验最终报告、门禁和在途工作。')
finally:
    kernel.SetThreadExecutionState(0x80000000)
