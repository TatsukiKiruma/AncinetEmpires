"""等待已下发控制器退出事件，再独立核验进程及生成最终报告，不重复派发实验。"""
import ctypes
from ctypes import wintypes
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import psutil

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]

def save(name,value):
    with (HERE/name).open('x',encoding='utf-8') as stream:
        json.dump(value,stream,ensure_ascii=False,indent=2)

def main():
    target=int(sys.argv[1])
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    handle=kernel.OpenProcess(0x00100000,False,target)
    if not handle:raise ctypes.WinError(ctypes.get_last_error())
    save('FINALIZER_DISPATCH.json',{'controllerPid':target,'auditorPid':os.getpid(),'mode':'等待控制器退出事件，不轮询实战','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    try:
        if kernel.WaitForSingleObject(handle,0xFFFFFFFF)!=0:raise RuntimeError('等待控制器退出事件失败')
    finally:kernel.CloseHandle(handle)
    state=json.loads((HERE/'PIPELINE_PROGRESS.json').read_text(encoding='utf-8'))
    if state['stage']!='执行完成，等待独立进程审计与报告':
        save('FINALIZER_STATUS.json',{'status':'执行控制器异常，未生成成功收官','pipeline':state})
        return 1
    active=[]
    for process in psutil.process_iter(['pid','name','cmdline']):
        if process.pid==os.getpid():continue
        try:
            info=process.info
            command=' '.join(info['cmdline'] or []).replace('\\','/').lower()
            if (info['name'] or '').lower().startswith(('python','node')) and 'continuation_review_20261030/stage6/' in command:
                active.append(info)
        except (psutil.NoSuchProcess,psutil.AccessDenied):continue
    if active:
        save('FINALIZER_STATUS.json',{'status':'检测到剩余工作进程，拒绝成功收官','active':active})
        return 1
    log=(HERE/'pipeline.log').read_text(encoding='utf-8-sig',errors='replace')
    if '端到端控制器防休眠锁已释放' not in log:raise RuntimeError('缺少防休眠锁释放证据')
    save('FINAL_PROCESS_CHECK.json',{'activeCount':0,'active':active,'controllerPid':target,'controllerExitObserved':True,'sleepLockReleased':True,'auditorPidExcluded':os.getpid(),'scope':'已下发的Stage6工作进程；当前只读收官审计进程自身不计入','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    result=subprocess.run([sys.executable,'-B','-X','utf8',str(HERE/'closeout.py')],cwd=ROOT)
    save('FINALIZER_STATUS.json',{'status':'收官完成' if result.returncode==0 else '收官报告生成失败','exitCode':result.returncode})
    return result.returncode

if __name__=='__main__':raise SystemExit(main())
