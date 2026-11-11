"""Mac分支后继验收的独立路径与只读身份门禁。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
S3 = HERE.parent
ROOT = S3.parents[2]
BASE = Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1')
DATA = BASE / 'acceptance_mac100k_20261031_v1'
sys.path.insert(0, str(S3))
import core


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def now():
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds')


def validate():
    assert core.validate() == 'dc368d953ac1a35e2a7cd1c2ab65272aee063c88fe2bfc65aba3081e0ecb0a6d'
    contract = read(HERE / 'ACCEPTANCE_CONTRACT.json')
    for file, digest in contract['files'].items():
        assert sha(ROOT / file) == digest, file
    for point in read(S3 / 'DEV_CANDIDATES.json')['models'].values():
        for file, digest in point['identities'].items():
            assert sha(file) == digest, file
    return sha(HERE / 'ACCEPTANCE_CONTRACT.json')
