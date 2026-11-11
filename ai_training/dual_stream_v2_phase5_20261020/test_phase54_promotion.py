"""阶段5.4晋升必须完整合取，缺项或任一失败不能替换冠军。"""
import tempfile
import os
import unittest
from pathlib import Path
from unittest.mock import patch
import promote_phase54 as target
from run_league import save, read, sha


class PromotionTests(unittest.TestCase):
    def test_success_atomically_replaces_champion_without_changing_hardlinked_history(self):
        with tempfile.TemporaryDirectory(dir=target.DIR) as directory:
            base = Path(directory); audit = base / 'phase54-audit'; model = base / 'generations/gen_03/model.bin'
            model.parent.mkdir(parents=True); model.write_bytes(b'candidate'); model.with_suffix('.json').write_text('{}',encoding='utf-8')
            historical = base / 'historical.bin'; historical.write_bytes(b'original'); os.link(historical,base / 'dual-v2-champion.bin')
            protocol = dict(candidateGeneration=3,candidateModel='generations/gen_03/model',candidateSha256=sha(model),runtimeRevision='phase54-v5')
            save(audit / 'protocol.json',protocol); save(audit / 'runtime-freeze.json',dict(runtime={},harness={}))
            save(base / 'league-state.json',dict(championGeneration=0,championSha256=sha(historical),hallOfFame=[],promotionHistory=[]))
            save(audit / 'promotion-gates.json',dict(generation=3,protocolSha256=sha(audit / 'protocol.json'),modelSha256=sha(model),pureWins=41,searchWins=43,gates={name:True for name in target.REQUIRED_GATES}))
            with patch.object(target,'DIR',base),patch.object(target,'verify_runtime_contract'):
                self.assertTrue(target.promote()['promoted'])
            self.assertEqual(historical.read_bytes(),b'original')
            self.assertEqual((base / 'dual-v2-champion.bin').read_bytes(),b'candidate')
            self.assertEqual(read(base / 'league-state.json')['championGeneration'],3)

    def test_failed_or_missing_gate_preserves_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); audit = base / 'phase54-audit'; model = base / 'generations/gen_03/model.bin'
            model.parent.mkdir(parents=True); model.write_bytes(b'candidate')
            protocol = dict(candidateGeneration=3,candidateModel='generations/gen_03/model',candidateSha256=sha(model),runtimeRevision='phase54-v5')
            save(audit / 'protocol.json',protocol); save(audit / 'runtime-freeze.json',dict(runtime={},harness={}))
            state = dict(championGeneration=0,championSha256='原冠军',hallOfFame=[],promotionHistory=[])
            save(base / 'league-state.json',state)
            summary = dict(generation=3,protocolSha256=sha(audit / 'protocol.json'),modelSha256=sha(model),pureWins=41,searchWins=42,gates={name:True for name in target.REQUIRED_GATES})
            summary['gates']['search43Plus'] = False; save(audit / 'promotion-gates.json',summary)
            with patch.object(target,'DIR',base),patch.object(target,'verify_runtime_contract'):
                self.assertFalse(target.promote()['promoted'])
                self.assertEqual(read(base / 'league-state.json'),state)
                summary['gates'].pop('engineering60'); save(audit / 'promotion-gates.json',summary)
                with self.assertRaises(AssertionError): target.promote()
                self.assertEqual(read(base / 'league-state.json'),state)


if __name__ == '__main__': unittest.main()
