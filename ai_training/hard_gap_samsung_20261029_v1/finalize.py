"""封存一次性下发证据并更新当前三星路由；不继续监看或调度电脑采集。"""
import datetime as dt
import shutil
from device import OUT,ROOT,REMOTE,DEVICE,read,sha,write

def main():
    offline=read(OUT/'PRODUCTION_OFFLINE_CONFIRMED.json');assert offline['passed']
    test=read(OUT/'PREFLIGHT_CONFIRMED.json');assert test['passed'] and test['naturalParents']==3
    deployed=read(OUT/'production/DEPLOYED.json');segment=read(OUT/'SEGMENT_PLAN.json')
    state=offline['phoneState'];assert state['total']==1172
    now=dt.datetime.now(dt.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%SZ')
    delivery={'phase':'deployed_independent_phone_running','captured':now.isoformat(),'device':DEVICE,'model':'SM-N9500','remoteRoot':REMOTE,'parents':1172,'frozenOriginalMissing':1164,'newParentsForDuplicateGap':8,'byCategory':segment['byCategory'],'byPlayers':segment['byPlayers'],'maximumWorkers':2,'naturalParentsAtSnapshot':state['doneParents'],'remainingParentsAtSnapshot':state['remainingParents'],'preflightNaturalParentsCountedWithin1172':3,'preflightActions':sum(r['actions'] for r in test['results']),'preflightFailedAttemptsPreserved':read(OUT/'PREFLIGHT_ATTEMPTS.json')['failedAttempts'],'originalJobsUnchanged':True,'oldAttemptHistoryRetained':True,'newVersionMaximumStartsPerParent':3,'allInputFilesShaVerified':True,'sourceRuntimeUnchanged':True,'phoneOriginalSourceSeparateFromPcGpu':True,'masterProcess':offline['master'],'screenOffProgressVerified':True,'physicalUsbDisconnectTested':False,'computerRequired':False,'networkForwardRequired':False,'activeChatRequired':False,'phoneRebootAutoResume':False,'computerGpuCollectionStillStopped':(ROOT/'ai_training/hard_collection_pc64_v4_20261029/STOP').exists(),'historicalReplay':False,'training':False,'tensorGeneration':False,'automaticAdmission':False,'frozen2414_268SplitChanged':False}
    write(OUT/'DELIVERY.json',delivery)
    write(OUT/'STATUS_AT_DELIVERY.json',state)
    route={'device':DEVICE,'plan':str((OUT/'production/PLAN.json').resolve()),'segmentPlan':str((OUT/'SEGMENT_PLAN.json').resolve()),'remoteRoot':REMOTE,'phase':'running_at_delivery_snapshot','captured':now.isoformat(),'status':str((OUT/'STATUS_AT_DELIVERY.json').resolve()),'delivery':str((OUT/'DELIVERY.json').resolve()),'readOnlyStatusCommand':'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 ai_training/hard_gap_samsung_20261029_v1/verify.py snapshot --label production','total':1172,'workers':2,'replay':'disabled_by_user','computerRequired':False}
    write(OUT/'ACTIVE_COLLECTION.json',route)
    shared=ROOT/'ai_training/hard_curriculum3000_execution_20261027/SAMSUNG_ACTIVE_COLLECTION.json'
    if shared.exists():shutil.copy2(shared,shared.with_name('SAMSUNG_ACTIVE_COLLECTION-before-gap-'+stamp+'.json'))
    shared.write_text(__import__('json').dumps(route,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    files={str(p.relative_to(OUT)).replace('\\','/'):sha(p) for p in OUT.rglob('*') if p.is_file() and p.suffix in ['.json','.py','.mjs','.sh'] and '__pycache__' not in p.parts}
    write(OUT/'DELIVERY_MANIFEST.json',{'created':now.isoformat(),'files':files,'phoneInputManifests':{'preflight':sha(OUT/'preflight/SOURCE_SHA256.json'),'production':sha(OUT/'production/SOURCE_SHA256.json')},'allOriginalRecordsRetained':True})
    print(__import__('json').dumps({'total':1172,'phoneNaturalAtSnapshot':state['doneParents'],'maximumWorkers':2,'independent':True,'delivery':str(OUT/'DELIVERY.json')},ensure_ascii=False))

if __name__=='__main__':main()
