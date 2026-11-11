"""生成仅安装身份不同的采集进程副本，困难AI及其余资源逐项保持原始字节。"""

from __future__ import annotations

import base64
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import struct
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('C:/Users/SHIINA/Downloads/aer-4.2.5.1-patch.apk.1')
EXPECTED = 'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48'
ORIGINAL_PACKAGE = 'net.toyknight.aeii.android'
OUT = ROOT / 'ai_training/hard_native_1000_20261022/concurrency-20261022/process-workers-01'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_length(data: bytes, offset: int, utf8: bool) -> tuple[int, int]:
    if utf8:
        value = data[offset]
        return (((value & 127) << 8) | data[offset + 1], offset + 2) if value & 128 else (value, offset + 1)
    value = struct.unpack_from('<H', data, offset)[0]
    return (((value & 32767) << 16) | struct.unpack_from('<H', data, offset + 2)[0], offset + 4) if value & 32768 else (value, offset + 2)


def write_length(value: int, utf8: bool) -> bytes:
    if utf8:
        return bytes([128 | (value >> 8), value & 255]) if value >= 128 else bytes([value])
    return struct.pack('<HH', 32768 | (value >> 16), value & 65535) if value >= 32768 else struct.pack('<H', value)


def change_manifest(data: bytes, package: str) -> tuple[bytes, dict[str, str]]:
    kind, header_size, total_size = struct.unpack_from('<HHI', data)
    assert kind == 3 and total_size == len(data)
    offset, chunks, changes = header_size, [], {}
    while offset < len(data):
        chunk_type, chunk_header, chunk_size = struct.unpack_from('<HHI', data, offset)
        chunk = data[offset:offset + chunk_size]
        if chunk_type == 1:
            count, style_count, flags, strings_start, styles_start = struct.unpack_from('<IIIII', chunk, 8)
            utf8 = bool(flags & 256)
            positions = struct.unpack_from('<' + 'I' * count, chunk, chunk_header)
            values = []
            for position in positions:
                location = strings_start + position
                length, location = read_length(chunk, location, utf8)
                if utf8:
                    byte_length, location = read_length(chunk, location, True)
                    value = chunk[location:location + byte_length].decode('utf-8')
                else:
                    value = chunk[location:location + 2 * length].decode('utf-16le')
                replacement = value
                # 类名继续指向原DEX；只改变包身份、推送权限/类别及provider权限域。
                if value == ORIGINAL_PACKAGE or value.startswith(ORIGINAL_PACKAGE + '.permission.') or value == ORIGINAL_PACKAGE + '.firebaseinitprovider':
                    replacement = package + value[len(ORIGINAL_PACKAGE):]
                elif value == 'android.intent.category.LAUNCHER':
                    replacement = 'net.toyknight.aeii.collector.INTERNAL'
                if replacement != value:
                    changes[value] = replacement
                values.append(replacement)
            assert ORIGINAL_PACKAGE in changes
            offsets, payload = [], bytearray()
            for value in values:
                offsets.append(len(payload))
                raw16 = value.encode('utf-16le')
                if utf8:
                    raw8 = value.encode('utf-8')
                    payload.extend(write_length(len(raw16) // 2, True) + write_length(len(raw8), True) + raw8 + b'\0')
                else:
                    payload.extend(write_length(len(raw16) // 2, False) + raw16 + b'\0\0')
            payload.extend(b'\0' * (-len(payload) % 4))
            new_start = chunk_header + 4 * (count + style_count)
            prefix = bytearray(chunk[:chunk_header])
            style_offsets = chunk[chunk_header + 4 * count:chunk_header + 4 * (count + style_count)]
            style_payload = chunk[styles_start:] if styles_start else b''
            # 字符池已经改写，取消排序标志；所有XML节点仍引用原有字符串索引。
            struct.pack_into('<IIIII', prefix, 8, count, style_count, flags & ~1, new_start, new_start + len(payload) if styles_start else 0)
            chunk = bytes(prefix) + struct.pack('<' + 'I' * count, *offsets) + style_offsets + bytes(payload) + style_payload
            prefix = bytearray(chunk)
            struct.pack_into('<I', prefix, 4, len(chunk))
            chunk = bytes(prefix)
        chunks.append(chunk)
        offset += chunk_size
    prefix = bytearray(data[:header_size])
    result = bytes(prefix) + b''.join(chunks)
    struct.pack_into('<I', prefix, 4, len(result))
    return bytes(prefix) + b''.join(chunks), changes


def manifest_line(name: str, value: str) -> bytes:
    raw = (name + ': ' + value).encode('utf-8')
    lines = [raw[:70]]
    raw = raw[70:]
    while raw:
        lines.append(b' ' + raw[:69])
        raw = raw[69:]
    return b'\r\n'.join(lines) + b'\r\n'


def is_signature(name: str) -> bool:
    upper = name.upper()
    return upper.startswith('META-INF/') and (upper == 'META-INF/MANIFEST.MF' or upper.endswith(('.SF', '.RSA', '.DSA', '.EC')))


def main() -> None:
    assert digest(SOURCE.read_bytes()) == EXPECTED
    OUT.mkdir(parents=True, exist_ok=False)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'AEII local collection workers')])
    now = dt.datetime.now(dt.timezone.utc)
    certificate = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
                   .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
                   .not_valid_after(now + dt.timedelta(days=3650)).sign(key, hashes.SHA256()))
    records = []
    with zipfile.ZipFile(SOURCE) as source:
        original_payload = {entry.filename: digest(source.read(entry)) for entry in source.infolist() if not entry.is_dir() and entry.filename != 'AndroidManifest.xml' and not is_signature(entry.filename)}
        for index in range(1, 4):
            package = f'net.toyknight.aeii.worker{index:02d}'
            modified_manifest, changes = change_manifest(source.read('AndroidManifest.xml'), package)
            destination = OUT / f'worker{index:02d}.apk'
            sections = []
            with zipfile.ZipFile(destination, 'x') as archive:
                for entry in source.infolist():
                    if is_signature(entry.filename):
                        continue
                    payload = modified_manifest if entry.filename == 'AndroidManifest.xml' else source.read(entry)
                    archive.writestr(copy.copy(entry), payload)
                    if not entry.is_dir():
                        sections.append(manifest_line('Name', entry.filename) + manifest_line('SHA-256-Digest', base64.b64encode(hashlib.sha256(payload).digest()).decode()) + b'\r\n')
                mf = b'Manifest-Version: 1.0\r\nCreated-By: AEII local collector\r\n\r\n' + b''.join(sections)
                sf = b'Signature-Version: 1.0\r\nCreated-By: AEII local collector\r\n'
                sf += manifest_line('SHA-256-Digest-Manifest', base64.b64encode(hashlib.sha256(mf).digest()).decode()) + b'\r\n'
                for section in sections:
                    # Name可能分行，直接复用完整Name段，避免重编码文件名。
                    lines = section.split(b'\r\n')
                    name_lines = [lines[0]]
                    for line in lines[1:]:
                        if line.startswith(b' '): name_lines.append(line)
                        else: break
                    sf += b'\r\n'.join(name_lines) + b'\r\n' + manifest_line('SHA-256-Digest', base64.b64encode(hashlib.sha256(section).digest()).decode()) + b'\r\n'
                signature = pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(certificate, key, hashes.SHA256()).sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary, pkcs7.PKCS7Options.NoAttributes])
                archive.writestr('META-INF/MANIFEST.MF', mf)
                archive.writestr('META-INF/WORKER.SF', sf)
                archive.writestr('META-INF/WORKER.RSA', signature)
            with zipfile.ZipFile(destination) as archive:
                actual = {name: digest(archive.read(name)) for name in original_payload}
                assert actual == original_payload
            records.append({'slot': index, 'package': package, 'activity': ORIGINAL_PACKAGE + '.AndroidLauncher', 'apk': str(destination), 'sha256': digest(destination.read_bytes()), 'manifestChanges': changes, 'unchangedPayloadEntries': len(original_payload), 'aiDexSha256': original_payload['classes.dex'], 'hardHtmlSha256': original_payload['assets/hard-ai/runtime.html']})
    record = {'schema': 'aeii-manifest-only-process-workers-v1', 'createdUtc': now.isoformat(), 'sourceApk': str(SOURCE), 'sourceSha256': EXPECTED, 'originalInstalledApkUnchanged': True, 'certificateSha256': certificate.fingerprint(hashes.SHA256()).hex(), 'privateSigningKeyPersisted': False, 'workers': records, 'unchangedOriginalPayloadSha256': original_payload}
    (OUT / 'WORKERS.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'workers': [{k: r[k] for k in ('slot', 'package', 'sha256', 'unchangedPayloadEntries')} for r in records], 'directory': str(OUT)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
