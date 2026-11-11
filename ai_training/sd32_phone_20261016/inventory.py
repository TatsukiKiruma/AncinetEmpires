from pathlib import Path
import subprocess,json,re,shutil,datetime
adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
p=Path('ai_training/sd32_phone_20261016')
r={}
for key,args in [('model',['getprop','ro.product.model']),('battery',['dumpsys','battery']),('memory',['cat','/proc/meminfo']),('disk',['df','-k','/data']),('capture',['pidof','net.toyknight.aeii.android']),('processes',['ps','-A','-o','PID,NAME']),('cpu',['cat','/sys/devices/system/cpu/online'])]:
 v=subprocess.run([adb,'-s','c2357770','shell',*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=20)
 r[key]=dict(exitCode=v.returncode,stdout=v.stdout,stderr=v.stderr)
r['at']=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
r['pcFreeBytes']=shutil.disk_usage(p).free
(p/'phone-inventory.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in r.items() if k not in ['memory','processes']},ensure_ascii=True))
print('memory',re.search(r'MemAvailable:\s*(\d+)',r['memory']['stdout']).group(1))
print('related', [x for x in r['processes']['stdout'].splitlines() if any(s in x.lower() for s in ['aeii','frida','trainer','dalvikvm'])])
