"""固定八个根局面的2/4/8进程吞吐试验；不是并发棋力评测。"""
import concurrent.futures
import argparse
import json
import subprocess
import time
from pathlib import Path
DIR=Path(__file__).resolve().parent
ROOT=DIR.parents[1]


def one(index):
    start=time.perf_counter()
    r=subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','expert_iteration_2m_20261022/throughput_worker.ts',str(index)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
    assert r.returncode==0,r.stderr
    result=json.loads(r.stdout);result['processWallMs']=(time.perf_counter()-start)*1000;return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='concurrency.json');args=parser.parse_args()
    assert Path(args.output).name==args.output
    target=DIR/args.output;assert not target.exists(),'拒绝覆盖并发试验'
    all_results=[]
    for count in [2,4,8]:
        start=time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:results=list(pool.map(one,range(8)))
        elapsed=time.perf_counter()-start
        result=dict(concurrency=count,wallSeconds=elapsed,nodesPerSecond=sum(r['telemetry']['nodes'] for r in results)/elapsed,meanNodesPerRoot=sum(r['telemetry']['nodes'] for r in results)/8,overBudget=sum(r['telemetry']['overBudget'] for r in results),roots=results)
        all_results.append(result);print(json.dumps({k:v for k,v in result.items() if k!='roots'}),flush=True)
    # 优先保留至少最佳单根工作量60%的配置，再取总吞吐最大者。
    best_work=max(r['meanNodesPerRoot'] for r in all_results)
    eligible=[r for r in all_results if r['meanNodesPerRoot']>=best_work*.6]
    selected=max(eligible,key=lambda r:r['nodesPerSecond'])['concurrency']
    target.write_text(json.dumps(dict(results=all_results,selectedConcurrency=selected,selectionRule='单根节点至少最佳60%，其中总节点吞吐最高；棋力尚未测量'),ensure_ascii=False,indent=2),'utf-8')


if __name__=='__main__':main()
