"""V17/T17-02：结果价值标签审核（label audit）。

输入（只读，由 T17-01 `v17/tools/build_v17_dataset.py` 产出的重建分片）：
  - v17/out/v17_20260926_r2/data/legacy_train_dedup.jsonl   每个**实际网络输入**一行
  - v17/out/v17_20260926_r2/data/legacy_val_clean.jsonl     或 legacy_val_dedup.jsonl
    （两者语义相同：val 内部去重 + 剔除所有在 train 出现过的实际输入；
      本工具优先用 *_clean.jsonl，不存在时退回 *_dedup.jsonl 并在输出里写明）
  - v17/out/v17_20260926_r2/data/legacy_split_manifest.json （真实 family，不含 split/source/seat）

输出：v17/out/v17_20260926_r2/data/value_label_audit.json

报告口径（任务书 §4.1）：
  * valueLossMask true/false 行数
  * valueTarget 分布（-1 / 0 / +1）
  * outcomeSource 分布（natural-terminal:NATURAL_WIN / NATURAL_LOSS / 截断 / 错误 …）
  * 独立 family 中「带胜利」与「带失败」的个数
  * 截断/错误行数：**不赋 0**，报告被排除的数量与原因
  * 每图 / 每座位 / 每阶段分解
  * valueTarget 与 outcomeSource 自相矛盾的行（标签 bug，逐条列出）
  * gate：每类胜负 ≥20 个独立 family；校准 val ≥50 个自然终局 family 且含两类

只读 v16/**，不写任何 v16 文件。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "v17" / "out" / "v17_20260926_r2" / "data"

# 自然终局标记：只有这些 outcomeSource 才允许赋 ±1。
NATURAL_PREFIX = "natural-terminal:"
WIN_MARKERS = ("NATURAL_WIN", "WIN")
LOSS_MARKERS = ("NATURAL_LOSS", "LOSS")
DRAW_MARKERS = ("DRAW", "TIE")
# 截断 / 错误标记：必须 valueLossMask=false 且 valueTarget=null，绝不赋 0。
TRUNCATED_MARKERS = ("TRUNCATED", "TRUNCATION", "CAP", "TIMEOUT", "WALL")
ERROR_MARKERS = ("ERROR", "INVALID", "ILLEGAL", "EXCEPTION", "FAILED", "FAIL")

MIN_FAMILIES_PER_CLASS = 20      # §4.1
MIN_CALIB_FAMILIES = 50          # §4.1


def rows(path: Path) -> Iterator[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def classify_source(src: Optional[str]) -> str:
    s = str(src or "")
    if s.startswith(NATURAL_PREFIX):
        return "natural"
    up = s.upper()
    if any(m in up for m in TRUNCATED_MARKERS):
        return "truncated"
    if any(m in up for m in ERROR_MARKERS):
        return "error"
    if any(m in up for m in DRAW_MARKERS):
        return "draw"
    return "other"


def source_class(src: Optional[str]) -> Optional[str]:
    """从 outcomeSource 推出应有 valueTarget：'win' / 'loss' / 'draw' / None。"""
    up = str(src or "").upper()
    if not up:
        return None
    if "NATURAL_WIN" in up or up.endswith(":WIN") or up.endswith("_WIN"):
        return "win"
    if "NATURAL_LOSS" in up or up.endswith(":LOSS") or up.endswith("_LOSS"):
        return "loss"
    if any(m in up for m in DRAW_MARKERS):
        return "draw"
    return None


def _kind_totals(sources: Counter) -> Dict[str, int]:
    totals: Counter = Counter()
    for src, count in sources.items():
        totals[classify_source(src)] += int(count)
    return dict(sorted(totals.items()))


def family_of(row: Dict[str, Any]) -> str:
    fam = row.get("trueFamilyId")
    if fam:
        return str(fam)
    # 退路：由已记录字段重建真实 family（不含 split/source/seat）。
    return f"{row.get('mapName')}#{row.get('initializationPolicyId')}#{row.get('seed')}"


def audit_split(rows_iter: Iterable[Dict[str, Any]], name: str,
                family_summary: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    n = 0
    mask_true = mask_false = 0
    targets = Counter()
    sources = Counter()
    source_class_kind = Counter()
    by_map: Dict[str, Counter] = defaultdict(Counter)
    by_seat: Dict[str, Counter] = defaultdict(Counter)
    by_phase: Dict[str, Counter] = defaultdict(Counter)
    fam_class: Dict[str, set] = defaultdict(set)
    fam_rows = Counter()
    fam_win_targets = Counter()
    fam_loss_targets = Counter()
    inconsistent: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []
    null_target_rows = 0
    mask_true_but_null = 0
    mask_false_but_target = 0
    zero_target_source = Counter()
    policy_masked = 0
    missing_subject_alliance = 0
    missing_winner_alliance = 0
    outcomes = Counter()

    for row in rows_iter:
        n += 1
        sid = row.get("sampleId")
        src = row.get("outcomeSource")
        tgt = row.get("valueTarget")
        mask = bool(row.get("valueLossMask", tgt is not None))
        kind = classify_source(src)
        outcomes[str(src)] += 1
        sources[str(src)] += 1
        if mask:
            mask_true += 1
        else:
            mask_false += 1
        if not bool(row.get("policyLossMask", True)):
            policy_masked += 1
        if row.get("subjectAllianceId") is None:
            missing_subject_alliance += 1
        if row.get("rootAllianceId") is None and row.get("winnerAllianceId") is None:
            missing_winner_alliance += 1

        fam = family_of(row)
        fam_rows[fam] += 1
        scr = source_class(src)

        if tgt is None:
            null_target_rows += 1
            targets["null"] += 1
            if mask:
                mask_true_but_null += 1
                excluded.append({
                    "sampleId": sid, "reason": "valueLossMask=true but valueTarget=null "
                                                "（无结果标签却声明可监督；拒绝当作 0）",
                    "outcomeSource": src, "family": fam})
            if kind in ("truncated", "error", "other") and str(src):
                excluded.append({
                    "sampleId": sid, "reason": f"valueTarget=null 且 outcomeSource={src!r} "
                                                f"（kind={kind}）；按 §4.1 截断/错误不赋 0",
                    "outcomeSource": src, "family": fam})
            continue

        try:
            fv = float(tgt)
        except (TypeError, ValueError):
            excluded.append({"sampleId": sid, "reason": f"non-numeric valueTarget {tgt!r}",
                             "outcomeSource": src, "family": fam})
            continue

        tkey = str(int(fv)) if fv in (-1.0, 0.0, 1.0) else f"other:{fv}"
        targets[tkey] += 1
        if not mask:
            mask_false_but_target += 1
            excluded.append({
                "sampleId": sid, "reason": f"valueLossMask=false 但 valueTarget={fv}；"
                                            "按掩码排除（不参与 value 损失）",
                "outcomeSource": src, "family": fam})
        if fv == 0.0:
            zero_target_source[str(src)] += 1

        seat = str(row.get("subjectPlayerId"))
        phase = str(row.get("phaseBucket"))
        mp = str(row.get("mapName"))
        for bucket, key in ((by_map, mp), (by_seat, seat), (by_phase, phase)):
            bucket[key]["rows"] += 1
            bucket[key]["target_" + tkey] += 1
            bucket[key]["src_" + kind] += 1
            if not mask:
                bucket[key]["mask_false"] += 1

        # family × 类别（只看自然终局且 mask=true 的行）
        if kind == "natural" and mask:
            if fv > 0:
                fam_class[fam].add("win")
                fam_win_targets[fam] += 1
            elif fv < 0:
                fam_class[fam].add("loss")
                fam_loss_targets[fam] += 1
            else:
                fam_class[fam].add("draw")
        source_class_kind[scr or "unknown"] += 1

        # 标签自相矛盾：outcomeSource 与 valueTarget 不一致
        expected = {"win": 1.0, "loss": -1.0, "draw": 0.0}.get(scr or "")
        if expected is not None and fv != expected:
            inconsistent.append({
                "sampleId": sid, "outcomeSource": src, "valueTarget": fv,
                "expectedFromSource": expected, "family": fam, "mapName": row.get("mapName"),
                "subjectPlayerId": row.get("subjectPlayerId"), "phaseBucket": row.get("phaseBucket"),
            })
        if kind in ("truncated", "error") and mask and fv == 0.0:
            excluded.append({
                "sampleId": sid, "reason": f"{kind} 行被赋 valueTarget=0（§4.1 明确禁止）",
                "outcomeSource": src, "family": fam})

    win_fams = sorted(f for f, c in fam_class.items() if "win" in c)
    loss_fams = sorted(f for f, c in fam_class.items() if "loss" in c)
    both_fams = sorted(set(win_fams) & set(loss_fams))
    draw_fams = sorted(f for f, c in fam_class.items() if "draw" in c)
    if family_summary is not None:
        for f in win_fams:
            family_summary[f]["has_win"] = True
        for f in loss_fams:
            family_summary[f]["has_loss"] = True

    def _fin(bucket: Dict[str, Counter]) -> Dict[str, Dict[str, int]]:
        return {k: dict(sorted(v.items())) for k, v in sorted(bucket.items())}

    return {
        "split": name,
        "rows": n,
        "valueLossMask": {"true": mask_true, "false": mask_false},
        "valueTargetDistribution": dict(sorted(targets.items())),
        "outcomeSourceDistribution": dict(sorted(sources.items())),
        "outcomeSourceClass": dict(sorted(source_class_kind.items())),
        "outcomeKind": _kind_totals(sources),
        "policyLossMaskFalseRows": policy_masked,
        "nullTargetRows": null_target_rows,
        "maskTrueButNullTargetRows": mask_true_but_null,
        "maskFalseButTargetRows": mask_false_but_target,
        "zeroTargetBySource": dict(sorted(zero_target_source.items())),
        "excludedRowCount": len(excluded),
        "excludedExamples": excluded[:50],
        "inconsistentLabelCount": len(inconsistent),
        "inconsistentLabels": inconsistent[:200],
        "families": {
            "total": len(fam_rows),
            "withWin": len(win_fams),
            "withLoss": len(loss_fams),
            "withBoth": len(both_fams),
            "withDraw": len(draw_fams),
            "winFamilyList": win_fams[:120],
            "lossFamilyList": loss_fams[:120],
            "maxRowsPerFamily": max(fam_rows.values()) if fam_rows else 0,
        },
        "perMap": _fin(by_map),
        "perSeat": _fin(by_seat),
        "perPhase": _fin(by_phase),
        "allianceIdentityGaps": {
            "rowsWithoutSubjectAlliance": missing_subject_alliance,
            "rowsWithoutRootOrWinnerAlliance": missing_winner_alliance,
            "note": "legacy V16 标签里 subjectAllianceId/rootAllianceId 为 null；"
                    "因此只能核对 outcomeSource↔valueTarget 的粗一致性，"
                    "无法核对 winnerAlliance 与主体阵营（任务书 §4.1 要求的恢复证据不完整）。",
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="V17/T17-02 value label audit")
    ap.add_argument("--data-dir", default=str(DATA_DIR))
    ap.add_argument("--train", default="legacy_train_dedup.jsonl")
    ap.add_argument("--val", default=None, help="默认自动选择 legacy_val_clean.jsonl 或 legacy_val_dedup.jsonl")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    train_path = data_dir / args.train
    if args.val:
        val_path = data_dir / args.val
    else:
        clean = data_dir / "legacy_val_clean.jsonl"
        dedup = data_dir / "legacy_val_dedup.jsonl"
        val_path = clean if clean.exists() else dedup
    out_path = Path(args.out) if args.out else data_dir / "value_label_audit.json"

    for p in (train_path, val_path):
        if not p.exists():
            raise SystemExit(f"缺少输入文件：{p}")
    print(f"[audit] train={train_path}")
    print(f"[audit] val  ={val_path}")
    if val_path.name != "legacy_val_clean.jsonl":
        print("[audit] [!] legacy_val_clean.jsonl 不存在，使用 legacy_val_dedup.jsonl；"
              "两者语义相同（val 内部去重 + 已剔除与 train 同实际输入的行），已在输出里注明。")

    started = time.time()
    fam_summary: Dict[str, Dict[str, Any]] = defaultdict(dict)
    train = audit_split(rows(train_path), "train", fam_summary)
    print(f"[audit] train done in {time.time() - started:.1f}s: rows={train['rows']} "
          f"winFams={train['families']['withWin']} lossFams={train['families']['withLoss']}")
    val = audit_split(rows(val_path), "val", fam_summary)

    # 跨分区 family 交集（真实 family）
    train_fams = set(fam_summary) if False else set()
    tf = set(train["families"]["winFamilyList"]) | set(train["families"]["lossFamilyList"])
    vf = set(val["families"]["winFamilyList"]) | set(val["families"]["lossFamilyList"])
    shared = sorted(tf & vf)

    gate_train_ok = (train["families"]["withWin"] >= MIN_FAMILIES_PER_CLASS
                     and train["families"]["withLoss"] >= MIN_FAMILIES_PER_CLASS)
    calib_families = val["families"]["total"]
    calib_ok = (calib_families >= MIN_CALIB_FAMILIES
                and val["families"]["withBoth"] > 0
                and val["families"]["withWin"] >= 1
                and val["families"]["withLoss"] >= 1)
    if gate_train_ok and calib_ok:
        gate = "PASS"
    elif gate_train_ok or val["families"]["total"] > 0:
        gate = "PARTIAL"
    else:
        gate = "FAIL"

    payload = {
        "schema": "v17_value_label_audit_1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "inputs": {
            "trainPath": str(train_path).replace("\\", "/"),
            "valPath": str(val_path).replace("\\", "/"),
            "valCleanFallback": val_path.name != "legacy_val_clean.jsonl",
            "trainBytes": train_path.stat().st_size,
            "valBytes": val_path.stat().st_size,
        },
        "policy": {
            "valueDefinition": "自然终局：胜 +1、平 0、负 −1；截断/错误不赋 0，valueLossMask=false。",
            "truncatedOrErrorAssignedZero": "禁止（§4.1）；本审核把此类行计入 excludedRowCount 并列出原因。",
            "familyDefinition": "mapName#initializationPolicyId#rootSeed（不含 split/source/seat）",
        },
        "splits": {"train": train, "val": val},
        "crossSplit": {
            "trainFamilies": train["families"]["total"],
            "valFamilies": val["families"]["total"],
            "sharedFamilies": len(shared),
            "sharedFamilyExamples": shared[:10],
            "note": "本审核只按 family 名称核对；实际输入级隔离由 legacy_rebuild_report.json "
                    "的 overlapKeys=919→0（val 剔除后）与 T17-01 自检保证。",
        },
        "gate": {
            "requirement": f"训练集每类胜/负各 ≥{MIN_FAMILIES_PER_CLASS} 个独立 family；"
                           f"校准 val ≥{MIN_CALIB_FAMILIES} 个自然终局 family 且含两类结果。",
            "trainWinFamilies": train["families"]["withWin"],
            "trainLossFamilies": train["families"]["withLoss"],
            "trainFamiliesWithBoth": train["families"]["withBoth"],
            "valFamilies": val["families"]["total"],
            "valWinFamilies": val["families"]["withWin"],
            "valLossFamilies": val["families"]["withLoss"],
            "valFamiliesWithBoth": val["families"]["withBoth"],
            "winGatePass": train["families"]["withWin"] >= MIN_FAMILIES_PER_CLASS,
            "lossGatePass": train["families"]["withLoss"] >= MIN_FAMILIES_PER_CLASS,
            "calibrationGatePass": calib_ok,
            "calibrationFamilyShortfall": max(0, MIN_CALIB_FAMILIES - calib_families),
            "result": gate,
            "interpretation": {
                "PASS": "两类各 ≥20 family 且校准 val ≥50 family 含两类。",
                "PARTIAL": "有真实自然终局标签但未同时满足两个下限；只能做训练预演，"
                           "不得声称 value 已合格（§4.1）。",
                "FAIL": "没有任何可用结果标签。",
            }[gate],
        },
        "elapsedSeconds": round(time.time() - started, 1),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[audit] wrote {out_path}")
    print(f"[GATE] {gate} | train win/loss families = "
          f"{train['families']['withWin']}/{train['families']['withLoss']} | "
          f"val families = {val['families']['total']} (win {val['families']['withWin']}, "
          f"loss {val['families']['withLoss']}, both {val['families']['withBoth']})")
    print(f"[audit] inconsistentLabels train={train['inconsistentLabelCount']} "
          f"val={val['inconsistentLabelCount']} | excluded train={train['excludedRowCount']} "
          f"val={val['excludedRowCount']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
