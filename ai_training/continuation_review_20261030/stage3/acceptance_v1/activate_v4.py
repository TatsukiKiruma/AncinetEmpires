"""在全部开发完成、唯一锁定之前接续I/O版本；不重复已有对局。"""
import json
from pathlib import Path
from context import HERE, S3, ROOT, DATA, BASE, core, read, sha, save_new, now


def main():
    assert not (S3/'FINAL_CANDIDATE_LOCK.json').exists()
    assert not (S3/'TEST_INITIAL_MANIFEST.json').exists()
    assert not (BASE/'FINAL_TEST_ATTEMPT.json').exists()
    blocked=read(DATA/'RUN_BLOCKED.json')
    assert 'AssertionError' in blocked['traceback']
    assert 'acceptance_v1/report.py' in blocked['traceback'] or 'acceptance_v1/run.py' in blocked['traceback']
    assert not blocked['sealedAttemptStarted']
    games=0;natural=0;identities={}
    for update in [40000,100000,80000]:
        for scale in [.3,1.]:
            name=f'dev-{update:06d}-prior-{scale}'
            assert read(DATA/'receipts'/(name+'.json'))['returncode']==0
            source=DATA/name/'SUMMARY.json';summary=read(source)
            assert summary['complete'] and summary['attempted']==54
            assert len(summary['games'])==54 and len({g['id'] for g in summary['games']})==54
            games+=54;natural+=sum(g['natural'] for g in summary['games'])
            identities[name]=sha(source)
    assert games==324
    current=HERE/'ACCEPTANCE_CONTRACT.json';pending=HERE/'ACCEPTANCE_CONTRACT.v4.pending.json'
    proposal=read(pending)
    assert sha(current)==proposal['previousContractSha256']
    for name,digest in proposal['files'].items():assert sha(ROOT/name)==digest,name
    core.validate()
    archive=DATA/'io-transition-v4';archive.mkdir(exist_ok=False)
    previous=archive/'old-controller-blocked.json'
    (DATA/'RUN_BLOCKED.json').rename(previous)
    current.rename(HERE/'revisions/windows-io-guard-v4/ACCEPTANCE_CONTRACT.live-v3.json')
    pending.rename(current)
    from context import validate
    contract=validate()
    record=dict(activated=now(),contractSha256=contract,completedDevelopmentGames=games,naturalGames=natural,
                summarySha256=identities,previousControllerBoundaryStop=str(previous),
                newGameAttemptsDuringTransition=0,selectionRuleChanged=False,sealedAccessBeforeLock=0,
                controlChange='仅新增后续产物写入2秒有界重试及完成回执复用，非自然局仍保留')
    save_new(HERE/'IO_TRANSITION_ACTIVATED.json',record)
    save_new(DATA/'IO_TRANSITION_ACTIVATED.json',record)
    print(json.dumps(record,ensure_ascii=False),flush=True)


if __name__=='__main__':
    main()
