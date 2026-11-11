"""冻结第二段1000局及无root独立本地队列，复用现有困难采集器。"""
from pathlib import Path
import collections
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile

from device import ROOT, TASK, DEVICE
HERE = Path(__file__).resolve().parent
COMMON = HERE.parent
REMOTE = '/data/local/tmp/aeii-hard-production-parallel-samsung-20261023-03'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def replace(text, old, new):
    assert text.count(old) == 1, old
    return text.replace(old, new)


def main():
    identity = json.loads((TASK / 'INSTALLED.json').read_text(encoding='utf-8'))
    source_path = ROOT / 'ai_training/pretrain_preflight_20261022/HARD_SAMPLING_PLAN.json'
    source = json.loads(source_path.read_text(encoding='utf-8'))
    mi = json.loads((ROOT / 'ai_training/hard_native_1000_20261022/PLAN.json').read_text(encoding='utf-8'))
    selected = source['jobs'][1000:2000]
    assert len(selected) == 1000 and set(collections.Counter(j['map'] for j in selected).values()) == {125}
    assert not {j['seed'] for j in selected}.intersection(j['seed'] for j in mi['jobs'])
    assert not {j['parentId'] for j in selected}.intersection(j['sourcePlanParentId'] for j in mi['jobs'])
    jobs = [{'index': i, 'globalZeroBasedIndex': i - 1, 'parentId': j['parentId'], 'sourcePlanParentId': j['parentId'],
             'attemptId': '__ATTEMPT__', 'map': j['map'], 'seed': j['seed'], 'maxActions': 20000,
             'mode': 'SD', 'requestedPlayerType': 3, 'jsRngMode': 'original_webview_rng'} for i, j in enumerate(selected, 1001)]
    plan = {'schema': 'samsung-second-hard-segment-v1', 'device': DEVICE, 'sourcePlan': str(source_path), 'sourcePlanSha256': sha(source_path),
            'globalZeroBasedRange': [1000, 2000], 'humanGameNumbers': [1001, 2000], 'total': 1000, 'sourceApkSha256': source['apkSha256'],
            'quota': dict(collections.Counter(j['map'] for j in jobs)), 'jobs': jobs, 'jsSeedControlled': False,
            'javaHardFallbackPreserved': True, 'independentReplayDeferred': True, 'automaticTrainingAdmission': False,
            'noOverlapWithMi8': True, 'mi8PlanSha256': sha(ROOT / 'ai_training/hard_native_1000_20261022/PLAN.json')}
    write(TASK / 'SEGMENT_PLAN.json', plan)
    out = TASK / 'production-03'
    out.mkdir(exist_ok=False)
    master = out / 'master'
    master.mkdir()
    controller = (COMMON / 'process_controller.sh').read_text(encoding='utf-8')
    controller = replace(controller, 'test "$SEQ" -ge 3 && test "$SEQ" -le 1000', 'test "$SEQ" -ge 1001 && test "$SEQ" -le 2000')
    controller = replace(controller, 'test "$TOTAL" -le 998', 'test "$TOTAL" -le 1000')
    controller = replace(controller, 'test ! -e "$CONFIG" && test ! -e "$OUT" && break', 'test ! -e "$CONFIG" && ! run-as "$PACKAGE" test -e "$OUT" && break')
    controller = replace(controller, '    stop_owned "$CHILD" "$CHILD_START" inject || return 1\n', '')
    controller = replace(controller, '        am start -n "$PACKAGE/$ACTIVITY"', '        run-as "$PACKAGE" sh -c "cat $BUNDLE > files/collector.bundle.js; cat $CONFIG > files/current.json" || fatal \'无法准备本地Gadget输入\'\n        am start -n "$PACKAGE/$ACTIVITY"')
    left = controller.index('                PARAMS=$(cat "$CONFIG")')
    right = controller.index('\n            fi\n        fi\n', left)
    controller = controller[:left] + '                # Gadget随本次应用进程加载，生命周期与宿主相同。\n                CHILD=$APP_PID; CHILD_START=$APP_START\n' + controller[right:]
    controller = replace(controller, '            JOB_STATE="$OUT/STATE.json"', '            JOB_STATE="$TASK_ROOT/current-state.json"\n            run-as "$PACKAGE" cat "$OUT/STATE.json" > "$JOB_STATE.tmp" 2>/dev/null && mv "$JOB_STATE.tmp" "$JOB_STATE" || : > "$JOB_STATE"')
    controller = replace(controller, 'if test -f "$OUT/artifact-manifest.json" && test -f "$OUT/THREAD_EXITED.json";', 'if run-as "$PACKAGE" sh -c "test -f $OUT/artifact-manifest.json && test -f $OUT/THREAD_EXITED.json";')
    master_source = (COMMON / 'process_master.sh').read_text(encoding='utf-8')
    master_source = replace(master_source, 'test "$META_OWNER" = 0 && test "$META_GROUP" = 0', 'test "$META_OWNER" = 2000 && test "$META_GROUP" = 2000')
    master_source = replace(master_source, 'test "$OPERATING_CEILING" = 2 && test "$WORKER_COUNT" -ge 2', 'test "$OPERATING_CEILING" -ge 1 && test "$OPERATING_CEILING" -le 3 && test "$WORKER_COUNT" -ge "$OPERATING_CEILING"')
    master_source = master_source.replace('CEILING_MODE=1; RECOVERY_TARGET=2;', 'CEILING_MODE=1; RECOVERY_TARGET=$ACTIVE_LIMIT;')
    master_source = master_source.replace('本轮选定最高档位必须为2', '本轮选定档位必须为1至3')
    master_source = master_source.replace('最高2', '最高$OPERATING_CEILING').replace('已选定的2档', '已选定档位')
    # 此机自带awk在exit加逻辑非表达式时崩溃，数值门禁改用shell整数比较。
    master_source = master_source.replace('awk -v cpu="$CPU" \'BEGIN{exit !(cpu>=90)}\'', 'test "${CPU%.*}" -ge 90')
    master_source = master_source.replace('awk -v cpu="$CPU" \'BEGIN{exit !(cpu<75)}\'', 'test "${CPU%.*}" -lt 75')
    master_source = master_source.replace('awk -v cpu="$CPU" \'BEGIN{exit !(cpu<80)}\'', 'test "${CPU%.*}" -lt 80')
    master_source = replace(master_source, 'if test "$((ROTATION_NOW-LAST_ROTATION_TIME))" -ge 60;', 'if test ! -e "$GLOBAL_ROOT/STRESS_MODE" && test "$((ROTATION_NOW-LAST_ROTATION_TIME))" -ge 60;')
    # 最终实测选档文件支持运行中收紧上限，无需重启在途对局。
    insertion = '''    if test -e "$GLOBAL_ROOT/SELECTED_LIMIT" && trusted_control_file "$GLOBAL_ROOT/SELECTED_LIMIT"; then
        FINAL_LIMIT=$(cat "$GLOBAL_ROOT/SELECTED_LIMIT")
        case "$FINAL_LIMIT" in 1|2|3)
            if test "$FINAL_LIMIT" -le "$OPERATING_CEILING"; then
                OPERATING_CEILING=$FINAL_LIMIT
                test "$RECOVERY_TARGET" -le "$FINAL_LIMIT" || RECOVERY_TARGET=$FINAL_LIMIT
                test "$ACTIVE_LIMIT" -le "$FINAL_LIMIT" || ACTIVE_LIMIT=$FINAL_LIMIT
            fi ;;
        esac
    fi
'''
    master_source = replace(master_source, '    GOVERNOR_NOW=$(awk', insertion + '    GOVERNOR_NOW=$(awk')
    (master / 'master.sh').write_text(master_source, encoding='utf-8', newline='\n')
    (master / 'global.env').write_text('TOTAL=1000\nINITIAL_DONE=0\nLIMIT=1\nWORKER_COUNT=3\n', encoding='utf-8', newline='\n')
    (master / 'OPERATING_CEILING').write_text('3\n', encoding='utf-8', newline='\n')
    (master / 'STRESS_MODE').write_text('1\n', encoding='utf-8', newline='\n')
    importance = (COMMON / 'ProcessImportance.java').read_text(encoding='utf-8')
    importance = importance.replace('uid!=0', 'uid!=2000').replace('if(uid!=0)', 'if(uid!=2000)').replace('root', 'shell')
    (out / 'ProcessImportance.java').write_text(importance, encoding='utf-8', newline='\n')
    deps = Path('C:/Users/SHIINA/.codex/visualizations/2026/10/17/01a14755-acbf-7251-be32-9616bde062c8/phone-posttraining/teacher-art/deps')
    classes = out / 'classes'; classes.mkdir()
    java = 'C:/Program Files/Java/jre1.8.0_491/bin/java.exe'
    commands = [[java, '-jar', str(deps/'ecj.jar'), '-source', '1.6', '-target', '1.6', '-encoding', 'UTF-8', '-d', str(classes), str(out/'ProcessImportance.java')],
                [java, '-cp', str(deps/'dx.jar'), 'com.android.dx.command.Main', '--dex', '--output='+str(out/'classes.dex'), str(classes)]]
    for command in commands:
        result = subprocess.run(command, capture_output=True)
        assert result.returncode == 0, result.stdout + result.stderr
    with zipfile.ZipFile(master / 'process-importance.jar', 'x') as jar:
        jar.write(out/'classes.dex', 'classes.dex')
    frozen = ROOT / 'ai_training/hard_native_1000_20261022/production-independent-05'
    bridge = Path(mi['inputs']['javaBridge']['path']).read_text(encoding='utf-8')
    html = (frozen/'hard-ai-runtime.fixed.html').read_text(encoding='utf-8')
    native = (COMMON/'native_engine_collect.rhino.js').read_text(encoding='utf-8')
    worker = (COMMON/'process_worker.rhino.js').read_text(encoding='utf-8')
    runtime = (COMMON/'production_runtime.frida.js').read_text(encoding='utf-8')
    assert 'Java.deoptimizeEverything' not in runtime and '.implementation =' not in runtime
    rows, assignments = [], []
    for slot, item in enumerate(identity['workers']):
        wid, pkg = f'w0{slot}', item['package']
        local = out/wid; local.mkdir(); (local/'configs').mkdir()
        phone = REMOTE+'-'+wid
        env = {'PACKAGE':pkg,'APP_UID':item['uid'],'ACTIVITY':'net.toyknight.aeii.android.AndroidLauncher','GLOBAL_ROOT':REMOTE,'WORKER_ID':wid,'TOTAL':len(jobs[slot::3])}
        (local/'worker.env').write_text(''.join(f'{k}={v}\n' for k,v in env.items()),encoding='utf-8',newline='\n')
        (local/'controller.sh').write_text(controller,encoding='utf-8',newline='\n')
        thaw = (COMMON/'process_thaw.sh').read_text(encoding='utf-8')
        a, b = thaw.index('    is_frozen "$1" || return 0'), thaw.index('\n}\nCACHE_OK=0')
        thaw = thaw[:a] + '    # Android9无root版本仅核验归属并发布定向保活名单。\n    return 0' + thaw[b:]
        (local/'process_thaw.sh').write_text(thaw,encoding='utf-8',newline='\n')
        (local/'inject-path.txt').write_text('/system/bin/true\n',encoding='utf-8',newline='\n')
        (local/'attempt-prefix.txt').write_text('samsung-seg2-p03-20261023-'+wid+'\n',encoding='utf-8',newline='\n')
        shutil.copy2(frozen/'base-config.zip',local/'base-config.zip')
        bundle = bridge + '\nglobalThis.Java=bridge;\n'
        for name, value in [('HARD_EXPECTED',{'package':pkg,'sha256':item['sha256']}),('HARD_NATIVE_SOURCE',native),('HARD_WORKER_SOURCE',worker),('HARD_FIXED_HTML',html)]:
            bundle += 'const '+name+'='+json.dumps(value,ensure_ascii=True)+';\n'
        bundle += runtime
        bundle += '\nconst originalInit=rpc.exports.init; rpc.exports.init=function(stage,unused){const cfg=JSON.parse(File.readAllText('+json.dumps('/data/user/0/'+pkg+'/files/current.json')+'));function awaitVM(){if(!Java.available){setTimeout(awaitVM,100);return;}originalInit(stage,cfg);}setTimeout(awaitVM,5000);return{accepted:true,waitingForJavaVM:true};};\n'
        (local/'collector.bundle.js').write_text(bundle,encoding='utf-8',newline='\n')
        index = []
        for job in jobs[slot::3]:
            seq = job['index']
            config = {'package':pkg,'job':job,'outputDirectory':f'/data/user/0/{pkg}/files/.aeii-hard-production/__ATTEMPT__',
                      'baseConfigZip':phone+'/base-config.zip','baseConfigName':mi['inputs']['baseConfigEntry'],'taskRoot':phone,'globalRoot':REMOTE,
                      'workerId':wid,'populationLimit':30,'populationCaps':[30]*6,'patchHTMLSha':hashlib.sha256(html.encode()).hexdigest(),
                      'planSha256':sha(TASK/'SEGMENT_PLAN.json'),'sourceApkSha256':plan['sourceApkSha256'],'installedApkSha256':item['sha256'],
                      'sequenceIndex':seq,'maxActions':20000,'independentReplayDeferred':True,'strategyFamily':'apk_hard_original_process_isolated'}
            write(local/'configs'/f'{seq:04d}.json',config)
            index.append(f'{seq} {job["parentId"]} {phone}/configs/{seq:04d}.json\n')
        (local/'index.txt').write_text(''.join(index),encoding='utf-8',newline='\n')
        rows.append(f'{wid} {pkg} {item["uid"]} {phone}\n')
        assignments.append({**item,'workerId':wid,'remoteRoot':phone,'sequences':[j['index'] for j in jobs[slot::3]]})
    (master/'workers.tsv').write_text(''.join(rows),encoding='utf-8',newline='\n')
    write(out/'PLAN.json',{'remoteRoot':REMOTE,'device':DEVICE,'limit':1,'initialDone':0,'total':1000,'workers':assignments,'segmentPlanSha256':sha(TASK/'SEGMENT_PLAN.json'),'sourceApkSha256':plan['sourceApkSha256']})
    source_out = out/'source'; source_out.mkdir()
    for path in list(HERE.glob('*.py')) + [COMMON/n for n in ['process_controller.sh','process_master.sh','process_thaw.sh','process_worker.rhino.js','production_runtime.frida.js','native_engine_collect.rhino.js','ProcessImportance.java']]:
        shutil.copy2(path,source_out/path.name)
    write(out/'SOURCE_SHA256.json',{str(p.relative_to(out)).replace('\\','/'):sha(p) for p in out.rglob('*') if p.is_file()})
    print(json.dumps({'directory':str(out),'total':1000,'range':[1000,2000],'remoteRoot':REMOTE},ensure_ascii=False))


if __name__ == '__main__':
    main()
