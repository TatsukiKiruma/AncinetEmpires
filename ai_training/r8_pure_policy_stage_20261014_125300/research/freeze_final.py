"""冻结一次FINAL所需全部身份；仅登记候选，不启动比赛或发布。"""
import pathlib,json,hashlib,sys,time
S=pathlib.Path(__file__).resolve().parents[1];name=sys.argv[1]
def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert (S/'evidence/second_seed_completed.json').exists(),'领先完整配方第二seed尚未完成'
assert read(S/'identity/protection_prefinal.json')['passed']
assert read(S/'evidence/checkpoint_audit_all_runs.json')['passed']
assert not (S/'identity/candidate_freeze.json').exists(),'已有冻结事件，禁止重选候选'
selection=read(S/'identity/selection_final_candidate.json');assert selection['selected']==name and selection['eligible']
p=S/f'checkpoints/{name}/best.json';h=sha(p);assert read(S/f'evidence/parity_{h}.json')['passed'];assert read(S/f'evidence/behavior_{h}.json')['surrenderChoices']==0
dev=read(S/f'runs/dev_{name}/summary.json');assert dev['games']==20 and dev['counts'].get('error',0)==0
manifest=read(S/'configs/final_manifest.json');games=manifest['games'];assert len(games)==20 and len({g['mapName'] for g in games})==7
names=['Duel','Liberty Port','Swamplands','The Crossing','Icy Paths','Peak Island','Crossed swords','Duel','The Crossing','Swamplands']
for i,g in enumerate(games):
    assert g['gameIndex']==i and g['slot']==i//2 and g['candidateSeat']==i%2 and g['mapName']==f'(2) {names[i//2]}.aem'
    assert g['seeds']==[int(hashlib.sha256(f"R8-v1|FINAL|{g['slot']}|{g['candidateSeat']}|policy-seat-{i}".encode()).hexdigest()[:8],16) for i in [0,1]]
files=[p,S/f'checkpoints/{name}/best.pt',S/f'evidence/parity_{h}.json',S/f'evidence/behavior_{h}.json',S/'identity/selection_rules.json',S/'identity/selection_final_candidate.json',S/'runs/worker.cjs',S/'research/policy.ts',S/'research/common.ts',S/'research/supervisor.mjs',S/'configs/final_manifest.json',S/'identity/node_runtime.json',S/'identity/manifest.json']
for r in read(S/'identity/manifest.json')['files']:
    q=S/r['frozen'];assert sha(q)==r['frozenSha256'];files.append(q)
freeze={'candidate':name,'modelSha256':h,'frozenUnix':time.time(),'files':{str(p.relative_to(S)):sha(p) for p in files},'purePolicy':True,'workerBundleSha256':sha(S/'runs/worker.cjs'),'denominator':20,'requiredNaturalWins':16,'publicationAuthorized':False,'finalRunsAllowed':1}
with (S/'identity/candidate_freeze.json').open('x',encoding='utf8') as f:json.dump(freeze,f,ensure_ascii=False,indent=2)
with (S/'configs/final_candidate.json').open('x',encoding='utf8') as f:json.dump({'id':'final_r8','candidate':{'type':'model','model':str(p),'expectedSha256':h},'games':games},f,ensure_ascii=False,indent=2)
print(json.dumps(freeze,ensure_ascii=False,indent=2))
