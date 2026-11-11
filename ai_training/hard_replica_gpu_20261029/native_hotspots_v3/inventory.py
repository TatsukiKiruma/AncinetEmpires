"""只盘点真实目录，不穿过支持联接或读取账号配置。"""
import json
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def scan(directory):
    size=count=0;largest=[];pending=[directory]
    while pending:
        current=pending.pop()
        try:
            for item in os.scandir(current):
                info=item.stat(follow_symlinks=False)
                if getattr(info,'st_file_attributes',0)&0x400:continue
                if item.is_dir(follow_symlinks=False):pending.append(Path(item.path))
                elif item.is_file(follow_symlinks=False):size+=info.st_size;count+=1;largest.append((info.st_size,str(Path(item.path).relative_to(ROOT))))
        except PermissionError:continue
    return dict(path=str(directory.relative_to(ROOT)),logicalBytes=size,files=count,largest=sorted(largest,reverse=True)[:12])
rows=[scan(p) for p in (ROOT/'ai_training').iterdir() if p.is_dir() and not p.is_junction() and not p.is_symlink()]
out=Path(__file__).with_name('DISK_INVENTORY.json');out.write_text(json.dumps(sorted(rows,key=lambda r:r['logicalBytes'],reverse=True),indent=2),encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['path','logicalBytes','files']} for r in sorted(rows,key=lambda r:r['logicalBytes'],reverse=True)[:15]]))
