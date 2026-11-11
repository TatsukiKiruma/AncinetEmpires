"""并行CPU分片只运行权威项目strict；不是训练工作进程。"""
import json
import subprocess
from phone import HERE, ROOT, write


def main():
    if (HERE / 'USER_STOP_RECEIPT.json').exists():
        raise SystemExit('用户已停止本轮重放，不允许自动继续。')
    processes = []
    for shard in range(6):
        log = (HERE / f'project-shard-{shard}.log').open('ab')
        command = ['node', '--max-old-space-size=640', '--import', 'tsx', str(HERE/'project.ts'), 'all', str(shard), '6']
        process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        processes.append((process, log, command))
    write(HERE/'PROJECT_PROCESS_IDS.json', [{'pid': p.pid, 'command': c} for p,_,c in processes])
    results = []
    for p,log,command in processes:
        results.append({'pid': p.pid, 'returncode': p.wait(), 'command': command})
        log.close()
    write(HERE/'PROJECT_PROCESSES_EXITED.json', results)
    print(json.dumps(results), flush=True)


if __name__ == '__main__':
    main()
