"""固定有界目标网格，只在实战前执行，所有参数由train拟合。"""
import json
import shutil
import subprocess
import sys
from pathlib import Path
DIR = Path(__file__).resolve().parent
assert not (DIR / 'battles').exists(), '已有实战后不得选择校准参数'
names = ['head-calibration.json', 'value-calibration.json', 'value-config.json', 'calibration-complete.json']
attempt = DIR / 'calibration-attempt01'; attempt.mkdir(exist_ok=False)
for name in names: shutil.copyfile(DIR / name, attempt / name)
grid = [(0, 'unbalanced'), (0, 'balanced'), (.25, 'balanced'), (1, 'balanced'), (4, 'balanced'), (.25, 'unbalanced'), (1, 'unbalanced'), (4, 'unbalanced')]
(DIR / 'value-objective-protocol.json').write_text(json.dumps(dict(frozenBeforeBattles=True, grid=grid, selection='全部切片联合合格后按开发KL选择；无合格保留第一项train NLL候选', trainOnly=True)), encoding='utf-8')
results = []
for i, (rank, mode) in enumerate(grid):
    subprocess.run([sys.executable, '-X', 'utf8', str(DIR / 'calibrate.py'), str(rank), mode], check=True, cwd=DIR.parents[1])
    output = DIR / f'calibration-fit-{i:02d}'; output.mkdir(exist_ok=False)
    for name in names: shutil.copyfile(DIR / name, output / name)
    r = json.loads((output / 'value-calibration.json').read_text('utf-8'))
    results.append(dict(index=i, rank=rank, mode=mode, passed=r['passed'], kl=r['slices']['all']['model']['kl'], failed=[k for k,s in r['slices'].items() if not s['allBaselinesExceeded']]))
    print(json.dumps(results[-1]), flush=True)
qualified = [r for r in results if r['passed']]
selected = min(qualified, key=lambda r: r['kl'])['index'] if qualified else 0
for name in names: shutil.copyfile(DIR / f'calibration-fit-{selected:02d}' / name, DIR / name)
(DIR / 'value-objective-sweep.json').write_text(json.dumps(dict(passed=bool(qualified), selected=selected, results=results, selectionUsesBattleOutcomes=False), indent=2), encoding='utf-8')
