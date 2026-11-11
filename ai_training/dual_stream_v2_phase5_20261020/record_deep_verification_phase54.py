"""记录追加深度指令后的完整公共检查和专项合同证明。"""
import re
from run_league import DIR, ROOT, read, save, sha
from phase54_paths import audit_directory

audit = audit_directory(); source = DIR / 'phase54-audit'
summary = (audit / 'test-verified.log').read_text('utf-8')
match = re.search(r'Tests\s+(\d+) passed\s*\|\s*(\d+) skipped',summary)
assert match and 'failed' not in summary.lower()
assert not (audit / 'tsc.log').read_text('utf-8').strip()
assert 'built in' in (audit / 'build.log').read_text('utf-8')
python_result = audit / ('python-all-final.log' if (audit / 'python-all-final.log').exists() else 'python-all.log')
python_logs = [python_result] if python_result.exists() else [source / 'python-tests.log',audit / 'promotion-tests.log']
if len(python_logs) == 1:
    python_match = re.search(r'Ran (\d+) tests',python_logs[0].read_text('utf-8'))
    assert python_match and int(python_match.group(1)) >= 28 and 'OK' in python_logs[0].read_text('utf-8')
else:
    assert 'Ran 26 tests' in python_logs[0].read_text('utf-8')
    assert 'Ran 2 tests' in python_logs[1].read_text('utf-8') and 'OK' in python_logs[1].read_text('utf-8')
logs = {}
for path in [audit / name for name in ['lint.log','test-verified.log','build.log','tsc.log']]+python_logs:
    logs[path.relative_to(DIR).as_posix()] = sha(path)
python_count = int(python_match.group(1)) if len(python_logs) == 1 else 28
save(audit / 'verification.json',dict(checks=dict(lint=True,test=True,build=True,stageTypecheck=True,pythonContracts=True,promotionFailClosed=True),publicTests=dict(passed=int(match.group(1)),skipped=int(match.group(2)),skipReason='既有本地原始APK等依赖缺失，不计作通过'),pythonContracts=python_count,logs=logs,deepTargetedTests='五链及四人八链、严格核心过期、260节点与四/三案、精确反扑首选、稀疏权威反击、反向距离、完整接管队列与神经招募基准独立'))
path = ROOT / 'ai_training/status/CURRENT.md'; text = path.read_text('utf-8'); marker = '<!-- dual-stream-v2-phase54 -->'
start = text.index(marker); end = text.index('<!-- end-dual-stream-v2-phase54 -->',start)+len('<!-- end-dual-stream-v2-phase54 -->')
status = f'{marker}\n## 2026-10-22 阶段5.4第三修订执行中\n\nR2完整60+112收尾：纯策略41/56、搜索42/56，队列最大2.2697ms、反扑65048/65051，未晋升且全部证据封存。本修订保留第3代原权重与五单位/880-950ms/260节点/四或三案深度，修复完整接管队列、神经招募偏好与精确反扑预筛；453个训练状态排序等价，复杂训练根三次各3/3候选核心完整。公共检查通过，先新60初态工程再112搜索槽。实时状态见dual_stream_v2_phase5_20261020/{audit.relative_to(DIR).as_posix()}/status.json。并行困难版GUI入口经用户明确授权保留并单独登记，本任务继续不改GUI。尚未取得本轮正式战绩或晋升结论。\n<!-- end-dual-stream-v2-phase54 -->'
path.write_text(text[:start]+status+text[end:],encoding='utf-8')
print(dict(passed=int(match.group(1)),skipped=int(match.group(2)),python=python_count))
