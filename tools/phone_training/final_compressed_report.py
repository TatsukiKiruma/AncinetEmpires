import collections,datetime,hashlib,json,pathlib,re,shutil,tarfile

# 合并两个独立采集批次的验收证据，保留原清单和历史摘要。
old=pathlib.Path('captures/phone-storage-1000-20261015');new=pathlib.Path('captures/phone-compressed-2000-20261015')
read=lambda p:json.loads(p.read_text(encoding='utf8'))
m1=read(old/'manifest.json');m2=read(new/'manifest.json')
r1=read(old/(old.name+'-summary.json'));r2=read(new/(new.name+'-summary.json'))
results=r1['results']+r2['results'];jobs=m1['jobs']+m2['jobs'];expected={j['id']:j for j in jobs}
assert len(results)==len(jobs)==3000 and len({r['id'] for r in results})==3000
assert {r['id'] for r in results}==set(expected)
assert len({j['seed'] for j in jobs})==3000
for r in results:
 j=expected[r['id']]
 assert (r['map'],r['seed'],r['planId'])==(j['map'],j['seed'],j['planId'])
 assert bool(r['natural_end'])==(r['winner_mask']>=0)
 assert r['actions']<=j['maxActions']
 assert r['natural_end'] or r['actions']==j['maxActions'], '提前中断不能算作完成既定对局'
counts=collections.Counter(r['planId'] for r in results)
quotas=[]
for p,q in zip(m2['plans'],m2['quotas3000']):
 assert counts[p['id']]==q
 group=[r for r in results if r['planId']==p['id']]
 quotas.append({'planId':p['id'],'target':q,'actual':counts[p['id']],'natural_ends':sum(r['natural_end'] for r in group),'truncated':sum(not r['natural_end'] for r in group),'actions':sum(r['actions'] for r in group),'map_names':sorted({r['map'] for r in group})})
old_verify=read(old/'lossless-compression-verification.json');assert old_verify['all_equal']
assert read(old/'transfer-validation.json')['all_equal']
old_audit_ids=set();old_audit_actions=0
for a in old_verify['archives']:
 p=old/a['file'];assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==a['gzip_sha256']
 if '-audits.' in p.name:
  with tarfile.open(p,'r:gz') as t:
   for m in t:
    if m.name.endswith('/result.json'):
     r=json.load(t.extractfile(m));assert r['all_states_equal'];old_audit_ids.add(r['sourceId']);old_audit_actions+=r['actions']
assert old_audit_ids=={j['id'] for j in m1['jobs']} and old_audit_actions==r1['actions']
assert all(r2.get(k) for k in ('all_native_replays_equal','all_transfers_equal','all_gzip_streams_complete'))
archives=[];new_files=0
for p in sorted(new.glob(new.name+'-batch-*.tar.gz')):
 v=read(p.with_suffix('.validation.json'));assert v['all_equal']
 assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==v['archive_sha256']
 if '-audits' not in p.name:assert read(p.with_suffix('.streams.json'))['all_equal']
 new_files+=v['files'];archives.append({'name':p.name,'bytes':p.stat().st_size,'sha256':v['archive_sha256']})
assert len(archives)==40
audit_actions=0;audit_games=0;audit_ids=set()
for p in new.glob(new.name+'-batch-*-audits.tar.gz'):
 with tarfile.open(p,'r:gz') as t:
  for m in t:
   if m.name.endswith('/result.json'):
    r=json.load(t.extractfile(m));assert r['all_states_equal'];audit_games+=1;audit_actions+=r['actions'];audit_ids.add(r['sourceId'])
assert audit_games==2000 and audit_actions==r2['actions']
assert audit_ids=={j['id'] for j in m2['jobs']}
samples=[json.loads(line) for line in (new/(new.name+'-resources.jsonl')).read_text(encoding='utf8').splitlines()]
rss=[];pss=[]
for s in samples:
 raw=s['raw'];match=re.search(r'VmRSS:\s+(\d+)',raw)
 if match:rss.append(int(match[1])*1024)
 match=re.search(r'TOTAL:\s+(\d+)',raw)
 if match:pss.append(int(match[1])*1024)
spans=[]
for i in range(20):
 group=r2['results'][i*100:(i+1)*100]
 spans.append((max(int(r['ended_nanos']) for r in group)-min(int(r['started_nanos']) for r in group))/1e9)
wall=sum(spans);cpu=sum(r['worker_cpu_seconds'] for r in r2['results'])
report={'created':datetime.datetime.now().isoformat(),'total_games':3000,'new_games':2000,'total_actions':sum(r['actions'] for r in results),'new_actions':r2['actions'],'natural_ends':sum(r['natural_end'] for r in results),'truncated':sum(not r['natural_end'] for r in results),'new_natural_ends':r2['natural_ends'],'new_truncated':2000-r2['natural_ends'],'quotas':quotas,'old_compressed_bytes':sum(a['compressed_bytes'] for a in old_verify['archives']),'new_compressed_bytes':sum(a['bytes'] for a in archives),'new_transfer_files_checked':new_files,'new_replayed_games':audit_games,'new_replayed_actions':audit_actions,'new_generation_seconds':wall,'new_worker_cpu_seconds':cpu,'new_generation_cpu_percent_one_core_100':cpu/wall*100,'sample_rss_max_bytes':max(rss,default=0),'sample_pss_max_bytes':max(pss,default=0),'sample_battery_celsius_max':max(s['battery_celsius'] for s in samples),'latest_resources':samples[-1],'archives':archives,'all_checks_passed':True,'project_strict_schema_accepted':False}
report['collection_wall_seconds']=(datetime.datetime.fromisoformat(samples[-1]['time'])-datetime.datetime.fromisoformat(samples[0]['time'])).total_seconds()
report['pc_dataset_folder_bytes']={p.name:sum(f.stat().st_size for f in p.rglob('*') if f.is_file()) for p in (old,new)}
report['native_replay_comparison']='逐动作及终局比较原生地图与玩家状态序列化字节；配置和UI字段原始字节完整保留。'
report['truncated_game_ids']=[r['id'] for r in results if not r['natural_end']]
report['old_replayed_games']=len(old_audit_ids);report['old_replayed_actions']=old_audit_actions
report['phone_transfer_directory']='/data/local/tmp/aeii-compressed-transfers-20261015'
report['phone_transfer_archive_bytes']=sum(a['bytes'] for a in archives if int(re.search(r'-batch-(\d+)',a['name'])[1])>=17)
report['final_source_sha256']={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in pathlib.Path('tools/phone_training').iterdir() if p.suffix in ('.py','.js','.ts')}
catalog=[];by_id={r['id']:r for r in results}
for directory,manifest,packed in ((old,m1,False),(new,m2,True)):
 for i,j in enumerate(manifest['jobs']):
  archive=directory/(directory.name+f'-batch-{i//100+1:02d}.tar.gz');assert archive.is_file()
  r=by_id[j['id']]
  catalog.append({'id':j['id'],'planId':j['planId'],'planKind':j['planKind'],'map':j['map'],'seed':j['seed'],'archive':('../'+str(archive.relative_to('captures')).replace('\\','/')),'entry_prefix':j['id']+'/','manifest':'../'+str((directory/'manifest.json').relative_to('captures')).replace('\\','/'),'states_file':'states.bin.gz' if packed else 'states.bin','actions_file':'actions.jsonl.gz' if packed else 'actions.jsonl','actions':r['actions'],'natural_end':r['natural_end'],'winner_mask':r['winner_mask'],'outcome_label_eligible':bool(r['natural_end']),'truncation_reason':None if r['natural_end'] else 'max_actions'})
(new/'dataset-3000-index.json').write_text(json.dumps({'schema':'aeii-native-trajectories-v1','native_apk_sha256':read(new/'native-package-identity.json')['native_apk_sha256'],'frame_format':'signed-int32-big-endian-length/native-serialized-snapshot','game_files':['config.bin','initial.bin','final.bin','result.json'],'project_strict_schema_accepted':False,'games':catalog},ensure_ascii=False,indent=2),encoding='utf8')
(new/'3000局最终验收.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
gib=lambda n:f'{n/1024**3:.3f} GiB'
lines=['# 手机3000局采集完成','','既有1000局无损压缩核验完成；按原定19类配额补齐2000局。',f"共 {report['total_actions']:,} 个动作，{report['natural_ends']} 局自然结束，{report['truncated']} 局截断。截断保留完整已执行轨迹，不能作为自然胜负标签。",'',f"旧1000局压缩归档 {gib(report['old_compressed_bytes'])}；新2000局压缩归档 {gib(report['new_compressed_bytes'])}。旧手机原始数据及电脑原始tar均保留。",f"新增2000局全部原生逐步回放及终局一致，核对 {new_files} 个手机与电脑文件摘要，压缩CRC、状态帧数与动作索引全部通过。",f"新增对局纯生成累计 {wall/60:.2f} 分钟；采集线程平均CPU占用 {cpu/wall*100:.1f}%（单核100%，不含回放和进程其他线程）。",f"采样最高RSS {max(rss,default=0)/1024**2:.1f} MiB、PSS {max(pss,default=0)/1024**2:.1f} MiB，最高电池温度 {report['sample_battery_celsius_max']}℃；这是采样值，不是连续峰值。",'','尚未完成项目TypeScript strict合法动作及训练schema验收。数据可保留用于后续转换与核验，此次没有启动模型训练。','','| 场景 | 目标 | 实际 |','|---|---:|---:|']
lines[-2:]=['| 场景 | 目标 | 实际 | 自然结束 | 截断 |','|---|---:|---:|---:|---:|']
lines += [f"| {q['planId']} | {q['target']} | {q['actual']} | {q['natural_ends']} | {q['truncated']} |" for q in quotas]
lines+=['','运行配置：8个采集线程、4个回放线程，每批100局；第三批起采集使用共享队列。主要保持熄屏，工作线程实测CPU亲和集合为0—2；首批曾短暂亮屏测试。本轮耗时应结合供电和CPU配置解读。','完整索引见 dataset-3000-index.json，按局指向两批压缩包及原生配置、初始状态、动作、逐步状态和终局。后续转换可按局流式读取，保留原始压缩归档。']
lines+=['第17批起使用手机压缩临时归档与ADB文件传输，解决PTY导出等待；这些临时压缩归档也保留在上述传输目录，目录占用另外记录于 final-storage.json。']
(new/'3000局完成报告.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({k:report[k] for k in ('total_games','new_games','total_actions','natural_ends','truncated','old_compressed_bytes','new_compressed_bytes','new_generation_seconds','collection_wall_seconds','all_checks_passed')}))
