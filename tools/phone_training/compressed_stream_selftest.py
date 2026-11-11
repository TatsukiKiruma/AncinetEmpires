import ast,gzip,io,json,pathlib,struct,tarfile

# 单独加载流验证函数，用损坏样本检查它能拒绝截断、CRC错误和索引错误。
source=pathlib.Path(__file__).with_name('compressed_controller.py')
tree=ast.parse(source.read_text(encoding='utf8'));function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='verify_streams')
namespace={'gzip':gzip,'json':json,'struct':struct,'tarfile':tarfile}
exec(compile(ast.Module(body=[function],type_ignores=[]),str(source),'exec'),namespace)
verify=namespace['verify_streams']
state=gzip.compress(struct.pack('>i',3)+b'abc');action=gzip.compress(b'{"index":0,"fields":{}}\n')
cases=[('完整',state,action,True),('状态截断',gzip.compress(struct.pack('>i',4)+b'abc'),action,False),('CRC损坏',state[:-8]+bytes([state[-8]^1])+state[-7:],action,False),('动作索引错误',state,gzip.compress(b'{"index":1}\n'),False),('状态缺失',gzip.compress(b''),action,False)]
results=[]
temp=pathlib.Path('captures/phone-compressed-2000-20261015/validator-fixtures');temp.mkdir(exist_ok=True)
if True:
 for i,(label,s,a,expected) in enumerate(cases):
  path=pathlib.Path(temp)/f'{i}.tar.gz'
  with tarfile.open(path,'w:gz') as t:
   for name,data in [('s1001/states.bin.gz',s),('s1001/actions.jsonl.gz',a)]:
    info=tarfile.TarInfo(name);info.size=len(data);t.addfile(info,io.BytesIO(data))
  try:verify(path,[{'id':'s1001','actions':1}]);passed=True
  except Exception:passed=False
  if passed!=expected:raise RuntimeError('验证器自检失败 '+label)
  results.append({'case':label,'accepted':passed,'expected':expected})
pathlib.Path('captures/phone-compressed-2000-20261015/stream-validator-selftest.json').write_text(json.dumps({'all_passed':True,'cases':results},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'all_passed':True,'cases':len(results)}))
