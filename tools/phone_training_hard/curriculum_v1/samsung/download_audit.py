"""只读取回三星结案账本及失败原件，不启动任务或重放。"""
from pathlib import Path
import datetime as dt
import hashlib
import json
import subprocess
import sys
import tarfile
sys.path.insert(0, str(Path(__file__).resolve().parent))
from device import OUT, REMOTE, ADB, DEVICE, shell

def main():
    dest = OUT / ('audit-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    dest.mkdir()
    plan = json.loads((OUT/'production/PLAN.json').read_text(encoding='utf-8'))
    records = []
    def archive(name, command):
        target = dest/(name+'.tar')
        with target.open('xb') as stream:
            p = subprocess.run([ADB, '-s', DEVICE, 'exec-out', command], stdout=stream, stderr=subprocess.PIPE, timeout=1200)
        assert p.returncode == 0, p.stderr
        # 只解包相对普通文件，拒绝链接和越界路径。
        folder = dest/name
        folder.mkdir()
        with tarfile.open(target) as tar:
            for member in tar:
                assert not member.name.startswith('/') and '..' not in Path(member.name).parts
                if not member.isfile():
                    assert member.isdir(), member.name
                    continue
                output = folder/member.name
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(tar.extractfile(member).read())
        records.append({'archive':target.name,'bytes':target.stat().st_size,'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest()})
        print(name, target.stat().st_size, flush=True)
    archive('master', 'tar -C '+REMOTE+' -cf - STATE.json OBSERVATION_CHECKED.json OBSERVATION_BLOCKED_CELLS.tsv OBSERVATION_CELLS.tsv logs history')
    for w in plan['workers']:
        wid = w['workerId']; root = w['remoteRoot']; pkg = w['package']
        archive(wid, 'tar -C '+root+' -cf - STATE.json completed.tsv failure.tsv FINAL_SEQS DONE_SEQS STARTED_ATTEMPTS logs queue-history')
        failures = (dest/wid/'failure.tsv').read_text().splitlines()
        attempts = sorted({line.split('\t')[2] for line in failures if line.strip()})
        existing = set(shell('run-as '+pkg+' ls files/.aeii-hard-production').split())
        present = [a for a in attempts if a in existing]
        (dest/(wid+'-missing-attempts.json')).write_text(json.dumps(sorted(set(attempts)-existing)),encoding='utf-8')
        archive(wid+'-attempts', 'run-as '+pkg+' tar -C files/.aeii-hard-production -cf - '+' '.join(present))
    (dest/'DOWNLOAD.json').write_text(json.dumps({'device':DEVICE,'archives':records,'replay':False,'collectionStarted':False},indent=2),encoding='utf-8')
    print(str(dest),flush=True)

if __name__ == '__main__':
    main()
