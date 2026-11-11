"""第4代选择门禁必须同时保护热启动策略和冠军语义分布。"""
import copy
import unittest
from gen4_dev_gates import dev_gates


class Gen4SelectionTests(unittest.TestCase):
    def setUp(self):
        self.protocol = dict(devGates=dict(protectedHeads=[1,2,7,5,11],protectedRatio=[.8,1.2],headTop1RegressionTolerance=0.,wastedWaitMax=2))
        self.champion = dict(headTop1=.84,counts={str(i):100 for i in [1,2,7,5,11]})
        self.warm = dict(headTop1=.86,counts={str(i):120 for i in [1,2,7,5,11]},samplesSha256='固定开发样本')
        self.candidate = dict(headTop1=.86,counts={i:100 for i in [1,2,7,5,11]},samplesSha256='固定开发样本',maxValueLogitsDifference=0.,waitWithAnyUnmovedOpportunity=2)

    def test_high_accuracy_cannot_hide_wasted_wait(self):
        self.candidate.update(headTop1=.9,waitWithAnyUnmovedOpportunity=3)
        gates,_,_ = dev_gates(self.candidate,self.warm,self.champion,self.protocol)
        self.assertTrue(gates['headTop1']); self.assertFalse(gates['wastedWait']); self.assertFalse(all(gates.values()))

    def test_champion_distribution_cannot_hide_warm_regression(self):
        self.candidate['counts'][1] = 90
        gates,_,_ = dev_gates(self.candidate,self.warm,self.champion,self.protocol)
        self.assertTrue(gates['protectedHeadCounts']); self.assertFalse(gates['protectedWarmCounts'])

    def test_changed_dev_or_value_never_qualifies(self):
        gates,_,_ = dev_gates(self.candidate,self.warm,self.champion,self.protocol); self.assertTrue(all(gates.values()))
        for field,value,gate in [('samplesSha256','另一个开发样本','fixedDevIdentity'),('maxValueLogitsDifference',1e-12,'valueLogitsExactlyEqual'),('headTop1',.85999,'headTop1')]:
            with self.subTest(field=field):
                candidate = copy.deepcopy(self.candidate); candidate[field] = value
                gates,_,_ = dev_gates(candidate,self.warm,self.champion,self.protocol); self.assertFalse(gates[gate])


if __name__ == '__main__': unittest.main()
