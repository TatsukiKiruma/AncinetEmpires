"""真实CLI只读预检护栏：任何CUDA惰性初始化尝试都会使检查失败。"""
from pathlib import Path
import runpy
import sys
from unittest.mock import patch

import torch

attempts = []


def reject_gpu(*args, **kwargs):
    attempts.append(True)
    raise AssertionError('本轮只读代码验证禁止CUDA初始化')


if __name__ == '__main__':
    sys.argv[0] = str(Path(__file__).with_name('train.py'))
    try:
        with patch.object(torch.cuda, '_lazy_init', reject_gpu):
            runpy.run_path(sys.argv[0], run_name='__main__')
    finally:
        print('GPU_LAZY_INIT_ATTEMPTS=' + str(len(attempts)), file=sys.stderr)
