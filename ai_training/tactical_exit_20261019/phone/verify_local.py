"""将公共检查、独立类型及立项保全复核保存到新目录，不覆盖历史报告。"""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import time

HERE = Path(__file__).resolve().parent.parent
ROOT = HERE.parent.parent
target = HERE / 'revisions/xiaomi_20261020' / ('local-checks-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f'))
target.mkdir()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))

def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

checks = {}
commands = [
    ('public-lint', ['node', 'node_modules/typescript/bin/tsc', '--noEmit']),
    ('public-test', ['node', 'node_modules/vitest/vitest.mjs', 'run']),
    ('public-build', ['node', 'node_modules/vite/bin/vite.js', 'build']),
    ('stage5-type', ['node', 'node_modules/typescript/bin/tsc', '-p', 'ai_training/tactical_exit_20261019/tsconfig.json', '--noEmit']),
    ('phone-type', ['node', 'node_modules/typescript/bin/tsc', '-p', 'ai_training/tactical_exit_20261019/phone/tsconfig.json', '--noEmit']),
]
for name, command in commands:
    start = time.perf_counter()
    with (target / f'{name}.log').open('x', encoding='utf-8') as out:
        result = subprocess.run(command, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    checks[name] = dict(passed=result.returncode == 0, exitCode=result.returncode, seconds=time.perf_counter() - start)
    print(name, checks[name], flush=True)
baseline = read(HERE / 'PRESERVE.json')
intentional = {f'src/game/{name}.ts': f'public_before/{name}.ts.snapshot' for name in ['engine', 'map', 'rules', 'abilities', 'rule_config', 'campaign_events']}
intentional['ai_training/status/CURRENT.md'] = 'public_before/CURRENT.md.snapshot'
missing, changed, retained, unchanged = [], [], [], 0
for name, entry in baseline.items():
    file = Path(name)
    if not file.is_absolute():
        file = ROOT / file
    if not file.is_file():
        missing.append(name)
        continue
    actual = sha(file)
    if actual == entry['sha256']:
        unchanged += 1
    elif name in intentional:
        original = HERE / intentional[name]
        assert original.is_file() and sha(original) == entry['sha256'], name
        retained.append(dict(path=name, actualSha256=actual, originalCopy=intentional[name]))
    else:
        changed.append(dict(path=name, expected=entry['sha256'], actual=actual))
preservation = dict(passed=not missing and not changed, baselineFiles=len(baseline), unchangedFiles=unchanged,
                    missing=missing, unexpectedChanged=changed, authorizedChangesWithExactOriginal=retained)
with (target / 'PRESERVATION.json').open('x', encoding='utf-8') as out:
    json.dump(preservation, out, ensure_ascii=False, indent=2)
report = dict(passed=all(check['passed'] for check in checks.values()) and preservation['passed'], checks=checks,
              preservation=dict(passed=preservation['passed'], files=len(baseline), missing=len(missing), unexpectedChanged=len(changed)),
              exactNpmScriptCommands=True, scope='对应npm run lint/npm test/npm run build的原脚本；不代表训练工作区历史总检查通过')
with (target / 'CHECKS.json').open('x', encoding='utf-8') as out:
    json.dump(report, out, ensure_ascii=False, indent=2)
print(json.dumps(dict(report, output=target.relative_to(HERE).as_posix()), ensure_ascii=False), flush=True)
