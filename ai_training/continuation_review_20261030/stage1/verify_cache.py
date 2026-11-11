"""无损寻址副本与原件直读的全部张量逐位一致核验，无GPU前向。"""
import json
import struct
import torch
from runtime import HERE, Encoder, decode, exact, save, sha

requests = json.loads((HERE / 'CACHE_REQUESTS.json').read_text('utf-8'))
encoder = Encoder(HERE / 'cache-encoder.stderr.log')
checked = 0
try:
    with (HERE / 'cache-reference.frames').open('rb') as stream:
        for offset in range(0, len(requests), 8):
            rows = encoder.rows(requests[offset:offset + 8])
            for row in rows:
                ms, bs = struct.unpack('<II', exact(stream, 8))
                expected = decode(json.loads(exact(stream, ms)), exact(stream, bs))[0]
                assert row['source'] == expected['source']
                for key in row:
                    if key != 'source':
                        assert torch.equal(row[key], expected[key]), (checked, key)
                checked += 1
        assert not stream.read(1)
finally:
    encoder.close()
save(HERE / 'CACHE_PARITY.json', dict(passed=True, independentPrestates=checked, tensorsBitwiseEqual=True, referenceSha256=sha(HERE / 'cache-reference.frames'), historicalWholeGameReplay=False))
print(json.dumps(dict(passed=True, independentPrestates=checked)))
