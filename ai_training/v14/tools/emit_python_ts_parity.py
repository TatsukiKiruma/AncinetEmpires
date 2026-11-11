"""V14/T14-03：把 Python/TS 前向一致性结论写成 JSON 工件。

运行 python/tests/test_v14_encoder_parity.py 的同一批断言，并把结果固化为
`python_ts_forward_parity.json`。只做汇总，不重复实现编码器。
"""
from __future__ import annotations
import json, sys, unittest, io
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))
sys.path.insert(0, str(REPO_ROOT / "python" / "tests"))

RUN_ID = "v14_20260924_t14"
sys.path.insert(0, str(REPO_ROOT / "python"))
import importlib.util
spec = importlib.util.spec_from_file_location(
    "test_v14_encoder_parity", REPO_ROOT / "python" / "tests" / "test_v14_encoder_parity.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(module.EncoderParityTests)
stream = io.StringIO()
result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
fixture = module.EncoderParityTests.fixture["counts"] if hasattr(module.EncoderParityTests, "fixture") else None

report = {
    "schema": "v14_python_ts_forward_parity_1",
    "task": "T14-03",
    "runId": RUN_ID,
    "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "scope": "同一批真实/构造状态上，Python 端独立实现的编码器与 TS 端导出结果的逐数值比对；"
             "不比较网络 logits（网络前向一致性由 T14-04 的 TS 导出复验承担）。",
    "tolerance": {"inputMaxAbsDiff": 1e-6, "note": "预登记容差，未在结果出来后放宽。"},
    "testsRun": result.testsRun,
    "failures": len(result.failures),
    "errors": len(result.errors),
    "passed": result.wasSuccessful(),
    "skipped": len(result.skipped),
    "failureDetails": [str(f[0]) for f in result.failures] + [str(e[0]) for e in result.errors],
    "fixtureCounts": fixture,
    "sourceFiles": {
        "tsEncoder": "src/game/ai/spatial_tensor_encoder.ts",
        "pythonEncoder": "python/v14_spatial_encoder.py",
        "test": "python/tests/test_v14_encoder_parity.py",
        "fixture": f"v14/out/{RUN_ID}/T14-03/parity_fixture.json",
    },
    "rawRunnerOutput": stream.getvalue()[-4000:],
}
out = REPO_ROOT / "v14" / "out" / RUN_ID / "T14-03" / "python_ts_forward_parity.json"
out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"[T14-03] python_ts_forward_parity.json: tests={report['testsRun']} passed={report['passed']} failures={report['failures']} errors={report['errors']}")
sys.exit(0 if report["passed"] else 1)
