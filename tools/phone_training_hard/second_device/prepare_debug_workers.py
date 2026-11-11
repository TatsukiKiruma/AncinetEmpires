"""生成无root候选隔离副本：只调整manifest身份和调试标志，原始载荷逐项保全。"""
from pathlib import Path
import json
import struct
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import prepare_process_workers as original


def enable_debug(data: bytes) -> bytes:
    chunks, values, offset = [], [], 8
    while offset < len(data):
        kind, header, size = struct.unpack_from('<HHI', data, offset)
        chunks.append((kind, header, data[offset:offset + size]))
        offset += size
    pool_index = next(i for i, c in enumerate(chunks) if c[0] == 1)
    _, header, pool = chunks[pool_index]
    count, styles, flags, start, style_start = struct.unpack_from('<IIIII', pool, 8)
    assert styles == 0 and style_start == 0
    utf8 = bool(flags & 256)
    for location in struct.unpack_from('<' + 'I' * count, pool, header):
        length, position = original.read_length(pool, start + location, utf8)
        if utf8:
            length, position = original.read_length(pool, position, True)
        values.append(pool[position:position + length * (1 if utf8 else 2)].decode('utf-8' if utf8 else 'utf-16le'))
    assert 'debuggable' not in values
    debug_index = len(values)
    values.append('debuggable')
    payload, offsets = bytearray(), []
    for value in values:
        offsets.append(len(payload))
        raw = value.encode('utf-8' if utf8 else 'utf-16le')
        payload.extend(original.write_length(len(value.encode('utf-16le')) // 2, utf8))
        if utf8:
            payload.extend(original.write_length(len(raw), True))
        payload.extend(raw + (b'\0' if utf8 else b'\0\0'))
    payload.extend(b'\0' * (-len(payload) % 4))
    prefix = bytearray(pool[:header])
    struct.pack_into('<IIIII', prefix, 8, len(values), 0, flags & ~1, header + 4 * len(values), 0)
    new_pool = prefix + struct.pack('<' + 'I' * len(offsets), *offsets) + payload
    struct.pack_into('<I', new_pool, 4, len(new_pool))
    chunks[pool_index] = (1, header, bytes(new_pool))
    resource_index = next(i for i, c in enumerate(chunks) if c[0] == 0x180)
    _, rh, resource = chunks[resource_index]
    ids = list(struct.unpack('<' + 'I' * ((len(resource) - rh) // 4), resource[rh:]))
    ids.extend([0] * (debug_index - len(ids)))
    ids.append(0x0101000f)
    new_resource = bytearray(resource[:rh]) + struct.pack('<' + 'I' * len(ids), *ids)
    struct.pack_into('<I', new_resource, 4, len(new_resource))
    chunks[resource_index] = (0x180, rh, bytes(new_resource))
    changed = 0
    for i, (kind, header, chunk) in enumerate(chunks):
        if kind != 0x102 or values[struct.unpack_from('<I', chunk, 20)[0]] != 'application':
            continue
        attr_start, attr_size, attr_count = struct.unpack_from('<HHH', chunk, 24)
        assert attr_size == 20 and struct.unpack_from('<HHH', chunk, 30) == (0, 0, 0)
        location = 16 + attr_start
        attrs = [chunk[location + j * attr_size:location + (j + 1) * attr_size] for j in range(attr_count)]
        attrs.append(struct.pack('<IIIHBBI', values.index('http://schemas.android.com/apk/res/android'), debug_index, 0xffffffff, 8, 0, 0x12, 0xffffffff))
        attrs.sort(key=lambda a: ids[struct.unpack_from('<I', a, 4)[0]] if struct.unpack_from('<I', a, 4)[0] < len(ids) else 0)
        changed_chunk = bytearray(chunk[:location] + b''.join(attrs) + chunk[location + attr_count * attr_size:])
        struct.pack_into('<I', changed_chunk, 4, len(changed_chunk))
        struct.pack_into('<H', changed_chunk, 28, attr_count + 1)
        chunks[i] = (kind, header, bytes(changed_chunk))
        changed += 1
    assert changed == 1
    result = bytearray(data[:8] + b''.join(c[2] for c in chunks))
    struct.pack_into('<I', result, 4, len(result))
    return bytes(result)


def main() -> None:
    out = Path(sys.argv[1]).resolve()
    assert out.is_relative_to(original.ROOT / 'ai_training/hard_native_second_20261023')
    change = original.change_manifest
    def converted(data, package):
        manifest, changes = change(data, package)
        return enable_debug(manifest), {**changes, 'android:debuggable': 'true'}
    original.change_manifest = converted
    original.OUT = out
    original.main()
    # 用独立解析器核对最终manifest，避免仅凭二进制修改成功推断可调试。
    from loguru import logger
    logger.remove()
    from androguard.core.apk import APK
    record = json.loads((out / 'WORKERS.json').read_text(encoding='utf-8'))
    for worker in record['workers']:
        apk = APK(worker['apk'])
        assert apk.get_package() == worker['package']
        assert apk.get_attribute_value('application', 'debuggable') == 'true'
    record['schema'] = 'aeii-debug-manifest-only-process-workers-v1'
    record['rootlessRuntimeVerified'] = False
    (out / 'WORKERS.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
