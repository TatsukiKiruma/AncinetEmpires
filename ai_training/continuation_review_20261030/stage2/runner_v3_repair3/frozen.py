"""显式引用未修改的阶段一模块；新控制逻辑不冒充旧运行器。"""
import importlib
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent.parent / 'stage1'
ROOT = STAGE1.parents[2]
REVIEWS = STAGE1.parent / 'reviews'


def legacy(name):
    previous = sys.path[:]
    sys.path.insert(0, str(STAGE1))
    try:
        module = importlib.import_module(name)
        if Path(module.__file__).resolve().parent != STAGE1:
            raise ValueError('冻结模块被同名模块遮蔽：' + name)
        return module
    finally:
        sys.path[:] = previous


legacy_budget = legacy('budget')
legacy_contracts = legacy('contracts')


def load_runtime():
    return legacy('runtime')
