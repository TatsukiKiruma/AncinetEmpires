"""从已核验前缀压缩证据导出逐前态候选索引，不重新扫描历史数据。"""

import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


HUMAN = Path(__file__).resolve().parent
ROOT = HUMAN.parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def save_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    main_index = HUMAN.parent / 'HUMAN_DATA_INDEX.json'
    original = main_index.read_bytes()
    index = json.loads(original)
    prefix_index = HUMAN / 'PREFIX_POLICY_INDEX.json'
    prefixes = read_json(prefix_index)
    rows = []
    for source in sorted(prefixes['entries'], key=lambda entry: entry['responseSha256']):
        packet = source['packet']
        packet_path = ROOT / packet['path']
        raw = packet_path.read_bytes()
        if sha(raw) != packet['sha256']:
            raise ValueError('前缀压缩证据SHA不符')
        count = 0
        for line_number, line in enumerate(gzip.decompress(raw).decode().splitlines(), 1):
            record = json.loads(line)
            if record.get('kind') != 'atomic' or not record['prefixPolicyEligible']:
                continue
            if record['valueMask'] or record['returnMask'] or record['nativeOutcomeVerified']:
                raise ValueError('前缀候选意外包含可信Value标签')
            rows.append({
                'responseSha256': source['responseSha256'], 'parentKey': source['parentKey'],
                'atomic': record['atomic'], 'macro': record['macro'], 'subAction': record['subAction'],
                'canonicalBeforeHash': record['beforeHash'], 'sourceStateHash': record['sourceStateHash'],
                'actionCode': record['actionCode'], 'humanController': record['controller']['type'] == 1,
                'packet': {'path': str(packet_path.resolve()), 'sha256': packet['sha256'], 'jsonlLine': line_number},
                'valueMask': False, 'returnMask': False, 'wholeReplayAccepted': False,
            })
            count += 1
        if count != packet['eligiblePolicyActions']:
            raise ValueError('候选行数与前缀核验收据不一致')
    data = ''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n' for row in rows).encode()
    candidate_file = HUMAN / 'PREFIX_CANDIDATE_ROWS.jsonl.gz'
    candidate_file.write_bytes(gzip.compress(data, mtime=0))
    manifest = {
        'schema': 'human_prefix_policy_candidates_v1', 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'script': str(Path(__file__).resolve()), 'scriptSha256': sha(Path(__file__).read_bytes()),
        'replayAdmissionIndexSha256': sha(original), 'prefixIndexSha256': sha(prefix_index.read_bytes()),
        'candidateRows': {'path': str(candidate_file.resolve()), 'sha256': sha(candidate_file.read_bytes()),
                          'count': len(rows), 'humanControllerCount': sum(row['humanController'] for row in rows)},
        'canonicalHashSemantics': 'ruleStateHash：规范JSON的SHA256，排除metadata，保留其他规则字段及数组顺序',
        'sourceStateHashSemantics': '阶段3读取器的SHA256(JSON.stringify(state))，用于兼容旧排重索引',
        'currentExclusionScope': '仅既有阶段3清单登记的已消费状态',
        'finalTrainingAdmission': 'pending_DATA_SPLITS_exclusionIndexes',
        'requiredAdditionalScopes': ['phase4', 'phase5', '独立gen02', 'phase6采样与旧评测', '本轮全部新评测'],
        'valueMask': False, 'returnMask': False,
    }
    save_json(HUMAN / 'PREFIX_CANDIDATE_MANIFEST.json', manifest)
    index['prefixCandidatePreparation'] = manifest
    index['finalTrainingAdmission'] = {'status': 'pending_DATA_SPLITS_exclusionIndexes', 'admittedPolicyActions': None,
                                       'prefixCandidatePolicyActionsAfterStage3Only': len(rows)}
    index['projectOutcomeCountingScope'] = '原counts中的project终局项只统计已准入完整回放；3份前缀均在自然终局前停止'
    save_json(main_index, index)
    report = HUMAN.parent / 'HUMAN_DATA_REPORT.md'
    text = report.read_text(encoding='utf-8')
    text = text.replace('前缀合格策略动作2077', '相对既有阶段3排重的前缀策略候选2077')
    text = text.replace('项目规则非投降终局0组、投降终局0组、未终局前缀0组。',
                        '完整回放准入范围内，项目规则非投降终局0组、投降终局0组；3份已核验策略前缀均在自然终局前停止。')
    note = ('\n2077仅为已登记阶段3排重后的前缀策略候选，最终训练准入待读取DATA_SPLITS.exclusionIndexes，'
            '追加phase4/phase5/独立gen02/phase6采样及旧评测/本轮全部新评测的永久排重全集。'
            '当前不把2077记为最终可训练动作。逐条canonical哈希、旧stateHash及证据压缩包行号见'
            '[候选清单](human/PREFIX_CANDIDATE_MANIFEST.json)；二次过滤命令见[说明](human/README.zh-CN.md)。\n')
    marker = '\n2077仅为已登记阶段3排重后的前缀策略候选'
    if marker not in text:
        text += note
    report.write_text(text, encoding='utf-8')
    print(json.dumps({'candidateRows': len(rows), 'humanControllerRows': manifest['candidateRows']['humanControllerCount'],
                      'finalAdmission': manifest['finalTrainingAdmission']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
