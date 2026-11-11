"""按DATA_SPLITS绑定的永久排重全集过滤候选；保留之前的回放验收证据。"""

import argparse
import gzip
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


HUMAN = Path(__file__).resolve().parent
HASH = re.compile(r'^[0-9a-fA-F]{64}$')
STATE_KEYS = ('canonicalBeforeHash', 'beforeHash', 'sourceBeforeHash', 'currentBeforeHash', 'sourceStateHash', 'ruleStateHash')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def text_bytes(data):
    return (gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data).decode('utf-8-sig')


def collect_hashes(value):
    if isinstance(value, str):
        if not HASH.fullmatch(value):
            raise ValueError('永久排重清单出现非64位状态摘要')
        return {value.lower()}
    if isinstance(value, list):
        result = set()
        for item in value:
            result.update(collect_hashes(item))
        return result
    if isinstance(value, dict):
        if 'hashes' in value:
            return collect_hashes(value['hashes'])
        found = {value[key].lower() for key in STATE_KEYS if isinstance(value.get(key), str) and HASH.fullmatch(value[key])}
        if found:
            return found
    raise ValueError('排重格式须为逐行SHA、SHA数组或带明确状态哈希字段的JSON/JSONL')


def load_hashes(data):
    text = text_bytes(data).strip()
    if not text:
        return set()
    if HASH.fullmatch(text):
        return {text.lower()}
    try:
        return collect_hashes(json.loads(text))
    except json.JSONDecodeError:
        result = set()
        for line in text.splitlines():
            if line.strip():
                result.update(collect_hashes(line.strip() if HASH.fullmatch(line.strip()) else json.loads(line)))
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-splits', type=Path, required=True)
    parser.add_argument('--candidates-manifest', type=Path, default=HUMAN / 'PREFIX_CANDIDATE_MANIFEST.json')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    split_path = args.data_splits.resolve()
    split_bytes = split_path.read_bytes()
    splits = json.loads(split_bytes.decode('utf-8-sig'))
    entries = splits.get('exclusionIndexes')
    if not isinstance(entries, list) or not entries:
        raise ValueError('DATA_SPLITS.exclusionIndexes必须是非空的{path,sha256}清单')
    excluded = set()
    identities = []
    for entry in entries:
        source = Path(entry['path'])
        if not source.is_absolute():
            source = split_path.parent / source
        source = source.resolve()
        raw = source.read_bytes()
        if sha(raw) != entry['sha256']:
            raise ValueError(f'永久排重清单SHA不符：{source}')
        hashes = load_hashes(raw)
        identities.append({'path': str(source), 'sha256': sha(raw), 'uniqueStates': len(hashes)})
        excluded.update(hashes)
    manifest_bytes = args.candidates_manifest.read_bytes()
    manifest = json.loads(manifest_bytes.decode('utf-8-sig'))
    candidate = manifest['candidateRows']
    candidate_path = Path(candidate['path'])
    raw_candidates = candidate_path.read_bytes()
    if sha(raw_candidates) != candidate['sha256']:
        raise ValueError('候选索引SHA不符')
    kept, rejected = [], []
    for line in text_bytes(raw_candidates).splitlines():
        row = json.loads(line)
        matches = [key for key in ('canonicalBeforeHash', 'sourceStateHash') if row[key] in excluded]
        (rejected if matches else kept).append({**row, 'exclusionMatches': matches})
    if len(kept) + len(rejected) != candidate['count']:
        raise ValueError('候选条数与manifest不符')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = (args.output or HUMAN / 'filters' / stamp).resolve()
    if not output.is_relative_to(HUMAN):
        raise ValueError('二次过滤输出必须在本次human目录内')
    output.mkdir(parents=True, exist_ok=False)
    files = {}
    for name, rows in (('admitted', kept), ('excluded', rejected)):
        data = ''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n' for row in rows).encode()
        target = output / f'{name}.jsonl.gz'
        target.write_bytes(gzip.compress(data, mtime=0))
        files[name] = {'path': str(target), 'sha256': sha(target.read_bytes()), 'rows': len(rows)}
    result = {'schema': 'human_prefix_final_exclusion_v1', 'generatedAt': datetime.now(timezone.utc).isoformat(),
              'scriptSha256': sha(Path(__file__).read_bytes()), 'dataSplits': {'path': str(split_path), 'sha256': sha(split_bytes)},
              'candidateManifestSha256': sha(manifest_bytes), 'exclusionIndexes': identities, 'uniqueExcludedStates': len(excluded),
              'candidatePolicyActions': candidate['count'], 'admittedPolicyActions': len(kept), 'excludedPolicyActions': len(rejected),
              'admittedHumanControllerActions': sum(row['humanController'] for row in kept), 'files': files,
              'scope': '最终准入仅对应DATA_SPLITS中实际绑定且SHA核验通过的排重全集；全集完整性由该冻结清单负责',
              'wholeReplayAdmittedParents': 0, 'valueMask': False, 'returnMask': False, 'nativeOutcomeVerified': False}
    (output / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'candidate': candidate['count'], 'admitted': len(kept), 'excluded': len(rejected)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
