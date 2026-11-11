"""封存闭合后的静态交付审计与报告口径补充；不执行引擎、前向或重选。"""
from collections import Counter
import json
from pathlib import Path
import shutil
from context import HERE, S3, ROOT, BASE, DATA, core, read, sha, save_new, now, validate


def bound(summary,key):
    groups=[summary['byPlayers'][str(n)] for n in [2,3,4]]
    if key=='rank':
        lower=sum((g['normalizedRank'] or 0)*g['natural']/g['attempted'] for g in groups)/3
    else:
        lower=sum(g['wins']/g['attempted'] for g in groups)/3
    upper=lower+sum((g['attempted']-g['natural'])/g['attempted'] for g in groups)/3
    return [lower,upper]


def audit_arena(name,expected):
    folder=DATA/name;summary=read(folder/'SUMMARY.json')
    assert summary['complete'] and summary['attempted']==expected and len(summary['games'])==expected
    ids=[g['id'] for g in summary['games']]
    assert len(set(ids))==expected and len(list(folder.glob('*/result.json')))==expected
    records=0
    for game in summary['games']:
        case=folder/game['id'];assert read(case/'result.json')==game
        previous=None;count=0
        with (case/'steps.jsonl').open(encoding='utf-8') as stream:
            for line in stream:
                row=json.loads(line);assert row['step']==count
                if previous is not None:assert previous==row['before']
                previous=row['after'];count+=1
        assert count==game['steps'];records+=count
        if game['natural']:
            assert game['classification'] in ['natural_win','natural_draw','natural_loss']
            assert game['firstPlace'] in [0,1] and 0<=game['normalizedRank']<=1
            assert read(case/'final.json')['winner'] is not None
        else:
            assert game['normalizedRank'] is None and game['firstPlace'] is None
    for n in [2,3,4]:
        rows=[g for g in summary['games'] if g['players']==n];group=summary['byPlayers'][str(n)]
        assert group['attempted']==len(rows) and group['natural']==sum(g['natural'] for g in rows)
        assert group['wins']==sum(bool(g['firstPlace']) for g in rows)
        assert group['truncations']==sum('truncation' in g['classification'] for g in rows)
        assert group['errors']==sum(g['classification']=='runtime_error' for g in rows)
        assert group['timeForfeits']==sum(g['classification']=='time_forfeit' for g in rows)
    return dict(attempted=expected,natural=sum(g['natural'] for g in summary['games']),
                stepRecords=records,staticChainPassed=True,summarySha256=sha(folder/'SUMMARY.json'))


def main():
    contract=validate()
    assert read(DATA/'RUN_CLOSED.json')['backgroundChildrenRemaining']==0
    processes=read(HERE/'EVALUATION_PROCESS_CHECK.json');assert processes['processCount']==0
    assert not (DATA/'RUN_BLOCKED.json').exists()
    lock=read(S3/'FINAL_CANDIDATE_LOCK.json')
    attempt=read(DATA/'FINAL_TEST_ATTEMPT.json')
    assert attempt['candidateLockSha256']==sha(S3/'FINAL_CANDIDATE_LOCK.json')
    assert read(BASE/'FINAL_TEST_ATTEMPT.json')==attempt==read(S3/'FINAL_TEST_ATTEMPT.json')
    assert read(DATA/'SEALED_TEST_CLOSED.json')['testRuns']==1
    jobs=[(f'dev-{u:06d}-prior-{s}',54) for u in [40000,100000,80000] for s in [.3,1.]]
    jobs += [('historical-final',40),('test-baseline',54),('test-candidate',54)]
    arenas={name:audit_arena(name,total) for name,total in jobs}
    assert sum(v['attempted'] for v in arenas.values())==472
    panel=read(S3/'OMNI_ARENA_TEST_PANEL.json');expected={r['id']:(r['seed'],r['seat'],r['slot']) for r in panel['matches']}
    for side in ['baseline','candidate']:
        summary=read(DATA/f'test-{side}/SUMMARY.json')
        assert {g['id']:(g['seed'],g['seat'],g['slot']) for g in summary['games']}==expected
    cache=read(DATA/'sealed-cache/COMPLETE.json');assert cache['parents']==329 and cache['sealed']
    for side in ['baseline','candidate']:
        with (DATA/f'sealed-{side}-offline/samples.jsonl').open(encoding='utf-8') as stream:
            rows=[json.loads(line) for line in stream]
        assert Counter(r['priorScale'] for r in rows)==Counter({1.:cache['samples'],.3:cache['samples'],0.:cache['samples']})
        assert len({r['parentId'] for r in rows})==329 and all(r['split']=='test' and r['corpus']=='new' for r in rows)
    manifest=read(S3/'OMNI_BASE_MODEL_MANIFEST.json')
    for artifacts in manifest['models'].values():
        for record in artifacts.values():assert sha(record['path'])==record['sha256']
    base=read(DATA/'test-baseline/SUMMARY.json');candidate=read(DATA/'test-candidate/SUMMARY.json')
    comparison=read(S3/'FINAL_PAIRED_COMPARISON.json')
    bounds={key:dict(baseline=bound(base,key),candidate=bound(candidate,key)) for key in ['rank','win']}
    for value in bounds.values():
        value['pairedPointDeltaBounds']=[value['candidate'][0]-value['baseline'][1],value['candidate'][1]-value['baseline'][0]]
    original_evidence=read(S3/'EVIDENCE_MANIFEST.json')
    for name,record in original_evidence['files'].items():
        assert Path(name).stat().st_size==record['bytes'] and sha(name)==record['sha256'],name
    archive=DATA/'delivery-annotation-v1';archive.mkdir(exist_ok=False)
    for source,name in [(S3/'REPORT.md','REPORT.original.md'),(S3/'EVIDENCE_MANIFEST.json','EVIDENCE.original.json'),(S3/'REVIEW_REQUEST.json','REVIEW_REQUEST.original.json')]:
        shutil.copy2(source,archive/name)
    assert sha(DATA/'REPORT.md')==sha(S3/'REPORT.md')
    extra=['','## 最终静态审计补充：非自然结果与评分口径','',
           '本补充只澄清已经完成的固定验收记录，不修改候选、先验、面板、评分算法或任何对局结果；原报告与原证据清单保留在D盘delivery-annotation-v1。',
           '| 人数 | 基线自然/计划 | 候选自然/计划 | 基线截断/错误/超时 | 候选截断/错误/超时 | 完整配对95%区间 |',
           '|---:|---:|---:|---|---|---|']
    for n in [2,3,4]:
        b=base['byPlayers'][str(n)];c=candidate['byPlayers'][str(n)];p=comparison['byPlayers'][str(n)]
        extra.append(f'| {n}P | {b["natural"]}/{b["attempted"]} | {c["natural"]}/{c["attempted"]} | {b["truncations"]}/{b["errors"]}/{b["timeForfeits"]} | {c["truncations"]}/{c["errors"]}/{c["timeForfeits"]} | {p["firstPlace"]["ci95"]} |')
    extra.extend(['',
                  '正文的等权综合评分采用预先规则：各人数按计划局数作分母，非自然局对排名/独胜评分贡献暂记0，属于保守评分，不是补造自然负局；真实未知自然结果仍只知位于0到1之间。含非自然局的人数组不生成完整配对变化或置信区间。',
                  f'不补造结果的综合分上下界：`{json.dumps(bounds,ensure_ascii=False)}`。这是分数缺失的确定性界限，不是置信区间；点估计或界限有利也不代表统计显著，更不能据此补齐三人验收结论。',
                  '候选三人p3-10-s0在5537个动作、200回合增量处截断，三席仍存活，winner为空；没有继续该局或重跑。只对已保存终态和动作计数作静态统计，见acceptance_v1/SEALED_TRUNCATION_AUDIT.json。',
                  '验收执行与工程交付完成，不等于所有人数的棋力提升均已得到完整统计确认。应用默认模型保持原状；本次没有进入第四阶段。',
                  f'静态核验覆盖472局新尝试（开发324＋历史40＋封存基线/候选108），及其{sum(v["stepRecords"] for v in arenas.values()):,}条动作记录计数和摘要链；开发54局旧基线为复用，不重复计入新尝试。所有评测进程已退出。'])
    updated=readme=(S3/'REPORT.md').read_text('utf-8')+'\n'.join(extra)+'\n'
    (S3/'REPORT.md').write_text(updated,'utf-8');(DATA/'REPORT.md').write_text(updated,'utf-8')
    audit=dict(schema='stage3-final-static-delivery-audit-v1',passed=True,scope='身份、预算、静态摘要链与产物；不代表全人数棋力全面验收通过',
               created=now(),acceptanceContractSha256=contract,selectedCandidate=lock['candidate'],
               newGameAttempts=472,reusedBaselineDevelopmentGames=54,arenas=arenas,staticStepChainsOnly=True,
               newEngineSteps=0,newForwards=0,newTrainingUpdates=0,uniqueSealedRuns=1,
               sealedOfflineParents=329,sealedOfflineStates=cache['samples'],missingOutcomeBounds=bounds,
               completePairedConfidenceByPlayers={n:v['naturalPaired']==v['planned'] for n,v in comparison['byPlayers'].items()},
               evaluationProcessesRemaining=0,sourceReportSha256=sha(archive/'REPORT.original.md'),finalReportSha256=sha(S3/'REPORT.md'),
               selectionAndSealedResultsUnchanged=True,uiDeployed=False,stage4Started=False)
    save_new(HERE/'DELIVERY_AUDIT.json',audit);save_new(DATA/'DELIVERY_AUDIT.json',audit)
    note=f'''# 第三阶段最终交付

唯一候选：{lock['candidate']['update']}更新，推理priorScale={lock['candidate']['priorScale']}。执行、封存一次性预算与产物静态审核已闭合；三人有回合截断，不能将交付完成等同于全人数棋力全面通过。

- [完整报告](REPORT.md)
- [模型、检查点与推理配置清单](OMNI_BASE_MODEL_MANIFEST.json)
- best：[推理权重](best/final.bin)、[元数据](best/final.json)、[完整续训状态](best/checkpoint.pt)
- last（100k终点）：[推理权重](last/final.bin)、[元数据](last/final.json)、[完整续训状态](last/checkpoint.pt)
- [最终静态审计](DELIVERY_AUDIT.json)、[证据清单](EVIDENCE_MANIFEST.json)

已保留全部原件、被否决探针与报告版本；未部署应用模型、加训、重跑封存或启动第四阶段。开发异常与测试截断均按原规则保留，详见报告。
'''
    (DATA/'README.md').write_text(note,'utf-8')
    files=dict(original_evidence['files'])
    additions=[S3/'REPORT.md',DATA/'REPORT.md',HERE/'DELIVERY_AUDIT.json',DATA/'DELIVERY_AUDIT.json',DATA/'README.md',
               HERE/'EVALUATION_PROCESS_CHECK.json',Path(__file__),*archive.iterdir()]
    for path in additions:files[str(path)]=dict(bytes=path.stat().st_size,sha256=sha(path))
    evidence=dict(original_evidence,created=now(),files=files,reportAnnotation=dict(kind='静态统计口径补充，不修改任何评测',originalEvidenceSha256=sha(archive/'EVIDENCE.original.json'),audit=str(HERE/'DELIVERY_AUDIT.json')))
    core.save(S3/'EVIDENCE_MANIFEST.json',evidence);core.save(DATA/'EVIDENCE_MANIFEST.json',evidence)
    request=read(S3/'REVIEW_REQUEST.json')
    request.update(evidenceSha256=sha(S3/'EVIDENCE_MANIFEST.json'),reportSha256=sha(S3/'REPORT.md'),deliveryAudit=str(HERE/'DELIVERY_AUDIT.json'),
                   allPlayerStrengthStatisticallyConfirmed=False,reportAnnotationOriginal=str(archive/'REPORT.original.md'))
    core.save(S3/'REVIEW_REQUEST.json',request)
    print(json.dumps(dict(delivered=True,report=str(S3/'REPORT.md'),data=str(DATA),candidate=lock['candidate'],bounds=bounds,
                          newAttempts=472,sealedRuns=1,evaluationProcessesRemaining=0),ensure_ascii=False),flush=True)


if __name__=='__main__':
    main()
