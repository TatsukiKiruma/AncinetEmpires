"""按同一固定根池执行模型专属的离线搜索尺度校准。"""
from pathlib import Path
import sys,json,subprocess,concurrent.futures,time,hashlib,traceback
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;MODE=sys.argv[1] if len(sys.argv)>1 else 'final';DATA=HERE/'search-scale'
def read(n):return json.loads((HERE/n).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(n,v):(HERE/n).write_text(json.dumps(v,ensure_ascii=False),encoding='utf-8')
def run(args,label):
    log=DATA/f'{MODE}-{label}-{int(time.time())}.log'
    with log.open('x',encoding='utf-8') as out:r=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    assert r.returncode==0,log.name
def node(n,*a):return ['node',str(ROOT/'ai_training/run.mjs'),'node','tactical_exit_20261019/'+n,*a]
def ts(n,*a):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--import','tsx','tactical_exit_20261019/'+n,*a]
try:
    model=HERE/('teacher-model.json' if MODE=='teacher' else 'model-final.json');modelSha=sha(model)
    protocolPath=read('ACTIVE_SEARCH_PROTOCOL.json')['path'] if (HERE/'ACTIVE_SEARCH_PROTOCOL.json').exists() else 'search_scale_protocol.json'
    if (DATA/f'{MODE}-calibration.json').exists():
        prior=read(f'search-scale/{MODE}-calibration.json');assert prior['passed'] and prior['modelSha256']==modelSha and prior['configSha256']==sha(HERE/'search_prior_config.ts') and prior['protocolSha256']==sha(HERE/protocolPath)
        if MODE=='final':run(ts('rank_score_regression.ts','final'),'rank-score-final')
        raise SystemExit(0)
    assert all(read(f'search-scale/roots-{i}.receipt.json')['passed'] for i in range(4))
    if MODE=='final' and not (DATA/'evaluation-index-final.json').exists():run(ts('search_scale_sources.ts','index','final'),'evaluation-index')
    freeze=f'source-freeze-search-scale-{MODE}.json'
    if not (HERE/freeze).exists():run(node('freeze_sources.mjs','search-scale-'+MODE),'freeze')
    def collect(i):
        receipt=DATA/f'{MODE}-{i}.receipt.json'
        if receipt.exists():
            r=json.loads(receipt.read_text());assert r['passed'] and r['modelSha256']==modelSha;return
        run(ts('collect_search_scale.ts',MODE,str(i)),f'collect-{i}')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(collect,range(4)))
    protocolPath=read('ACTIVE_SEARCH_PROTOCOL.json')['path'] if (HERE/'ACTIVE_SEARCH_PROTOCOL.json').exists() else 'search_scale_protocol.json'
    save(f'search-scale/{MODE}-fit-invocation.json',dict(fitterSha256=sha(HERE/'fit_search_scale.py'),protocolPath=protocolPath,protocolSha256=sha(HERE/protocolPath),modelSha256=modelSha,mode=MODE,startedAt=time.time()))
    run(['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/fit_search_scale.py',MODE,MODE,MODE] if MODE=='final' else ['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-X','utf8','tactical_exit_20261019/fit_search_scale.py',MODE],'fit')
    if MODE=='final':run(ts('rank_score_regression.ts','final'),'rank-score-final')
    save(f'search-scale-{MODE}-exit.json',dict(passed=True,modelSha256=modelSha,calibration=f'search-scale/{MODE}-calibration.json',configSha256=sha(HERE/'search_prior_config.ts')))
except SystemExit:raise
except BaseException as e:save(f'search-scale-{MODE}-exit.json',dict(passed=False,error=str(e),traceback=traceback.format_exc()));raise
