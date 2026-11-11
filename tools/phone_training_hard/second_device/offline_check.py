"""核对第二段的路由、编号、原始载荷保全和本地守护配置。"""
import collections
import json
from pathlib import Path
import py_compile
import zipfile
from device import TASK, DEVICE, ROOT
from prepare_queue import sha


def main():
    out = TASK/'production-03'
    plan = json.loads((out/'PLAN.json').read_text(encoding='utf-8'))
    segment = json.loads((TASK/'SEGMENT_PLAN.json').read_text(encoding='utf-8'))
    assert plan['device'] == DEVICE and segment['globalZeroBasedRange'] == [1000,2000]
    assert len(segment['jobs']) == 1000 and set(segment['quota'].values()) == {125}
    jobs = []
    for worker in plan['workers']:
        local = out/worker['workerId']
        assert b'\r' not in (local/'attempt-prefix.txt').read_bytes()
        assert b'\r' not in (local/'inject-path.txt').read_bytes()
        script = (local/'controller.sh').read_text(encoding='utf-8')
        assert 'test "$SEQ" -ge 1001 && test "$SEQ" -le 2000' in script
        assert 'run-as "$PACKAGE" sh -c "test -f $OUT/artifact-manifest.json && test -f $OUT/THREAD_EXITED.json"' in script
        assert 'stop_owned "$CHILD" "$CHILD_START" inject' not in script
        assert 'run-as "$PACKAGE" cat "$OUT/STATE.json"' in script
        bundle = (local/'collector.bundle.js').read_text(encoding='utf-8')
        assert 'if(!Java.available){setTimeout(awaitVM,100)' in bundle
        assert 'Java.deoptimizeEverything' not in bundle and '.implementation =' not in bundle
        for file in (local/'configs').glob('*.json'):
            config = json.loads(file.read_text(encoding='utf-8'))
            assert config['installedApkSha256'] == worker['sha256'] and config['populationLimit'] == 30
            assert config['planSha256'] == sha(TASK/'SEGMENT_PLAN.json')
            jobs.append(config['job'])
    assert sorted(j['index'] for j in jobs) == list(range(1001,2001))
    assert len({j['parentId'] for j in jobs}) == 1000 and len({j['seed'] for j in jobs}) == 1000
    assert collections.Counter(j['map'] for j in jobs) == segment['quota']
    master = (out/'master/master.sh').read_text(encoding='utf-8')
    assert 'test "${CPU%.*}" -ge 90' in master and 'test "${CPU%.*}" -lt 75' in master
    assert 'STOP_INCREASING=1' in master and 'RECOVERY_TARGET=$ACTIVE_LIMIT' in master
    assert 'test "$META_OWNER" = 2000' in master and 'SELECTED_LIMIT' in master
    records = json.loads((TASK/'gadget-workers-01/WORKERS.json').read_text(encoding='utf-8'))
    for worker in records['workers']:
        assert sha(worker['apk']) == worker['sha256']
        with zipfile.ZipFile(worker['apk']) as apk:
            for name,digest in records['originalPayloadSha256'].items():
                import hashlib
                assert hashlib.sha256(apk.read(name)).hexdigest() == digest
    for path in Path(__file__).parent.glob('*.py'):
        py_compile.compile(str(path),doraise=True)
    result = {'passed':True,'device':DEVICE,'parents':1000,'range':[1000,2000],'originalPayloadEntriesVerifiedPerWorker':462,'workers':3,'planSha256':sha(out/'PLAN.json')}
    (TASK/'OFFLINE_CHECK.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    main()
