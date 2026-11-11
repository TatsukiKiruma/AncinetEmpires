"""失败后仅汇总证据和进程状态，不启动任何评测或训练。"""
import datetime
import hashlib
import json
from pathlib import Path
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

processes = []
for p in psutil.process_iter(['name', 'cmdline']):
    name = (p.info['name'] or '').lower()
    command = p.info['cmdline'] or []
    if name in ('node.exe', 'python.exe', 'python3.exe') and any(
        'phase_a_audit.ts' in a or 'hold_awake.py' in a for a in command
    ):
        processes.append({'pid': p.pid, 'name': name, 'command': command})
write('FINAL_PROCESS_CHECK.json', {'checkedAt': now, 'activeCount': len(processes), 'processes': processes,
    'sleepLocksReleased': True, 'sleepLockPid': 420, 'sleepLockExitCode': 0,
    'scope': '本次持锁脚本和子集核验进程；工具会话另确认测试退出码1、子集退出码0',
    'note': 'CIM 进程枚举不可用，改用 psutil 独立核验。'})
write('SEALED_ACCESS.json', {'checkedAt': now, 'sealedAccess': 0, 'phaseEStarted': False,
    'basis': '本轮工具访问清单与子集核验读取账本；未执行封存读取入口，也未创建训练起点。'})
write('GATES.json', {'phaseA': {'passed': False, 'subset': {'passed': True, 'states': 2160},
    'lint': {'exitCode': 0}, 'test': {'exitCode': 1, 'passed': 556, 'failed': 8, 'skipped': 20},
    'build': {'status': 'not_run_after_gate_failure'}},
    'phaseB': {f'B-G{i}': {'status': 'not_started'} for i in range(1, 6)},
    'phaseC': {'status': 'not_started'}, 'phaseD': {'status': 'not_started', 'generations': 0},
    'phaseE': {'status': 'not_started'}, 'sealedAccess': 0,
    'stopReason': 'Phase A 公共测试门禁失败，未修复后续错误或放宽门禁继续。'})
before = (HERE / 'git-status-before.txt').read_text(encoding='utf-8-sig').splitlines()
after = (HERE / 'git-status-after.txt').read_text(encoding='utf-8-sig').splitlines()
write('GIT_STATUS_COMPARISON.json', {'beforeLines': len(before), 'afterLines': len(after),
    'addedStatusLines': sorted(set(after)-set(before)), 'removedStatusLines': sorted(set(before)-set(after)),
    'note': '已有修改文件和未跟踪目录内新增内容不会体现为状态行差异，实际补丁另存。'})
files = list(HERE.glob('*')) + list((HERE / 'before').glob('*'))
files += [ROOT / name for name in ['src/game/rules.ts', 'src/game/engine.ts', 'src/game/env.ts',
    'src/ai_runtime/dual_v2/contract.ts', 'src/game/tests/apk_stage7_alignment.test.ts',
    'src/game/tests/engine.test.ts', 'src/game/tests/assault_post_action.test.ts']]
entries = [{'path': str(f), 'bytes': f.stat().st_size, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
    for f in files if f.is_file() and f.name != 'EVIDENCE_MANIFEST.json']
write('EVIDENCE_MANIFEST.json', {'createdAt': now, 'files': entries, 'sealedAccess': 0})
print(json.dumps({'activeCount': len(processes), 'evidenceFiles': len(entries), 'sealedAccess': 0}))
