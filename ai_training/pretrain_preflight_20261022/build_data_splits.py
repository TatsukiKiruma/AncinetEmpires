"""绑定历史父局划分、派生关系和本次完整评测排重；不改历史分区。"""

from collections import Counter
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path


TASK = Path(__file__).resolve().parent
ROOT = TASK.parents[1]
TRAINING = ROOT / 'ai_training'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def identity(path):
    path = Path(path).resolve()
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return {'path': str(path), 'sha256': digest.hexdigest(), 'bytes': path.stat().st_size}


def main():
    target = TASK / 'DATA_SPLITS.json'
    if target.exists():
        raise ValueError('正式DATA_SPLITS已存在，禁止覆盖已被过滤收据引用的身份')
    evaluation = TASK / 'evaluation'
    if read(evaluation / 'progress.json')['phase'] != 'complete':
        raise ValueError('全部模型评测完成后才能冻结排重全集')
    result = read(evaluation / 'RESULT.json')
    assert result['total']['runtimeAndAssetsUnchanged']
    assert len(result['preservedHistory']) == 6
    new_plain = gzip.decompress((evaluation / 'consumed-canonical-rule-states.txt.gz').read_bytes())
    assert hashlib.sha256(new_plain).hexdigest() == result['total']['canonicalPlainSha256']
    assert len(new_plain.splitlines()) == result['total']['uniqueCanonicalStates']
    del new_plain
    phase1_path = TRAINING / 'dual_stream_v2_phase1_20261020/split-manifest-v2.json'
    phase3_path = TRAINING / 'dual_stream_v2_phase3_20261020/split-manifest-v2-stage3.json'
    phase6_path = TRAINING / 'dual_stream_v2_phase6_20261022/corpus/manifest.json'
    phase1, phase3, phase6 = map(read, [phase1_path, phase3_path, phase6_path])
    assert phase3['inheritedManifestSha256'] == identity(phase1_path)['sha256']
    inherited = {(row['source'], row['id']): row for row in phase3['parents']}
    assert len(inherited) == len(phase3['parents'])
    for row in phase1['parents']:
        assert inherited[(row['source'], row['id'])] == row
    groups = {}
    for row in inherited.values():
        key = (row['source'], row['group'])
        assert groups.setdefault(key, row['split']) == row['split'], '同父局家族跨分区'

    source = TRAINING / 'data_acceptance_20261016'
    native_path = source / 'phone/release-2026-10-15T21-05-00-859Z/release-index.jsonl'
    replay_path = source / 'replay/policy-release-index.json'
    contracts_path = source / 'SOURCE_SCHEMA_CONTRACTS.json'
    for path, key in [(native_path, 'nativeReleaseIndexSha256'),
                      (replay_path, 'replayReleaseIndexSha256'),
                      (contracts_path, 'sourceContractsSha256')]:
        assert identity(path)['sha256'] == phase3[key], f'历史来源身份变更：{path}'
    segments = []
    for line in native_path.read_text(encoding='utf8').splitlines():
        row = json.loads(line)
        parent = inherited[('native', row['parentId'])]
        segments.append({key: row.get(key) for key in [
            'segmentId', 'parentId', 'globalOffset', 'maxGlobalMacroExclusive',
            'candidateShard', 'shardSha256', 'inputHash', 'sourceIdentity',
            'outcomeKind', 'valueEligible', 'returnEligible', 'valueEvidence'
        ]} | {'historicalReleaseAssignedPartition': row['assignedPartition'],
              'v2InheritedSplit': parent['split'],
              'source': 'old_native_ordinary_ai',
              'independentNewParent': False})
    assert len(segments) == phase3['counts']['nativeSegments']
    assert len({row['parentId'] for row in segments}) == phase3['counts']['nativeParents']

    assets = read(TASK / 'ASSET_MANIFEST.json')
    asset_hashes = {str(Path(row['path']).resolve()): row['sha256'] for row in assets['files']}
    # 未证明历史索引之间的集合包含，必须逐份纳入；坏SHA测试夹具不是实存评测集合。
    indexes, aliases, seen_index_sha = [], [], set()
    for row in assets['protectedEvaluationIndices']:
        if row['indexRole'] != '真实训练排重索引':
            continue
        item = identity(row['path'])
        assert asset_hashes[item['path']] == item['sha256'], '历史排重身份变更'
        if item['sha256'] in seen_index_sha:
            aliases.append(item)
        else:
            indexes.append(item)
            seen_index_sha.add(item['sha256'])
    fixed_dev = identity(TRAINING / 'dual_stream_v2_phase5_20261020/fixed-dev-exclusions.json.gz')
    assert asset_hashes[fixed_dev['path']] == fixed_dev['sha256']
    indexes.extend([fixed_dev, identity(evaluation / 'consumed-canonical-rule-states.txt.gz')])
    alias_path = TRAINING / 'dual_stream_v2_gen02_20261021/fixed-dev-exclusions.json.gz'
    assert identity(alias_path)['sha256'] == fixed_dev['sha256']
    aliases.append(identity(alias_path))
    index_receipts = []
    for phase in ['dual_stream_v2_phase5_20261020', 'dual_stream_v2_gen02_20261021']:
        for name in ['evaluation-exclusion-receipt.json', 'fixed-dev-exclusion-receipt.json']:
            item = identity(TRAINING / phase / name)
            assert asset_hashes[item['path']] == item['sha256']
            index_receipts.append(item)

    consumed_parents = []
    for group in result['standard'] + result['extension']:
        assert group['strict']['passed']
        evidence = {row['path']: row['sha256'] for row in group['strict']['evidence']}
        for game in group['games']:
            identifier = f"{group['source']}/{game['id']}"
            consumed_parents.append({
                'id': identifier, 'source': 'consumed_model_evaluation',
                'panel': group['panel'], 'candidate': group['id'],
                'map': game['mapName'], 'seat': game['seat'], 'seed': game['seed'],
                'initialFileSha256': evidence[f"{game['id']}/initial.json"],
                'actionsSha256': evidence[f"{game['id']}/actions.jsonl"],
                'witnessesSha256': evidence[f"{game['id']}/witnesses.jsonl.gz"],
                'classification': game['classification'], 'cutoff': game['cutoff'],
                'error': game['error'], 'futureSplit': 'permanent_evaluation_exclusion',
                'allDerivedSearchWitnessesSameExclusion': True,
                'historicalResultReused': group['reusedHistorical'],
            })
    histories = []
    for group in result['preservedHistory']:
        assert group['strict']['passed']
        source_dir = Path(group['strict']['source'])
        historical_summary = read(source_dir / 'summary.json')
        assert identity(source_dir / 'summary.json')['sha256'] == group['strict']['summarySha256']
        histories.append({'id': group['id'],
                          'strictReceipt': identity(ROOT / group['evidence'] / 'independent-strict-replay.json'),
                          'games': group['strict']['games'],
                          'parents': [{'id': f"{source_dir.as_posix()}/{game.get('id', game.get('traceFile'))}",
                                       'map': game['mapName'],
                                       'evidenceNamespace': game.get('traceFile', game.get('id'))}
                                      for game in historical_summary['games']],
                          'futureSplit': 'permanent_evaluation_exclusion',
                          'allRecordedDerivativesExcluded': True})

    human = read(TASK / 'HUMAN_DATA_INDEX.json')
    human_parents = []
    for row in human['items']:
        assert row['prefix']['passed'] and not row['prefix']['valueMask']
        assert len(row['bindings']) == 1
        packet = identity(ROOT / row['prefix']['path'])
        assert packet['sha256'] == row['prefix']['sha256']
        human_parents.append({
            'id': row['bindings'][0]['parentKey'], 'source': 'new_human_cloud_replay',
            'binding': row['bindings'][0], 'responseSha256': row['responseSha256'],
            'rawSources': row['sourcePaths'], 'initialSourceStateHash': row['content']['initialStateHash'],
            'prefixPacket': packet, 'atomicActions': row['prefix']['atomicActions'],
            'tailQuarantine': row['prefix']['tailQuarantine'],
            'partition': 'train_policy_candidate_after_permanent_exclusion',
            'wholeReplayAccepted': False, 'independentVersusEntireHistory': None,
            'valueMask': False, 'returnMask': False,
            'derivedPrefixesMustKeepSameParent': True,
        })
    hard = read(TASK / 'HARD_3000_MANIFEST.json')
    assert not hard['parents'], '本次应明确保留安装阻塞，不能将计划充作已采样父局'

    output = {
        'schema': 'pretrain_data_splits_20261022_v1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'script': identity(__file__),
        'qualification': '继承开发分区并追加永久排重；没有独立盲测，不授权启动训练',
        'splitPriority': ['permanent_evaluation_exclusion', 'quarantined_tail',
                          'inherited_parent_split', 'new_human_policy_candidate'],
        'exclusionIndexes': indexes,
        'identicalIndexAliases': aliases,
        'historicalIndexReceipts': index_receipts,
        'protectedHistoricalIndexEvidence': assets['protectedEvaluationIndices'],
        'exclusionSemantics': {
            'matchAnyCanonicalOrSourceStateHash': True,
            'evaluationParentAndAllRecordedDerivativesExcluded': True,
            'newIndexCanonicalStateCount': result['total']['uniqueCanonicalStates'],
            'newIndexPlainSha256': result['total']['canonicalPlainSha256'],
            'limits': '所有评测未落盘的内部搜索节点及预热状态无法精确恢复；只保证实际落盘动作与反扑见证的前后态排重。旧原始V2仅实际轨迹可恢复。历史无API映射真人响应不能证明统计独立。',
        },
        'inherited': {
            'phase1Manifest': identity(phase1_path), 'phase3Manifest': identity(phase3_path),
            'sourceContracts': identity(contracts_path),
            'nativeReleaseIndex': identity(native_path), 'replayReleaseIndex': identity(replay_path),
            'parentsUnchanged': phase3['parents'], 'newReplayEntriesAlreadyInherited': phase3['newReplayEntries'],
            'nativeSegments': segments,
            'counts': phase3['counts'],
            'splitCounts': dict(Counter(row['split'] for row in phase3['parents'])),
        },
        'phase6PreviouslyConsumedCorpus': {
            'manifest': identity(phase6_path),
            'parents': [dict(row, originalSplit='dev' if row['id'] in phase6['devParents'] else 'train',
                             futureSplit='permanent_evaluation_exclusion') for row in phase6['parents']],
            'note': '原phase6已训练身份保持；未来新增训练以本清单永久排重优先，不回写历史。',
        },
        'modelEvaluation': {'result': identity(evaluation / 'RESULT.json'),
                            'plan': identity(TASK / 'EVALUATION_SPLITS.json'),
                            'parents': consumed_parents, 'additionalHistory': histories},
        'newHuman': {'evidenceIndex': identity(TASK / 'HUMAN_DATA_INDEX.json'),
                     'candidateManifest': identity(TASK / 'human/PREFIX_CANDIDATE_MANIFEST.json'),
                     'parents': human_parents,
                     'finalAdmission': '运行human/filter_prefix.py并以其绑定本文件SHA的收据为准；不能直接使用候选数'},
        'newNativeHard': {'manifest': identity(TASK / 'HARD_3000_MANIFEST.json'),
                          'samplingPlan': identity(TASK / 'HARD_SAMPLING_PLAN.json'),
                          'parents': [], 'status': 'blocked_apk_signature_conflict',
                          'plannedParentsAreNotData': True},
    }
    with target.open('x', encoding='utf8', newline='\n') as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'output': str(target), 'inheritedParents': len(inherited),
                      'nativeSegments': len(segments), 'evaluationParents': len(consumed_parents),
                      'humanPrefixParents': len(human_parents), 'newHardParents': 0}))


if __name__ == '__main__':
    main()
