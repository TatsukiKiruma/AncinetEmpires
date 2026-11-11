"""独立后台收官器：等待当前恢复控制器退出，不依赖聊天会话或轮询实战。"""
import ctypes
from ctypes import wintypes
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def save(name, value):
    with (HERE / name).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)

def main():
    target = int(sys.argv[1])
    controller = psutil.Process(target)
    if 'resume_pipeline.py' not in ' '.join(controller.cmdline()):
        raise RuntimeError('目标不是本阶段恢复控制器，拒绝绑定')
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, target)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    save('BACKGROUND_DISPATCH.json', {
        'controllerPid': target, 'controllerCreated': controller.create_time(),
        'finalizerPid': os.getpid(), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'mode': '独立后台进程等待控制器退出事件，不依赖当前聊天，不自动重跑失败实验',
        'remainingTasks': ['C3 Dev18', '选择晋级者并补齐Dev54', '硬门控通过才执行唯一封存54、历史40及离线329',
                           '五代配对统计（仅封存解锁后）', '公共lint/test/build', '进程与防休眠释放审计', '最终报告及证据清单'],
        'failurePolicy': '控制器或检查失败时记录错误并停止，不伪造成功收官，也不扩大封存次数'})
    try:
        if kernel.WaitForSingleObject(handle, 0xFFFFFFFF) != 0:
            raise RuntimeError('等待控制器退出失败')
    finally:
        kernel.CloseHandle(handle)
    state = json.loads((HERE / 'PIPELINE_PROGRESS.json').read_text(encoding='utf-8'))
    if state['stage'] != '执行完成，等待独立进程审计与报告':
        raise RuntimeError('控制器未成功完成：' + json.dumps(state, ensure_ascii=False))
    active = []
    for process in psutil.process_iter(['pid', 'name', 'cmdline']):
        if process.pid == os.getpid():
            continue
        try:
            info = process.info
            command = ' '.join(info['cmdline'] or []).replace('\\', '/').lower()
            if (info['name'] or '').lower().startswith(('python', 'node')) and 'continuation_review_20261030/stage6/' in command:
                active.append(info)
        except psutil.NoSuchProcess:
            continue
    if active:
        raise RuntimeError('仍有Stage6工作进程：' + json.dumps(active, ensure_ascii=False))
    log = (HERE / 'resume-pipeline-01.stdout.log').read_text(encoding='utf-8-sig', errors='replace')
    if '恢复控制器防休眠锁已释放' not in log:
        raise RuntimeError('缺少恢复控制器防休眠锁释放证据')
    save('FINAL_PROCESS_CHECK.json', {
        'activeCount': 0, 'active': [], 'controllerPid': target, 'controllerExitObserved': True,
        'sleepLockReleased': True, 'auditorPidExcluded': os.getpid(),
        'scope': 'Stage6控制器及工作子进程，当前独立收官审计进程自身除外',
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    result = subprocess.run([sys.executable, '-B', '-X', 'utf8', str(HERE / 'closeout.py')], cwd=ROOT)
    if result.returncode:
        raise RuntimeError(f'收官报告生成失败：{result.returncode}')
    save('BACKGROUND_FINALIZER_STATUS.json', {'status': '收官完成', 'exitCode': 0})

if __name__ == '__main__':
    with (HERE / 'detached-finalizer.log').open('x', encoding='utf-8', buffering=1) as log:
        sys.stdout = sys.stderr = log
        try:
            main()
        except BaseException as error:
            traceback.print_exc()
            save('BACKGROUND_FINALIZER_STATUS.json', {'status': '后台任务需要检查', 'error': str(error), 'success': False})
            raise
