import argparse, datetime, hashlib, json, pathlib, re, subprocess, sys, time

# 电脑只负责调度、资源采样和备份；计时使用手机的单调时钟。
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser()
parser.add_argument('--pid',type=int,required=True)
parser.add_argument('--phase',choices=['second','benchmark'],required=True)
parser.add_argument('--workers',type=int,required=True)
parser.add_argument('--repeats',type=int,default=2)
parser.add_argument('--run',required=True)
args=parser.parse_args()
if args.workers not in [1,2,4,8,16]:raise ValueError('不支持的worker数量')
source=pathlib.Path(__file__).parent
adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
destination=pathlib.Path('C:/code/AncinetEmpires/captures')/args.run
destination.mkdir(parents=True,exist_ok=True)
phase='second-round' if args.phase=='second' else f'full-ai-w{args.workers}'
stage=destination/phase;stage.mkdir(exist_ok=True)
root='/data/user/0/net.toyknight.aeii.android/files/.aeii/'+args.run
def call(*parts,check=True,timeout=30):
    result=subprocess.run([adb,'-s','c2357770',*parts],capture_output=True,timeout=timeout)
    if check and result.returncode:raise RuntimeError(result.stderr.decode('utf8',errors='replace')+result.stdout.decode('utf8',errors='replace'))
    return result.stdout.decode('utf8',errors='replace')
def root_command(command,check=True):
    return call('shell',f'su -c "{command}"',check=check)
def sample(label):
    raw=call('shell','dumpsys battery; cat /proc/meminfo; dumpsys meminfo net.toyknight.aeii.android',check=False)
    def value(pattern):
        m=re.search(pattern,raw);return int(m.group(1)) if m else None
    (stage/('resource-'+label+'-'+str(time.time_ns())+'.txt')).write_text(raw,encoding='utf8')
    row={'label':label,'host_monotonic':time.monotonic(),'temperature_tenths_c':value(r'temperature:\s*(\d+)'),'battery_percent':value(r'level:\s*(\d+)'),'available_memory_kb':value(r'MemAvailable:\s*(\d+)'),'total_pss_kb':value(r'TOTAL(?: PSS)?:\s*(\d+)'),'ac_powered':'AC powered: true' in raw}
    with (stage/'resource-samples.jsonl').open('a',encoding='utf8') as f:f.write(json.dumps(row)+'\n')
    return row
state=call('get-state').strip()
if state!='device':raise RuntimeError('手机连接不可用')
size=call('shell','wm size')
if '1080x2248' not in size:raise RuntimeError('手机分辨率与固定流程不符')
maps=json.loads((source/'plan.json').read_text(encoding='utf8'))['maps']
original=json.loads((source/'jobs.json').read_text(encoding='utf8'))
jobs=[]
repeats=1 if args.phase=='second' else args.repeats
for repeat in range(repeats):
    for index,map_name in enumerate(maps):
        number=repeat*len(maps)+index
        job_id=f'g{index+11:02d}' if args.phase=='second' else f'full-w{args.workers}-{number+1:02d}'
        jobs.append({'id':job_id,'map':map_name,'seed':20262014+repeat*10000+index,'maxActions':20000,'phase':phase})
config={'outputRoot':root,'baseConfigName':original['baseConfigName'],'jobs':[{'id':phase+'-worker-'+str(worker),'batch':jobs[worker::args.workers]} for worker in range(args.workers)]}
(stage/'jobs.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf8')
(stage/'planned-games.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2),encoding='utf8')
call('push',str(source/'worker.rhino.js'),'/data/local/tmp/aeii-worker.js')
call('push',str(stage/'jobs.json'),'/data/local/tmp/aeii-jobs.json')
baseline=sample('before')
print(json.dumps({'phase':phase,'workers':args.workers,'games':len(jobs),'baseline':baseline},ensure_ascii=False),flush=True)
launched=subprocess.run([sys.executable,'-u',str(source/'run_script.py'),str(args.pid),'launch.js','20'],capture_output=True,timeout=30)
(stage/'launch.log').write_bytes(launched.stdout+launched.stderr)
if launched.returncode or b'"kind": "error"' in launched.stdout:raise RuntimeError(launched.stdout.decode('utf8',errors='replace')+launched.stderr.decode('utf8',errors='replace'))
started=time.monotonic();previous=-1
paths=[root+'/'+job['id']+'/result.json' for job in jobs]
while True:
    files=root_command('ls '+' '.join(paths),check=False)
    count=sum(path in files for path in paths)
    if count!=previous:
        print(json.dumps({'phase':phase,'completed':count,'target':len(jobs),'host_elapsed':round(time.monotonic()-started,2)}),flush=True);previous=count
    if count==len(jobs):break
    if time.monotonic()-started>600:raise RuntimeError('阶段超过10分钟，需要检查进度，不算自然结束')
    sample('running');time.sleep(2)
results=[]
for path in paths:
    results.append(json.loads(root_command('cat '+path)))
    if not results[-1]['natural_end']:raise RuntimeError('存在截断对局，必须单独处理：'+results[-1]['id'])
final_resources=sample('after')
wall=(max(float(r['ended_nanos']) for r in results)-min(float(r['started_nanos']) for r in results))/1e9
ordered=sorted(r['elapsed_seconds'] for r in results)
summary={'phase':phase,'workers':args.workers,'games':len(results),'natural_ends':sum(r['natural_end'] for r in results),'device_batch_seconds':wall,'games_per_second':len(results)/wall,'total_actions':sum(r['actions'] for r in results),'actions_per_second':sum(r['actions'] for r in results)/wall,'latency_min_seconds':min(ordered),'latency_median_seconds':(ordered[(len(ordered)-1)//2]+ordered[len(ordered)//2])/2,'latency_max_seconds':max(ordered),'ai_seconds_sum':sum(r['ai_seconds'] for r in results),'settle_seconds_sum':sum(r['settle_seconds'] for r in results),'snapshot_seconds_sum':sum(r['snapshot_seconds'] for r in results),'io_seconds_sum':sum(r['io_seconds'] for r in results),'resources_before':baseline,'resources_after':final_resources,'results':results}
(stage/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
remote='/data/local/tmp/'+args.run+'-'+phase+'.tar'
root_command('tar -cf '+remote+' -C '+root+' '+' '.join(job['id'] for job in jobs)+'; chmod 644 '+remote)
call('pull',remote,str(stage/'raw-games.tar'),timeout=120)
(stage/'sha256.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.iterdir() if p.is_file()},indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k!='results'},ensure_ascii=False),flush=True)
