"""为指定正式检查点生成独立跨语言参考，不更新参数。"""
import argparse
import json
import torch
from train import load_initial, DIR
from verify_model import frames


def main():
    p=argparse.ArgumentParser();p.add_argument('prefix');args=p.parse_args()
    torch.set_num_threads(4);torch.set_num_interop_threads(1)
    model=load_initial(args.prefix).eval().accurate_reductions()
    reference=[]
    with torch.no_grad():
        for sample in frames(DIR/'fixtures.frames'):
            out=model(sample);reference.append(dict(id=sample['source']['id'],outputs={k:out[k].tolist() for k in ['logits','actorPrior','conditionalPrior','valueLogits','valueProbs']}))
    from pathlib import Path
    Path(args.prefix+'-reference.json').write_text(json.dumps(reference),'utf-8')


if __name__=='__main__':main()
