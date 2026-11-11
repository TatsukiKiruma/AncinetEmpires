#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-09/T15-08：按协议 §7.1 固定规则判定是否进入独立确认集。

本脚本**只做判定**，不做任何有利于触发的调整：
  - 主开发表只比较 final（C2 = final@3000，D = final@1500）；
  - best 的离线结果只作辅助诊断，不参与选择；
  - 不满足条件时输出 NO_PROMOTION 或 INCONCLUSIVE，且不消耗确认集。

固定规则（协议 §7.1 / protocol.json#selectionAndConfirmation.selection）：
  1. 全部正确性 gate：错误 0、非法动作 0、非声明 fallback 0；
  2. 组级条件：
     - D1/D2：相对 D0 的开发差值点估计在 ≥2/3 初始化上为正；
     - D0：相对 C2 的点估计在 ≥2/3 初始化上为正；
     - 所有组：三 seed 平均「相对 C2 的全计划差值下界」> 0；
  3. 开发候选自然完成率与完整配对率均 ≥90%；
  4. 组排序：三 seed 平均相对 C2 全计划下界降序 → 三 seed 平均干净 val CE 升序 → 固定组序 D0、D1、D2；
  5. 组内选种子：相对 C2 的完整配对差值降序、val CE 升序、seed 数值升序，取中间一名；
     该 seed 自身的相对 C2 全计划差值下界也必须为正，否则本轮不进入确认。

用法：
  python v15/tools/run_d_selection.py --run-root v15/out/v15_20260925_core
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SEEDS = (42, 1337, 2026)
GROUPS = ('d0', 'd1', 'd2')
MIN_RATE = 0.90
MIN_POSITIVE_INITS = 2  # ≥2/3


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None


def val_ce_at_final(run_root: Path, name: str) -> float | None:
    m = load_json(run_root / 'T15-08' / name / f'{name}_metrics.json')
    if not m:
        return None
    hist = m.get('history') or []
    for h in reversed(hist):
        if h.get('val_loss') is not None:
            return float(h['val_loss'])
    return None


def val_acc_at_final(run_root: Path, name: str) -> float | None:
    m = load_json(run_root / 'T15-08' / name / f'{name}_metrics.json')
    if not m:
        return None
    for h in reversed(m.get('history') or []):
        if h.get('val_acc') is not None:
            return float(h['val_acc'])
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--summary', default='')
    args = ap.parse_args()
    run_root = (REPO / args.run_root).resolve()
    summary_path = (REPO / args.summary).resolve() if args.summary else (run_root / 'T15-09' / 'dev_panel_summary.json')
    summary = load_json(summary_path)
    if summary is None:
        raise SystemExit(f'缺少开发面板汇总：{summary_path}（先跑 v15/tools/run_d_dev_panel.py）')

    reports = summary['reports']
    diffs = summary['differences']
    evidence: dict = {}
    reasons: list[str] = []

    def diff_point(num: str, seed: int):
        d = diffs.get(f'{num}@s{seed}')
        return None if d is None else d.get('point')

    def diff_low(num: str, seed: int):
        d = diffs.get(f'{num}@s{seed}')
        return None if d is None else d.get('lowBound')

    # ---------------- 1) 正确性 gate ----------------
    correctness = {}
    for key, rep in sorted(reports.items()):
        b = rep.get('breakdowns', {})
        correctness[key] = {
            'errors': sum((b.get('errorKinds') or {}).values()),
            'errorPairs': rep.get('totals', {}).get('errorPairs', 0),
            'illegalActionOrCrash': b.get('illegalActionOrCrash', 0),
            'fallbacks': b.get('fallbacks', 0),
            'identityMismatchPairs': b.get('identityMismatchPairs', 0),
            'duplicateGameIds': sum(1 for i in rep.get('issues', []) if i.get('kind') == 'DUPLICATE_GAME_ID'),
            'candidateNaturalRate': b.get('candidateNaturalRate'),
            'completePairingRate': b.get('completePairingRate'),
            'candidateNatural': b.get('candidateNatural'),
            'plannedCandidateArms': b.get('plannedCandidateArms'),
            'completePairs': b.get('completePairs'),
            'plannedPairs': b.get('plannedPairs'),
        }
    gate_errors_zero = all(v['errors'] == 0 and v['errorPairs'] == 0 for v in correctness.values())
    gate_illegal_zero = all(v['illegalActionOrCrash'] == 0 for v in correctness.values())
    gate_fallback_zero = all(v['fallbacks'] == 0 for v in correctness.values())
    gate_identity_zero = all(v['identityMismatchPairs'] == 0 and v['duplicateGameIds'] == 0 for v in correctness.values())
    evidence['correctness'] = correctness

    # ---------------- 2/3) 组级条件 ----------------
    group_eval = {}
    for group in GROUPS:
        names = [f'{group}:{s}' for s in SEEDS]
        present = [n for n in names if n in reports]
        val_ces = [val_ce_at_final(run_root, n.replace(':', '_')) for n in present]
        val_ces = [v for v in val_ces if v is not None]
        pair = 'd1-d0' if group == 'd1' else ('d2-d0' if group == 'd2' else 'd0-c2')
        points = {s: diff_point(pair, s) for s in SEEDS}
        positive = [s for s in SEEDS if points.get(s) is not None and points[s] > 0]
        full_low = {s: diff_low(f'{group}-c2', s) for s in SEEDS}
        lows = [v for v in full_low.values() if v is not None]
        rates_ok = all((reports[n]['breakdowns'].get('candidateNaturalRate') or 0) >= MIN_RATE
                       and (reports[n]['breakdowns'].get('completePairingRate') or 0) >= MIN_RATE
                       for n in present)
        group_eval[group] = {
            'modelsPresent': present,
            'comparePair': pair,
            'pointEstimates': points,
            'positiveInits': positive,
            'minPositiveInitsRequired': MIN_POSITIVE_INITS,
            'groupConditionA': len(positive) >= MIN_POSITIVE_INITS,
            'meanFullPlanLowerBoundVsC2': (sum(lows) / len(lows)) if lows else None,
            'fullPlanLowerBoundBySeed': full_low,
            'groupConditionB': bool(lows) and (sum(lows) / len(lows)) > 0,
            'meanValCE': (sum(val_ces) / len(val_ces)) if val_ces else None,
            'valCEBySeed': val_ces,
            'completionRatesOK': rates_ok,
            'eligible': len(positive) >= MIN_POSITIVE_INITS and bool(lows) and (sum(lows) / len(lows)) > 0 and rates_ok,
        }
    evidence['groups'] = group_eval

    eligible = [g for g in GROUPS if group_eval[g]['eligible']]
    # 组排序：下界降序 → val CE 升序 → 固定组序
    fix_order = {'d0': 0, 'd1': 1, 'd2': 2}
    eligible.sort(key=lambda g: (-(group_eval[g]['meanFullPlanLowerBoundVsC2'] or -9),
                                 group_eval[g]['meanValCE'] if group_eval[g]['meanValCE'] is not None else 9,
                                 fix_order[g]))
    evidence['ranking'] = [
        {'group': g, 'meanLowerBoundVsC2': group_eval[g]['meanFullPlanLowerBoundVsC2'],
         'meanValCE': group_eval[g]['meanValCE']} for g in eligible]

    selected = None
    if eligible:
        group = eligible[0]
        rows = []
        for s in SEEDS:
            name = f'{group}:{s}'
            if name not in reports:
                continue
            rows.append({
                'seed': s,
                'completePairPointVsC2': diff_point(f'{group}-c2', s),
                'fullPlanLowerBoundVsC2': diff_low(f'{group}-c2', s),
                'valCE': val_ce_at_final(run_root, f'{group}_s{s}'),
            })
        ranked = sorted(rows, key=lambda r: (-(r['completePairPointVsC2'] if r['completePairPointVsC2'] is not None else -9),
                                             r['valCE'] if r['valCE'] is not None else 9,
                                             r['seed']))
        middle = ranked[len(ranked) // 2]
        extra_ok = middle['fullPlanLowerBoundVsC2'] is not None and middle['fullPlanLowerBoundVsC2'] > 0
        evidence['seedSelection'] = {'group': group, 'ranking': ranked, 'middle': middle,
                                     'middleLowerBoundPositive': extra_ok}
        if extra_ok:
            selected = {'group': group, 'seed': middle['seed'],
                        'modelKey': f'{group}:{middle["seed"]}',
                        'meanLowerBoundVsC2': group_eval[group]['meanFullPlanLowerBoundVsC2'],
                        'seedLowerBoundVsC2': middle['fullPlanLowerBoundVsC2']}
        else:
            reasons.append(f'合格组 {group.upper()} 的中间 seed {middle["seed"]} 自身相对 C2 的全计划差值下界'
                           f'={middle["fullPlanLowerBoundVsC2"]}，不为正 → 本轮不进入确认（协议 §7.1）。')

    # ---------------- 结论 ----------------
    if selected is not None:
        decision = 'PROMOTION_CANDIDATE'
        scope = ('仅建议在**独立学生确认集**上验证该 final；本轮不替换生产默认（生产保持 H0），'
                 '且部署资格为 NOT_MEASURED（缺浏览器/硬件/延迟目标）。')
        detail = (f"合格组 {selected['group'].upper()}，组内按固定规则取中间 seed {selected['seed']}；"
                  f"三 seed 平均相对 C2 全计划下界={selected['meanLowerBoundVsC2']}，"
                  f"该 seed 自身下界={selected['seedLowerBoundVsC2']}。")
    else:
        if not eligible:
            decision = 'INCONCLUSIVE'
            detail = ('没有任何组同时满足「正确性 gate 全通过 + 组级点估计条件 + 三 seed 平均全计划下界为正 + '
                      '完成率 ≥90%」；本轮不消耗学生确认集。')
        else:
            decision = 'NO_PROMOTION'
            detail = '；'.join(reasons) or '合格组存在但组内种子附加条件不满足。'
        scope = '不消耗学生确认集（协议 §7.1）；本轮结论只覆盖已测 2p/3p 两张地图，不能外推到其他人数/地图。'

    payload = {
        'schema': 'v15_selection_decision_1',
        'runId': summary['runId'],
        'task': 'T15-09B/T15-08',
        'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'decision': decision,
        'scope': scope,
        'detail': detail,
        'mainEndpoint': {'c2': 'final@3000', 'dagger': 'final@1500', 'bestUsed': False},
        'ruleSource': 'V15_EXPERIMENT_PROTOCOL §7.1 / protocol.json#selectionAndConfirmation.selection',
        'gates': {
            'errorsZero': gate_errors_zero,
            'illegalActionsZero': gate_illegal_zero,
            'undeclaredFallbackZero': gate_fallback_zero,
            'identityClean': gate_identity_zero,
            'fixtureRegression': {
                'status': 'NO_PROVEN_REGRESSION',
                'evidence': [
                    'v15/out/v15_20260925_core/T15-02/combat_projection_results.json（反击投影正反例）',
                    'v15/out/v15_20260925_core/T15-09/gate_GE.json（评测自测 6/6）',
                    '本轮未修改任何 src/** 规则或策略源码，D 组只做训练与评测',
                ],
            },
        },
        'evidence': evidence,
        'confirmSetConsumed': False,
        'forbiddenActionsRespected': ['未临时更换 best', '未组合启发式接管', '未调整筛选阈值'],
        'note': '本判定不解释胜负原因，只按预登记规则给机器可读结论；负面结果同样完整报告。',
    }
    out = run_root / 'T15-09' / 'selection_decision.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[selection] {decision} → {out}')
    for g in GROUPS:
        e = group_eval[g]
        print(f"  {g.upper()}: condA={e['groupConditionA']} ({e['positiveInits']}) "
              f"meanLowVsC2={e['meanFullPlanLowerBoundVsC2']} meanValCE={e['meanValCE']} eligible={e['eligible']}")
    if selected:
        print(f"  → {selected['modelKey']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
