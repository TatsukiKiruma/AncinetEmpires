"""只读归档，提取少量原始二进制作为解析器固定样本，不执行APK。"""
import hashlib
import json
from pathlib import Path
import struct
import tarfile

root = Path(__file__).resolve().parent
repo = root.parents[2]
archive = repo / 'captures/phone-storage-1000-20261015/phone-storage-1000-20261015-batch-01.tar'
dest = root / 'fixtures'
dest.mkdir(exist_ok=True)
rows = []
with tarfile.open(archive, 'r:') as stream:
    for member, output in [('s0001/initial.bin', 'initial.bin'), ('s0001/final.bin', 'final.bin'), ('s0001/config.bin', 'config.bin')]:
        payload = stream.extractfile(member).read()
        with (dest / output).open('xb') as handle:
            handle.write(payload)
        rows.append({'member': member, 'output': output, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
    handle = stream.extractfile('s0001/states.bin')
    prefix = handle.read(4)
    length = struct.unpack('>i', prefix)[0]
    if not 0 < length < 2 * 1024 * 1024:
        raise ValueError('帧长无效')
    payload = prefix + handle.read(length)
    if len(payload) != length + 4:
        raise ValueError('归档中的首帧截断')
    with (dest / 'first-frame.bin').open('xb') as output:
        output.write(payload)
    rows.append({'member': 's0001/states.bin', 'range': [0, length + 4], 'output': 'first-frame.bin', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
if sum(row['bytes'] for row in rows) > 2 * 1024 * 1024:
    raise ValueError('fixture超过2MiB')
with (dest / 'manifest.json').open('x', encoding='utf-8') as handle:
    json.dump({'archive': str(archive.relative_to(repo)), 'rows': rows}, handle, ensure_ascii=False, indent=2)
print(json.dumps(rows, ensure_ascii=False))
