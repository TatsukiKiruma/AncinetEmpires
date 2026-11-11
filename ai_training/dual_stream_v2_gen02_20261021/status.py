"""只读联赛与落盘收据，避免把保存的进程状态当作仍在运行的证明。"""
import json
from pathlib import Path
from collections import Counter

DIR = Path(__file__).resolve().parent


def load(p): return json.loads(Path(p).read_text('utf-8'))


state = load(DIR / 'league-state.json') if (DIR / 'league-state.json').exists() else {}
result = dict(currentGeneration=state.get('currentGeneration'), championGeneration=state.get('championGeneration'), seedCursor=state.get('seedCursor'))
if (DIR / 'pipeline-status.json').exists(): result['savedStage'] = load(DIR / 'pipeline-status.json')['stage']
for folder in sorted((DIR / 'generations').glob('gen_*')):
    games = [load(f) for f in folder.glob('games/*/result.json')]
    arena = [load(f) for f in folder.glob('arena/battles/*/result.json')]
    entry = dict(gamesStarted=len(list(folder.glob('games/*/started.json'))), gamesCompleted=len(games), gameOutcomes=dict(Counter(r['classification'] for r in games)), arenaCompleted=len(arena), arenaOutcomes=dict(Counter(r['classification'] for r in arena)))
    if (folder / 'training-progress.json').exists():
        progress = load(folder / 'training-progress.json'); entry['training'] = {k: progress[k] for k in ['epoch', 'phase', 'batch', 'updates', 'samples']}
    if (folder / 'value-calibration.json').exists(): entry['valueBaselines'] = load(folder / 'value-calibration.json')['passed']
    entry['interruptions'] = [str(f.relative_to(DIR)) for f in folder.glob('games/*/interruption.json')]
    result[folder.name] = entry
hist = [load(f) for f in DIR.glob('historical-arena/battles/*/result.json')]
result['historicalCompleted'] = len(hist); result['historicalOutcomes'] = dict(Counter(r['classification'] for r in hist))
result['directoryMB'] = round(sum(f.stat().st_size for f in DIR.rglob('*') if f.is_file()) / 1e6, 2)
print(json.dumps(result, ensure_ascii=False, indent=2))
