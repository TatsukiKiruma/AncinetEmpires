"""复用既有父局摘要与回执分组、切分和选100局；不执行游戏引擎。"""
from collections import Counter,defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path

from device import HERE,ROOT,write

EVIDENCE=ROOT/'ai_training/hard_native_admission_20261024'
SEED=20261024


def load(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def stable(s):return hashlib.sha256((str(SEED)+':'+s).encode()).hexdigest()


def main():
    assert not (HERE/'SPLIT.json').exists(),'已有冻结切分，不覆盖'
    manifest=load(EVIDENCE/'SOURCE_MANIFEST.json')
    groups=defaultdict(list);known={};bad=set()
    for file in (EVIDENCE/'project').glob('*.json'):
        r=load(file);known[r['parentId']]=r
        if not r.get('projectStrictVerified'):bad.add(r['parentId'])
    for p in manifest['parents']:
        receipt=load(EVIDENCE/'integrity'/(p['parentId']+'.json'))
        assert receipt['integrityVerified']
        group=stable(p['map']+':'+receipt['traceSha256'])
        groups[group].append({**p,'groupId':group,'existingIntegrityReceipt':str(EVIDENCE/'integrity'/(p['parentId']+'.json')),
                              'existingProjectStatus':'passed' if known.get(p['parentId'],{}).get('projectStrictVerified') else 'failed' if p['parentId'] in bad else 'not_executed',
                              'knownAtomicActions':known.get(p['parentId'],{}).get('progress',{}).get('atomicActions')})
    representatives=[];excluded=[]
    for group,members in groups.items():
        if any(p['parentId'] in bad for p in members):
            excluded.append({'groupId':group,'parentIds':[p['parentId'] for p in members],'reason':'已有失败回执或其相同动作轨迹组，不重跑校验'})
            continue
        members.sort(key=lambda p:(p['existingProjectStatus']!='passed',stable(p['parentId'])))
        representatives.append({**members[0],'duplicateParentIds':[p['parentId'] for p in members[1:]]})
    bymap=defaultdict(list)
    for p in representatives:bymap[p['map']].append(p)
    train=[];dev=[]
    for name,rows in sorted(bymap.items()):
        ordered=sorted(rows,key=lambda p:stable('split:'+p['groupId']))
        ndev=max(1,round(len(rows)*.1));dev+=ordered[:ndev];train+=ordered[ndev:]
    pilot=[];details=[]
    for mi,name in enumerate(sorted(bymap)):
        candidates=sorted([p for p in train if p['map']==name and p['existingProjectStatus']=='passed'],key=lambda p:(p['actions'],stable(p['parentId'])))
        quota=13 if mi<4 else 12
        assert len(candidates)>=quota,(name,len(candidates))
        bins=[candidates[len(candidates)*i//3:len(candidates)*(i+1)//3] for i in range(3)]
        sizes=[4,4,quota-8]
        for bi,(rows,n) in enumerate(zip(bins,sizes)):
            chosen=sorted(rows,key=lambda p:stable('pilot:'+p['parentId']))[:n]
            assert len(chosen)==n
            pilot+=chosen;details.append({'map':name,'lengthBin':bi,'selected':n,'minimumMacros':min(p['actions'] for p in rows),'maximumMacros':max(p['actions'] for p in rows)})
    pilot.sort(key=lambda p:stable('order:'+p['parentId']))
    assert len(pilot)==len({p['parentId'] for p in pilot})==100
    assert not {p['groupId'] for p in train}&{p['groupId'] for p in dev}
    assert not {p['parentId'] for p in pilot}&bad
    # 参考日程按全部训练代表局保存宏动作所表达的原子位置计数，未执行更新。
    intended=0
    for p in train:
        count=0
        with gzip.open(Path(p['directory'])/'actions.jsonl.gz','rt',encoding='utf-8') as source:
            for line in source:
                f=json.loads(line)['fields']
                if f['i']>=0 or f['j'] in {'NEXT_TURN','SURRENDER'}:count+=1
                else:count+=1+int(f['c']>=0 and f['d']>=0 and (f['a'],f['b'])!=(f['c'],f['d']))+int(f['e']>=0 and f['f']>=0)
        p['intendedAtomicPositions']=count;intended+=count
    split={'schema':'phone-2m-scratch100-split-v1','seed':SEED,'sourceManifest':str(EVIDENCE/'SOURCE_MANIFEST.json'),
           'sourceManifestSha256':hashlib.sha256((EVIDENCE/'SOURCE_MANIFEST.json').read_bytes()).hexdigest(),
           'grouping':'同地图完整动作轨迹摘要；保留父局全部片段；只保留每组一个代表，不按共享初态把整张图归一集',
           'sharedOfficialInitialStates':True,'developmentIsUnseenMapEvaluation':False,
           'sourceParents':len(manifest['parents']),'uniqueTraceGroups':len(groups),'trainParents':len(train),'devParents':len(dev),
           'knownFailedParentIds':sorted(bad),'excludedGroups':excluded,'train':train,'dev':dev,'pilot':pilot,'pilotStrata':details,
           'newReplayExecuted':False,'sourceLabels':'复用既有来源和回执；not_executed不伪记通过',
           'referenceIntendedAtomicPositionsPerEpoch':intended,'referenceScheduleUpdates':3*math.ceil(intended/8),
           'referenceScheduleBasis':'全部训练代表局原始宏字段表达的原子位置预算；不是全量已编码合格标签数；后续不静默重算或重置',
           'pilotKnownCompleteAtomicPositions':sum(p['knownAtomicActions'] for p in pilot)}
    write(HERE/'SPLIT.json',split)
    protocol={'schema':'phone-2m-scratch100-protocol-v1','authorization':'仅随机初始化完整2M模型100父局一遍手机试训；之后保存停止',
              'seed':SEED,'model':'dual-stream-v3-2m-v1','parameters':1966910,'initialization':'random_from_seed_no_existing_weights',
              'dtype':'float32','allParametersTrainable':True,'optimizer':'AdamW','weightDecay':1e-4,'betas':[.9,.999],'eps':1e-8,
              'effectiveBatch':8,'microbatch':1,'gradientClipNorm':1,'peakLearningRate':3e-4,'endLearningRate':3e-5,
              'warmupFraction':.05,'referenceEpochs':3,'referenceTotalUpdates':split['referenceScheduleUpdates'],
              'authorizedParents':100,'authorizedEpochsOverPilot':1,'automaticFullTraining':False,'policyWeight':1,'valueWeight':1,
              'policyLoss':'带既有softPriors的全部因子候选交叉熵；有效标签按实际batch加权均值',
              'valueLoss':'六槽自然赢家交叉熵+Brier平方误差按槽求和；有效标签按实际batch加权均值',
              'sampleWeight':'每条原子1；Hard Policy和可靠Value全保留；不套ordinary 1%/8%采样',
              'valueMask':'仅已有可靠自然终局，无截断或未知结果；按已有六槽联盟映射',
              'candidateLimit':None,'entityLimit':None,'perParentStateLimit':None,'dropLast':False,
              'checkpointEveryUpdates':100,'checkpointEverySeconds':300,'resumeTestAfterUpdates':10,
              'temperaturePauseC':45,'temperatureResumeC':42,'batteryPausePercent':20,'batteryResumePercent':25,
              'freeSpacePauseBytes':2*1024**3,'freeSpaceResumeBytes':int(2.25*1024**3),'torchThreads':4,
              'splitSha256':hashlib.sha256((HERE/'SPLIT.json').read_bytes()).hexdigest()}
    write(HERE/'PROTOCOL.json',protocol)
    print(json.dumps({k:v for k,v in split.items() if k in ['sourceParents','uniqueTraceGroups','trainParents','devParents','pilotKnownCompleteAtomicPositions','referenceScheduleUpdates']},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
