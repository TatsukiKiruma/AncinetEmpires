"""预登记双lane同配置的GC线程对照；正式面板完成前不得执行诊断。"""
import copy
from run_league import DIR, read, save, sha
from phase54_paths import audit_directory

audit = audit_directory(); target = audit / 'gc-threads-comparison'
if (target / 'protocol.json').exists():
    print('GC线程对照已登记，保持原件')
else:
    summary = read(audit / 'engineering60/audit-summary.json'); worst = summary['worstQueue']
    assert worst['ms'] > .5
    plan = read(audit / 'engineering60/plan.json'); slot = next(s for s in plan['slots'] if s['id'] == worst['path'].rsplit('/',1)[-1])
    # 每波两个相同配置进程，才能观察一个进程的盘外GC是否干扰另一个的队列。
    orders = [['parallel','serial'],['serial','parallel'],['parallel','serial']]
    protocol = dict(rounds=3,lanes=2,gamesPerMode=6,orders=orders,sourceWorst=worst,initialHash=slot['initialHash'],seed=slot['seed'],modelSha256=plan['teacherSha256'],runtimeSha256=sha(DIR.parents[1] / 'src/ai_runtime/dual_v2/turn_search_ai.ts'),hypothesis='同进程无GC重叠不排除另一lane的后台GC/内存带宽干扰。对照禁用后台GC任务，利用timeOrigin对齐跨进程区间，不假定假说成立。',singleThreadedGcFlag='--single-threaded-gc',diagnosticOnly=True,doNotRunBeforeFormalCompletion=True)
    save(target / 'protocol.json',protocol)
    for round_index in range(3):
        for mode in ['parallel','serial']:
            for lane in range(2):
                local = copy.deepcopy(plan)
                local['slots'] = [{**slot,'id':slot['id']+f'-gc-threads-{mode}-r{round_index}-l{lane}'}]
                if mode == 'serial': local['executionContract']['nodeArgs'].append('--single-threaded-gc')
                local.update(diagnosticOnly=True,trainingLabelsAdmitted=False,diagnosticProtocolSha256=sha(target / 'protocol.json'))
                save(target / mode / f'round-{round_index}' / f'lane-{lane}' / 'plan.json',local)
    print(dict(slot=slot['id'],ms=worst['ms'],rounds=3,lanes=2,executed=False))
