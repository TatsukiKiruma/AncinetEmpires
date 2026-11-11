"""同步当前通过门禁及在途阶段，防止历史停机报告被误读为实时状态。"""
import json
from pathlib import Path
HERE = Path(__file__).resolve().parent
gates = json.loads((HERE / 'GATES.json').read_text(encoding='utf-8'))
latency = json.loads((HERE / 'B_G1_G5.json').read_text(encoding='utf-8'))
determinism = json.loads((HERE / 'B_G2.json').read_text(encoding='utf-8'))
assert latency['passed'] and determinism['passed']
gates['phaseB']['B-G1'] = latency['B_G1']
gates['phaseB']['B-G5'] = latency['B_G5']
gates['phaseB']['B-G2'] = {key: determinism[key] for key in ('passed', 'agreement', 'medianProbabilityDiff', 'thresholds')}
gates['phaseB']['B-G3'] = {'status': 'running', 'workload': '12局全座位完整教师搜索自对弈'}
gates['stopReason'] = None
(HERE / 'GATES.json').write_text(json.dumps(gates, ensure_ascii=False, indent=2), encoding='utf-8')
(HERE / 'RUN_STATUS.json').write_text(json.dumps({'phase': 'B', 'status': 'running_selfplay_P1', 'sealedAccess': 0,
    'processCheck': '任务仍在运行，不声明activeCount=0'}, ensure_ascii=False, indent=2), encoding='utf-8')
(HERE / 'PRE_STAGE7_REPORT.md').write_text('''# Pre-Stage-7 当前续跑状态

**正在执行固定12局全座位完整教师搜索自对弈（B-G3）。任务未结束。**

- Phase A：冻结646公共文件未变，既有2160状态子集、lint、564测试及build通过记录保留，本轮未重跑。
- B-G1：通过，采用用户更新后的10/9.5/15/30ms门槛。默认模式全局中位6.804ms、B=1均值6.562ms、最差单元中位11.922ms、p99 14.879ms。
- B-G5：通过。关系MLP按262144行分块，11尺寸×9桶的完整/纯价值逐行6槽差为0。两个Find模式服务均在约247/300ms自然退出，退出码0，无强杀。
- B-G2：**按最初任务明文判据补齐72根单独搜索vs8局负载，72/72选招一致，教师概率最大差中位5.982747686150702e-8，健康门通过。** 上一轮额外添加的逐字段完全相等判据已撤销，历史微差不再阻断任务，证据保留在attempt3/。
- B-G3：正在运行，固定12局（二/三/四人各4局）；逐步事务检查点在D盘throughput-P1/game-*.sqlite，完整局收据追加到throughput-P1-receipts.jsonl。
- B-G4及Phase C～E尚未启动，不填写未测成绩。封存访问保持0，冠军仍为Stage 5 C1。

当前口径见[CONTINUATION_PROTOCOL.md](CONTINUATION_PROTOCOL.md)。通过的详细指标见B_G1_G5.json、B_G2.json；在途进度见B_P1_PROGRESS.json和运行日志。任务结束后再核验进程清零、释放防休眠锁并更新最终报告。
''', encoding='utf-8')
(HERE / 'STAGE7_REPORT.md').write_text('''# Stage 7 当前状态

任务进行中。B-G1、B-G5和原定B-G2已通过，正在完成B-G3的12局完整教师自对弈吞吐测试。后续按门禁继续B-G4、C新基线、D训练及条件式E封存验收。

目前训练0代、sealedAccess=0。过程记录见[PRE_STAGE7_REPORT.md](PRE_STAGE7_REPORT.md)，这不是收官报告。
''', encoding='utf-8')
