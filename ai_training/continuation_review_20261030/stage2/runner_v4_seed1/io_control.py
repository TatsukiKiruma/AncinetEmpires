"""主线程在完整安全点同步记账；不派生后台预算或JSON序列化线程。"""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import threading
import time
import uuid

from frozen import legacy_budget

ArmBudget = legacy_budget.ArmBudget
BudgetExpired = legacy_budget.BudgetExpired
resume_budget = legacy_budget.resume_budget
bounded_process = legacy_budget.bounded_process
IO_CAP_SECONDS = 2.
CHECKPOINT_CAP_SECONDS = 2.
SHUTDOWN_CAP_SECONDS = 2.
SHUTDOWN_TAIL_SECONDS = 5.
PERSIST_INTERVAL_SECONDS = 10.
PROTOCOL = 'continuation-control-v4-sync1'


class PersistenceFailure(OSError):
    pass


def sharing_error(error):
    return os.name == 'nt' and isinstance(error, PermissionError) and getattr(error, 'winerror', None) in {5, 32, 33}


def atomic_save(path, writer, budget, *, cap=IO_CAP_SECONDS, shutdown=False, event=None):
    """首次真实操作先执行；只为实际共享错误启动有界重试计时。"""
    path = Path(path)
    if not shutdown:
        budget.require()
    phase = 'prepare_directory'
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f'.{path.name}.{os.getpid()}.{uuid.uuid4().hex}.pending')
    attempts, retry_deadline, last_shared_error = 0, None, None
    while True:
        if not shutdown:
            budget.require()
        if retry_deadline is not None and time.perf_counter() >= retry_deadline:
            raise PersistenceFailure(f'实际共享错误重试耗尽，phase={phase}，path={path}') from last_shared_error
        attempts += 1
        try:
            phase = 'serialize'
            writer(pending)
            if not shutdown:
                budget.require()
            phase = 'replace'
            pending.replace(path)
            if event and attempts > 1:
                event(dict(kind='sharing_retry_recovered', path=str(path), phase=phase,
                           attempts=attempts, wallSeconds=budget.elapsed()))
            return dict(path=str(path), attempts=attempts, phase='complete', wallSeconds=budget.elapsed())
        except PermissionError as error:
            if not sharing_error(error):
                raise
            now = time.perf_counter()
            last_shared_error = error
            if retry_deadline is None:
                retry_deadline = now + (cap if shutdown else min(cap, budget.require()))
            if event:
                event(dict(kind='sharing_retry', path=str(path), phase=phase,
                           attempt=attempts, winerror=error.winerror, wallSeconds=budget.elapsed()))
            remaining = retry_deadline - time.perf_counter()
            if remaining <= 0:
                raise PersistenceFailure(f'实际共享错误重试耗尽，phase={phase}，path={path}') from error
            time.sleep(min(.01, remaining))


def json_save(path, value, budget, **kwargs):
    def writer(pending):
        payload = value() if callable(value) else value
        pending.write_text(json.dumps(payload, ensure_ascii=False, indent=2), 'utf-8')
    return atomic_save(path, writer, budget, **kwargs)


class BudgetLedger:
    """唯一主线程写者；最多10秒后的首个完整安全点落盘，关键点强制保存。"""
    def __init__(self, path, budget, arm_id=None, latest_sha=None, *, event=None,
                 interval=PERSIST_INTERVAL_SECONDS, io_cap=IO_CAP_SECONDS):
        self.path, self.budget = Path(path).resolve(), budget
        self.arm_id, self.latest_sha = arm_id or str(uuid.uuid4()), latest_sha
        self.event, self.interval, self.io_cap = event, interval, io_cap
        if not 0 < self.interval <= 10 or not 0 < self.io_cap <= 2:
            raise ValueError('安全点间隔最多10秒，实际共享重试最多2秒')
        self.owner = threading.get_ident()
        self.failure, self.last_persisted = None, None
        self.closed = False

    def check(self):
        if threading.get_ident() != self.owner:
            raise PersistenceFailure('预算账本仅允许主线程写者使用')
        if self.failure is not None:
            raise PersistenceFailure('预算同步持久化已失败，禁止开始新优化批次') from self.failure

    @contextmanager
    def optimization_guard(self):
        self.check()
        self.budget.require()
        yield

    def write(self, status=None, checkpoint_sha=None, *, shutdown=False, reserve_tail=0., force=False):
        if threading.get_ident() != self.owner:
            raise PersistenceFailure('预算账本仅允许主线程写者使用')
        if not shutdown:
            self.check()
            self.budget.require()
        force = force or shutdown or status is not None or checkpoint_sha is not None
        if not force and self.last_persisted is not None and self.budget.elapsed() - self.last_persisted['observedWallSeconds'] < self.interval:
            return dict(deferred=True, wallSeconds=self.budget.elapsed())
        proposed_status = self.status if hasattr(self, 'status') and status is None else status or 'running'
        proposed_sha = self.latest_sha if checkpoint_sha is None else checkpoint_sha
        records = []

        def payload():
            observed = self.budget.elapsed()
            value = dict(schema='cumulative-arm-budget-v1', armId=self.arm_id,
                         consumedWallSeconds=observed + reserve_tail, observedWallSeconds=observed,
                         shutdownTailReservationSeconds=reserve_tail, limitSeconds=self.budget.limit,
                         excludeDowntime=True, latestCheckpointSha256=proposed_sha,
                         status=proposed_status, pid=os.getpid(), controlProtocol=PROTOCOL,
                         writer='main_thread_safe_points', persistIntervalSeconds=self.interval,
                         scope='同原臂累计预算，含初始化/优化/同步I/O/诊断/收尾，停止间隔排除')
            records.append(value)
            return value
        try:
            result = json_save(self.path, payload, self.budget, cap=self.io_cap, shutdown=shutdown, event=self.event)
        except BaseException as error:
            if not shutdown:
                self.failure = error
            raise
        self.status, self.latest_sha, self.last_persisted = proposed_status, proposed_sha, records[-1]
        return result

    def start(self):
        return self.write(force=True)

    def stop(self, status):
        result = self.write(status, shutdown=True, reserve_tail=SHUTDOWN_TAIL_SECONDS, force=True)
        self.closed = True
        return result


def close_without_masking(primary, operations):
    errors = []
    for name, operation in operations:
        try:
            operation()
        except BaseException as error:
            errors.append(dict(operation=name, error=repr(error)))
    return dict(primaryError=repr(primary) if primary is not None else None, cleanupErrors=errors)
