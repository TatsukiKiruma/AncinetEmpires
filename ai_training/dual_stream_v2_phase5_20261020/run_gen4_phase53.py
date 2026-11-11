"""一次性有依赖流水线；采样完结后训练，再严格评测选定模型。"""
import os
import sys
import time
from run_league import DIR, ROOT, read, save, command


def main():
    protocol = read(DIR / 'phase53-audit/gen4-protocol.json')
    os.environ.update(LEAGUE_EVIDENCE_LIMIT=str(protocol['resource']['evidenceCapBytes']),LEAGUE_GENERATION='4',LEAGUE_EXPERT_MIN_GENERATION='4')
    save(DIR / 'phase53-audit/gen4-driver-start.json',dict(pid=os.getpid(),startedAt=time.time(),scope='本轮手动授权的一次性依赖流水线'))
    extraction = DIR / 'generations/gen_04/extraction-summary.json'
    while not extraction.exists(): time.sleep(5)
    receipt = read(extraction); assert receipt['games'] == 60 and receipt['strictAllAttempts'] and receipt['corrections'] > 0
    folder = DIR / 'generations/gen_04'
    if not (folder / 'training-complete.json').exists():
        save(DIR / 'phase53-audit/gen4-status.json',dict(stage='training_grid',startedAt=time.time()))
        command('gen4-training.log',['node',str(ROOT / 'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase5_20261020/train_gen4_phase53.py'])
    save(DIR / 'phase53-audit/gen4-status.json',dict(stage='selected_model_parity',startedAt=time.time(),selection=read(folder / 'grid-selection.json')))
    command('gen4-evaluation-driver.log',['node',str(ROOT / 'ai_training/run.mjs'),sys.executable,'-B','-X','utf8','dual_stream_v2_phase5_20261020/evaluate_gen4_phase53.py'])


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        save(DIR / 'phase53-audit/gen4-status.json',dict(stage='failed',reason=str(error),at=time.time(),evidenceRetained=True)); raise
