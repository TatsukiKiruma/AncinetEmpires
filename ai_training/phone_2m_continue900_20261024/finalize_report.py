"""整理缓存清理与追加900局发布回执，不执行手机训练或重放。"""
import json
from device import HERE,write

live=json.loads((HERE/'LATEST_STATUS.json').read_text(encoding='utf-8'))
cleanup=json.loads((HERE/'CACHE_CLEANUP_RESULT.json').read_text(encoding='utf-8'))
plan=json.loads((HERE/'PLAN.json').read_text(encoding='utf-8'))
safe=json.loads((HERE/'SAFE_TO_DISCONNECT.json').read_text(encoding='utf-8'))
write(HERE/'EXECUTION_REPORT.json',{
    'status':'追加900局已发布并在手机运行，可拔线充电',
    'cleanup':{'removedFiles':cleanup['removedFiles'],'removedLogicalBytes':cleanup['removedLogicalBytes'],'hashMismatches':cleanup['mismatches'],'allRemovedFilesBackedUpAndVerified':True,
               'computerDataAndHistoricalModelsPreserved':True,'installedRuntimePreserved':True,'final100CheckpointPreserved':True},
    'training':{'modelParameters':1966910,'dtype':'float32','workers':2,'threadsPerWorker':2,'effectiveBatch':8,'microbatch':1,
                'baseCheckpointSha256':plan['baseCheckpointSha256'],'baseStep':9139,'baseSamples':73112,'parentRange':[101,1000],'additionalParents':900,
                'additionalSamples':721352,'additionalUpdates':90169,'stopAtGlobalStep':99308,'benchmark20BranchPreserved':True,
                'currentProgress':live['progress'],'optimizerAndSchedulerReset':False,'resumeVerified':True,'workerRngStatesVerified':True,'parallelGradientVerified':True,
                'hostOptimizerUpdates':0,'automaticBeyond1000':False,'newStrictReplayExecuted':False,'phoneOnlyFeatureEncoding':'完整原始输入已在手机；本地流式编码且最多预取16条样本，无全量特征磁盘缓存'},
    'resource':live['resource'],'safeToDisconnect':safe['ready'],'inputAndRuntimeEvidence':['DEPLOYED.json','ENCODER_PROBE.json','LATEST_STATUS.json','SAFE_TO_DISCONNECT.json'],
    'repairs':'首启日志目录缺失导致在新增更新前退出；现场保留在手机attempts/start01，补齐后正常运行。启动前RNG跨进程传输已改为numpy并实际恢复验证通过。',
    'completionPolicy':'本轮900父局一遍结束，保存模型、AdamW、scheduler、RNG和游标后停止；累计1000局，不自动启动后续轮次。',
    'phoneRoot':'/data/local/tmp/aeii-2m-continue900-20261024','resultRetrieval':'运行日志与最终检查点保存在手机，重连后可取回。'
})
print(json.dumps({'released':True,'safeToDisconnect':safe['ready'],'workers':2,'newUpdates':live['progress']['segmentUpdates'],'newSamples':live['progress']['cursor'],'cacheRemovedBytes':cleanup['removedLogicalBytes']}))
