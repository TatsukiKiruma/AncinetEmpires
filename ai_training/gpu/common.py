"""复用现有2M网络，统一设备、模型导入和证据写入。"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import torch
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
# 将编译缓存限定在训练工作区，避免依赖用户目录的写权限。
for _name, _folder in [('MIOPEN_USER_DB_PATH', 'miopen-db-clean'), ('MIOPEN_CUSTOM_CACHE_DIR', 'miopen-cache-clean')]:
    _cache = ROOT / 'ai_training/gpu/runs' / _folder
    _cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault(_name, str(_cache))
MODEL_DIR = ROOT / 'ai_training/expert_iteration_2m_20261022'
_paths = sys.path[:]
_spec = importlib.util.spec_from_file_location('gpu_authoritative_model', MODEL_DIR / 'model.py')
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
DualStreamModel = _module.DualStreamModel
sys.path[:] = _paths


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    path = Path(path)
    pending = path.with_suffix(path.suffix + '.pending')
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    pending.replace(path)


def device_for(name):
    if name == 'auto':
        name = 'cuda' if torch.cuda.is_available() else 'cpu'
    device = torch.device(name)
    if device.type == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('GPU不可用：请安装匹配显卡的PyTorch；显式GPU请求不回退CPU')
    return device


def synchronize(device):
    if device.type == 'cuda':
        torch.cuda.synchronize(device)


def move(batch, device):
    return {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}


def load_model(prefix=None, seed=20261024):
    model = DualStreamModel(seed=seed).accurate_reductions(False)
    if prefix:
        prefix = Path(prefix)
        meta = json.loads(prefix.with_suffix('.json').read_text('utf-8'))
        if meta['model'] != 'dual-stream-v3-2m-v1' or meta['parameters'] != 1966910:
            raise ValueError('必须使用完整2M模型')
        raw = np.frombuffer(prefix.with_suffix('.bin').read_bytes(), dtype='<f4')
        model.load_state_dict({e['name']: torch.from_numpy(raw[e['offset']:e['offset'] + e['length']].copy().reshape(e['shape'])) for e in meta['tensors']})
    return model


def identity(device):
    return dict(torch=torch.__version__, hip=torch.version.hip, cuda=torch.version.cuda,
                device=str(device), name=torch.cuda.get_device_name(device) if device.type == 'cuda' else 'CPU',
                sources={str(p.relative_to(ROOT)): sha(p) for p in [MODEL_DIR / 'model.py', ROOT / 'ai_training/dual_stream_v2_phase2_20261020/accurate_ops.py', *Path(__file__).parent.glob('*.py')]})
