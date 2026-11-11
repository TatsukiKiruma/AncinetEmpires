"""无需反序列化对象，检查 PyTorch ZIP 的字段与张量存储身份。"""
import pathlib,zipfile,pickletools,hashlib,json,collections
OUT=pathlib.Path(__file__).resolve().parent
R=OUT.parent/'r7_training_stage_20261014_083500'
rows=[]
for p in (R/'artifacts/models').glob('*.pt'):
    with zipfile.ZipFile(p) as z:
        names=z.namelist(); pk=next(n for n in names if n.endswith('/data.pkl'))
        strings=[arg for op,arg,pos in pickletools.genops(z.read(pk)) if op.name in ('BINUNICODE','SHORT_BINUNICODE','UNICODE')]
        storage={n.split('/data/',1)[1]:hashlib.sha256(z.read(n)).hexdigest() for n in names if '/data/' in n}
        rows.append({'file':p.name,'fields':[s for s in strings if s in ['model_state_dict','optimizer_state_dict','scheduler_state_dict','update','init_mode','seed','val_top1','val_loss','rng_state','random_state','numpy_rng_state','torch_rng_state']], 'tensorStorageHash':hashlib.sha256(json.dumps(storage,sort_keys=True).encode()).hexdigest(),'storageCount':len(storage)})
(OUT/'checkpoint_results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(rows,ensure_ascii=False,indent=2))
