"""用户授权的外部基线与开工原始身份必须分别保留，篡改或再修改仍拒绝。"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import finish_phase54 as target
from run_league import read, save, sha


class PreservationTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory); audit = root / 'phase54-audit'; file = root / 'src/App.tsx'
        file.parent.mkdir(parents=True); file.write_bytes(b'original'); original = sha(file)
        file.write_bytes(b'external'); observed = sha(file)
        save(audit / 'historical-manifest.json',dict(files={'src/App.tsx':dict(sha256=original)},protected={'src/App.tsx':original}))
        authorization = root / 'authorization.json'
        save(authorization,dict(authorizedByHuman=True,userReply='保留外部改动，本任务不改GUI',records=[dict(path='src/App.tsx',originalSha256=original,observedSha256=observed,originalReconstructedExactly=True)]))
        save(audit / 'protocol.json',dict(authorizedExternalEntrypointChanges=dict(path='authorization.json',sha256=sha(authorization))))
        return root,audit,file

    def test_authorized_external_baseline_preserves_original_failure_and_rejects_later_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root,audit,file = self.fixture(directory)
            with patch.object(target,'ROOT',root),patch.object(target,'DIR',root),patch.object(target,'AUDIT',audit):
                receipt = target.preservation()
                self.assertTrue(receipt['passed']); self.assertTrue(receipt['protectedPassed'])
                self.assertFalse(receipt['originalProtectedPassed'])
                file.write_bytes(b'later-change')
                receipt = target.preservation()
                self.assertFalse(receipt['passed']); self.assertFalse(receipt['protectedPassed'])

    def test_changed_authorization_cannot_silently_override_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            root,audit,_ = self.fixture(directory)
            authorization = read(root / 'authorization.json'); authorization['authorizedByHuman'] = False
            save(root / 'authorization.json',authorization)
            with patch.object(target,'ROOT',root),patch.object(target,'DIR',root),patch.object(target,'AUDIT',audit):
                with self.assertRaises(AssertionError): target.preservation()


if __name__ == '__main__': unittest.main()
