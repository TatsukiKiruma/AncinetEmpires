"""供SSH或Mac本地查看中文训练状态，不启动任务或取回成果。"""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
path=ROOT/'work/training/PROGRESS.json'
if path.exists():
    value=json.loads(path.read_text('utf-8'))
    print(f"训练状态：{value['message']}\n累计更新：{value['update']} / {value['targetUpdates']}\n累计样本：{value['samples']}")
    for name in ['LATEST.json','RESOURCE.json','COMPLETE.json','BLOCKED.json','CONTROLLER_BLOCKED.json']:
        file=ROOT/'work/training'/name
        if file.exists():print(name+'\n'+file.read_text('utf-8'))
else:print('训练尚在启动，请稍候。')
