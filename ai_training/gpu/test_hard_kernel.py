"""困难评分GPU内核的边界、舍入和真实计算设备检查。"""
import math
import random
import unittest
import torch
from hard_kernel import calculate, validate


def reference(request):
    def rounded(x):
        return math.floor((x + 2.220446049250313e-16) * 100 + .5) / 100
    result = dict(enemy=[], ally=[], landing=[])
    for p, defense in zip(request['positions'], request['defenses']):
        def distance(points, count=None):
            denominator = len(points) if count is None else count
            return rounded(sum(abs(p[0]-q[0])+abs(p[1]-q[1]) for q in points)/denominator) if denominator else 0.
        enemy = distance(request['enemyPositions'])
        ally = distance(request['allyPositions'])
        gap = rounded(distance(request['landingPositions'], request['landingCount']) - enemy)
        terrain = defense - 10
        if gap > 0:
            score = -(gap - (request['situation'] if request['situation'] is not None else 1) + 1) * request['unitValue']/10 + terrain*2
        elif gap >= -1:
            score = gap*10 + terrain*2
        elif gap >= -2:
            score = (gap + request['maxRange'] - 1)*10 + terrain
        else:
            score = 0.
        for key, value in dict(enemy=enemy, ally=ally, landing=score).items():
            result[key].append(value)
    return result


class HardKernelTests(unittest.TestCase):
    def requests(self):
        rng = random.Random(20261029)
        for i in range(64):
            points = lambda n: [[rng.randrange(40), rng.randrange(40)] for _ in range(n)]
            n = [1, 7, 64, 137][i % 4]
            landing = points(i % 19)
            yield dict(positions=points(n), enemyPositions=points(i % 23), allyPositions=points(i % 17),
                       landingPositions=landing, landingCount=len(landing)+1, defenses=[rng.randrange(50) for _ in range(n)],
                       unitValue=rng.randrange(3000), maxRange=i % 8, situation=None if i % 5 == 0 else rng.random()*4)

    def compare(self, function):
        for request in self.requests():
            validate(request)
            actual, expected = function(request), reference(request)
            for key in expected:
                for a, b in zip(actual[key], expected[key]):
                    self.assertTrue(math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-10), (key, a, b))

    def test_cpu_tensor_reference_and_empty_groups(self):
        self.compare(lambda r: calculate(r, torch.device('cpu')))

    @unittest.skipUnless(torch.cuda.is_available() and torch.version.hip, 'ROCm GPU不可用，不能标记GPU通过')
    def test_fused_hip_reference(self):
        from hard_hip import HipScores
        torch.empty(1, device='cuda')
        backend = HipScores(torch.device('cuda:0'))
        self.compare(backend.calculate)

    def test_reject_invalid_denominator_and_nonfinite(self):
        request = next(self.requests())
        request['landingCount'] = 0
        with self.assertRaises(ValueError): validate(request)
        request['landingCount'] = 1
        request['unitValue'] = math.nan
        with self.assertRaises(ValueError): validate(request)


if __name__ == '__main__':
    unittest.main()
