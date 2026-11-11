"""阶段5训练定义，策略复用已审计结构，Value使用新的纯状态摘要。"""
import os,sys,importlib.util
os.environ.setdefault('OMP_NUM_THREADS','4')
os.environ.setdefault('MKL_NUM_THREADS','4')
sys.dont_write_bytecode=True
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('stage4',HERE.parent/'tactical_value_search_20261018/train.py')
stage4=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage4)
for name in ['np','torch','nn','F','DT','stage3','base','layout','read','collate','batches','make_policy','contexts','token_batch','stage','auc','value_metrics','Policy','Value','TYPES','gtype']:
    globals()[name]=getattr(stage4,name)
# 历史模块只有函数定义；将本轮输出路径定位到新目录，不修改历史文件。
stage4.HERE=HERE
sys.modules['stage5_training']=sys.modules[__name__]
res=importlib.util.spec_from_file_location('stage4Residual',HERE.parent/'tactical_value_search_20261018/residual_value.py')
stage4Residual=importlib.util.module_from_spec(res)
# residual_value的通配导入复用本模块定义。
sys.modules.setdefault('train',sys.modules[__name__])
res.loader.exec_module(stage4Residual)
def save(n,v):
    import json
    p=HERE/n;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(v,ensure_ascii=False,allow_nan=False),encoding='utf-8')
def evaluate(p,files,s):
    original=stage3.batches;stage3.batches=lambda files,s:batches(files,s)
    try:return stage3.evaluate(p,files,s)
    finally:stage3.batches=original
