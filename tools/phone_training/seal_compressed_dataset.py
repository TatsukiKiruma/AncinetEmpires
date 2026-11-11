import atexit,ctypes,datetime,hashlib,json,pathlib,shutil,subprocess,sys,tarfile

# 对全部新增文件做最终交叉核验，并封装清单、索引、源码和验收证据。
sys.stdout.reconfigure(encoding='utf8')
if sys.platform=='win32':
 # 封装过程也临时保持电脑唤醒，进程结束时自动释放，不改电源方案。
 guard=ctypes.windll.kernel32.SetThreadExecutionState;guard.argtypes=[ctypes.c_uint];guard.restype=ctypes.c_uint
 if not guard(0x80000001):raise RuntimeError('无法保持电脑唤醒')
 atexit.register(guard,0x80000000)
p=pathlib.Path('captures/phone-compressed-2000-20261015');old=pathlib.Path('captures/phone-storage-1000-20261015')
read=lambda f:json.loads(f.read_text(encoding='utf8'))
report_path=p/'3000局最终验收.json';report=read(report_path)
assert report['all_checks_passed'] and report['total_games']==3000
expected={}
for f in sorted(p.glob(p.name+'-batch-*.validation.json')):
 v=read(f);assert v['all_equal']
 for name,digest in v['sha256'].items():
  if name in expected:raise RuntimeError('归档重复文件 '+name)
  expected[name]=digest
assert len(expected)==report['new_transfer_files_checked']
adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
root='/data/user/0/net.toyknight.aeii.android/files/.aeii/'+p.name
args=[adb,'-s','c2357770']
r=subprocess.run(args+['shell',f'su -c "find {root} -type f -exec sha256sum {{}} +"'],capture_output=True,timeout=600)
if r.returncode:raise RuntimeError(r.stderr.decode('utf8',errors='replace'))
(p/'final-phone-file-sha256.txt').write_bytes(r.stdout)
phone={}
for line in r.stdout.decode('utf8').splitlines():
 digest,name=line.split(None,1);name=name.strip()
 if not name.startswith(root+'/'):raise RuntimeError('摘要路径超出目标目录')
 phone[name[len(root)+1:]]=digest
certificate={'time':datetime.datetime.now().isoformat(),'phone_files':len(phone),'archive_files':len(expected),'mismatches':[n for n in expected if n in phone and expected[n]!=phone[n]],'missing_on_phone':sorted(set(expected)-set(phone)),'unexpected_on_phone':sorted(set(phone)-set(expected)),'all_equal':phone==expected}
(p/'final-phone-transfer-validation.json').write_text(json.dumps(certificate,ensure_ascii=False,indent=2),encoding='utf8')
assert certificate['all_equal'],'最终手机与电脑文件集合或摘要不一致'
report['final_phone_files_equal']=True;report['final_phone_files_checked']=len(phone)
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
live=read(p/'live-run.json');live.update(status='3000局采集及数据核验完成',verified_new_games=2000,current_batch=20,generated_current_batch=100,time=datetime.datetime.now().isoformat())
(p/'live-run.json').write_text(json.dumps(live,ensure_ascii=False,indent=2),encoding='utf8')
source=[f for f in pathlib.Path('tools/phone_training').iterdir() if f.suffix in ('.py','.js','.ts')]
source += [pathlib.Path('ai_training/tools/sd_training_state_generator.ts'),pathlib.Path('ai_training/training_configs/sd_training_plan_20260705.json')]
source_hashes={f.as_posix():hashlib.file_digest(f.open('rb'),'sha256').hexdigest() for f in source}
(p/'final-source-sha256.json').write_text(json.dumps(source_hashes,indent=2),encoding='utf8')
report['final_source_sha256']=source_hashes
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
files=[f for f in p.iterdir() if f.is_file() and f.suffix in ('.json','.jsonl','.md','.txt')]
files += [old/name for name in ('manifest.json','identity.json','final-source-sha256.json','lossless-compression-verification.json','training-metadata-verification.json','transfer-validation.json','storage-report.json')]
paths={f.relative_to('captures').as_posix():f for f in files}
paths.update({'source/'+f.as_posix():f for f in source})
dest=p/'training-metadata-final.tar.gz';partial=p/'training-metadata-final.tar.gz.partial'
if dest.exists() or partial.exists():raise RuntimeError('元数据归档已存在，保留原文件并停止覆盖')
hashes={name:hashlib.file_digest(f.open('rb'),'sha256').hexdigest() for name,f in paths.items()}
with tarfile.open(partial,'w:gz',compresslevel=1) as t:
 for name,f in sorted(paths.items()):t.add(f,arcname=name)
checked={}
with tarfile.open(partial,'r:gz') as t:
 for m in t:
  if m.isfile():checked[m.name]=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()
assert checked==hashes,'元数据归档内容摘要不一致'
partial.rename(dest)
seal={'all_equal':True,'files':len(checked),'archive_sha256':hashlib.file_digest(dest.open('rb'),'sha256').hexdigest(),'sha256':checked}
(p/'final-metadata-verification.json').write_text(json.dumps(seal,ensure_ascii=False,indent=2),encoding='utf8')
disk=shutil.disk_usage('C:/')
storage={'time':datetime.datetime.now().isoformat(),'pc_free_bytes':disk.free,'pc_dataset_folder_bytes_before_storage_report':{d.name:sum(f.stat().st_size for f in d.rglob('*') if f.is_file()) for d in (old,p)},'final_phone_files_checked':len(phone),'metadata_archive_bytes':dest.stat().st_size}
raw=subprocess.check_output(args+['shell',f'su -c "df -k /data; du -sk {root}; du -sk /data/local/tmp/aeii-compressed-transfers-20261015; dumpsys battery"'],timeout=60).decode('utf8')
storage['phone_final_raw']=raw
(p/'final-storage.json').write_text(json.dumps(storage,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'final_phone_files_equal':True,'phone_files':len(phone),'metadata_files':len(checked),'metadata_bytes':dest.stat().st_size,'pc_free_bytes':disk.free}))
