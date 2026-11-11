"""同代联合修复与前检协调器；前检不通过时绝不创建正式竞技场。"""
from run_league import DIR, python, read, save

folder = DIR / 'generations/gen_03'
if not (folder / 'joint-training-complete.json').exists(): python('gen3-joint-repair.log', 'joint_repair.py')
python('gen3-joint-calibration.log', 'calibrate_frozen.py')
audit = read(folder / 'dev-policy-audit.json')
save(DIR / 'pipeline-status.json', dict(stage='joint_precheck_passed' if audit['passed'] else 'joint_precheck_failed', generation=3, pids=[], gates=audit['gates'], student=audit['student'], gatesUnchanged=True, candidateArenaSlots=0))
print(dict(passed=audit['passed'], gates=audit['gates'], student=audit['student']))
