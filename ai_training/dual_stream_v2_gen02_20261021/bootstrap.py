"""为第2代建立独立版本目录，保全旧合同与开工源码，不改写旧代证据。"""
import ast
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OLD = HERE.parent / 'dual_stream_v2_phase5_20261020'


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    marker = HERE / 'START_SNAPSHOT.json'
    if marker.exists():
        raise RuntimeError('开工快照已经存在，禁止覆盖')
    files = list(OLD.glob('*.py')) + list(OLD.glob('*.ts')) + list(OLD.glob('*.mjs'))
    files += [OLD / n for n in ['PLAN.md', 'REPORT.md', 'BATTLES.md', 'LEAGUE_RESUME_GUIDE.md', 'league-state.json', 'gate-summary.json', 'PRE_EVALUATION_CONTRACT.json', 'RUNTIME_REVISION.json', 'RESUME_GUARD_REVISION.json']]
    files += list((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts'))
    files += [ROOT / n for n in ['src/App.tsx', 'src/game/ai/neural_ai_adapter.ts', 'src/game/ai/ai_worker.ts', 'src/main.tsx', 'src/index.css']]
    identities = {}
    for p in files:
        relative = p.relative_to(ROOT)
        target = HERE / 'start-source-snapshot' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, target)
        identities[str(relative)] = digest(p)
    (HERE / 'git-status-before.txt').write_bytes(subprocess.check_output(['git', 'status', '--short'], cwd=ROOT))
    tree = ast.parse((OLD / 'run_league.py').read_text('utf-8'))
    promotion = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'promote')
    marker.write_text(json.dumps(dict(createdAt=datetime.now(timezone.utc).isoformat(), files=identities, oldPromotionAst=ast.dump(promotion, include_attributes=False), oldDirectoryBytes=sum(p.stat().st_size for p in OLD.rglob('*') if p.is_file()), scope='第2代独立合同与目录；旧代只读保留'), ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(snapshotFiles=len(identities), oldDirectoryBytes=json.loads(marker.read_text('utf-8'))['oldDirectoryBytes'])))


if __name__ == '__main__':
    main()
