#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08-C + T15-09B：开发面板严格配对、§6 加权聚合与配对差值统计（纯 Python）。

为什么用 Python 重写一遍统计而不是调用 `eval_v15_core.ts`：
  - `eval_v15_core.ts` 是 A 的库文件（不在本 owner 的可写范围内），且它没有 CLI 入口；
  - 本脚本**逐行复刻**它的口径（`readArmV15` / `strictBuildPairsV15` / `foldRootsV15` /
    `panelWeightedV15` / `stratifiedBootstrapV15` 的语义），并在 `--selftest` 里给出可核对读数，
    所有原始行都保留在 `T15-09/matches/*.games.jsonl`，第三方可复算。

严格口径（协议 §5.2、§6；数据契约 §1）：
  - 配对键 = `scenarioId#seed#seat`；候选行与镜像行必须同键且 18 个 must-match 身份字段一致；
  - 同一 gameId 重复 → 报错；缺臂 → MISSING_ARM（不伪造配对）；
  - 视角一律按被测座位联盟从 winner **重算**，不信镜像行字面写的 NATURAL_LOSS；
  - 自然结果区间 = [score,score]；截断 = [0,1]；错误单独走错误门，不变成负局或平局；
  - 聚合顺序：root 内等权平均座位 → 人数/地图内等权平均 root → 面板权重（2p/3p 各 1/2）；
  - bootstrap：按初始 root 家族整块重采样、地图内分层、固定 seed 2026099500、10,000 次。

用法：
  python v15/tools/run_d_dev_panel.py --run-root v15/out/v15_20260925_core \
      [--models c2:42,c2:1337,...] [--out T15-09/dev_panel_summary.json] [--bootstrap 10000]
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

UNDECIDED = {'STEP_LIMIT', 'PLY_LIMIT', 'WALL_TIMEOUT', 'CANCELLED'}
ERRORS = {'POLICY_ERROR', 'ENGINE_ERROR'}
NATURAL = {'NATURAL_WIN', 'NATURAL_LOSS', 'NATURAL_DRAW'}

MUST_MATCH = [
    'runId', 'runMode', 'panelId', 'blockId', 'scenarioId',
    'rootSeed', 'episodeIndex', 'rootFamilyId',
    'initialStateHash', 'mapHash', 'mapLayoutHash', 'rulesHash',
    'engineSourceDigest', 'policySourceDigest', 'rngContract', 'actionFilter',
    'maxStepsAtomicActions', 'maxPliesAtomicActions', 'wallTimeoutMs',
]


# --------------------------------------------------------------------------- 视角与读数

def view_outcome_for_seat(raw: str, winner_alliance, viewed_alliance) -> str:
    """与 `recomputeOutcomeForViewedSeat` 同语义：错误/截断/平局与视角无关。"""
    if raw in ERRORS or raw in UNDECIDED or raw == 'NATURAL_DRAW':
        return raw
    if winner_alliance is None or viewed_alliance is None:
        return raw
    return 'NATURAL_WIN' if winner_alliance == viewed_alliance else 'NATURAL_LOSS'


def score_of(viewed: str):
    if viewed == 'NATURAL_WIN':
        return 1.0
    if viewed == 'NATURAL_DRAW':
        return 0.5
    if viewed == 'NATURAL_LOSS':
        return 0.0
    return None


def read_arm(row: dict) -> dict:
    """复刻 `readArmV15`：声明值用于完成率，重算值用于胜负/得分。"""
    row_outcome = row.get('outcomeKind')
    declared = row.get('mirrorDeclaredOutcomeKind') or row_outcome
    winner = row.get('winnerAllianceId')
    viewed = view_outcome_for_seat(row_outcome, winner, row.get('candidateAllianceId'))
    score = score_of(viewed)
    undecided = row_outcome in UNDECIDED
    return {
        'rowOutcome': row_outcome,
        'declaredOutcome': declared,
        'viewedOutcome': viewed,
        'score': score,
        'low': score if score is not None else (0.0 if undecided else None),
        'high': score if score is not None else (1.0 if undecided else None),
        'undecided': undecided,
        'error': row_outcome in ERRORS,
        'viewpointCorrected': viewed != row_outcome,
    }


def seat_of(row: dict):
    for field in ('viewedSeat', 'candidateSeat', 'seat'):
        if row.get(field) is not None:
            return row[field]
    return None


def pair_key_of(row: dict) -> str:
    return f"{row.get('scenarioId')}#seed={row.get('seed')}#seat={seat_of(row)}"


def game_id_of(row: dict):
    return row.get('gameId') or (row.get('cacheIdentity') or {}).get('gameId')


def identity_diff(cand: dict, mirror: dict) -> list[str]:
    cf = (cand.get('cacheIdentity') or {}).get('fields')
    mf = (mirror.get('cacheIdentity') or {}).get('fields')
    if not cf or not mf:
        return ['(cacheIdentity.fields 缺失)']
    diff = []
    for field in MUST_MATCH:
        a = cf.get(field)
        b = mf.get(field)
        if a != b:
            diff.append(f'{field}({a} != {b})')
    return diff


# --------------------------------------------------------------------------- 严格配对

def strict_build_pairs(rows: list[dict]) -> tuple[list[dict], list[dict], dict]:
    issues: list[dict] = []
    seen_gid: dict[str, int] = {}
    by_key: dict[str, dict] = {}
    counts = {'input': len(rows), 'arms': 0, 'candidate': 0, 'mirror': 0}
    for index, row in enumerate(rows):
        arm = row.get('arm')
        if arm not in ('CANDIDATE', 'MIRROR'):
            continue
        counts['arms'] += 1
        gid = game_id_of(row)
        if gid is not None:
            if gid in seen_gid:
                issues.append({'kind': 'DUPLICATE_GAME_ID', 'detail': f'gameId 重复：{gid}', 'gameIds': [gid]})
                continue
            seen_gid[gid] = index
        if row.get('scenarioId') is None or row.get('seed') is None or row.get('outcomeKind') is None:
            issues.append({'kind': 'MISSING_ROW_FIELD', 'detail': f'第 {index + 1} 行缺字段', 'gameIds': [gid] if gid else []})
            continue
        key = pair_key_of(row)
        bucket = by_key.setdefault(key, {})
        side = 'candidate' if arm == 'CANDIDATE' else 'mirror'
        counts[side] += 1
        if side in bucket:
            issues.append({'kind': 'DUPLICATE_ARM_ROW', 'detail': f'{key} 的 {side} 臂重复',
                           'gameIds': [gid], 'pairKey': key})
            continue
        bucket[side] = row
    pairs = []
    for key in sorted(by_key):
        bucket = by_key[key]
        if 'candidate' not in bucket or 'mirror' not in bucket:
            issues.append({'kind': 'MISSING_ARM',
                           'detail': f"{key} 缺少{'镜像' if 'candidate' in bucket else '候选'}臂",
                           'gameIds': [game_id_of(bucket.get('candidate') or {}), game_id_of(bucket.get('mirror') or {})],
                           'pairKey': key})
            continue
        diff = identity_diff(bucket['candidate'], bucket['mirror'])
        if diff:
            issues.append({'kind': 'IDENTITY_MISMATCH', 'detail': f'{key} 身份不一致：{", ".join(diff)}',
                           'gameIds': [game_id_of(bucket['candidate']), game_id_of(bucket['mirror'])], 'pairKey': key})
            continue
        cand, mirror = bucket['candidate'], bucket['mirror']
        pairs.append({
            'pairKey': key, 'scenarioId': cand['scenarioId'], 'seed': cand['seed'], 'seat': seat_of(cand),
            'mapName': cand.get('mapName') or mirror.get('mapName'),
            'playerCount': cand.get('playerCount') if cand.get('playerCount') is not None else mirror.get('playerCount'),
            'blockId': cand.get('blockId') or mirror.get('blockId'),
            'candidate': cand, 'mirror': mirror, 'identityDiff': diff,
        })
    return pairs, issues, counts


def details_from_pairs(pairs: list[dict]) -> list[dict]:
    out = []
    for p in pairs:
        c = read_arm(p['candidate'])
        m = read_arm(p['mirror'])
        base = {
            'pairKey': p['pairKey'], 'scenarioId': p['scenarioId'], 'mapName': p['mapName'],
            'playerCount': p['playerCount'], 'blockId': p['blockId'],
            'rootKey': f"{p['scenarioId']}#seed={p['seed']}", 'seat': p['seat'],
            'candidate': c, 'mirror': m,
            'mirrorEntityKey': (p['mirror'].get('cacheIdentity') or {}).get('key') or f"{p['scenarioId']}#seed={p['seed']}",
            'candidateGameId': game_id_of(p['candidate']), 'mirrorGameId': game_id_of(p['mirror']),
            'candidateError': p['candidate'].get('error'), 'mirrorError': p['mirror'].get('error'),
            'candidateFallback': p['candidate'].get('fallbackUsed') is True,
            'mirrorFallback': p['mirror'].get('fallbackUsed') is True,
            'modelTag': p['candidate'].get('modelTag'),
        }
        if c['error'] or m['error']:
            base.update({'kind': 'ERROR', 'd': None, 'dLow': None, 'dHigh': None})
        elif c['score'] is not None and m['score'] is not None:
            d = c['score'] - m['score']
            base.update({'kind': 'COMPLETE', 'd': d, 'dLow': d, 'dHigh': d})
        else:
            base.update({'kind': 'TRUNCATED', 'd': None,
                         'dLow': c['low'] - m['high'], 'dHigh': c['high'] - m['low']})
        out.append(base)
    return out


# --------------------------------------------------------------------------- 加权聚合

def mean(values: list[float]):
    return None if not values else sum(values) / len(values)


def fold_roots(details: list[dict]) -> dict[str, dict]:
    by_root: dict[str, list[dict]] = defaultdict(list)
    for d in details:
        by_root[d['rootKey']].append(d)
    out = {}
    for root, lst in by_root.items():
        non_error = [d for d in lst if d['kind'] != 'ERROR']
        complete = [d for d in lst if d['kind'] == 'COMPLETE']
        out[root] = {
            'rootKey': root,
            'mapName': lst[0]['mapName'], 'playerCount': lst[0]['playerCount'],
            'pairs': len(lst), 'completePairs': len(complete),
            'errors': sum(1 for d in lst if d['kind'] == 'ERROR'),
            'completePoint': mean([d['d'] for d in complete]),
            'lowBound': mean([d['dLow'] for d in non_error]) if non_error else None,
            'highBound': mean([d['dHigh'] for d in non_error]) if non_error else None,
        }
    return out


def combine_layer(roots: list[dict], field: str):
    vals = [r[field] for r in roots if r[field] is not None]
    return mean(vals)


def panel_weighted(by_group: dict[str, list[dict]], weights: dict[str, float], field: str):
    """按预登记面板权重平均各层（层 = 人数/地图）。缺层时按可用权重归一化并如实标记。"""
    total_w = 0.0
    acc = 0.0
    used = []
    for key, roots in by_group.items():
        val = combine_layer(roots, field)
        if val is None:
            continue
        w = weights.get(key, 0.0)
        if w <= 0:
            continue
        acc += w * val
        total_w += w
        used.append(key)
    if total_w <= 0:
        return None, {'renormalized': False, 'usedWeightSum': 0.0, 'missingLayers': sorted(set(weights) - set(used))}
    return acc / total_w, {
        'renormalized': abs(total_w - sum(weights.values())) > 1e-9,
        'usedWeightSum': total_w,
        'missingLayers': sorted(set(weights) - set(used)),
    }


# --------------------------------------------------------------------------- bootstrap

def stratified_bootstrap(roots_by_map: dict[str, list[dict]], weights: dict[str, float],
                         field: str, iterations: int, seed: int) -> dict:
    """地图内整块重采样 root 家族；每次迭代重算「root 内平均 → 层内平均 → 面板加权」。"""
    rng = random.Random(seed)
    strata = {m: [r for r in rs if r[field] is not None] for m, rs in roots_by_map.items()}
    strata = {m: rs for m, rs in strata.items() if rs}
    if not strata:
        return {'iterations': iterations, 'low95': None, 'high95': None, 'blocks': {}}
    values = []
    for _ in range(iterations):
        total_w, acc = 0.0, 0.0
        for map_name, rs in strata.items():
            w = weights.get(map_name, 0.0)
            if w <= 0:
                continue
            sample = [rs[rng.randrange(len(rs))][field] for _ in range(len(rs))]
            acc += w * (sum(sample) / len(sample))
            total_w += w
        if total_w > 0:
            values.append(acc / total_w)
    values.sort()
    return {
        'iterations': iterations,
        'low95': quantile(values, 0.025),
        'high95': quantile(values, 0.975),
        'median': quantile(values, 0.5),
        'blocks': {m: len(rs) for m, rs in strata.items()},
    }


def quantile(sorted_values: list[float], p: float):
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = p * (len(sorted_values) - 1)
    lo, hi = math.floor(idx), math.ceil(idx)
    if lo == hi:
        return sorted_values[int(idx)]
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (idx - lo)


# --------------------------------------------------------------------------- 单模型报告

def load_rows(match_dir: Path, panel: str) -> list[dict]:
    rows = []
    for path in sorted(match_dir.glob(f'{panel}_*.games.jsonl')):
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            row['_sourceFile'] = path.name
            rows.append(row)
    return rows


def model_of(row: dict) -> str:
    return str(row.get('modelTag') or '?') if row.get('arm') == 'CANDIDATE' else 'MIRROR'


def report_for_model(model_key: str, cand_rows: list[dict], mirror_rows: list[dict],
                     weights: dict[str, float], iterations: int, bootstrap_seed: int,
                     planned_candidate_arms: int, planned_pairs: int, planned_mirrors: int) -> dict:
    # 只保留与本模型候选行同键的镜像行：否则未跑到的 block 会产生误导性的 MISSING_ARM。
    cand_keys = {pair_key_of(r) for r in cand_rows}
    used_mirrors = [r for r in mirror_rows if pair_key_of(r) in cand_keys]
    pairs, issues, counts = strict_build_pairs(cand_rows + used_mirrors)
    details = details_from_pairs(pairs)

    by_root = fold_roots(details)
    by_group: dict[str, list[dict]] = defaultdict(list)
    for r in by_root.values():
        by_group[r['mapName']].append(r)
    roots_by_map = {m: rs for m, rs in by_group.items()}

    complete_point, complete_meta = panel_weighted(by_group, weights, 'completePoint')
    low_bound, low_meta = panel_weighted(by_group, weights, 'lowBound')
    high_bound, _ = panel_weighted(by_group, weights, 'highBound')

    complete = [d for d in details if d['kind'] == 'COMPLETE']
    trunc_kinds: dict[str, int] = defaultdict(int)
    error_kinds: dict[str, int] = defaultdict(int)
    for d in details:
        for side in ('candidate', 'mirror'):
            raw = d[side]['rowOutcome']
            if raw in UNDECIDED:
                trunc_kinds[raw] += 1
            elif raw in ERRORS:
                error_kinds[raw] += 1

    mirror_entities = {d['mirrorEntityKey'] for d in details}
    mirror_natural = sum(1 for k in mirror_entities
                         if all(d['mirror']['score'] is not None for d in details if d['mirrorEntityKey'] == k))
    cand_natural = sum(1 for d in details if d['candidate']['score'] is not None)
    mirror_seat_natural = sum(1 for d in details if d['mirror']['score'] is not None)

    return {
        'modelKey': model_key,
        'totals': {
            'pairs': len(pairs), 'completePairs': len(complete),
            'truncatedPairs': sum(1 for d in details if d['kind'] == 'TRUNCATED'),
            'errorPairs': sum(1 for d in details if d['kind'] == 'ERROR'),
            'roots': len(by_root),
            'seatViews': len(details),
            'candidateWDL': {
                'wins': sum(1 for d in complete if d['candidate']['viewedOutcome'] == 'NATURAL_WIN'),
                'draws': sum(1 for d in complete if d['candidate']['viewedOutcome'] == 'NATURAL_DRAW'),
                'losses': sum(1 for d in complete if d['candidate']['viewedOutcome'] == 'NATURAL_LOSS'),
            },
        },
        'panel': {
            'panelWeightsByMap': weights,
            'completePoint': complete_point, 'lowBound': low_bound, 'highBound': high_bound,
            'completeMeta': complete_meta, 'lowMeta': low_meta,
            'byMap': {m: {'roots': len(rs), 'completePoint': combine_layer(rs, 'completePoint'),
                          'lowBound': combine_layer(rs, 'lowBound'), 'highBound': combine_layer(rs, 'highBound')}
                      for m, rs in by_group.items()},
            'byRoot': {k: {kk: vv for kk, vv in v.items() if kk not in ('rootKey',)} for k, v in by_root.items()},
        },
        'bootstrap': {
            'completePoint': stratified_bootstrap(roots_by_map, weights, 'completePoint', iterations, bootstrap_seed),
            'lowBound': stratified_bootstrap(roots_by_map, weights, 'lowBound', iterations, bootstrap_seed + 1),
        },
        'breakdowns': {
            'candidateNatural': cand_natural, 'plannedCandidateArms': planned_candidate_arms,
            'candidateNaturalRate': None if not planned_candidate_arms else cand_natural / planned_candidate_arms,
            'mirrorEntityNatural': mirror_natural, 'mirrorEntitiesObserved': len(mirror_entities),
            'plannedMirrorEntities': planned_mirrors,
            'mirrorEntityNaturalRate': None if not planned_mirrors else mirror_natural / planned_mirrors,
            'mirrorSeatViewNatural': mirror_seat_natural, 'mirrorSeatViews': len(details),
            'mirrorSeatViewNaturalRate': None if not details else mirror_seat_natural / len(details),
            'completePairs': len(complete), 'plannedPairs': planned_pairs,
            'completePairingRate': None if not planned_pairs else len(complete) / planned_pairs,
            'truncationKinds': dict(trunc_kinds), 'errorKinds': dict(error_kinds),
            'illegalActionOrCrash': sum(error_kinds.values()),
            'fallbacks': sum(1 for d in details if d['candidateFallback'] or d['mirrorFallback']),
            'identityMismatchPairs': sum(1 for i in issues if i['kind'] == 'IDENTITY_MISMATCH'),
            'viewpointCorrectedRows': sum(1 for d in details
                                          if d['candidate']['viewpointCorrected'] or d['mirror']['viewpointCorrected']),
            'sampleSizes': {'roots': len(by_root), 'seatViews': len(details),
                            'maps': len(by_group), 'models': 1,
                            'byPlayerCount': {str(pc): sum(1 for r in by_root.values() if r['playerCount'] == pc)
                                              for pc in sorted({r['playerCount'] for r in by_root.values()})}},
        },
        'issues': issues,
        'rowCounts': counts,
        '_details': details,
        '_roots': by_root,
    }


# --------------------------------------------------------------------------- 配对差值

def paired_difference(details_a: list[dict], details_b: list[dict], weights: dict[str, float],
                      iterations: int, bootstrap_seed: int) -> dict:
    """同 root/座位配对差值：A − B（各自候选臂视角；镜像在同 root/座位上是同一次计算）。"""
    idx_b = {(d['rootKey'], d['seat']): d for d in details_b}
    common = []
    for d in details_a:
        other = idx_b.get((d['rootKey'], d['seat']))
        if other is None:
            continue
        common.append((d, other))

    by_root: dict[str, list[dict]] = defaultdict(list)
    dropped = {'aTruncated': 0, 'bTruncated': 0, 'aError': 0, 'bError': 0}
    for a, b in common:
        if a['kind'] == 'ERROR' or b['kind'] == 'ERROR':
            dropped['aError' if a['kind'] == 'ERROR' else 'bError'] += 1
            continue
        if a['kind'] == 'COMPLETE' and b['kind'] == 'COMPLETE':
            d = a['candidate']['score'] - b['candidate']['score']
            low = high = d
            complete = True
        else:
            # 至少一侧截断：用各自候选臂的 [low, high] 相减，得到保守区间。
            low = a['candidate']['low'] - b['candidate']['high']
            high = a['candidate']['high'] - b['candidate']['low']
            complete = False
            if a['kind'] == 'TRUNCATED':
                dropped['aTruncated'] += 1
            if b['kind'] == 'TRUNCATED':
                dropped['bTruncated'] += 1
        by_root[a['rootKey']].append({
            'rootKey': a['rootKey'], 'mapName': a['mapName'], 'playerCount': a['playerCount'],
            'complete': complete, 'value': (low + high) / 2 if not complete else low,
            'low': low, 'high': high,
        })

    root_stats = {}
    for root, lst in by_root.items():
        root_stats[root] = {
            'mapName': lst[0]['mapName'], 'playerCount': lst[0]['playerCount'],
            'n': len(lst),
            'completeSeats': sum(1 for x in lst if x['complete']),
            'point': mean([x['value'] for x in lst if x['complete']]),
            'low': mean([x['low'] for x in lst]),
            'high': mean([x['high'] for x in lst]),
        }
    by_map: dict[str, list[dict]] = defaultdict(list)
    for r in root_stats.values():
        by_map[r['mapName']].append(r)
    point, meta = panel_weighted(by_map, weights, 'point')
    low, _ = panel_weighted(by_map, weights, 'low')
    high, _ = panel_weighted(by_map, weights, 'high')
    return {
        'commonPairs': len(common),
        'completeBothPairs': sum(1 for a, b in common if a['kind'] == 'COMPLETE' and b['kind'] == 'COMPLETE'),
        'excluded': dropped,
        'roots': len(root_stats),
        'point': point, 'lowBound': low, 'highBound': high,
        'meta': meta,
        'byRoot': root_stats,
        'bootstrap': {
            'point': stratified_bootstrap(by_map, weights, 'point', iterations, bootstrap_seed),
            'lowBound': stratified_bootstrap(by_map, weights, 'low', iterations, bootstrap_seed + 1),
        },
    }


# --------------------------------------------------------------------------- 主流程

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--panel', default='dev')
    ap.add_argument('--models', default='')
    ap.add_argument('--out', default='')
    ap.add_argument('--bootstrap', type=int, default=10000)
    args = ap.parse_args()

    run_root = (REPO / args.run_root).resolve()
    match_dir = run_root / 'T15-09' / 'matches'
    protocol = json.loads((run_root / 'T15-00' / 'protocol.json').read_text(encoding='utf-8'))
    dev_blocks = protocol['devPanelRootList']['blocks']
    # 面板权重按「人数/地图」层给定：主开发面板两种人数各占 1/2（协议 §6）。
    map_weights = {}
    for b in dev_blocks:
        map_weights.setdefault(b['mapName'], 0.0)
    for name in map_weights:
        map_weights[name] = 1.0 / len(map_weights)
    bootstrap_seed = protocol['masterSeeds']['statisticsNamespace']['baseSeed']

    rows = load_rows(match_dir, args.panel)
    cand_by_model: dict[str, list[dict]] = defaultdict(list)
    mirror_rows: list[dict] = []
    for row in rows:
        if row.get('arm') == 'CANDIDATE':
            cand_by_model[str(row.get('modelTag'))].append(row)
        elif row.get('arm') == 'MIRROR':
            mirror_rows.append(row)

    wanted = [m.strip() for m in args.models.split(',') if m.strip()] or sorted(cand_by_model)
    planned_pairs_per_model = sum(len(b['candidateSeats']) for b in dev_blocks)
    planned_mirrors = len(dev_blocks)

    reports = {}
    for key in wanted:
        if key not in cand_by_model:
            reports[key] = {'modelKey': key, 'status': 'NO_ROWS', 'breakdowns': {
                'candidateNatural': 0, 'plannedCandidateArms': planned_pairs_per_model,
                'candidateNaturalRate': 0.0, 'completePairs': 0, 'plannedPairs': planned_pairs_per_model,
                'completePairingRate': 0.0, 'truncationKinds': {}, 'errorKinds': {},
                'mirrorEntityNatural': 0, 'plannedMirrorEntities': planned_mirrors,
                'mirrorEntityNaturalRate': 0.0, 'illegalActionOrCrash': 0, 'fallbacks': 0}}
            continue
        rep = report_for_model(key, cand_by_model[key], mirror_rows, map_weights,
                               args.bootstrap, bootstrap_seed,
                               planned_pairs_per_model, planned_pairs_per_model, planned_mirrors)
        reports[key] = rep

    # 配对差值：{num: [den list]}
    diffs = {}
    for num, dens in (('d0-c2', ['d0', 'c2']), ('d1-d0', ['d1', 'd0']),
                      ('d2-d1', ['d2', 'd1']), ('d2-c2', ['d2', 'c2'])):
        for seed in ('42', '1337', '2026'):
            a_key, b_key = f'{dens[0]}:{seed}', f'{dens[1]}:{seed}'
            if a_key in reports and b_key in reports and '_details' in reports[a_key] and '_details' in reports[b_key]:
                diffs[f'{num}@s{seed}'] = paired_difference(reports[a_key]['_details'], reports[b_key]['_details'],
                                                            map_weights, args.bootstrap, bootstrap_seed)
    # 三 seed 等权描述（不能当新增 root）
    for num in ('d0-c2', 'd1-d0', 'd2-d1', 'd2-c2'):
        vals = [diffs[f'{num}@s{s}']['point'] for s in ('42', '1337', '2026') if f'{num}@s{s}' in diffs]
        vals = [v for v in vals if v is not None]
        if vals:
            diffs[f'{num}@mean3'] = {'seedAverage': True, 'point': sum(vals) / len(vals),
                                     'seeds': [s for s in ('42', '1337', '2026') if f'{num}@s{s}' in diffs],
                                     'note': '训练 seed 等权描述，不构成新增对局 root'}

    for rep in reports.values():
        rep.pop('_details', None)
        rep.pop('_roots', None)

    payload = {
        'schema': 'v15_dev_panel_summary_1',
        'runId': protocol['runId'],
        'panelId': args.panel,
        'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'statistics': {
            'panelWeightsByMap': map_weights,
            'aggregationOrder': ['root 内等权平均座位', '人数/地图内等权平均 root', '面板权重（2p/3p 各 1/2）'],
            'bootstrap': {'iterations': args.bootstrap, 'seed': bootstrap_seed,
                          'unit': 'initial root family（整块重采样其所有座位/候选/镜像）',
                          'stratifiedBy': '地图'},
            'intervalRule': '自然 [score,score]；截断 [0,1]；配对差值 [C.low−H.high, C.high−H.low]',
        },
        'planned': {'candidateArmsPerModel': planned_pairs_per_model,
                    'mirrorEntities': planned_mirrors,
                    'candidateArmsTotal': planned_pairs_per_model * len(reports),
                    'totalMatches': planned_pairs_per_model * len(reports) + planned_mirrors},
        'reports': reports,
        'differences': diffs,
        'rawRowFiles': sorted({r['_sourceFile'] for r in rows}),
        'rawRowCount': len(rows),
    }
    out = Path(args.out) if args.out else (run_root / 'T15-09' / 'dev_panel_summary.json')
    if not out.is_absolute():
        out = REPO / out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1, default=str) + '\n', encoding='utf-8')
    print(f'[dev-panel] -> {out}')
    for key, rep in sorted(reports.items()):
        b = rep.get('breakdowns', {})
        print(f"  {key:10s} complete={rep.get('totals', {}).get('completePairs')} "
              f"point={rep.get('panel', {}).get('completePoint')} "
              f"lowBound={rep.get('panel', {}).get('lowBound')} "
              f"candNatural={b.get('candidateNatural')}/{b.get('plannedCandidateArms')} "
              f"pairRate={b.get('completePairingRate')}")
    for key, diff in sorted(diffs.items()):
        if diff.get('seedAverage'):
            print(f"  {key:14s} point={diff['point']}")
        else:
            print(f"  {key:14s} point={diff['point']} low={diff['lowBound']} high={diff['highBound']} "
                  f"common={diff['commonPairs']} completeBoth={diff['completeBothPairs']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
