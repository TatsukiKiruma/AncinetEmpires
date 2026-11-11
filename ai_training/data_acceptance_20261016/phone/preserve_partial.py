"""工具已确认本轮指定重放会话退出后，保留其未封存分片；不终止任何进程。"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import time

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--producer', required=True)
parser.add_argument('--stopped-session', required=True, type=int)
args = parser.parse_args()
if not re.fullmatch(r'full_v6|shard_[a-z]_v6', args.producer):
    raise RuntimeError('只允许本轮命名的单个生产分片')
directory = (HERE/args.producer).resolve()
if not directory.is_relative_to(HERE):
    raise RuntimeError('恢复路径越过phone研究目录')
stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
files = list((directory/'candidate_shards').glob('*.partial'))
files += [p for p in (directory/'candidate_shards').glob('*.jsonl.gz')
          if not (directory/'receipts'/(p.name.split('.')[0]+'.json')).exists()]
moved = []
for file in files:
    before = file.stat()
    time.sleep(0.1)
    after = file.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError('指定分片仍有写入，拒绝移动')
    destination = (directory/'interrupted'/(file.name+'.'+stamp)).resolve()
    if not destination.is_relative_to(directory):
        raise RuntimeError('中断证据目标路径越界')
    destination.parent.mkdir(exist_ok=True)
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    file.rename(destination)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
        raise RuntimeError('保留后字节身份不符')
    moved.append({'from': str(file.relative_to(HERE)), 'to': str(destination.relative_to(HERE)),
                  'sha256': digest, 'bytes': after.st_size})
report = {'observedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
          'producer': args.producer, 'toolConfirmedExitedSession': args.stopped_session, 'moved': moved,
          'scope': '仅本轮已退出会话的未封存候选；数据完整保留，没有删除文件或操作其他进程'}
(directory/('preserved-interruption-'+stamp+'.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
