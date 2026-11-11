"""阶段5.3修改前保全：只建立清单与小型源码副本，不改写旧对局。"""
import hashlib
import json
import shutil
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
AUDIT = DIR / 'phase53-audit'


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    AUDIT.mkdir(exist_ok=True)
    target = AUDIT / 'before.json'
    if target.exists():
        print('已有开工清单，保持原件')
        return
    files = {}
    for base in [DIR, ROOT / 'src/ai_runtime/dual_v2', ROOT / 'ai_training/dual_stream_v2_gen02_20261021']:
        for p in base.rglob('*'):
            if p.is_file() and AUDIT not in p.parents:
                files[p.relative_to(ROOT).as_posix()] = dict(sha256=sha(p), bytes=p.stat().st_size)
    protected = ['src/App.tsx', 'src/game/ai/neural_ai_adapter.ts', 'src/game/ai/ai_worker.ts', 'ai_training/status/CURRENT.md']
    for name in protected:
        p = ROOT / name
        files[name] = dict(sha256=sha(p), bytes=p.stat().st_size)
    snapshot = list((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts'))
    snapshot += [p for p in DIR.iterdir() if p.suffix in ['.ts', '.py', '.md'] or p.name in ['RUNTIME_REVISION.json', 'league-state.json', 'gate-summary.json']]
    snapshot += [ROOT / 'ai_training/status/CURRENT.md']
    for p in snapshot:
        dest = AUDIT / 'before' / p.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, dest)
    target.write_text(json.dumps(dict(files=files, directoryBytes=sum(p.stat().st_size for p in DIR.rglob('*') if p.is_file()), freeBytes=shutil.disk_usage(DIR).free), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(files=len(files), gen3Model=sha(DIR / 'generations/gen_03/model.bin'), freeGiB=shutil.disk_usage(DIR).free / 1024**3)))


if __name__ == '__main__':
    main()
