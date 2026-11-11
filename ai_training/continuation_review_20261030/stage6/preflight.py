"""第六阶段身份与环境预检；保留首次失败记录及用户确认的更正依据。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import torch

HERE = Path(__file__).resolve().parent
DATA = Path('D:/AncientEmpiresData/continuation_stage6_20261106_v1')

def main():
    original = json.loads((HERE / 'PREFLIGHT.json').read_text(encoding='utf-8'))
    lock_path = HERE.parent / 'stage3/FINAL_CANDIDATE_LOCK.json'
    locked = json.loads(lock_path.read_text(encoding='utf-8'))['checkpoint']['sha256']
    checks = {}
    for key, row in original['checks'].items():
        with Path(row['path']).open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        expected = locked if key == 'stage3' else row['expected']
        checks[key] = dict(path=row['path'], expected=expected, actual=actual, passed=actual == expected)
    free = shutil.disk_usage('D:/').free
    checks['disk'] = dict(freeBytes=free, passed=free >= 15_000_000_000)
    checks['gpu'] = dict(version=torch.__version__, hip=torch.version.hip, available=torch.cuda.is_available(), passed=bool(torch.version.hip) and torch.cuda.is_available())
    if not all(row['passed'] for row in checks.values()):
        raise RuntimeError('环境或模型预检失败')
    DATA.mkdir(exist_ok=False)
    report = dict(passed=True, checks=checks, sealedAccess=0, trainingUpdates=0,
                  timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  correction={'reason':'执行书中的 Stage 3 SHA256 为61位笔误；用户已明确确认以锁定收据为准',
                              'original':original['checks']['stage3']['expected'], 'corrected':locked,
                              'receipt':str(lock_path)}, dataRoot=str(DATA))
    with (HERE / 'PREFLIGHT_CORRECTED.json').open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main()
