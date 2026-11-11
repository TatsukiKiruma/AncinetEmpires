"""在看到新续弈结局之前固定训练父局、辅助留出和Value选模规则。"""
from pathlib import Path
import pickle,json,hashlib,datetime
HERE=Path(__file__).resolve().parent
read=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
sha=lambda n:hashlib.sha256((HERE/n).read_bytes()).hexdigest()
def write(n,v):
    with (HERE/n).open('x',encoding='utf-8') as f:json.dump(v,f,ensure_ascii=False,allow_nan=False,indent=2)
selection={r['parentId']:r['split'] for r in read('selection.json')['parents']}
with (HERE/'teacher-value-contexts.pkl').open('rb') as f:original=pickle.load(f)
oldParents={r['parent'] for r in original['train']};roots=read('expert-roots.json')['roots'];parents={r['parent'] for r in roots}
assert len(roots)==len(parents)==40 and all(selection[p]=='train' for p in parents)
eligible=sorted(parents-oldParents,key=lambda p:hashlib.sha256(('value-continuation-20261019-v1/'+p).encode()).hexdigest());assert len(eligible)>=8
heldout=set(eligible[:8]);newRoots=[]
for i,r in enumerate(roots):
    assert sha(Path(r['path']))==r['stateHash'] or hashlib.sha256(json.dumps(read(Path(r['path'])),separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==r['stateHash']
    newRoots.append(dict(r,index=i,opponentSeed=r['opponentSeed']+100000,globalPartition='train',valueSplit='aux_validation' if r['parent'] in heldout else 'train',purpose='pure-policy-natural-value-continuation'))
write('value-continuation-roots.json',dict(roots=newRoots,trainParents=32,auxValidationParents=8,auxParentsHaveNoOriginalValueTrainLabels=not bool(heldout&oldParents),originalValidationParentOverlap=0))
protocol=dict(version='value-continuation-v1',registeredAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),games=40,opponents=dict(heuristic=20,apk_like=20),workers=4,budgets=dict(maxActions=2000,maxWallMs=600000,maxDecisionMs=30000),stateSampleEveryActions=8,samplingUsesSearch=False,policyTargetsCollected=False,countsAsQualifiedTeacherExpertSampling=False,originalTrainingParents=720,originalValidationParents=180,originalParentSplitUnchanged=True,trainParentCount=32,auxValidationParentCount=8,auxValidationParents=sorted(heldout),auxValidationScope='原720策略训练父局内的Value标签留出；无旧Value训练标签，不是独立泛化或最终评测',naturalLabelsOnly=True,drawAndTruncationValueMask=False,excludeAllConsumedEvaluationBeforeHashes=True,excludeOriginal180DevValueRepresentations=True,fit=dict(policyFrozen=True,inputDimension=297,optimizer='PC PyTorch float64 AdamW',learningRate=0.0001,weightDecay=0.001,maxEpochs=24,minEpochs=8,patience=6,gradientClip=1.0,originalLossWeight=0.75,newContinuationLossWeight=0.25,batchSizePerDomain=256,parentStageBalanced=True,calibrationObjectives=['mse','bce'],calibrationL2=[0.0001,0.001,0.01,0.1]),selection=dict(originalModelIsCandidate=True,originalSixBaselinesAndAucFloorsUnchanged=True,originalPhaseBrierUpperRatio=1.05,originalPhaseAucMaximumDrop=0.005,score='原180开发可用标签三阶段Brier相对原头比值的均值，与辅助留出可用阶段Brier相对原头比值（分母至少0.005）的均值，各占0.5；先过全部原质量门禁与保持门槛，再取最低分；原头保留为候选',usesQualificationBattleOutcomes=False),sourceModel='teacher-model.json',sourceModelSha256=sha('teacher-model.json'),sourcePolicyIdentity='阶段4e93a212f策略权重与组偏置冻结',originalValueContextsSha256=sha('teacher-value-contexts.pkl'),selectionSha256=sha('selection.json'),originalRootsSha256=sha('expert-roots.json'),rootsSha256=sha('value-continuation-roots.json'),originalValueEvaluationSha256=sha('teacher-value-evaluation.json'))
write('value-continuation-protocol.json',protocol);print(json.dumps(dict(registered=True,games=40,trainParents=32,auxValidationParents=sorted(heldout)),ensure_ascii=False))
