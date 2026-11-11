"""核对本轮优化消费、产物哈希与固定源码，汇总可审阅证据。"""
import hashlib
import json
from pathlib import Path


ROOT = Path('v19/out/data_scale_20261003')
REVIEW = Path('v19/review/data_scale_20261003')


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    curve = read(REVIEW / 'checkpoint_curve.json')
    by_sha = {entry['sha256']: entry for entry in curve['checkpoints']}
    baseline = curve['checkpoints'][0]
    assert baseline['sha256'] == '0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47'
    runs = []
    for directory in sorted((ROOT / 'training').iterdir()):
        if not directory.is_dir():
            continue
        identity = read(directory / 'experiment_identity.json')
        metrics = read(directory / 'metrics.json')
        consumed = read(directory / 'optimized.json')
        process = read(directory / 'process_result.json')
        assert process['returnCode'] == 0
        for file, expected in identity['sourceSha256'].items():
            assert sha(file) == expected, file
        assert consumed['measured'] is True
        assert consumed['updates'] == identity['updates'] == metrics['optimizerUpdates']
        assert consumed['totalExposures'] == identity['plannedExposures']
        assert consumed['optimizedUniqueSamples'] == identity['plannedUniqueRows']
        assert consumed['plannedButNeverOptimized'] == 0
        assert consumed['valueSupervisedExposures'] == 0
        final_sha = sha(directory / 'final.json')
        assert final_sha == metrics['artifacts']['final']['sha256']
        final_eval = by_sha[final_sha]
        runs.append({
            'run': directory.name, 'level': identity['level'], 'mode': identity['mode'],
            'updates': consumed['updates'], 'exposures': consumed['totalExposures'],
            'uniqueSamples': consumed['optimizedUniqueSamples'], 'families': consumed['uniqueRootFamilies'],
            'processElapsedSeconds': process['elapsedSeconds'], 'finalSha256': final_sha,
            'validationBySource': final_eval['validationBySource'],
            'lastTrainingEpoch': metrics['history'][-1],
        })
    assert len(runs) == 6
    recovery = read(REVIEW / 'recovery_audit_v2/audit.json')
    assert recovery['status'] == 'PASS'
    frozen = read(ROOT / 'recovered_s0/manifest.json')['sourceDigests']
    checked_sources = {}
    for group in ['engine', 'h0', 'policy', 'runner']:
        for item in frozen[group]['files']:
            assert sha(item['path']) == item['sha256'], item['path']
            checked_sources[item['path']] = item['sha256']
    champion = Path('v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json')
    assert sha(champion) == 'b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899'
    result = {
        'kind': 'v19-data-scale-followup-closeout', 'status': 'OFFLINE_PILOT_COMPLETE_NO_PROMOTION',
        'objective16of20Achieved': False, 'newArenaGames': 0, 'trainingRuns': 6,
        'optimizerUpdates': sum(r['updates'] for r in runs),
        'exposures': sum(r['exposures'] for r in runs),
        'uniqueTrainingInputsAcrossAllRuns': 751,
        'trainingProcessElapsedSecondsSum': sum(r['processElapsedSeconds'] for r in runs),
        'baseline': baseline, 'runs': runs, 'sourceIntegrityPassed': True,
        'frozenSourceFiles': checked_sources, 'championSha256': sha(champion),
        'supersededExploratoryArtifacts': {
            'scale_pilot': '初版current家族误按逐行gameId拆分，且历史主图样本不足；未训练，由current_scale_pilot_v2替代',
            'recovery_audit': '完整teacher变化误称标签冲突；由recovery_audit_v2区分硬目标0冲突与8个分数/元数据差异',
        },
        'evidenceSha256': {str(p): sha(p) for p in [
            REVIEW / 'checkpoint_curve.json', REVIEW / 'recovery_audit_v2/audit.json',
            ROOT / 'current_scale_pilot_v2/manifest.json', Path(__file__),
        ]},
    }
    target = ROOT / 'closeout.json'
    if target.exists():
        raise FileExistsError('拒绝覆盖已有关闭证据')
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['status', 'trainingRuns', 'optimizerUpdates', 'exposures', 'sourceIntegrityPassed']}))


if __name__ == '__main__':
    main()
