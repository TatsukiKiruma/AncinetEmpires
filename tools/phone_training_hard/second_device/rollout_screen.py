"""移除采集bootstrap自身的屏幕常亮标志，仍保留CPU部分唤醒锁。"""
import json
from device import TASK, call, shell
from prepare_queue import sha


def main():
    out=TASK/'bootstrap-02';out.mkdir(exist_ok=False)
    plan=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    records=[]
    for worker in plan['workers']:
        wid,root=worker['workerId'],worker['remoteRoot']
        source=TASK/'bootstrap-01'/(wid+'.bundle.js')
        text=source.read_text(encoding='utf-8')
        original="bootActivity.getWindow().addFlags(128); note('keepScreenOn', true);"
        assert text.count(original)==1
        text=text.replace(original,"bootActivity.getWindow().clearFlags(128); note('keepScreenOn', false);")
        target=out/(wid+'.bundle.js');target.write_text(text,encoding='utf-8',newline='\n')
        assert shell('sha256sum '+root+'/collector.bundle.js').split()[0]==sha(source)
        remote=root+'/collector.bundle.screen-next.js';call('push',target,remote)
        assert shell('sha256sum '+remote).split()[0]==sha(target)
        shell('chmod 644 '+remote+'; cp '+root+'/collector.bundle.js '+root+'/collector.before-bootstrap-02.js; mv '+remote+' '+root+'/collector.bundle.js')
        records.append({'workerId':wid,'oldSha256':sha(source),'newSha256':sha(target),'inFlightRestarted':False,'partialWakeLockPreserved':True})
    (out/'ROLLOUT.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    shell('input keyevent 223')
    print(json.dumps(records,ensure_ascii=False))


if __name__=='__main__':
    main()
