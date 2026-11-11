"""实际三个入口仅预检的正负例，以及已审核历史基线的附加映射。"""
import json
from pathlib import Path
import subprocess
import sys
from contracts import HERE, ROOT, validate, file_sha
from compare_arena import load_checked, compare_games

config_path = HERE / 'STAGE2_CONFIG.json'
config = json.loads(config_path.read_text('utf-8'))
execution, science = validate(config)
out = HERE / 'revisions/review1/entry-checks'
retry = 1
while out.exists():
    retry += 1
    out = HERE / f'revisions/review1/entry-checks-r{retry}'
out.mkdir(parents=True, exist_ok=False)
bad = dict(config, microbatch=2)
bad_path = out / 'unsupported-config.json'
bad_path.write_text(json.dumps(bad), 'utf-8')
commands = {
    'train': [sys.executable, '-X', 'utf8', str(HERE / 'train.py'), '--preflight-only'],
    'offline': [sys.executable, '-X', 'utf8', str(HERE / 'offline.py'), '--preflight-only'],
    'arena': ['node', '--import', 'tsx', str(HERE / 'arena.ts'), '--preflight-only'],
}
checks = []
for name, command in commands.items():
    for negative in [False, True]:
        result = subprocess.run(command + ['--config', str(bad_path if negative else config_path)], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=60, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        (out / f'{name}-{negative}.stdout.log').write_text(result.stdout, 'utf-8')
        (out / f'{name}-{negative}.stderr.log').write_text(result.stderr, 'utf-8')
        if negative:
            assert result.returncode != 0 and '配置与固定实现不一致' in result.stderr, (name, result.stderr)
        else:
            assert result.returncode == 0, (name, result.stderr)
            assert json.loads(result.stdout) == execution
        checks.append(dict(entry=name, negative=negative, exitCode=result.returncode, passed=True, rawGpuForwardCalls=0, optimizerUpdates=0, gameSteps=0))
panel = json.loads((HERE / 'ARENA_PANEL.json').read_text('utf-8'))
initials = {s['slot']: json.loads((HERE / s['file']).read_text('utf-8')) for s in panel['slots']}
games, legacy = load_checked(HERE / 'arena-baseline-r2/SUMMARY.json', panel, execution, science, initials)
assert legacy
adapter = dict(schema='reviewed-v1-baseline-comparison-adapter-v2', originalSummarySha256=file_sha(HERE / 'arena-baseline-r2/SUMMARY.json'), originalRunSha256=file_sha(HERE / 'arena-baseline-r2/RUN.json'), originalSourceManifestSha256=file_sha(HERE / 'revisions/review1/v1/SOURCE_MANIFEST.json'), effectiveComparisonIdentity=execution, correctedGames=games, newGames=0, newOptimizerUpdates=0, explanation='只对审核已接受的V1字节身份建立比较映射；actualHand由原初态currentPlayer确定，未改写任何40局原件或声称旧运行器具备新字段。')
(HERE / 'BASELINE_EXECUTION_ADAPTER.json').write_text(json.dumps(adapter, ensure_ascii=False, indent=2), 'utf-8')
self_check = dict(compare_games(games, games), executionIdentity=execution, legacyApproved=True, newGames=0)
(HERE / 'COMPARE_V2_SELF_CHECK.json').write_text(json.dumps(self_check, ensure_ascii=False, indent=2), 'utf-8')
(HERE / 'REVIEW_ENTRY_CHECKS.json').write_text(json.dumps(dict(passed=True, checks=checks, scienceContractSha256=config['scienceContractSha256'], runnerContractSha256=config['runnerContractSha256'], preservedOriginalArena=True, realGpuForwardCalls=0, newOptimizerUpdates=0, newGames=0), ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(dict(passed=True, cliCases=len(checks), originalGames=40, additionalGames=0)))
