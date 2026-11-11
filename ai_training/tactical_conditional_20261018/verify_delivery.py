"""只读复核交付清单、公共源码与历史来源身份，不执行训练。"""
import hashlib
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
def sha(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''):value.update(block)
    return value.hexdigest()
manifest=json.loads((HERE/'DELIVERY_MANIFEST.json').read_text(encoding='utf-8'))
assert manifest['phase']=='complete'
for item in manifest['files']:
    path=(HERE/item['path']).resolve()
    assert path.is_relative_to(HERE) and path.stat().st_size==item['bytes']
    assert sha(path)==item['sha256'],item['path']
for name,digest in manifest['sourceSha256'].items():
    path=(ROOT/name).resolve();assert path.is_relative_to(ROOT)
    assert sha(path)==digest,name
for name,digest in manifest['preservedInputs'].items():assert sha(name)==digest,name
print(json.dumps(dict(passed=True,files=len(manifest['files']),sources=len(manifest['sourceSha256']),preserved=len(manifest['preservedInputs']),bytes=sum(r['bytes'] for r in manifest['files']),manifestSha256=sha(HERE/'DELIVERY_MANIFEST.json')),ensure_ascii=False))
