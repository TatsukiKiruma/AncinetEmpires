"""恢复过程不得将旧模型校准收据用于新权重。"""
import tempfile
import unittest
from pathlib import Path
from run_league import calibration_ready, save, sha


class CalibrationIdentityTests(unittest.TestCase):
    def test_generation3_rejects_stale_model_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'gen_03'; folder.mkdir()
            (folder / 'model.bin').write_bytes(b'current-model')
            for name in ['value-calibration.json', 'value-config.json', 'head-calibration.json']:
                save(folder / name, {})
            save(folder / 'dev-policy-audit.json', dict(modelSha256='stale-model'))
            self.assertFalse(calibration_ready(folder))
            save(folder / 'dev-policy-audit.json', dict(modelSha256=sha(folder / 'model.bin')))
            self.assertTrue(calibration_ready(folder))

    def test_incomplete_calibration_is_not_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory) / 'gen_03'; folder.mkdir()
            save(folder / 'value-calibration.json', {})
            self.assertFalse(calibration_ready(folder))


if __name__ == '__main__': unittest.main()
