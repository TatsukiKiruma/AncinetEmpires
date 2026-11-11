"""复用已验证三星原生采集载荷，只适配稀疏缺口调度与独立新版本目录。"""
from collections import Counter
from pathlib import Path
import hashlib
import json
import shutil
from device import OUT,ROOT,SOURCE,REMOTE,TEST_REMOTE,DEVICE,read,sha,write,text

def replace(source,before,after):
    assert source.count(before)==1,(before,source.count(before))
    return source.replace(before,after)

def main():
    segment=read(OUT/'SEGMENT_PLAN.json');dispatch=read(OUT/'DISPATCH.json');jobs=read(OUT/'JOBS.json')['jobs']
    by_seq={j['executionSequence']:j for j in jobs};by_dispatch={r['executionSequence']:r for r in dispatch['rows']}
    installed=read(ROOT/'ai_training/hard_native_second_20261023/INSTALLED.json')
    source_plan=read(ROOT/'ai_training/hard_native_1000_20261022/PLAN.json')
    common=OUT/'source';common.mkdir()
    controller=(SOURCE/'source/controller.sh').read_text(encoding='utf-8')
    controller=replace(controller,'test "$SEQ" -ge 1001 && test "$SEQ" -le 2000','test "$SEQ" -ge 1 && test "$SEQ" -le 3008')
    controller=replace(controller,'if test "$SEQ" -gt 1042; then','if ! is_observation_parent "$SEQ"; then')
    # 原执行局号保留；观察成员由独立清单判定，不根据旧连续编号推断。
    text(common/'controller.sh',controller)
    shutil.copy2(OUT/'queue_policy.sh',common/'queue_policy.sh')
    for name in ['master.sh','smart_governor.sh','process-importance.jar','curriculum-audit.jar']:
        shutil.copy2(SOURCE/'production/master'/name,common/name)
    config_by_cap={}
    for file in (SOURCE/'production/w00/configs').glob('*.json'):
        c=read(file);config_by_cap[c['populationLimit']]=c
    assert set(config_by_cap)=={20,30,50}
    plan_sha=sha(OUT/'SEGMENT_PLAN.json')
    source_files={str(p.relative_to(SOURCE)).replace('\\','/'):sha(p) for p in [SOURCE/'source/controller.sh',SOURCE/'production/master/master.sh',SOURCE/'production/master/smart_governor.sh',SOURCE/'production/master/process-importance.jar',SOURCE/'production/master/curriculum-audit.jar']}
    for label,remote,chosen in [('preflight',TEST_REMOTE,[by_seq[s] for s in dispatch['preflightSequences']]),('production',REMOTE,jobs)]:
        pack=OUT/label;pack.mkdir();master=pack/'master';master.mkdir()
        for name in ['master.sh','smart_governor.sh','process-importance.jar','curriculum-audit.jar']:shutil.copy2(common/name,master/name)
        text(master/'global.env',f'TOTAL={len(chosen)}\nINITIAL_DONE=0\nLIMIT=2\nWORKER_COUNT=2\n')
        text(master/'OPERATING_CEILING','2\n')
        observation=dispatch['observationParents']
        text(master/'OBSERVATION_PARENTS.tsv',''.join(f'{r["executionSequence"]} {r["workerId"]} {r["category"]} {r["players"]}\n' for r in observation))
        cells=sorted({(r['category'],r['players']) for r in observation});assert len(cells)==21
        text(master/'OBSERVATION_CELLS.tsv',''.join(f'{c} {n}\n' for c,n in cells))
        shutil.copy2(OUT/'PREVIOUS_ATTEMPT_HISTORY.json',master/'PREVIOUS_ATTEMPT_HISTORY.json')
        workers=[]
        for slot,item in enumerate(installed['workers'][:2]):
            wid=f'w0{slot}';package=item['package'];folder=pack/wid;folder.mkdir();(folder/'configs').mkdir()
            phone_root=remote+'-'+wid;subset=[j for j in chosen if by_dispatch[j['executionSequence']]['workerId']==wid]
            assert 1<=len(subset)<=998
            text(folder/'worker.env',f'PACKAGE={package}\nAPP_UID={item["uid"]}\nACTIVITY=net.toyknight.aeii.android.AndroidLauncher\nGLOBAL_ROOT={remote}\nWORKER_ID={wid}\nTOTAL={len(subset)}\n')
            for name in ['controller.sh','queue_policy.sh']:shutil.copy2(common/name,folder/name)
            old_thaw=(SOURCE/f'production/{wid}/process_thaw.sh').read_text(encoding='utf-8')
            old_root=f'/data/local/tmp/aeii-hard-production-parallel-curriculum7-samsung-20261028-v1-{wid}'
            thaw=replace(old_thaw,old_root,phone_root);text(folder/'process_thaw.sh',thaw)
            text(folder/'attempt-prefix.txt',f'hc7-gap-samsung-20261029-v1-{wid}\n');text(folder/'inject-path.txt','/system/bin/true\n')
            for name in ['collector.bundle.js','base-config.zip']:
                src=SOURCE/f'production/{wid}'/name;shutil.copy2(src,folder/name);source_files[str(src.relative_to(SOURCE)).replace('\\','/')]=sha(src)
            assert sha(folder/'base-config.zip')==source_plan['inputs']['baseConfigZip']['sha256']
            index=[]
            for j in subset:
                seq=j['executionSequence'];cap=j['setup']['unitLimit'];cfg=dict(config_by_cap[cap])
                cfg.update({'package':package,'job':j,'outputDirectory':f'/data/user/0/{package}/files/.aeii-hard-production/__ATTEMPT__','baseConfigZip':phone_root+'/base-config.zip','taskRoot':phone_root,'globalRoot':remote,'workerId':wid,'planSha256':plan_sha,'sequenceIndex':seq,'installedApkSha256':item['sha256'],'sourceApkSha256':source_plan['apkSha256'],'maxActions':j['maxActions'],'replay':'disabled_by_user','independentReplayDeferred':False,'strategyFamily':'apk_hard_original_curriculum_gap_samsung_20261029_v1','previousAttemptHistorySha256':sha(OUT/'PREVIOUS_ATTEMPT_HISTORY.json')})
                assert cfg['populationLimit']==cap and cfg['populationCaps']==[cap]*6
                write(folder/'configs'/f'{seq:04d}.json',cfg);index.append(f'{seq} {j["parentId"]} {phone_root}/configs/{seq:04d}.json\n')
            text(folder/'index.txt',''.join(index));workers.append({**item,'workerId':wid,'remoteRoot':phone_root,'sequences':[j['executionSequence'] for j in subset]})
        text(master/'workers.tsv',''.join(f'{w["workerId"]} {w["package"]} {w["uid"]} {w["remoteRoot"]}\n' for w in workers))
        write(pack/'PLAN.json',{'device':DEVICE,'remoteRoot':remote,'total':len(chosen),'workers':workers,'limit':2,'preflightCountsWithinBatch':True,'replay':'disabled_by_user','computerRequired':False})
        write(pack/'SOURCE_SHA256.json',{str(p.relative_to(pack)).replace('\\','/'):sha(p) for p in pack.rglob('*') if p.is_file()})
    write(OUT/'PREPARED.json',{'total':len(jobs),'preflight':dispatch['preflightSequences'],'productionWorkers':[len(w['sequences']) for w in workers],'sourceFiles':source_files,'sourceRuntimeUnchanged':True,'queuePolicyAdaptedForSparseOriginalSequences':True,'gameActionsExecuted':0,'historicalReplay':False,'training':False})
    print(json.dumps({'total':len(jobs),'preflight':dispatch['preflightSequences'],'workers':[len(w['sequences']) for w in workers]},ensure_ascii=False))

if __name__=='__main__':main()
