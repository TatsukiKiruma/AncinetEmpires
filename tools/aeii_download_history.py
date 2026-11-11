"""核验下载历史，只将仍存在且摘要一致的响应用于增量跳过。"""

import hashlib
import json
from pathlib import Path


def verified_history(reports, host):
    known = {}
    for filename in reports:
        filename = Path(filename)
        report = json.loads(filename.read_text(encoding='utf-8-sig'))
        if report.get('host') != host:
            continue
        # 恢复多次时，上一尝试已经跳过的本地来源也须继续保留。
        for entry in report.get('downloads', []) + report.get('skipped_verified_history', []):
            recorded = Path(entry.get('source', ''))
            source = recorded if recorded.is_absolute() else filename.parent / entry['file']
            if source.is_file() and hashlib.sha256(source.read_bytes()).hexdigest() == entry['sha256']:
                known[entry['id']] = {**entry, 'source': str(source.resolve()),
                                      'report': str(filename.resolve())}
    return known


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)
