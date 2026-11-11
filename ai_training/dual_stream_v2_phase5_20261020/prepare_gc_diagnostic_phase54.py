"""预登记首个已证实失败工程槽的三次配对GC诊断，不按诊断战绩选配置。"""
import copy
from run_league import DIR, read, save, sha
from phase54_paths import audit_directory

audit = audit_directory(); diagnostic = audit / 'gc-comparison'
if (diagnostic / 'protocol.json').exists():
    print('GC诊断已登记，保留原计划')
else:
    summary = read(audit / 'engineering60/audit-summary.json'); worst = summary['worstQueue']
    assert worst['ms'] > .5
    slot_id = worst['path'].rsplit('/',1)[-1]
    plan = read(audit / 'engineering60/plan.json'); slot = next(s for s in plan['slots'] if s['id'] == slot_id)
    protocol = dict(repetitions=3,sourceWorst=worst,initialHash=slot['initialHash'],seed=slot['seed'],runtimeRevision=plan['runtimeRevision'],modelSha256=plan['teacherSha256'],pairedModes=['direct','yield'],concurrency=2,changes='仅yieldBeforeDecision开关；两组模型、初态、seed、深度预算和Node参数相同；不按战绩选型，不计正式SLA')
    save(diagnostic / 'protocol.json',protocol)
    for mode in protocol['pairedModes']:
        target = copy.deepcopy(plan)
        target['slots'] = [{**slot,'id':slot['id']+f'-gc-{mode}-{i}'} for i in range(3)]
        target['executionContract']['yieldBeforeDecision'] = mode == 'yield'
        target.update(diagnosticOnly=True,trainingLabelsAdmitted=False,diagnosticProtocolSha256=sha(diagnostic / 'protocol.json'))
        save(diagnostic / mode / 'plan.json',target)
    print(dict(slot=slot_id,ms=worst['ms'],repetitions=3,pairedModes=protocol['pairedModes']))
