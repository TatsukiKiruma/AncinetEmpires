"""只调整第二台既有本地队列，不另起队列，不改变对局数据。"""
import argparse
import datetime as dt
import json
from device import TASK, shell, collection_paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['request','select','status'])
    parser.add_argument('limit',type=int,nargs='?',choices=[1,2,3])
    args = parser.parse_args()
    plan_path, _, active = collection_paths()
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    remote = plan['remoteRoot']
    state = json.loads(shell('cat '+remote+'/STATE.json'))
    if args.mode != 'status':
        assert args.limit is not None
        if args.mode == 'request':
            assert not state['stopIncreasing'] or args.limit <= state['activeLimit'], '已触90%门禁，禁止继续增并发'
            assert args.limit <= state['operatingCeiling']
        filename = 'REQUEST_LIMIT' if args.mode == 'request' else 'SELECTED_LIMIT'
        shell(f'umask 077; printf "{args.limit}\\n" > {remote}/{filename}.tmp; mv {remote}/{filename}.tmp {remote}/{filename}')
        if args.mode == 'select':
            shell(f'umask 077; printf "{args.limit}\\n" > {remote}/REQUEST_LIMIT.tmp; mv {remote}/REQUEST_LIMIT.tmp {remote}/REQUEST_LIMIT; test ! -e {remote}/STRESS_MODE || mv {remote}/STRESS_MODE {remote}/history/STRESS_MODE-finished')
        record = {'utc':dt.datetime.now(dt.timezone.utc).isoformat(),'mode':args.mode,'limit':args.limit,'previousState':state}
        with (TASK/'CONTROL_EVENTS.jsonl').open('a',encoding='utf-8') as stream:
            stream.write(json.dumps(record,ensure_ascii=False)+'\n')
    if active:
        state = {**state, 'humanGameNumbers':active['humanGameNumbers'],
                 'previousCompletedParents':active['previousCompletedParents'],
                 'deviceCompletedTotal':active['previousCompletedParents']+state['doneParents']}
    print(json.dumps(state,ensure_ascii=False))


if __name__ == '__main__':
    main()
