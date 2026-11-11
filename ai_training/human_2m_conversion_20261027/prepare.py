"""准备独立转换清单；只读旧来源，不触碰手机和训练作业。"""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

ledger=read(ROOT/'ai_training/human_data_inventory_20261027/multiplayer-ledger.json')
packets=read(ROOT/'ai_training/human_data_inventory_20261027/accepted-packets.json')
sources=[]
for p in packets:
    if not p['counts'].get('policy',0): continue
    path=ROOT/p['path']; receipt=path.parent.parent/'receipts'/f"{p['responseSha256']}.json"
    sources.append({'id':p['responseSha256'],'kind':'accepted_packet','path':str(path),'sha256':sha(path),
      'receipt':str(receipt),'receiptSha256':sha(receipt),'split':p['splitRecord']['split'],'mode':p['scenario'],
      'exclusionEvidence':'historical_parent_only_missing_full_indexes'})
final=read(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX_FINAL.json')
allowed={}
with gzip.open(final['policyFiles']['admitted']['path'],'rt',encoding='utf8') as f:
    for line in f:
        r=json.loads(line)
        if r['humanController']: allowed.setdefault(r['responseSha256'],{})[str(r['atomic'])]=r['canonicalBeforeHash']
index=read(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX.json')
for p in index['selectedPrefixPolicySources']:
    sources.append({'id':p['responseSha256'],'kind':'accepted_prefix','path':str(ROOT/p['packet']['path']),
      'sha256':p['packet']['sha256'],'receipt':str(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX_FINAL.json'),
      'receiptSha256':sha(ROOT/'ai_training/pretrain_preflight_20261022/HUMAN_DATA_INDEX_FINAL.json'),
      'split':'train','mode':p['scenario'],'exclusionEvidence':'final_row_admission','admittedAtoms':allowed[p['responseSha256']]})
audit_path=ROOT/'captures/human-replay-audit-20261025-hardai/audit.json';audit=read(audit_path)
new={x['responseSha256'] for x in ledger if x['category']=='新增strict候选待转换'}
for p in audit['items']:
    if p['sha256'] not in new:continue
    sources.append({'id':p['sha256'],'kind':'accepted_raw','path':str(ROOT/p['file']),'sha256':p['sha256'],
      'receipt':str(audit_path),'receiptSha256':sha(audit_path),'split':'unassigned','mode':p['scenario'],
      'exclusionEvidence':'missing_full_indexes'})
sources.sort(key=lambda x:({'accepted_prefix':0,'accepted_packet':1,'accepted_raw':2}[x['kind']],x['id']))
splits=read(ROOT/'ai_training/pretrain_preflight_20261022/DATA_SPLITS.json')
available=[];missing=[]
for p in splits['exclusionIndexes']:
    if Path(p['path']).is_file():
        assert sha(p['path'])==p['sha256'];available.append(p)
    else:missing.append(p)
save('PLAN.json',{'schema':'human-2m-conversion-v1','sources':sources,'availableExclusions':available,'missingExclusions':missing,
  'format':'压缩逐决策状态＋当前完整候选身份＋独立惰性2M张量reader',
  'conversionAuthorized':True,'trainingAuthorized':False,'newReplayValidation':False,'phoneOperations':False,
  'humanOnly':True,'valueMask':False,'returnMask':False,'maxOutputBytes':4*1024**3,'minimumFreeBytes':12*1024**3})
# elite 的源资源打包是准备工作，不能冒充缺失的原生决策状态。
elite=read(ROOT/'captures/campaign-training-analysis-20261025/training-source-candidates.json')['groups']['seeded_elite']
audit={r['id']:r for r in read(ROOT/'captures/campaign-replays-20261025/replay-audit.json')}
assets=read(ROOT/'captures/campaign-training-analysis-20261025/assets.json')['stages']
campaign=[]
for e in elite:
    a=audit[e['id']]; resource=next(x for x in assets if x['campaign']==e['campaign'] and x['stage']==e['stage'])
    files=[ROOT/'captures/campaign-replays-20261025'/a['objectFile'],ROOT/'captures/campaign-replays-20261025'/a['action']['file'],ROOT/'captures/campaign-training-analysis-20261025'/resource['mapFile'],ROOT/'captures/campaign-training-analysis-20261025'/resource['scriptFile']]
    campaign.append({'id':e['id'],'campaign':e['campaign'],'stage':e['stage'],'seed':e['seed'],
      'nativeReceiptReused':a['native'],'sources':[{'path':str(p),'sha256':sha(p)} for p in files],
      'lowerImportEffortCandidate':e['lowerImportEffortCandidate'],'status':'needs_native_decision_states',
      'policyMask':False,'valueMask':False,'convertedRows':0})
save('CAMPAIGN_ELITE65.json',{'count':len(campaign),'items':campaign,'trainingAuthorized':False})
print(json.dumps({'multiplayerSources':len(sources),'eliteCampaign':len(campaign),'finalHumanPrefixRows':sum(len(v) for v in allowed.values())}))
