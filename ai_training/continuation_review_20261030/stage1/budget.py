"""同一实验臂累计运行预算和子进程期限；停止间隔不计入预算。"""
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid


class BudgetExpired(TimeoutError):
    pass


class ArmBudget:
    def __init__(self, limit, consumed=0., clock=time.perf_counter, started=None):
        self.limit = float(limit)
        self.consumed = float(consumed)
        self.clock = clock
        self.started = clock() if started is None else started
        if self.limit <= 0 or self.consumed < 0:
            raise ValueError('运行预算或已耗时无效')

    def elapsed(self):
        return self.consumed + max(0., self.clock() - self.started)

    def remaining(self):
        return max(0., self.limit - self.elapsed())

    def require(self, cap=None):
        remaining = self.remaining()
        if remaining <= 0:
            raise BudgetExpired('同一实验臂累计运行墙钟已耗尽')
        return remaining if cap is None else min(remaining, cap)


class BudgetLedger:
    """固定原实验臂账本，恢复到新输出目录也沿用同一账本。"""
    def __init__(self, path, budget, arm_id=None, latest_sha=None):
        self.path = Path(path).resolve()
        self.budget = budget
        self.arm_id = arm_id or str(uuid.uuid4())
        self.latest_sha = latest_sha
        self.lock = threading.Lock()
        self.closed = threading.Event()
        self.status = 'running'
        self.thread = None

    def write(self, status=None, checkpoint_sha=None):
        with self.lock:
            if status is not None:
                self.status = status
            if checkpoint_sha is not None:
                self.latest_sha = checkpoint_sha
            value = dict(schema='cumulative-arm-budget-v1', armId=self.arm_id, consumedWallSeconds=self.budget.elapsed(), limitSeconds=self.budget.limit, excludeDowntime=True, latestCheckpointSha256=self.latest_sha, status=self.status, pid=os.getpid(), scope='run入口起计，含预检/恢复/编码/更新/诊断/保存；排除解释器导入和停止间隔')
            self.path.parent.mkdir(parents=True, exist_ok=True)
            pending = self.path.with_suffix('.pending')
            pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')
            pending.replace(self.path)
            return value

    def start(self):
        self.write()
        def heartbeat():
            while not self.closed.wait(.5):
                self.write()
        self.thread = threading.Thread(target=heartbeat, daemon=True, name='arm-budget-ledger')
        self.thread.start()

    def stop(self, status):
        self.closed.set()
        if self.thread:
            self.thread.join(timeout=2)
        return self.write(status)


def resume_budget(saved, checkpoint_sha):
    record = saved.get('armBudget')
    if not record:
        raise ValueError('旧检查点缺累计预算合同，不能自动获得新预算')
    path = Path(record['ledgerPath'])
    ledger = json.loads(path.read_text('utf-8'))
    if ledger['armId'] != record['armId'] or ledger['latestCheckpointSha256'] != checkpoint_sha:
        raise ValueError('恢复不是同臂账本登记的最后完整检查点')
    if ledger['limitSeconds'] != record['limitSeconds'] or not ledger['excludeDowntime']:
        raise ValueError('恢复预算合同改变')
    crash_grace = 0.
    if ledger['status'] == 'running':
        if process_alive(ledger['pid']):
            raise ValueError('同一实验臂仍在运行，拒绝并发恢复')
        # 异常退出可能位于两次心跳之间，保守计入一个完整心跳间隔。
        crash_grace = .5
    return max(record['consumedWallSeconds'], ledger['consumedWallSeconds']) + crash_grace, path, record['armId']


def process_alive(pid):
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        code = ctypes.c_ulong()
        try:
            if not kernel.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)):
                return True
            return code.value == 259
        finally:
            kernel.CloseHandle(ctypes.c_void_p(handle))
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def stop_process_tree(process):
    """仅回收调用者创建的子进程树；不扫描或停止其他任务。"""
    if process.poll() is not None:
        return
    if os.name == 'nt':
        try:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=False)
        except (subprocess.TimeoutExpired, OSError):
            # 系统工具异常也必须回收直接子进程，随后wait保持有界。
            process.kill()
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if process.poll() is None:
        process.kill()
    process.wait(timeout=3)


def bounded_process(command, budget, cap, **kwargs):
    timeout = budget.require(cap)
    process = subprocess.Popen(command, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), start_new_session=os.name != 'nt', **kwargs)
    try:
        code = process.wait(timeout=timeout)
        if code:
            raise subprocess.CalledProcessError(code, command)
    except subprocess.TimeoutExpired as cause:
        stop_process_tree(process)
        raise BudgetExpired('诊断子进程超过剩余预算内期限，已安全回收') from cause
    finally:
        if process.poll() is None:
            stop_process_tree(process)
