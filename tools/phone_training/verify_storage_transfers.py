import hashlib,json,pathlib,subprocess,tarfile

# 将电脑归档逐文件摘要与手机原始文件比较，避免只验证手机内回放。
p=pathlib.Path('C:/code/AncinetEmpires/captures/phone-storage-1000-20261015')
root='/data/user/0/net.toyknight.aeii.android/files/.aeii/phone-storage-1000-20261015'
adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
r=subprocess.run([adb,'-s','c2357770','shell',f'su -c "find {root} -type f -exec sha256sum {{}} +"'],capture_output=True,timeout=600)
if r.returncode:raise RuntimeError(r.stderr.decode('utf8',errors='replace'))
(p/'phone-file-sha256.txt').write_bytes(r.stdout)
phone={line.split(None,1)[1].strip()[len(root)+1:]:line.split(None,1)[0] for line in r.stdout.decode('utf8').splitlines() if line.strip()}
checked={};errors=[]
for path in sorted(p.glob('phone-storage-1000-20261015-batch-*.tar')):
 with tarfile.open(path) as t:
  for member in t:
   if not member.isfile():continue
   h=hashlib.file_digest(t.extractfile(member),'sha256').hexdigest();checked[member.name]=h
   if h!=phone.get(member.name):errors.append(member.name)
missing=sorted(set(phone)-set(checked))
report={'phone_files':len(phone),'archive_files':len(checked),'mismatches':errors,'missing_in_archives':missing,'all_equal':not errors and not missing,'sha256':checked}
(p/'transfer-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='sha256'}))
if not report['all_equal']:raise RuntimeError('手机文件与电脑归档不一致，保留证据并停止交付')
