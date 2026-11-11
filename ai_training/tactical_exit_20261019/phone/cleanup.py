"""只清理本任务的空闲资产服务器与ADB端口，保留默认ADB、scrcpy和全部证据。"""
from pathlib import Path
import datetime
import json
import subprocess
import psutil

HERE = Path(__file__).resolve().parent.parent
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
servers, ports = [], set()
for file in (HERE / 'revisions/xiaomi_20261020').glob('phone-r24-v*/selfcheck-*/SESSION.json'):
    session = json.loads(file.read_text(encoding='utf-8'))
    ports.add(session['port'])
    try:
        process = psutil.Process(session['serverPid'])
        args = [arg.replace('\\', '/') for arg in process.cmdline()]
        if any(arg.endswith('tactical_exit_20261019/phone/serve.mjs') for arg in args):
            process.terminate()
            process.wait(timeout=10)
            servers.append(dict(pid=session['serverPid'], stopped=True))
    except psutil.NoSuchProcess:
        pass

def adb(args):
    try:
        result = subprocess.run([ADB, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return dict(args=args, exitCode=result.returncode, stdout=result.stdout.strip(), stderr=result.stderr.strip())
    except Exception as error:
        return dict(args=args, error=str(error))

results = [adb(['-s', 'c2357770', 'reverse', '--remove', f'tcp:{port}']) for port in sorted(ports)]
results.append(adb(['-s', 'c2357770', 'forward', '--remove', 'tcp:19224']))
# 5038是本次为排查默认ADB超时而新建的独立服务，默认5037服务保持。
results.append(adb(['-P', '5038', 'kill-server']))
report = dict(stoppedAssetServers=servers, adbCleanup=results, defaultAdbServerKept=True, scrcpyKept=True,
              phoneSettingsChanged=False, filesDeleted=0, gamesStarted=0)
file = HERE / 'revisions/xiaomi_20261020' / ('CLEANUP-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f') + '.json')
with file.open('x', encoding='utf-8') as out:
    json.dump(report, out, ensure_ascii=False, indent=2)
print(json.dumps(dict(report, receipt=file.relative_to(HERE).as_posix()), ensure_ascii=False))
