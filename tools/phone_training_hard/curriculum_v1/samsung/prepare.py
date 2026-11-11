"""保留全部新初态字段，适配无root三星的本地Gadget与有限重试。"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import shutil
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from device import ROOT,TASK,OUT,SOURCE,REMOTE,TEST_REMOTE,PREVIOUS,DEVICE,call,shell,app,identity,sha,write,text
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from html import make_htmls

def replace(s,a,b,n=1):
    assert s.count(a)==n,(a[:90],s.count(a),n)
    return s.replace(a,b)

def main():
    before=identity();write(OUT/'IDENTITY.json',before)
    write(OUT/'AUTHORIZATION.json',{'date':'2026-10-28','source':'用户明确通知三星已连接，要求测试核验独立运行后下发并结束对话','device':DEVICE,'range':[1001,2000],'workers':2,'replay':'disabled_by_user','training':False,'batch3':'未授权执行设备，不启动'})
    phone=OUT/'phone-source';phone.mkdir()
    for group,names in {'master':['master-smart-01.sh','smart_governor.sh','process-importance.jar'],
                         'w00':['controller.sh','process_thaw.sh','collector.bundle.js','base-config.zip'],
                         'w01':['controller.sh','process_thaw.sh','collector.bundle.js','base-config.zip']}.items():
        folder=phone/group;folder.mkdir();remote=PREVIOUS if group=='master' else PREVIOUS+'-'+group
        for name in names:
            call('pull',remote+'/'+name,folder/name)
            assert sha(folder/name)==shell('sha256sum '+remote+'/'+name).split()[0]
    # 新状态投影、人口合同和困难调用逐字节复用已验证的公共版本。
    controller=(SOURCE/'controller.sh').read_text(encoding='utf-8')
    controller=replace(controller,'test "$SEQ" -ge 1 && test "$SEQ" -le 1000','test "$SEQ" -ge 1001 && test "$SEQ" -le 2000')
    controller=replace(controller,'if test "$SEQ" -gt 42; then','if test "$SEQ" -gt 1042; then')
    controller=replace(controller,'test ! -e "$CONFIG" && test ! -e "$OUT" && break','test ! -e "$CONFIG" && ! run-as "$PACKAGE" test -e "$OUT" && break')
    controller=replace(controller,'    stop_owned "$CHILD" "$CHILD_START" inject || return 1\n','')
    controller=replace(controller,'        am start -n "$PACKAGE/$ACTIVITY"', '''        (run-as "$PACKAGE" sh -c 'cat > files/collector.bundle.js' < "$BUNDLE" && run-as "$PACKAGE" sh -c 'cat > files/current.json' < "$CONFIG") || fatal '无法准备本地Gadget输入'
        am start -n "$PACKAGE/$ACTIVITY"''')
    left=controller.index('                PARAMS=$(cat "$CONFIG")');right=controller.index('\n            fi\n        fi\n',left)
    controller=controller[:left]+'                # Gadget在手机应用进程内加载，不需要主机Frida会话。\n                CHILD=$APP_PID; CHILD_START=$APP_START\n'+controller[right:]
    controller=replace(controller,'            JOB_STATE="$OUT/STATE.json"','''            JOB_STATE="$TASK_ROOT/current-state.json"
            run-as "$PACKAGE" cat "$OUT/STATE.json" > "$JOB_STATE.tmp" 2>/dev/null && mv "$JOB_STATE.tmp" "$JOB_STATE" || : > "$JOB_STATE"''')
    controller=replace(controller,'if test -f "$OUT/artifact-manifest.json" && test -f "$OUT/THREAD_EXITED.json";', 'if run-as "$PACKAGE" sh -c "test -f $OUT/artifact-manifest.json && test -f $OUT/THREAD_EXITED.json";')
    controller=replace(controller,'if CLASSPATH="$GLOBAL_ROOT/curriculum-audit.jar" app_process /system/bin CurriculumAudit "$OUT" "$CONFIG" > "$RUN_LOG.audit" 2>&1;', 'if run-as "$PACKAGE" sh -c "CLASSPATH=$GLOBAL_ROOT/curriculum-audit.jar app_process /system/bin CurriculumAudit $OUT files/current.json" > "$RUN_LOG.audit" 2>&1;')
    controller=replace(controller,'grep -F initial_state_mismatch "$OUT/worker-error.json"', 'run-as "$PACKAGE" cat "$OUT/worker-error.json" 2>/dev/null | grep -F initial_state_mismatch')
    # 本机旧awk拒绝exit !表达式，保留等价的显式分支。
    policy=(SOURCE/'queue_policy.sh').read_text(encoding='utf-8').replace('seq 1 42','seq 1001 1042').replace('END{exit !found}','END{if(found)exit 0;exit 1}')
    master=(phone/'master/master-smart-01.sh').read_text(encoding='utf-8')
    master=replace(master,'smart_init 3 ','smart_init 2 ')
    master=master.replace('independentReplayDeferred":true','replay":"disabled_by_user"')
    governor=(phone/'master/smart_governor.sh').read_text(encoding='utf-8').replace('RECOVERY_TARGET=3; OPERATING_CEILING=3','RECOVERY_TARGET=2; OPERATING_CEILING=2').replace('正常3路','正常2路')
    common=OUT/'source';common.mkdir()
    for name,data in [('controller.sh',controller),('queue_policy.sh',policy),('master.sh',master),('smart_governor.sh',governor)]:text(common/name,data)
    for name in ['native_engine.rhino.js','projection.rhino.js','worker.rhino.js','runtime.frida.js','curriculum-audit.jar']:
        shutil.copy2(SOURCE/name,common/name)
    shutil.copy2(phone/'master/process-importance.jar',common/'process-importance.jar')
    old=json.loads((ROOT/'ai_training/hard_native_1000_20261022/PLAN.json').read_text(encoding='utf-8'))
    bridge=Path(old['inputs']['javaBridge']['path']);assert sha(bridge)==old['inputs']['javaBridge']['sha256']
    html=(ROOT/'ai_training/hard_native_1000_20261022/production-independent-05/hard-ai-runtime.fixed.html').read_text(encoding='utf-8');htmls=make_htmls(html)
    jobs=json.loads((TASK/'JOBS.json').read_text(encoding='utf-8'))['jobs'][1000:2000]
    assert len(jobs)==1000 and [j['executionSequence'] for j in jobs]==list(range(1001,2001))
    assert Counter(j['actualPlayerCount'] for j in jobs)=={2:400,3:300,4:300}
    write(OUT/'SEGMENT_PLAN.json',{'device':DEVICE,'humanGameNumbers':[1001,2000],'jobs':jobs,'sourceJobsSha256':sha(TASK/'JOBS.json'),'sequenceSha256':sha(TASK/'EXECUTION_SEQUENCE.json'),'replay':'disabled_by_user','training':False})
    # 三个正常开局父局属于本批正式配额；测试完成后复用成功与失败账本。
    test_sequences=[1010,1011,1012]
    assert [jobs[i-1001]['category'] for i in test_sequences]==['normal']*3
    for label,remote,chosen in [('preflight',TEST_REMOTE,[j for j in jobs if j['executionSequence'] in test_sequences]),('production',REMOTE,jobs)]:
        pack=OUT/label;pack.mkdir();global_dir=pack/'master';global_dir.mkdir()
        for name in ['master.sh','smart_governor.sh','process-importance.jar','curriculum-audit.jar']:shutil.copy2(common/name,global_dir/name)
        text(global_dir/'global.env',f'TOTAL={len(chosen)}\nINITIAL_DONE=0\nLIMIT=2\nWORKER_COUNT=2\n')
        text(global_dir/'OPERATING_CEILING','2\n')
        text(global_dir/'OBSERVATION_CELLS.tsv',''.join(f'{j["executionSequence"]} {j["category"]} {j["actualPlayerCount"]}\n' for j in jobs[:21]))
        workers=[]
        for slot,item in enumerate(before['installed']['workers'][:2]):
            wid=f'w0{slot}';pkg=item['package'];folder=pack/wid;folder.mkdir();(folder/'configs').mkdir();phone_root=remote+'-'+wid
            subset=[j for j in chosen if (j['executionSequence']-1001)%2==slot]
            text(folder/'worker.env',f'PACKAGE={pkg}\nAPP_UID={item["uid"]}\nACTIVITY=net.toyknight.aeii.android.AndroidLauncher\nGLOBAL_ROOT={remote}\nWORKER_ID={wid}\nTOTAL={len(subset)}\n')
            for name in ['controller.sh','queue_policy.sh']:shutil.copy2(common/name,folder/name)
            thaw=(phone/wid/'process_thaw.sh').read_text(encoding='utf-8')
            # 只准守护当前新任务路径，旧队列扫描目标不复用。
            thaw=re.sub(r'/data/local/tmp/aeii-hard-production-parallel-samsung-[A-Za-z0-9_-]+-w0\[012\]',phone_root,thaw)
            assert phone_root in thaw
            text(folder/'process_thaw.sh',thaw)
            text(folder/'attempt-prefix.txt',f'hc7-samsung-20261028-v1-{wid}\n');text(folder/'inject-path.txt','/system/bin/true\n')
            shutil.copy2(phone/wid/'base-config.zip',folder/'base-config.zip')
            assert sha(folder/'base-config.zip')==old['inputs']['baseConfigZip']['sha256']
            native=(common/'native_engine.rhino.js').read_text(encoding='utf-8')+'\n'+(common/'projection.rhino.js').read_text(encoding='utf-8')
            bundle=bridge.read_text(encoding='utf-8')+'\nglobalThis.Java=bridge;\n'
            for key,value in [('HARD_EXPECTED',{'package':pkg,'sha256':item['sha256']}),('HARD_NATIVE_SOURCE',native),('HARD_WORKER_SOURCE',(common/'worker.rhino.js').read_text(encoding='utf-8')),('HARD_HTML_BY_CAP',htmls)]:bundle+='const '+key+'='+json.dumps(value,ensure_ascii=True)+';\n'
            bundle+=(common/'runtime.frida.js').read_text(encoding='utf-8')
            bundle+='\nconst originalInit=rpc.exports.init;rpc.exports.init=function(stage,unused){const cfg=JSON.parse(File.readAllText('+json.dumps('/data/user/0/'+pkg+'/files/current.json')+'));function awaitVM(){if(!Java.available){setTimeout(awaitVM,100);return;}originalInit(stage,cfg);}setTimeout(awaitVM,5000);return{accepted:true,waitingForJavaVM:true};};\n'
            text(folder/'collector.bundle.js',bundle)
            index=[]
            for job in subset:
                seq=job['executionSequence'];cap=job['setup']['unitLimit']
                cfg={'package':pkg,'job':job,'outputDirectory':f'/data/user/0/{pkg}/files/.aeii-hard-production/__ATTEMPT__','baseConfigZip':phone_root+'/base-config.zip','baseConfigName':old['inputs']['baseConfigEntry'],'taskRoot':phone_root,'globalRoot':remote,'workerId':wid,'populationLimit':cap,'populationCaps':[cap]*6,'patchHTMLSha':hashlib.sha256(htmls[str(cap)].encode()).hexdigest(),'planSha256':sha(OUT/'SEGMENT_PLAN.json'),'sourceApkSha256':old['apkSha256'],'installedApkSha256':item['sha256'],'sequenceIndex':seq,'maxActions':20000,'replay':'disabled_by_user','independentReplayDeferred':False,'strategyFamily':'apk_hard_original_curriculum_samsung_v1'}
                write(folder/'configs'/f'{seq:04d}.json',cfg);index.append(f'{seq} {job["parentId"]} {phone_root}/configs/{seq:04d}.json\n')
            text(folder/'index.txt',''.join(index))
            workers.append({**item,'workerId':wid,'remoteRoot':phone_root,'sequences':[j['executionSequence'] for j in subset]})
        text(global_dir/'workers.tsv',''.join(f'{w["workerId"]} {w["package"]} {w["uid"]} {w["remoteRoot"]}\n' for w in workers))
        write(pack/'PLAN.json',{'device':DEVICE,'remoteRoot':remote,'total':len(chosen),'humanGameNumbers':[1001,2000],'workers':workers,'limit':2,'preflightCountsWithinBatch':True,'replay':'disabled_by_user'})
        write(pack/'SOURCE_SHA256.json',{str(p.relative_to(pack)).replace('\\','/'):sha(p) for p in pack.rglob('*') if p.is_file()})
    print(json.dumps({'prepared':str(OUT),'preflightParents':test_sequences,'productionParents':1000,'workers':2},ensure_ascii=False))
if __name__=='__main__':main()
