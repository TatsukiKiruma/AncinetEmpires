"""响应用户暂停：只停止本任务进程和专属端口，保存全部现场。"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import psutil

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent
REV = HERE / 'revisions/xiaomi_20261020'
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
stamp = datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')
target = REV / ('USER_PAUSE-' + stamp)
target.mkdir()
read = lambda file: json.loads(file.read_text(encoding='utf-8-sig'))
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
stopped, errors, ports = [], [], set()
for file in REV.glob('phone-*/*/SESSION.json'):
    session = read(file)
    ports.add(session['port'])
    try:
        process = psutil.Process(session['serverPid'])
        args = [arg.replace('\\', '/') for arg in process.cmdline()]
        if any(arg.endswith('tactical_exit_20261019/phone/serve.mjs') for arg in args):
            process.terminate()
            process.wait(timeout=5)
            stopped.append(dict(pid=session['serverPid'], session=file.relative_to(HERE).as_posix()))
    except psutil.NoSuchProcess:
        pass
    except Exception as error:
        errors.append(str(error))
adb_results = []
for args in [['-s','c2357770','reverse','--remove',f'tcp:{port}'] for port in sorted(ports)] + [['-s','c2357770','forward','--remove','tcp:19224']]:
    try:
        result = subprocess.run([ADB, *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        adb_results.append(dict(args=args, exitCode=result.returncode, stdout=result.stdout.strip(), stderr=result.stderr.strip()))
    except Exception as error:
        errors.append(str(error))
for name in ['TASK_STATE.json','REPORT.md','BATTLES.md','DELIVERY_MANIFEST.json']:
    file = HERE / name
    if file.exists():
        (target / (name + '.before.snapshot')).write_bytes(file.read_bytes())
reports = []
for file in sorted(REV.glob('phone-r24-v*/selfcheck-*/SELFCHECK.json')):
    value = read(file)
    reports.append(dict(path=file.relative_to(HERE).as_posix(),sha256=sha(file),valueP95Ms=value['valueLatency']['p95'],rootP95Ms=value['rootLatency']['p95'],functionalPassed=value['passed'],valuePassed=value['valueGatePassed'],rootPassed=value['rootTargetPassed']))
parity_files = sorted(REV.glob('performance-v12-kernels-parity-*/PARITY.json'))
parities = [read(file) for file in parity_files]
assert len(parities) == 4 and all(value['passed'] and not value['limitedPilot'] for value in parities)
receipt = dict(userRequestedPause=True, pausedAt=datetime.datetime.now().isoformat(), stoppedServers=stopped,
               adbCleanup=adb_results, errors=errors, defaultAdbAndScrcpyKept=True, filesDeleted=0,
               phoneChecks=reports, latestAsset='revisions/xiaomi_20261020/phone-r24-v12-kernels',
               fixedRoots=sum(value['roots'] for value in parities), candidates=sum(value['candidates'] for value in parities),
               strictWitnessActions=sum(value['audit']['witnessActions'] for value in parities),
               fullSearchMetadataAndInputExact=True, complete=False, teacherQualified=False,
               teacherSlots=0, trueSearchExpertGames=0, distillationStarted=False, finalPhoneSlots=0)
with (target / 'PAUSE.json').open('x',encoding='utf-8') as out:
    json.dump(receipt,out,ensure_ascii=False,indent=2)
state = read(HERE / 'TASK_STATE.json')
state.update(status='paused_by_user',phase='用户要求暂停；v12根速度通过，Value仍未过，尚未解锁教师资格',
             userPauseRecord=(target / 'PAUSE.json').relative_to(HERE).as_posix(),waitingForUser=True,
             complete=False,teacherQualified=False,latestPhoneAsset=receipt['latestAsset'])
(HERE / 'TASK_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
text = '\n\n## 2026-10-20 用户暂停 ' + stamp + '\n\n用户明确要求暂停，已停止本任务资产服务、卸载当前手机验证页以停止Worker并释放唤醒锁，清理专属ADB端口，默认ADB和scrcpy保留。代码、冻结资产、全部测量和失败证据保留。\n\n本轮v9 Value/完整根p95为4.7/887.1ms，v10为4.9/909.6ms；v11b固定4个手机Worker分担单局计算，为7.1/601.2ms；v12增加有限权重零输入内核，为6.9/464.6ms。v12根p95通过500ms前置，Value未过严格5ms；不将不同版本的最好指标拼成一个通过版本。每轮69个固定决策通过，未改变Top16/24/400、0.8或原门槛。\n\nv12固定1557根、21228候选、131433风险见证动作全部与冻结R24精确一致，完整输入、计划、节点和风险元数据一致；23状态的138次策略与46次Value前向及全参数梯度逐项一致（4619964策略梯度项、443233 Value梯度项）。这些是固定状态/历史重放验证，不计新PC或真机对局。\n\n教师仍未合格，正式教师0/120，真正专家0/40，蒸馏和最终Value未启动，最终0/160。后续仅在用户明确恢复后继续；首要未决问题是Value慢帧，手机剖析指向focusThreat/移动签名、状态观察与复制成本。暂停现场见 ' + (target / 'PAUSE.json').relative_to(HERE).as_posix() + '。旧DELIVERY_MANIFEST为此前快照，当前新增修改另由本次暂停清单封存，不代表阶段5最终交付。\n'
for name in ['REPORT.md','BATTLES.md','WORKLOG.md']:
    with (HERE / name).open('a',encoding='utf-8') as out:
        out.write(text)
current = ROOT / 'ai_training/status/CURRENT.md'
before = current.read_bytes()
(target / 'CURRENT.md.before.snapshot').write_bytes(before)
marker = b'<!-- end-tactical-exit-20261019 -->'
assert before.count(marker) == 1
current.write_bytes(before.replace(marker,text.encode('utf-8')+marker))
files = [file for folder in [HERE / 'phone', REV] for file in folder.rglob('*') if file.is_file() and '__pycache__' not in file.parts]
files += [HERE / name for name in ['TASK_STATE.json','REPORT.md','BATTLES.md','WORKLOG.md']]+[current]
manifest = dict(complete=False,status='paused_by_user',files=[dict(path=file.relative_to(ROOT).as_posix(),bytes=file.stat().st_size,sha256=sha(file)) for file in sorted(set(files))])
with (target / 'PAUSE_MANIFEST.json').open('x',encoding='utf-8') as out:
    json.dump(manifest,out,ensure_ascii=False,indent=2)
remaining=[]
for process in psutil.process_iter(['pid','cmdline']):
    args=[arg.replace('\\','/') for arg in process.info['cmdline'] or []]
    if any(arg.endswith('tactical_exit_20261019/phone/serve.mjs') or arg.endswith('tactical_exit_20261019/phone/verify_performance.ts') for arg in args):
        remaining.append(process.info['pid'])
with (target / 'PROCESS_AUDIT.json').open('x',encoding='utf-8') as out:
    json.dump(dict(remainingTaskProcesses=remaining,passed=not remaining),out,ensure_ascii=False,indent=2)
print(json.dumps(dict(paused=True,stoppedServers=len(stopped),remainingTaskProcesses=remaining,errors=errors,receipt=(target/'PAUSE.json').relative_to(HERE).as_posix()),ensure_ascii=False))
