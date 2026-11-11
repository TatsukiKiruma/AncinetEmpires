"""保持单个低优先级编码进程，等待其完成；不运行训练。"""
import json
import os
import subprocess
from device import HERE,ROOT,write

command=['node','--max-old-space-size=1024','--import','tsx',str(HERE/'convert.ts')]
with (HERE/'conversion.log').open('ab') as log:
    p=subprocess.Popen(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name=='nt' else 0)
    write(HERE/'CONVERSION_PROCESS.json',{'pid':p.pid,'parentPid':os.getpid(),'role':'single_worker_feature_encoding_only','priority':'below_normal'})
    code=p.wait()
write(HERE/'CONVERSION_EXIT.json',{'returncode':code})
raise SystemExit(code)
