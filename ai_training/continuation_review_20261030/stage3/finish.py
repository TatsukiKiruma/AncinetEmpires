"""开发候选选择、聚类区间、最终模型恢复与交付清单；封存成绩不参与选择。"""
from collections import defaultdict
import copy
import hashlib
import json
from pathlib import Path
import random
import shutil
import struct
from core import HERE, STAGE1, ROOT, DATA, legacy, torch, read, save, validate


def candidates():
    diagnostics=read(DATA/'training/DIAGNOSTICS.json')
    available={d['update']:d for d in diagnostics}
    points=[u for u in read(HERE/'CONFIG.json')['candidateUpdates'] if u in available]
    feasible=[d for d in diagnostics if not d['degraded']]
    pool=feasible or diagnostics
    best=min(pool,key=lambda d:(d['newDev']['policyNll'],d['newDev']['brier']))['update']
    if best not in points:
        points.append(best)
    if len(points)>3 or not points:
        raise ValueError('开发实战候选数不合合同')
    save(HERE/'DEV_CANDIDATES.json',dict(updates=points,additionalOfflineBest=best,
         checkpoints={str(u):available[u]['checkpoint'] for u in points},
         testAccessed=False,method='预定40k/100k可用节点，加至多一个未退化且new/dev NLL最优节点'))
    return points


def select():
    rows=[]
    for u in read(HERE/'DEV_CANDIDATES.json')['updates']:
        offline=read(DATA/f'training/offline-{u:05d}/RESULT.json')
        for scale in [.3,1.]:
            arena=read(DATA/f'dev-{u:05d}-prior-{scale}/SUMMARY.json')
            group=[arena['byPlayers'][str(n)] for n in [2,3,4]]
            rank=sum((g['normalizedRank'] or 0)*g['natural']/g['attempted'] for g in group)/3
            win=sum(g['wins']/g['attempted'] for g in group)/3
            new=offline['buckets'][f'{scale}/new/dev']['parentEqual']
            old=offline['buckets'][f'{scale}/old/dev']['parentEqual']
            rows.append(dict(update=u,priorScale=scale,allNatural=arena['allNatural'],rank=rank,win=win,
                newNll=new['policyNll'],oldBrier=old['brier'],arena=str(DATA/f'dev-{u:05d}-prior-{scale}/SUMMARY.json')))
    rows.sort(key=lambda r:(not r['allNatural'],-r['rank'],-r['win'],r['newNll'],r['oldBrier'],r['update'],r['priorScale']))
    best=rows[0]
    checkpoint=read(HERE/'DEV_CANDIDATES.json')['checkpoints'][str(best['update'])]
    source=DATA/f'training/model-{best["update"]:05d}'
    lock=dict(schema='stage3-unique-final-candidate-v1',candidate=best,checkpoint=checkpoint,
        sourceModel=str(source),modelSha256=legacy.sha(source.with_suffix('.bin')),
        metadataSha256=legacy.sha(source.with_suffix('.json')),contractSha256=validate(),
        developmentOrdering=rows,sealedForwardBeforeLock=0,sealedRawAccessBeforeLock=0,
        limitation='未观察封存成绩；若所有候选存在非自然局，仍选开发保守排序最佳，不能宣称通过棋力验收')
    if (HERE/'FINAL_CANDIDATE_LOCK.json').exists():
        raise ValueError('最终候选已锁定，不允许重选')
    save(HERE/'FINAL_CANDIDATE_LOCK.json',lock)
    for kind,record in [('best',checkpoint),('last',read(DATA/'training/LATEST.json'))]:
        folder=DATA/kind; folder.mkdir(exist_ok=False)
        shutil.copy2(record['file'],folder/'checkpoint.pt')
        if legacy.sha(folder/'checkpoint.pt')!=record['sha256']:
            raise ValueError('交付完整检查点复制摘要不符')
        state=torch.load(folder/'checkpoint.pt',map_location='cpu',weights_only=False)
        model=legacy.load_model(); model.load_state_dict(state['model']); model.export(folder/'final')
    return lock


def parity_reference():
    # 复用阶段一已冻结的独立训练前态夹具，避免任何新增测试读取。
    raw=(STAGE1/'parity.frames').read_bytes()
    (HERE/'parity.frames').write_bytes(raw)
    model=legacy.load_model(DATA/'best/final').accurate_reductions().eval()
    from data import decode
    refs=[]; offset=0
    with torch.no_grad():
        while offset<len(raw):
            ms,bs=struct.unpack_from('<II',raw,offset);offset+=8
            meta=json.loads(raw[offset:offset+ms]);offset+=ms
            payload=raw[offset:offset+bs];offset+=bs
            rows=decode(dict(meta,sources=[{}]),payload)
            for row in rows:
                out=model(row)
                refs.append(dict(id=len(refs),outputs={k:out[k].tolist() for k in ['logits','valueLogits','valueProbs']}))
    save(HERE/'parity-reference.json',refs)


def clustered(base,candidate):
    rng=random.Random(20261101)
    reports={}
    b={r['id']:r for r in base['games']}; c={r['id']:r for r in candidate['games']}
    if set(b)!=set(c):
        raise ValueError('配对比赛身份不齐')
    for n in [2,3,4]:
        rows=[(b[k],c[k]) for k in b if b[k]['players']==n]
        byslot=defaultdict(list)
        for x,y in rows:
            if x['initialSha256']!=y['initialSha256'] or x['seed']!=y['seed'] or x['seat']!=y['seat']:
                raise ValueError('配对初态/种子/席位不符')
            byslot[x['slot']].append((x,y))
        report=dict(slots=len(byslot),planned=len(rows),naturalPaired=sum(x['natural'] and y['natural'] for x,y in rows))
        complete=report['naturalPaired']==len(rows)
        for key in ['firstPlace','normalizedRank']:
            if not complete:
                report[key]=dict(pairedDelta=None,ci95=None,reason='存在非自然结果，不补造完整配对成绩')
                continue
            clusters=list(byslot.values())
            values=[]
            for _ in range(10000):
                sampled=[pair for cluster in rng.choices(clusters,k=len(clusters)) for pair in cluster]
                values.append(sum(y[key]-x[key] for x,y in sampled)/len(sampled))
            values.sort()
            report[key]=dict(baseline=sum(x[key] for x,y in rows)/len(rows),candidate=sum(y[key] for x,y in rows)/len(rows),
                pairedDelta=sum(y[key]-x[key] for x,y in rows)/len(rows),ci95=[values[249],values[9749]])
        reports[str(n)]=report
    return dict(byPlayers=reports,bootstrap=10000,unit='初态槽聚类，包含轮换席位',seed=20261101,
                caveat='每组仅4至10个初态槽，区间较粗；已知官方图，不代表未知地图泛化')


def report():
    validate()
    lock=read(HERE/'FINAL_CANDIDATE_LOCK.json')
    train=read(DATA/'training/RESULT.json')
    base=read(DATA/'test-baseline/SUMMARY.json'); final=read(DATA/'test-candidate/SUMMARY.json')
    comparison=clustered(base,final)
    save(HERE/'FINAL_PAIRED_COMPARISON.json',comparison)
    manifest=dict(schema='stage3-omni-base-model-v1',candidate=lock['candidate'],
        baseCheckpointSha256=legacy.BASE_SHA,contractSha256=validate(),
        exportParity=read(HERE/'EXPORT_PARITY.json'),models={})
    for kind in ['best','last']:
        manifest['models'][kind]={name:dict(path=str(DATA/kind/name),sha256=legacy.sha(DATA/kind/name)) for name in ['checkpoint.pt','final.bin','final.json']}
    base_state=torch.load(legacy.BASE,map_location='cpu',weights_only=False)
    integrity={}
    for kind in ['best','last']:
        state=torch.load(DATA/kind/'checkpoint.pt',map_location='cpu',weights_only=False)
        model=legacy.load_model(DATA/kind/'final')
        assert legacy.tensor_digest(model.state_dict())==legacy.tensor_digest(state['model'])
        assert state['sampler']['cursor']==state['updates']*32
        assert state['contractSha256']==validate() and state['baseCheckpointSha256']==legacy.BASE_SHA
        increments=[float(v['step'])-float(base_state['optimizer']['state'][k]['step']) for k,v in state['optimizer']['state'].items()]
        assert set(increments)=={float(state['updates'])}
        for v in state['model'].values():
            assert bool(torch.isfinite(v).all())
        for v in state['optimizer']['state'].values():
            assert bool(torch.isfinite(v['exp_avg']).all()) and bool(torch.isfinite(v['exp_avg_sq']).all())
        integrity[kind]=dict(updates=state['updates'],samples=state['sampler']['cursor'],
            allAdamWStepIncrementsCorrect=True,exportTensorExact=True,allFinite=True,
            samplerRngSaved=True,dropoutRngSaved='dropoutRng' in state,
            noPendingGradients=not state['pendingAccumulatedGradients'])
    save(HERE/'CHECKPOINT_INTEGRITY.json',integrity)
    save(HERE/'OMNI_BASE_MODEL_MANIFEST.json',manifest)
    metrics=[json.loads(line) for line in (DATA/'training/METRICS.jsonl').read_text('utf-8').splitlines()]
    assert [r['update'] for r in metrics]==list(range(1,train['updates']+1))
    summary=dict(recordedUpdates=len(metrics),expectedUpdates=train['updates'],
        gradientClipRate=sum(r['clipped'] for r in metrics)/len(metrics),
        priorDropped=sum(r['priorDropped'] for r in metrics),
        dropoutRate=sum(r['priorDropped'] for r in metrics)/(len(metrics)*32),
        forcedPolicyMasked=sum(r['forcedPolicyMasked'] for r in metrics),
        policyDenominator=sum(r['policyDenominator'] for r in metrics),
        exposure=train['exposures'])
    save(HERE/'TRAINING_AUDIT.json',summary)
    curves=[]
    for d in train['diagnostics']:
        result=read(Path(d['offline']))
        for scale in [1.,.3,0.]:
            for corpus in ['old','new']:
                v=result['buckets'][f'{scale}/{corpus}/dev']['parentEqual']
                curves.append(dict(update=d['update'],priorScale=scale,corpus=corpus,**v))
    save(HERE/'OFFLINE_CURVES.json',curves)
    historical=read(HERE/'HISTORICAL_PRESERVATION.json')['files']
    changed=[p for p,digest in historical.items() if legacy.sha(ROOT/p)!=digest]
    save(HERE/'HISTORICAL_PRESERVATION_VERIFIED.json',dict(files=len(historical),changed=changed,passed=not changed))
    if changed:
        raise ValueError('阶段一二历史文件身份发生改变')
    text=['# 第三阶段全人数均衡精调与验收报告','',
        f'正式更新 {train["updates"]:,} 次，原子暴露 {train["samples"]:,}，停止原因：{train["stopReason"] or "完成预算"}。',
        f'唯一最终候选：{lock["candidate"]["update"]:,} 更新，推理先验 {lock["candidate"]["priorScale"]}。未替换应用默认模型，未启动第四阶段。','',
        '从原始2414完整1,966,910参数与AdamW一/二阶矩恢复，未串接阶段二权重。有效批32、四个真实微批8；通过保留原图边界、掩码组归一化、奇数边有效池化和面积分母进行异尺寸批处理，策略与价值分别使用整个32样本有效掩码的精确分母。四路独立权威编码及只读预取不推进已消费游标。',
        '100样本配额周期严格17旧双人/17新双人/33三人/33四人，层内按类别、来源、隔离组、父局、阶段抽样。10万次配额与游标恢复证据见SAMPLING_VERIFIED.json。抽样有放回；3,200,000是名义暴露预算，不保证唯一状态一整遍。单候选保留价值，策略分母排除。',
        f'梯度累加相对L2：{read(HERE/"NUMERICAL_VERIFIED.json")["relativeL2"]:.8g}；裁剪率：{summary["gradientClipRate"]:.4%}（阶段二1e-4为99.96%）；实际先验dropout率：{summary["dropoutRate"]:.4%}。','',
        '| 更新 | 先验 | 分区 | NLL | Brier |','|---:|---:|---|---:|---:|']
    text.extend(f'| {r["update"]} | {r["priorScale"]} | {r["corpus"]}/dev | {r["policyNll"]:.6f} | {r["brier"]:.6f} |' for r in curves)
    text.extend(['','| 人数 | 基线自然胜/自然局 | 候选自然胜/自然局 | 归一名次变化 | 胜率变化95%聚类区间 |','|---:|---:|---:|---|---|'])
    for n in [2,3,4]:
        b=base['byPlayers'][str(n)];c=final['byPlayers'][str(n)];p=comparison['byPlayers'][str(n)]
        text.append(f'| {n}P | {b["wins"]}/{b["natural"]} | {c["wins"]}/{c["natural"]} | {p["normalizedRank"]["pairedDelta"]} | {p["firstPlace"]["ci95"]} |')
    text.extend(['','开发排序见FINAL_CANDIDATE_LOCK.json，所有开发逐局原件及截断/错误在D盘dev-*目录。最终锁定后才物化测试初态，基线与唯一候选仅一次配对验收；测试结果不反馈训练。329父局每阶段最多一个固定中位前态，全人数×七类×来源×地形分层见sealed-candidate-offline/RESULT.json。',
        '独胜与淘汰顺序名次分分别统计；截断、时间判负和运行错误均不计自然胜，存在非自然配对时完整变化与区间留空。胜败归因仅可依据实际逐局记录，不能仅凭NLL认定战术原因。不同先验、席位、地图及存活次序可在逐局结果追溯；小面板不支持稳定统计显著结论。',
        '八张官方双人标准开局属于已知地图，开发/测试种子不同但标准初态共享，不应宣称状态隔离或未知地图泛化；附加父局场景及多人父局依照冻结分区隔离。对手为项目困难AI复刻，不是APK原生人机。地形可信度保持原始标记。',
        '数值与导出检查、阶段一二历史逐文件SHA核验见对应JSON。公共规则/UI未改，未重跑公共lint/test/build，不记作通过；训练历史全量套件的既有失败未以本次定向检查替代。',
        '',f'D盘完整产物：{DATA}。best/last均包含完整checkpoint.pt和final.bin/final.json；跨语言校验见EXPORT_PARITY.json，摘要见OMNI_BASE_MODEL_MANIFEST.json。'])
    (HERE/'REPORT.md').write_text('\n'.join(text)+'\n','utf-8')
    files=[p for p in HERE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='EVIDENCE_MANIFEST.json']
    evidence={str(p.relative_to(ROOT)):dict(bytes=p.stat().st_size,sha256=legacy.sha(p)) for p in files}
    for p in DATA.rglob('*'):
        if p.is_file() and p.suffix in ['.json','.pt','.bin','.jsonl'] and not any(part.startswith('miopen') for part in p.parts):
            evidence[str(p)]=dict(bytes=p.stat().st_size,sha256=legacy.sha(p))
    save(HERE/'EVIDENCE_MANIFEST.json',dict(files=evidence,finalCandidateLocked=True,finalTestRuns=1))


if __name__=='__main__':
    import sys
    globals()[sys.argv[1]]()
