"""保存均衡采样分支相对基础训练器的完整可审阅差异。"""
import pathlib,difflib
S=pathlib.Path(__file__).resolve().parents[1]
a=(S/'research/train.py').read_text(encoding='utf-8-sig').splitlines(True);b=(S/'research/train_balanced.py').read_text(encoding='utf-8-sig').splitlines(True)
(S/'evidence/train_balanced_source.diff').write_text(''.join(difflib.unified_diff(a,b,fromfile='research/train.py',tofile='research/train_balanced.py')),encoding='utf8')

