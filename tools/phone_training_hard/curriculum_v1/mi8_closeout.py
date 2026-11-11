"""小米停止后备份、静态核验、登记缺口并只清理本批白名单。"""
from pathlib import Path
from collections import Counter,defaultdict
import csv
import datetime as dt
import hashlib
import json
import re
import subprocess
import tarfile
from device import OUT,REMOTE,ADB,DEVICE,root
from artifact_integrity import verify

def raw(command,output=None):
    p=subprocess.run([ADB,'-s',DEVICE,'exec-out',"su -c '"+command+"'"],stdout=output or subprocess.PIPE,stderr=subprocess.PIPE,timeout=1200)
    assert p.returncode==0,p.stderr
    return p.stdout.decode('utf-8').strip() if output is None else None

def main():
    dest=OUT/'mi8-delivery-20261029';dest.mkdir(exist_ok=False)
    state=json.loads(root('cat '+REMOTE+'/STATE.json'))
    assert state['phase'] in ['stopped','workers_exited'] and all(not w['controllerAlive'] for w in state['workers'])
    for pkg in ['net.toyknight.aeii.android','net.toyknight.aeii.worker01']:assert not root('pidof '+pkg,check=False)
    (dest/'STOPPED_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
    plan=json.loads((OUT/'mi8-v1/PLAN.json').read_text(encoding='utf-8'));jobs=json.loads((OUT/'JOBS.json').read_text(encoding='utf-8'))['jobs'][:1000]
    backups=[];before=root('df -k /data')
    def backup(label,base,pattern):
        command='cd '+base+' && find '+pattern+' -type f -exec sha256sum {} +'
        hashes=raw(command);expected={}
        for line in hashes.splitlines():
            digest,name=line.split(None,1);assert re.fullmatch('[0-9a-f]{64}',digest);expected[name]=digest
        (dest/(label+'-remote-sha256.txt')).write_text(hashes,encoding='utf-8')
        archive=dest/(label+'.tar')
        with archive.open('xb') as stream:raw('cd '+base+' && tar -cf - '+pattern,stream)
        folder=dest/label;folder.mkdir();seen={}
        with tarfile.open(archive) as tar:
            for m in tar:
                assert not m.name.startswith('/') and '..' not in Path(m.name).parts
                if m.isfile():
                    data=tar.extractfile(m).read();seen[m.name]=hashlib.sha256(data).hexdigest();target=folder/m.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                else:assert m.isdir(),m.name
        assert seen==expected,(label,len(seen),len(expected))
        assert raw(command)==hashes
        backups.append({'label':label,'base':base,'pattern':pattern,'files':len(seen),'archive':str(archive.resolve()),'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'targets':sorted({n.split('/')[0] for n in seen})})
        print('完整备份核验',label,len(seen),flush=True)
        return folder
    task_names=[(REMOTE+s).rsplit('/',1)[1] for s in ['', '-w00','-w01']]
    task=backup('task-roots','/data/local/tmp',' '.join(task_names));rawfolders={}
    for w in plan['workers']:
        rawfolders[w['workerId']]=backup(w['workerId']+'-raw','/data/user/0/'+w['package']+'/files/.aeii-hard-production','hc7-mi8-20261027-v1-*')
    rows=[];failures=[];records=[];pending=[];groups=defaultdict(list)
    for w in plan['workers']:
        wid=w['workerId'];folder=task/Path(w['remoteRoot']).name
        for line in (folder/'completed.tsv').read_text().splitlines():
            if not line.strip():continue
            seq,parent,attempt,epoch=line.split('\t');job=jobs[int(seq)-1];assert parent==job['parentId']
            r=verify(rawfolders[wid]/attempt,job);r['localDirectory']=str((rawfolders[wid]/attempt).resolve());rows.append(r);groups[r['trajectorySha256']].append(r['executionSequence'])
        for line in (folder/'failure.tsv').read_text().splitlines():
            if not line.strip():continue
            seq,parent,attempt,reason,epoch=line.split('\t');base=rawfolders[wid]/attempt
            error=json.loads((base/'worker-error.json').read_text()) if (base/'worker-error.json').exists() else None
            s=json.loads((base/'STATE.json').read_text()) if (base/'STATE.json').exists() else None
            failures.append({'sequence':int(seq),'parentId':parent,'attemptId':attempt,'reason':reason,'epoch':int(epoch),'error':error,'state':s,'workerId':wid})
    success={r['executionSequence']:r for r in rows};assert len(success)==len(rows)==state['doneParents']
    categories={'normal':'正常开局','parameter_variant':'参数变体','advantage_endgame':'优势残局','preset_units':'多单位','high_tier':'高阶单位','skill':'技能','building_finish':'建筑收尾'}
    reasons={'failed':'执行报错','app_disappeared':'应用进程消失','no_state_90s':'启动90秒无状态','observation_cell_without_natural_end':'观察门禁未通过','stopped':'按用户要求停止','exhausted':'尝试预算耗尽'}
    for job in jobs:
        seq=job['executionSequence'];wid='w00' if seq%2 else 'w01';folder=task/Path(REMOTE+'-'+wid).name;r=success.get(seq)
        marker=folder/'FINAL_SEQS'/str(seq);starts=list((folder/'STARTED_ATTEMPTS'/str(seq)).glob('*'));related=[f for f in failures if f['sequence']==seq]
        reason=marker.read_text().strip().split('\t')[-1] if marker.exists() else ('stopped_pending' if starts else 'not_started_before_stop')
        status='已采集并核验' if r else ('未启动' if not starts else '已尝试但无合格完整对局')
        item={'执行局号':seq,'父局ID':job['parentId'],'种子':job['seed'],'类别':categories[job['category']],'配置':job['profile'],'人数':job['actualPlayerCount'],'地图':job['map'],'人口上限':job['setup']['unitLimit'],'初态SHA256':job['initialStateSha256'],'采集状态':status,'是否待补':'否' if r else '是','实际启动次数':len(starts),'终止标记':reason if not r else '', '失败原因':reasons.get(reason,'用户停止时未结案' if starts else '用户停止前尚未启动') if not r else '', '失败链':' → '.join(f['reason'] for f in related),'成功尝试ID':r['attemptId'] if r else '', '动作数':r['actions'] if r else '', '回合数':'','获胜联盟':'','原件目录':r['localDirectory'] if r else str(rawfolders[wid].resolve()),'相同轨迹局号':','.join(map(str,groups[r['trajectorySha256']])) if r and len(groups[r['trajectorySha256']])>1 else ''}
        if r:
            result=json.loads((Path(r['localDirectory'])/'result.json').read_text());item['回合数']=result['turn'];item['获胜联盟']=result['winnerAlliance']
        else:pending.append({'executionSequence':seq,'parentId':job['parentId'],'status':status,'terminalReason':reason,'actualStarts':len(starts),'attempts':related,'originalJob':job,'collectionAuthorized':False,'preservePreviousBudget':True})
        records.append(item)
    assert len(rows)+len(pending)==1000
    summary={'device':DEVICE,'naturalParents':len(rows),'pendingParents':len(pending),'actions':sum(r['actions'] for r in rows),'gapReasons':dict(Counter(p['terminalReason'] for p in pending)),'failedAttempts':len(failures),'attemptReasons':dict(Counter(f['reason'] for f in failures)),'errorMessages':dict(Counter(f['error']['error'] for f in failures if f['error'])),'duplicateTrajectoryGroups':[v for v in groups.values() if len(v)>1],'backups':backups,'before':before,'replay':False,'training':False,'recollection':False,'deleted':[]}
    for name,value in [('SUMMARY.json',summary),('VERIFIED_PARENTS.json',rows),('FAILED_ATTEMPTS.json',failures),('待补完整输入.json',{'collectionAuthorized':False,'jobs':pending}),('全部1000局.json',records)]:
        (dest/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    for name,values in [('全部1000局.csv',records),('待补对局.csv',[r for r in records if r['是否待补']=='是'])]:
        with (dest/name).open('w',encoding='utf-8-sig',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(records[0]));writer.writeheader();writer.writerows(values)
    # 全部原始文件、失败链及待补输入持久化后才清理固定白名单。
    for b in backups:
        base=b['base'];targets=b['targets']
        if base=='/data/local/tmp':assert set(targets)==set(task_names)
        else:
            assert base in ['/data/user/0/'+w['package']+'/files/.aeii-hard-production' for w in plan['workers']]
            assert all(re.fullmatch(r'hc7-mi8-20261027-v1-w0[01]-\d{4}-r\d{4}',n) for n in targets)
        for offset in range(0,len(targets),20):
            paths=[base+'/'+n for n in targets[offset:offset+20]]
            command='rm -rf -- '+' '.join(paths)+'; for p in '+' '.join(paths)+'; do test ! -e "$p" || exit 1; done; echo removed'
            assert root(command)=='removed';summary['deleted'].extend(paths)
            (dest/'CLEANUP.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print('已清理',b['label'],len(targets),flush=True)
    summary['after']=root('df -k /data');summary['completed']=True
    (dest/'CLEANUP.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    (dest/'REPORT.md').write_text('# 小米停止、下载核验与清理\n\n用户于2026-10-29明确要求停止当前任务，已通过STOP协议退出，无补采。\n\n'+json.dumps({k:v for k,v in summary.items() if k not in ['backups','deleted']},ensure_ascii=False,indent=2)+'\n\n全部1000局.csv记录每局状态、种子、地图、人数、胜者和电脑原件。待补对局.csv标明缺口；待补完整输入.json保留原job、失败链和旧启动次数，无执行授权。失败错误原文见FAILED_ATTEMPTS.json。\n\n成功局核对manifest长度/SHA、gzip完整性、动作索引/身份、状态帧数、自然终局、初态回执/请求摘要和线程退出。未执行strict/forced/原生回放，不等同规则合法性验证。失败半成品只做文件备份摘要，不算成功。所有备份文件逐一匹配手机摘要后，才删除本批3个任务目录及hc7-mi8-20261027-v1-*尝试目录。游戏APK、个人存档、其他任务和公共注入工具保留。\n\n原生错误码、进程消失仅按实测日志记录；没有回放或历史系统日志支持时不推定具体规则/系统根因。历史隔离尝试保留在完整原件中，未计成功。后续补采应关联本次记录、保持原局号/种子/初态并另行授权，不重置旧预算或重采成功局。\n',encoding='utf-8')
    (OUT/'MI8_CLOSED_COLLECTION.json').write_text(json.dumps({'status':'stopped_downloaded_verified_cleaned','path':str(dest.resolve()),'naturalParents':len(rows),'pendingParents':len(pending),'recollection':False},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:summary[k] for k in ['naturalParents','pendingParents','actions','gapReasons','attemptReasons','before','after']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
