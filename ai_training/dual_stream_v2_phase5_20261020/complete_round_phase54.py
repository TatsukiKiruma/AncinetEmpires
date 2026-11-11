"""整轮审计结束后保存报告快照，登记用户要求的停止边界，不启动任何后续任务。"""
import shutil
from datetime import datetime, timezone
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from phase54_paths import audit_directory

audit = audit_directory(); summary = read(audit / 'gate-summary.json')
assert read(audit / 'status.json')['stage'] in ['quality_unmet','promoted']
assert read(audit / 'post-evaluation-isolation.json')['passed']
assert read(audit / 'preservation.json')['passed']
assert (audit / 'stop-after-round-request.json').exists()
assert all(read(audit / arm / 'audit-summary.json')['complete'] for arm in ['engineering60','champion-search-arena','candidate-search-arena'])
verify_runtime_contract()
target = audit / 'completion-snapshot'
assert not target.exists(), '停止快照只能写出一次，不能覆盖历史'
target.mkdir()
files = {name:DIR / name for name in ['REPORT.md','BATTLES.md','gate-summary.json','RUNTIME_REVISION.json','league-state.json','dual-v2-champion.json']}
files['CURRENT.md'] = ROOT / 'ai_training/status/CURRENT.md'
for name,source in files.items(): shutil.copyfile(source,target / name)
state = read(DIR / 'league-state.json')
assert sha(DIR / 'dual-v2-champion.bin') == state['championSha256']
receipt = dict(stoppedAt=datetime.now(timezone.utc).isoformat(),request=read(audit / 'stop-after-round-request.json'),completed=dict(engineering=60,championSearch=56,candidateSearch=56),promoted=summary['promoted'],pureWins=summary['pureWins'],searchWins=summary['searchWins'],panelComparison=summary['panelComparison'],counts=summary['counts'],queueMax=summary['queueMax'],failedGates=[name for name,value in summary['gates'].items() if not value],championGeneration=state['championGeneration'],championSha256=state['championSha256'],coordinatorExitCode=0,postExitCode=0,exitCodeEvidence='两条exec会话均已实际返回exit_code=0后登记',nextRoundStarted=False,snapshots={name:sha(target / name) for name in files},gateSummarySha256=sha(audit / 'gate-summary.json'),runtimeFreezeSha256=sha(audit / 'runtime-freeze.json'))
save(audit / 'round-stopped.json',receipt)
print(dict(stopped=True,promoted=summary['promoted'],pureWins=summary['pureWins'],searchWins=summary['searchWins'],championGeneration=state['championGeneration']))
