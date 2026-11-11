"""记录用户当前轮结束即停，并补充输入冻结收据的实际记录时点。"""
import time
import shutil
from run_league import DIR, read, save

folder = DIR / 'generations/gen_03'; receipt = folder / 'ARENA_INPUT_FREEZE.json'
original = DIR / 'phase52-audit/ARENA_INPUT_FREEZE_first_record.json'
if not original.exists(): shutil.copyfile(receipt, original)
frozen = read(receipt); started = read(DIR / 'pipeline-status.json')['startedAt']
files = [folder / n for n in ['model.bin', 'arena/plan.json', 'head-calibration.json', 'value-config.json', 'dev-policy-audit.json', 'tri-runtime-parity.json', 'semantic-repair-protocol.json']]
times = {p.relative_to(DIR).as_posix(): p.stat().st_mtime for p in files}
assert max(times.values()) <= started, '冻结输入必须早于竞技场进程启动'
frozen.update(artifactModifiedTimes=times, arenaStartedAt=started, firstAttestationRecordedAfterCompletedSlots=17, attestationScope='输入文件在竞技场启动前已经生成并固定SHA；汇总收据在已有17槽结果后补记，未伪装事先写出')
save(receipt, frozen)
save(DIR / 'phase52-audit/STOP_AFTER_CURRENT_ROUND.json', dict(userRequest='本轮轮次结束后停止，然后给我完整报告', recordedAt=time.time(), generation=3, candidateArenaTarget=112, appendTraining=False, startGeneration4=False, remaining=['完成当前112槽', '执行原promote(3)', '生成完整报告和保全清单', '停止']))
print(dict(stopAfterGeneration=3, appendTraining=False, inputFilesPredateArena=True))
