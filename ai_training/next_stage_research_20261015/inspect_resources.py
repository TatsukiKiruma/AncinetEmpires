"""通过只读系统API补充资源身份，不启动GPU计算。"""
import ctypes
from ctypes import wintypes
import datetime
import json
from pathlib import Path
import subprocess
import winreg

out=Path(__file__).resolve().parent
receipt={'observed_at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()}
with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as key:
    receipt['cpu_name']=winreg.QueryValueEx(key,'ProcessorNameString')[0].strip()


class DisplayDevice(ctypes.Structure):
    _fields_=[('cb',wintypes.DWORD),('DeviceName',wintypes.WCHAR*32),('DeviceString',wintypes.WCHAR*128),
              ('StateFlags',wintypes.DWORD),('DeviceID',wintypes.WCHAR*128),('DeviceKey',wintypes.WCHAR*128)]


receipt['display_devices']=[]
for i in range(16):
    d=DisplayDevice();d.cb=ctypes.sizeof(d)
    if not ctypes.windll.user32.EnumDisplayDevicesW(None,i,ctypes.byref(d),0):
        break
    receipt['display_devices'].append({'name':d.DeviceString,'state_flags':d.StateFlags})
interpreter=out.parent/'r8_pure_policy_stage_20261014_125300/tmp/venv/Scripts/python.exe'
code="import json,torch; print(json.dumps(dict(torch=torch.__version__,cuda_available=torch.cuda.is_available(),cuda_built=torch.version.cuda,threads=torch.get_num_threads(),cuda_count=torch.cuda.device_count())))"
if interpreter.exists():
    run=subprocess.run([str(interpreter),'-c',code],capture_output=True,text=True,timeout=45)
    receipt['r8_environment']={'interpreter':str(interpreter),'exit_code':run.returncode,'stdout':run.stdout.strip(),'stderr':run.stderr.strip()}
path=out/'resource_probe.json'
with path.open('x',encoding='utf8') as f:
    json.dump(receipt,f,ensure_ascii=False,indent=2)
print(json.dumps(receipt,ensure_ascii=False))
