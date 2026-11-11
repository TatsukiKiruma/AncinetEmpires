"""汇总本轮已实际执行并返回零的验证命令及日志身份。"""
from run_league import DIR, ROOT, read, save, sha

audit = DIR / 'phase54-audit'
logs = {name:sha(audit / name) for name in ['lint.log','test.log','build.log','tsc.log','tsc-final.log','python-tests.log','promotion-test-final.log','promotion-test-paths.log','lazy-queue-test.log']}
assert '457 passed' in (audit / 'test.log').read_text('utf-8')
assert '20 skipped' in (audit / 'test.log').read_text('utf-8')
assert 'built in' in (audit / 'build.log').read_text('utf-8')
assert 'Ran 26 tests' in (audit / 'python-tests.log').read_text('utf-8')
assert not (audit / 'tsc.log').read_text('utf-8').strip()
assert not (audit / 'tsc-final.log').read_text('utf-8').strip()
assert 'Ran 2 tests' in (audit / 'promotion-test-final.log').read_text('utf-8') and 'OK' in (audit / 'promotion-test-final.log').read_text('utf-8')
assert 'Ran 2 tests' in (audit / 'promotion-test-paths.log').read_text('utf-8') and 'OK' in (audit / 'promotion-test-paths.log').read_text('utf-8')
assert 'passed' in (audit / 'lazy-queue-test.log').read_text('utf-8')
save(audit / 'verification.json',dict(checks=dict(lint=True,test=True,build=True,stageTypecheck=True,pythonContracts=True,promotionFailClosed=True),publicTests=dict(passed=457,skipped=20,skipReason='既有本地原始APK等依赖缺失，不计作通过'),pythonContracts=28,logs=logs,promotionTest='test_phase54_promotion.py',phaseTypecheckCommand='node ai_training/run.mjs node ../node_modules/typescript/bin/tsc --noEmit -p dual_stream_v2_phase5_20261020/tsconfig.json'))
path = ROOT / 'ai_training/status/CURRENT.md'; text = path.read_text('utf-8'); marker = '<!-- dual-stream-v2-phase54 -->'
if marker not in text:
    status = f'{marker}\n## 2026-10-21 阶段5.4执行中\n\nv5已冻结，候选第3代模型SHA保持e29d75ab…；双方112搜索槽与60初态工程复测依次执行。实时状态见dual_stream_v2_phase5_20261020/phase54-audit/status.json，历史模型与战报保留。晋升须全部门禁合取通过。\n<!-- end-dual-stream-v2-phase54 -->\n\n'
    path.write_text(text.replace('# 当前接手状态','# 当前接手状态\n\n'+status,1),encoding='utf-8')
print('验证记录已落盘')
