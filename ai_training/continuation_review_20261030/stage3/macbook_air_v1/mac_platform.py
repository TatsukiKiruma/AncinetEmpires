"""macOS原生热压力、电池和磁盘观测；不要求sudo或修改电源配置。"""
import ctypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

_cached=None
_objc=None

def thermal_state():
    global _objc
    if _objc is None:
        ctypes.CDLL('/System/Library/Frameworks/Foundation.framework/Foundation')
        library=ctypes.CDLL('/usr/lib/libobjc.A.dylib')
        library.objc_getClass.argtypes=[ctypes.c_char_p];library.objc_getClass.restype=ctypes.c_void_p
        library.sel_registerName.argtypes=[ctypes.c_char_p];library.sel_registerName.restype=ctypes.c_void_p
        pointer=ctypes.cast(library.objc_msgSend,ctypes.c_void_p).value
        message=ctypes.CFUNCTYPE(ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p)(pointer)
        integer=ctypes.CFUNCTYPE(ctypes.c_long,ctypes.c_void_p,ctypes.c_void_p)(pointer)
        process=message(library.objc_getClass(b'NSProcessInfo'),library.sel_registerName(b'processInfo'))
        _objc=(library,integer,process,library.sel_registerName(b'thermalState'))
    library,integer,process,selector=_objc
    value=int(integer(process,selector))
    if value not in [0,1,2,3]:raise ValueError('macOS热压力枚举无效')
    return value

def resource(work):
    global _cached
    if _cached is not None and time.monotonic()-_cached[0]<15:return dict(_cached[1])
    output=subprocess.run(['/usr/bin/pmset','-g','batt'],capture_output=True,text=True,check=True,timeout=10).stdout
    match=re.search(r'(\d+)%;\s*([^;\n]+)',output)
    if match is None:raise ValueError('无法解析Mac电量')
    state=thermal_state();battery=int(match[1])
    if not 0<=battery<=100:raise ValueError('Mac电量无效')
    result=dict(valid=True,epoch=time.time(),batteryPercent=battery,chargingStatus=match[2].strip(),onACPower='AC Power' in output,
        thermalState=state,thermalStateName=['正常','温暖','严重热压力','临界热压力'][state],
        freeBytes=shutil.disk_usage(work).free,temperatureC=None,temperatureMethod='NSProcessInfo.thermalState')
    _cached=(time.monotonic(),result);return dict(result)

def resource_bad(value,runtime,paused=False):
    if paused:return not(value['thermalState']<=runtime['thermalResumeAtMost'] and value['batteryPercent']>=runtime['batteryResume'] and value['freeBytes']>=runtime['freeSpaceResumeBytes'])
    return value['thermalState']>=runtime['thermalPauseAtLeast'] or value['batteryPercent']<runtime['batteryPause'] or value['freeBytes']<runtime['freeSpacePauseBytes']
