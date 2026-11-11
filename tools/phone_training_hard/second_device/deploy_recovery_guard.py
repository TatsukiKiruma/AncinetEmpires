"""启动三星本地的限定恢复守护；全部标准流均为手机文件。"""
import json
from pathlib import Path
from device import TASK, call, shell
from prepare_queue import sha


def main():
    out=TASK/'recovery-01';out.mkdir(exist_ok=False)
    source=Path(__file__).with_name('recovery_guard.sh')
    target=out/'recovery_guard.sh';target.write_bytes(source.read_bytes())
    root=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))['remoteRoot']
    remote=root+'/recovery_guard.sh'
    shell('test ! -e '+remote)
    call('push',target,remote)
    assert shell('sha256sum '+remote).split()[0]==sha(target)
    shell('chmod 644 '+remote+'; sh -n '+remote)
    command='setsid sh '+remote+' </dev/null >'+root+'/recovery-guard.log 2>&1 &'
    shell(command)
    (out/'DEPLOYED.json').write_text(json.dumps({'sha256':sha(target),'command':command,'computerRequired':False},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(command)


if __name__=='__main__':
    main()
