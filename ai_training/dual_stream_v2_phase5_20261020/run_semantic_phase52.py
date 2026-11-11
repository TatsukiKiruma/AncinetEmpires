"""固定语义联合训练后的完整前检，不绕过任何候选门禁。"""
from run_league import DIR, python, read, save

folder = DIR / 'generations/gen_03'
if not (folder / 'semantic-training-complete.json').exists(): python('gen3-semantic-repair.log', 'semantic_repair.py')
python('gen3-semantic-calibration.log', 'calibrate_frozen.py')
audit = read(folder / 'dev-policy-audit.json')
save(DIR / 'pipeline-status.json', dict(stage='semantic_precheck_passed' if audit['passed'] else 'semantic_precheck_failed', generation=3, pids=[], gates=audit['gates'], student=audit['student'], gatesUnchanged=True, candidateArenaSlots=0))
print(dict(passed=audit['passed'], gates=audit['gates'], student=audit['student']))
