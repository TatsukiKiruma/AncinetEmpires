"""按标签保存已经加载的推理源码，后续修复不覆盖旧尝试身份。"""
import shutil
import sys
from prepare_phase53 import AUDIT, DIR, ROOT, sha
from run_league import read, save

label = sys.argv[1]
assert label.isascii() and all(c.isalnum() or c == '-' for c in label)
target = AUDIT / (label + '-runtime-source')
assert not target.exists()
freeze = read(AUDIT / 'runtime-freeze.json')
files = list({**freeze['runtime'], **freeze['harness']})
files += ['src/game/engine.ts', 'src/game/state_equals.ts', 'ai_training/dual_stream_v2_phase5_20261020/RUNTIME_REVISION.json', 'ai_training/dual_stream_v2_phase5_20261020/phase53-audit/runtime-freeze.json']
for name in files:
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / name, destination)
save(target / 'manifest.json', {name:sha(ROOT / name) for name in files})
print(dict(snapshot=str(target.relative_to(DIR)), files=len(files)))
