import json, pathlib, hashlib, shutil, time
from device import ROOT, adb, snapshot, REMOTE, TOOL

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
repo = ROOT.parent.parent
assert adb('shell','getprop','ro.serialno') == 'c2357770'
old_names = ['go/bin/go','row-audit.jsonl.gz','input-audit.jsonl.gz','config.json','schema.json','kernel.go','main.go','spatial.go','stream.go','GATE.json','payload-sha256.txt']
old = {n: adb('shell','sha256sum',TOOL+'/'+n).split()[0] for n in old_names}
retained = {}
for name in ['sd_300_parent_pilot_20261016','sd_300_pilot_battles_20261016','sd32_phone_20261016','sd32_phone_battles_20261016','model_deletion_20261016_64x2']:
    for p in (ROOT.parent/name).rglob('*'):
        if p.is_file() and '__pycache__' not in p.parts:
            retained[str(p.relative_to(repo)).replace('\\','/')] = sha(p)
(ROOT/'preservation-baseline.json').write_text(json.dumps(dict(existingOnly=True, authorizedDeletedModelsNotRequired=True, files=retained), indent=2), encoding='utf-8')
result = dict(at=time.time(), serial=adb('shell','getprop','ro.serialno'), model=adb('shell','getprop','ro.product.model'), before=snapshot(), oldRoot=TOOL, newRoot=REMOTE, oldRootUsage=adb('shell','du','-sk',TOOL), oldPhoneBindings=old, pcFreeBytes=shutil.disk_usage(ROOT).free, fridaPids=adb('shell','pidof','frida-server',check=False), optimizerUpdates=0)
(ROOT/'inventory.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(dict(passed=True, serial=result['serial'], oldRetainedFiles=len(retained), snapshot=result['before'])))
