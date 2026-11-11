"""只从逐局产物、严格重放和冻结身份重算裁决，不用报告自述计胜。"""
import pathlib,json,hashlib,collections
S=pathlib.Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text(encoding='utf8'))
f=read(S/'identity/candidate_freeze.json');name=f['candidate'];rp=read(S/f'evidence/replay_dev_{name}_final_r8.json');assert rp['passed'];assert read(S/'evidence/final_execution_identity.json')['passed'];assert read(S/'evidence/initial_identity_final.json')['passed']
model=S/f'checkpoints/{name}/best.json';assert hashlib.sha256(model.read_bytes()).hexdigest()==f['modelSha256'];assert read(S/f"evidence/parity_{f['modelSha256']}.json")['passed']
games=[read(S/f'runs/final_r8/game_{i}.json') for i in range(20)];assert {g['gameIndex'] for g in games}==set(range(20));assert all(g['loadedModelSha256']==f['modelSha256'] and g['workerBundleSha256']==f['workerBundleSha256'] for g in games)
counts=collections.Counter(g['outcome'] for g in games);replays={}
for p in (S/'evidence').glob('replay_*.json'):
    r=read(p)
    if not r.get('passed'):continue
    for x in r.get('results',[]):
        key=(x['panel'],x['gameIndex'])
        if key in replays:assert replays[key]['trajectoryHash']==x['trajectoryHash']
        replays[key]=x
final=[replays[('final_r8',i)] for i in range(20)];dev=[x for x in replays.values() if x['panel'].startswith('dev_')]
cross=[{'finalGame':a['gameIndex'],'devPanel':b['panel'],'devGame':b['gameIndex'],'trajectoryHash':a['trajectoryHash']} for a in final for b in dev if a['trajectoryHash']==b['trajectoryHash']]
within=[{'games':[a['gameIndex'],b['gameIndex']],'trajectoryHash':a['trajectoryHash']} for i,a in enumerate(final) for b in final[:i] if a['trajectoryHash']==b['trajectoryHash']]
def inputs(panel):
    values=set()
    for p in (S/'runs'/panel).glob('game_*.json'):
        r=read(p)
        with p.with_suffix('.jsonl').open(encoding='utf8') as stream:
            for line in stream:
                x=json.loads(line)
                if x['type']=='step' and x['player']==r['candidateSeat'] and x.get('inputHash'):values.add(x['inputHash'])
    return values
fi=inputs('final_r8');di=inputs('dev_'+name);wins=counts.get('natural_win',0);protocol=not cross and not within
per_map={}
for g in games:
    row=per_map.setdefault(g['mapName'],{'games':0,'naturalWins':0});row['games']+=1;row['naturalWins']+=g['outcome']=='natural_win'
out={'verdict':'ACCEPTED' if wins>=16 and protocol else 'REJECTED' if wins<16 else 'INVALID','performancePassed':wins>=16,'strictIndependentAcceptancePassed':protocol,'candidate':name,'modelSha256':f['modelSha256'],'pureModel':True,'games':20,'denominator':20,'uniqueMaps':7,'pairedGroups':10,'requiredNaturalWins':16,'naturalWins':wins,'naturalWinRate':wins/20,'outcomes':dict(counts),'perMap':per_map,'crossDevFinalIdenticalTrajectories':cross,'withinFinalIdenticalTrajectories':within,'selectedDevInputOverlap':{'finalUniqueInputs':len(fi),'devUniqueInputs':len(di),'intersection':len(fi&di),'note':'固定初态允许共享输入；完整轨迹重复另行判定，不能用seed不同当独立证据。'},'checkedDevGames':len(dev),'strictReplayPassed':True,'frozenIdentityPassed':True,'initialRulesAndMapIdentityPassed':True,'modelPublished':False,'finalGames':sorted(final,key=lambda x:x['gameIndex'])}
(S/'evidence/final_acceptance_verdict.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in out.items() if k not in ['finalGames','crossDevFinalIdenticalTrajectories']},ensure_ascii=False,indent=2))
