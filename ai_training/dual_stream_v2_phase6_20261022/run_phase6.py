"""只执行本轮已授权阶段6依赖流水线；各步独立日志，发现失败立即保留现场。"""
import json,os,subprocess,time,sys
from pathlib import Path
DIR=Path(__file__).resolve().parent
ROOT=DIR.parents[1]
PYTHON=Path(sys.executable)
def call(name,args,env=None):
    with (DIR/(name+'.log')).open('w',encoding='utf-8') as log:
        result=subprocess.run(args,cwd=ROOT,env={**os.environ,**(env or {})},stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0,f'{name}失败，见日志'
    print(json.dumps(dict(completed=name)),flush=True)
def node(script,*args):
    return ['node',str(ROOT/'ai_training/run.mjs'),'node','--expose-gc','--import','tsx','dual_stream_v2_phase6_20261022/'+script,*args]
def main():
    standard=ROOT/'deliverables/trained_vs_apk_hard_20261022/phase61-v6r2-hard-slayer'
    while not (standard/'summary.json').exists(): time.sleep(3)
    summary=json.loads((standard/'summary.json').read_text('utf-8'))
    assert summary['truncated']==summary['errors']==0 and summary['sourceUnchanged']
    call('phase61-r2-independent',node('verify.ts',str(standard)))
    extra='deliverables/trained_vs_apk_hard_20261022/phase62-sampling-extended'
    call('sampling-extended',node('arena.ts'),dict(PHASE6_OUTPUT=extra,PHASE6_MAPS=json.dumps(['(2) Icy Paths.aem','(2) Peak Island.aem','(2) Swamplands.aem']),PHASE6_GOLD_DELTA='50'))
    call('sampling-independent',node('verify.ts',str(ROOT/extra)))
    folders=['deliverables/trained_vs_apk_hard_20261022/phase61-v6-hard-slayer','deliverables/trained_vs_apk_hard_20261022/phase61-v6r2-hard-slayer',extra]
    call('extract',node('extract.ts'),dict(PHASE6_DATA_DIRS=json.dumps(folders)))
    call('train',['node',str(ROOT/'ai_training/run.mjs'),str(PYTHON),'-B','-X','utf8','dual_stream_v2_phase6_20261022/train.py'])
    call('parity',node('parity.ts'))
    call('gen05-arena',node('arena.ts'),dict(TRAINED_CANDIDATE='gen05'))
    call('gen05-independent',node('verify.ts',str(ROOT/'deliverables/trained_vs_apk_hard_20261022/gen05-v6-hard-slayer')))
    call('report',[str(PYTHON),'-B','-X','utf8',str(DIR/'report.py')])
    print(json.dumps(dict(completed=True)),flush=True)
if __name__=='__main__':main()
