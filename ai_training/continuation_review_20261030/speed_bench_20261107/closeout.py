"""汇总实测证据；缺失和未完成项显式留空，禁止外推为实战结果。"""
import json,hashlib,subprocess,datetime,statistics
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DATA=Path('D:/AncientEmpiresData/speed_bench_20261107_v1')
def read(p):return json.loads(p.read_text('utf-8-sig'))
def save(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def avg(a):return statistics.mean(a) if a else None
def fmt(v):
    if v is None:return '未测/不适用'
    if isinstance(v,(int,float)) and 0<abs(v)<.001:return f'{v:.6g}'
    return f'{v:.3f}' if isinstance(v,(int,float)) else str(v)
def pct(v):return fmt(v*100)+'%' if isinstance(v,(int,float)) else fmt(v)
def table(head,rows):return '\n'.join(['|'+'|'.join(head)+'|','|'+'|'.join(['---']*len(head))+'|',*['|'+'|'.join(map(str,row))+'|' for row in rows]])
def main():
    names=['GPU_KERNEL_BENCH.json','SEARCH_ABLATION_BENCH.json','SELFPLAY_THROUGHPUT_BENCH.json','TACTICAL_SANITY_12.json']
    for name in names:
        if not (HERE/name).exists():
            if name=='SELFPLAY_THROUGHPUT_BENCH.json':
                groups=[read(p) for p in DATA.glob('P*-result.json')]
                save(HERE/name,{'status':'incomplete','groups':groups,'partialGames':[read(p) for p in DATA.glob('P*-progress.json')],'sealedAccess':0})
            elif name=='TACTICAL_SANITY_12.json':
                old=next(r for r in read(HERE/'../stage6/DEV18_SUMMARY.json') if r['id']=='C1')
                required=['p2-2-s1','p2-3-s1','p3-10-s0','p3-10-s2','p4-18-s0']
                chosen=[]
                for n in [2,3,4]:
                    a=[g for g in old['games'] if g['players']==n]
                    chosen+=([g for g in a if g['id'] in required]+[g for g in a if g['id'] not in required])[:4]
                save(HERE/name,{'status':'incomplete','baseline':chosen,'candidates':{p.stem:read(p) for p in DATA.glob('Tactical-*-result.json')},'partialGames':[read(p) for p in DATA.glob('Tactical-*-progress.json')],'sealedAccess':0})
            else:save(HERE/name,{'status':'not_run','sealedAccess':0})
    gpu,search,play,tactical=[read(HERE/n) for n in names]
    dev18=next(r for r in read(HERE/'../stage6/DEV18_SUMMARY.json') if r['id']=='C1')
    full=read(HERE/'../stage6/DEV54_SUMMARY.json')
    dev54=next(r for r in full if r['id']=='C1') if isinstance(full,list) else full
    required={'p2-2-s1','p2-3-s1','p3-10-s0','p3-10-s2','p4-18-s0'}
    chosen=[]
    for n in [2,3,4]:
        chosen+=([g for g in dev54['games'] if g['players']==n and g['id'] in required]+[g for g in dev18['games'] if g['players']==n and g['id'] not in required])[:4]
    chosen=[next(g for g in dev54['games'] if g['id']==c['id']) for c in chosen]
    assert required.issubset({g['id'] for g in chosen})
    tactical['baseline']=chosen
    tactical['baselineSource']='stage6/DEV54_SUMMARY.json，同C1权重；指定两局不在Dev18中'
    if tactical.get('status')!='complete':
        tactical['candidates']={}
        for label in ['A','B']:
            found={}
            for p in sorted(DATA.glob(f'Tactical-{label}*-progress.json')):
                for game in read(p)['games']:
                    if game['id'] in {g['id'] for g in chosen}:found[game['id']]=game
            tactical['candidates'][label]={'complete':len(found)==12,'games':list(found.values())}
    tactical['pairedCompletedResults']={}
    baseline_by_id={g['id']:g for g in chosen}
    for label,group in tactical.get('candidates',{}).items():
        games=[g for g in group['games'] if g['natural']]
        tactical['pairedCompletedResults'][label]={'completed':len(games),'baselineWinsOnSameGames':sum(baseline_by_id[g['id']]['firstPlace']==1 for g in games),'candidateWins':sum(g['won'] is True for g in games),'regressions':[g['id'] for g in games if baseline_by_id[g['id']]['firstPlace']==1 and not g['won']],'improvements':[g['id'] for g in games if baseline_by_id[g['id']]['firstPlace']!=1 and g['won']]}
    save(HERE/names[3],tactical)
    for name,result,pattern in [(names[2],play,'P*-progress.json'),(names[3],tactical,'Tactical-*-progress.json')]:
        if result.get('status')!='complete':
            result['status']='incomplete'
            result['partialGames']=[read(p) for p in DATA.glob(pattern)]
            result['reason']='用户确认保持60分钟总预算；未完成项不计作完整固定局数基准'
            save(HERE/name,result)
    # P0即使后续其他组完成，仍只有一局；整体不能被误标为完整。
    if not any(g.get('label')=='P0' and g.get('complete') for g in play.get('groups',[])):
        play['status']='incomplete';play['partialGames']=[read(p) for p in DATA.glob('P*-progress.json')]
        play['reason']='P0为1/3或不足3局；总预算内优先快检，剩余组按实际完成情况记录'
        save(HERE/names[2],play)
    play['missingGroups']=[label for label in ['P0','P1-4w','P1-6w','P2','P3'] if not any(g.get('label')==label and g.get('complete') for g in play.get('groups',[]))]
    save(HERE/names[2],play)
    for label,group in tactical.get('candidates',{}).items():group['missingIds']=[g['id'] for g in chosen if g['id'] not in {r['id'] for r in group['games']}]
    save(HERE/names[3],tactical)
    # 将原始遥测没有的S0分项改为null，避免把未测记为零成本。
    if 'S0' in search.get('groups',{}):
        for row in search['groups']['S0'].values():row['keyHashMs']=None
        search['s0KeyHashTiming']='原基线没有独立字符串序列化计时，未测，不是零成本'
        search['metricsComplete']=False
        search['missingMetrics']=['S0.keyHashMs']
        search['hashAuditChecks']=sum(r['t'].get('hashChecks',0) for r in search.get('rows',[]))
        save(HERE/names[1],search)
    after=subprocess.check_output(['git','status','--short'],cwd=ROOT).decode('utf-8')
    (HERE/'git-status-after.txt').write_text(after,encoding='utf-8')
    before=(HERE/'git-status-before.txt').read_text('utf-8-sig')
    protected=lambda s:[x for x in s.splitlines() if any(x[3:].lstrip('"').startswith(p) for p in ['src/','tools/','docs/'])]
    identity=read(HERE/'PUBLIC_SOURCE_IDENTITY.json')
    for row in identity:row['finalSha256']=sha(ROOT/row['path']);row['unchangedDuringBenchmark']=row['actual']==row['finalSha256']
    save(HERE/'PUBLIC_SOURCE_IDENTITY.json',identity)
    manifests={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'complete' if all(r.get('status')=='complete' for r in [gpu,search,play,tactical]) else 'incomplete','sealedAccess':0,'sealedEvidence':{'selection':'DEV_SELECTION.json','sourceChecks':len(read(HERE/'DEV_SELECTION.json')['reads']),'readScope':'Dev选集、Dev初态、既有Dev汇总、公共源码及固定H1权重；没有读取封存原件','osLevelReadAudit':False},'publicDirectories':{'gitStatusUnchanged':protected(before)==protected(after),'sourceFiles':len(identity),'sourceHashUnchanged':all(r['unchangedDuringBenchmark'] for r in identity),'stage6PublicSourceMatch':all(r['matches'] for r in identity)},'model':{'path':'D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final.bin','sha256':sha(Path('D:/AncientEmpiresData/continuation_stage5_20261104_v1/heads-v1/H1/final.bin'))},'processCheck':read(HERE/'FINAL_PROCESS_CHECK.json') if (HERE/'FINAL_PROCESS_CHECK.json').exists() else {'activeCount':None,'verified':False},'tests':read(HERE/'TEST_RESULT.json') if (HERE/'TEST_RESULT.json').exists() else {'status':'not_run'},'files':{n:sha(HERE/n) for n in names},'limitations':['S0独立keyHashMs未测；其总耗时包含原字符串键。','P1使用固定12局，无法达到示例24/48实际并发；比较的是4Worker/1ms和6Worker/2ms组合。','GPU矩阵为前向内核口径，不含原stage6服务逐样本CPU输出检查。','审计哈希核对包含在搜索rootMs中；G0/G1搜索未采用交错随机次序。']}
    lines=['# Speed & Quality Benchmark 实测报告','',f"交付状态：**{manifests['status']}**。正式权重 H1，GPU 档位选择 **{gpu.get('selected','未选出')}**，异构搜索选择 **{search.get('selectedHeterogeneous','未选出')}**。所有胜率只统计自然终局。",'', '## GPU 前向矩阵','',table(['档位','B','valueOnly','obs/s','均值 ms','中位数 ms','显存 MiB'],[[r['tier'],r['B'],r['valueOnly'],fmt(r['obsPerSec']),fmt(r['meanMs']),fmt(r['medianMs']),fmt(r['max_memory_allocated_mb'])] for r in gpu.get('measurements',[])]),'','数值一致性基于全部 256 个 Dev 观测；G0 作为参照。','',table(['档位','最大价值差','平均价值差','最大logit差','top1一致','top3重叠'],[[k,fmt(v['maxAbsValueProbDiff']),f"{v['meanAbsValueProbDiff']:.9g}",fmt(v['maxAbsPolicyLogitDiff']),pct(v['top1PolicyAgreement']),pct(v['top3PolicyOverlap'])] for k,v in gpu.get('consistency',{}).items()]),'',f"G3：{gpu.get('G3')}。BF16价值误差超门槛，不用于后续实测。",'', '## 搜索消融','']
    rows=[]
    quality=[]
    for mode,groups in search.get('groups',{}).items():
        for group in ['all','2','3','4']:
            r=groups[group]
            rows.append([mode,group,fmt(r['meanRootMs']),fmt(r['encodeMs']),fmt(r['priorMs']),fmt(r['networkMs']),fmt(r['keyHashMs']),fmt(r['networkCalls']),fmt(r['observations']),fmt(r['meanBatchSize'])])
            quality.append([mode,group,pct(r.get('selectedActionAgreement')),pct(r.get('top2ActionOverlap')),fmt(r.get('teacherKL')),pct(r.get('survivalVetoAgreement')),pct(r['responseCompleteRate'])])
    lines += [table(['方案','人数','根ms','编码ms','先验ms','网络ms','键ms','请求/根','观测/根','平均批'],rows),'',table(['方案','人数','选招一致','top2重叠','教师KL','否决一致','反扑闭合'],quality),'','S2 的 Infinity KL 表示 S0 有正概率的动作被紧凑候选集删除，不能解读为计算错误。S3/S4 虽显著减少网络请求，但本地先验仍有成本，且选招发生变化，必须结合自然完赛快检。','','## 全座位神经自对弈','']
    lines += [table(['方案','完成局','步/s','450步等效秒/局','等效局/小时','有效教师/小时','均值批','p95批','排队ms','GPU纯算占比'],[[r['label'],len(r['games']),fmt(r['stepsPerSec']),fmt(r['equivalentSecPer450StepGame']),fmt(r['equivalentGamesPerHour']),fmt(r['validTeacherSamplesPerHour']),fmt(r['meanPhysicalGpuBatchSize']),r['p95PhysicalGpuBatchSize'],fmt(r['queueWaitMs']),pct(r['gpuForwardFraction'])] for r in play.get('groups',[])]),'',f"自对弈状态：{play.get('status')}。尚未完成组的轨迹与进度保留于 D 盘，不能以部分样本冒充固定局数基准。",'','## 12局实战快检','']
    base=tactical.get('baseline',[])
    trows=[['已有Stage6 C1',len(base),sum(g['firstPlace']==1 for g in base),*[sum(g['firstPlace']==1 and g['players']==n for g in base) for n in [2,3,4]],fmt(avg([g['wallMs']/1000 for g in base]))]]
    for label,r in tactical.get('candidates',{}).items():
        games=r['games'];trows.append([label,len(games),sum(g['won'] is True for g in games),*[sum(g['won'] is True and g['players']==n for g in games) for n in [2,3,4]],fmt(avg([g['wallMs']/1000 for g in games]))])
    lines += [table(['方案','自然/计划完成局','独胜','2P胜','3P胜','4P胜','平均秒/局'],trows),'',f"快检状态：{tactical.get('status')}。候选未完成全部12局时不得宣称通过。逐局轮数、出局记录与墙钟见 JSON。",'','## 实测解释与使用限制','','1. FP32 数值门通过；BF16 价值误差未通过，不能因为大批吞吐高就投入教师生产。','2. 在本次串行搜索中，S1 未体现端到端提速；GPU大批内核吞吐不能直接折算为棋局速度。','3. S2/S4 的搜索加速伴随选招及教师分布变化。实战快检未完成或未通过前，不替换正式冠军配置。','4. P1 的两档实际均最多12并发局，无法据此推断24/48并发性能。','5. 具体计时范围、恢复尝试、配额和截断定义见 PROTOCOL.md。','','## 完整性核对','',f"公共目录 git status 未新增变化：{manifests['publicDirectories']['gitStatusUnchanged']}；182份公共源码与Stage6身份核对：{manifests['publicDirectories']['stage6PublicSourceMatch']}；收尾哈希保持：{manifests['publicDirectories']['sourceHashUnchanged']}。",'',f"封存访问计数：0；进程检查：{manifests['processCheck']}；公共测试：{manifests['tests']}。",'']
    missing=[]
    for label,count in [('P0',3),('P1-4w',12),('P1-6w',12),('P2',18),('P3',18)]:
        if any(g['label']==label and g.get('complete') for g in play.get('groups',[])):continue
        partial=next((g for g in play.get('partialGames',[]) if g['label']==label),{'games':[]})
        games=partial['games'];seconds=sum(g['wallMs']/1000 for g in games)
        missing.append([label,f'{len(games)}/{count}','部分运行' if games or (DATA/f'{label}-inputs.json').exists() else '未启动',fmt(sum(g['steps'] for g in games)/seconds if seconds else None)])
    if missing:
        index=lines.index('## 12局实战快检')
        lines[index:index]=['未完成组及已自然结束子集（下面的步/s仅为子集诊断，不是整组吞吐）：','',table(['方案','已完成/要求','状态','完赛子集步/s'],missing),'']
    if gpu.get('consistencyValueOnly'):
        index=lines.index('## 搜索消融')
        lines[index:index]=['纯价值一致性补充（全部256样本；策略指标不适用）：','',table(['档位','相对G0最大价值差','相对G0平均价值差','完整/纯价值最大差'],[[tier,fmt(r['maxAbsValueProbDiff']),fmt(r['meanAbsValueProbDiff']),fmt(r['fullVersusValueOnlyMaxAbsDiff'])] for tier,r in gpu['consistencyValueOnly'].items()]),'']
    lines += ['正式快检名单采用 Dev54 同C1记录补齐指定的 p2-2-s1、p2-3-s1；这两局不在既有 Dev18 中。额外 p2-8-s0/p2-8-s1 保留为诊断，不计入正式12局。','']
    lines += ['已完赛子集的同局号配对（不代表完整12局结论）：','',table(['候选','配对局数','这些局的基线胜数','候选胜数','基线胜而候选负的局号'],[[label,r['completed'],r['baselineWinsOnSameGames'],r['candidateWins'],', '.join(r['regressions']) or '无'] for label,r in tactical.get('pairedCompletedResults',{}).items()]),'']
    lines += ['按完成时间截取的子集存在终局耗时选择偏差，只能确认具体案例，不作整体胜率推断。','']
    lines=[s.replace('P1 的两档实际均最多12并发局，无法据此推断24/48并发性能。','P1 原型配置每组最多12并发局，但本次未完成实测；不存在24/48并发性能证据。') for s in lines]
    if (HERE/'GPU_PROBE_SHUTDOWN.json').exists():lines += ['数值核验结果已完整落盘；之后回收延迟退出的Python启动器，使 valueOnlyCheckExitCode 为1。回收时计算子进程已自行退出，延迟原因未确定；退出记录与数值结果分别保留，不把该进程退出码记为通过。','']
    (HERE/'SPEED_BENCH_REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
    manifests['files']['SPEED_BENCH_REPORT.md']=sha(HERE/'SPEED_BENCH_REPORT.md')
    manifests['sources']={p.name:sha(p) for p in HERE.iterdir() if p.suffix in ['.py','.ts','.mjs']}
    manifests['gitHead']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    manifests['activeCount']=manifests['processCheck'].get('activeCount')
    manifests['dataFiles']={str(p.relative_to(DATA)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in DATA.rglob('*') if p.is_file()}
    manifests['snapshotToCloseoutSeconds']=datetime.datetime.now().timestamp()-(HERE/'git-status-before.txt').stat().st_ctime
    manifests['wallBudgetMinutes']=60
    manifests['userReconfirmedBudget']=True
    manifests['numericChecksPersisted']=len(gpu.get('consistencyValueOnly',{}))==3
    if (HERE/'GPU_PROBE_SHUTDOWN.json').exists():
        manifests['gpuProbeShutdown']=read(HERE/'GPU_PROBE_SHUTDOWN.json')
        manifests['verificationNotes']='数值结果全部落盘；探测启动器回收导致valueOnlyCheckExitCode非零，不将该退出码解释为数值校验通过。具体数值及退出记录分别保留。'
    save(HERE/'BENCHMARK_MANIFEST.json',manifests)
if __name__=='__main__':main()
