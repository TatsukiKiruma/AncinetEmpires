import argparse,datetime,gzip,hashlib,json,pathlib,re,shutil,subprocess,sys,time,tarfile

# 分批调度并直接流式导出，不在手机上另存一份大型tar。
sys.stdout.reconfigure(encoding='utf8')
ap=argparse.ArgumentParser();ap.add_argument('--pid',type=int,required=True);ap.add_argument('--preflight',action='store_true');ap.add_argument('--extra',action='store_true');args=ap.parse_args()
source=pathlib.Path(__file__).parent
local=pathlib.Path('C:/code/AncinetEmpires/captures/phone-storage-1000-20261015')
adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
run='phone-storage-preflight-v3-20261015' if args.preflight else 'phone-storage-1000-20261015'
root='/data/user/0/net.toyknight.aeii.android/files/.aeii/'+run
manifest=json.loads((local/'manifest.json').read_text(encoding='utf8'))
base=json.loads((source/'jobs.json').read_text(encoding='utf8'))['baseConfigName']
def call(*parts,timeout=60):
 r=subprocess.run([adb,'-s','c2357770',*parts],capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError(r.stderr.decode('utf8',errors='replace'))
 return r.stdout.decode('utf8',errors='replace')
def shell(c):return call('shell',f'su -c "{c}"')
def sample(label):
 raw=shell('df -k /data; du -sk '+root+'; cat /proc/'+str(args.pid)+'/status; dumpsys battery; dumpsys meminfo net.toyknight.aeii.android')
 disk=shutil.disk_usage('C:/');row={'label':label,'host_time':datetime.datetime.now().isoformat(),'pc_free_bytes':disk.free,'raw':raw}
 with (local/(run+'-resources.jsonl')).open('a',encoding='utf8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 lines=[l for l in raw.splitlines() if '/data' in l and l.startswith('/dev/')]
 if not lines:raise RuntimeError('无法读取手机剩余空间')
 row['phone_free_bytes']=int(lines[0].split()[3])*1024
 if row['phone_free_bytes']<2*1024**3 or disk.free<3*1024**3:raise RuntimeError('空间不足，停止调度新批次并保留全部数据')
 return row
def launch(config,script):
 path=local/'active-jobs.json';path.write_text(json.dumps(config,ensure_ascii=False),encoding='utf8')
 call('push',str(source/script),'/data/local/tmp/aeii-worker.js');call('push',str(path),'/data/local/tmp/aeii-jobs.json')
 r=subprocess.run([sys.executable,str(source/'run_script.py'),str(args.pid),'launch.js','20'],capture_output=True,timeout=40)
 with (local/'launch-log.txt').open('ab') as f:f.write(r.stdout+r.stderr)
 if r.returncode or b'"kind": "error"' in r.stdout:raise RuntimeError(r.stdout.decode('utf8',errors='replace')+r.stderr.decode('utf8',errors='replace'))
def wait_jobs(jobs,audit=False):
 start=time.monotonic();previous=-1
 while True:
  raw=shell('find '+root+' -name result.json -o -name error.txt -o -name error.json')
  errors=[root+'/'+j['id']+'/'+e for j in jobs for e in ('error.txt','error.json') if root+'/'+j['id']+'/'+e in raw]
  if errors:raise RuntimeError('\n'.join(shell('cat '+p) for p in errors))
  count=sum(root+'/'+j['id']+'/result.json' in raw for j in jobs)
  if count!=previous:print(json.dumps({'stage':'audit' if audit else 'generate','completed':count,'target':len(jobs),'seconds':round(time.monotonic()-start,1)}),flush=True);previous=count
  if count==len(jobs):return
  sample('audit' if audit else 'running')
  if time.monotonic()-start>1800:raise RuntimeError('超过30分钟，停止调度后续批次')
  time.sleep(5)
def export(names,target):
 transport=target.with_suffix(target.suffix+'.transport.gz')
 command='su -c "tar -cf - -C '+root+' '+' '.join(names)+'" | gzip -1'
 with transport.open('wb') as f:
  r=subprocess.run([adb,'-s','c2357770','exec-out',command],stdout=f,stderr=subprocess.PIPE,timeout=600)
 if r.returncode:raise RuntimeError(r.stderr.decode('utf8',errors='replace'))
 with gzip.open(transport,'rb') as r,target.open('wb') as f:shutil.copyfileobj(r,f,4*1024**2)
 with tarfile.open(target) as t:
  results=[json.load(t.extractfile(n)) for n in t.getnames() if n.endswith('/result.json')]
  if len(results)!=len(names):raise RuntimeError('导出结果数量不一致')
 return results
baseline_path=local/(run+'-baseline.json')
if baseline_path.exists():baseline=json.loads(baseline_path.read_text(encoding='utf8'))
else:
 baseline=sample('baseline');baseline_path.write_text(json.dumps(baseline,indent=2),encoding='utf8')
if args.preflight:
 config=json.loads((local/('preflight-extra-jobs.json' if args.extra else 'preflight-jobs.json')).read_text(encoding='utf8'));batches=[[j for w in config['jobs'] for j in w['batch']]]
else:
 jobs=manifest['jobs'];batches=[jobs[i:i+100] for i in range(0,len(jobs),100)]
all_results=[]
for index,jobs in enumerate(batches):
 name=f'{run}'+('-extra' if args.extra else '')+f'-batch-{index+1:02d}';target=local/(name+'.tar')
 if not args.preflight:
  existing=shell('ls '+root+' 2>/dev/null || true').split()
  if not any(j['id'] in existing for j in jobs):
   config={'outputRoot':root,'baseConfigName':base,'jobs':[{'id':name+'-worker-'+str(w),'batch':jobs[w::8]} for w in range(8)]};launch(config,'worker.rhino.js')
 wait_jobs(jobs)
 if target.exists() and target.stat().st_size>0:
  with tarfile.open(target) as t:results=[json.load(t.extractfile(n)) for n in t.getnames() if n.endswith('/result.json')]
  if len(results)!=len(jobs):raise RuntimeError('已有归档不完整，保留证据并停止')
 else:results=export([j['id'] for j in jobs],target)
 truncated=[r['id'] for r in results if not r['natural_end']]
 if truncated:print(json.dumps({'kind':'truncated','games':truncated,'note':'保留轨迹，单独标记，不能作为自然胜负标签'},ensure_ascii=False),flush=True)
 audits=[{'id':'audit-'+j['id'],'sourceId':j['id'],'sourceRoot':root,'repeats':1,'fromInitial':True} for j in jobs]
 existing=shell('ls '+root+' 2>/dev/null || true').split()
 if not any(j['id'] in existing for j in audits):
  config={'outputRoot':root,'baseConfigName':base,'jobs':[{'id':name+'-audit-'+str(w),'batch':audits[w::4]} for w in range(4)]};launch(config,'replaybench.rhino.js')
 wait_jobs(audits,True)
 audit_target=local/(name+'-audits.tar')
 if audit_target.exists() and audit_target.stat().st_size>0:
  with tarfile.open(audit_target) as t:audit_results=[json.load(t.extractfile(n)) for n in t.getnames() if n.endswith('/result.json')]
 else:audit_results=export([j['id'] for j in audits],audit_target)
 if not all(r['all_states_equal'] for r in audit_results):raise RuntimeError('回放不一致')
 all_results.extend(results)
 report={'games':len(all_results),'actions':sum(r['actions'] for r in all_results),'natural_ends':sum(r['natural_end'] for r in all_results),'results':all_results,'resources':sample('batch-done'),'archives':[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in local.glob(run+'-batch-*.tar')]}
 (local/(run+'-summary.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'batch':index+1,'games':len(all_results),'actions':report['actions']}),flush=True)
sample('final')
