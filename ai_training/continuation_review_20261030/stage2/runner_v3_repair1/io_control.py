"""有界原子保存与可传播的心跳故障；所有等待计入原臂预算。"""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import queue
import threading
import time
import uuid

from frozen import legacy_budget

ArmBudget = legacy_budget.ArmBudget
BudgetExpired = legacy_budget.BudgetExpired
resume_budget = legacy_budget.resume_budget
bounded_process = legacy_budget.bounded_process
IO_CAP_SECONDS = .5
CHECKPOINT_CAP_SECONDS = 5.
SHUTDOWN_CAP_SECONDS = 2.


class PersistenceFailure(OSError):
    pass


class HeartbeatFailure(PersistenceFailure):
    pass


def sharing_error(error):
    return os.name == 'nt' and isinstance(error, PermissionError) and getattr(error, 'winerror', None) in {5, 32, 33}


def _serialize(writer, pending, deadline):
    """写线程只写唯一临时文件；超时后主线程绝不把它提升为正式证据。"""
    completed = queue.Queue(maxsize=1)

    def work():
        try:
            writer(pending)
            completed.put(None)
        except BaseException as error:
            completed.put(error)

    worker = threading.Thread(target=work, daemon=True, name='bounded-evidence-serializer')
    worker.start()
    try:
        result = completed.get(timeout=max(0., deadline - time.perf_counter()))
    except queue.Empty as cause:
        raise PersistenceFailure('序列化超过保存期限；唯一临时文件不提升') from cause
    if result is not None:
        raise result


def atomic_save(path, writer, budget, *, cap=IO_CAP_SECONDS, shutdown=False, event=None):
    path = Path(path)
    duration = float(cap) if shutdown else min(float(cap), budget.require())
    if duration <= 0:
        raise BudgetExpired('保存操作无剩余预算')
    deadline = time.perf_counter() + duration
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f'.{path.name}.{os.getpid()}.{threading.get_ident()}.{uuid.uuid4().hex}.pending')
    attempts, first_error = 0, None
    while True:
        if not shutdown:
            budget.require()
        if time.perf_counter() >= deadline:
            raise PersistenceFailure('暂时文件访问拒绝超过保存期限：' + str(path)) from first_error
        attempts += 1
        try:
            _serialize(writer, pending, deadline)
            if not shutdown:
                budget.require()
            if time.perf_counter() >= deadline:
                raise PersistenceFailure('序列化完成时期限已耗尽，禁止提升')
            pending.replace(path)
            if event and attempts > 1:
                event(dict(kind='sharing_retry_recovered', path=str(path), attempts=attempts, wallSeconds=budget.elapsed()))
            return dict(path=str(path), attempts=attempts, wallSeconds=budget.elapsed())
        except PermissionError as error:
            if not sharing_error(error):
                raise
            first_error = first_error or error
            if event:
                event(dict(kind='sharing_retry', path=str(path), attempt=attempts, winerror=error.winerror, wallSeconds=budget.elapsed()))
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                raise PersistenceFailure('暂时文件访问拒绝超过保存期限：' + str(path)) from error
            time.sleep(min(.01, remaining))


def json_save(path, value, budget, **kwargs):
    def writer(pending):
        payload = value() if callable(value) else value
        pending.write_text(json.dumps(payload, ensure_ascii=False, indent=2), 'utf-8')
    return atomic_save(path, writer, budget, **kwargs)


class BudgetLedger:
    """同一原路径和armId；失败闸门与优化批次共用互斥锁。"""
    def __init__(self, path, budget, arm_id=None, latest_sha=None, *, event=None, interval=.5, io_cap=IO_CAP_SECONDS):
        self.path = Path(path).resolve()
        self.budget = budget
        self.arm_id = arm_id or str(uuid.uuid4())
        self.latest_sha = latest_sha
        self.status = 'running'
        self.lock = threading.RLock()
        self.closed = threading.Event()
        self.failure = None
        self.thread = None
        self.event = event
        self.interval = interval
        self.io_cap = io_cap

    def check(self):
        if self.failure is not None:
            raise HeartbeatFailure('预算心跳持久化已失败，禁止开始新优化批次') from self.failure

    @contextmanager
    def _guard(self, shutdown=False):
        timeout = self.io_cap + .2 if shutdown else min(self.io_cap + .2, self.budget.require())
        if not self.lock.acquire(timeout=timeout):
            error = PersistenceFailure('等待预算写者锁超过期限')
            self.failure = error
            raise error
        try:
            yield
        finally:
            self.lock.release()

    @contextmanager
    def optimization_guard(self):
        # 心跳写入不能在本检查与优化开始之间失败；完成屏障也在同一临界区。
        with self._guard():
            self.check()
            self.budget.require()
            yield

    def write(self, status=None, checkpoint_sha=None, *, shutdown=False):
        with self._guard(shutdown=shutdown):
            if not shutdown:
                self.check()
            proposed_status = self.status if status is None else status
            proposed_sha = self.latest_sha if checkpoint_sha is None else checkpoint_sha

            def payload():
                return dict(schema='cumulative-arm-budget-v1', armId=self.arm_id,
                            consumedWallSeconds=self.budget.elapsed(), limitSeconds=self.budget.limit,
                            excludeDowntime=True, latestCheckpointSha256=proposed_sha,
                            status=proposed_status, pid=os.getpid(), controlProtocol='continuation-control-v3-repair1',
                            scope='原臂累计预算；含重试/编码/更新/诊断/保存，停止间隔排除')
            try:
                result = json_save(self.path, payload, self.budget, cap=self.io_cap, shutdown=shutdown, event=self.event)
            except BaseException as error:
                # 在释放优化闸门前公布失败，消除下一批次抢先通过的竞态。
                if not shutdown:
                    self.failure = error
                raise
            self.status, self.latest_sha = proposed_status, proposed_sha
            return result

    def start(self):
        self.write()

        def heartbeat():
            while not self.closed.wait(self.interval):
                try:
                    self.write()
                except BaseException as error:
                    self.failure = error
                    self.closed.set()
                    if self.event:
                        self.event(dict(kind='heartbeat_failed', error=repr(error), wallSeconds=self.budget.elapsed()))
                    return
        self.thread = threading.Thread(target=heartbeat, daemon=True, name='arm-budget-ledger-v3')
        self.thread.start()

    def stop(self, status):
        self.closed.set()
        if self.thread:
            self.thread.join(timeout=self.io_cap + .3)
            if self.thread.is_alive():
                raise PersistenceFailure('预算心跳未在有界期限内结束')
        return self.write(status, shutdown=True)


def close_without_masking(primary, operations):
    """收尾错误只作为附加证据返回，调用方保留最初异常与traceback。"""
    errors = []
    for name, operation in operations:
        try:
            operation()
        except BaseException as error:
            errors.append(dict(operation=name, error=repr(error)))
    return dict(primaryError=repr(primary) if primary is not None else None, cleanupErrors=errors)
