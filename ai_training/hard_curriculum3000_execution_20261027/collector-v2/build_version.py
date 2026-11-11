"""构建独立版本，不修改旧生产采集器和旧数据。"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
import sys
HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[2]
OUT = ROOT / 'ai_training/hard_curriculum3000_execution_20261027'

def replace(text, old, new, count=1):
    assert text.count(old) == count, (old[:100], text.count(old), count)
    return text.replace(old, new)

def build():
    target = OUT / (sys.argv[1] if len(sys.argv)>1 else 'collector-v1')
    target.mkdir(exist_ok=False)
    native = (BASE/'native_engine_collect.rhino.js').read_text(encoding='utf-8')
    native = replace(native,"var active = get(map, 'd');", "Curriculum.before(config,map,job,directory);\n  var active = get(map, 'd');")
    native = replace(native,"var state = get(engine, 'e');", "var state = get(engine, 'e');\n  var receipt=Curriculum.after(state,job,directory);")
    native = replace(native,'state: state, snapshot: snapshot','state: state, snapshot: snapshot, receipt: receipt')
    worker = (BASE/'process_worker.rhino.js').read_text(encoding='utf-8')
    worker = replace(worker,'Number(cfg.populationLimit) !== 30','[20,30,50].indexOf(Number(cfg.populationLimit)) < 0')
    worker = replace(worker,"Number(limits[team]) !== 30) throw new Error('原生配置人口上限不是30')", "Number(limits[team]) !== Number(job.setup.unitLimit)) throw new Error('原生配置人口上限不符')")
    worker = replace(worker,'populationLimit:30','populationLimit:Number(cfg.populationLimit)',2)
    worker = replace(worker,'independentReplayDeferred:true',"independentReplayDeferred:false,replay:'disabled_by_user'",3)
    worker = replace(worker,'var paths = {hard_js_primary:0,hard_java_fallback:0}', 'var observedPlayers={}, paths = {hard_js_primary:0,hard_java_fallback:0}')
    worker = replace(worker,"verifyBinding(); var tick = now()", "if((now()-Number(started)-pauseNs-cpuPauseNs)/1e9>=Number(job.maxEffectiveSeconds)){stopReason='max_effective_seconds';break;}\n    observedPlayers[String(Native.get(Native.get(game.state,'f'),'e'))]=true;\n    verifyBinding(); var tick = now()")
    worker = replace(worker,"truncationReason:natural?null:","category:job.category,profile:job.profile,executionSequence:job.executionSequence,designSlotId:job.designSlotId,initialStateSha256:job.initialStateSha256,observedPlayers:observedPlayers,allInitialPlayersObserved:job.activeNativePlayerIds.every(function(id){return observedPlayers[String(id)]===true;}),effectiveSeconds:(now()-Number(started)-pauseNs-cpuPauseNs)/1e9,\n    truncationReason:natural?null:")
    worker = replace(worker,"(stopReason?'stopped':'truncated')", "(stopReason==='user_stop'?'stopped':'truncated')")
    worker = replace(worker,"'states.bin.gz','result.json']", "'states.bin.gz','result.json','requested-initial-state.json','initial-state-receipt.json']")
    runtime = (BASE/'production_runtime.frida.js').read_text(encoding='utf-8')
    runtime = replace(runtime,'String(HARD_FIXED_HTML)', 'String(HARD_HTML_BY_CAP[String(config.populationLimit)])')
    controller = (BASE/'process_controller.sh').read_text(encoding='utf-8')
    controller = replace(controller,'-ge 3 && test "$SEQ" -le 1000','-ge 1 && test "$SEQ" -le 1000')
    controller = replace(controller,'DONE=$INITIAL_DONE; FAILED=0;', 'DONE=$INITIAL_DONE; TERMINAL=0; FAILED=0;')
    controller = replace(controller,'mkdir -p "$GLOBAL_ROOT/history" || exit 2', 'mkdir -p "$TASK_ROOT/FINAL_SEQS" || exit 2\n. "$TASK_ROOT/queue_policy.sh"\nmkdir -p "$GLOBAL_ROOT/history" || exit 2')
    controller = replace(controller,'"independentReplayDeferred":true', '"terminalParents":%s,"replay":"disabled_by_user"')
    controller = replace(controller,'"$ROUND" "$(date +%s)" > "$STATE.tmp-$SESSION"', '"$ROUND" "$(date +%s)" "$TERMINAL" > "$STATE.tmp-$SESSION"')
    controller = replace(controller,'test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || DONE=$((DONE+1))', 'test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || DONE=$((DONE+1))\n    test ! -f "$TASK_ROOT/FINAL_SEQS/$SEQ" || TERMINAL=$((TERMINAL+1))')
    controller = replace(controller,'while test "$DONE" -lt "$TOTAL"; do','while test "$((DONE+TERMINAL))" -lt "$TOTAL"; do')
    controller = replace(controller,'test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || continue', '''test ! -f "$TASK_ROOT/DONE_SEQS/$SEQ" || continue
        test ! -f "$TASK_ROOT/FINAL_SEQS/$SEQ" || continue
        if test "$SEQ" -gt 42; then
            observation_ready; OBS_READY=$?
            if test "$OBS_READY" = 2; then write_state observation_failed; exit 1; fi
            test "$OBS_READY" = 0 || continue
        fi''')
    controller = replace(controller,'test "${#ATTEMPT}" -le 79', '''if test "$TRY" -gt 3; then
            printf '%s\\t%s\\n' "$PARENT" exhausted > "$TASK_ROOT/FINAL_SEQS/$SEQ"
            TERMINAL=$((TERMINAL+1)); continue
        fi
        test "${#ATTEMPT}" -le 79''')
    controller = replace(controller,'then WHY=complete; break; fi', '''then
                        if CLASSPATH="$GLOBAL_ROOT/curriculum-audit.jar" app_process /system/bin CurriculumAudit "$OUT" "$CONFIG" > "$RUN_LOG.audit" 2>&1; then WHY=complete; else WHY=log_integrity_failure; fi
                        break
                    fi''')
    controller = replace(controller,'failed|truncated|stopped) WHY="$PHASE"; break ;;', '''failed|truncated|stopped)
                    WHY="$PHASE"
                    if test "$PHASE" = failed && grep -F initial_state_mismatch "$OUT/worker-error.json" >/dev/null 2>&1; then WHY=construction_mismatch; fi
                    break ;;''')
    controller = replace(controller,'printf \'%s\\t%s\\t%s\\n\' "$SEQ" "$PARENT" "$TEMPLATE" >> "$NEXT"', '''if terminal_reason "$WHY" || test "$TRY" -ge 3; then
                printf '%s\\t%s\\t%s\\n' "$PARENT" "$ATTEMPT" "$WHY" > "$TASK_ROOT/FINAL_SEQS/$SEQ"
                TERMINAL=$((TERMINAL+1))
            else printf '%s\\t%s\\t%s\\n' "$SEQ" "$PARENT" "$TEMPLATE" >> "$NEXT"; fi''')
    controller = replace(controller,'if test "$DONE" -lt "$TOTAL" && test "$ROUND" -ge 3; then','if test "$((DONE+TERMINAL))" -lt "$TOTAL"; then')
    controller = replace(controller,'while test "$BACKOFF" -lt 60;', 'while test "$BACKOFF" -lt 6;')
    controller = replace(controller,'drain_before_start; write_state complete', 'drain_before_start; if test "$DONE" = "$TOTAL"; then write_state complete; else write_state completed_with_gaps; fi')
    master = (BASE/'process_master.sh').read_text(encoding='utf-8').replace('independentReplayDeferred":true','replay":"disabled_by_user"')
    for name,data in [('native_engine.rhino.js',native),('worker.rhino.js',worker),('runtime.frida.js',runtime),('controller.sh',controller),('master.sh',master)]:
        (target/name).write_text(data,encoding='utf-8',newline='\n')
    for name in ['projection.rhino.js','queue_policy.sh','CurriculumAudit.java','generate.mts','schedule.py','build_version.py']:
        shutil.copy2(HERE/name,target/name)
    shutil.copy2(BASE/'process_thaw.sh',target/'process_thaw.sh')
    shutil.copy2(BASE/'process-importance.jar',target/'process-importance.jar')
    deps=Path('C:/Users/SHIINA/.codex/visualizations/2026/10/17/01a14755-acbf-7251-be32-9616bde062c8/phone-posttraining/teacher-art/deps')
    java='C:/Program Files/Java/jre1.8.0_491/bin/java.exe'
    work=target/'audit-build';work.mkdir();classes=work/'classes';classes.mkdir();dex=work/'classes.dex'
    commands=[[java,'-jar',str(deps/'ecj.jar'),'-source','1.6','-target','1.6','-encoding','UTF-8','-d',str(classes),str(target/'CurriculumAudit.java')],
              [java,'-cp',str(deps/'dx.jar'),'com.android.dx.command.Main','--dex','--output='+str(dex),str(classes)]]
    receipt=[]
    for cmd in commands:
        p=subprocess.run(cmd,capture_output=True,encoding='utf-8',errors='replace',timeout=60)
        receipt.append({'command':cmd,'returncode':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
        if p.returncode:raise RuntimeError(p.stdout+p.stderr)
    with zipfile.ZipFile(target/'curriculum-audit.jar','w') as z:z.write(dex,'classes.dex')
    (target/'BUILD.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(target)

if __name__=='__main__':build()
