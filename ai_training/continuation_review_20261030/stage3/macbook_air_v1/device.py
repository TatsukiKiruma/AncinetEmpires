"""仅使用用户已配置的macbook SSH别名，不读取凭据或修改全局配置。"""
import datetime as dt
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
STAGE3=HERE.parent
ROOT=STAGE3.parents[2]
DATA=Path('D:/AncientEmpiresData/continuation_stage3_20261030_v1/macbook_air_v1')
REMOTE='/Users/larovinson/aeii-stage3-omni-from4500-20261030-v1'

def save(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2),'utf-8')

def ssh(command,timeout=60,check=True,input=None):
    args=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ControlMaster=no','-o','ControlPath=none','macbook',command]
    result=subprocess.run(args,input=input,capture_output=True,timeout=timeout)
    record=dict(utc=dt.datetime.now(dt.timezone.utc).isoformat(),command=command,code=result.returncode,
        stdout=result.stdout.decode('utf-8','replace'),stderr=result.stderr.decode('utf-8','replace'))
    with (HERE/'SSH_COMMANDS.jsonl').open('a',encoding='utf-8') as stream:stream.write(json.dumps(record,ensure_ascii=False)+'\n')
    if check and result.returncode:raise RuntimeError(dict(code=result.returncode,stdout=record['stdout'][-1500:],stderr=record['stderr'][-2500:]))
    return record['stdout'].strip()

def scp(source,target,timeout=900):
    source=Path(source)
    result=subprocess.run(['scp','-q','-o','BatchMode=yes',source.name,'macbook:'+target],cwd=source.parent,capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8','replace'))

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('command');args=parser.parse_args();print(ssh(args.command))
