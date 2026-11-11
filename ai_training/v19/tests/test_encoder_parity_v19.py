"""V19/T19-01b 验收：200 个真实快照的 TS/Python 编码器与推理一致性。

覆盖（对应任务书 T19-01 验收第 2、3 项）：
1. **编码器一致**：同一批真实状态，Python 与 TS 的 26 通道 / 34 通道空间张量、全局特征
   逐数值一致（容差 1e-6，与 V14 预登记容差一致，不因结果放宽）。
2. **候选映射一致**：每个快照的候选动作坐标与 53 维语义逐数值一致，且候选顺序
   （`actionCode` 字典序）与 TS 相同。
3. **推理一致**：用 34 通道检查点在同一批快照上前向，Python 的 logits 与 argmax
   必须与 TS 记录值一致。

运行：
    python -m pytest v19/tests/test_encoder_parity_v19.py -q
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "v19" / "training"))

RUN_ID = "run_20260928_v19_01"
SNAPSHOTS = ROOT / "v19" / "out" / RUN_ID / "parity" / "snapshots_v19.jsonl"
TABLES = ROOT / "v19" / "out" / RUN_ID / "parity" / "terrain_tables_v19.json"
CHECKPOINT = ROOT / "v19" / "out" / RUN_ID / "experiments" / "migrated" / "P1_to_v19schema.json"

INPUT_ATOL = 1e-6
LOGIT_ATOL = 1e-4

from v14_spatial_encoder import (  # noqa: E402
    TerrainTables,
    encode_candidate_action_spatial,
    encode_game_state_spatial,
)
from spatial_resnet_model import SpatialResNet  # noqa: E402
from verify_parity import load_spatial_model_from_json, forward_case  # noqa: E402


def _max_abs_diff(a, b) -> float:
    if len(a) != len(b):
        return float("inf")
    worst = 0.0
    for x, y in zip(a, b):
        worst = max(worst, abs(float(x) - float(y)))
    return worst


@pytest.fixture(scope="module")
def fixture():
    if not SNAPSHOTS.is_file() or not TABLES.is_file():
        pytest.skip(f"缺少一致性夹具（先运行 v19/tools/export_parity_fixture_v19.ts）：{SNAPSHOTS}")
    tables = TerrainTables.from_dict(json.loads(TABLES.read_text(encoding="utf-8")))
    rows = [json.loads(line) for line in SNAPSHOTS.read_text(encoding="utf-8").splitlines() if line.strip()]
    return tables, rows


def test_fixture_covers_five_maps_and_200_snapshots(fixture):
    _, rows = fixture
    assert len(rows) == 200, f"快照数应为 200，实际 {len(rows)}"
    maps = {r["mapName"] for r in rows}
    assert len(maps) == 5, f"五图覆盖不足：{sorted(maps)}"
    per_map = {m: sum(1 for r in rows if r["mapName"] == m) for m in maps}
    assert all(v == 40 for v in per_map.values()), f"每图快照数应为 40：{per_map}"
    action_types = {c["actionCode"].split(":")[0] for r in rows for c in r["candidates"]}
    assert len(action_types) >= 6, f"动作类型覆盖不足：{sorted(action_types)}"


def test_spatial_and_global_features_match_on_both_schemas(fixture):
    tables, rows = fixture
    worst26 = worst34 = worst_global26 = worst_global34 = 0.0
    for row in rows:
        state = row["state"]
        pid = row["playerId"]
        enc26 = encode_game_state_spatial(state, pid, tables, channels=26)
        enc34 = encode_game_state_spatial(state, pid, tables, channels=34)
        worst26 = max(worst26, _max_abs_diff(enc26["spatialTensor"], row["spatialTensor26"]))
        worst34 = max(worst34, _max_abs_diff(enc34["spatialTensor"], row["spatialTensor34"]))
        worst_global26 = max(worst_global26, _max_abs_diff(enc26["globalFeatures"], row["globalFeatures26"]))
        worst_global34 = max(worst_global34, _max_abs_diff(enc34["globalFeatures"], row["globalFeatures34"]))
    assert worst26 <= INPUT_ATOL, f"26 通道空间张量最大绝对差 {worst26}"
    assert worst34 <= INPUT_ATOL, f"34 通道空间张量最大绝对差 {worst34}"
    assert worst_global26 <= INPUT_ATOL, f"26 通道全局特征最大绝对差 {worst_global26}"
    assert worst_global34 <= INPUT_ATOL, f"34 通道全局特征最大绝对差 {worst_global34}"


def test_candidate_coords_and_semantics_match(fixture):
    tables, rows = fixture
    worst_sem = 0.0
    coord_mismatch = []
    order_mismatch = []
    compared = 0
    for row in rows:
        state = row["state"]
        pid = row["playerId"]
        py_codes = []
        for candidate in row["candidates"]:
            encoded = encode_candidate_action_spatial(
                state, pid, candidate["action"], tables, semantics_variant="v15_current",
            )
            worst_sem = max(worst_sem, _max_abs_diff(encoded["semantics"], candidate["semantics"]))
            py_codes.append(candidate["actionCode"])
            for key in ("actorCoord", "landingCoord", "targetCoord"):
                if encoded[key] != candidate[key]:
                    coord_mismatch.append((row["snapshotId"], candidate["actionCode"], key,
                                           encoded[key], candidate[key]))
            compared += 1
        if py_codes != sorted(py_codes):
            order_mismatch.append(row["snapshotId"])
    assert compared > 0, "没有任何候选可比对"
    assert worst_sem <= INPUT_ATOL, f"候选语义最大绝对差 {worst_sem}"
    assert coord_mismatch[:5] == [], f"坐标不一致 {len(coord_mismatch)} 例，前 5 例：{coord_mismatch[:5]}"
    assert order_mismatch[:5] == [], f"候选顺序不是 actionCode 字典序：{order_mismatch[:5]}"


def test_python_logits_and_argmax_match_ts_reference(fixture):
    _, rows = fixture
    if not CHECKPOINT.is_file():
        pytest.skip(f"缺少参考检查点：{CHECKPOINT}")
    model = load_spatial_model_from_json(str(CHECKPOINT))
    assert int(model.spatial_channels) == 34, "参考检查点必须是 34 通道 V19 schema"

    worst_logit = 0.0
    worst_value = 0.0
    argmax_mismatch = []
    compared = 0
    for row in rows:
        if row.get("tsLogits") is None:
            continue
        result = forward_case(model, {
            "spatialTensor": row["spatialTensor34"],
            "globalFeatures": row["globalFeatures34"],
            "candidateActions": row["candidates"],
        })
        worst_logit = max(worst_logit, _max_abs_diff(result["actionLogits"], row["tsLogits"]))
        worst_value = max(worst_value, abs(float(result["value"]) - float(row["tsValue"])))
        if result["bestActionIndex"] != row["tsArgmax"]:
            argmax_mismatch.append((row["snapshotId"], result["bestActionIndex"], row["tsArgmax"]))
        compared += 1
    assert compared == len(rows), f"只比对了 {compared}/{len(rows)} 个快照"
    assert worst_logit <= LOGIT_ATOL, f"logits 最大绝对差 {worst_logit}"
    assert worst_value <= LOGIT_ATOL, f"value 最大绝对差 {worst_value}"
    assert argmax_mismatch[:5] == [], f"argmax 不一致 {len(argmax_mismatch)} 例：{argmax_mismatch[:5]}"
