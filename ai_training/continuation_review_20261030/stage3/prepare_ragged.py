"""从现有权威网络批量前向生成阶段三适配，只替换空间流批处理。"""
from pathlib import Path
HERE=Path(__file__).resolve().parent
source=(HERE.parents[1]/'gpu/batch_model.py').read_text('utf-8-sig')
start=source.index('    z0 = m.map.stage0')
end=source.index('    scale = torch.ones',start)
source=source[:start]+"    fmap,gmap=map_forward(m.map,spatial,players,x['sizes'])\n"+source[end:]
source=source.replace('def collate(samples):','def base_collate(samples):',1)
source=source.replace('from torch.nn import functional as F','from torch.nn import functional as F\nfrom ragged_map import map_forward',1)
source+='''

def collate(samples):
    sizes=[tuple(s['spatial'].shape[-2:]) for s in samples]
    height=((max(h for h,w in sizes)+3)//4)*4
    width=((max(w for h,w in sizes)+3)//4)*4
    padded=[]
    for row,(h,w) in zip(samples,sizes):
        item=dict(row)
        item['spatial']=F.pad(row['spatial'],(0,width-w,0,height-h))
        ptr=row['pointers'].clone()
        tile=ptr[:,1].clone()
        ptr[:,1]=torch.where(tile>=0,(tile//w)*width+tile%w,tile)
        item['pointers']=ptr
        padded.append(item)
    out=base_collate(padded)
    out['sizes']=torch.tensor(sizes,dtype=torch.long)
    return out
'''
target=HERE/'ragged_batch.py'
if target.exists():
    raise ValueError('适配文件已存在，不能静默覆盖')
target.write_text(source,'utf-8')
print(target)
