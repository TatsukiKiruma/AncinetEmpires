"""本轮失败后的只读核验和证据汇总，不重跑或放宽门禁。"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = Path('D:/AncientEmpiresData/continuation_stage7_20261108_v1')
def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))
def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
latency, mux, mismatch = read('B_G1_G5.json'), read('B_G2.json'), read('B_G2_FIRST_MISMATCH.json')
assert latency['passed'] and not mux['passed']
frozen = read('PUBLIC_SOURCE_LOCK.json')
assert frozen['sha256'] == 'df20a853edcf031f2ae8da1ae379e3dd84ac3f19d77c0765c0dcacef205cb8d1'
changed = [file for file, digest in frozen['files'].items() if sha(ROOT / file) != digest]
assert not changed
write('FINAL_PUBLIC_SOURCE_CHECK.json', {'checkedAt': now, 'passed': True, 'fileCount': len(frozen['files']),
    'sha256': frozen['sha256'], 'changed': changed, 'phaseARerun': False})
processes = []
scripts = ('hold_awake.py', 'service_v2.py', 'latency_gate.ts', 'mux_gate.ts', 'search_worker.bundle.mjs')
for p in psutil.process_iter(['name', 'cmdline']):
    if p.pid != os.getpid() and (p.info['name'] or '').lower() in ('node.exe', 'python.exe', 'python3.exe'):
        if any(any(a.replace('\\', '/').endswith('/' + script) for script in scripts) for a in (p.info['cmdline'] or [])):
            processes.append({'pid': p.pid, 'name': p.info['name'], 'command': p.info['cmdline']})
assert not processes, processes
write('FINAL_PROCESS_CHECK.json', {'checkedAt': now, 'activeCount': 0, 'processes': [], 'sleepLocksReleased': True,
    'sleepLockPid': 29916, 'sleepLockExitCode': 0, 'scope': '仅本轮所属持锁、GPU服务和Node控制器及工作线程进程',
    'latencyServiceExits': latency['B_G5']['modes'],
    'scanServiceExits': [{'services': s['services'], 'coalesceMs': s['coalesceMs'],
        'exitCodes': [r['exitCode'] for r in s['diagnostics']]} for s in mux['scan']],
    'limitation': '确定性重跑失败分支的逐服务close耗时/退出码未单独持久化；本次进程枚举确认已无残留，不把该分支计为单独通过的退出门。'})
write('SEALED_ACCESS.json', {'checkedAt': now, 'sealedAccess': 0, 'phaseEStarted': False,
    'basis': '只读指定冠军权重、Dev初态和经来源SHA核对的72个Dev根；未读取封存数据或创建训练切入态。'})
differences = []
def compare(a, b, prefix=''):
    if type(a) is not type(b):
        differences.append({'path': prefix, 'type': 'type', 'before': a, 'after': b})
    elif isinstance(a, dict):
        for key in a.keys() | b.keys():
            compare(a.get(key), b.get(key), prefix + '/' + key)
    elif isinstance(a, list):
        if len(a) != len(b):
            differences.append({'path': prefix, 'type': 'length', 'before': len(a), 'after': len(b)})
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, prefix + '/' + str(i))
    elif a != b:
        item = {'path': prefix, 'type': 'value', 'before': a, 'after': b}
        if isinstance(a, (int, float)) and not isinstance(a, bool):
            item['absDiff'] = abs(a - b)
        differences.append(item)
compare(mismatch['reference'], mismatch['actual'])
trajectory = all(a['action'] == b['action'] and a['after'] == b['after'] for a, b in zip(mismatch['reference'], mismatch['actual']))
qdiff = max([abs(a - b) for x, y in zip(mismatch['reference'], mismatch['actual'])
    for a, b in zip(x['teacher']['qValues'], y['teacher']['qValues']) if a is not None and b is not None] or [0])
pdiff = max([abs(a - b) for x, y in zip(mismatch['reference'], mismatch['actual'])
    for a, b in zip(x['teacher']['probabilities'], y['teacher']['probabilities'])] or [0])
write('B_G2_MISMATCH_ANALYSIS.json', {'root': mismatch['root'], 'steps': len(mismatch['reference']),
    'actionsAndStatesIdentical': trajectory, 'maxQDiff': qdiff, 'maxProbabilityDiff': pdiff,
    'maxNumericFieldDiff': max([r.get('absDiff', 0) for r in differences] or [0]),
    'differences': differences, 'criterion': '本轮将估值确定一致实现为逐字段完全相等；未在观察结果后改为容差比较。'})
gates = read('GATES.json')
gates['phaseB']['B-G1'], gates['phaseB']['B-G5'] = latency['B_G1'], latency['B_G5']
gates['phaseB']['B-G2'] = {'passed': False, 'failure': mux['failure'], 'mismatchRoot': mismatch['root'],
    'actionsAndStatesIdentical': trajectory, 'maxQDiff': qdiff, 'maxProbabilityDiff': pdiff}
gates['stopReason'] = 'B-G2逐字段完全一致检查发现估值微差，立即停机；未放宽判据进入后续阶段。'
write('GATES.json', gates)
write('RUN_STATUS.json', {'phase': 'B', 'status': 'stopped_gate_failure', 'activeCount': 0, 'sealedAccess': 0,
    'completedTraceRootsRepeat0': 72, 'completedTraceRootsRepeat1': 1, 'naturalGames': 0})
table = '\n'.join(f"|{r['mode']}|{r['globalMedianMs']:.3f}|{r['b1MeanMedianMs']:.3f}|{r['worstMedianMs']:.3f}|{r['worstP99Ms']:.3f}|" for r in latency['completed'])
scan_table = '\n'.join(f"|{r['services']}|{r['coalesceMs']}|{r['requestsPerSecond']:.3f}|" for r in mux['scan'])
report = f'''# Pre-Stage-7 第三次执行报告

更新时间：{now}。**B-G1、B-G5修复通过；B-G2按本轮逐字段完全一致判据失败，已停机。** Phase C～E未启动，Stage 5 C1仍为正式冠军。sealedAccess=0、activeCount=0。

## 保护与修复

启动及收尾核对PUBLIC_SOURCE_LOCK.json：646个公共文件未变，整体SHA `{frozen['sha256']}`。PHASE_A_SUBSET.passed=true，本轮遵照要求跳过Phase A重跑；既有lint/test/build通过记录保持。attempt1/、before/保留；上一轮Phase B全部根目录文件另存attempt2/。

仅修改stage7训练工作区：关系MLP展平后按262144行分块，保持Linear-ReLU-Linear逐行定义；保留锁页缓存引用，在EOF后释放防休眠锁、刷新输出并os._exit(0)，异常退出保留非零码；对每个尺寸/桶立即检查价值差，失败包含mode/size/batch/row/slot/diff；valueOnly省略动作指针与无用前缀打包。训练工作区TypeScript检查退出0，未修改公共runtime。

## B-G1与B-G5

两个模式均完成11尺寸×9桶×2前向预热及逐行6槽比较，valueLogits最大差均为0。默认模式close约247ms，FAST约300ms，均exitCode=0且forcedTermination=false，满足5秒内自然退出。

按新任务书口径，每模式66单元、每单元100次，记录客户端打包至响应解码的端到端时延：

|模式|66单元中位数的中位数ms|B=1单元中位数均值ms|最差单元中位数ms|最差p99 ms|
|---|---:|---:|---:|---:|
{table}

阈值分别为10/9.5/15/30ms。默认模式通过并锁定；FAST未满足全部时延条件，不选用。判据来自本轮用户任务书，不与上轮9ms最差单元判据混用。性能原始记录在D盘attempt3-latency-*及attempt3-warm-*，没有覆盖旧记录。

## 跨局扫描与B-G2

4个Node工作线程，每线程2个异步任务，共8个负载槽。按请求ID路由至BatchMux，扫描单/双服务及0.5/1/2ms窗口。每组合先72请求预热，再计时288个真实Dev观测请求；包含worker编码与调度。所有扫描服务hardTimeouts=0、lateResponses=0、exitCode=0，无NaN/Inf。

|服务数|窗口ms|实测请求/秒|
|---:|---:|---:|
{scan_table}

最高组合为双服务+2ms，约259.504请求/秒。这只是前向负载基准，不是完整教师根、自然局或教师样本吞吐。scan的物理批和排队统计目前包含预热期，不能误读为纯计时阶段指标。

在该组合上使用Stage 5 C1参数、priorAnchor=0.1、maxNodes=2500、finalists=8和60秒安全上限开展确定性教师检查。适配器只去除墙钟预测裁剪、使用带碰撞核对的S1状态哈希，复用公共候选与反扑规则及castleProductionPenalties，未启用S2/S3/S4。

根来源为speed_bench原36根加新增18个3P和18个4P Dev根，原始来源文件SHA和状态均已核对。每根推进3个真实动作，第一轮72根全部完成（216步）。第二轮首个完成的是root=0，发现数值微差后立即停止并回收其他在途任务；第二轮不能记为72根完成。

首个不一致根：3步动作及后态SHA全部一致；最大教师Q差 `{qdiff}`，最大教师概率差 `{pdiff}`。逐字段差异见B_G2_MISMATCH_ANALYSIS.json。**本轮把“估值确定一致”实现为逐字段完全相等，尚未证明该微差改变选招或棋力；也没有在失败后擅自改用1e-6或1e-4容差放行。** 这是当前停止依据，不能写成大幅数值失真。停止轮服务关闭耗时和退出码未逐项持久化，收尾独立进程枚举确认没有残留。

## 未执行范围与交付

B-G3/B-G4未启动，没有自然完赛局/小时、教师样本/小时或相对Stage 6的端到端加速比。Phase C未启动，无B18及新Dev-54基线；Phase D为0代，无K1/K2训练或晋级；Phase E未启动，sealedAccess保持0，冠军不变。

持锁进程29916正常释放退出0；独立进程核验activeCount=0。公共源码锁、门禁、git前后状态、逐桶检查、时延原始数据、扫描记录、首个不一致根和SHA256清单均已落盘。此次不自动推进后续阶段。
'''
(HERE / 'PRE_STAGE7_REPORT.md').write_text(report, encoding='utf-8')
(HERE / 'STAGE7_REPORT.md').write_text('''# Stage 7 收官状态（本轮停止）

Phase A冻结状态校验通过，未重跑公共检查。B-G1与B-G5通过；B-G2按逐字段完全一致判据发现微小估值差异后立即停机。

首个不一致根三步动作和后态SHA一致，最大Q差7.45e-7、教师概率差6.27e-7。完整72根第一轮通过执行，第二轮仅首根完成，不能宣称确定性门已通过。

B-G3/B-G4与Phase C～E未启动：自然完赛吞吐未测、基线B未重锚、训练0代、封存访问0。正式冠军仍为Stage 5 C1。公共646文件未变、activeCount=0、防休眠锁已释放。

完整指标、判据边界和证据入口见 [PRE_STAGE7_REPORT.md](PRE_STAGE7_REPORT.md)。
''', encoding='utf-8')
before = (HERE / 'git-status-resume3-before.txt').read_text(encoding='utf-8-sig').splitlines()
after = (HERE / 'git-status-resume3-after.txt').read_text(encoding='utf-8-sig').splitlines()
write('GIT_STATUS_COMPARISON_attempt3.json', {'beforeLines': len(before), 'afterLines': len(after),
    'addedStatusLines': sorted(set(after)-set(before)), 'removedStatusLines': sorted(set(before)-set(after)),
    'note': '未跟踪stage7目录内的变化以本轮文件SHA和attempt2源码副本对照。'})
files = [f for f in HERE.iterdir() if f.is_file() and f.name != 'EVIDENCE_MANIFEST.json']
files += [DATA / f'attempt3-{prefix}-{mode}.jsonl' for prefix in ('warm', 'latency') for mode in ('default', 'FAST')]
files += [DATA / name for name in ('attempt3-roots72.json', 'attempt3-mux-results.jsonl')]
write('EVIDENCE_MANIFEST.json', {'createdAt': now, 'sealedAccess': 0,
    'files': [{'path': str(f), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in files if f.exists()],
    'priorEvidence': ['attempt1/EVIDENCE_MANIFEST.json', 'attempt2/EVIDENCE_MANIFEST.json']})
print(json.dumps({'activeCount': 0, 'sealedAccess': 0, 'publicUnchanged': True, 'maxQDiff': qdiff, 'maxProbabilityDiff': pdiff}))
