import datetime,gzip,hashlib,json,pathlib,shutil,struct,subprocess,sys,tarfile,time

def call(*parts,timeout=60):
 r=subprocess.run([adb,'-s','c2357770',*parts],capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError(r.stderr.decode('utf8',errors='replace'))
 return r.stdout.decode('utf8',errors='replace')

def shell(c,timeout=60):return call('shell',f'su -c "{c}"',timeout=timeout)

def sample(label):
 raw=shell('df -k /data; du -sk '+root+'; cat /proc/'+str(args.pid)+'/status; cat /proc/'+str(args.pid)+'/stat; cat /proc/uptime; dumpsys battery; dumpsys meminfo net.toyknight.aeii.android')
 disk=shutil.disk_usage('C:/');row={'label':label,'time':datetime.datetime.now().isoformat(),'pc_free_bytes':disk.free,'raw':raw,'minimum_start_battery':20 if args.preflight else args.min_battery}
 for line in raw.splitlines():
  if line.startswith('/dev/') and '/data' in line:row['phone_free_bytes']=int(line.split()[3])*1024
  if line.strip().startswith('level:'):row['battery_percent']=int(line.split(':')[1])
  if line.strip().startswith('temperature:'):row['battery_celsius']=int(line.split(':')[1])/10
 with (local/(run+'-resources.jsonl')).open('a',encoding='utf8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 if row.get('phone_free_bytes',0)<2*1024**3 or disk.free<3*1024**3:raise RuntimeError('空间不足，保留数据并停止调度')
 return row

def ready():
 while True:
  row=sample('before-batch')
  # 按实测供电选择批次电量下限，不修改手机的电源或Root设置。
  if row['battery_percent']>=(20 if args.preflight else args.min_battery) and row['battery_celsius']<44:return
  print(json.dumps({'stage':'waiting-power-or-temperature','battery':row['battery_percent'],'celsius':row['battery_celsius']}),flush=True)
  time.sleep(30)

def launch(jobs,workers,script,name):
 config={'outputRoot':root,'baseConfigName':base,'dynamicQueue':True,'jobs':[{'id':name+'-worker-'+str(w),'batch':jobs[w::workers]} for w in range(min(workers,len(jobs)))]}
 path=local/(run+'-active-jobs.json');path.write_text(json.dumps(config,ensure_ascii=False),encoding='utf8')
 call('push',str(source/script),'/data/local/tmp/aeii-worker.js');call('push',str(path),'/data/local/tmp/aeii-jobs.json')
 r=subprocess.run([sys.executable,str(source/'run_script.py'),str(args.pid),'launch.js','20'],capture_output=True,timeout=40)
 with (local/(run+'-launch-log.txt')).open('ab') as f:f.write(r.stdout+r.stderr)
 if r.returncode or b'"kind": "error"' in r.stdout:raise RuntimeError(r.stdout.decode('utf8',errors='replace')+r.stderr.decode('utf8',errors='replace'))

def wait_jobs(jobs,stage):
 start=time.monotonic();previous=-1;last_sample=0
 while True:
  raw=shell('find '+root+' -name result.json -o -name error.txt -o -name error.json')
  errors=[root+'/'+j['id']+'/'+e for j in jobs for e in ('error.txt','error.json') if root+'/'+j['id']+'/'+e in raw]
  if errors:raise RuntimeError('\n'.join(shell('cat '+p) for p in errors))
  count=sum(root+'/'+j['id']+'/result.json' in raw for j in jobs)
  if count!=previous:print(json.dumps({'stage':stage,'completed':count,'target':len(jobs),'seconds':round(time.monotonic()-start,1)}),flush=True);previous=count
  if count==len(jobs):return
  if time.monotonic()-last_sample>20:
   sample(stage);last_sample=time.monotonic()
  if time.monotonic()-start>1800:raise RuntimeError('批次超过30分钟，停止调度并保留数据')
  time.sleep(5)

def export(names,target):
 if not target.exists():
  partial=target.with_suffix('.gz.partial')
  # 部分Root终端会阻塞二进制管道；压缩落盘后用ADB文件协议传输。
  transfer_root='/data/local/tmp/aeii-compressed-transfers-20261015'
  remote=transfer_root+'/'+target.name
  shell('set -e; set -o pipefail; mkdir -p '+transfer_root+'; chown 2000:2000 '+transfer_root+'; chmod 0700 '+transfer_root+'; if [ ! -f '+remote+' ]; then tar -cf - -C '+root+' '+' '.join(names)+' | gzip -1 > '+remote+'.partial; chown 2000:2000 '+remote+'.partial; chmod 0600 '+remote+'.partial; mv '+remote+'.partial '+remote+'; fi',timeout=600)
  call('pull',remote,str(partial),timeout=600)
  phone_archive_sha=call('shell','sha256sum '+remote).split()[0]
  if hashlib.file_digest(partial.open('rb'),'sha256').hexdigest()!=phone_archive_sha:raise RuntimeError('压缩归档传输摘要不一致')
  # 在任何恢复操作前确认压缩容器有完整尾部。
  with gzip.open(partial,'rb') as f:
   while f.read(4*1024**2):pass
  partial.rename(target)
 # ADB旧版shell存在命令长度限制，目录前缀只写一次。
 raw=shell('cd '+root+' && find '+' '.join(names)+' -type f -exec sha256sum {} +')
 phone={l.split(None,1)[1].strip().removeprefix('./'):l.split(None,1)[0] for l in raw.splitlines() if l.strip()}
 checked={};results=[]
 with tarfile.open(target,'r:gz') as t:
  for m in t:
   if not m.isfile():continue
   h=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest();checked[m.name]=h
   if phone.get(m.name)!=h:raise RuntimeError('传输摘要不一致 '+m.name)
   if m.name.endswith('/result.json'):results.append(json.load(t.extractfile(m)))
 if checked!=phone or len(results)!=len(names):raise RuntimeError('传输文件集合或结果数量不完整')
 validation={'all_equal':True,'files':len(checked),'sha256':checked,'archive_sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest(),'bytes':target.stat().st_size}
 target.with_suffix('.validation.json').write_text(json.dumps(validation,indent=2),encoding='utf8')
 # 临时传输文件与已核验归档完全相同时及时移除，原始手机轨迹和电脑归档继续保留。
 remote='/data/local/tmp/aeii-compressed-transfers-20261015/'+target.name
 if shell('test -f '+remote+' && echo present || true').strip()=='present':
  if shell('readlink -f '+remote).strip()!=remote:raise RuntimeError('临时副本路径不一致')
  if call('shell','sha256sum '+remote).split()[0]!=validation['archive_sha256']:raise RuntimeError('临时副本摘要不一致')
  shell('rm '+remote)
  with (local/'verified-transfer-cleanup-after-export.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps({'time':datetime.datetime.now().isoformat(),'remote_temp_only':remote,'retained_archive':str(target),'sha256':validation['archive_sha256'],'bytes':validation['bytes']})+'\n')
 return results

def verify_streams(target,results):
 expected={r['id']:r['actions'] for r in results};counts={}
 with tarfile.open(target,'r:gz') as t:
  for m in t:
   if m.name.endswith('/states.bin.gz'):
    n=0;total=0
    with gzip.GzipFile(fileobj=t.extractfile(m)) as f:
     while True:
      prefix=f.read(4)
      if not prefix:break
      if len(prefix)!=4:raise RuntimeError('状态长度头损坏')
      size=struct.unpack('>i',prefix)[0]
      if size<=0 or size>64*1024**2:raise RuntimeError('非法状态长度')
      data=f.read(size)
      if len(data)!=size:raise RuntimeError('状态记录缺失')
      n+=1;total+=size+4
    ident=m.name.split('/')[0]
    if n!=expected[ident]:raise RuntimeError('状态数量不一致')
    counts.setdefault(ident,{})['states']=n;counts[ident]['uncompressed_states_bytes']=total
   if m.name.endswith('/actions.jsonl.gz'):
    with gzip.GzipFile(fileobj=t.extractfile(m)) as f:
     actions=[json.loads(line) for line in f]
    ident=m.name.split('/')[0]
    if len(actions)!=expected[ident] or any(a['index']!=i for i,a in enumerate(actions)):raise RuntimeError('动作索引或数量不一致')
    counts.setdefault(ident,{})['actions']=len(actions)
 if len(counts)!=len(results) or any(c.get('states')!=c.get('actions') for c in counts.values()):raise RuntimeError('压缩轨迹缺失')
 target.with_suffix('.streams.json').write_text(json.dumps({'all_equal':True,'games':counts},indent=2),encoding='utf8')
