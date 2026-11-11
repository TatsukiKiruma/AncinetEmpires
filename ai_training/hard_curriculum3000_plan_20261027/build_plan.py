"""生成只供审阅的3000局配额蓝图；不生成局面、不导入引擎、不连接设备。"""
import collections
import csv
import hashlib
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]

def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))

def sha(p):
    with p.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')

rows = [
    ('normal', '正常开局', [60,120,120], ['official_default']),
    ('parameter_variant', '参数变化', [120,90,90], ['low_gold','high_gold','population_20','population_50']),
    ('advantage_endgame', '优势与劣势残局', [420,240,240], ['small_advantage','medium_advantage','large_advantage','small_disadvantage','medium_disadvantage']),
    ('preset_units', '多单位与均势预设', [180,210,210], ['density_8','density_14','density_20']),
    ('high_tier', '高阶兵种', [120,90,90], ['heavy_ranged','mobile_assault','mixed_magic_support']),
    ('skill', '技能', [120,90,90], ['heal','summon','support','aura','assault']),
    ('building_finish', '建筑收尾', [180,60,60], ['capture_race','castle_siege','cleanup_counterattack']),
]
maps = read(OUT/'MAP_INVENTORY.json')['maps']
assert len(maps)==20 and all(m['unknownCells']==0 for m in maps)
old_paths = ['captures/phone-storage-1000-20261015/manifest.json', 'captures/phone-compressed-2000-20261015/manifest.json']
old_jobs = [j for p in old_paths for j in read(ROOT/p)['jobs']]
old_seeds = {j['seed'] for j in old_jobs}
old_seeds.update(j['seed'] for j in read(ROOT/'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json')['jobs'])
old_counts = collections.defaultdict(collections.Counter)
for j in old_jobs:
    count = sum(bool(p['isAlive']) for p in j['state']['players']) if j['state'] else int(j['map'][1])
    old_counts[j['planKind']][str(count)]+=1

slots=[];map_usage=collections.Counter();source_index=0
for kind,label,quotas,profiles in rows:
    profile_index=0
    for n,quota in zip([2,3,4],quotas):
        for i in range(quota):
            source_index+=1
            profile=profiles[profile_index%len(profiles)];profile_index+=1
            gold,cap,per_side = 300,30,None
            if kind=='parameter_variant':
                gold={'low_gold':0,'high_gold':1000}.get(profile,300)
                cap={'population_20':20,'population_50':50}.get(profile,30)
            elif kind=='preset_units':
                gold,cap,per_side=600,50,int(profile.split('_')[1])
            elif kind=='high_tier':gold,cap,per_side=1000,50,10
            elif kind=='skill':gold,cap,per_side=600,50,8
            elif kind=='advantage_endgame':per_side=10
            elif kind=='building_finish':per_side=10
            candidates=[m for m in maps if m['configuredPlayerCount']==n and
                        (per_side is None or per_side*n<=int(.6*m['nonApproximateNonDeepWaterCellCount']))]
            assert candidates
            chosen=min(candidates,key=lambda m:(map_usage[m['name']],m['name']))
            map_usage[chosen['name']]+=1
            seed=2030000000+source_index
            assert seed not in old_seeds and seed<2**31
            derived=kind not in {'normal','parameter_variant'}
            slots.append({'schema':'hard-curriculum-design-slot-v1','slotId':f'hc7-20261027-{source_index:04d}',
                'category':kind,'categoryLabel':label,'actualPlayerCount':n,'profile':profile,
                'proposedMap':chosen['name'],'mapAssetSha256':chosen['sha256'],
                'mapProjectApproximateTileCount':chosen['confidence']['approximateTileCount'],
                'candidateMaps':[m['name'] for m in candidates], 'candidateMapCapacityIsOnlyPlanningHeuristic':True,
                'activeNativePlayerIds':chosen['nativePlayerIds'],'nativeSeed':seed,
                'initialGold':gold,'populationLimitPerSide':cap,'levelCap':3,
                'derivedStateRequired':derived,'targetUnitsPerSide':per_side if kind in {'preset_units','high_tier','skill'} else None,
                'planningMaximumUnitsPerSide':per_side,'focusSeatOrdinal':i%n,
                'firstActorOrdinal':((i//n+i)%n) if derived else None,
                'firstActorMeaning':'派生局轮换；正常开局保持原地图规则' if derived else '原地图默认',
                'deviceProposal':'mi8' if ((i%2)^((i//(2*n))%2))==0 else 'note8',
                'stage':'initial_126' if i<6 else 'remaining_2874',
                'initialStateSha256':None,'dispatchable':False,'purpose':'采集方案待批准，未划分训练用途'})

assert len(slots)==3000 and len({s['slotId'] for s in slots})==3000 and len({s['nativeSeed'] for s in slots})==3000
assert sum(s['stage']=='initial_126' for s in slots)==126
assert collections.Counter(s['deviceProposal'] for s in slots)=={'mi8':1500,'note8':1500}
assert collections.Counter(s['actualPlayerCount'] for s in slots)=={2:1200,3:900,4:900}
quota_records=[{'kind':k,'label':l,'players2':q[0],'players3':q[1],'players4':q[2],'total':sum(q),'profiles':p} for k,l,q,p in rows]
write('PLAN.json',{
    'schema':'hard-seven-category-3000-proposal-v1','status':'等待用户批准方案；采集器适配未实施',
    'executionAuthorized':False,'dispatchable':False,'totalNewNaturalParentsTarget':3000,
    'existingParentsCountedTowardTarget':0,'trainingAuthorized':False,'automaticTrainingAdmission':False,
    'replayPolicy':'disabled_by_user','strictReplay':False,'forcedReplay':False,'nativeReplay':False,
    'ai':'当前指定APK原生困难b.call，保留原生Java困难回退，禁止普通a.call替代',
    'sourceApkSha256':'a2adcc856384dea4ebac7434c78c2abbdcb1f428e502925fd4beb39c95cd6d48',
    'mode':'SD','allianceMode':'2/3/4个独立阵营自由混战；本批不含2v2或战役',
    'quotas':quota_records,'playersTotals':{'2':1200,'3':900,'4':900},
    'deviceProposal':{'mi8':1500,'note8':1500,'runtimeIdentityAndAvailabilityNotChecked':True},
    'stages':{'initial126IncludedIn3000':126,'remainingAfterCapabilityChecks':2874,'extraSmokeGamesBudget':0},
    'schedule':'先每类每人数6局，再按21个配额格交错；每设备覆盖全部21格，不按设备分场景',
    'limits':{'maxNativeActionsPerAttempt':20000,'maximumActiveHoursPerAttemptProposed':6,
              'maximumAttemptsForTransientFailurePerParent':3,'retryTruncationAutomatically':False,
              'automaticReplacementOfNaturalDuplicates':False,'unboundedRetries':False},
    'resources':{'startWorkersPerDevice':1,'mi8MaximumWorkers':2,'note8InitialMaximumWorkers':2,
                 'note8ThirdWorkerRequiresNewEvidenceWithinApprovedRun':True,'temperaturePauseC':45,'temperatureResumeC':42,
                 'batteryPausePercent':20,'batteryResumePercent':25,'absoluteFreeSpacePauseGiB':2,
                 'absoluteFreeSpaceResumeGiB':2.25,'cpuDownshiftPercent':90,'cpuRecoveryBelowPercent':75},
    'randomness':{'nativeSeedsDistinctFromTwoReferencedOldManifestsAndHardPlan':True,'javascriptRngSeeded':False,
                  'injectJavascriptRng':False,'sameSeedGuaranteesSameTrajectory':False},
    'data':{'preserveAllAttempts':True,'saveEveryCommittedDecisionPreState':True,'denseTrainingTensors':False,
             'split':'待采集完成后讨论，现有2414/268分区不变','modelUpdates':0},
    'mandatoryImplementation':['新方案合同与独立队列命名','全部实际阵营保留的预设生成器',
        '困难Native.create设置参数及派生初态','20/30/50原生与HTML人口上限一致','初态与用途回执',
        '有限重试、截断单列、跨设备统一计数','删除自动重放和自动训练依赖'],
    'unresolvedBeforeDispatch':['3000个具体初态和原生字段投影尚未生成','多人派生原生构造尚未实机验证',
        '20/50人口参数尚未在现有困难管道验收','手机当前身份、空闲状态和可用空间尚未查询',
        '4张地图存在既有近似地形映射，原生采集不使用近似地形替代真实地形；未来训练适配单独处理']})
write('DESIGN_SLOTS.json',{'dispatchable':False,'qualification':'只有配额、配方与候选地图；不是手机可执行任务或完整状态','slots':slots})
columns=['slotId','category','categoryLabel','actualPlayerCount','profile','proposedMap','nativeSeed',
         'initialGold','populationLimitPerSide','targetUnitsPerSide','focusSeatOrdinal','firstActorOrdinal','deviceProposal','stage','dispatchable']
with (OUT/'DESIGN_SLOTS.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,columns,extrasaction='ignore');w.writeheader();w.writerows(slots)
write('QUOTA_CHECK.json',{'passed':True,'total':len(slots),'categoryCounts':dict(collections.Counter(s['category'] for s in slots)),
    'playerCounts':dict(collections.Counter(s['actualPlayerCount'] for s in slots)),
    'profileCounts':dict(collections.Counter(s['profile'] for s in slots)),
    'populationLimitCounts':dict(collections.Counter(s['populationLimitPerSide'] for s in slots)),
    'mapCounts':dict(map_usage),'deviceCounts':dict(collections.Counter(s['deviceProposal'] for s in slots)),
    'initial126':126,'seedOverlapWithReferencedPlans':0,'oldActualPlayerCountsByKind':old_counts,
    'note':'字段算术与静态地图初筛通过，不等于完整初态或采集器运行通过'})

audit_specs=[
 ('地图人数循环','tools/phone_training_hard/native_engine_collect.rhino.js',['active.length < 2','types[active[index]]','set(config, \'i\''], '原生入口按地图启用2至6席；当前正式完成证据仅双人，三四人待原生运行观察'),
 ('派生初态缺口','tools/phone_training_hard/native_engine_collect.rhino.js',['function create(job','engine[\'a()\']'], 'create没有消费job.state/job.setup；仅扩展任务JSON会忽略新初态'),
 ('硬编码人口','tools/phone_training_hard/process_worker.rhino.js',['Number(cfg.populationLimit) !== 30','Number(limits[team]) !== 30','populationLimit:30'], '需统一原生20/30/50配置、HTML常量、绑定核对和结果身份'),
 ('困难调用保留','tools/phone_training_hard/process_worker.rhino.js',['new Packages.c.a.b.c.j.b','hard_java_fallback','lastAccepted'], '复用原b.call，不换成旧普通a.call；按实际调用路径留账'),
 ('早期合同拒绝扩展','tools/phone_training_hard/contract.py',['expected_keys =','set(job) != expected_keys'], '历史单局验证合同限制字段；正式新管道应另建明确版本合同'),
 ('小米绑定旧任务','tools/phone_training_hard/prepare_parallel.py',['3 <= seq <= 1000','populationLimit\': 30','plan[\'jobs\'][sequence - 1]'], '不能把新3000任务交给原旧序号准备器'),
 ('三星丢弃扩展字段','tools/phone_training_hard/second_device/prepare_queue.py',['selected = source[\'jobs\'][1000:2000]','jobs = [','populationLimit'], '重建job时只带旧字段，需保留新配方、参数、初态与身份'),
 ('旧生成器降为两方','ai_training/tools/sd_training_state_generator.ts',['const disabledTeams','.slice(0, 2)','isAlive: player.id === teamA || player.id === teamB'], '旧1560局派生初态实际全是双人，不能复用为三四人生成器'),
 ('旧原生预设可借鉴','tools/phone_training/worker.rhino.js',['if(job.setup)','if(job.state)','new Packages.c.a.b.c.j.a'], '原生字段构造可参考；普通AI执行循环不可复用'),
 ('人口HTML身份','tools/phone_training_hard/production_runtime.frida.js',['TEAM_POPULATION_LIMIT','config.populationLimit'], '已有按配置核对常量机制，但固定页面和worker仍需按20/30/50冻结'),
 ('重试无次数上限','tools/phone_training_hard/process_controller.sh',['while test "$DONE" -lt "$TOTAL"','failed|truncated|stopped','retry_backoff'], '现有队列会循环重试失败及截断；新方案需有限瞬态重试与截断暂停规则')]
evidence=[]
for title,p,needles,conclusion in audit_specs:
    lines=(ROOT/p).read_text(encoding='utf8').splitlines()
    matches=[{'line':i,'text':line.strip()} for i,line in enumerate(lines,1) if any(n in line for n in needles)]
    assert matches
    evidence.append({'title':title,'path':p,'sha256':sha(ROOT/p),'evidence':matches,'conclusion':conclusion})
write('COLLECTOR_AUDIT.json',{'method':'静态源代码、历史清单与本地地图解析','phoneChecked':False,'gameActions':0,
    'collectorReadyForFullSevenCategories':False,'evidence':evidence})
input_paths=old_paths+['ai_training/training_configs/sd_training_plan_20260705.json',
    'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json','ai_training/phone_2m_scratch100_20261024/SPLIT.json',
    'ai_training/hard_native_admission_20261024/SOURCE_MANIFEST.json']
write('INPUT_IDENTITY.json',{'inputs':[{'path':p,'sha256':sha(ROOT/p)} for p in input_paths],
    'code':[{'path':e['path'],'sha256':e['sha256']} for e in evidence],
    'mapAssets':[{'path':m['path'],'sha256':m['sha256']} for m in maps]})
print(json.dumps({'slots':3000,'categories':7,'players':[1200,900,900],'firstPhase':126,
                  'actualStatesGenerated':0,'collectorStarted':False,'trainingStarted':False,'replayExecuted':False},ensure_ascii=False))
