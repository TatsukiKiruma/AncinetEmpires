"""治疗边界复核后的续跑；不重开已完成评测，不覆盖任何已生成训练模型。"""
import json,os,subprocess,sys,time
from pathlib import Path
DIR=Path(__file__).resolve().parent
ROOT=DIR.parents[1]
def node(script,*args):return ['node',str(ROOT/'ai_training/run.mjs'),'node','--expose-gc','--import','tsx','dual_stream_v2_phase6_20261022/'+script,*args]
def call(name,args,env=None):
    with (DIR/(name+'.log')).open('x',encoding='utf-8') as log:
        result=subprocess.run(args,cwd=ROOT,env={**os.environ,**(env or {})},stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0,f'{name}失败，保留日志并停止'
    print(json.dumps(dict(completed=name)),flush=True)
def main():
    baseline=ROOT/'deliverables/trained_vs_apk_hard_20261022/phase61-v6r3-hard-slayer'
    while not (baseline/'summary.json').exists():time.sleep(3)
    summary=json.loads((baseline/'summary.json').read_text('utf-8'));assert summary['truncated']==summary['errors']==0 and summary['sourceUnchanged']
    call('phase61-r3-independent',node('verify.ts',str(baseline)))
    (DIR/'runtime-review-complete.json').write_text(json.dumps(dict(baseline=str(baseline),sourceSha256=summary['identity']['sourceManifest']['sha256'],revision='v6-hard-slayer-r3')),encoding='utf-8')
    folders=['deliverables/trained_vs_apk_hard_20261022/'+s for s in ['phase61-v6-hard-slayer','phase61-v6r2-hard-slayer','phase61-v6r3-hard-slayer','phase62-sampling-extended']]
    call('extract-final',node('extract.ts'),dict(PHASE6_DATA_DIRS=json.dumps(folders)))
    call('train-final',['node',str(ROOT/'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase6_20261022/train.py'])
    call('parity-final',node('parity.ts'))
    call('gen05-arena',node('arena.ts'),dict(TRAINED_CANDIDATE='gen05'))
    call('gen05-independent',node('verify.ts',str(ROOT/'deliverables/trained_vs_apk_hard_20261022/gen05-v6-hard-slayer')))
    call('report-final',[sys.executable,'-B','-X','utf8',str(DIR/'report.py')])
    print(json.dumps(dict(completed=True)),flush=True)
if __name__=='__main__':main()
