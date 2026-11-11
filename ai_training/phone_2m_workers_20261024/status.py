"""只读查询手机本轮任务，进程退出后仍可读取完成回执。"""
import datetime as dt
import json
from pathlib import Path
import shlex
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'phone_2m_scratch100_20261024'))
from device import root, write

PHONE = '/data/local/tmp/aeii-2m-workers-20261024'
ROOTFS = '/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def main():
    script = '''import json,time
from pathlib import Path
p=Path('/bench')
def read(q):
    return json.loads(q.read_text()) if q.is_file() else None
result={'epoch':time.time(),'resource':read(p/'RESOURCE.json'),'controller':read(p/'CONTROLLER_STARTED.json'),'trainer':read(p/'TRAINER_IDENTITY.json'),'exit':read(p/'CONTROLLER_EXIT.json'),'cooldown':read(p/'COOLDOWN.json'),'segments':{}}
for name in ['workers2','workers3']:
    q=p/name
    rows=(q/'PERFORMANCE.jsonl').read_text().splitlines() if (q/'PERFORMANCE.jsonl').exists() else []
    result['segments'][name]={'progress':read(q/'PROGRESS.json'),'complete':read(q/'COMPLETE.json'),'resume':read(q/'RESUME_VERIFIED.json'),'gradient':read(q/'GRADIENT_VERIFIED.json'),'workers':read(q/'WORKERS.json'),'latestPerformance':json.loads(rows[-1]) if rows else None}
for role in ['controller','trainer']:
    r=result[role]
    if r:
        f=Path('/proc')/str(r['pid'])/'stat'
        fields=f.read_text().rsplit(')',1)[1].split() if f.exists() else None
        r['liveIdentityMatched']=bool(fields and int(fields[19])==r['startTicks'] and fields[0] not in ['Z','X'])
        if fields:r.update(ppid=int(fields[1]),sessionId=int(fields[3]),fds=[str((Path('/proc')/str(r['pid'])/'fd'/str(n)).resolve()) for n in range(3)])
print(json.dumps(result))
'''
    result = json.loads(root('chroot ' + ROOTFS + ' /opt/torch-env/bin/python -c ' + shlex.quote(script)))
    result['queriedUtc'] = dt.datetime.now(dt.timezone.utc).isoformat()
    write(HERE / 'LIVE_STATUS.json', result)
    compact = {'resource': result['resource'], 'exit': result['exit'], 'controller': result['controller'], 'trainer': result['trainer']}
    for name, item in result['segments'].items():
        compact[name] = {'progress': item['progress'], 'gradient': item['gradient'], 'latestPerformance': item['latestPerformance']}
    print(json.dumps(compact, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
