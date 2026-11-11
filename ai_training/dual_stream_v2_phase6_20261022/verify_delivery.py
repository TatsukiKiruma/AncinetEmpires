"""最终只读复核：源身份、数据、模型、历史保全与全部strict收据。"""
from pathlib import Path
import hashlib,json
DIR=Path(__file__).resolve().parent; ROOT=DIR.parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
training=read(DIR/'gen_05/training.json')
source_changed=[r['path'] for r in training['sourceIdentity'] if sha(ROOT/r['path'])!=r['sha256']]
assert not source_changed,source_changed
for r in read(DIR/'corpus/manifest.json')['files']:assert sha(DIR/'corpus'/r['name'])==r['sha256']
assert sha(DIR/'gen_05/model.bin')==training['modelSha256']
parity=read(DIR/'gen_05/node-parity.json');assert parity['passed'] and all(v==0 for v in parity['errors'].values())
summaries=[];strict_actions=strict_witnesses=games=0
for name in ['phase61-v6-hard-slayer','phase61-v6r2-hard-slayer','phase61-v6r3-hard-slayer','phase62-sampling-extended','gen05-v6-hard-slayer']:
    folder=ROOT/'deliverables/trained_vs_apk_hard_20261022'/name;s=read(folder/'summary.json');r=read(folder/'independent-strict-replay.json')
    assert s['errors']==s['truncated']==0 and s['sourceUnchanged'] and s['modelArtifactsUnchanged'] and r['passed']
    assert s['verifiedActions']==r['actions'] and s['verifiedWitnessActions']==r['witnessActions']
    summaries.append(s);strict_actions+=r['actions'];strict_witnesses+=r['witnessActions'];games+=len(s['games'])
assert summaries[2]['identity']['sourceManifest']['sha256']==summaries[-1]['identity']['sourceManifest']['sha256']
protected=read(DIR/'preservation-before.json');changed=[r['path'] for r in protected if sha(ROOT/r['path'])!=r['sha256']];assert not changed,changed
receipt=dict(passed=True,games=games,strictActions=strict_actions,strictWitnessActions=strict_witnesses,sourceFiles=len(training['sourceIdentity']),protectedFiles=len(protected),protectedChanged=changed,parityStates=parity['samples'],modelSha256=training['modelSha256'],baselineWins=summaries[2]['wins'],gen05Wins=summaries[-1]['wins'],modelOver1000=sum(g['modelLatency']['over1000'] for s in summaries for g in s['games']),opponentOver1000=sum(g['hardLatency']['over1000'] for s in summaries for g in s['games']))
assert receipt['modelOver1000']==0, '我方存在1000ms超限，不能通过预算核对'
receipt['scope']='严格执行、我方预算与身份保全；不代表统治级胜率或对手预算通过'
receipt['opponentBudgetPassed']=receipt['opponentOver1000']==0
(DIR/'FINAL_VERIFICATION.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(receipt,ensure_ascii=False))
