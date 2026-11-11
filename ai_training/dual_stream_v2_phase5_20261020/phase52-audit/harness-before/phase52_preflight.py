"""第3代开工保全；只新增清单与源码副本，不改写旧代。"""
import hashlib
import json
import shutil
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
AUDIT = DIR / 'phase52-audit'


def digest(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()


def main():
    assert not (AUDIT / 'before.json').exists(), '开工清单已经存在，禁止覆盖'
    AUDIT.mkdir(exist_ok=True)
    protected = [DIR / f'generations/gen_{g:02d}' for g in range(3)]
    protected += [DIR.parent / 'dual_stream_v2_gen02_20261021', DIR / 'champion-pure-arena']
    paths = [p for folder in protected for p in folder.rglob('*') if p.is_file()]
    paths += [ROOT / name for name in ['src/App.tsx', 'src/game/ai/neural_ai_adapter.ts', 'src/game/ai/ai_worker.ts']]
    manifest = {p.relative_to(ROOT).as_posix(): dict(sha256=digest(p), bytes=p.stat().st_size) for p in paths}
    for p in DIR.iterdir():
        if p.is_file() and p.suffix in {'.py', '.ts', '.json', '.md', '.mjs'}:
            target = AUDIT / 'harness-before' / p.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, target)
    for p in (ROOT / 'src/ai_runtime/dual_v2').glob('*'):
        if p.is_file():
            target = AUDIT / 'runtime-before' / p.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, target)
    result = dict(files=manifest, count=len(manifest), bytes=sum(e['bytes'] for e in manifest.values()), freeBytes=shutil.disk_usage(ROOT).free)
    (AUDIT / 'before.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'files'}))


if __name__ == '__main__':
    main()
