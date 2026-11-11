"""复用冻结网络、开发夹具及封存离线实现，不推进优化器。"""
import argparse
import json
from pathlib import Path
import shutil
import struct
from context import HERE, S3, ROOT, DATA, core, read, sha, save_new, validate


def references(update, prefix):
    torch = core.torch
    torch.set_num_threads(2)
    raw = (core.STAGE1/'parity.frames').read_bytes()
    folder = DATA/f'parity-{update}'
    folder.mkdir(exist_ok=False)
    (folder/'parity.frames').write_bytes(raw)
    from data import decode
    model = core.legacy.load_model(Path(prefix)).accurate_reductions().eval()
    result = []
    offset = 0
    with torch.no_grad():
        while offset < len(raw):
            ms,bs = struct.unpack_from('<II',raw,offset)
            offset += 8
            meta = json.loads(raw[offset:offset+ms]); offset += ms
            payload = raw[offset:offset+bs]; offset += bs
            for row in decode(dict(meta,sources=[{}]),payload):
                outputs = model(row)
                result.append(dict(id=len(result),outputs={key:outputs[key].tolist() for key in ['logits','valueLogits','valueProbs']}))
    save_new(folder/'reference.json',result)
    print(json.dumps(dict(update=update,samples=len(result),modelSha256=sha(Path(prefix).with_suffix('.bin')))))


def sealed(prefix, destination):
    import offline
    # 只重绑定本次缓存目录，编码、mask、分层、前向和统计直接调用原冻结实现。
    offline.DATA = DATA
    core.torch.set_num_threads(2)
    result = offline.evaluate(Path(prefix),Path(destination),core.legacy.device_for('cuda:0'),True)
    print(json.dumps(dict(samples=result['samples'],seconds=result['seconds'],sealed=True)))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['references','sealed'])
    parser.add_argument('--update',type=int)
    parser.add_argument('--model',required=True)
    parser.add_argument('--out')
    args=parser.parse_args()
    validate()
    if args.action=='references':
        references(args.update,args.model)
    else:
        assert (DATA/'FINAL_TEST_ATTEMPT.json').exists()
        sealed(args.model,args.out)
