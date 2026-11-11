"""证明编码服务在读取封存测试前态之前拒绝请求。"""
import json
from runtime import HERE, Encoder, save

manifest = json.loads((HERE / 'PARTITIONS.json').read_text('utf-8'))
parent = next(p for p in manifest['parents'] if p['split'] == 'test')
encoder = Encoder(HERE / 'sealed-access.stderr.log')
rejected = False
try:
    encoder.rows([dict(parentId=parent['parentId'], macro=0, sub=0, choice=0, split='test')])
except EOFError:
    rejected = True
finally:
    try:
        encoder.close()
    except RuntimeError:
        pass
assert rejected
save(HERE / 'SEALED_ACCESS_VERIFIED.json', dict(passed=True, rejectedBeforeReadingRaw=True, predictions=0, optimizerUpdates=0))
