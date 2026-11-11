import argparse
import datetime
import gzip
import hashlib
import json
import pathlib
import tarfile
import time
import continuation_io as io
from cycle_classification import classify

# 使用手机原生反序列化器分析历史轨迹，完全独立于对局引擎。
parser=argparse.ArgumentParser();parser.add_argument('--pid',type=int,required=True);args=parser.parse_args()
source=pathlib.Path(__file__).parent
source_identity={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ('cycle_review_controller.py','cycle_trace.rhino.js','cycle_classification.py','continuation_io.py')}
parent=pathlib.Path('C:/code/AncinetEmpires/captures/phone-continuation-61-20261015')
state_path=parent/'continuation-status.json'
while True:
    state=json.loads(state_path.read_text(encoding='utf8'))
    if state['status'].startswith('循环核查中'):
        break
    time.sleep(5)
round_number=state['round']
run=f'phone-cycle-review-20261015-r{round_number:04d}'
local=parent/f'cycle-review-r{round_number:04d}';local.mkdir(exist_ok=True)
(local/'source-identity.json').write_text(json.dumps(source_identity,indent=2),encoding='utf8')
root='/data/user/0/net.toyknight.aeii.android/files/.aeii/'+run
trajectory_root='/data/user/0/net.toyknight.aeii.android/files/.aeii/'+parent.name
io.args=argparse.Namespace(pid=args.pid,preflight=False,min_battery=20)
io.adb='C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'
io.local,io.source,io.root,io.run=local,source,root,run
io.base=json.loads((source/'jobs.json').read_text(encoding='utf8'))['baseConfigName']
ids=[j['originalId'] for j in state['pending']]+['s2466']
jobs=[]
for ident in ids:
    segments=[r for r in state['segments'] if r['original_id']==ident and r['actions']>0][-3:]
    expected={}
    for segment in segments:
        evidence=json.loads((parent/segment['archive']).with_suffix('.validation.json').read_text(encoding='utf8'))
        assert evidence['all_equal']
        expected[segment['id']]=dict(actions=segment['actions'],states_sha256=evidence['sha256'][segment['id']+'/states.bin.gz'],actions_sha256=evidence['sha256'][segment['id']+'/actions.jsonl.gz'])
    jobs.append(dict(id='cycle-'+ident,originalId=ident,sourceRoot=trajectory_root,sources=[s['id'] for s in segments],seed=segments[-1]['seed'],map=segments[-1]['map'],expectedSourceHashes=expected))
(local/'manifest.json').write_text(json.dumps(dict(jobs=jobs,source_round=round_number,normalization='仅归零绝对回合号；保留所有其他原生玩家字段、金币、规则、棋盘和选择状态',confirmation='最新至少4000步持续循环、至少3个完整周期，且含100次结束回合或同一回合内固定循环；也接受同等长度的纯待机/结束回合棋盘循环'),ensure_ascii=False,indent=2),encoding='utf8')
existing=io.shell('ls '+root+' 2>/dev/null || true').split()
if not any(j['id'] in existing for j in jobs):
    io.launch(jobs,8,'cycle_trace.rhino.js',run)
io.wait_jobs(jobs,'cycle-probe')
archive=local/(run+'.tar.gz')
results=io.export([j['id'] for j in jobs],archive)
if len(results)!=len(jobs) or not all(r['read_only'] for r in results):
    raise RuntimeError('循环核查结果缺失')
job_by_id={j['id']:j for j in jobs};analysis=[]
with tarfile.open(archive,'r|gz') as packed:
    for member in packed:
        if not member.name.endswith('/decision-trace.jsonl.gz'):
            continue
        ident=member.name.split('/')[0];job=job_by_id[ident]
        with gzip.GzipFile(fileobj=packed.extractfile(member)) as stream:
            rows=[json.loads(line) for line in stream]
        result=classify(rows);result.update(original_id=job['originalId'],map=job['map'],sources=job['sources'],trace_archive=str(archive),trace_member=member.name)
        analysis.append(result)
assert len(analysis)==len(jobs)
report=dict(checked_at=datetime.datetime.now().isoformat(),source_round=round_number,reviewed_games=len(analysis),calibration_game='s2466',newly_confirmed=[r['original_id'] for r in analysis if r['confirmed'] and r['original_id']!='s2466'],results=analysis,all_source_hashes_equal=True,training_outcome_note='循环僵持是停止采集标签，不是原生胜负或和局')
(local/'cycle-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
policy_path=parent/'stalemate-policy.json'
policy=json.loads(policy_path.read_text(encoding='utf8'))
for result in analysis:
    if result['confirmed']:
        policy['confirmed'][result['original_id']]=dict(reason='已观察到持续到最新记录的循环僵持',evidence=str(local/'cycle-review.json'),details=result)
for ident,decision in policy['confirmed'].items():
    marker=local/(ident+'.stop.json');marker.write_text(json.dumps(decision,ensure_ascii=False),encoding='utf8')
    temporary='/data/local/tmp/'+ident+'.stop.json'
    io.call('push',str(marker),temporary)
    io.shell('mkdir -p '+trajectory_root+'/controls; cp '+temporary+' '+trajectory_root+'/controls/'+ident+'.stop.json')
policy.update(review_pending=False,latest_review=str(local/'cycle-review.json'),last_review_round=round_number,auto_review_every_rounds=policy.get('auto_review_every_rounds',10),updated_at=datetime.datetime.now().isoformat())
temporary=policy_path.with_suffix('.json.partial');temporary.write_text(json.dumps(policy,ensure_ascii=False,indent=2),encoding='utf8');temporary.replace(policy_path)
print(json.dumps({'reviewed_games':len(analysis),'newly_confirmed':report['newly_confirmed'],'policy_released':True},ensure_ascii=False),flush=True)
