"""按Android9实际服务绑定格式补齐renderer保活，不重启在途对局。"""
import json
from pathlib import Path
from device import TASK, call, shell
from prepare_queue import sha


def main():
    out = TASK/'lifecycle-01'
    out.mkdir(exist_ok=False)
    old = TASK/'production-03/w00/process_thaw.sh'
    source = old.read_text(encoding='utf-8')
    original = 'if (index($0," " main ":" pkg "/" owner "}")>0) client=1'
    assert source.count(original) == 1
    source = source.replace(original,'if (index($0," " main ":" pkg "/" owner "}")>0) {client=1;caller=1}')
    source = source.replace('# 同一ServiceRecord内必须同时出现本包caller、隔离renderer和本次主进程client。','# Android9缺少callerPackage字段；同一ServiceRecord必须精确匹配服务包名、renderer和本次宿主Client绑定。')
    target = out/'process_thaw.sh'
    target.write_text(source,encoding='utf-8',newline='\n')
    plan = json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    records=[]
    for w in plan['workers']:
        root = w['remoteRoot']
        assert shell('sha256sum '+root+'/process_thaw.sh').split()[0] == sha(old)
        uploaded = root+'/process_thaw.android9.tmp'
        call('push',target,uploaded)
        assert shell('sha256sum '+uploaded).split()[0] == sha(target)
        shell('chmod 644 '+uploaded+'; sh -n '+uploaded+'; cp '+root+'/process_thaw.sh '+root+'/process_thaw.before-lifecycle-01.sh; mv '+uploaded+' '+root+'/process_thaw.sh')
        records.append({'workerId':w['workerId'],'oldSha256':sha(old),'newSha256':sha(target),'inFlightRestarted':False})
    (out/'ROLLOUT.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(records,ensure_ascii=False))


if __name__ == '__main__':
    main()
