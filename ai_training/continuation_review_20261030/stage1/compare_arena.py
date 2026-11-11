"""完整唯一局身份、科学合同及自然配对覆盖的开发比较器。"""
import argparse
import copy
import json
import random
from collections import Counter
from pathlib import Path
from contracts import HERE, ROOT, file_sha, validate

SCORE = {'natural_win': 1., 'natural_draw': .5, 'natural_loss': 0.}


def checked_games(payload, run, panel, execution, initials, legacy=False):
    if payload.get('finalTestEvaluated') or run['panelSha256'] != execution['arenaPanelSha256']:
        raise ValueError('测试用途或实战面板身份不同')
    if not legacy and (payload.get('executionIdentity') != execution or run.get('executionIdentity') != execution):
        raise ValueError('规则/编码/对手/推理/时间合同不一致')
    if execution.get('executionRuntime') and run['device'] != execution['executionRuntime']['device']:
        raise ValueError('实战实际设备与固定合同不同')
    expected = {g['id']: g for g in panel['matches']}
    games = copy.deepcopy(payload['games'])
    identifiers = [g['id'] for g in games]
    if payload['attempted'] != 40 or len(identifiers) != 40 or len(set(identifiers)) != 40 or set(identifiers) != set(expected):
        raise ValueError('必须具有完整且唯一的冻结40局ID')
    if Counter(g['opponent'] for g in games) != {'hard': 20, 'simple': 20}:
        raise ValueError('困难/简单局数不符')
    for game in games:
        planned = expected[game['id']]
        if any(game[k] != planned[k] for k in ['opponent', 'slot', 'seat', 'seed']):
            raise ValueError('逐局槽/对手/颜色/种子不符')
        slot = panel['slots'][planned['slot']]
        initial = initials[planned['slot']]
        ids = sorted(p['id'] for p in initial['players'] if p['isAlive'])
        player = ids[game['seat']]
        hand = 'first' if player == initial['currentPlayer'] else 'second'
        if game['map'] != slot['map'] or game['initialSha256'] != slot['sha256'] or game['modelPlayer'] != player:
            raise ValueError('逐局地图、初态或模型玩家不符')
        if legacy:
            game.update(firstToActPlayer=initial['currentPlayer'], actualHand=hand)
        elif game.get('actualHand') != hand or game.get('firstToActPlayer') != initial['currentPlayer'] or game.get('executionIdentity') != execution:
            raise ValueError('逐局实际先后手或执行合同不符')
        natural = game['classification'] in SCORE
        if not natural and game['classification'] not in ['action_truncation', 'round_truncation', 'wall_truncation', 'runtime_error', 'time_forfeit']:
            raise ValueError('未知结果分类')
        if bool(game['natural']) != natural or natural and (game['winner'] is None or game['error'] is not None or game['timeForfeit'] is not None):
            raise ValueError('自然结果、错误或时间判负字段矛盾')
        if not natural and game['winner'] is not None:
            raise ValueError('非自然结果不能伪装有赢家')
    return games


def compare_games(base, candidate):
    byid = {g['id']: g for g in base}
    results = {}
    complete = True
    for opponent in ['hard', 'simple']:
        changes, slots = [], {}
        for game in candidate:
            if game['opponent'] != opponent:
                continue
            before = byid[game['id']]
            b, c = SCORE.get(before['classification']), SCORE.get(game['classification'])
            delta = None if b is None or c is None else c - b
            changes.append(dict(id=game['id'], hand=game['actualHand'], baseline=before['classification'], candidate=game['classification'], scoreChange=delta))
            if delta is not None:
                slots.setdefault(game['slot'], []).append(delta)
        matched = sum(len(v) for v in slots.values())
        means = [sum(v) / len(v) for v in slots.values()]
        covered = matched == 20 and len(slots) == 10 and all(len(v) == 2 for v in slots.values())
        complete = complete and covered
        rng = random.Random(20261030)
        bootstrap = sorted(sum(rng.choice(means) for _ in means) / len(means) for _ in range(10000)) if means else []
        descriptive = sum(means) / len(means) if means else None
        results[opponent] = dict(changes=changes, naturalMatchedGames=matched, allAttemptedGames=20, completeNaturalPairSlots=sum(len(v) == 2 for v in slots.values()), scoreChange=descriptive if covered else None, descriptiveNaturalSubsetScoreChange=descriptive, clusterBootstrap95=[bootstrap[250], bootstrap[9749]] if bootstrap and covered else None, changedGames=sum(c['scoreChange'] not in [None, 0.] for c in changes), eligibleForPromotionReview=covered, failuresRemainSeparate=True)
    return dict(results=results, completeNaturalPanel=complete, eligibleForPromotionReview=complete, directPromotionAllowed=False, decision='仅可提交协调审核' if complete else '缺少完整自然配对结果，不可直接晋升或据子集均值判为提升', uncertainty='10初态槽聚类；困难20+简单20仅开发筛选')


def load_checked(path, panel, execution, contract, initials):
    payload = json.loads(path.read_text('utf-8'))
    run_path = path.parent / 'RUN.json'
    run = json.loads(run_path.read_text('utf-8'))
    approved = {r['path']: r['sha256'] for r in contract['baselineArtifacts']}
    legacy = file_sha(path) == approved['arena-baseline-r2/SUMMARY.json'] and file_sha(run_path) == approved['arena-baseline-r2/RUN.json']
    for suffix, field in [('.bin', 'modelBinarySha256'), ('.json', 'modelMetadataSha256')]:
        if file_sha(run['model'] + suffix) != run[field]:
            raise ValueError('实战模型文件与运行身份不符')
    if legacy:
        # 仅允许审核已接受的第一版40局按固定证据SHA映射，无通用旧格式豁免。
        if file_sha(HERE / 'revisions/review1/v1/SOURCE_MANIFEST.json') != approved['revisions/review1/v1/SOURCE_MANIFEST.json']:
            raise ValueError('旧基线源码审计身份改变')
    else:
        runner_path = HERE / 'RUNNER_CONTRACT.json'
        runners = json.loads(runner_path.read_text('utf-8'))
        expected_arena = next(r['sha256'] for r in runners['sources'] if r['path'] == 'arena.ts')
        if run.get('runnerContractSha256') != file_sha(runner_path) or run.get('runnerSourceSha256') != expected_arena:
            raise ValueError('实战运行器版本不在当前批准修订中')
    return checked_games(payload, run, panel, execution, initials, legacy=legacy), legacy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--config', type=Path, default=HERE / 'STAGE2_CONFIG.json')
    args = parser.parse_args()
    config = json.loads(args.config.read_text('utf-8'))
    execution, contract = validate(config)
    panel = json.loads((HERE / 'ARENA_PANEL.json').read_text('utf-8'))
    initials = {s['slot']: json.loads((HERE / s['file']).read_text('utf-8')) for s in panel['slots']}
    base, legacy_base = load_checked(args.baseline, panel, execution, contract, initials)
    candidate, legacy_candidate = load_checked(args.candidate, panel, execution, contract, initials)
    result = dict(compare_games(base, candidate), executionIdentity=execution, legacyEvidenceMapping=dict(baseline=legacy_base, candidate=legacy_candidate), newGames=0)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), 'utf-8')


if __name__ == '__main__':
    main()
