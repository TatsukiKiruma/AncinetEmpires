"""仅检查本任务白名单缓存；汇总真实预算与前后git状态，不穿支持链接。"""
import pathlib,json,time,hashlib,os
S=pathlib.Path(__file__).resolve().parents[1].resolve();deleted=[];refused=[]
def safe(p):
    resolved=p.resolve();assert resolved.is_relative_to(S)
    q=p
    while True:
        assert not (q.lstat().st_file_attributes&0x400),'拒绝reparse/junction'
        if q==S:break
        q=q.parent
    return resolved
cache=S/'research/__pycache__'
if cache.exists():
    try:
        safe(cache)
        for p in cache.iterdir():
            safe(p)
            if p.is_file() and p.suffix=='.pyc':
                deleted.append({'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'reason':'本阶段研究脚本可再生字节码','rebuild':'用本阶段Python对对应.py运行python -m py_compile'});p.unlink()
        if not any(cache.iterdir()):cache.rmdir()
    except (AssertionError,OSError) as e:refused.append(str(e))
cleanup={'completed':True,'deleted':deleted,'refused':refused,'kept':{'tmp/venv':'独立恢复运行环境，保留','tmp/nonfinite_model.json':'真实非有限前向反例，保留','data/checkpoints/runs/frozen/evidence':'原始数据、模型、失败日志、冻结源和验证证据全部保留'},'recursiveDeletionUsed':False,'historicalDirectoriesVisitedForCleanup':False}
(S/'identity/cleanup.json').write_text(json.dumps(cleanup,ensure_ascii=False,indent=2),encoding='utf8')
before=set((S/'identity/git_status_before.txt').read_text(encoding='utf-8-sig').splitlines());after=set((S/'identity/git_status_after.txt').read_text(encoding='utf-8-sig').splitlines())
(S/'identity/git_status_diff.json').write_text(json.dumps({'added':sorted(after-before),'removed':sorted(before-after),'beforeLines':len(before),'afterLines':len(after),'note':'原有修改/删除均保留；R8目录受现有ignore规则影响，文件完整性另由交付索引覆盖。'},ensure_ascii=False,indent=2),encoding='utf8')
b=json.loads((S/'identity/budget.json').read_text(encoding='utf8'));f=json.loads((S/'identity/candidate_freeze.json').read_text(encoding='utf8'));rows=[]
for p in (S/'checkpoints').glob('*/ledger.jsonl'):
    lines=[json.loads(x) for x in p.read_text(encoding='utf8').splitlines() if x.strip()];r=lines[-1];rows.append({'run':p.parent.name,'updates':r['update'],'trainingLoopAndValidationWallSeconds':r['elapsedSeconds'],'cpuSeconds':r['cpuSeconds'],'peakWorkingSetBytes':r.get('peakWorkingSetBytes'),'gpuSeconds':0})
now=time.time();out={'asOfUnix':now,'wallSecondsSinceFirstCompute':now-b['startedUnix'],'wallLimitSeconds':b['wallLimitSeconds'],'trainingCompletedNoLaterThanFreezeSeconds':f['frozenUnix']-b['startedUnix'],'trainingDeadlineSeconds':9.6*3600,'reservedDeliverySeconds':8640,'trainingDeadlineRespected':f['frozenUnix']<b['trainDeadlineUnix'],'totalDeadlineRespected':now<b['finalDeadlineUnix'],'runs':rows,'recordedTrainingCpuSeconds':sum(r['cpuSeconds'] for r in rows),'maxTrainingProcessPeakWorkingSetBytes':max(r['peakWorkingSetBytes'] or 0 for r in rows),'gpuSeconds':0,'resourceLimitations':'CPU累计仅含训练循环及其内嵌验证；不含数据加载、采集、外部评测和其他检查。系统进程查询被拒绝，全阶段累计CPU和合并峰值内存不可用。'}
(S/'identity/budget_summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'cleanupDeleted':len(deleted),'gitAdded':len(after-before),'gitRemoved':len(before-after),'wallMinutes':out['wallSecondsSinceFirstCompute']/60},ensure_ascii=False))
