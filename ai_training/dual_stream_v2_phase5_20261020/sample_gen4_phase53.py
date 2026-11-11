"""按预登记身份预留60局并可恢复采样；正式结果先进入排重索引。"""
import os
import shutil
import subprocess
import time
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract, node


def main():
    protocol = read(DIR / 'phase53-audit/gen4-protocol.json')
    completed = read(DIR / 'phase53-audit/completion.json')
    assert completed['gen4Trigger'] and not completed['promoted'] and completed['preservation']
    assert sha(DIR / (protocol['warmModel'] + '.bin')) == protocol['warmSha256']
    verify_runtime_contract()
    env = dict(LEAGUE_EVIDENCE_LIMIT=str(protocol['resource']['evidenceCapBytes']), LEAGUE_GENERATION='4', LEAGUE_EXPERT_MIN_GENERATION='4')
    os.environ.update(env)
    archive = DIR / 'phase53-audit/gen3-v4r4-conclusion'
    for name in ['gate-summary.json', 'REPORT.md', 'BATTLES.md', 'phase53-audit/promotion-gates.json', 'generations/gen_03/arena-summary.json', 'generations/gen_03/promotion.json']:
        target = archive / name; target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists(): assert sha(target) == sha(DIR / name)
        else: shutil.copyfile(DIR / name, target)
    if not (archive / 'manifest.json').exists():
        save(archive / 'manifest.json', {p.relative_to(archive).as_posix():sha(p) for p in archive.rglob('*') if p.is_file()})
    folder = DIR / 'generations/gen_04'; folder.mkdir(exist_ok=True)
    node('gen4-plan.log', 'league_plan.ts', 4, env=env)
    plan = read(folder / 'league-plan.json')
    reference = dict(distillationReferenceModel=protocol['warmModel'], distillationReferenceSha256=protocol['warmSha256'], distillationReferenceCalibration='generations/gen_03', runtimeRevision=read(DIR / 'champion-search-arena/plan.json')['runtimeRevision'], executionContract=read(DIR / 'RUNTIME_REVISION.json')['executionContract'], protocolSha256=sha(DIR / 'phase53-audit/gen4-protocol.json'))
    if not (folder / 'league-plan-lock.json').exists():
        assert not (folder / 'games').exists(), '采样后不可更换协议'
        assert plan['generation'] == 4 and len(plan['slots']) == 60 and plan['teacherModel'] == 'generations/gen_00/model'
        plan.update(reference); save(folder / 'league-plan.json', plan)
        league = read(DIR / 'league-state.json'); assert league['pendingReservation']['generation'] == 4
        league['pendingReservation']['plan'] = plan; save(DIR / 'league-state.json', league)
        save(folder / 'league-plan-lock.json', dict(sha256=sha(folder / 'league-plan.json'), **reference))
    lock = read(folder / 'league-plan-lock.json')
    assert lock['sha256'] == sha(folder / 'league-plan.json') and all(plan[k] == v for k,v in reference.items())
    processes = []; logs = []
    try:
        for lane in range(2):
            output = (DIR / f'gen4-selfplay-{lane}.log').open('ab'); logs.append(output)
            args = ['node', str(ROOT / 'ai_training/run.mjs'), 'node', *plan['executionContract']['nodeArgs'], '--import', 'tsx', 'dual_stream_v2_phase5_20261020/selfplay.ts', '4', str(lane), '2']
            processes.append(subprocess.Popen(args, cwd=ROOT, env=os.environ, stdout=output, stderr=subprocess.STDOUT))
        save(DIR / 'phase53-audit/gen4-status.json', dict(stage='selfplay', pids=[p.pid for p in processes], startedAt=time.time(), planSha256=lock['sha256']))
        codes = [p.wait() for p in processes]
        assert codes == [0,0], f'采样中断；保留全部前缀并由真实引擎恢复:{codes}'
    finally:
        for output in logs: output.close()
    node('gen4-extract.log', 'extract.ts', 4, env=env)
    extraction = read(folder / 'extraction-summary.json')
    assert extraction['games'] == 60 and extraction['strictAllAttempts'] and extraction['corrections'] > 0
    save(DIR / 'phase53-audit/gen4-status.json', dict(stage='samples_ready', completedAt=time.time(), extraction=extraction))


if __name__ == '__main__': main()
