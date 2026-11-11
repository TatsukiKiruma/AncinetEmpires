"""V14/T14-03：Python/TS 编码器一致性测试。

运行：
    py -m unittest discover -s python/tests -p "test_v14_*.py" -v

输入：`v14/out/<runId>/T14-03/parity_fixture.json`（由 export_parity_fixture.ts 生成）。
本测试不重新计算 TS 结果、不重采样状态，只做逐数值比对与覆盖度检查。

预登记容差（见 V14_AGENT_TASKBOOK 5.2）：
- 输入（空间张量 / 全局特征 / 候选特征）最大绝对差 <= 1e-6；
- 候选语义最大绝对差 <= 1e-6（两侧同为 Float32 精度写出）。
超过容差即失败，不允许看结果后放宽。
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from v14_spatial_encoder import (  # noqa: E402
    ACTION_TYPE_LIST,
    TerrainTables,
    encode_candidate_action_spatial,
    encode_game_state_spatial,
)

RUN_ID = os.environ.get("V14_RUN_ID", "v14_20260924_t14")
FIXTURE = REPO_ROOT / "v14" / "out" / RUN_ID / "T14-03" / "parity_fixture.json"
INPUT_ATOL = 1e-6


def _max_abs_diff(a, b) -> float:
    if len(a) != len(b):
        return float("inf")
    worst = 0.0
    for x, y in zip(a, b):
        worst = max(worst, abs(float(x) - float(y)))
    return worst


class EncoderParityTests(unittest.TestCase):
    """逐数值比对 Python 端与 TS 端编码结果。"""

    @classmethod
    def setUpClass(cls) -> None:
        if not FIXTURE.exists():
            raise unittest.SkipTest(
                f"缺少一致性夹具 {FIXTURE}；先运行 "
                "node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/export_parity_fixture.ts"
            )
        with FIXTURE.open("r", encoding="utf-8") as handle:
            cls.fixture = json.load(handle)
        cls.tables = TerrainTables.from_dict(cls.fixture["terrainTables"])
        cls.state_table = cls.fixture["states"]

    def test_fixture_meets_minimum_state_count(self) -> None:
        counts = self.fixture["counts"]
        self.assertGreaterEqual(
            counts["states"], counts["minStatesRequired"],
            f"诊断状态数 {counts['states']} 少于要求的 {counts['minStatesRequired']}",
        )

    def test_spatial_and_global_features_match(self) -> None:
        worst_spatial = 0.0
        worst_global = 0.0
        compared = 0
        for case in self.fixture["cases"]:
            encoded = encode_game_state_spatial(self.state_table[case["stateIndex"]]["state"], case["playerId"], self.tables)
            worst_spatial = max(worst_spatial, _max_abs_diff(encoded["spatialTensor"], case["spatialTensor"]))
            worst_global = max(worst_global, _max_abs_diff(encoded["globalFeatures"], case["globalFeatures"]))
            compared += 1
        self.assertGreater(compared, 0, "没有任何可比对的 case")
        self.assertLessEqual(worst_spatial, INPUT_ATOL,
                             f"空间张量最大绝对差 {worst_spatial} 超过 {INPUT_ATOL}")
        self.assertLessEqual(worst_global, INPUT_ATOL,
                             f"全局特征最大绝对差 {worst_global} 超过 {INPUT_ATOL}")

    def test_candidate_features_and_coords_match(self) -> None:
        worst_semantics = 0.0
        coord_mismatches = []
        compared = 0
        for case in self.fixture["cases"]:
            for candidate in case["candidates"]:
                encoded = encode_candidate_action_spatial(
                    self.state_table[case["stateIndex"]]["state"], case["playerId"],
                    candidate["action"], self.tables,
                )
                worst_semantics = max(
                    worst_semantics, _max_abs_diff(encoded["semantics"], candidate["semantics"]),
                )
                for key in ("actorCoord", "landingCoord", "targetCoord"):
                    if encoded[key] != candidate[key]:
                        coord_mismatches.append(
                            (case["stateId"], candidate["actionCode"], key, encoded[key], candidate[key])
                        )
                compared += 1
        self.assertGreater(compared, 0, "没有任何候选动作可比对")
        self.assertLessEqual(worst_semantics, INPUT_ATOL,
                             f"候选语义最大绝对差 {worst_semantics} 超过 {INPUT_ATOL}")
        self.assertEqual(coord_mismatches[:5], [],
                         f"坐标字段不一致 {len(coord_mismatches)} 例，前 5 例：{coord_mismatches[:5]}")

    def test_action_type_coverage(self) -> None:
        """夹具必须覆盖多种动作类型，否则一致性结论的适用范围过窄。"""
        types = set()
        for case in self.fixture["cases"]:
            for candidate in case["candidates"]:
                types.add(candidate["actionCode"].split(":")[0])
        self.assertGreaterEqual(len(types), 6, f"夹具只覆盖了 {sorted(types)}")
        self.assertTrue(types.issubset(set(ACTION_TYPE_LIST)),
                        f"出现未声明的动作类型：{types - set(ACTION_TYPE_LIST)}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
