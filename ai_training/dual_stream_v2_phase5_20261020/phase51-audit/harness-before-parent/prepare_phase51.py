"""阶段5.1开工保全：只新增快照和逐文件身份，拒绝覆盖历史收据。"""
import hashlib
import json
import shutil
from pathlib import Path

DIR = Path(__file__).resolve().parent
ROOT = DIR.parents[1]
AUDIT = DIR / 'phase51-audit'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    AUDIT.mkdir(exist_ok=True)
    receipt = AUDIT / 'before.json'
    if receipt.exists():
        return
    protected = [ROOT / p for p in ['src/App.tsx', 'src/game/ai/neural_ai_adapter.ts', 'src/game/ai/ai_worker.ts', 'src/main.tsx', 'src/index.css']]
    preserved = [p for folder in [DIR / 'generations/gen_00', DIR / 'generations/gen_01', DIR.parent / 'dual_stream_v2_gen02_20261021'] for p in folder.rglob('*') if p.is_file()]
    runtime = ROOT / 'src/ai_runtime/dual_v2'
    for source in [runtime, DIR]:
        target = AUDIT / ('runtime-before' if source == runtime else 'training-source-before')
        target.mkdir(exist_ok=True)
        for p in source.iterdir():
            if p.is_file() and (source == runtime or p.suffix in ['.py', '.ts', '.mjs', '.json', '.md']):
                shutil.copyfile(p, target / p.name)
    receipt.write_text(json.dumps(dict(preserved={p.relative_to(ROOT).as_posix(): sha(p) for p in preserved}, protected={p.relative_to(ROOT).as_posix(): sha(p) for p in protected}, runtimeBefore={p.relative_to(ROOT).as_posix(): sha(p) for p in runtime.glob('*.ts')}, initialLeague=json.loads((DIR / 'league-state.json').read_text('utf-8'))), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(preservedFiles=len(preserved), protectedFiles=len(protected))))


if __name__ == '__main__':
    main()
