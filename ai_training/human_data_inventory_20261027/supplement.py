"""核对现存收据链、清理影响、归档目录和训练接口；不推进任何游戏状态。"""
import collections
import csv
import gzip
import hashlib
import json
import math
import tarfile
import zipfile
from pathlib import Path
from inventory import ROOT, OUT, read, sha, save, check, checks

packets = read(OUT/'accepted-packets.json')
chain_results = []
state_splits = collections.defaultdict(set)
for row in packets:
    p = ROOT/row['path']
    receipt = read(p.parent.parent/'receipts'/f"{row['responseSha256']}.json")
    check(p,receipt['packet']['sha256'],'packet_receipt')
    prior = None; n = 0; ok = True; end = None; macro = None
    with gzip.open(p,'rt',encoding='utf8') as f:
        for line in f:
            d=json.loads(line)
            if d['kind']=='game':prior=d['effectiveInitialStateHash']
            elif d['kind']=='macro':macro=d['macro']
            elif d['kind']=='atomic':
                ok &= d['atomic']==n and d['beforeHash']==prior and d['macro']==macro
                prior=d['afterHash'];n+=1
                if d['labels']['policyMask'] and d['action']['type']!='surrender':
                    state_splits[d['beforeHash']].add(row['splitRecord']['split'])
            elif d['kind']=='end':end=d
    ok &= bool(end and end['accepted'] and end['fullyConsumed'] and n==receipt['atomicActions'] and prior==receipt['finalStateHash']==end['finalStateHash'])
    chain_results.append({'responseSha256':row['responseSha256'],'savedHashChainMatches':bool(ok),'atoms':n})
save('saved-packet-chain.json',{'note':'仅保存字段的相等性及行序检查，不是规则重放或状态等价验证。','packets':chain_results,
    'savedBeforeHashUnique':len(state_splits),'trainDevSharedSavedHash':sum(len(s)>1 for s in state_splits.values())})
final=read(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX_FINAL.json')
lookup={}
for e in read(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX.json')['selectedPrefixPolicySources']:
    with gzip.open(ROOT/e['packet']['path'],'rt',encoding='utf8') as f:
        lookup[e['responseSha256']]={i:json.loads(line) for i,line in enumerate(f,1)}
prefix_ok=True
with gzip.open(final['policyFiles']['admitted']['path'],'rt',encoding='utf8') as f:
    for line in f:
        row=json.loads(line); saved=lookup[row['responseSha256']][row['packet']['jsonlLine']]
        prefix_ok &= saved['atomic']==row['atomic'] and saved['beforeHash']==row['canonicalBeforeHash'] and saved['actionCode']==row['actionCode'] and (saved['controller']['type']==1)==row['humanController'] and not row['valueMask'] and not row['returnMask']
save('prefix-pointer-check.json',{'admittedRows':2077,'allSavedPointersMatch':prefix_ok,'staticOnly':True})
splits=read(ROOT/'ai_training/pretrain_preflight_20261022/DATA_SPLITS.json')
exclusion=[check(x['path'],x['sha256'],'exclusion_index') for x in splits['exclusionIndexes']]
delivery=read(ROOT/'ai_training/dual_stream_v2_phase3_20261020/DELIVERY_MANIFEST.json')['files']
corpus=[check(p,d['sha256'],'old_corpus') for p,d in delivery.items() if '/corpus/' in p]
deleted=[]
with (ROOT/'ai_training/cleanup_20261025_round2/deleted.jsonl').open(encoding='utf8') as f:
    targets={x['path'] for x in exclusion+corpus}
    for line in f:
        d=json.loads(line)
        if d['path'].replace('\\','/') in targets:deleted.append(d)
save('availability-gaps.json',{'exclusionIndexes':exclusion,'stage3Corpus':corpus,'matchedDeletionRecords':deleted,
 'meaning':'旧最终过滤收据仍可证明当时2077行通过；缺失全集不能支持对新样本声称已完成同一全集过滤。'})
sync=read(ROOT/'ai_training/phone_2m_continue1000_20261025/completion/SYNC_RECEIPT.json')
model_checks=[check(x['local'],x['sha256'],'model2000_completion') for x in sync['files']]
protocol=read(ROOT/'ai_training/phone_2m_continue1000_20261025/PROTOCOL.json')
step=sync['complete']['globalStep'];warm=math.ceil(protocol['referenceTotalUpdates']*protocol['warmupFraction'])
lr=protocol['endLearningRate']+(protocol['peakLearningRate']-protocol['endLearningRate'])*.5*(1+math.cos(math.pi*(step-warm)/(protocol['referenceTotalUpdates']-warm)))
save('model-reference.json',{'all105FileHashesMatch':all(x['matches'] for x in model_checks),'checks':model_checks,'complete':sync['complete'],
 'calculatedNextLearningRate':lr,'warmupUpdates':warm,'note':'仅核对本地已完成2000局参考；未读取或干预414局活动作业。'})
campaign=read(ROOT/'captures/campaign-replays-20261025/replay-audit.json')
native=[]
for row in campaign:
    p=ROOT/'captures/campaign-replays-20261025/native-results'/f"{row['id']}.json"
    d=read(p);check(p,scope='campaign_receipt')
    native.append({'id':row['id'],'matchesEmbeddedReceipt':d==row['native']})
assets=read(ROOT/'captures/campaign-training-analysis-20261025/assets.json')['stages']
for a in assets:
    for k in ['scriptFile','mapFile']:check(ROOT/'captures/campaign-training-analysis-20261025'/a[k],scope='campaign_plain_resource')
save('campaign-resources.json',{'nativeReceiptComparisons':native,'stageControllerConfigs':[{'stage':f"{a['campaign']}-{a['stage']+1}",'playerTeams':a['playerTeams'],'robotTeams':a['robotTeams']} for a in assets],
 'snapshotEvidence':'原生验收保存终态摘要及结果，没有逐决策完整状态。控制者仅有初始关卡配置，不能替代逐动作控制者。'})
# 查阅保留的旧归档目录，不解压、不改写原件，也不扫描当前手机部署包。
archive_paths=[ROOT/x['path'] for x in read(ROOT/'ai_training/cleanup_20261025_round2/legacy-archive-retained.json')]
archive_paths += list((ROOT/'captures').glob('*.zip'))+[ROOT/'ai_training/v17/archive/v16_20260926_core_reviewed.zip',ROOT/'captures/phone-pilot-20261014/verify.zip',ROOT/'captures/phone-pilot-20261014/stopped.tar']
archive_results=[]
raw_known={x['sha256'] for x in read(OUT/'raw-responses.json')}
campaign_known={row[k] for row in campaign for k in ['sha256','objectSha256','wtSha256']}|{row['action']['sha256'] for row in campaign}
for p in archive_paths:
    members=[];matches=[]
    if p.suffix=='.zip':
        with zipfile.ZipFile(p) as z:
            members=z.namelist()
            for name in members:
                if name.endswith(('.bin','.wt','.act')) and ('campaign' in name or 'game_get_' in name or name.startswith(('responses/','objects/','actions/','wt/')) or '/responses/' in name or '/objects/' in name or '/actions/' in name or '/wt/' in name):
                    h=hashlib.sha256(z.read(name)).hexdigest();matches.append({'member':name,'sha256':h,'known':h in raw_known or h in campaign_known})
    else:
        with tarfile.open(p,'r:*') as t:members=t.getnames()
    suspicious=[n for n in members if any(k in n.lower() for k in ['game_get_','human','replay','corpus/','exclusion'])]
    archive_results.append({'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':sha(p),'members':len(members),'relevantMemberNames':suspicious,'checkedRawMembers':matches})
save('archive-inspection.json',archive_results)
# 用逐响应表保存准入类别，防止按下载批次重复计数。
old=read(ROOT/'ai_training/data_acceptance_20261016/replay/policy-release-index.json')
old_bad={x['responseSha256'] for x in old['quarantineSources']}
packet_map={p['responseSha256']:p for p in packets}
prefix_ids=set(lookup)
latest={x['sha256']:x for x in read(ROOT/'captures/human-replay-audit-20261025-hardai/audit.json')['items']}
content={x['sha256']:x for x in read(OUT/'static-content.json')}
ledger=[]
for r in read(OUT/'raw-responses.json'):
    h=r['sha256'];p=packet_map.get(h);l=latest.get(h);c=content[h]
    category='历史非标准场景隔离'
    if p:category='历史策略来源包' if p['counts'].get('policy',0)>0 else '历史纯投降'
    elif h in prefix_ids:category='历史合格前缀'
    elif h in old_bad:category='历史信息损失隔离'
    elif l:category='新增strict候选待转换' if l['strict']['success'] and not l['onlySurrender'] else '新增纯投降' if l['onlySurrender'] else '新增分歧或非标准隔离'
    ledger.append({'responseSha256':h,'paths':r['paths'],'apiBindings':r['bindings'],'scenario':c['mode'],'activePlayers':len(c['activeTeamIds']),
      'records':c['records'],'category':category,'partition':p['splitRecord']['split'] if p else 'unassigned',
      'historicalPolicyRows':p['counts'].get('policy',0) if p else None,'historicalHumanRows':p['policyByController'].get('1',0) if p else None,
      'latestDownload':bool(l),'initialHash':c['initialHash'],'actionHash':c['actionHash'],'valueMask':False,'direct2mReady':False})
save('multiplayer-ledger.json',ledger)
with (OUT/'multiplayer-ledger.csv').open('w',newline='',encoding='utf-8-sig') as f:
    keys=['responseSha256','scenario','activePlayers','records','category','partition','historicalPolicyRows','historicalHumanRows','latestDownload','valueMask','direct2mReady']
    w=csv.DictWriter(f,keys,extrasaction='ignore');w.writeheader();w.writerows(ledger)
save('supplement-checks.json',checks)
print(json.dumps({'chains':len(chain_results),'chainFailures':sum(not x['savedHashChainMatches'] for x in chain_results),'prefixPointers':prefix_ok,'missingExclusions':sum(not x['exists'] for x in exclusion),'missingCorpus':sum(not x['exists'] for x in corpus),'model105':all(x['matches'] for x in model_checks),'campaignReceiptsEqual':sum(x['matchesEmbeddedReceipt'] for x in native),'categories':dict(collections.Counter(x['category'] for x in ledger))},ensure_ascii=True))
