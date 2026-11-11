"""验收门禁离线回归；不连接设备。"""
import copy
import argparse
import json
from pathlib import Path
import tempfile
import unittest

from run import evidence, frida_port, proc_starttime


class VerificationTest(unittest.TestCase):
    def test_frida_port_accepts_boundaries_and_rejects_invalid_input(self):
        for port in (1, 27042, 27043, 65535):
            self.assertEqual(frida_port(str(port)), port)
        for port in ("0", "65536", "-1", "abc", "27043.5"):
            with self.assertRaises(argparse.ArgumentTypeError):
                frida_port(port)

    def test_proc_stat_uses_last_parenthesis(self):
        self.assertEqual(proc_starttime("123 (含空格 (括号)) S " + " ".join(str(i) for i in range(4, 23))), "22")

    def test_closed_primary_evidence_and_rejections(self):
        job = {"parentId": "new-parent-001", "attemptId": "trial-001"}
        events = [{**job, "kind": kind, "actionIndex": 0, "path": "hard_js_primary", "returnedId": "17", "actionId": "17"}
                  for kind in ("decision_begin", "decision_return", "decision_accepted", "action_committed")]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "native").mkdir()
            output = directory / "native/decision-evidence.jsonl"
            def write(rows):
                output.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            write(events)
            self.assertTrue(evidence(directory, {"actions": 1}, job)["decisionChainsClosed"])
            cases = [events[:-1], events + [{"kind": "ordinary_ai"}], events + [{"kind": "hard_java_fallback_started"}]]
            for key, value in [("parentId", "other"), ("actionId", "19"), ("path", "fallback")]:
                changed = copy.deepcopy(events)
                changed[2][key] = value
                cases.append(changed)
            for rows in cases:
                write(rows)
                with self.assertRaises(ValueError):
                    evidence(directory, {"actions": 1}, job)


if __name__ == "__main__":
    unittest.main()
