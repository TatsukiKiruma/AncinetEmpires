"""延后首次Java桥接，避开Android9 VM尚未建立主线程组的启动竞态。"""
import json
from device import TASK, call, shell
from prepare_queue import sha


def main():
    out=TASK/'bootstrap-01'; out.mkdir(exist_ok=False)
    plan=json.loads((TASK/'production-03/PLAN.json').read_text(encoding='utf-8'))
    records=[]
    for worker in plan['workers']:
        wid=worker['workerId'];root=worker['remoteRoot']
        source=TASK/'production-03'/wid/'collector.bundle.js'
        text=source.read_text(encoding='utf-8')
        original='}setTimeout(awaitVM,100);return{accepted:true,waitingForJavaVM:true};};'
        assert text.count(original)==1
        text=text.replace(original,'}setTimeout(awaitVM,5000);return{accepted:true,waitingForJavaVM:true};};')
        target=out/(wid+'.bundle.js'); target.write_text(text,encoding='utf-8',newline='\n')
        assert shell('sha256sum '+root+'/collector.bundle.js').split()[0]==sha(source)
        uploaded=root+'/collector.bundle.next.js';call('push',target,uploaded)
        assert shell('sha256sum '+uploaded).split()[0]==sha(target)
        shell('chmod 644 '+uploaded+'; cp '+root+'/collector.bundle.js '+root+'/collector.before-bootstrap-01.js; mv '+uploaded+' '+root+'/collector.bundle.js')
        records.append({'workerId':wid,'oldSha256':sha(source),'newSha256':sha(target),'appliesAt':'下一次本应用进程启动','inFlightRestarted':False,'initialDelayMillis':5000})
    (out/'ROLLOUT.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(records,ensure_ascii=False))


if __name__=='__main__':
    main()
