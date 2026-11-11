"""V19/R1：从 DEV 面板逐局文件里取出待诊断家族的 actionDigest，生成重放清单。

只读既有逐局文件，不重新跑对局。清单里带上「该模型在这一局的实际 actionDigest」，
重放时必须与它一致——只有摘要对上，后续的失败机制结论才属于同一局。

用法：
    python v19/tools/make_diag_families.py --run-id run_20260929_v19_02 --out <path>/families.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: R1 点名的四个家族：(标签, 地图, seed, 座位, 说明)
FAMILIES = [
    ("icy-0111-s0", "(2) Icy Paths.aem", 2609260111, 0, "θ1 赢；θ2/θ3 输（θ1 的 +1 就来自这一局）"),
    ("lib-0120-s1", "(2) Liberty Port.aem", 2609260120, 1, "θ1 赢；θ2/θ3 输"),
    ("lib-0121-s1", "(2) Liberty Port.aem", 2609260121, 1, "θ1 赢；θ2/θ3 输"),
    ("mou-0130-s0", "(2) Mourningstar.aem", 2609260130, 0, "θ2/θ3 赢；θ1 输（这一轮真正学到、需要保留的能力）"),
]


def load(out_dir: Path, name: str) -> dict:
    rows: dict[tuple, dict] = {}
    for shard in range(5):
        path = out_dir / f"{name}.m{shard}.games.jsonl"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            rows[(row.get("mapName"), row.get("rootSeed"), row.get("candidateSeat"))] = row
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="run_20260929_v19_02")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    dev = ROOT / "v19" / "out" / args.run_id / "arena" / "dev"
    panels = {
        "theta1": load(dev, "ppo_w1_theta1"),
        "theta2": load(dev, "ppo_w2_theta2"),
        "theta3": load(dev, "ppo_w3_theta3"),
    }
    champion_dev = ROOT / "v19" / "out" / "run_20260928_v19_01" / "arena" / "dev"
    panels["champion"] = load(champion_dev, "P1_s2026_v19control")

    families = []
    for label, map_name, seed, seat, note in FAMILIES:
        key = (map_name, seed, seat)
        row = {}
        for name, panel in panels.items():
            r = panel.get(key)
            row[name] = {
                "outcomeKind": (r or {}).get("outcomeKind"),
                "actionDigest": (r or {}).get("actionDigest"),
                "steps": (r or {}).get("steps"),
            }
        families.append({
            "id": label,
            "mapName": map_name,
            "seed": seed,
            "seat": seat,
            "note": note,
            "perModel": row,
            # 重放 A=θ1、B=θ2，两者都必须与 DEV 记录的摘要一致。
            "expectA": row["theta1"]["actionDigest"],
            "expectB": row["theta2"]["actionDigest"],
        })

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(families, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for f in families:
        print(f"{f['id']}: θ1={f['perModel']['theta1']['outcomeKind']} "
              f"θ2={f['perModel']['theta2']['outcomeKind']} "
              f"θ3={f['perModel']['theta3']['outcomeKind']} "
              f"champion={f['perModel']['champion']['outcomeKind']} "
              f"digestA={str(f['expectA'])[:12]} digestB={str(f['expectB'])[:12]}")
    print(f"[R1] -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
