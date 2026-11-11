"""封存前独立复核完整门禁与54份收据；未通过时不读取任何封存面板。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1')


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def validate_gate():
    gate = json.loads((HERE / 'GATE_DECISION.json').read_text(encoding='utf-8'))
    if gate.get('passed') is not True or gate.get('stage') != 'Dev54' or gate.get('selectedId') != 'C1':
        raise ValueError('完整Dev54门禁未通过，封存保持锁定')
    full = gate['full']; games = full['games']; stats = full['scores']; telemetry = full['telemetry']
    if len(games) != 54 or len({g['id'] for g in games}) != 54 or not all(g['natural'] and g['winner'] not in (None, -1) for g in games):
        raise ValueError('54局自然完赛合同失败')
    if not (stats['equalWin'] >= .5602 and stats['equalRank'] >= .6597 and sum(g['firstPlace'] == 1 for g in games) >= 31):
        raise ValueError('整体棋力门禁失败')
    for n, count, wins in [(2, 20, 14), (3, 18, 9), (4, 16, 6)]:
        rows = [g for g in games if g['players'] == n]
        if len(rows) != count or sum(g['firstPlace'] == 1 for g in rows) < wins:
            raise ValueError('人数分层门禁失败')
    if not telemetry['completeCoverage'] or telemetry['substantiveRate'] <= .9 or telemetry['substantiveByPlayers']['4']['rate'] < .85:
        raise ValueError('实质比较率不足')
    if any(telemetry[k] != 0 for k in ['timeForfeits', 'invalidTeacher', 'waitOverCaptureCount']):
        raise ValueError('健康门禁失败')
    config = HERE / 'config-C1.json'; config_hash = sha(config)
    if gate['configSha256'] != config_hash:
        raise ValueError('候选配置变化')
    settings = json.loads(config.read_text()); prefix = Path(settings['modelPrefix'])
    if sha(prefix.with_suffix('.bin')) != settings['modelVersion']:
        raise ValueError('模型变化')
    for game in games:
        root = DATA / 'development-v2/C1' / game['id']
        receipt = json.loads((DATA / 'development-v2' / f"C1-{game['id']}.receipt.json").read_text())
        if receipt['configSha256'] != config_hash or receipt['summarySha256'] != sha(root / 'SUMMARY.json'):
            raise ValueError('逐局收据变化')
        summary = json.loads((root / 'SUMMARY.json').read_text())
        if not summary['gpuExited'] or summary['games'][0]['classification'] != game['classification']:
            raise ValueError('对局或推理退出合同变化')
    return {'gateSha256': sha(HERE / 'GATE_DECISION.json'), 'configSha256': config_hash, 'modelSha256': settings['modelVersion'], 'selectedId': 'C1'}


if __name__ == '__main__':
    print(json.dumps(validate_gate()))
