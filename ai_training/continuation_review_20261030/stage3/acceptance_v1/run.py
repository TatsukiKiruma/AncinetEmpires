"""有界执行六组开发实战、唯一候选锁定及一次封存验收。"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import traceback
from context import HERE, S3, ROOT, BASE, DATA, core, read, sha, save_new, now, validate

ACTIVE = {}
MUTEX = threading.Lock()


def command(name, arguments, timeout=14400):
    contract = validate()
    receipts = DATA/'receipts'
    receipts.mkdir(exist_ok=True)
    result_path = receipts/(name+'.json')
    if result_path.exists():
        previous = read(result_path)
        compatible=set(read(HERE/'ACCEPTANCE_CONTRACT.json').get('compatibleCommandContracts',[]))|{contract}
        assert previous['returncode'] == 0 and previous['contractSha256'] in compatible, '已有失败命令不自动重跑：'+name
        assert previous['command'] == arguments, '已完成命令的逻辑参数不允许改变：'+name
        return
    execution=list(arguments)
    if execution[0]=='node':
        execution=[execution[0],'--import',(HERE/'io_guard.mjs').as_uri(),*execution[1:]]
    save_new(receipts/(name+'.START.json'),dict(command=arguments,executionCommand=execution,started=now(),contractSha256=contract))
    started = time.monotonic()
    print(json.dumps(dict(event='started',job=name,time=now())),flush=True)
    with (receipts/(name+'.stdout.log')).open('xb') as out, (receipts/(name+'.stderr.log')).open('xb') as err:
        child = subprocess.Popen(['node',str(ROOT/'ai_training/run.mjs'),*execution],cwd=ROOT,
                                 stdout=out,stderr=err,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        with MUTEX:
            ACTIVE[name] = child
        try:
            code = child.wait(timeout=timeout)
        finally:
            if child.poll() is None:
                subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True)
                child.wait(timeout=20)
            with MUTEX:
                ACTIVE.pop(name,None)
    save_new(result_path,dict(returncode=code,seconds=time.monotonic()-started,command=arguments,
                             executionCommand=execution,contractSha256=contract,finished=now()))
    print(json.dumps(dict(event='finished',job=name,code=code,seconds=time.monotonic()-started)),flush=True)
    assert code == 0, '验收命令失败，后继停止：'+name


def py(name, action, model, update=None, destination=None):
    args=[sys.executable,'-X','utf8',str(HERE/'worker.py'),action,'--model',str(model)]
    if update is not None:args.extend(['--update',str(update)])
    if destination is not None:args.extend(['--out',str(destination)])
    command(name,args)


def arena(name, prefix, split, scale):
    command(name,['node','--import','tsx',str(S3/'arena.ts'),str(prefix),str(DATA/name),split,str(scale)])
    result = read(DATA/name/'SUMMARY.json')
    assert result['complete'] and result['attempted'] == (40 if split=='historical' else 54)
    assert result['modelSha256'] == sha(Path(prefix).with_suffix('.bin'))


def select():
    candidates=read(S3/'DEV_CANDIDATES.json')
    rows=[]
    for update in candidates['updates']:
        point=candidates['models'][str(update)]
        offline=read(point['offline'])
        for scale in candidates['priorScales']:
            name=f'dev-{update:06d}-prior-{scale}'
            result=read(DATA/name/'SUMMARY.json')
            groups=[result['byPlayers'][str(n)] for n in [2,3,4]]
            rank=sum((g['normalizedRank'] or 0)*g['natural']/g['attempted'] for g in groups)/3
            win=sum(g['wins']/g['attempted'] for g in groups)/3
            rows.append(dict(update=update,priorScale=scale,allNatural=result['allNatural'],rank=rank,win=win,
                             newNll=offline['buckets'][f'{scale}/new/dev']['parentEqual']['policyNll'],
                             oldBrier=offline['buckets'][f'{scale}/old/dev']['parentEqual']['brier'],
                             arena=str(DATA/name/'SUMMARY.json')))
    rows.sort(key=lambda row:(not row['allNatural'],-row['rank'],-row['win'],row['newNll'],row['oldBrier'],row['update'],row['priorScale']))
    best=rows[0];point=candidates['models'][str(best['update'])]
    sensitivity=[]
    for row in rows:
        if row['allNatural']:continue
        summary=read(row['arena'])
        missing=sum(g['attempted']-g['natural'] for g in summary['byPlayers'].values())
        upper=row['rank']+sum((g['attempted']-g['natural'])/g['attempted'] for g in summary['byPlayers'].values())/3
        sensitivity.append(dict(update=row['update'],priorScale=row['priorScale'],nonNaturalGames=missing,
                                rankLower=row['rank'],rankUpper=upper,selectedRank=best['rank'],
                                couldTieOrBeatSelectedRank=upper>=best['rank']))
    lock=dict(schema='stage3-unique-final-candidate-v1',locked=now(),candidate=best,checkpoint=point['checkpoint'],
              sourceModel=point['prefix'],modelSha256=sha(Path(point['prefix']).with_suffix('.bin')),
              metadataSha256=sha(Path(point['prefix']).with_suffix('.json')),contractSha256=validate(),
              originalScienceContractSha256=core.validate(),sourceMacBranch=True,developmentOrdering=rows,
              ioSensitivity=dict(rows=sensitivity,rankWinnerRobust=best['allNatural'] and all(not r['couldTieOrBeatSelectedRank'] for r in sensitivity),
                                 method='非自然局排名分只作0到1的界限分析，不补造自然结果、不改变选择排序'),
              sealedRawAccessBeforeLock=0,sealedForwardBeforeLock=0,
              limitation='所有开发比较完成后锁定，封存结果不用于重选或训练；非自然结果保守排序并单列')
    assert not (S3/'TEST_INITIAL_MANIFEST.json').exists()
    save_new(S3/'FINAL_CANDIDATE_LOCK.json',lock)
    save_new(DATA/'FINAL_CANDIDATE_LOCK.json',lock)
    returned=Path(read(HERE/'PLAN.json')['sourceReturn'])
    last=read(returned/'mac-snapshot/work/training/LATEST.json')
    last['file']=str(returned/'mac-snapshot/work/training'/last['file'])
    for kind,record,prefix in [('best',point['checkpoint'],Path(point['prefix'])),
                               ('last',last,returned/'mac-snapshot/work/training/last')]:
        folder=DATA/kind;folder.mkdir(exist_ok=False)
        shutil.copy2(record['file'],folder/'checkpoint.pt')
        assert sha(folder/'checkpoint.pt')==record['sha256']
        for suffix in ['.bin','.json']:
            shutil.copy2(prefix.with_suffix(suffix),folder/('final'+suffix))
        assert sha(folder/'final.bin')==sha(prefix.with_suffix('.bin'))
    parity=read(DATA/f'parity-{best["update"]}'/'RESULT.json')
    assert parity['passed'] and parity['modelSha256']==lock['modelSha256']
    save_new(S3/'EXPORT_PARITY.json',dict(parity,acceptanceContractSha256=validate()))
    print(json.dumps(dict(event='unique_candidate_locked',candidate=best)),flush=True)
    return lock


def parallel_jobs(function, jobs, workers):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures=[pool.submit(function,*job) for job in jobs]
        for future in futures:
            future.result()


def main():
    started=time.monotonic();validate()
    plan=read(HERE/'PLAN.json');candidates=read(S3/'DEV_CANDIDATES.json')
    record=dict(pid=os.getpid(),started=now(),contractSha256=validate(),newTrainingUpdates=0)
    if (DATA/'RUN_STARTED.json').exists():
        assert not (DATA/'FINAL_TEST_ATTEMPT.json').exists() and not (S3/'FINAL_CANDIDATE_LOCK.json').exists()
        save_new(DATA/f'RUN_RESTART-{time.time_ns()}.json',dict(record,reason='开发已完成，在唯一候选锁定前接续I/O适配；不重跑已有套件'))
    else:
        save_new(DATA/'RUN_STARTED.json',record)
    # 三个权重点均在任何开发实战前通过相同夹具的导出检查。
    for update in candidates['updates']:
        prefix=candidates['models'][str(update)]['prefix']
        py(f'parity-reference-{update}', 'references', prefix, update=update)
        command(f'parity-ts-{update}',['node','--import','tsx',str(HERE/'parity.ts'),prefix,str(DATA/f'parity-{update}')])
    jobs=[(f'dev-{update:06d}-prior-{scale}',candidates['models'][str(update)]['prefix'],'dev',scale)
          for update in candidates['updates'] for scale in candidates['priorScales']]
    parallel_jobs(arena,jobs,plan['developmentConcurrency'])
    lock=select()
    # 先进行历史开发纵向对照；其结果不再改变已经锁定的候选。
    arena('historical-final',DATA/'best/final','historical',lock['candidate']['priorScale'])
    attempt=dict(schema='stage3-single-sealed-attempt-v1',started=now(),candidateLockSha256=sha(S3/'FINAL_CANDIDATE_LOCK.json'),
                 acceptanceContractSha256=validate(),models=[plan['baselinePrefix'],str(DATA/'best/final')],
                 offlineParents=329,arenaGamesPerModel=54,pairedConditionsIdentical=True,testRunsAuthorized=1,
                 noTrainingOrReselectionAfterStart=True)
    assert not (BASE/'run-v2-batch8/FINAL_TEST_ATTEMPT.json').exists()
    save_new(BASE/'FINAL_TEST_ATTEMPT.json',attempt)
    save_new(DATA/'FINAL_TEST_ATTEMPT.json',attempt)
    save_new(S3/'FINAL_TEST_ATTEMPT.json',attempt)
    command('materialize-test',['node','--import','tsx',str(S3/'freeze_panels.ts'),'--materialize-test'])
    py('sealed-baseline-offline','sealed',plan['baselinePrefix'],destination=DATA/'sealed-baseline-offline')
    py('sealed-candidate-offline','sealed',DATA/'best/final',destination=DATA/'sealed-candidate-offline')
    parallel_jobs(arena,[('test-baseline',plan['baselinePrefix'],'test',1.),
                         ('test-candidate',DATA/'best/final','test',lock['candidate']['priorScale'])],plan['finalPairedConcurrency'])
    command('paired-and-trace-selection',[sys.executable,'-X','utf8',str(HERE/'report.py'),'analyze'])
    command('tactical-traces',['node','--import','tsx',str(HERE/'traces.ts'),str(DATA)])
    command('complete-report',[sys.executable,'-X','utf8',str(HERE/'report.py'),'deliver'])
    save_new(DATA/'RUN_CLOSED.json',dict(status='complete',finished=now(),seconds=time.monotonic()-started,
                                        backgroundChildrenRemaining=len(ACTIVE),finalTestRuns=1,report=str(S3/'REPORT.md')))
    assert not ACTIVE
    from report import evidence
    evidence()
    print(json.dumps(dict(event='acceptance_complete',report=str(S3/'REPORT.md'),seconds=time.monotonic()-started)),flush=True)


if __name__=='__main__':
    try:
        main()
    except BaseException as error:
        with MUTEX:
            children=list(ACTIVE.values())
        for child in children:
            if child.poll() is None:
                subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],capture_output=True)
        core.save(DATA/'RUN_BLOCKED.json',dict(error=repr(error),traceback=traceback.format_exc(),time=now(),
                                              sealedAttemptStarted=(DATA/'FINAL_TEST_ATTEMPT.json').exists()))
        raise
