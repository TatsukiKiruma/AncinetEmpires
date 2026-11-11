"""启动前修正跨进程RNG传输为numpy，避免依赖Android的/dev/shm。"""
import hashlib
import json
import tarfile
from pathlib import Path
from device import HERE,PHONE,root,call,write

def sha(p):
    with Path(p).open('rb') as s:return hashlib.file_digest(s,'sha256').hexdigest()

auth=json.loads((HERE/'PHONE_AUTHORIZED.json').read_text(encoding='utf-8'))
before=dict(auth['files'])
for n in auth['files']:auth['files'][n]=sha(HERE/n)
write(HERE/'PHONE_AUTHORIZED.json',auth)
archive=HERE/'repairs/01/update.tar'
with tarfile.open(archive,'w') as t:
    for n in ['workers_runtime.py','train_continue.py','PHONE_AUTHORIZED.json']:t.add(HERE/n,arcname=n)
remote='/data/local/tmp/aeii-2m-continue900-repair01.tar';call('push',archive,remote)
assert root('sha256sum '+remote).split()[0]==sha(archive)
root('test ! -e '+PHONE+'/job/CONTROLLER_STARTED.json || exit 2\ntar -xf '+remote+' -C '+PHONE+'/job')
verified={}
for n in ['workers_runtime.py','train_continue.py','PHONE_AUTHORIZED.json']:
    actual=root('sha256sum '+PHONE+'/job/'+n).split()[0];assert actual==sha(HERE/n);verified[n]=actual
write(HERE/'repairs/01/VERIFIED.json',{'reason':'RNG跨进程使用numpy字节数组，保留完整恢复状态，不依赖Android共享内存对象','before':before,'after':auth['files'],'phoneVerified':verified,'optimizerUpdates':0,'trainingNotStarted':True})
print(json.dumps({'repairedBeforeLaunch':True,'phoneVerified':verified}))
