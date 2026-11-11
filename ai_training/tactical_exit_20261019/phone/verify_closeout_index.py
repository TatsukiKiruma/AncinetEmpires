"""独立复核R24停机的全部输入已进入最新专家隔离索引。"""
from pathlib import Path
import datetime
import gzip
import hashlib
import json

HERE = Path(__file__).resolve().parent.parent
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
stop_path = HERE / 'revisions/xiaomi_20261020/20261020T010559/R24_PC_STOP.json'
index_path = HERE / 'search-scale/evaluation-index-r24-pc-stop-20261020.json'
hash_path = HERE / 'search-scale/evaluation-hashes-r24-pc-stop-20261020.txt.gz'
stop, index = read(stop_path), read(index_path)
assert sha(hash_path) == index['hashFileSha256']
with gzip.open(hash_path, 'rt', encoding='utf-8') as handle:
    indexed = set(handle.read().splitlines())
logs = {entry['path']: entry for entry in index['logs']}
actions, distinct = 0, set()
for interrupted, entries in [(False, stop['completed']), (True, stop['interruptedSlots'])]:
    for entry in entries:
        folder = HERE / 'teacher-r24-battles/slots' / entry['slot']
        file = folder / ('actions.strict-prefix.jsonl.gz' if interrupted else 'actions.jsonl.gz')
        indexed_entry = logs[file.relative_to(HERE).as_posix()]
        assert indexed_entry['sha256'] == sha(file)
        with gzip.open(file, 'rt', encoding='utf-8') as handle:
            hashes = [json.loads(line)['beforeHash'] for line in handle]
        assert len(hashes) == (entry['completeLines'] if interrupted else entry['actions'])
        assert all(value in indexed for value in hashes)
        actions += len(hashes)
        distinct.update(hashes)
assert actions == 51280
report = dict(passed=True, stopRecordSha256=sha(stop_path), index=index_path.relative_to(HERE).as_posix(), indexSha256=sha(index_path),
              hashFile=hash_path.relative_to(HERE).as_posix(), isolationProtocolSha256=sha(HERE / 'expert-isolation-protocol.json'),
              completedSlots=85, interruptedSlots=4, coveredActions=actions, distinctR24States=len(distinct),
              missingR24States=0, allHistoricalActions=index['actions'], allHistoricalLogs=len(index['logs']),
              allHistoricalDistinctStates=len(indexed), inputIdentityOnly=True, teacherQualified=False, expertGames=0)
file = HERE / 'revisions/xiaomi_20261020' / ('R24_INDEX_RECEIPT-' + datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f') + '.json')
with file.open('x', encoding='utf-8') as out:
    json.dump(report, out, ensure_ascii=False, indent=2)
print(json.dumps(dict(report, receipt=file.relative_to(HERE).as_posix()), ensure_ascii=False))
