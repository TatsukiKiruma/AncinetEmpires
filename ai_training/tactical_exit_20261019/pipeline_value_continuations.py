"""等待普通Value续弈全部strict后执行排重与微调；不自动替换教师或启动专家。"""
from pathlib import Path
import subprocess,sys,time,json,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
def state(phase):(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='running',complete=False,phase=phase),ensure_ascii=False),encoding='utf-8')
try:
    gate=HERE/'value-continuation-games-gate.json'
    while not gate.exists():time.sleep(2)
    assert json.loads(gate.read_text())['passed']
    for script,phase in [('pack_value_continuations.py','普通Value续弈全量strict完成，排除开发与评测重叠；专家0'),('train_value_continuations.py','PC微调Value头并保留原头候选；策略冻结，尚未获得教师资格')]:
        state(phase);log=HERE/f'{script}-{time.time_ns()}.log'
        with log.open('x',encoding='utf-8') as out:r=subprocess.run(['node','ai_training/run.mjs',sys.executable,'-X','utf8','tactical_exit_20261019/'+script],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        assert r.returncode==0,log
        print(script,'通过',flush=True)
    result=json.loads((HERE/'value-continuation-fit/evaluation.json').read_text());assert result['passed']
    (HERE/'pipeline-value-continuations-exit.json').write_text(json.dumps(dict(passed=True,improvedSelectionScore=result['improvedSelectionScore'],selectedOriginal=result['selectedOriginal'],teacherNotYetReplaced=True,expertPolicySamples=0)),encoding='utf-8')
    state('Value续弈微调已完成，等待按原质量门禁核对候选；教师尚未替换，专家0')
except BaseException as e:
    (HERE/'pipeline-value-continuations-exit.json').write_text(json.dumps(dict(passed=False,error=str(e),traceback=traceback.format_exc()),ensure_ascii=False),encoding='utf-8');state('Value续弈保留失败现场：'+str(e));raise
