"""独立连接读取现场和进程身份；不驱动游戏循环。"""
from pathlib import Path
import datetime as dt
import json
import re
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import OUT,REMOTE,root,write

def process(pid):
    if not str(pid).isdigit():return None
    stat=root('cat /proc/'+str(pid)+'/stat',check=False)
    if not stat:return {'pid':int(pid),'exitedDuringSnapshot':True}
    fields=stat.rsplit(')',1)[1].split()
    return {'pid':int(pid),'state':fields[0],'ppid':int(fields[1]),'sessionId':int(fields[3]),'tty':int(fields[4]),'startTicks':int(fields[19]),
       'cmdline':root('cat /proc/'+str(pid)+'/cmdline',check=False).replace('\x00',' '),
       'standardStreams':[root('readlink /proc/'+str(pid)+'/fd/'+str(n),check=False) for n in range(3)]}
def main():
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target=OUT/'observations'/stamp;target.mkdir(parents=True)
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    result={'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'phoneState':state,'masterProcess':process(state['masterPid']),'workers':[],
       'resources':root('df -k /data\ndumpsys battery'),'observationGate':root('cat '+REMOTE+'/OBSERVATION_CHECKED.json\ncat '+REMOTE+'/OBSERVATION_BLOCKED_CELLS.tsv',check=False),
       'hostDriverRequired':False,'hostNetworkForwardRequired':False,'physicalUnplugTested':False,'replay':'disabled_by_user'}
    for w in state['workers']:
        s=w['state'];attempt=s.get('attempt','')
        worker={'workerId':w['workerId'],'controller':process(w['controllerPid']),'app':process(s.get('appPid','')),'inject':process(s.get('injectPid',''))}
        if re.fullmatch(r'hc7-mi8-20261027-v1-w0[01]-\d{4}-r\d{4}',attempt):
            p='/data/user/0/'+w['package']+'/files/.aeii-hard-production/'+attempt
            for name in ['STATE.json','initial-state-receipt.json']:
                value=root('cat '+p+'/'+name,check=False)
                if value:
                    try:worker[name]=json.loads(value)
                    except ValueError:worker[name]={'readError':value}
        result['workers'].append(worker)
    write(target/'SNAPSHOT.json',result)
    print(json.dumps({'snapshot':str(target),'doneParents':state['doneParents'],'activeLimit':state['activeLimit'],'workers':[{'id':w['workerId'],'actions':w.get('STATE.json',{}).get('committedActions'),'phase':w.get('STATE.json',{}).get('phase'),'cap':w.get('STATE.json',{}).get('populationLimit')} for w in result['workers']]},ensure_ascii=False))
if __name__=='__main__':main()
