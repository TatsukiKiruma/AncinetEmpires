"""验证束搜索目标不会把未探索动作压成负例，以及Value屏蔽合同。"""
import copy
from unittest.mock import patch
import torch
import train
from verify_model import frames


def test_search_target_has_no_unexplored_negative_gradient():
    sample=copy.deepcopy(next(frames(train.DIR/'fixtures.frames')))
    sample['source']['prior']=[0.]*len(sample['pointers'])
    sample['source']['searchTarget']=[dict(index=0,score=.5),dict(index=1,score=.2)]
    sample['valueMask'].zero_()
    logits=torch.zeros(1,len(sample['pointers']),requires_grad=True)
    value=torch.zeros(1,6,requires_grad=True)
    output=dict(logits=logits,valueLogits=value,valueProbs=value.softmax(-1))
    with patch.object(train,'forward_batch',return_value=output):
        objective,metrics=train.loss(None,[sample]);objective.backward()
    assert metrics['valueSamples']==0
    assert logits.grad[0,:2].abs().sum()>0
    assert logits.grad[0,2:].abs().sum()==0
    assert value.grad.abs().sum()==0
