"""读取本轮已完成门禁、锁定源码和退出证据，汇总失败现场；不启动后继阶段。"""
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
    return hashlib.sha256(file.read_bytes()).hexdigest()

now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
gate = read('B_G1_G5.json')
assert not gate['passed'], '该收尾脚本仅用于失败停机，不提前结束通过后的任务'
frozen = read('PUBLIC_SOURCE_LOCK.json')
changed = [f for f, digest in frozen['files'].items() if sha(ROOT / f) != digest]
write('FINAL_PUBLIC_SOURCE_CHECK.json', {'checkedAt': now, 'passed': not changed,
    'fileCount': len(frozen['files']), 'sha256': frozen['sha256'], 'changed': changed})
processes = []
owned_scripts = ('hold_awake.py', 'service_v2.py', 'latency_gate.ts', 'phase_a_audit.ts')
for p in psutil.process_iter(['name', 'cmdline']):
    if p.pid == os.getpid():
        continue
    if (p.info['name'] or '').lower() in ('node.exe', 'python.exe', 'python3.exe') and any(
        any(a.replace('\\', '/').endswith('/' + script) for script in owned_scripts)
        for a in (p.info['cmdline'] or [])
    ):
        processes.append({'pid': p.pid, 'name': p.info['name'], 'command': p.info['cmdline']})
assert not processes, '本任务仍有在途进程，禁止记为完成'
write('FINAL_PROCESS_CHECK.json', {'checkedAt': now, 'activeCount': len(processes), 'processes': processes,
    'sleepLocksReleased': True, 'sleepLockPid': 17272, 'sleepLockExitCode': 0,
    'serviceExitCodes': gate['B_G5']['modes'], 'scope': '本轮所属持锁、GPU服务、审计和时延进程；未干预其他项目进程'})
gates = read('GATES.json')
gates['phaseB']['B-G1'] = gate['B_G1']
gates['phaseB']['B-G5'] = gate['B_G5']
gates['stopReason'] = 'Phase B：B-G1中位数超标，B-G5价值差非零且服务退出码1；停止后续模式及阶段。'
write('GATES.json', gates)
write('SEALED_ACCESS.json', {'checkedAt': now, 'sealedAccess': 0, 'phaseEStarted': False,
    'basis': '只读Dev初态、Dev轨迹及指定冠军权重；读取清单见PHASE_A_SUBSET和B_G1_G5。未创建训练切入态。'})
write('RUN_STATUS.json', {'phase': 'B', 'status': 'stopped_gate_failure', 'sealedAccess': 0, 'activeCount': 0})
subset = read('PHASE_A_SUBSET.json')
score_rows = []
for mode in gate['completed']:
    worst = max(mode['samples'], key=lambda r: r['medianMs'])
    score_rows.append(f"|{mode['mode']}|{mode['worstMedianMs']:.3f}|{mode['worstP99Ms']:.3f}|{worst['size']} / B={worst['batch']} / valueOnly={worst['valueOnly']}|{mode['valueLogitsMaxDiff']}|{mode['exitCode']}|")
report = f'''# Pre-Stage-7 第二次执行报告

更新时间：{now}。**Phase A 全部通过；Phase B 的 B-G1、B-G5 失败，已停机。** 正式冠军仍为 Stage 5 C1（H1），未启动 Phase C、D、E。首轮停机证据完整保存在 attempt1/，原始源码快照 before/ 未改写。

## Phase A 复验

按本轮授权只修复 env.ts 空目标边界与指定四处旧测试/报告夹具；未放宽 APK 规则。复验 2160 个 Dev 状态通过，20 个状态为真子集，累计移除681个动作；486条历史 strict 不合法动作仅登记。ACTION_HEADS 文件逐字节不变。npm run lint / npm test / npm run build 均退出0；测试564通过、0失败、20跳过。构建仅有原有大块体积提示。

修改文件映射聚合 SHA：`{subset['engineSha256']}`（不是 Git commit）。Phase A 后冻结 src/、tools/、docs/ 共{len(frozen['files'])}文件，冻结清单整体 SHA：`{frozen['sha256']}`。本轮收尾复核未变化：{not changed}。

## Phase B 实现与实测

独立服务 service_v2.py 采用 accurate_reductions(False) 和继承 speed_bench 的G1 FP32前向；不启用BF16或有损搜索。批次按1/2/4/8/16/32/64/128/256分桶，空行结果丢弃；输入使用可复用锁页缓冲区和整批指针映射，输出合并后一次有限性检查及一次CPU回传。独立MIOpen缓存位于指定D盘目录。

全部{len(gate['dimensions'])}种Dev面板地图尺寸 × 9桶 × 2种前向，在默认模式各预热3次。B-G1默认模式66个单元（11尺寸×3小批×2前向），每单元100次请求；计时包含客户端打包、IPC、批次整理、H2D、前向、D2H和响应解码，不包含调用前的游戏观测编码。详细原始时延与预热追加日志在D盘，汇总在B_G1_G5.json。默认模式结束时门禁失败，FAST未启动，不能声称两模式比较已完成。

|模式|最差单元中位数ms|最差单元p99 ms|中位数最差单元|纯价值logits最大差|进程退出码|
|---|---:|---:|---|---:|---:|
{chr(10).join(score_rows)}

JSON的selected={gate.get('selected')}只是唯一已测模式，不是完成对照后的优选结论。B-G1要求每个B≤4单元中位数≤9ms且p99≤30ms，默认模式实测未达标。这里仅证明当前实现未过门，**没有证明是硬件物理极限**。因B-G5数值失败，这些时延也不能作为“无损加速成立”的证据。

B-G5：**失败**。完整/纯价值输出逐行6槽对拍累计最大差为3.5398064851760864，首次在19×19尺寸完成时记录非零；当前日志未细分到具体桶与行，原因未定位，不得归因于G1原始数值合同改变。其余先完成的九种尺寸累计差为0。本轮未另跑value-only观测编码路径的轨迹级回归。

服务正常EOF后未在60秒退出宽限内完成关闭，传输层执行所属进程树回收，最终退出码1；不能记成干净退出0。需要后续诊断正常退出阻塞原因。

本轮控制器还暴露一项执行缺陷：数值最大差在预热时累计，但断言延迟到默认模式全部计时及服务关闭后才检查；因此没有在首次非零差出现时立即停止。该行为不符合即时失败要求，已明确登记，不能包装成严格fail-fast执行。门禁最终失败后没有启动FAST或后续评测，本轮保留代码现场未继续修复。

首次服务启动因accurate_ops导入路径缺失退出，在任何硬件计时前修复，仅改stage7路径配置；日志与异常JSON另存service-startup-attempt1.*。该失败没有硬件测量值，不能当作硬件性能结论。第二次才完成上表实测。

跨局BatchMux及worker请求ID代理代码已准备，**尚未集成验证**。由于B-G1失败，B-G2负载确定性、B-G3完整教师吞吐、B-G4部分根吞吐未运行；单/双服务流水线及0.5/1/2ms合批窗口未进行负载扫描。无实测吞吐倍率、自然局/小时或教师样本/小时，不用旧speed_bench数据冒充本轮结果。

## 后续阶段与收尾

Phase C：未启动，无新基线B/B18。Phase D：0代，无K1/K2及Dev人数拆分成绩。Phase E：未启动，sealedAccess=0。Stage 5 C1权重两份SHA已核对，未改写历史模型或训练资产。

所有本任务Python/Node子进程已退出，activeCount=0；持锁进程17272正常释放退出0。公共源码未变、进程清单、git状态对比、门禁和SHA256证据见同目录JSON。收尾后不自动推进或放宽门禁。
'''
(HERE / 'PRE_STAGE7_REPORT.md').write_text(report, encoding='utf-8')
(HERE / 'STAGE7_REPORT.md').write_text('''# Stage 7 状态

Phase A 已全部通过；Phase B 的 B-G1 端到端中位时延超标，B-G5纯价值前向出现非零差且服务退出码1，均未通过，已停机。FAST对照未启动。

B-G2～B-G4、Phase C～E 均未启动。训练迭代0代，新Dev/Sealed成绩及吞吐倍率均未测。正式冠军仍为Stage 5 C1；sealedAccess=0、activeCount=0，防休眠锁已释放。

详见 [PRE_STAGE7_REPORT.md](PRE_STAGE7_REPORT.md) 和 B_G1_G5.json。首轮失败证据保存在 attempt1/。
''', encoding='utf-8')
before = (HERE / 'git-status-resume-20261108.txt').read_text(encoding='utf-8-sig').splitlines()
after = (HERE / 'git-status-after-attempt2.txt').read_text(encoding='utf-8-sig').splitlines()
write('GIT_STATUS_COMPARISON_attempt2.json', {'beforeLines': len(before), 'afterLines': len(after),
    'addedStatusLines': sorted(set(after)-set(before)), 'removedStatusLines': sorted(set(before)-set(after)),
    'note': '原有修改文件内容变化和未跟踪目录内新增文件不会体现为状态行变化；参见源码锁与补丁。'})
files = [f for f in HERE.iterdir() if f.is_file() and f.name != 'EVIDENCE_MANIFEST.json']
files += [DATA / f'{prefix}-{mode}.jsonl' for prefix in ('warm', 'latency') for mode in ('default', 'FAST')]
entries = [{'path': str(f), 'bytes': f.stat().st_size, 'sha256': sha(f)} for f in files if f.exists()]
write('EVIDENCE_MANIFEST.json', {'createdAt': now, 'files': entries, 'sealedAccess': 0,
    'originalEvidence': 'attempt1/EVIDENCE_MANIFEST.json；before/保持原样'})
print(json.dumps({'publicUnchanged': not changed, 'activeCount': 0, 'sealedAccess': 0, 'files': len(entries)}))
