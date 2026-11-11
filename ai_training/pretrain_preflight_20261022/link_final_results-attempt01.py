"""在完整评测及最终真人过滤后登记引用，保留早期准入索引不变。"""

import argparse
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path

from build_data_splits import TASK, ROOT, identity, read


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--human-result', required=True, type=Path)
    args = parser.parse_args()
    human_result_path = args.human_result.resolve()
    assert human_result_path.is_relative_to(TASK / 'human/filters')
    final_index_path = TASK / 'HUMAN_DATA_INDEX_FINAL.json'
    assert not final_index_path.exists(), '正式准入索引已存在，不覆盖'
    human = read(human_result_path)
    assert human['dataSplits']['sha256'] == identity(TASK / 'DATA_SPLITS.json')['sha256']
    assert human['candidateManifestSha256'] == identity(TASK / 'human/PREFIX_CANDIDATE_MANIFEST.json')['sha256']
    assert human['admittedPolicyActions'] + human['excludedPolicyActions'] == human['candidatePolicyActions']
    assert not human['valueMask'] and not human['returnMask']
    for item in human['files'].values():
        assert identity(item['path'])['sha256'] == item['sha256']
    admitted_rows = [json.loads(line) for line in gzip.decompress(Path(human['files']['admitted']['path']).read_bytes()).decode('utf8').splitlines()]
    assert len(admitted_rows) == human['admittedPolicyActions']
    unique_admitted_states = len({row['canonicalBeforeHash'] for row in admitted_rows})
    assert unique_admitted_states == len(admitted_rows), '最终前缀内存在重复规则态，须另行审计'
    evaluation = read(TASK / 'evaluation/RESULT.json')
    recommendation_path = TASK / 'evaluation/BASELINE_RECOMMENDATION.json'
    recommendation = read(recommendation_path)
    assert read(TASK / 'evaluation/progress.json')['phase'] == 'complete'
    registry_path = TASK / 'MODEL_REGISTRY.json'
    original = TASK / 'MODEL_REGISTRY-before-evaluation.json'
    if not original.exists():
        original.write_bytes(registry_path.read_bytes())
    registry = read(original)
    plan = read(TASK / 'EVALUATION_SPLITS.json')
    packages = {str((ROOT / row['source']).resolve()): row for row in plan['candidates']}
    for model in registry['models']:
        candidate = packages.get(str(Path(model['weightsPath']).parent.resolve()))
        if candidate is None:
            continue
        assert model['weightsSha256'] == candidate['modelSha256']
        groups = [row for row in evaluation['standard'] + evaluation['extension'] if row['id'] == candidate['id']]
        model['currentRuntimeEvaluation'] = {
            'candidateId': candidate['id'],
            'completeStrategyPackage': candidate,
            'result': identity(TASK / 'evaluation/RESULT.json'),
            'panels': [{key: row[key] for key in ['panel', 'wins', 'losses', 'draws', 'truncated', 'errors', 'reusedHistorical', 'source', 'evidence']}
                       for row in groups],
            'note': '比较归属于此完整校准/父模型组合，不自动转移给同SHA但配套不同的包。',
        }
    registry['evaluation'] = {
        'linkedAt': datetime.now(timezone.utc).isoformat(),
        'inventoryBeforeEvaluation': identity(original),
        'plan': identity(TASK / 'EVALUATION_SPLITS.json'),
        'result': identity(TASK / 'evaluation/RESULT.json'),
        'report': identity(TASK / 'MODEL_EVALUATION.md'),
        'candidateCoverage': identity(TASK / 'evaluation/CANDIDATE_COVERAGE.json'),
        'baselineRecommendation': identity(recommendation_path),
        'recommendation': recommendation,
        'noModelsDeleted': True,
    }
    write(registry_path, registry)

    final_index = {
        'schema': 'human_pretrain_final_admission_v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'originalEvidenceIndexUnmodified': identity(TASK / 'HUMAN_DATA_INDEX.json'),
        'finalExclusionReceipt': identity(human_result_path),
        'downloadedResponses': 3, 'uniqueResponses': 3, 'provedApiParents': 3,
        'independentNewParentsVersusEntireHistory': None,
        'forcedPassed': 2, 'wholeStrictPassed': 0,
        'candidatePolicyActions': human['candidatePolicyActions'],
        'admittedPolicyActions': human['admittedPolicyActions'],
        'excludedPolicyActions': human['excludedPolicyActions'],
        'admittedHumanControllerActions': human['admittedHumanControllerActions'],
        'admittedUniqueCanonicalStates': unique_admitted_states,
        'uniqueExcludedStates': human['uniqueExcludedStates'],
        'policyFiles': human['files'], 'dataSplits': human['dataSplits'],
        'valueMask': False, 'returnMask': False, 'reliableNaturalTerminalParents': 0,
        'qualification': '只准入合法前缀中的合格策略动作；隔离尾段、全局strict和自然结果各自独立，未授权训练。',
    }
    write(final_index_path, final_index)
    report = TASK / 'HUMAN_DATA_REPORT.md'
    with report.open('a', encoding='utf8') as stream:
        stream.write('\n## 完整永久排重后的最终策略准入\n\n')
        stream.write(f"最终保留{human['admittedPolicyActions']}条策略动作，其中真人控制{human['admittedHumanControllerActions']}条；")
        stream.write(f"候选{human['candidatePolicyActions']}条中排除{human['excludedPolicyActions']}条。")
        stream.write(f"本次实际绑定并核验的永久排重全集共有{human['uniqueExcludedStates']}个唯一状态摘要。\n\n")
        stream.write('最终索引为`HUMAN_DATA_INDEX_FINAL.json`，包含逐行来源、过滤收据和DATA_SPLITS摘要。')
        stream.write('早期`HUMAN_DATA_INDEX.json`及运行收据按原样保留，其候选数不单独作为最终训练准入。')
        stream.write('可靠自然终局父局仍为0，Value/return仍关闭；未证明相对全部历史统计独立。\n')
    print(json.dumps({'registry': str(registry_path), 'humanFinalIndex': str(final_index_path),
                      'admittedPolicyActions': human['admittedPolicyActions']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
