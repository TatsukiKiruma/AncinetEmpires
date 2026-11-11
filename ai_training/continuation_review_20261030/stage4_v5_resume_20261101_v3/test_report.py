import unittest
from report import teacher_valid


class TeacherAuditTests(unittest.TestCase):
    def test_masks_and_anchored_temperature_distribution(self):
        row = {'actionCodes': ['a', 'b', 'c'], 'qValues': [.4, .6, None], 'anchoredScores': [.2, .2, None],
               'evaluatedMask': [True, True, False], 'vetoMask': [False, False, False],
               'probabilities': [.5, .5, 0], 'available': True, 'temperature': .15}
        self.assertTrue(teacher_valid(row))
        self.assertFalse(teacher_valid({**row, 'probabilities': [.6, .4, 0]}))
        self.assertFalse(teacher_valid({**row, 'anchoredScores': [.2, .2, .2]}))
        self.assertFalse(teacher_valid({**row, 'probabilities': [.4, .5, .1]}))

    def test_unavailable_is_zero_distribution(self):
        row = {'actionCodes': ['a'], 'qValues': [None], 'anchoredScores': [None], 'evaluatedMask': [False],
               'vetoMask': [False], 'probabilities': [0], 'available': False, 'temperature': .15}
        self.assertTrue(teacher_valid(row))
        self.assertFalse(teacher_valid({**row, 'probabilities': [1]}))


if __name__ == '__main__':
    unittest.main()
