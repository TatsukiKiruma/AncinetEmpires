import unittest
from cycle_classification import periodic_suffix, classify

class CycleClassificationTest(unittest.TestCase):
    def test_repeated_cycle(self):
        result=periodic_suffix(list('abcd')*1500)
        self.assertEqual(result['period'],4)
        self.assertEqual(result['span'],6000)

    def test_cycle_broken_at_end(self):
        self.assertIsNone(periodic_suffix(list('abcd')*1499+list('WXYZ')))

    def test_short_repeated_tail_is_insufficient(self):
        self.assertIsNone(periodic_suffix(list(range(5500))+[1]*500))

    def test_same_board_with_changing_resources_is_not_confirmed_combat_cycle(self):
        rows=[dict(index=i,state_sha256=str(i),board_sha256=str(i%4),action_signature=str(i%4),action_type='ATTACK' if i%4 else 'NEXT_TURN',gold=[i]) for i in range(6000)]
        result=classify(rows)
        self.assertFalse(result['confirmed'])
        self.assertEqual(result['classification'],'suspected_board_cycle')

    def test_inert_cycle_can_be_confirmed_despite_accumulating_gold(self):
        rows=[dict(index=i,state_sha256=str(i),board_sha256=str(i%4),action_signature=str(i%4),action_type='STANDBY' if i%2 else 'NEXT_TURN',gold=[i]) for i in range(6000)]
        self.assertTrue(classify(rows)['confirmed'])

    def test_discontinuous_trace_is_rejected(self):
        with self.assertRaises(ValueError):
            classify([{'index':1},{'index':3}])

    def test_within_turn_noop_cycle_is_confirmed(self):
        rows=[dict(index=i,state_sha256='same',board_sha256='same',action_signature='same',action_type='ATTACK',gold=[100],turn=12) for i in range(6000)]
        self.assertTrue(classify(rows)['confirmed'])

    def test_repeated_positions_with_different_actions_are_not_confirmed(self):
        rows=[dict(index=i,state_sha256=str(i%4),board_sha256=str(i%4),action_signature=str(i),action_type='ATTACK',gold=[100],turn=i//4) for i in range(6000)]
        self.assertFalse(classify(rows)['confirmed'])

if __name__=='__main__':
    unittest.main()
