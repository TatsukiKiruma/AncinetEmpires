"""只记录用户明确停止时的已完成与中断证据，不启动重放、训练或新评测。"""
from pathlib import Path
import json,datetime,collections,hashlib
import psutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent;stamp=datetime.datetime.now().strftime('%Y%m%dT%H%M%S');REV=HERE/'revisions/r21';read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
plan=read(HERE/'teacher-battle-plan.json');base=HERE/'teacher-r21-battles/slots';completed=[];interrupted=[];unstarted=[];groups=collections.defaultdict(collections.Counter)
for slot in plan['slots']:
    folder=base/slot['id'];result=folder/'result.json'
    if result.exists():
        r=read(result);completed.append(dict(slot=slot['id'],actions=r['actions'],classification=r['classification'],strict=(folder/'strict-replay.json').exists()));groups[f'{slot.get("panel","fixed")}/{slot["model"]}'][r['classification']]+=1
    elif (folder/'actions.jsonl').exists():
        file=folder/'actions.jsonl';lines=0;digest=hashlib.sha256();tail=b''
        with file.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''):digest.update(chunk);lines+=chunk.count(b'\n');tail=chunk[-1:]
        interrupted.append(dict(slot=slot['id'],rawLog=file.relative_to(HERE).as_posix(),bytes=file.stat().st_size,completeLines=lines,hasIncompleteLastLine=tail not in [b'',b'\n'],sha256=digest.hexdigest(),lastLive=read(folder/'live.json') if (folder/'live.json').exists() else None,strictPending=True))
    else:unstarted.append(slot['id'])
# 只观察实际脚本参数，排除当前记录器及祖先进程，避免把查询命令本身算成任务。
skip={psutil.Process().pid,*[p.pid for p in psutil.Process().parents()]};needles=['/tactical_exit_20261019/pipeline_revision.py','/tactical_exit_20261019/battle.ts','/tactical_exit_20261019/run_battles.py','/tactical_exit_20261019/after_r21_review.py','/tactical_exit_20261019/expert.ts','/tactical_exit_20261019/probe_deployment_completion_gap.ts']
active=[]
for p in psutil.process_iter(['name','cmdline']):
    if p.pid in skip:continue
    args=[str(v).replace('\\','/') for v in p.info.get('cmdline') or []]
    if any(any(v.endswith(n) for n in needles) for v in args):active.append(dict(pid=p.pid,name=p.info['name'],args=args))
assert not active,'本任务仍有活动进程，不能把状态记为已停止'
record=dict(stopped=True,reason='用户明确要求停止并说明进度和问题',stoppedAt=datetime.datetime.now().isoformat(timespec='seconds'),plannedSlots=150,completedSlots=len(completed),completedActions=sum(r['actions'] for r in completed),completedStrictSlots=sum(r['strict'] for r in completed),interruptedSlots=interrupted,unstartedSlots=unstarted,groups={k:dict(v) for k,v in groups.items()},qualifiedTeacher=False,trueSearchExpertGames=0,distillationStarted=False,final200Started=False,activeTaskProcesses=active,resumePrerequisite='先对全部已完成及中断原始动作strict收尾并登记中断/排重谱系，再以完整面板复验；不得把135槽或中断局当完整通过')
target=REV/f'USER_STOP_{stamp}.json'
with target.open('x',encoding='utf-8') as out:json.dump(record,out,ensure_ascii=False,indent=2)
(HERE/'TASK_STATE.json').write_text(json.dumps(dict(status='paused',complete=False,phase='用户要求停止：R21完整面板135/150已结束，另4局中断；本轮strict未收尾，教师不合格、专家0',stopRecord=target.relative_to(HERE).as_posix()),ensure_ascii=False),encoding='utf-8')
line=f'\n用户于{record["stoppedAt"]}明确要求停止。全部本任务评测与后续监督器已终止；R21实际完成{len(completed)}/150槽、{record["completedActions"]}已结束局动作，4局原始日志中断、11槽未开，本轮批量strict尚未执行。固定阶段3/纯策略/搜索22/24/24胜；扩展搜索14槽9胜5负，未形成完整资格或正式尾时延结论。所有原件保留，真正专家0，未蒸馏/未最终200槽。复工应先对已完成及中断实际动作strict收尾，登记全部消费输入后再继续完整门禁。停止现场见{target.relative_to(HERE).as_posix()}。\n'
with (HERE/'WORKLOG.md').open('a',encoding='utf-8',newline='') as out:out.write(line)
current=ROOT/'ai_training/status/CURRENT.md';b=current.read_bytes();marker=b'<!-- end-tactical-exit-20261019 -->';assert b.count(marker)==1;current.write_bytes(b.replace(marker,line.encode()+marker))
print(json.dumps(dict(stopped=True,completed=len(completed),completedActions=record['completedActions'],interrupted=len(interrupted),interruptedCompleteLines=sum(r['completeLines'] for r in interrupted),unstarted=len(unstarted),strictSlots=record['completedStrictSlots'],activeTaskProcesses=len(active),record=target.relative_to(HERE).as_posix()),ensure_ascii=False))
