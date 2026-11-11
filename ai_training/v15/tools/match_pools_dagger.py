#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08：D1/D2 新池过滤 + 分层匹配（协议 §2.2、任务书 §9.1 第 3/5 条）。

职责：
  1. 过滤：旧池已见输入（policyInputKey 命中旧池任一分区，含历史 test）、臂内重复输入；
  2. 分层匹配：分层键 =（人数/地图，subjectSeat，主体已完成回合桶 0–2 / 3–7 / ≥8）；
     每层取双方可用量最小值；稀疏时按预登记顺序先合并相邻阶段桶、再合并同人数地图桶；
     每 root 两臂上限相同且 ≤ 最终 N 的 20%；
  3. 目标 N=1000；达不到就冻结共同可实现数量；正式最低 N≥512 且双方各 ≥8 个有效 root 家族，
     低于此值只记 PILOT；
  4. 输出 `dataset_d1_new.jsonl` / `dataset_d2_new.jsonl`（选中行，按选择顺序）、
     `matched_groups.json`、`new_pool_filter_report.json`、`d1_d2_shared_states.json`。

为什么在这里做而不是改 `dataset_dagger_encode_v15.ts`：
  编码器是 E 的产物（已跑通、已被 C2/D 依赖），本脚本只消费它的 `*.keys.jsonl` 轻索引，
  不重复实现输入身份算法，也不改动标签。

用法：
  python v15/tools/match_pools_dagger.py --run-root v15/out/v15_20260925_core \
      --arm D1 --keys <...>/dataset_D1_new_candidates.keys.jsonl --candidates <...>/dataset_D1_new_candidates.jsonl \
      --arm D2 --keys ... --candidates ... \
      [--target-n 1000] [--min-n 512] [--per-root-frac 0.2] [--dry-run]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

BUCKETS = [('0-2', 0, 2), ('3-7', 3, 7), ('>=8', 8, 10 ** 9)]
# 预登记合并阶梯（协议 §2.2 第 1 条）：先合并相邻阶段桶，再合并同人数地图桶。
MERGE_LADDER = [
    ('L1a', [('0-2', '3-7')]),          # {0-7}
    ('L1b', [('3-7', '>=8')]),          # {3+}
    ('L1c', [('0-2', '3-7', '>=8')]),   # 全部桶
    ('L2', 'all_seats'),
    ('L3', 'all_maps_same_playercount'),
]
KEY_RE = re.compile(r'"policyInputKey"\s*:\s*"([0-9a-fA-F]+)"')
ROOT_RE = re.compile(r'"rootFamilyId"\s*:\s*"((?:[^"\\]|\\.)*)"')


def bucket_of(turns) -> str:
    turns = int(turns or 0)
    for name, lo, hi in BUCKETS:
        if lo <= turns <= hi:
            return name
    return '>=8'


def sha(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def load_old_pool_keys(path: Path) -> tuple[set[str], int]:
    """只抽 policyInputKey（473MB，避免整行 JSON 解析）；行数单独统计。"""
    keys: set[str] = set()
    n = 0
    with path.open('r', encoding='utf-8', errors='replace') as fh:
        for line in fh:
            if not line.strip():
                continue
            n += 1
            m = KEY_RE.search(line)
            if m:
                keys.add(m.group(1))
    return keys, n


def load_keys(path: Path) -> list[dict]:
    out = []
    with path.open('r', encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def stratum_of(k: dict) -> str:
    return f"{k['playerCount']}|{k['mapName']}|seat{k['daggerSubjectSeat']}|{bucket_of(k['subjectTurnsCompleted'])}"


def group_prefix(k: dict) -> str:
    return f"{k['playerCount']}|{k['mapName']}|seat{k['daggerSubjectSeat']}"


def dedupe(keys: list[dict]) -> tuple[list[dict], dict]:
    """按 policyInputKey 去重，保留 (blockId, sourceRowIndex) 最小者；统计倍数。"""
    by_key: dict[str, list[dict]] = defaultdict(list)
    for k in keys:
        by_key[k['policyInputKey']].append(k)
    kept, dup_rows = [], 0
    for pkey, rows in by_key.items():
        rows.sort(key=lambda r: (str(r['daggerBlockId']), int(r['sourceRowIndex'])))
        kept.append(rows[0])
        dup_rows += len(rows) - 1
    kept.sort(key=lambda r: (str(r['daggerBlockId']), int(r['sourceRowIndex'])))
    return kept, {'uniqueInputs': len(kept), 'droppedDuplicateRows': dup_rows}


def round_robin_select(rows: list[dict], quota: int, per_root_cap: int,
                       root_used: dict[str, int]) -> list[dict]:
    """在层内按 root 轮转选取，保证各 root 均匀且不越过全局单 root 上限。"""
    by_root: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_root[str(r['daggerBlockId'])].append(r)
    for root in by_root:
        by_root[root].sort(key=lambda r: sha(str(r['sampleId'])))
    roots = sorted(by_root)
    picked: list[dict] = []
    idx = {root: 0 for root in roots}
    progress = True
    while len(picked) < quota and progress:
        progress = False
        for root in roots:
            if len(picked) >= quota:
                break
            if root_used[root] >= per_root_cap:
                continue
            i = idx[root]
            if i >= len(by_root[root]):
                continue
            picked.append(by_root[root][i])
            idx[root] = i + 1
            root_used[root] += 1
            progress = True
    return picked


def scale_quotas(quotas: dict[str, int], target: int) -> dict[str, int]:
    """按比例缩放到 target，最大余数法保证总和精确。"""
    total = sum(quotas.values())
    if total <= target:
        return dict(quotas)
    scaled = {k: v * target / total for k, v in quotas.items()}
    floor = {k: int(v) for k, v in scaled.items()}
    remainder = target - sum(floor.values())
    order = sorted(scaled, key=lambda k: (-(scaled[k] - floor[k]), k))
    for k in order[:remainder]:
        floor[k] += 1
    return floor


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--arm', action='append', default=[], help='ARM=keysPath::candidatesPath（可重复）')
    ap.add_argument('--old-pool', default='', help='旧池全量数据集（默认 T15-04/dataset_v15.jsonl）')
    ap.add_argument('--target-n', type=int, default=1000)
    ap.add_argument('--min-n', type=int, default=512)
    ap.add_argument('--per-root-frac', type=float, default=0.2)
    ap.add_argument('--dry-run', action='store_true', help='只算匹配，不写 dataset_*_new.jsonl')
    args = ap.parse_args()

    run_root = (REPO / args.run_root).resolve()
    task_dir = run_root / 'T15-08'
    old_pool = Path(args.old_pool) if args.old_pool else (run_root / 'T15-04' / 'dataset_v15.jsonl')
    arms: dict[str, dict[str, Path]] = {}
    for spec in args.arm:
        name, rest = spec.split('=', 1)
        keys_path, cands_path = rest.split('::', 1)
        arms[name.upper()] = {'keys': (REPO / keys_path).resolve(), 'cands': (REPO / cands_path).resolve()}
    if len(arms) < 2:
        raise SystemExit('至少需要 --arm D1=... 与 --arm D2=...')

    print(f'[match] 读取旧池 policyInputKey：{old_pool}')
    old_keys, old_rows = load_old_pool_keys(old_pool)
    print(f'[match] 旧池行数={old_rows} 唯一 policyInputKey={len(old_keys)}')

    per_arm: dict[str, dict] = {}
    for name, paths in arms.items():
        raw = load_keys(paths['keys'])
        seen_old = [k for k in raw if k['policyInputKey'] in old_keys]
        kept = [k for k in raw if k['policyInputKey'] not in old_keys]
        kept, dup_stats = dedupe(kept)
        per_arm[name] = {
            'raw': raw, 'kept': kept,
            'filterReport': {
                'rawRows': len(raw),
                'droppedSeenInOldPool': len(seen_old),
                'droppedDuplicateInput': dup_stats['droppedDuplicateRows'],
                'keptUniqueInputs': dup_stats['uniqueInputs'],
                'uniqueRoots': len({str(k['daggerBlockId']) for k in kept}),
                'byBucket': {b: sum(1 for k in kept if bucket_of(k['subjectTurnsCompleted']) == b)
                             for b, _, _ in BUCKETS},
                'bySeat': {str(s): sum(1 for k in kept if int(k['daggerSubjectSeat']) == s)
                           for s in sorted({int(k['daggerSubjectSeat']) for k in kept})},
                'byMap': {m: sum(1 for k in kept if k['mapName'] == m)
                          for m in sorted({k['mapName'] for k in kept})},
            },
        }
        print(f"[match] {name}: raw={len(raw)} 旧池已见={len(seen_old)} 臂内重复={dup_stats['droppedDuplicateRows']} "
              f"保留唯一={dup_stats['uniqueInputs']} roots={per_arm[name]['filterReport']['uniqueRoots']}")

    # ---------------- 分层配额（L0 细层 → 按阶梯合并） ----------------
    names = sorted(arms)
    per_root_cap = int(args.per_root_frac * args.target_n)
    root_stat: dict[str, dict[str, int]] = {n: defaultdict(int) for n in names}

    def avail(name: str, pred) -> int:
        return sum(1 for k in per_arm[name]['kept'] if pred(k))

    def cap_avail(name: str, pred) -> int:
        """应用单 root 上限后的可用量（按 root 上剩余的额度计）。"""
        counts: dict[str, int] = defaultdict(int)
        for k in per_arm[name]['kept']:
            if pred(k):
                counts[str(k['daggerBlockId'])] += 1
        return sum(min(c, per_root_cap - root_stat[name][r]) for r, c in counts.items())

    def stratum_pred(skey: str):
        return lambda k: stratum_of(k) == skey

    def group_pred(gkey: str):
        return lambda k: group_prefix(k) == gkey

    all_strata = sorted({stratum_of(k) for n in names for k in per_arm[n]['kept']})
    l0_quota: dict[str, int] = {}
    l0_avail: dict[str, dict[str, int]] = {}
    for skey in all_strata:
        av = {n: cap_avail(n, stratum_pred(skey)) for n in names}
        q = min(av.values())
        l0_avail[skey] = av
        if q > 0:
            l0_quota[skey] = q
    s0 = sum(l0_quota.values())
    print(f'[match] L0 细层可匹配合计={s0}（层数={len(all_strata)}）')

    ladder_used: list[dict] = []
    final_quota: dict[str, dict] = {skey: {'level': 'L0', 'quota': q} for skey, q in l0_quota.items()}
    total = s0
    if total > args.target_n:
        scaled = scale_quotas({k: v['quota'] for k, v in final_quota.items()}, args.target_n)
        for k, v in scaled.items():
            final_quota[k]['quota'] = v
        total = sum(scaled.values())
        print(f'[match] 超过目标 N={args.target_n}，按层比例缩放（最大余数法）→ {total}')
    elif total < args.target_n:
        # 逐级合并：先相邻阶段桶，再同座位全桶，再同人数地图。
        picked_keys = {n: set() for n in names}
        for skey, meta in final_quota.items():
            rows_by_arm = {n: [k for k in per_arm[n]['kept'] if stratum_of(k) == skey] for n in names}
            for n in names:
                picked_keys[n].update(id(k) for k in round_robin_select(
                    rows_by_arm[n], meta['quota'], per_root_cap, root_stat[n]))
        for level, spec in MERGE_LADDER:
            if total >= args.target_n:
                break
            if isinstance(spec, list):
                for merge in spec:
                    if total >= args.target_n:
                        break
                    bucket_set = set(merge)
                    for gkey in sorted({group_prefix(k) for n in names for k in per_arm[n]['kept']}):
                        if total >= args.target_n:
                            break
                        pred = lambda k, g=gkey, b=bucket_set: group_prefix(k) == g and bucket_of(k['subjectTurnsCompleted']) in b
                        av = {n: cap_avail(n, pred) for n in names}
                        q = min(av.values())
                        if q <= 0:
                            continue
                        q = min(q, args.target_n - total)
                        final_quota[f'{level}|{gkey}|buckets={"+".join(merge)}'] = {'level': level, 'quota': q}
                        ladder_used.append({'level': level, 'group': gkey, 'buckets': list(merge),
                                            'quota': q, 'availability': av})
                        total += q
            elif spec == 'all_seats':
                for mapkey in sorted({f"{k['playerCount']}|{k['mapName']}" for n in names for k in per_arm[n]['kept']}):
                    if total >= args.target_n:
                        break
                    pred = lambda k, m=mapkey: f"{k['playerCount']}|{k['mapName']}" == m
                    av = {n: cap_avail(n, pred) for n in names}
                    q = min(min(av.values()), args.target_n - total)
                    if q <= 0:
                        continue
                    final_quota[f'{level}|{mapkey}|all_seats'] = {'level': level, 'quota': q}
                    ladder_used.append({'level': level, 'group': mapkey, 'quota': q, 'availability': av})
                    total += q
            else:  # all_maps_same_playercount
                for pc in sorted({k['playerCount'] for n in names for k in per_arm[n]['kept']}):
                    if total >= args.target_n:
                        break
                    pred = lambda k, p=pc: int(k['playerCount']) == int(p)
                    av = {n: cap_avail(n, pred) for n in names}
                    q = min(min(av.values()), args.target_n - total)
                    if q <= 0:
                        continue
                    final_quota[f'{level}|pc={pc}|all_maps'] = {'level': level, 'quota': q}
                    ladder_used.append({'level': level, 'group': f'pc={pc}', 'quota': q, 'availability': av})
                    total += q

    # ---------------- 实际选取 ----------------
    selected: dict[str, list[dict]] = {n: [] for n in names}
    for n in names:
        root_stat[n] = defaultdict(int)
    allocation: list[dict] = []
    for skey, meta in sorted(final_quota.items(), key=lambda kv: (-{'L0': 0, 'L1a': 1, 'L1b': 1, 'L1c': 1, 'L2': 2, 'L3': 3}[kv[1]['level']], kv[0])):
        level, quota = meta['level'], meta['quota']
        if quota <= 0:
            continue
        if level == 'L0':
            pred = stratum_pred(skey)
        else:
            parts = skey.split('|')
            if level == 'L2':
                mapkey = parts[1] + '|' + parts[2]
                pred = lambda k, m=mapkey: f"{k['playerCount']}|{k['mapName']}" == m
            elif level == 'L3':
                pc = parts[1].split('=')[1]
                pred = lambda k, p=pc: str(k['playerCount']) == p
            else:
                gkey, bs = parts[1], parts[2].split('=')[1]
                bucket_set = set(bs.split('+'))
                pred = lambda k, g=gkey, b=bucket_set: group_prefix(k) == g and bucket_of(k['subjectTurnsCompleted']) in b
        for n in names:
            rows = [k for k in per_arm[n]['kept'] if pred(k)]
            picked = round_robin_select(rows, quota, per_root_cap, root_stat[n])
            selected[n].extend(picked)
        allocation.append({'key': skey, 'level': level, 'quotaPerArm': quota,
                           'picked': {n: len([1 for k in selected[n] if pred(k)]) for n in names}})

    n_final = min(len(selected[n]) for n in names)
    families = {n: len({str(k['daggerBlockId']) for k in selected[n]}) for n in names}
    shared = {n: {} for n in names}
    status = 'OK' if n_final >= args.min_n and all(f >= 8 for f in families.values()) else 'PILOT'

    # ---------------- 写出选中行 ----------------
    out_files = {}
    if not args.dry_run:
        for n in names:
            want_order = {str(k['sampleId']): i for i, k in enumerate(selected[n])}
            out_path = task_dir / f'dataset_{n.lower()}_new.jsonl'
            rows_written = 0
            with arms[n]['cands'].open('r', encoding='utf-8') as fh, out_path.open('w', encoding='utf-8') as out:
                buffer: dict[int, str] = {}
                for line in fh:
                    line = line.rstrip('\n')
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except Exception:
                        continue
                    sid = str(row.get('sampleId'))
                    if sid in want_order:
                        buffer[want_order[sid]] = line
                for i in range(len(selected[n])):
                    if i in buffer:
                        out.write(buffer[i] + '\n')
                        rows_written += 1
            out_files[n] = {'path': str(out_path.relative_to(REPO)).replace('\\', '/'),
                            'rows': rows_written,
                            'sha256': hashlib.sha256(out_path.read_bytes()).hexdigest()}

    # 两臂选中状态交集（另报，不要求完全不重叠）
    if not args.dry_run and len(names) == 2:
        a, b = names
        shared_states = sorted({k['stateHash'] for k in selected[a]} & {k['stateHash'] for k in selected[b]})
        shared_inputs = sorted({k['policyInputKey'] for k in selected[a]} & {k['policyInputKey'] for k in selected[b]})
        (task_dir / 'd1_d2_shared_states.json').write_text(json.dumps({
            'schema': 'v15_d1_d2_shared_states_1',
            'arms': names,
            'sharedStateHashCount': len(shared_states),
            'sharedPolicyInputKeyCount': len(shared_inputs),
            'sharedStateHashes': shared_states,
            'sharedPolicyInputKeys': shared_inputs,
            'note': '协议 §2.2 第 5 条：两组共享状态交集另报，不要求彼此完全不重叠。',
        }, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    matched = {
        'schema': 'v15_dagger_matched_groups_1',
        'task': 'T15-08',
        'runId': json.loads((run_root / 'T15-00' / 'protocol.json').read_text(encoding='utf-8'))['runId'],
        'targetN': args.target_n, 'minN': args.min_n, 'perRootCap': per_root_cap,
        'perRootCapRule': f"单 root ≤ 最终 N 的 {args.per_root_frac:.0%}（{per_root_cap} 行），两臂同一上限",
        'strataRule': '分层键 =（人数/地图，subjectSeat，主体已完成回合桶 0–2 / 3–7 / ≥8）；每层取双方可用量最小值',
        'mergeLadder': [
            'L0 细层（人数/地图 × 座位 × 桶）',
            'L1a 合并相邻桶 {0-2,3-7}',
            'L1b 合并相邻桶 {3-7,≥8}',
            'L1c 合并全部桶',
            'L2 合并同人数地图的全部座位',
            'L3 合并同人数的两张图',
        ],
        'oldPool': {'path': str(old_pool.relative_to(REPO)).replace('\\', '/'),
                    'rows': old_rows, 'uniquePolicyInputKeys': len(old_keys)},
        'perArmFilter': {n: per_arm[n]['filterReport'] for n in names},
        'l0Availability': l0_avail,
        'ladderAllocation': ladder_used,
        'allocation': allocation,
        'finalN': n_final,
        'familiesPerArm': families,
        'status': status,
        'statusRule': f'正式最低 N≥{args.min_n} 且两臂各 ≥8 个有效 root 家族；低于此值只记 PILOT',
        'perRootCounts': {n: dict(sorted(root_stat[n].items())) for n in names},
        'outputs': out_files,
        'note': '每个 update 的 batch 计划见 plan_d0.json / plan_d1.json / plan_d2.json；本文件只冻结新池与分层配额。',
    }
    (task_dir / 'matched_groups.json').write_text(json.dumps(matched, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    filter_report = {
        'schema': 'v15_dagger_new_pool_filter_report_1',
        'task': 'T15-08', 'runId': matched['runId'],
        'oldPool': matched['oldPool'],
        'arms': {n: per_arm[n]['filterReport'] for n in names},
        'keptAfterMatch': {n: len(selected[n]) for n in names},
        'finalN': n_final, 'status': status,
        'note': '被排除的旧池已见输入量必须报告（数据契约 §5.2 第 5 条）；这里给的是**行级**排除量，'
                '不是唯一输入数（去重后才是唯一输入）。',
        'uniqueInputsAfterFilter': {n: per_arm[n]['filterReport']['keptUniqueInputs'] for n in names},
    }
    (task_dir / 'new_pool_filter_report.json').write_text(json.dumps(filter_report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"[match] 最终 N={n_final} 家族数={families} 状态={status} → {task_dir}/matched_groups.json")
    for n in names:
        print(f"[match] {n} 选中={len(selected[n])} 单root最大={max(root_stat[n].values()) if root_stat[n] else 0}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
