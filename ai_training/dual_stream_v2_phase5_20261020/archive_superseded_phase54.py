"""用户追加升级后，只归档已经完整收尾的旧双链面板，不启动旧版60工程。"""
from audit_phase54 import AUDIT, collect, panels
from run_league import DIR, ROOT, read, save, sha


def main():
    champion = collect('champion-search-arena'); candidate = collect('candidate-search-arena')
    assert champion['complete'] and candidate['complete']
    assert not (AUDIT / 'engineering60/games').exists(), '若已有旧版工程前缀，必须纳入归档审计'
    strict = all(s['counts']['strictFailures'] == s['counts']['identityFailures'] == 0 for s in [champion,candidate])
    record = dict(stage='superseded_by_user_deep_upgrade',gates=dict(allAttemptsStrict=strict),completeSearch112=True,engineeringExecuted=0,promoted=False,championWins=sum(panels(champion).values()),candidateWins=sum(panels(candidate).values()),champion=champion,candidate=candidate,reason='用户在旧面板运行中明确追加五单位反扑/880ms预算/四案决赛圈；旧对局全部strict收尾，旧60工程尚未开始。新深度版独立重跑60工程和112配对槽。')
    save(AUDIT / 'superseded-summary.json',record)
    files = {}
    for name in ['champion-search-arena','candidate-search-arena','v5-source']:
        for path in (AUDIT / name).rglob('*'):
            if path.is_file(): files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path),bytes=path.stat().st_size)
    for name in ['protocol.json','runtime-freeze.json','superseded-summary.json']:
        path = AUDIT / name; files[path.relative_to(ROOT).as_posix()] = dict(sha256=sha(path),bytes=path.stat().st_size)
    save(AUDIT / 'superseded-evidence-manifest.json',dict(files=files,passed=strict))
    save(AUDIT / 'status.json',dict(stage=record['stage'],promoted=False,championWins=record['championWins'],candidateWins=record['candidateWins'],strict=strict))
    print(dict(championWins=record['championWins'],candidateWins=record['candidateWins'],strict=strict,files=len(files)))


if __name__ == '__main__': main()
