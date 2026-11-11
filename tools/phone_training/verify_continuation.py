import gzip
import hashlib
import json
import pathlib
import tarfile

# 独立检查所有已提交检查点的种子、全局动作序号和二进制状态链。
root = pathlib.Path('C:/code/AncinetEmpires/captures/phone-continuation-61-20261015')
state = json.loads((root/'continuation-status.json').read_text(encoding='utf8'))
manifest = json.loads((root/'manifest.json').read_text(encoding='utf8'))
expected = {j['originalId']: dict(offset=j['globalOffset'], sha=j['expected_parent_sha256'], seed=j['seed']) for j in manifest['jobs']}
by_archive = {}
for segment in state['segments']:
    by_archive.setdefault(segment['archive'], []).append(segment)
checked = []
for filename, segments in by_archive.items():
    records = {segment['id']: {} for segment in segments}
    # 顺序读取压缩容器，避免随机定位导致反复解压整个批次。
    with tarfile.open(root/filename, 'r|gz') as archive:
        for member in archive:
            if not member.isfile():
                continue
            ident, name = member.name.split('/', 1)
            if ident not in records:
                continue
            if name in ('initial.bin', 'final.bin'):
                records[ident][name] = hashlib.file_digest(archive.extractfile(member), 'sha256').hexdigest()
            elif name == 'actions.jsonl.gz':
                indices = []
                with gzip.GzipFile(fileobj=archive.extractfile(member)) as actions:
                    for line in actions:
                        action = json.loads(line)
                        indices.append((action['index'], action['global_index'], action['ai_seed']))
                records[ident][name] = indices
        for segment in segments:
            prefix = segment['id']+'/'
            previous = expected[segment['original_id']]
            record = records[segment['id']]
            digest = record['initial.bin']
            assert digest == previous['sha'] == segment['parent_final_sha256'], prefix
            assert segment['global_offset'] == previous['offset'], prefix
            for index, (local_index, global_index, seed) in enumerate(record['actions.jsonl.gz']):
                assert local_index == index and global_index == previous['offset']+index, prefix
                assert seed == previous['seed']+(previous['offset']+index)*104729, prefix
            count = len(record['actions.jsonl.gz'])
            assert count == segment['actions'], prefix
            previous['offset'] += count
            previous['sha'] = record['final.bin']
            checked.append(dict(id=segment['id'], actions=count, final_sha256=previous['sha']))
report = dict(all_equal=True, checked_round=state['round'], segments=len(checked), additional_actions=sum(c['actions'] for c in checked), verified_natural_ends=state['verified_natural_ends'], games=checked)
partial = root/'continuation-chain-verification.json.partial'
partial.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
partial.replace(root/'continuation-chain-verification.json')
print(json.dumps({k:v for k,v in report.items() if k!='games'},ensure_ascii=False))
