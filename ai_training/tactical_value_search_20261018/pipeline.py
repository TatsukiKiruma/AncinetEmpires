"""门禁依赖顺序执行；失败立即保留产物与明确退出收据。"""
from pathlib import Path
import subprocess,sys,time,json,hashlib,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;PY=sys.executable
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def run(args,log,escalated=False):
    path=HERE/log
    with path.open('x',encoding='utf-8') as out:result=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT)
    if result.returncode:raise RuntimeError(f'{log} 失败：{result.returncode}')
def py(name,*args):return ['node',str(ROOT/'ai_training/run.mjs'),PY,'-X','utf8','tactical_value_search_20261018/'+name,*args]
def ts(name,*args):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_value_search_20261018/'+name,*args]
def lanes(mode,count):
    ps=[];flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
    for i in range(count):
        out=(HERE/f'battle-{mode}-{i}.log').open('x',encoding='utf-8')
        ps.append(subprocess.Popen(ts('battle.ts',mode,str(i),str(count)),cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=flags))
    save('battle-processes-'+mode+'.json',[p.pid for p in ps]);codes=[p.wait() for p in ps]
    if any(codes):raise RuntimeError(f'{mode} 子进程失败：{codes}')
try:
    # 本入口不启动手机或外部采集，只等待本阶段预处理。
    afterValue=len(sys.argv)>1 and sys.argv[1]=='after-value'
    if afterValue:
        assert read(HERE/'data-audit.json')['passed'] and read(HERE/'calibration-result.json')['passed'] and read(HERE/'value-evaluation.json')['passed']
        save('TASK_STATE.json',dict(status='running',phase='Value追加门禁通过，继续最终数值与实战',complete=False))
    elif len(sys.argv)>1 and sys.argv[1]=='after-calibration':
        assert read(HERE/'data-audit.json')['passed'] and read(HERE/'calibration-result.json')['passed']
        assert read(HERE/'policy-training.json')['epochs']>0
        save('TASK_STATE.json',dict(status='running',phase='追加校准通过，继续价值训练与验收',complete=False))
    else:
        save('TASK_STATE.json',dict(status='running',phase='480/120父局预处理与封存',complete=False))
        while not (HERE/'contract.json').exists():
            if (HERE/'prepare-exit.json').exists() and not read(HERE/'prepare-exit.json')['passed']:raise RuntimeError('数据生成失败')
            time.sleep(2)
        save('TASK_STATE.json',dict(status='running',phase='策略扩量训练',complete=False))
        run(ts('audit_data.ts'),'audit-data.log')
        run(py('train.py','policy'),'train-policy.log')
        run(py('calibrate.py'),'calibrate.log')
    if not afterValue:
        run(py('evaluate_baselines.py'),'evaluate-baselines.log')
        save('TASK_STATE.json',dict(status='running',phase='价值头训练',complete=False))
        run(py('train.py','value'),'train-value.log')
    run(py('parity.py','best'),'parity-best.log')
    run(ts('gates.ts','numeric','best'),'numeric-best.log')
    # Chrome需要可访问本机loopback的执行上下文；此收据由主代理运行浏览器工具产生。
    save('WAITING_BROWSER.json',dict(model='best',ready=True))
    while not (HERE/'browser-best.json').exists():time.sleep(2)
    assert read(HERE/'browser-best.json')['passed']
    run(py('plan_battles.py'),'plan-battles.log')
    save('TASK_STATE.json',dict(status='running',phase='四臂200槽配对实战',complete=False))
    lanes('play',8);lanes('replay',6)
    run(py('summarize.py'),'summarize.log')
    save('pipeline-exit.json',dict(passed=True))
except BaseException as e:
    save('pipeline-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()))
    save('TASK_STATE.json',dict(status='failed',phase='保留失败现场',complete=False,error=str(e)))
    raise
