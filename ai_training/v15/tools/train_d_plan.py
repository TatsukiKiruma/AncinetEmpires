#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""V15/T15-08-C：D0/D1/D2 训练数据集、split 与 batch 计划生成（协议 §3.2）。

产出：
  - `dataset_d1_train.jsonl` / `dataset_d2_train.jsonl`：旧干净池全文 + 匹配后的新池行（追加在尾部，
    因此旧行行号与 `dataset_v15_clean.jsonl` 完全一致，验证集也完全一致）；
  - `split_manifest_d1.json` / `split_manifest_d2.json`：旧 manifest + 新池 root 家族进 train；
  - `plan_d0.json` / `plan_d1.json` / `plan_d2.json`：每 update 32 = 16 共同旧池 + 16 本组来源。

三个硬约束（协议 §3.2，逐条在本文件里被检查）：
  1. 同 seed 三组相同 update 的前 16 个位置 sampleId 必须一致；
  2. 旧池/新池曝光：D0 = 48,000/0；D1 = D2 = 24,000/24,000；
  3. 每个唯一 key 在**同一循环池内**的曝光次数相差不超过 1（D0 的第二序列设计成旧池循环的
     "续走"，因此把两段合并看也满足 ≤1，见 `d0CombinedCoverage`）。

复用 `v15/tools/train_batch_plan.py` 的 `build_batch_plan`（不修改该文件），保证 plan schema
与训练器 `--batch-plan` 的解析完全一致。

用法：
  python v15/tools/train_d_plan.py --run-root v15/out/v15_20260925_core
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'v15' / 'tools'))
import train_batch_plan as tbp  # noqa: E402  （复用，不修改）

BATCH_SIZE = 32
QUOTA_SHARED = 16
QUOTA_ARM2 = 16
TOTAL_UPDATES = 1500
UPDATES_PER_EPOCH = 250


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for block in iter(lambda: fh.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def resolve_train_rows(dataset: Path, manifest: Path) -> list[int]:
    """与训练器同规则：manifest 的 train 家族 → 行号（文件行序）。"""
    man = json.loads(manifest.read_text(encoding='utf-8'))
    train_roots = set(man.get('trainRootFamilies', []))
    rows: list[int] = []
    with dataset.open('r', encoding='utf-8') as fh:
        for idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get('rootFamilyId') in train_roots:
                rows.append(idx)
    return rows


def read_sample_ids(dataset: Path, only_rows: set[int] | None = None,
                    offset: int = 0) -> dict[int, str]:
    """行号 → sampleId；训练器会用它校验 plan 与实际数据集身份一致。"""
    out: dict[int, str] = {}
    with dataset.open('r', encoding='utf-8') as fh:
        for idx, line in enumerate(fh):
            if not line.strip():
                continue
            if only_rows is not None and idx not in only_rows:
                continue
            out[idx + offset] = str(json.loads(line).get('sampleId'))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-root', default='v15/out/v15_20260925_core')
    ap.add_argument('--old-dataset', default='')
    ap.add_argument('--old-split', default='')
    ap.add_argument('--d1-new', default='')
    ap.add_argument('--d2-new', default='')
    ap.add_argument('--force-rebuild', action='store_true',
                    help='重建已存在的 plan/dataset/split（旧文件改名保留为 *.stale_<时间戳>.json）')
    args = ap.parse_args()
    force = bool(args.force_rebuild)

    run_root = (REPO / args.run_root).resolve()
    task = run_root / 'T15-08'
    old_dataset = (REPO / args.old_dataset).resolve() if args.old_dataset else (run_root / 'T15-06' / 'dataset_v15_clean.jsonl')
    old_split = (REPO / args.old_split).resolve() if args.old_split else (run_root / 'T15-06' / 'split_manifest_v15_clean.json')
    d1_new = (REPO / args.d1_new).resolve() if args.d1_new else (task / 'dataset_d1_new.jsonl')
    d2_new = (REPO / args.d2_new).resolve() if args.d2_new else (task / 'dataset_d2_new.jsonl')
    for p in (old_dataset, old_split, d1_new, d2_new):
        if not p.exists():
            raise SystemExit(f'缺少输入：{p}')

    old_rows = resolve_train_rows(old_dataset, old_split)
    old_n = len(old_rows)
    print(f'[plan] 旧池 train 行数={old_n}')

    # 旧池循环的"续走"偏移：source2 从旧池第一段 24,000 次曝光结束处继续，
    # 使 D0 两段合并后每个旧 key 的曝光次数仍为 7/8（相差 1）。
    total_old_exposures_first = QUOTA_SHARED * TOTAL_UPDATES
    rotation = total_old_exposures_first % old_n
    rotated = old_rows[rotation:] + old_rows[:rotation]

    man = json.loads(old_split.read_text(encoding='utf-8'))
    outputs: dict[str, dict] = {}

    def build_group(group: str, dataset: Path, manifest: Path, arm2_rows: list[int],
                    arm2_name: str, dataset_tag: str,
                    sample_ids: dict[int, str]) -> dict:
        sources = [
            {'name': 'shared_old_pool', 'quota': QUOTA_SHARED, 'rows': old_rows,
             'poolSpec': 'old_train_rows_in_file_order'},
            {'name': arm2_name, 'quota': QUOTA_ARM2, 'rows': arm2_rows, 'poolSpec': dataset_tag},
        ]
        plan = tbp.build_batch_plan(sources=sources, batch_size=BATCH_SIZE,
                                    total_updates=TOTAL_UPDATES, updates_per_epoch=UPDATES_PER_EPOCH,
                                    sample_ids_by_row=sample_ids, seed=0,
                                    note=f'V15 T15-08 {group}: 16 共同旧池 + 16 {arm2_name}；'
                                         f'LR 1e-4→1e-5 按 update 余弦；每 250 更新验证')
        plan['createdBy'] = 'v15/tools/train_d_plan.py'
        plan['group'] = group
        plan['dataset'] = {
            'path': str(dataset).replace('\\', '/'),
            'sha256': sha256_file(dataset),
            'splitManifestPath': str(manifest).replace('\\', '/'),
            'splitManifestSha256': sha256_file(manifest),
            'trainRowCount': len(resolve_train_rows(dataset, manifest)),
        }
        plan['expectedExposures'] = {'sharedOldPool': QUOTA_SHARED * TOTAL_UPDATES,
                                     'arm2': QUOTA_ARM2 * TOTAL_UPDATES,
                                     'total': BATCH_SIZE * TOTAL_UPDATES}
        plan['identity'] = {
            'lrMax': 1e-4, 'lrMin': 1e-5, 'lrScheduleUnit': 'update', 'lrTotalUpdates': TOTAL_UPDATES,
            'weightDecay': 1e-4, 'batchSize': BATCH_SIZE, 'totalUpdates': TOTAL_UPDATES,
            'encoderSchemaId': 'spatial26_global20_actionSemantics53_v15',
            'initRule': '同 seed 三组从对应 C2 final 的同一字节文件 warm-start，并统一重建 optimizer/scheduler',
        }
        out = task / f'plan_{group.lower()}.json'
        if out.exists():
            if not force:
                raise SystemExit(f'拒绝覆盖已存在的 plan：{out}（确需重建请显式加 --force-rebuild，旧文件会被改名保留）')
            stamp = time.strftime('%Y%m%dT%H%M%S')
            os.replace(out, out.with_suffix(f'.stale_{stamp}.json'))
            print(f'[plan] 旧 plan 保留为 {out.with_suffix(f".stale_{stamp}.json").name}')
        out.write_text(json.dumps(plan, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        outputs[group] = {'path': str(out.relative_to(REPO)).replace('\\', '/'), 'sha256': sha256_file(out),
                          'shas': out}
        print(f"[plan] {group} → {out.name} sha256={outputs[group]['sha256'][:12]}… "
              f"coverage={ {k: (v['poolSize'], v['minExposuresPerRow'], v['maxExposuresPerRow']) for k, v in plan['coverage'].items()} }")
        return plan

    # ---------------- D0：只用旧池（第二段是旧池循环的续走） ----------------
    if old_rows != list(range(len(old_rows))):
        raise SystemExit('旧池 train 行不是从 0 开始的连续前缀：plan 模式的 datasetRow 会被当成 Subset 位置，'
                         '当前布局会静默训练错行。拒绝继续。')
    old_ids = read_sample_ids(old_dataset, only_rows=set(old_rows))
    plan_d0 = build_group('D0', old_dataset, old_split, rotated, 'old_pool_control_continue',
                          'old_train_rows_rotated_by_continuing_offset', old_ids)

    # ---------------- D1/D2：旧池 + 新池 ----------------
    def make_dataset(new_path: Path, group: str) -> tuple[Path, Path, int]:
        """行序 = [旧池 train 行 | 新池行 | 旧池其余行(val/test)]。

        为什么必须这样排（本会话实测的公共约束）：训练器 plan 模式把 `datasetRow`
        直接交给 `DataLoader(Subset(full_dataset, train_indices), batch_sampler=PlanBatchSampler)`，
        Subset 会把它当**位置**索引。因此 train 行必须是从 0 开始的连续前缀，否则
        - 位置越界 → `IndexError: list index out of range`（D1/D2 首次尝试即此现象）；
        - 更危险的是位置合法但指向别的行 → 会静默训练错行（trainer 的 sampleId 校验比的是
          全局行号，不会发现位置↔行号错位）。
        旧干净池本身是 train 在 0..6139、val 在 6140..7684，所以这里把新池行插在两者之间。
        """
        man = json.loads(old_split.read_text(encoding='utf-8'))
        train_roots = set(man.get('trainRootFamilies', []))
        head: list[str] = []
        tail: list[str] = []
        with old_dataset.open('r', encoding='utf-8') as fh:
            for line in fh:
                if not line.strip():
                    continue
                if json.loads(line).get('rootFamilyId') in train_roots:
                    head.append(line if line.endswith('\n') else line + '\n')
                else:
                    tail.append(line if line.endswith('\n') else line + '\n')
        new_lines: list[str] = []
        with new_path.open('r', encoding='utf-8') as nf:
            for line in nf:
                if line.strip():
                    new_lines.append(line if line.endswith('\n') else line + '\n')
        out_dataset = task / f'dataset_{group.lower()}_train.jsonl'
        out_man_probe = task / f'split_manifest_{group.lower()}.json'
        stamp = time.strftime('%Y%m%dT%H%M%S')
        for existing in (out_dataset, out_man_probe):
            if existing.exists():
                if not force:
                    raise SystemExit(f'拒绝覆盖已存在的产物：{existing}（确需重建请显式加 --force-rebuild）')
                os.replace(existing, existing.with_name(f'{existing.stem}.stale_{stamp}{existing.suffix}'))
                print(f'[plan] 旧产物保留为 {existing.stem}.stale_{stamp}{existing.suffix}')
        with out_dataset.open('w', encoding='utf-8') as out:
            out.writelines(head)
            out.writelines(new_lines)
            out.writelines(tail)
        n_new = len(new_lines)
        new_families = sorted({str(json.loads(l)['rootFamilyId']) for l in new_lines if json.loads(l).get('rootFamilyId')})
        new_man = json.loads(old_split.read_text(encoding='utf-8'))
        new_man['trainRootFamilies'] = sorted(set(new_man.get('trainRootFamilies', [])) | set(new_families))
        new_man['v15DaggerNewFamilies'] = new_families
        new_man['v15DaggerNote'] = (
            f'{group} 训练集 = 旧池 train 行（行号 0..{len(head) - 1} 不变）+ 追加 {n_new} 行新池'
            f'（行号 {len(head)}..{len(head) + n_new - 1}）+ 旧池 val/test 行（行号 {len(head) + n_new}..）；'
            '验证集内容与 C2 完全相同，只是行号后移。'
            '新池 root 家族属于 data_collection 命名空间，与旧 train/val/test 家族交集为 0。')
        new_man['v15DaggerNewRows'] = n_new
        new_man['v15DaggerNewRowStart'] = len(head)
        new_man['v15DaggerLayout'] = 'train_prefix|new_pool|val_test'
        out_man = task / f'split_manifest_{group.lower()}.json'
        out_man.write_text(json.dumps(new_man, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        return out_dataset, out_man, n_new

    d1_dataset, d1_man, n1 = make_dataset(d1_new, 'D1')
    d2_dataset, d2_man, n2 = make_dataset(d2_new, 'D2')
    print(f'[plan] D1 新池行={n1} 数据集={d1_dataset.name}；D2 新池行={n2} 数据集={d2_dataset.name}')

    # 新池行号：插在旧 train 前缀之后（plan 模式的 datasetRow 就是 Subset 位置，必须连续）。
    d1_rows = [n for n in resolve_train_rows(d1_dataset, d1_man) if n >= old_n and n < old_n + n1]
    d2_rows = [n for n in resolve_train_rows(d2_dataset, d2_man) if n >= old_n and n < old_n + n2]
    print(f'[plan] 旧 train 行数={old_n}；D1 新池行号 = {d1_rows[0] if d1_rows else "-"}..{d1_rows[-1] if d1_rows else "-"}'
          f'（计数 {len(d1_rows)}）；D2 = {d2_rows[0] if d2_rows else "-"}..{d2_rows[-1] if d2_rows else "-"}（计数 {len(d2_rows)}）')
    if len(d1_rows) != n1 or len(d2_rows) != n2:
        raise SystemExit('新池行号解析失败：可解析的新池 train 行数与追加行数不一致。')

    d1_ids = dict(old_ids)
    d1_ids.update(read_sample_ids(d1_new, offset=old_n))
    d2_ids = dict(old_ids)
    d2_ids.update(read_sample_ids(d2_new, offset=old_n))
    plan_d1 = build_group('D1', d1_dataset, d1_man, d1_rows, 'new_pool_d1', 'matched_d1_new_rows', d1_ids)
    plan_d2 = build_group('D2', d2_dataset, d2_man, d2_rows, 'new_pool_d2', 'matched_d2_new_rows', d2_ids)

    # ---------------- 不变式核验 ----------------
    checks: dict[str, object] = {}
    shared_ids = {}
    for group, plan in (('D0', plan_d0), ('D1', plan_d1), ('D2', plan_d2)):
        ids = []
        for entry in plan['updates']:
            for item in entry['items'][:QUOTA_SHARED]:
                ids.append((item['source'], item.get('sampleId'), item['datasetRow']))
        shared_ids[group] = ids
    checks['sharedFirst16Identical'] = (shared_ids['D0'] == shared_ids['D1'] == shared_ids['D2'])
    checks['sharedFirst16SampleIds'] = [x[1] for x in shared_ids['D0'][:4]] + ['…'] + [x[1] for x in shared_ids['D0'][-2:]]
    checks['sharedFirst16Rows'] = [x[2] for x in shared_ids['D0'][:4]] + ['…'] + [x[2] for x in shared_ids['D0'][-2:]]
    checks['planSampleIdCoverage'] = {
        g: {'itemsWithSampleId': sum(1 for e in p['updates'] for i in e['items'] if i.get('sampleId')),
            'items': sum(len(e['items']) for e in p['updates'])}
        for g, p in (('D0', plan_d0), ('D1', plan_d1), ('D2', plan_d2))}
    checks['oldNewExposure'] = {
        'D0': {'old': QUOTA_SHARED * TOTAL_UPDATES + QUOTA_ARM2 * TOTAL_UPDATES, 'new': 0},
        'D1': {'old': QUOTA_SHARED * TOTAL_UPDATES, 'new': QUOTA_ARM2 * TOTAL_UPDATES},
        'D2': {'old': QUOTA_SHARED * TOTAL_UPDATES, 'new': QUOTA_ARM2 * TOTAL_UPDATES},
    }
    # D0 合并视角的每旧 key 曝光次数（应相差 ≤1）
    counts: dict[int, int] = defaultdict(int)
    for entry in plan_d0['updates']:
        for item in entry['items']:
            counts[item['datasetRow']] += 1
    checks['d0CombinedCoverage'] = {'rows': len(counts), 'min': min(counts.values()), 'max': max(counts.values()),
                                    'distinctCounts': sorted(set(counts.values()))}
    for group, plan in (('D1', plan_d1), ('D2', plan_d2)):
        cnt: dict[int, int] = defaultdict(int)
        for entry in plan['updates']:
            for item in entry['items']:
                cnt[item['datasetRow']] += 1
        new_rows = [r for r in cnt if r >= old_n]
        old_cnt = {r: cnt[r] for r in cnt if r < old_n}
        checks[f'{group}Coverage'] = {
            'newRows': len(new_rows),
            'newExposureRange': [min(cnt[r] for r in new_rows), max(cnt[r] for r in new_rows)] if new_rows else None,
            'oldExposureRange': [min(old_cnt.values()), max(old_cnt.values())] if old_cnt else None,
            'oldUniqueRows': len(old_cnt),
        }

    report = {
        'schema': 'v15_dagger_plan_report_1',
        'task': 'T15-08', 'generatedAt': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'batchSize': BATCH_SIZE, 'totalUpdates': TOTAL_UPDATES, 'updatesPerEpoch': UPDATES_PER_EPOCH,
        'sharedSourceRule': '三组共用的前 16 个位置 = 旧池 train 行按文件序循环（同一 rows 列表，同一游标规则）',
        'd0SecondSourceRule': f'旧池循环的续走：rotation={rotation}（= 第一段 24,000 次曝光 mod {old_n}），'
                              '使 D0 两段合并后每个旧 key 曝光 7/8 次（相差 1）',
        'datasetRowSpace': {'oldTrainRows': old_n, 'd1NewRowStart': old_n, 'd1NewRows': n1,
                            'd2NewRowStart': old_n, 'd2NewRows': n2,
                            'layout': 'train_prefix(0..oldTrainRows-1) | new_pool | old_val_test',
                            'why': '训练器 plan 模式把 datasetRow 当作 Subset 位置索引；train 行必须是从 0 开始的连续前缀，'
                                   '否则会 IndexError（位置越界）或静默训练错行（位置合法但指向别的行）。'},
        'plans': {g: {'path': v['path'], 'sha256': v['sha256']} for g, v in outputs.items()},
        'checks': checks,
    }
    (task / 'plan_contract_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('[plan] 不变式：前16位一致 =', checks['sharedFirst16Identical'])
    print('[plan] D0 合并曝光区间 =', checks['d0CombinedCoverage'])
    for g in ('D1', 'D2'):
        print(f'[plan] {g} 覆盖 =', checks[f'{g}Coverage'])
    if not checks['sharedFirst16Identical']:
        raise SystemExit('前 16 位一致性核验失败：三组 plan 不满足协议 §3.2 的共同旧池不变式。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
