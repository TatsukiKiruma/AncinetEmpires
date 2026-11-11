"""复用已验证同步worker实现，加入各worker的完整RNG保存/恢复。"""
from pathlib import Path
import shutil

HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'phone_2m_workers_20261024/train_workers.py'

text=SOURCE.read_text(encoding='utf-8')
text=text.replace('def worker(pipe, rank, shared, protocol):','def worker(pipe, rank, shared, protocol, restore_rng=None):')
anchor="        model.train()\n        pipe.send({'ready': True"
assert text.count(anchor)==1
text=text.replace(anchor,"        model.train()\n        if restore_rng is not None:\n            random.setstate(restore_rng['python']); np.random.set_state(restore_rng['numpy']); torch.set_rng_state(torch.from_numpy(restore_rng['torch']))\n        pipe.send({'ready': True")
anchor="'computeSeconds': time.monotonic() - started})"
assert text.count(anchor)==1
text=text.replace(anchor,"'computeSeconds': time.monotonic() - started, 'rng': {'python':random.getstate(),'numpy':np.random.get_state(),'torch':torch.get_rng_state().numpy().copy()}})")
anchor="'threads': torch.get_num_threads()})"
assert text.count(anchor)==1
text=text.replace(anchor,"'threads': torch.get_num_threads(), 'rngDigest': base.rng_digest(base.rng_state())})")
(HERE/'workers_runtime.py').write_text(text,encoding='utf-8',newline='\n')
