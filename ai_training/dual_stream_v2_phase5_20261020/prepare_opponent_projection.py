"""等价提速后建立新教师基准并重测60个工程前态，不改训练数据。"""
import gzip
import json
import os
import shutil
import subprocess
import time
from collections import Counter
from run_league import DIR, ROOT, read, save, sha, verify_runtime_contract
from arena_summary import summarize


def parallel(label,script,args,env):
    processes = []; logs = []
    try:
        for lane in range(2):
            output = (DIR / f'phase53-audit/{label}-{lane}.log').open('ab'); logs.append(output)
            command = ['node',str(ROOT / 'ai_training/run.mjs'),'node','--max-semi-space-size=128','--import','tsx','dual_stream_v2_phase5_20261020/'+script,*args,str(lane),'2']
            processes.append(subprocess.Popen(command,cwd=ROOT,env={**os.environ,**env},stdout=output,stderr=subprocess.STDOUT))
        save(DIR / 'phase53-audit/opponent-runtime-status.json',dict(stage=label,pids=[p.pid for p in processes],startedAt=time.time()))
        codes = [p.wait() for p in processes]; assert codes == [0,0], f'保全未完前缀:{label}/{codes}'
    finally:
        for output in logs: output.close()


def main():
    env = dict(LEAGUE_EVIDENCE_LIMIT='1200000000'); os.environ.update(env)
    equivalence = DIR / 'phase53-audit/opponent-optimization-equivalence.json'
    while not equivalence.exists() or not (DIR / 'generations/gen_04/training-complete.json').exists():
        selection = DIR / 'generations/gen_04/grid-selection.json'
        if selection.exists() and not read(selection)['passed']: raise RuntimeError('开发网格无候选通过，保留工程等价证据，不启动正式基准')
        time.sleep(5)
    proof = read(equivalence); assert proof['passed'] and proof['games'] == 224 and proof['allActionsAndRngUnchanged']
    assert sha(ROOT / 'src/game/ai/tactical_evaluation.ts') == proof['currentSha256']
    assert '450 passed' in (DIR / 'phase53-audit/public-test-opponent-projection.log').read_text('utf-8')
    verify_runtime_contract()
    source = DIR / 'champion-search-arena'; archive = DIR / 'phase53-audit/v4r4-champion-search-archive/champion-search-arena'
    if not archive.exists():
        assert source.resolve().is_relative_to(DIR.resolve()) and archive.resolve().is_relative_to(DIR.resolve())
        assert read(source / 'plan.json')['runtimeRevision'] == 'gen03-phase53-v4r4-node128'
        archive.parent.mkdir(parents=True,exist_ok=True); shutil.move(str(source),str(archive))
        save(archive.parent / 'manifest.json',dict(files={p.relative_to(archive).as_posix():sha(p) for p in archive.rglob('*') if p.is_file()}))
    for name,digest in read(archive.parent / 'manifest.json')['files'].items(): assert sha(archive / name) == digest
    registry = read(DIR / 'phase53-audit/evaluation-archives.json'); relative = archive.parent.relative_to(DIR).as_posix()
    if relative not in registry['directories']: registry['directories'].append(relative); save(DIR / 'phase53-audit/evaluation-archives.json',registry)
    profile = dict(receipt=equivalence.relative_to(DIR).as_posix(),receiptSha256=sha(equivalence),sourceSha256=proof['currentSha256'],previousSha256=proof['originalSha256'],runtimeRevision='gen04-phase53-v4r5-opponent-projection')
    revision = read(DIR / 'RUNTIME_REVISION.json'); revision['v4OpponentProjectionEquivalence'] = profile; save(DIR / 'RUNTIME_REVISION.json',revision)
    if not (source / 'plan.json').exists():
        plan = read(archive / 'plan.json'); plan.update(runtimeRevision=profile['runtimeRevision'],opponentOptimization=profile); save(source / 'plan.json',plan)
    assert read(source / 'plan.json')['opponentOptimization'] == profile
    # 训练完成后才计时，避免Torch网格与正式双lane争用CPU。
    parallel('opponent-gen0-search','battle.ts',['play'],{**env,'LEAGUE_ARENA':'champion-search-arena','LEAGUE_MODE':'turn_search'})
    baseline = summarize(0,arena_path='champion-search-arena')
    base = DIR / 'phase53-audit/gen4-engineering-replay'
    if not (base / 'plan.json').exists():
        plan = read(DIR / 'generations/gen_04/league-plan.json'); plan.update(runtimeRevision=profile['runtimeRevision'],opponentOptimization=profile,engineeringOnly=True,trainingLabelsAdmitted=False); save(base / 'plan.json',plan)
    parallel('opponent-engineering60','engineering_gen4_phase53.ts',[],env)
    counts = Counter(); queue_max = 0.; worst = None; exceptions = []
    plan = read(base / 'plan.json')
    for slot in plan['slots']:
        directory = base / 'games' / slot['id']; result = read(directory / 'result.json'); strict = read(directory / 'strict-replay.json')
        counts['games'] += 1; counts['strictFailures'] += not (strict['passed'] and strict['actions'] == result['actions']); counts['actions'] += strict['actions']; counts['witnessActions'] += strict['witnessActions']
        if result['classification'] in ['error','decision_timeout','wall_truncation'] or result['error']: exceptions.append(dict(slot=slot['id'],result=result))
        for line in gzip.decompress((directory / 'actions.jsonl.gz').read_bytes()).splitlines():
            row = json.loads(line); telemetry = row.get('telemetry') or {}
            if telemetry.get('queued'):
                counts['queueSteps'] += 1
                if row['ms'] > queue_max: queue_max = row['ms']; worst = dict(slot=slot['id'],i=row['i'],ms=row['ms'],beforeHash=row['beforeHash'])
            elif telemetry:
                counts['retaliationAttempts'] += telemetry.get('retaliationAttempts',0); counts['retaliationComplete'] += telemetry.get('retaliationComplete',0)
    engineering = dict(passed=counts['games'] == 60 and counts['strictFailures'] == 0 and not exceptions and queue_max < .5 and counts['retaliationAttempts'] == counts['retaliationComplete'],counts=dict(counts),queueMax=queue_max,worst=worst,exceptions=exceptions,profile=profile,scope='相同60个采样初态的独立工程复测，不训练、不计入质量面板胜率，旧60局和原失败保持原件')
    save(base / 'engineering-summary.json',engineering)
    save(DIR / 'phase53-audit/opponent-optimization-ready.json',dict(passed=proof['passed'] and baseline['complete'] and baseline['strictAllAttempts'] and counts['strictFailures'] == 0,engineeringGates=engineering['passed'],profile=profile,newChampionSearch=baseline['groups'],engineeringSummary='phase53-audit/gen4-engineering-replay/engineering-summary.json',oldBaselineArchive=relative,oldBaselineManifestSha256=sha(archive.parent / 'manifest.json')))
    save(DIR / 'phase53-audit/opponent-runtime-status.json',dict(stage='ready',engineeringPassed=engineering['passed']))


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        save(DIR / 'phase53-audit/opponent-runtime-status.json',dict(stage='failed',reason=str(error),evidenceRetained=True)); raise
