"""只读定位纯策略胜局在搜索中的首次分歧，不将首分歧冒充因果证明。"""
import gzip
import json
from run_league import DIR, read, save
from phase54_paths import audit_directory


def first_difference(pure_path, search_path):
    previous_root = None
    with gzip.open(pure_path, 'rt', encoding='utf-8') as pure_stream, gzip.open(search_path, 'rt', encoding='utf-8') as search_stream:
        for pure_line, search_line in zip(pure_stream, search_stream):
            pure, search = json.loads(pure_line), json.loads(search_line)
            telemetry = search.get('telemetry')
            if telemetry and not telemetry['queued']:
                previous_root = search
            if pure['beforeHash'] != search['beforeHash'] or pure['code'] != search['code']:
                return dict(pure=pure, search=search, precedingSearchRoot=previous_root)
    return None


def main():
    audit = audit_directory()
    protocol = read(audit / 'protocol.json')
    assert protocol['candidateGeneration'] == 3, '其它新权重须使用其自身完整纯策略面板'
    pure_base = DIR / 'generations/gen_03/arena'
    search_base = audit / 'candidate-search-arena'
    pure_plan = read(pure_base / 'plan.json')
    search_plan = read(search_base / 'plan.json')
    keys = ['panel', 'opponent', 'mapIndex', 'seat']
    key = lambda slot: tuple(slot.get(field) for field in keys)
    pure_slots = {key(slot): slot for slot in pure_plan['slots'] if slot['mode'] == 'pure'}
    regressions = []
    for search_slot in search_plan['slots']:
        folder = search_base / 'battles' / search_slot['id']
        if not (folder / 'result.json').exists():
            continue
        search_result = read(folder / 'result.json')
        pure_slot = pure_slots[key(search_slot)]
        pure_folder = pure_base / 'battles' / pure_slot['id']
        pure_result = read(pure_folder / 'result.json')
        if pure_result['classification'] != 'natural_win' or search_result['classification'] == 'natural_win':
            continue
        assert search_slot['opponentSeed'] == pure_slot['opponentSeed']
        assert search_plan['maps'][search_slot['mapIndex']]['sha256'] == pure_plan['maps'][pure_slot['mapIndex']]['sha256']
        difference = first_difference(pure_folder / 'actions.jsonl.gz', folder / 'actions.jsonl.gz')
        assert difference is not None, '相同完整轨迹却胜负不同，必须另行调查'
        regressions.append(dict(searchId=search_slot['id'], pureId=pure_slot['id'], panel=search_slot['panel'], searchClassification=search_result['classification'], pureActions=pure_result['actions'], searchActions=search_result['actions'], firstDifference=difference))
    save(audit / 'pure-win-regressions-first-divergence.json', dict(scope='当前已完成槽的首次分歧诊断；仅用于运行时缺陷排查，不按此选择新模型；不能据首分歧推断最终败因', regressions=regressions))
    print(json.dumps([dict(id=row['searchId'], classification=row['searchClassification'], i=row['firstDifference']['search']['i'], pure=row['firstDifference']['pure']['code'], search=row['firstDifference']['search']['code'], queued=(row['firstDifference']['search'].get('telemetry') or {}).get('queued'), veto=(row['firstDifference']['search'].get('telemetry') or {}).get('veto'), takeover=(row['firstDifference']['search'].get('telemetry') or {}).get('takeover')) for row in regressions], ensure_ascii=False))


if __name__ == '__main__':
    main()
