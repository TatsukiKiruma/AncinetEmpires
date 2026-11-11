"""有界顺序执行第三阶段；成功后自动完成唯一封存验收及报告，失败立即停。"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback
from core import HERE, STAGE1, ROOT, DATA, legacy, torch, read, save, validate
from finish import candidates, select, parity_reference, report


def main():
    started=time.perf_counter()
    validate()
    receipts=DATA/'pipeline-receipts';receipts.mkdir(exist_ok=True)
    for folder in ['miopen-db','miopen-cache']:
        (DATA/folder).mkdir(exist_ok=True)
    def command(name,args,timeout):
        receipt=receipts/(name+'.json')
        if receipt.exists():
            r=read(receipt)
            if r['returncode']==0 and r['contractSha256']==validate():
                return
            raise ValueError('已有失败命令须先排查，不自动重复：'+name)
        save(DATA/'PIPELINE_STATUS.json',dict(step=name,status='running',pid=os.getpid(),seconds=time.perf_counter()-started))
        tick=time.perf_counter()
        with (receipts/(name+'.stdout.log')).open('xb') as out,(receipts/(name+'.stderr.log')).open('xb') as err:
            p=subprocess.run(['node',str(ROOT/'ai_training/run.mjs'),*args],cwd=ROOT,stdout=out,stderr=err,
                timeout=timeout,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        save(receipt,dict(returncode=p.returncode,seconds=time.perf_counter()-tick,command=args,contractSha256=validate()))
        if p.returncode:
            raise RuntimeError('阶段步骤失败，已停止后继：'+name)
    def py(name,script,extra=None,timeout=1800):
        command(name,[sys.executable,'-X','utf8',str(HERE/script),*(extra or [])],timeout)
    def arena(name,prefix,out,split,scale):
        command(name,['node','--import','tsx',str(HERE/'arena.ts'),str(prefix),str(out),split,str(scale)],7200)
    base=ROOT/'ai_training/phone_2m_continue414_20261027/completion/job/output/final'
    reuse=read(HERE/'BASELINE_REUSE.json')
    for file,record in reuse['files'].items():
        if legacy.sha(file)!=record['sha256'] or legacy.sha(record['source'])!=record['sha256']:
            raise ValueError('复用基线原件或副本身份不符')
    save(DATA/'BASELINE_REUSED.json',dict(source=reuse,repeatedGames=0,repeatedForwards=0,contractSha256=validate()))
    bridge=read(HERE/'PERFORMANCE_REVISION.json')
    py('formal-training','train.py',['--resume',bridge['checkpoint']['file']],timeout=44000)
    if read(DATA/'training/RESULT.json')['stopReason']=='explicit_stop':
        save(DATA/'PIPELINE_STATUS.json',dict(status='stopped',reason='explicit_stop',pid=os.getpid(),finalTestRuns=0))
        return
    points=candidates()
    for u in points:
        for scale in [.3,1.]:
            arena(f'dev-{u:05d}-prior-{scale}',DATA/f'training/model-{u:05d}',DATA/f'dev-{u:05d}-prior-{scale}','dev',scale)
    lock=select()
    torch.set_num_threads(2)
    parity_reference()
    command('export-parity',['node','--import','tsx',str(HERE/'parity.ts'),str(DATA/'best/final')],600)
    if not read(HERE/'EXPORT_PARITY.json')['passed']:
        raise ValueError('跨语言权重导出未通过')
    arena('historical-final',DATA/'best/final',DATA/'historical-final','historical',lock['candidate']['priorScale'])
    # 一次性占用最终验收，不允许失败后静默重跑或利用测试结果重选。
    attempt=DATA/'FINAL_TEST_ATTEMPT.json'
    if attempt.exists():
        raise ValueError('封存最终验收已占用，禁止重复')
    save(attempt,dict(candidateLockSha256=legacy.sha(HERE/'FINAL_CANDIDATE_LOCK.json'),status='started',
        models=[str(base),str(DATA/'best/final')],testRunsAuthorized=1))
    command('materialize-test',['node','--import','tsx',str(HERE/'freeze_panels.ts'),'--materialize-test'],600)
    py('sealed-baseline-offline','offline.py',['--model',str(base),'--out',str(DATA/'sealed-baseline-offline'),'--sealed'])
    py('sealed-candidate-offline','offline.py',['--model',str(DATA/'best/final'),'--out',str(DATA/'sealed-candidate-offline'),'--sealed'])
    arena('test-baseline',base,DATA/'test-baseline','test',1.)
    arena('test-candidate',DATA/'best/final',DATA/'test-candidate','test',lock['candidate']['priorScale'])
    report()
    command('tactical-traces',['node','--import','tsx',str(HERE/'analyze_traces.ts')],1800)
    py('complete-report','post_review.py')
    save(DATA/'PIPELINE_STATUS.json',dict(status='complete',seconds=time.perf_counter()-started,pid=os.getpid(),
        backgroundChildrenRemaining=0,finalTestRuns=1,report=str(HERE/'REPORT.md')))
    save(HERE/'REVIEW_REQUEST.json',dict(schema='stage3-result-review-v1',status='complete',report=str(HERE/'REPORT.md'),
         manifest=str(HERE/'OMNI_BASE_MODEL_MANIFEST.json'),evidence=str(HERE/'EVIDENCE_MANIFEST.json'),
         fourthStageStarted=False,uiDeployed=False))


if __name__=='__main__':
    try:
        main()
    except BaseException as error:
        save(DATA/'PIPELINE_STATUS.json',dict(status='failed',error=repr(error),traceback=traceback.format_exc(),pid=os.getpid()))
        raise
