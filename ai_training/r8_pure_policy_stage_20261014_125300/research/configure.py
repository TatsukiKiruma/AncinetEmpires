"""正式DEV之前登记面板、资源上限及历史策略身份。"""
import pathlib,json,hashlib
S=pathlib.Path(__file__).resolve().parents[1];R=S.parents[1]
maps=['Duel','Liberty Port','Swamplands','The Crossing','Icy Paths','Peak Island','Crossed swords','Duel','The Crossing','Swamplands']
def derive(text):return int(hashlib.sha256(text.encode()).hexdigest()[:8],16)
panels={}
for panel in ['DEV','FINAL']:
    games=[]
    for slot,name in enumerate(maps):
        for seat in [0,1]:
            games.append({'gameIndex':2*slot+seat,'slot':slot,'mapName':f'(2) {name}.aem','candidateSeat':seat,'seeds':[derive(f'R8-v1|{panel}|{slot}|{seat}|policy-seat-{p}') for p in [0,1]],'maxSteps':3000,'maxDecisionMs':1000,'maxWallSeconds':300})
    panels[panel]=games;(S/f'configs/{panel.lower()}_manifest.json').write_text(json.dumps({'panel':panel,'maps':7,'slots':10,'games':games,'seedContract':'sha256 R8-v1 panel slot candidate-seat policy-seat first32bits, mulberry32 persistent'},indent=2),encoding='utf8')
base='ai_training/'
policies={'old_p1':{'type':'model','model':base+'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'},'old_theta1':{'type':'model','model':base+'r7_training_stage_20261014_083500/artifacts/models/theta1_baseline.json'},'r6_a':{'type':'model','model':base+'r6_model_training_20261014_063500/artifacts/models/arm_a_warm_start.json'},'r6_b':{'type':'model','model':base+'r6_model_training_20261014_063500/artifacts/models/arm_b_scratch.json'},'r7':{'type':'model','model':base+'r7_training_stage_20261014_083500/artifacts/models/round3_enhanced_v2_best.json'},'b100_q':{'type':'b100','variant':'B100-Q'},'b100_r':{'type':'b100','variant':'B100-R'}}
for name,c in policies.items():
    if c.get('model'):c['expectedSha256']=hashlib.sha256((R/c['model']).read_bytes()).hexdigest()
    (S/f'configs/dev_{name}.json').write_text(json.dumps({'id':f'dev_{name}','candidate':c,'games':panels['DEV']},indent=2),encoding='utf8')
(S/'identity/selection_rules.json').write_text(json.dumps({'priority':['contract','parity','behaviorRegression','naturalWins','fewerTruncations','secondSeed','offlineMetrics'],'finalRuns':1,'denominator':20,'requiredNaturalWins':16,'trainingRounds':3,'publishAuthorized':False},indent=2),encoding='utf8')
