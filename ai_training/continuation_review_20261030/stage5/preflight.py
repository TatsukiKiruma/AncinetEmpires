"""第五阶段只读启动检查；不读取封存面板，不启动训练。"""
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/acceptance_mac100k_20261031_v1/best')
EXPECTED = {
    'checkpoint.pt': '2cabb0871a45a7f95f0648f201d3559b06bc43388441b5c366405111bce14770',
    'final.bin': '1d3b6d01b91de9cbd56693b9140ca769e9df06c490701adccfd8fc701fb4a6a6',
}


def main():
    checks = {}
    for name, expected in EXPECTED.items():
        with (BASE / name).open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        checks[name] = {'sha256': actual, 'passed': actual == expected}
    config_path = HERE.parent / 'stage4_v7/config-C2.json'
    lock = json.loads((HERE.parent / 'stage4_v7/STAGE4_V7_CANDIDATE_LOCK.json').read_text(encoding='utf-8'))
    checks['config'] = {'passed': hashlib.sha256(config_path.read_bytes()).hexdigest() == lock['configSha256']}
    free = shutil.disk_usage('D:/').free
    checks['disk'] = {'freeBytes': free, 'passed': free >= 15_000_000_000}
    import torch
    checks['gpu'] = {'version': torch.__version__, 'passed': torch.cuda.is_available()}
    report = {'checks': checks, 'passed': all(c['passed'] for c in checks.values()),
              'sealedAccess': 0, 'trainingUpdates': 0, 'sampledGames': 0,
              'scope': '仅启动前检查，不代表第五阶段实现或验收完成'}
    with (HERE / 'PREFLIGHT.json').open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
