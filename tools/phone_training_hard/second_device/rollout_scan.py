"""原子下发无awk的Android9保活扫描，保留上一版和全部在途对局。"""
import json
from pathlib import Path
from device import TASK, call, shell
from prepare_queue import sha


def main():
    out = TASK/'lifecycle-02'; out.mkdir(exist_ok=False)
    source = Path(__file__).with_name('scan_targets.sh')
    target = out/'process_thaw.sh'; target.write_bytes(source.read_bytes())
    previous = TASK/'lifecycle-01/process_thaw.sh'
    plan = json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    records=[]
    for worker in plan['workers']:
        root=worker['remoteRoot']; uploaded=root+'/process_thaw.android9-v2.tmp'
        assert shell('sha256sum '+root+'/process_thaw.sh').split()[0] == sha(previous)
        call('push',target,uploaded)
        assert shell('sha256sum '+uploaded).split()[0] == sha(target)
        shell('chmod 644 '+uploaded+'; sh -n '+uploaded+'; cp '+root+'/process_thaw.sh '+root+'/process_thaw.before-lifecycle-02.sh; mv '+uploaded+' '+root+'/process_thaw.sh')
        records.append({'workerId':worker['workerId'],'oldSha256':sha(previous),'newSha256':sha(target),'inFlightRestarted':False})
    (out/'ROLLOUT.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(records,ensure_ascii=False))


if __name__ == '__main__':
    main()
