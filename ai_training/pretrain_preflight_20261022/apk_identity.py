"""读取安装包声明、签名证书和困难资源身份，不执行安装。"""
import hashlib
import json
from pathlib import Path
from loguru import logger
logger.remove()
from androguard.core.apk import APK

OUT = Path(__file__).resolve().parent
TARGET = Path('C:/Users/SHIINA/Downloads/aer-4.2.5.1-patch.apk.1')


def inspect(path):
    apk = APK(str(path))
    certificates = sorted({hashlib.sha256(c.dump()).hexdigest() for c in apk.get_certificates()})
    return {'path': str(path.resolve()), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'package': apk.get_package(), 'version_code': apk.get_androidversion_code(),
            'version_name': apk.get_androidversion_name(), 'certificate_sha256': certificates,
            'main_activity': apk.get_main_activity(),
            'hard_runtime_sha256': hashlib.sha256(apk.get_file('assets/hard-ai/runtime.html')).hexdigest()
            if 'assets/hard-ai/runtime.html' in apk.get_files() else None}


if __name__ == '__main__':
    old, new = inspect(OUT / 'installed-before.apk'), inspect(TARGET)
    report = {'installed': old, 'target': new,
              'expected_apk_sha256_matches': new['sha256'] == 'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48',
              'same_package': old['package'] == new['package'],
              'same_certificate': old['certificate_sha256'] == new['certificate_sha256'] and bool(new['certificate_sha256']),
              'version_not_downgrade': int(new['version_code']) >= int(old['version_code'])}
    (OUT / 'APK_IDENTITY.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
