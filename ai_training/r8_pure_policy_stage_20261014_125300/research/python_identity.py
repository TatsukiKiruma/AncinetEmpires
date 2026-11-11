"""交付时核验独立解释器和包身份，明确观测时点。"""
import sys,pathlib,json,hashlib,time,torch,numpy as np
S=pathlib.Path(__file__).resolve().parents[1]
def sha(p):
    h=hashlib.sha256()
    with pathlib.Path(p).open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
initial=json.loads((S/'identity/runtime.json').read_text(encoding='utf8'));assert initial['torch']==torch.__version__ and initial['numpy']==np.__version__
paths=[pathlib.Path(sys.executable),pathlib.Path(sys._base_executable),pathlib.Path(sys.base_prefix)/f'python{sys.version_info.major}{sys.version_info.minor}.dll',pathlib.Path(torch.__file__),pathlib.Path(np.__file__)]
out={'observedUnix':time.time(),'observation':'交付核验；起始版本另见runtime.json，未伪称此文件在训练前生成','executable':sys.executable,'baseExecutable':sys._base_executable,'pythonVersion':sys.version,'torch':torch.__version__,'numpy':np.__version__,'cuda':torch.cuda.is_available(),'files':{str(p):sha(p) for p in paths if p.exists()},'packageFileHashes':'交付全文件索引包含tmp/venv；requirements-lock.txt固定安装版本'}
(S/'identity/python_runtime.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');print('解释器及包版本身份核验通过')
