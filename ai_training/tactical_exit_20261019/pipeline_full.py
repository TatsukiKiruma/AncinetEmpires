"""阶段5后半程监督器；浏览器由主代理在所需权限上下文运行后继续。"""
from pathlib import Path
import subprocess,sys,json,time,traceback,hashlib,shutil
from numeric_receipt_valid import numeric_receipt_valid
from device_protocol import reject_pc_games
reject_pc_games()
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;PY=sys.executable
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def phase(text):save('TASK_STATE.json',dict(status='running',complete=False,phase=text))
def run(args,label):
    log=HERE/f'{label}-{int(time.time())}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if r.returncode:raise RuntimeError(f'{log.name} 失败，退出码{r.returncode}')
def py(name,*args):return ['node',str(ROOT/'ai_training/run.mjs'),PY,'-X','utf8','tactical_exit_20261019/'+name,*args]
def ts(name,*args):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/'+name,*args]
def node(name,*args):return ['node',str(ROOT/'ai_training/run.mjs'),'node','tactical_exit_20261019/'+name,*args]
def require(n):
    if not read(n)['passed']:raise RuntimeError(n+' 门禁未通过，保留结果，禁止进入依赖阶段')
def numerical(name):
    if numeric_receipt_valid(HERE,name):return
    if name=='initial':
        archive=HERE/'initial-parity-before-expert';archive.mkdir(exist_ok=True)
        for stem in ['python','numeric','browser','numeric-model']:
            p=HERE/f'{stem}-{name}.json'
            if p.exists() and not (archive/p.name).exists():shutil.copy2(p,archive/p.name)
    run(py('parity.py',name),'parity-'+name);run(ts('gates.ts',name),'numeric-'+name)
    expected=hashlib.sha256((HERE/f'python-{name}.json').read_bytes()).hexdigest()
    save('WAITING_BROWSER.json',dict(name=name,ready=True,pythonSha256=expected))
    while True:
        p=HERE/f'browser-{name}.json'
        if p.exists():
            try:
                r=read(p.name)
                if r.get('passed') and r.get('fileSha256',{}).get(f'python-{name}.json')==expected and r.get('expertBatchChecks',0)>=2 and numeric_receipt_valid(HERE,name):break
            except json.JSONDecodeError:pass
        time.sleep(2)
    save('WAITING_BROWSER.json',dict(name=name,ready=False,passed=True))
try:
    while not (HERE/'prepare-pipeline-exit.json').exists():time.sleep(2)
    require('prepare-pipeline-exit.json');require('data-audit.json')
    if not (HERE/'base-policy-best.json').exists():
        phase('完整720父局策略训练');run(py('train_policy.py','base'),'base-policy-training')
    if not (HERE/'base-policy-final.json').exists():
        phase('五类动作组校准');run(py('calibrate_policy.py','base'),'base-calibration')
    require('teacher-value-evaluation.json')
    phase('初始、教师与根候选提议模型三端完整数值验收');numerical('initial');numerical('teacher');numerical('proposal')
    if not (HERE/'teacher-gate.json').exists():
        phase('教师速度和150槽资格验收');run(ts('speed.ts','teacher'),'teacher-speed');run(ts('model_identities.ts','teacher'),'teacher-identities');run(node('freeze_sources.mjs','teacher'),'teacher-source-freeze')
        run(py('run_battles.py','teacher','play','4'),'teacher-battles');run(py('run_battles.py','teacher','replay','4'),'teacher-replay');run(py('summarize.py','teacher'),'teacher-summary')
    require('teacher-gate.json')
    if not (HERE/'expert-summary.json').exists():
        phase('40局搜索教师在线纠错与严格重放');run(py('assert_teacher_binding.py'),'teacher-session-binding');run(py('run_expert.py','play','4'),'expert-play');run(py('run_expert.py','replay','4'),'expert-replay');run(py('pack_expert.py'),'expert-pack')
    require('expert-summary.json')
    if not (HERE/'distill-policy-best.json').exists():
        phase('一轮全训练分区加专家纠错蒸馏');run(py('train_policy.py','distill'),'distill-training')
    if not (HERE/'distill-policy-final.json').exists():run(py('calibrate_policy.py','distill'),'distill-calibration')
    if not (HERE/'final-model.json').exists():
        phase('蒸馏后极速Value重新训练与校准');run(py('train_value.py','final'),'final-value')
    require('final-value-evaluation.json')
    if not (HERE/'model-final.json').exists():shutil.copy2(HERE/'final-model.json',HERE/'model-final.json')
    phase('最终模型搜索排序尺度按原固定根池校准');run(py('run_search_scale.py','final'),'final-search-scale');require('search-scale/final-calibration.json')
    phase('最终模型三端数值验收');numerical('best')
    if not (HERE/'final-gate.json').exists():
        phase('四臂200槽最终配对验收与100%严格重放');run(ts('speed.ts','final'),'final-speed');run(ts('model_identities.ts','final'),'final-identities');run(node('freeze_sources.mjs','final'),'final-source-freeze')
        run(py('run_battles.py','final','play','4'),'final-battles');run(py('run_battles.py','final','replay','4'),'final-replay');run(py('summarize.py','final'),'final-summary')
    require('final-gate.json');require('final-speed.json')
    phase('最终检查、保全审计与交付');run(ts('standalone_value_parity.ts','best'),'final-standalone-value');run(node('purity_gate.mjs'),'final-purity');run(py('run_checks.py'),'final-checks');run(py('preservation_check.py'),'preservation-check')
    save('pipeline-full-exit.json',dict(passed=True,readyForDelivery=True))
except BaseException as e:
    save('pipeline-full-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()));phase('保留失败现场，等待主代理修复：'+str(e));raise
