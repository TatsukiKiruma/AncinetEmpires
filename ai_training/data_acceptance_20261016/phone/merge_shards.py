"""合并同一源码身份的独立父局分片；引用已有压缩分片，不复制大文件。"""
import argparse
import json
import os
import shutil
from pathlib import Path

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dest',default='full_v6')
parser.add_argument('--sources',nargs='+',default=['shard_a_v6','shard_b_v6','shard_c_v6','shard_d_v6','shard_e_v6','shard_f_v6','shard_g_v6','shard_h_v6'])
parser.add_argument('--parent-ids',default='',help='只引用指定父局，供空闲槽位恢复同一冻结来源')
args=parser.parse_args()
dest=(HERE/args.dest).resolve()
sources=[(HERE/name).resolve() for name in args.sources]
if not dest.is_relative_to(HERE) or any(not s.is_relative_to(HERE) for s in sources):
    raise RuntimeError('分片合并路径越过本研究phone目录')
parents=set(args.parent_ids.split(',')) if args.parent_ids else None
if not (dest/'source-identity.json').exists():
    seed=next((s/'source-identity.json' for s in sources if (s/'source-identity.json').exists()),None)
    if seed is None:raise RuntimeError('没有可验证身份的来源，拒绝初始化分片')
    dest.mkdir(parents=True,exist_ok=True)
    with (dest/'source-identity.json').open('xb') as stream:stream.write(seed.read_bytes())
for directory in ['receipts','configs','candidate_shards']:(dest/directory).mkdir(exist_ok=True)
fingerprint=json.loads((dest/'source-identity.json').read_text())['sourceId']
linked=0
for source in sources:
    if not (source/'source-identity.json').exists():continue
    assert json.loads((source/'source-identity.json').read_text())['sourceId']==fingerprint
    for receipt in (source/'receipts').glob('*.json'):
        target=dest/'receipts'/receipt.name
        if target.exists():continue
        row=json.loads(receipt.read_text(encoding='utf8'))
        if parents is not None and row['parentId'] not in parents:continue
        shard=Path(row['candidateShard'])
        if (dest/(str(shard)+'.partial')).exists():continue
        cp=source/'configs'/(row['parentId']+'.bin')
        new_config=dest/'configs'/cp.name
        if not new_config.exists():shutil.copyfile(cp,new_config)
        row['candidateShard']=os.path.relpath(source/shard,dest).replace('\\','/')
        row['mergedFrom']=str(receipt.relative_to(HERE)).replace('\\','/')
        # Windows rename不覆盖已存在文件；临时文件完整关闭后再发布，主遍历不会看到半份JSON。
        temporary=target.with_suffix('.merge.tmp')
        temporary.write_text(json.dumps(row,ensure_ascii=False),encoding='utf8')
        try:os.rename(temporary,target);linked+=1
        except FileExistsError:pass
print(json.dumps({'linked_receipts':linked,'total_dest_receipts':len(list((dest/'receipts').glob('*.json')))},ensure_ascii=False))
