"""从v4生成精确启动次数账本和分格观察门禁版本。"""
from pathlib import Path
import shutil
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_version import OUT,replace
HERE=Path(__file__).resolve().parent
def main():
    old=OUT/'collector-v4';new=OUT/'collector-v5';shutil.copytree(old,new)
    shutil.copy2(HERE/'queue_policy.sh',new/'queue_policy.sh')
    controller=(old/'controller.sh').read_text(encoding='utf-8')
    controller=replace(controller,'mkdir -p "$TASK_ROOT/FINAL_SEQS" || exit 2','mkdir -p "$TASK_ROOT/FINAL_SEQS" "$TASK_ROOT/STARTED_ATTEMPTS" || exit 2')
    controller=replace(controller,'test "$OBS_READY" = 0 || continue\n        fi','''test "$OBS_READY" = 0 || continue
            if blocked_cell "$TEMPLATE"; then
                printf '%s\\t%s\\n' "$PARENT" observation_cell_without_natural_end > "$TASK_ROOT/FINAL_SEQS/$SEQ"
                TERMINAL=$((TERMINAL+1)); continue
            fi
        fi''')
    controller=replace(controller,'''if test "$TRY" -gt 3; then
            printf '%s\\t%s\\n' "$PARENT" exhausted > "$TASK_ROOT/FINAL_SEQS/$SEQ"
            TERMINAL=$((TERMINAL+1)); continue
        fi''','''# 预留文件不代表已启动；实际启动账本在am start之前原子写入。
        STARTED_COUNT=$(find "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" -type f 2>/dev/null | wc -l | tr -d ' ')
        if test "$STARTED_COUNT" -ge 3; then
            printf '%s\\t%s\\n' "$PARENT" exhausted > "$TASK_ROOT/FINAL_SEQS/$SEQ"
            TERMINAL=$((TERMINAL+1)); continue
        fi''')
    controller=replace(controller,'write_state starting_app\n        # 资源密钥','''mkdir -p "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" || fatal '无法建立启动账本'
        STARTED_COUNT=$(find "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ" -type f | wc -l | tr -d ' ')
        test "$STARTED_COUNT" -lt 3 || fatal '实际启动次数已达上限'
        RUN_ORDINAL=$((STARTED_COUNT+1))
        (set -C; printf '%s\\t%s\\n' "$RUN_ORDINAL" "$(date +%s)" > "$TASK_ROOT/STARTED_ATTEMPTS/$SEQ/$ATTEMPT") || fatal '启动账本重复'
        { printf '{"runOrdinal":%s,' "$RUN_ORDINAL"; sed '1s/^{//' "$CONFIG"; } > "$CONFIG.ordinal"
        mv "$CONFIG.ordinal" "$CONFIG" || fatal '实际尝试序号写入失败'
        write_state starting_app
        # 资源密钥''')
    controller=replace(controller,'test "$TRY" -ge 3','test "$RUN_ORDINAL" -ge 3')
    (new/'controller.sh').write_text(controller,encoding='utf-8',newline='\n')
    worker=(new/'worker.rhino.js').read_text(encoding='utf-8')
    worker=replace(worker,"parentId:job.parentId,attemptId:job.attemptId,package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,", "parentId:job.parentId,attemptId:job.attemptId,runOrdinal:Number(cfg.runOrdinal),package:packageName,workerId:cfg.workerId,globalRoot:cfg.globalRoot,",3)
    (new/'worker.rhino.js').write_text(worker,encoding='utf-8',newline='\n')
    print(new)
if __name__=='__main__':main()
