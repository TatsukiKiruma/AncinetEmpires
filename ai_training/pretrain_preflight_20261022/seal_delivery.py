"""所有可完成工作收尾后封存本次交付身份，明确保留安装及采样阻塞。"""

from datetime import datetime, timezone
import json
from pathlib import Path

from build_data_splits import ROOT, TASK, identity, read


REQUIRED = [
    'PRETRAIN_HANDOFF.md', 'MODEL_REGISTRY.json', 'MODEL_EVALUATION.md',
    'ASSET_MANIFEST.json', 'ASSET_PRESERVATION_RESULT.json',
    'CLEANUP_MANIFEST.json', 'CLEANUP_RESULT.json', 'CLEANUP_REPORT.md',
    'HUMAN_DATA_REPORT.md', 'HUMAN_DATA_INDEX.json', 'HUMAN_DATA_INDEX_FINAL.json',
    'HARD_APK_PREFLIGHT.md', 'HARD_COLLECTOR_DESIGN.md', 'HARD_COLLECTOR_IMPLEMENTATION.md',
    'HARD_COLLECTOR_SELFTEST.json', 'HARD_COLLECTOR_IDENTITY_GATE.json',
    'HARD_SAMPLING_PLAN.json', 'HARD_SAMPLING_SEMANTICS.json',
    'HARD_3000_MANIFEST.json', 'HARD_3000_REPORT.md', 'DATA_SPLITS.json', 'CHECKS.json',
    'evaluation/RESULT.json', 'evaluation/BASELINE_RECOMMENDATION.json',
    'evaluation/CANDIDATE_COVERAGE.json', 'evaluation/consumed-canonical-rule-states.txt.gz',
]


def main():
    target = TASK / 'DELIVERY_MANIFEST.json'
    assert not target.exists(), '正式交付清单存在，拒绝覆盖'
    for name in REQUIRED:
        assert (TASK / name).is_file(), f'缺少交付文件：{name}'
    assert read(TASK / 'evaluation/progress.json')['phase'] == 'complete'
    preservation = read(TASK / 'ASSET_PRESERVATION_RESULT.json')
    assert preservation['passed']
    assert identity(ROOT / 'ai_training/status/CURRENT.md')['sha256'] == preservation['authorizedStatusUpdate']['afterSha256']
    human = read(TASK / 'HUMAN_DATA_INDEX_FINAL.json')
    assert human['dataSplits']['sha256'] == identity(TASK / 'DATA_SPLITS.json')['sha256']
    assert identity(human['finalExclusionReceipt']['path'])['sha256'] == human['finalExclusionReceipt']['sha256']
    splits = read(TASK / 'DATA_SPLITS.json')
    for row in splits['exclusionIndexes']:
        assert identity(row['path'])['sha256'] == row['sha256'], f"排重清单身份变更：{row['path']}"
    hard = read(TASK / 'HARD_3000_MANIFEST.json')
    assert not hard['acceptance_passed'] and not hard['parents']
    tools = [ROOT / 'tools' / name for name in [
        'aeii_download_finished.py', 'aeii_download_history.py',
        'test_aeii_download_history.py', 'aeii_phone_session.py',
    ]]
    tools.extend(path for path in (ROOT / 'tools/phone_training_hard').iterdir()
                 if path.is_file() and path.suffix in ['.py', '.js', '.md'])
    source_identity = {
        'at': datetime.now(timezone.utc).isoformat(),
        'publicAndCollectorTools': [identity(path) for path in sorted(tools)],
        'publicRuntime': read(TASK / 'evaluation/RESULT.json')['runtimeIdentity'],
        'qualification': '新工具最终源码身份；历史运行收据保留其当时源码SHA，不能倒写为当前源码。',
    }
    source_path = TASK / 'TOOL_SOURCE_IDENTITY.json'
    with source_path.open('x', encoding='utf8', newline='\n') as stream:
        json.dump(source_identity, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    files = []
    for path in sorted(TASK.rglob('*')):
        if path.is_symlink() or path.is_junction():
            raise ValueError(f'本次独立交付目录不允许重解析点：{path}')
        if path.is_file() and path != target:
            files.append(identity(path))
    result = {
        'schema': 'pretrain_preflight_delivery_v1',
        'sealedAt': datetime.now(timezone.utc).isoformat(),
        'root': str(TASK), 'overallTaskComplete': False,
        'completedWork': ['模型盘点保全与同条件评测', '可重建缓存清理及删后验证',
                          '真人增量及前缀最终排重', '困难APK静态身份及保留数据升级尝试',
                          '困难采集候选实现与离线验证', '采样预登记与后续训练交接'],
        'uncompletedWork': ['签名兼容的困难APK安装', '困难单局/约20局/并发实机验收',
                            '新增3000困难父局生成、原生重放及项目strict验收'],
        'blocker': 'INSTALL_FAILED_UPDATE_INCOMPATIBLE；当前授权只覆盖保留数据升级',
        'trainingStarted': False, 'fourSecondSearchImplemented': False,
        'newHardNativeParents': 0,
        'requiredFiles': REQUIRED,
        'fileCount': len(files), 'totalFileBytes': sum(row['bytes'] for row in files),
        'files': files,
        'externalStatus': identity(ROOT / 'ai_training/status/CURRENT.md'),
        'checks': read(TASK / 'CHECKS.json'),
        'selfExcludedFromFileList': True,
    }
    with target.open('x', encoding='utf8', newline='\n') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({key: result[key] for key in ['overallTaskComplete', 'fileCount', 'totalFileBytes', 'newHardNativeParents']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
