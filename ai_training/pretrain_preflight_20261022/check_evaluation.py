"""全部计时实战结束后执行一次独立类型检查并持久保存退出码。"""
from pathlib import Path
import json, subprocess, datetime, hashlib

TASK = Path(__file__).resolve().parent
ROOT = TASK.parents[1]
OUT = TASK / 'evaluation'
assert json.loads((OUT / 'progress.json').read_text(encoding='utf8'))['phase'] == 'complete', '必须等全部计时AI结束'
assert not (OUT / 'typecheck-result.json').exists(), '已有持久检查收据，不重复覆盖'
command = ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'ai_training/pretrain_preflight_20261022/tsconfig.evaluation.json']
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
with (OUT / 'typecheck.log').open('xb') as stream:
    result = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT)
receipt = {'command': command, 'cwd': str(ROOT), 'startedAt': started,
           'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'exitCode': result.returncode, 'passed': result.returncode == 0,
           'scope': 'arena.ts、verify.ts、verify_original_history.ts及其导入依赖的独立类型检查',
           'log': 'evaluation/typecheck.log',
           'sourceIdentitiesAtCheck': [
               {'path': str(file.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
               for file in [TASK / 'arena.ts', TASK / 'verify.ts', TASK / 'verify_original_history.ts',
                            TASK / 'tsconfig.evaluation.json', ROOT / 'ai_training/data_acceptance_20261016/replay/core.ts']
           ]}
(OUT / 'typecheck-result.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(receipt, ensure_ascii=True))
raise SystemExit(result.returncode)
