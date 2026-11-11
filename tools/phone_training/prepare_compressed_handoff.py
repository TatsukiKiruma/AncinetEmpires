import hashlib,json,pathlib,tarfile

# 把训练配方、身份和验证记录与压缩轨迹一起交接，不改写历史采集证据。
old=pathlib.Path('captures/phone-storage-1000-20261015');new=pathlib.Path('captures/phone-compressed-2000-20261015')
validation=json.loads((old/'lossless-compression-verification.json').read_text(encoding='utf8'))
manifest=json.loads((new/'manifest.json').read_text(encoding='utf8'))
old_manifest=json.loads((old/'manifest.json').read_text(encoding='utf8'))
assert len(manifest['jobs'])==2000
for p,a,b,q in zip(manifest['plans'],manifest['counts1000'],manifest['counts2000'],manifest['quotas3000']):
 assert a+b==q and sum(j['planId']==p['id'] for j in manifest['jobs'])==b
assert not {j['seed'] for j in old_manifest['jobs']} & {j['seed'] for j in manifest['jobs']}
metadata=old/'training-metadata.tar.gz'
if not metadata.exists():
 with tarfile.open(metadata,'w:gz',compresslevel=1) as t:
  for path in sorted(old.iterdir()):
   if path.is_file() and path.suffix in ('.json','.jsonl','.txt','.tsv'):t.add(path,arcname=path.name)
members={}
with tarfile.open(metadata,'r:gz') as t:
 for m in t:
  if m.isfile():
   digest=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()
   assert digest==hashlib.file_digest((old/m.name).open('rb'),'sha256').hexdigest()
   members[m.name]=digest
(old/'training-metadata-verification.json').write_text(json.dumps({'all_equal':True,'sha256':members,'archive_sha256':hashlib.file_digest(metadata.open('rb'),'sha256').hexdigest()},indent=2),encoding='utf8')
sources=[*pathlib.Path('tools/phone_training').glob('*.py'),*pathlib.Path('tools/phone_training').glob('*.js'),pathlib.Path('tools/phone_training/scenario_manifest.ts'),new/'manifest.json',old/'manifest.json']
(new/'source-identity.json').write_text(json.dumps({str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in sources},indent=2),encoding='utf8')
raw=sum(r['raw_bytes'] for r in validation['archives']);packed=sum(r['compressed_bytes'] for r in validation['archives'])
lines=['# 3000局采集接续记录','','原1000局已完成无损压缩、解压SHA-256验证及7957个文件逐一摘要验证。原始手机目录和电脑tar仍保留。',f'','正式数据及回放归档：原始 {raw:,} 字节，压缩 {packed:,} 字节。','元数据归档 training-metadata.tar.gz 也已逐文件比对。','','## 配额','','| 场景 | 原1000 | 本轮2000 | 最终3000 |','|---|---:|---:|---:|']
for p,a,b,q in zip(manifest['plans'],manifest['counts1000'],manifest['counts2000'],manifest['quotas3000']):lines.append(f"| {p['id']} | {a} | {b} | {q} |")
lines+=['','## 保存格式','','旧数据压缩包解压后保持原有文件内容。新局 states.bin.gz 和 actions.jsonl.gz 直接在手机上以gzip level 1写入，电脑仅保存tar.gz，不落地大型未压缩tar。config.bin、initial.bin、final.bin和result.json保留原生内容；完整场景与初始配方保存在manifest.json。','states解压后是重复的4字节有符号大端长度加原生snapshot字节；与旧states.bin格式相同。初始派生状态须从initial.bin读取，不能仅用config.bin重建。','每局关闭gzip流后发布result.json；每批进行原生逐动作状态及终局回放、手机到电脑逐文件SHA-256比较，并检查gzip尾部CRC、状态帧完整性和动作索引。','自然结束与20000动作截断分开记录；截断不作为自然胜负。保留AI种子和实际动作，相同种子不承诺再次生成相同轨迹。','这是原APK规则采集数据，尚未完成项目TypeScript strict合法动作和训练schema验收，不代表可直接喂入训练。','','## 当前状态','','正式补跑尚未开始，手机仅6%电；已发送熄屏键减少耗电，未改动网络、Root、APK和规则设置。压缩采集器语法检查及损坏流拒绝测试已通过；手机上19类预检待补电后执行。达到30%且温度低于44℃才调度新批次。','预检命令：python tools/phone_training/compressed_controller.py --pid <当前游戏PID> --preflight','正式命令：python tools/phone_training/compressed_controller.py --pid <当前游戏PID>','命令依赖已授权的临时Frida服务和adb forward tcp:27042 tcp:27042；运行前重新核对PID和服务。预检完成且全等后才运行正式命令。']
(new/'采集接续说明.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({'raw_bytes':raw,'compressed_bytes':packed,'ratio':packed/raw,'metadata_files':len(members),'new_jobs':len(manifest['jobs'])}))
