"""封装手机本地自主启动器；原APK的DEX、困难HTML和资源均保持原字节。"""
from pathlib import Path
import base64
import copy
import datetime as dt
import json
import struct
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_debug_workers import enable_debug, original as api
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID

TASK = api.ROOT / 'ai_training/hard_native_second_20261023'


def main():
    out = TASK / 'gadget-workers-01'
    out.mkdir(exist_ok=False)
    assert api.digest(api.SOURCE.read_bytes()) == api.EXPECTED
    gadget = (TASK / 'deps/libaeiigadget.so').read_bytes()
    provenance = json.loads((TASK / 'deps/GADGET.json').read_text())
    assert api.digest(gadget) == provenance['librarySha256']
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'AEII second device collectors')])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - dt.timedelta(days=1))
            .not_valid_after(now + dt.timedelta(days=3650)).sign(key, hashes.SHA256()))
    records = []
    with zipfile.ZipFile(api.SOURCE) as source:
        originals = {e.filename: api.digest(source.read(e)) for e in source.infolist()
                     if not e.is_dir() and e.filename != 'AndroidManifest.xml' and not api.is_signature(e.filename)}
        for slot in range(1, 4):
            package = f'net.toyknight.aeii.worker{slot + 10:02d}'
            manifest, changes = api.change_manifest(source.read('AndroidManifest.xml'), package)
            manifest = enable_debug(manifest)
            native = 'lib/arm64-v8a/'
            wrap = '#!/system/bin/sh\n# 仅在本采集副本进程中加载本地脚本。\n'
            wrap += 'export LD_PRELOAD="${0%/*}/libaeiigadget.so"\nexec "$@"\n'
            config = {'interaction': {'type': 'script', 'path': f'/data/user/0/{package}/files/collector.bundle.js', 'on_change': 'ignore'}, 'runtime': 'qjs'}
            added = {native + 'libaeiigadget.so': gadget, native + 'wrap.sh': wrap.encode(), native + 'libaeiigadget.config.so': json.dumps(config).encode()}
            entries = [(copy.copy(e), manifest if e.filename == 'AndroidManifest.xml' else source.read(e))
                       for e in source.infolist() if not api.is_signature(e.filename)]
            for name, value in added.items():
                info = zipfile.ZipInfo(name, (2026, 10, 23, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100755 << 16
                entries.append((info, value))
            dest, sections = out / f'worker{slot + 10:02d}.apk', []
            with zipfile.ZipFile(dest, 'x') as archive:
                for entry, payload in entries:
                    archive.writestr(entry, payload)
                    if not entry.is_dir():
                        sections.append(api.manifest_line('Name', entry.filename) + api.manifest_line('SHA-256-Digest', base64.b64encode(hashes_digest(payload)).decode()) + b'\r\n')
                mf = b'Manifest-Version: 1.0\r\nCreated-By: AEII local collector\r\n\r\n' + b''.join(sections)
                sf = b'Signature-Version: 1.0\r\nCreated-By: AEII local collector\r\n'
                sf += api.manifest_line('SHA-256-Digest-Manifest', base64.b64encode(hashes_digest(mf)).decode()) + b'\r\n'
                for section in sections:
                    lines, names = section.split(b'\r\n'), []
                    for line in lines:
                        if not names or line.startswith(b' '):
                            names.append(line)
                        else:
                            break
                    sf += b'\r\n'.join(names) + b'\r\n' + api.manifest_line('SHA-256-Digest', base64.b64encode(hashes_digest(section)).decode()) + b'\r\n'
                signature = pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(cert, key, hashes.SHA256()).sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary, pkcs7.PKCS7Options.NoAttributes])
                for name, payload in [('META-INF/MANIFEST.MF', mf), ('META-INF/WORKER.SF', sf), ('META-INF/WORKER.RSA', signature)]:
                    archive.writestr(name, payload)
            with zipfile.ZipFile(dest) as archive:
                assert {name: api.digest(archive.read(name)) for name in originals} == originals
                assert set(archive.namelist()) - set(source.namelist()) == set(added) | {'META-INF/WORKER.SF', 'META-INF/WORKER.RSA'}
            records.append({'slot': slot, 'package': package, 'apk': str(dest), 'sha256': api.digest(dest.read_bytes()), 'originalPayloadEntries': len(originals), 'manifestChanges': {**changes, 'android:debuggable': 'true'}, 'addedEntries': {name: api.digest(v) for name, v in added.items()}})
    record = {'schema': 'aeii-second-local-gadget-workers-v1', 'sourceApk': str(api.SOURCE), 'sourceSha256': api.EXPECTED, 'gadget': provenance, 'originalPayloadSha256': originals, 'workers': records, 'aiPayloadModified': False, 'runtimeVerified': False, 'privateSigningKeyPersisted': False}
    (out / 'WORKERS.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'directory': str(out), 'workers': records}, ensure_ascii=False))


def hashes_digest(value):
    return bytes.fromhex(api.digest(value))


if __name__ == '__main__':
    main()
