"""汇总当前GPU采集路径的V8调用栈；等待采样不冒充CPU执行时间。"""
from collections import Counter
import json
from pathlib import Path

here=Path(__file__).resolve().parent
self_times=Counter();inclusive=Counter()
for file in here.glob('gpu-worker-*.cpuprofile'):
    data=json.loads(file.read_text('utf-8'))
    nodes={n['id']:n for n in data['nodes']}
    parents={child:n['id'] for n in data['nodes'] for child in n.get('children',[])}
    for node,delta in zip(data['samples'],data['timeDeltas']):
        name=nodes[node]['callFrame']['functionName'] or '(anonymous)'
        self_times[name]+=delta
        visited=set()
        while node in nodes:
            name=nodes[node]['callFrame']['functionName'] or '(anonymous)'
            if name not in visited:inclusive[name]+=delta;visited.add(name)
            node=parents.get(node)
run=json.loads((here/'CPU_GPU_PROFILE_RUN.json').read_text('utf-8'))
cpu_seconds=(run['nodeCpu']['user']+run['nodeCpu']['system'])/1e6
report=dict(profile='GPU距离/评分/移动搜索均启用，4worker，21个新开局每局最多50步，含实际压缩写盘',
            nodeProcessCpuSeconds=cpu_seconds,wallSeconds=run['wallSeconds'],meanNodeCpuCores=cpu_seconds/run['wallSeconds'],
            warning='V8采样时间包含阻塞等待及初始化；transfer含Atomics.wait，不可将其全部解释为CPU忙等或据此计算整机CPU百分比。进程CPU时间单独记录。',
            selfSampleSeconds=[dict(function=name,seconds=time/1e6) for name,time in self_times.most_common(30)],
            inclusiveSampleSeconds=[dict(function=name,seconds=time/1e6) for name,time in inclusive.most_common(30)])
(here/'CPU_PROFILE_SUMMARY.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
