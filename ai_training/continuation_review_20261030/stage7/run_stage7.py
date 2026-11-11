"""后台顺序执行器：接管当前 P1，并只在有通过收据时进入下一阶段。"""
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import subprocess
import sys
import time

import psutil
from phase_b_watch import DATA, HERE, now, processes, read_json, save
from phase_b_manager import terminate_owned
from stage7_reports import ROOT, reports, score

kernel = ctypes.windll.kernel32
kernel.CreateMutexW.restype = wintypes.HANDLE
kernel.CreateMutexW.argtypes = (wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR)
kernel.CloseHandle.argtypes = (wintypes.HANDLE,)


def owned_rows(pid):
    try:
        top = psutil.Process(pid)
        return [dict(pid=p.pid, created=p.create_time()) for p in top.children(recursive=True) + [top]]
    except psutil.NoSuchProcess:
        return []


def run(args, log):
    with log.open('ab') as stream:
        child = subprocess.Popen(args, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=stream, stderr=stream,
                                 creationflags=subprocess.CREATE_NO_WINDOW)
        observed = {}
        try:
            while child.poll() is None:
                for p in owned_rows(child.pid):
                    observed[(p['pid'], p['created'])] = p
                try:
                    return child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    continue
            return child.returncode
        finally:
            if child.poll() is None:
                for p in owned_rows(child.pid):
                    observed[(p['pid'], p['created'])] = p
            # 只回收本次子树；即使直接父进程先退出，也保留过已观察到的子进程身份。
            if observed:
                terminate_owned(list(observed.values()))
            if child.poll() is None:
                child.wait(timeout=10)


def checked(args, log):
    code = run(args, log)
    if code:
        raise RuntimeError(f'进程退出码 {code}，见 {log}')


def node(file, log):
    checked(['node.exe', '--import', 'tsx', str(HERE / file)], log)


def update(phase, **fields):
    save(HERE / 'RUN_STATUS.json', dict(phase=phase, status='running', updatedAt=now(), **fields))


def verify_frozen(log):
    module = './' + (HERE / 'phase7_io.ts').relative_to(ROOT).as_posix()
    checked(['node.exe', '--import', 'tsx', '--input-type=module', '-e',
             f"import {{checkSourceLock,checkH1}} from '{module}'; checkSourceLock(); checkH1();"], log)


def validate():
    log = HERE / 'stage7-validation.log'
    verify_frozen(log)
    checked(['node.exe', str(ROOT / 'node_modules/typescript/bin/tsc'), '-p', str(HERE / 'tsconfig.json'), '--noEmit'], log)
    checked(['node.exe', str(HERE / 'build_arena_worker.mjs')], log)
    checked(['node.exe', str(HERE / 'build_league_worker.mjs')], log)
    node('smoke_pipeline.ts', log)


def run_stages():
    stage, reason = 'B', None
    try:
        validate()
        b_path = HERE / 'PHASE_B_DECISION.json'
        if not b_path.exists():
            run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'phase_b_manager.py')], DATA / 'stage7-phase-b.log')
        if not b_path.exists():
            raise RuntimeError('Phase B 控制器未交付门禁收据')
        b = read_json(b_path)
        if not b['passed']:
            return stage, b.get('reason', 'Phase B 未通过')
        stage = 'C'
        update(stage, sealedAccess=0)
        if not (HERE / 'STAGE7_BASELINE_DEV54.json').exists():
            node('phase_c.ts', DATA / 'stage7-phase-c.log')
        c = read_json(HERE / 'STAGE7_BASELINE_DEV54.json')
        if not c['passed']:
            return stage, 'C1 新引擎 Dev-54 健康门禁失败'
        with (HERE / 'PRE_STAGE7_REPORT.md').open('a', encoding='utf-8') as stream:
            stream.write(f'\nPhase C 重锚完成：Dev-18 {score(c["B18"])}；Dev-54 {score(c)}。旧引擎 36/54 仅作描述。\n')
        stage = 'D'
        update(stage, sealedAccess=0)
        if not (HERE / 'PHASE_D_DECISION.json').exists():
            node('phase_d.ts', DATA / 'stage7-phase-d.log')
        d = read_json(HERE / 'PHASE_D_DECISION.json')
        if not d['passed']:
            return stage, 'Phase D 未产生通过 Dev-54 的候选，封存保持关闭'
        stage = 'E'
        update(stage, sealedAccess=int((HERE / 'STAGE7_SEALED_TOKEN.json').exists()))
        if not (HERE / 'PHASE_E_DECISION.json').exists():
            if (HERE / 'STAGE7_SEALED_TOKEN.json').exists():
                return stage, '唯一封存会话曾开启但未完成，保留现场'
            node('phase_e.ts', DATA / 'stage7-phase-e.log')
        if not read_json(HERE / 'PHASE_E_DECISION.json')['passed']:
            reason = '候选未达到最终封存晋级条件'
    except (OSError, RuntimeError, KeyError, ValueError) as exc:
        reason = f'Phase {stage} 运行停止：{exc}'
    return stage, reason


def main():
    kernel.SetLastError(0)
    handle = kernel.CreateMutexW(None, False, 'Local\\AncinetEmpires.Stage7.Controller.20261108')
    already_exists = kernel.GetLastError() == 183
    if not handle or already_exists:
        if handle:
            kernel.CloseHandle(handle)
        raise RuntimeError('本任务已有后台控制器')
    if not kernel.SetThreadExecutionState(0x80000001):
        kernel.CloseHandle(handle)
        raise RuntimeError('后台控制器防休眠锁获取失败')
    stage, reason = 'B', '控制器提前退出'
    try:
        save(HERE / 'STAGE7_CONTROLLER.json', {'pid': psutil.Process().pid, 'startedAt': now(), 'sleepLockHeld': True, 'sealedAccess': 0})
        stage, reason = run_stages()
    except KeyboardInterrupt:
        reason = '控制器收到中断；已保留最近事务检查点'
    finally:
        # 已存在的 P1 若仍在进行，不因开发期类型检查或启动故障而被误停。
        if not (stage == 'B' and not (HERE / 'PHASE_B_DECISION.json').exists()):
            for _ in range(58):
                if not processes():
                    break
                time.sleep(1)
        kernel.SetThreadExecutionState(0x80000000)
        kernel.CloseHandle(handle)
        save(HERE / 'STAGE7_CONTROLLER.json', {'pid': psutil.Process().pid, 'finishedAt': now(), 'sleepLockHeld': False,
             'phase': stage, 'stopReason': reason, 'sealedAccess': int((HERE / 'STAGE7_SEALED_TOKEN.json').exists())})
    try:
        verify_frozen(HERE / 'stage7-validation.log')
    except RuntimeError as exc:
        reason = f'{reason + "；" if reason else ""}收尾公共锁核验失败：{exc}'
    status = reports(stage, reason, workload_sleep_lock_released=True)
    print(json.dumps(status, ensure_ascii=False), flush=True)
    return int(reason is not None)


if __name__ == '__main__':
    raise SystemExit(main())
