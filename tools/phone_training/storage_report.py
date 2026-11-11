import collections,datetime,hashlib,json,pathlib,re,sys,tarfile
sys.stdout.reconfigure(encoding='utf8')

# 只读取新批次的证据，区分正式对局、预检和电脑备份体积。
p=pathlib.Path('C:/code/AncinetEmpires/captures/phone-storage-1000-20261015')
run='phone-storage-1000-20261015'
summary=json.loads((p/(run+'-summary.json')).read_text(encoding='utf8'))
baseline=json.loads((p/(run+'-baseline.json')).read_text(encoding='utf8'))
samples=[json.loads(s) for s in (p/(run+'-resources.jsonl')).read_text(encoding='utf8').splitlines()]
results=summary['results'];counts=collections.Counter(r['planId'] for r in results)
archives=sorted(p.glob(run+'-batch-*.tar'))
raw_archives=[f for f in archives if not f.name.endswith('-audits.tar')]
audits=[];logical_bytes=0
for f in archives:
 with tarfile.open(f) as t:
  logical_bytes+=sum(m.size for m in t.getmembers() if m.isfile())
  if f.name.endswith('-audits.tar'):
   audits.extend(json.load(t.extractfile(n)) for n in t.getnames() if n.endswith('/result.json'))
def free(row):
 line=next(l for l in row['raw'].splitlines() if l.startswith('/dev/') and '/data' in l)
 return int(line.split()[3])*1024
def used(row):
 lines=[l for l in row['raw'].splitlines() if re.match(r'^\d+\s+',l) and '/'+run in l]
 return int(lines[0].split()[0])*1024 if lines else None
last=samples[-1]
all_bytes=sum(f.stat().st_size for f in p.rglob('*') if f.is_file())
max_temp=max([int(m.group(1))/10 for s in samples if (m:=re.search(r'temperature:\s*(\d+)',s['raw']))],default=None)
batch_seconds=[]
for f in raw_archives:
 with tarfile.open(f) as t:r=[json.load(t.extractfile(n)) for n in t.getnames() if n.endswith('/result.json')]
 batch_seconds.append((max(int(x['ended_nanos']) for x in r)-min(int(x['started_nanos']) for x in r))/1e9)
report={'games':len(results),'natural_ends':sum(r['natural_end'] for r in results),'actions':sum(r['actions'] for r in results),'counts':dict(counts),'native_audit_games':len(audits),'native_audit_actions':sum(r['actions'] for r in audits),'all_states_equal':all(r['all_states_equal'] for r in audits),'device_generation_seconds_sum':sum(batch_seconds),'phone_dataset_allocated_bytes':used(last),'phone_dataset_logical_bytes':logical_bytes,'phone_free_before_bytes':free(baseline),'phone_free_after_bytes':free(last),'phone_global_free_change_bytes':free(baseline)-free(last),'pc_raw_archives_bytes':sum(f.stat().st_size for f in raw_archives),'pc_audit_archives_bytes':sum(f.stat().st_size for f in archives if f.name.endswith('-audits.tar')),'pc_task_folder_bytes_including_preflight':all_bytes,'pc_free_before_bytes':baseline['pc_free_bytes'],'pc_free_after_bytes':last['pc_free_bytes'],'max_temperature_c':max_temp,'validation_scope':'APK原生逐动作状态一致；尚未项目strict合法动作与模型训练编码验收','archives':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashlib.file_digest(f.open('rb'),'sha256').hexdigest()} for f in archives]}
report['truncated_games']=[{'id':r['id'],'map':r['map'],'planId':r['planId'],'actions':r['actions'],'turn':r['turn'],'winner_mask':r['winner_mask']} for r in results if not r['natural_end']]
report['storage_before_preflight']=json.loads((p/'storage-before-preflight.json').read_text(encoding='utf8'))
report['compression_probe']=json.loads((p/'compression-probe.json').read_text(encoding='utf8'))
report['cpu_percent_one_core_generation']=sum(r['worker_cpu_seconds'] for r in results)/sum(batch_seconds)*100
report['rss_sample_max_bytes']=max([int(m.group(1))*1024 for s in samples if (m:=re.search(r'VmRSS:\s*(\d+)',s['raw']))],default=None)
report['pss_sample_max_bytes']=max([int(m.group(1))*1024 for s in samples if (m:=re.search(r'TOTAL(?: PSS)?:\s*(\d+)',s['raw']))],default=None)
report['transfer_validation']=json.loads((p/'transfer-validation.json').read_text(encoding='utf8'))['all_equal']
report['pc_partial_transfer_bytes']=sum(f.stat().st_size for f in p.glob('*.partial'))
report['pc_compressed_transport_bytes']=sum(f.stat().st_size for f in p.glob('*.transport.gz'))
report['host_elapsed_seconds_including_recovery']= (datetime.datetime.fromisoformat(last['host_time'])-datetime.datetime.fromisoformat(baseline['host_time'])).total_seconds()
report['estimate_3000_raw_bytes']=report['pc_raw_archives_bytes']*3
(p/'storage-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
gib=lambda b:f'{b/1024**3:.3f} GiB' if b is not None else '未取得'
text=f"正式对局 {report['games']} 局，自然结束 {report['natural_ends']} 局，{report['actions']} 动作。\n原生回放核验 {len(audits)} 局，{report['native_audit_actions']} 动作，状态全部一致：{report['all_states_equal']}。\n手机原始数据目录占用：{gib(report['phone_dataset_allocated_bytes'])}\n电脑原始轨迹归档：{gib(report['pc_raw_archives_bytes'])}\n电脑本任务目录（含预检和核验）：{gib(all_bytes)}\n手机可用空间：{gib(free(baseline))} → {gib(free(last))}\n电脑C盘可用空间：{gib(baseline['pc_free_bytes'])} → {gib(last['pc_free_bytes'])}\n设备分批生成时间合计：{sum(batch_seconds):.2f}秒（不含导出和核验）。\n最高电池温度：{max_temp}℃。\n全盘空间变化可能包含其他应用活动；任务目录大小是本次数据的直接占用。\n"
labels={x['id']:x['label'] for x in json.loads((p/'manifest.json').read_text(encoding='utf8'))['plans']}
text+='\n各类实测局数：\n'+'\n'.join(f'{labels[k]}: {v}' for k,v in counts.items())
text+=f"\n截断局：{len(report['truncated_games'])}，不能作为自然胜负标签。\n首批无损gzip压缩后比例：{report['compression_probe']['ratio']*100:.2f}%（仅首批实测，不代表全量）。\n"
text+=f"电脑目录总量还包括压缩传输副本、中断传输证据和压缩试验；中断文件占用{gib(report['pc_partial_transfer_bytes'])}，压缩传输副本占用{gib(report['pc_compressed_transport_bytes'])}。\n7957个手机文件与电脑归档逐文件SHA-256校验一致：{report['transfer_validation']}。\n整轮含导出、核验与USB传输恢复：{report['host_elapsed_seconds_including_recovery']/60:.2f}分钟。\n按本次分布线性估算3000局未压缩原始归档：{gib(report['estimate_3000_raw_bytes'])}，不是已生成的3000局实测。\n"
text+=f"采集线程平均CPU：{report['cpu_percent_one_core_generation']:.1f}%（单核占满=100%，仅生成阶段采集线程）。\n游戏进程最大采样RSS：{report['rss_sample_max_bytes']/1024**2:.1f}MiB，最大采样PSS：{report['pss_sample_max_bytes']/1024**2:.1f}MiB；不是真连续峰值。\n本次保存原生轨迹，尚未执行项目strict合法动作诊断与模型训练schema验收。\n"
(p/'1000局储存测试报告.txt').write_text(text,encoding='utf8');print(text)
