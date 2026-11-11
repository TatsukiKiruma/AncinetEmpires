"""有界三代后台执行入口：全量预训练、新对局、训练、开发比较、冻结最终评测。"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
EXECUTION_DIR=Path(__file__).resolve().parent
DIR=EXECUTION_DIR.parent
PLAN_DIR=DIR/'execution_v3'
ROOT=DIR.parents[1]
ACTIVE_IDENTITY={}


def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,v):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.pending');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf-8');os.replace(tmp,p)


def command(args,log,timeout=None):
    assert shutil.disk_usage(ROOT).free>12*1024**3,'可用空间低于12GiB，保留证据并停止'
    assert all(sha(ROOT/p)==value for p,value in ACTIVE_IDENTITY.items()),'正式源码身份变化，拒绝混合运行'
    log=Path(log);log.parent.mkdir(parents=True,exist_ok=True)
    with log.open('ab') as f:
        result=subprocess.run(args,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,timeout=timeout)
    assert result.returncode==0,f'子阶段失败：{log}'


def node(script,*args,log,timeout=None):
    entry=EXECUTION_DIR/script if script in ['verify_game.ts','index_games.ts'] else DIR/script
    return command(['node',str(ROOT/'ai_training/run.mjs'),'node','--max-old-space-size=4096','--import','tsx',str(entry),*map(str,args)],log,timeout)


def game(job,folder):
    folder=Path(folder)
    job=dict(job,expectedModelSha256=sha(job['modelPrefix']+'.bin'))
    if job['opponent']!='Original-APKlikeAI-Hard':job['expectedOpponentSha256']=sha(job.get('opponentPrefix',job['modelPrefix'])+'.bin')
    if (folder/'result.json').exists():
        previous=read(folder/'result.json')
        assert previous['job']==job and previous['modelVersion']==job['expectedModelSha256'],'恢复的对局或模型身份变化'
        assert previous['error'] is None,'错误对局禁止自动准入'
        if not (folder/'strict.json').exists():node('verify_game.ts',folder,log=folder/'strict-stream-v4.log',timeout=3600)
        receipt=read(folder/'strict.json')
        assert receipt['passed'] and receipt['sourceResultSha256']==sha(folder/'result.json'),'独立回放身份未通过'
        return previous
    if (folder/'started.json').exists():raise RuntimeError(f'发现未完成尝试，禁止无声覆盖或自动重计：{folder}')
    folder.mkdir(parents=True,exist_ok=True);save(folder/'job.json',job)
    node('battle.ts',folder/'job.json',folder,log=folder/'process.log',timeout=(job.get('maxWallMs',20000000)/1000+180))
    node('verify_game.ts',folder,log=folder/'strict-stream-v4.log',timeout=3600)
    result=read(folder/'result.json');assert result['error'] is None
    return result


def series(jobs,folder,concurrency):
    def one(job):return game(job,Path(folder)/job['id'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:results=list(pool.map(one,jobs))
    save(Path(folder)/'summary.json',dict(games=len(results),uniqueOpenings=len({r['openingCanonicalSha256'] for r in results}),uniqueTrajectories=len({(r['openingCanonicalSha256'],r['semanticTrajectorySha256']) for r in results}),wins=sum(r['outcome']=='win' for r in results),losses=sum(r['outcome']=='loss' for r in results),draws=sum(r['outcome']=='draw' for r in results),truncated=sum(not r['natural'] and not r['error'] for r in results),errors=sum(bool(r['error']) for r in results),results=results))
    return results


def train(run,initial=None,expert=None,learning_rate=.0001):
    output=DIR/'training'/run
    def validate():
        prefix=str(output/'model')
        if not (output/'model-node-parity.json').exists():
            command([sys.executable,'-B','-X','utf8',str(DIR/'export_reference.py'),prefix],output/'python-parity.log')
            node('parity.ts',prefix,log=output/'node-parity.log',timeout=600)
        assert read(output/'model-node-parity.json')['passed']
        return prefix
    if (output/'complete.json').exists():assert read(output/'complete.json')['formal'];return validate()
    args=[sys.executable,'-B','-X','utf8',str(DIR/'train.py'),'--run',run,'--epochs','2','--batch','8','--lr',str(learning_rate)]
    if initial:args+=['--initial-prefix',str(initial)]
    if expert:args+=['--expert-manifest',str(expert)]
    if (output/'resume.pt').exists():args+=['--resume']
    command(args,output/'process.log');assert read(output/'complete.json')['formal'];return validate()


def main():
    global ACTIVE_IDENTITY
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');parser.add_argument('--concurrency',type=int);args=parser.parse_args()
    assert args.run,'必须显式指定--run；本入口会执行已授权的长程训练和对局'
    status=DIR/'PIPELINE_STATE.json'
    def update(stage,**extra):
        save(status,dict(stage=stage,at=time.time(),overallComplete=False,guiDeployed=False,executionRevision=4,formalParentsTarget=380,**extra))
        command([sys.executable,'-B','-X','utf8',str(EXECUTION_DIR/'report.py')],DIR/'report-progress.log')
    try:
        assert read(DIR/'preflight-audit.json')['passed'] and read(DIR/'node-parity.json')['passed']
        assert read(DIR/'historical-preservation-corrected.json')['passed'] and read(DIR/'battle-smoke-01/strict.json')['passed']
        stability=read(DIR/'training/stability_frozen_2epoch/training.json')
        assert len(stability['history'])==2 and len(stability['actualChangedTensors'])==194
        pilot=DIR/'concurrency-final.json' if (DIR/'concurrency-final.json').exists() else DIR/'concurrency.json'
        concurrency=args.concurrency or read(pilot)['selectedConcurrency'];assert concurrency in [2,4,8]
        if not (DIR/'evaluation-plan.json').exists():node('prepare_games.ts',log=DIR/'prepare-games.log')
        if not (DIR/'regression-plan.json').exists():node('prepare_regression.ts',log=DIR/'prepare-regression.log')
        evaluation=read(DIR/'evaluation-plan.json');plan=read(PLAN_DIR/'sampling-plan-v3.json')
        assert len(plan)==380 and [sum(j['generation']==g for j in plan) for g in [1,2,3]]==[200,90,90]
        development=read(DIR/'regression-plan.json')+evaluation['dev']
        # 进程内部不再更改实现；正式恢复要求源文件身份完全保持。
        sources={str(p.relative_to(ROOT)):sha(p) for p in list(DIR.glob('*.py'))+list(DIR.glob('*.ts'))+list((ROOT/'src/ai_runtime/dual_v3').glob('*.ts'))}
        dependencies=list((ROOT/'src/game').rglob('*.ts'))+list((ROOT/'src/game').rglob('*.js'))+list((ROOT/'src/ai_runtime/dual_v2').glob('*.ts'))
        dependencies+=list((DIR.parent/'dual_stream_v2_phase1_20261020').glob('*.ts'))+list((DIR.parent/'dual_stream_v2_phase3_20261020').glob('*.ts'))+[DIR.parent/'dual_stream_v2_phase2_20261020/accurate_ops.py',DIR.parent/'data_acceptance_20261016/phone/compact_reader.ts',DIR.parent/'data_acceptance_20261016/replay/core.ts']
        sources.update({str(p.relative_to(ROOT)):sha(p) for p in dependencies if not p.name.endswith('.test.ts')})
        fixed_inputs=[DIR/'initial.json',DIR/'initial.bin',DIR/'protocol-v2.json',DIR/'execution-contract.json',DIR/'sampling-plan-v2.json',DIR/'evaluation-plan.json',DIR/'regression-plan.json']
        fixed_inputs+=list((DIR.parent/'pretrain_preflight_20261022/evaluation/assets/phase5-gen03').glob('*'))
        sources.update({str(p.relative_to(ROOT)):sha(p) for p in fixed_inputs if p.is_file()})
        # 继承旧冻结身份并追加本次明确授权的执行修订，不改写历史身份。
        assert read(DIR/'formal-source-identity.json')==sources,'旧冻结源码身份变化'
        inherited=read(PLAN_DIR/'formal-source-identity.json')
        assert all(sha(ROOT/name)==value for name,value in inherited.items()),'v3冻结身份变化'
        sources=dict(inherited)
        revision_files=[EXECUTION_DIR/n for n in ['pipeline.py','report.py','launch.ps1','gzip_rows.ts','verify_game.ts','index_games.ts','REPAIR.json']]+[PLAN_DIR/'formal-source-identity.json']
        sources.update({str(p.relative_to(ROOT)):sha(p) for p in revision_files})
        source_file=EXECUTION_DIR/'formal-source-identity.json'
        if source_file.exists():assert read(source_file)==sources,'正式源码已变化，必须诊断并另建版本'
        else:save(source_file,sources)
        ACTIVE_IDENTITY=sources
        failure=DIR/'PIPELINE_FAILURE.json'
        if failure.exists():
            assert sha(failure)==read(EXECUTION_DIR/'REPAIR.json')['legacyFailureSha256'],'出现不同的新失败，拒绝自动覆盖'
            archived=EXECUTION_DIR/'legacy-PIPELINE_FAILURE.json';assert not archived.exists();failure.rename(archived)
        pending=[f.parent for f in sorted((DIR/'generations').glob('gen_*/sampling/*/result.json')) if not (f.parent/'strict.json').exists()]
        if pending:
            passed=sum(read(f)['passed'] for f in (DIR/'generations').glob('gen_*/sampling/*/strict.json'))
            update('recovering_verification',formalParentsSampled=passed,generationsCompleted=0,pendingVerification=len(pending))
            # 已完成对局只补独立校验，不重跑、不重计、不修改结果。
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda folder:game(read(folder/'result.json')['job'],folder),pending))
        update('pretraining',formalParentsSampled=0,generationsCompleted=0)
        pretrained=train('pretrain_full');champion=pretrained;generations=[];games=[];no_gain=0
        old=str(DIR.parent/'pretrain_preflight_20261022/evaluation/assets/phase5-gen03/model')
        for generation in range(1,4):
            update('sampling',generation=generation,champion=champion,formalParentsSampled=len(games),generationsCompleted=generation-1)
            jobs=[dict(j,modelPrefix=champion,opponentPrefix=old if j['opponent']=='historical' else champion,maxWallMs=20000000) for j in plan if j['generation']==generation]
            output=DIR/'generations'/f'gen_{generation:02}'/'sampling';sampled=series(jobs,output,concurrency)
            for j in jobs:
                d=output/j['id'];games.append(dict(directory=str(d),resultSha256=sha(d/'result.json')))
            expert=DIR/'generations'/f'gen_{generation:02}'/'expert-manifest.json';save(expert,dict(games=games,generation=generation))
            update('training',generation=generation,formalParentsSampled=len(games),generationsCompleted=generation-1)
            learning_rate=.00005 if generation==3 and no_gain>=2 else .0001
            candidate=train(f'expert_gen_{generation:02}',champion,expert,learning_rate)
            dev=DIR/'generations'/f'gen_{generation:02}'/'dev';left=series([dict(j,modelPrefix=champion) for j in development],dev/'champion',concurrency);right=series([dict(j,modelPrefix=candidate) for j in development],dev/'candidate',concurrency)
            node('index_games.ts',dev,log=dev/'index.log',timeout=3600)
            new=sum(a['outcome']!='win' and b['outcome']=='win' for a,b in zip(left,right));lost=sum(a['outcome']=='win' and b['outcome']!='win' for a,b in zip(left,right));promoted=new>lost and all(r['error'] is None and r['over4000']==0 for r in right)
            record=dict(generation=generation,candidate=candidate,previousChampion=champion,newWins=new,lostWins=lost,promoted=promoted,learningRate=learning_rate,sampledParents=len(sampled),naturalParents=sum(r['natural'] for r in sampled),strictAll=True)
            if promoted:champion=candidate;no_gain=0
            else:no_gain+=1
            record['noGainStreak']=no_gain;record['diagnosisRequired']=no_gain>=2
            generations.append(record);save(DIR/'generations'/f'gen_{generation:02}'/'promotion.json',record)
            if no_gain>=2:command([sys.executable,'-B','-X','utf8',str(DIR/'diagnose.py'),str(DIR/'generations'/f'gen_{generation:02}')],DIR/'generations'/f'gen_{generation:02}'/'diagnosis.log')
            # 无收益时只记录预登记诊断，不无界调参或追加第4代。
        update('controls',generationsCompleted=3,formalParentsSampled=len(games),champion=champion)
        controls=[('old-frozen',old,'frozen',780),('old-new-1s',old,'search',1000),('old-new-2s',old,'search',2000),('old-new-4s',old,'search',4000),('2m-pretrained',pretrained,'search',4000),('2m-expert',champion,'search',4000),('old-pure',old,'pure',4000),('2m-pretrained-pure',pretrained,'pure',4000),('2m-expert-pure',champion,'pure',4000)]
        for name,prefix,mode,budget in controls:
            series([dict(j,modelPrefix=prefix,mode=mode,budgetMs=budget) for j in development],DIR/'controls'/name,concurrency)
        for name,extra in [('without-intermediate',dict(intermediateValue=False)),('pre-response-penalty',dict(leafMode='pre_response_penalty'))]:
            series([dict(j,modelPrefix=old,**extra) for j in development],DIR/'controls'/name,concurrency)
        frozen=DIR/'final-frozen';frozen.mkdir(exist_ok=True)
        for name in sources:
            target=frozen/'source'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
        for ext in ['json','bin']:shutil.copyfile(champion+'.'+ext,frozen/('model.'+ext))
        save(frozen/'identity.json',dict(modelSha256=sha(frozen/'model.bin'),sources=sources,evaluationPlanSha256=sha(DIR/'evaluation-plan.json'),generations=generations,finalTestNeverUsedForSelection=True))
        update('final_evaluation',generationsCompleted=3,formalParentsSampled=len(games),champion=champion)
        final=series([dict(j,modelPrefix=str(frozen/'model')) for j in evaluation['final']],DIR/'final-evaluation',concurrency)
        command([sys.executable,'-B','-X','utf8',str(DIR/'experiment_statistics.py')],DIR/'statistics.log')
        save(DIR/'PIPELINE_STATE.json',dict(stage='completed_experiment',executionRevision=4,formalParentsTarget=380,experimentComplete=True,overallComplete=False,qualityImprovedWithin2m=any(g['promoted'] for g in generations),generations=generations,formalParentsSampled=len(games),finalGames=len(final),champion=champion,guiDeployed=False,limitations=['新困难APK原生0/3000，未冒充已采集','历史未知真人开局谱系仍不具备完全独立性证明，全部目标不能记为完成','根墙钟搜索可能受并发负载影响','扩容与新预训练数据的纯容量因果收益尚需匹配数据对照']))
        command([sys.executable,'-B','-X','utf8',str(EXECUTION_DIR/'report.py')],DIR/'report-final.log')
    except BaseException as e:
        previous=read(status) if status.exists() else {}
        save(status,dict(previous,stage='failed',failedAt=time.time(),failure=str(e),overallComplete=False))
        save(DIR/'PIPELINE_FAILURE.json',dict(error=str(e),traceback=traceback.format_exc(),at=time.time(),overallComplete=False))
        subprocess.run([sys.executable,'-B','-X','utf8',str(EXECUTION_DIR/'report.py')],cwd=ROOT)
        raise


if __name__=='__main__':main()
