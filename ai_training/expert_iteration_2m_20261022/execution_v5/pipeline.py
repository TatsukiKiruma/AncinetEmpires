"""从131局开始的小规模三代恢复入口，冻结历史20局作阶段晋升验证。"""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from selection import assess,panel_summary

HERE=Path(__file__).resolve().parent
PARENT=HERE.parent
ROOT=PARENT.parents[1]
spec=importlib.util.spec_from_file_location('streaming_v4',PARENT/'execution_v4/pipeline.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
read=base.read;save=base.save;sha=base.sha
OLD=str(PARENT.parent/'pretrain_preflight_20261022/evaluation/assets/phase5-gen03/model')


class UserPaused(Exception):pass


def pause_guard():
    request=PARENT/'PAUSE_REQUEST.json'
    authorization=read(HERE/'resume-authorization.json')
    if request.exists() and request.stat().st_mtime>authorization['authorizedUnix']:raise UserPaused('用户发出新的暂停请求')


def command(args,log,timeout=None):
    pause_guard();return base.command(args,log,timeout)


def node(script,*args,log,timeout=None):
    entry=HERE/script if script=='index_games.ts' else PARENT/'execution_v4/verify_game.ts' if script=='verify_game.ts' else PARENT/script
    return command(['node',str(ROOT/'ai_training/run.mjs'),'node','--max-old-space-size=4096','--import','tsx',str(entry),*map(str,args)],log,timeout)


base.node=node


def immutable_json(path,value):
    path=Path(path)
    if path.exists():assert read(path)==value,f'不可变输入变化：{path}'
    else:save(path,value)


def update(stage,**fields):
    state=dict(stage=stage,at=time.time(),overallComplete=False,guiDeployed=False,executionRevision=5,formalParentsTarget=191,**fields)
    save(HERE/'RUN_STATE.json',state);save(PARENT/'PIPELINE_STATE.json',state)
    subprocess.run([sys.executable,'-B','-X','utf8',str(HERE/'report.py')],cwd=ROOT,check=True)


def train(run,initial,manifest,learning_rate):
    output=PARENT/'training'/run
    if not (output/'complete.json').exists():
        args=[sys.executable,'-B','-X','utf8',str(HERE/'train.py'),'--run',run,'--epochs','2','--batch','8','--lr',str(learning_rate),'--source-mode','expert-only','--initial-prefix',str(initial),'--expert-manifest',str(manifest)]
        if (output/'resume.pt').exists():args.append('--resume')
        command(args,output/'process.log')
    done=read(output/'complete.json');assert done['formal'] and done['modelSha256']==sha(output/'model.bin')
    prefix=str(output/'model');parity=output/'model-node-parity.json'
    if not parity.exists():
        command([sys.executable,'-B','-X','utf8',str(PARENT/'export_reference.py'),prefix],output/'python-parity.log')
        node('parity.ts',prefix,log=output/'node-parity.log',timeout=600)
    proof=read(parity);assert proof['passed'] and proof['modelSha256']==done['modelSha256']
    return prefix


def series(jobs,folder,concurrency):
    return base.series(jobs,folder,concurrency)


def panel(kind,prefix,plan,concurrency):
    identity=sha(prefix+'.bin');key=identity+'-'+hashlib.sha256(prefix.encode()).hexdigest()[:12]
    folder=HERE/'validation-cache'/kind/key
    jobs=[dict(job,modelPrefix=prefix,opponentPrefix=OLD,maxWallMs=20000000) for job in plan]
    result=series(jobs,folder,concurrency)
    marker=folder/'exclusion-indexed.json'
    if not marker.exists():
        node('index_games.ts',folder,log=folder/'index.log',timeout=3600)
        save(marker,dict(indexed=True,modelSha256=identity,planSha256=sha(HERE/'plan.json'),exclusionSha256=sha(HERE/'seen-evaluation-exclusions.txt.gz')))
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');args=parser.parse_args()
    assert args.run,'必须显式指定--run'
    try:
        identity=read(HERE/'formal-source-identity.json')
        assert all(sha(ROOT/name)==value for name,value in identity.items()),'冻结源码或协议身份变化'
        base.ACTIVE_IDENTITY=identity
        protocol=read(HERE/'protocol.json');plan=read(HERE/'plan.json');concurrency=protocol['concurrency']
        seed=read(HERE/'seed-manifest-131.json');assert len(seed['games'])==131 and len(seed['excludedInterruptedGames'])==8
        assert all(job['opponent'] in ['Original-APKlikeAI-Hard','historical'] for job in plan['sampling'])
        champion=str(PARENT/'training/pretrain_full/model');assert sha(champion+'.bin')==read(PARENT/'training/pretrain_full/complete.json')['modelSha256']
        games=list(seed['games']);records=[];no_gain=0
        for generation in [1,2,3]:
            folder=HERE/'generations'/f'gen_{generation:02}'
            if generation>1:
                update('sampling',generation=generation,generationsCompleted=generation-1,formalParentsSampled=len(games),champion=champion,generations=records)
                jobs=[dict(job,modelPrefix=champion,opponentPrefix=OLD,maxWallMs=20000000) for job in plan['sampling'] if job['generation']==generation]
                assert len(jobs)==30 and sum(job['opponent']=='Original-APKlikeAI-Hard' for job in jobs)==20
                series(jobs,folder/'sampling',concurrency)
                games.extend(dict(directory=str(folder/'sampling'/job['id']),resultSha256=sha(folder/'sampling'/job['id']/'result.json')) for job in jobs)
            manifest=folder/'expert-manifest.json';immutable_json(manifest,dict(games=games,generation=generation,excludedUnfinished=seed['excludedInterruptedGames']))
            update('training',generation=generation,generationsCompleted=generation-1,formalParentsSampled=len(games),champion=champion,generations=records,expertManifest=str(manifest))
            learning_rate=.00005 if generation==3 and no_gain>=2 else .0001
            candidate=train(f'v5_gen_{generation:02}',champion,manifest,learning_rate)
            update('historical_validation',generation=generation,generationsCompleted=generation-1,formalParentsSampled=len(games),champion=champion,candidate=candidate,generations=records)
            left_history=panel('historical',champion,plan['historicalValidation'],concurrency)
            right_history=panel('historical',candidate,plan['historicalValidation'],concurrency)
            update('hard_validation',generation=generation,generationsCompleted=generation-1,formalParentsSampled=len(games),champion=champion,candidate=candidate,generations=records)
            left_hard=panel('hard',champion,plan['hardValidation'],concurrency)
            right_hard=panel('hard',candidate,plan['hardValidation'],concurrency)
            selection=assess(left_history,right_history,left_hard,right_hard)
            record=dict(generation=generation,candidate=candidate,previousChampion=champion,learningRate=learning_rate,trainingParents=len(games),**selection)
            if selection['promoted']:champion=candidate;no_gain=0
            else:no_gain+=1
            record.update(noGainStreak=no_gain,diagnosisRequired=no_gain>=2,champion=champion)
            save(folder/'promotion.json',record);records.append(record)
            if no_gain>=2:save(folder/'diagnosis.json',dict(reasons=[name for name,passed in selection['gates'].items() if not passed],history=selection['historicalPair'],hard=selection['hardPair'],onlyPermittedCorrection='第三代学习率仅减半一次，不增加代数或采样配额'))
        update('small_loop_complete',generation=3,generationsCompleted=3,formalParentsSampled=len(games),champion=champion,generations=records,expansionEligible=any(r['expansionEligible'] for r in records),automaticExpansion=False)
        # 原冻结对照与最终100局继续独立执行，不将开发历史面板当最终测试。
        development=read(PARENT/'regression-plan.json')+read(PARENT/'evaluation-plan.json')['dev']
        old=OLD;pretrained=str(PARENT/'training/pretrain_full/model')
        controls=[('old-frozen',old,'frozen',780),('old-new-1s',old,'search',1000),('old-new-2s',old,'search',2000),('old-new-4s',old,'search',4000),('2m-pretrained',pretrained,'search',4000),('2m-expert',champion,'search',4000),('old-pure',old,'pure',4000),('2m-pretrained-pure',pretrained,'pure',4000),('2m-expert-pure',champion,'pure',4000)]
        update('controls',generationsCompleted=3,formalParentsSampled=len(games),champion=champion,generations=records)
        for name,prefix,mode,budget in controls:series([dict(job,modelPrefix=prefix,mode=mode,budgetMs=budget) for job in development],HERE/'controls'/name,concurrency)
        for name,extra in [('without-intermediate',dict(intermediateValue=False)),('pre-response-penalty',dict(leafMode='pre_response_penalty'))]:series([dict(job,modelPrefix=old,**extra) for job in development],HERE/'controls'/name,concurrency)
        frozen=HERE/'final-frozen';frozen.mkdir(exist_ok=True)
        for name in identity:
            target=frozen/'source'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,target)
        for ext in ['json','bin']:shutil.copyfile(champion+'.'+ext,frozen/('model.'+ext))
        save(frozen/'identity.json',dict(modelSha256=sha(frozen/'model.bin'),sources=identity,generations=records,finalTestNeverUsedForSelection=True))
        update('final_evaluation',generationsCompleted=3,formalParentsSampled=len(games),champion=champion,generations=records)
        final=series([dict(job,modelPrefix=str(frozen/'model')) for job in read(PARENT/'evaluation-plan.json')['final']],HERE/'final-evaluation',concurrency)
        command([sys.executable,'-B','-X','utf8',str(HERE/'statistics.py')],HERE/'statistics.log')
        update('completed_experiment',experimentComplete=True,generationsCompleted=3,formalParentsSampled=len(games),champion=champion,generations=records,finalGames=len(final),automaticExpansion=False,expansionEligible=any(r['expansionEligible'] for r in records),limitations=['历史20局是固定开发选择集，不是最终盲测','新困难APK原生数据不在本轮冻结训练集','未知历史谱系仍无法绝对证明独立','实测4秒根搜索超限单独记录'])
    except UserPaused as error:update('paused',reason=str(error),automaticResumeAllowed=False)
    except BaseException as error:
        previous=read(HERE/'RUN_STATE.json') if (HERE/'RUN_STATE.json').exists() else {}
        failure=dict(error=str(error),traceback=traceback.format_exc(),at=time.time(),overallComplete=False)
        save(HERE/'PIPELINE_FAILURE.json',failure);save(PARENT/'PIPELINE_FAILURE.json',failure)
        update('failed',**{key:value for key,value in previous.items() if key not in ['stage','at','overallComplete','guiDeployed','executionRevision','formalParentsTarget']},failure=str(error));raise


if __name__=='__main__':main()
