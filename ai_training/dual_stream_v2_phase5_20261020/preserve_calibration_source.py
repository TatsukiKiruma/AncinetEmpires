"""首轮审计源码保全；补存的文本必须与既存收据SHA完全一致。"""
import hashlib
from run_league import DIR, read, save, sha

audit = read(DIR / 'generations/gen_03/training-attempt01-prior-aware/dev-policy-audit.json')
destination = DIR / 'phase52-audit/attempt01-calibration-source'; destination.mkdir(exist_ok=True)
source = (DIR / 'calibrate_frozen.py').read_text('utf-8').replace('for h in [1, 2, 7, 5, 11]', 'for h in [1, 2, 7, 11]')
source = '\n'.join(line for line in source.split('\n') if not line.strip().startswith("audit['actionHeadContract']"))
assert hashlib.sha256(source.encode()).hexdigest() == audit['sourceIdentity']['calibrate_frozen.py']
(destination / 'calibrate_frozen.py.snapshot').write_bytes(source.encode())
records = {'calibrate_frozen.py': dict(sha256=audit['sourceIdentity']['calibrate_frozen.py'], method='撤销已知头编号修正，摘要与首轮既存收据逐字节一致')}
for name, digest in audit['sourceIdentity'].items():
    if name == 'calibrate_frozen.py': continue
    assert sha(DIR / name) == digest
    (destination / (name + '.snapshot')).write_bytes((DIR / name).read_bytes())
    records[name] = dict(sha256=digest, method='当前文件与首轮摘要相同，直接保全')
save(destination / 'RECOVERY.json', dict(files=records, receipt='generations/gen_03/training-attempt01-prior-aware/dev-policy-audit.json'))
print(dict(preservedSources=len(records)))
