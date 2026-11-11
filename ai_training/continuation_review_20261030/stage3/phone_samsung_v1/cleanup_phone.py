"""只清理已完整备份并核SHA的三星专属任务；不卸载通用应用或操作Mac。"""
import datetime as dt
import json
from pathlib import Path
import shlex
from device import HERE,call,shell,save
from runtime_setup import termux,PREFIX,HOME
from linux_setup import PHONE
from closeout import state,read,sha,BASE

def main():
    value=state();local=Path(value['local']);proof=read(local/'BACKUP_VERIFIED.json')
    assert proof['passed'] and proof['latestUpdate']==5321 and proof['allPhoneRegularFilesPreserved']
    assert Path(proof['archive']).exists() and sha(proof['archive'])==proof['archiveSha256']
    assert PHONE==value['root']==HOME+'/aeii-omni-stage3-20261030-v1'
    assert termux('readlink -f '+PHONE)==PHONE
    boot=read(HERE/'BOOT_ENTRY.json')['file']
    assert termux('test ! -e '+boot+' && echo DISABLED')=='DISABLED'
    pointer=json.loads(termux('cat '+PHONE+'/work/training/LATEST.json'))
    assert pointer==value['sourceStopped']['latest']
    assert termux('sha256sum '+PHONE+'/work/training/'+pointer['file']).split()[0]==proof['latestCheckpointSha256']
    for identity in value['identities'].values():
        pid=str(identity['pid'])
        command=termux('if test -r /proc/'+pid+'/cmdline; then tr "\\0" " " < /proc/'+pid+'/cmdline; fi')
        assert PHONE not in command,'本任务进程仍在运行，不能清理'
    # 所有公共传输副本均逐个匹配本机保留原件；不使用通配符删除。
    root=HERE.parents[3]
    temporary={
        '/data/local/tmp/aeii-omni-samsung-linux-base-20261030-v1.tar.gz':root/'ai_training/phone_2m_scratch100_20261024/runtime-assets/ubuntu-base-24.04.5-base-arm64.tar.gz',
        '/data/local/tmp/aeii-omni-samsung-wheels-20261030-v1.tar':BASE/'assets/linux-wheels-node.tar',
        '/data/local/tmp/aeii-omni-stage3-bootstrap-20261030-v1.tar':BASE/'assets/bootstrap-private.tar',
        '/data/local/tmp/aeii-omni-stage3-bootstrap-sums-20261030-v1':BASE/'assets/BOOTSTRAP_SHA256SUMS',
        '/data/local/tmp/aeii-omni-stage3-bootstrap-sums-20261030-v1-links':BASE/'assets/bootstrap-links.sh',
        '/data/local/tmp/aeii-stage3-return4500-20261030T204810-71377923.tar':BASE/'returns/20261030T204810-71377923/phone-snapshot-verified.tar',
        value['remoteArchive']:Path(proof['archive']),
    }
    verified=[]
    for remote,source in temporary.items():
        assert remote.startswith('/data/local/tmp/aeii-') and '/' not in remote.removeprefix('/data/local/tmp/')
        if shell('test -f '+remote+' && echo yes || echo no')!='yes':continue
        assert source.is_file(),str(source)
        expected=sha(source)
        assert shell('sha256sum '+remote,timeout=600).split()[0]==expected,remote
        verified.append(dict(remote=remote,source=str(source),sha256=expected,bytes=source.stat().st_size))
    save(local/'CLEANUP_PLAN_VERIFIED.json',dict(root=PHONE,bootEntry=boot,backup=proof,temporaryFiles=verified,macNotTouched=True))
    prior_df=[]
    for line in (HERE/'ADB_COMMANDS.jsonl').read_text('utf-8').splitlines():
        entry=json.loads(line)
        if entry.get('args')==['shell','df -k /data'] and entry.get('returncode')==0:
            prior_df.append(int(entry['stdout'].splitlines()[-1].split()[3])*1024)
    assert prior_df,'缺少归档前的空间基线'
    original_available=prior_df[-1]
    before=int(shell('df -k /data').splitlines()[-1].split()[3])*1024
    # 在手机原生同一shell内解析真实路径并立即删除唯一常量目标，不跟随目录中的符号链接。
    command='target='+shlex.quote(PHONE)+'; expected='+shlex.quote(PHONE)+'; test -d "$target" && test ! -L "$target" && test "$(readlink -f "$target")" = "$expected" && '+PREFIX+'/bin/rm -rf -- "$target" && test ! -e "$target" && echo TASK_ROOT_REMOVED'
    output=termux(PREFIX+'/bin/bash -c '+shlex.quote(command),timeout=300)
    assert output=='TASK_ROOT_REMOVED'
    removed=[]
    for record in verified:
        remote=record['remote']
        shell('test -f '+remote+' && rm -- '+remote+' && test ! -e '+remote)
        removed.append(record)
    notification=termux('termux-notification-remove 91030; termux-wake-unlock; echo TRAINING_NOTIFICATION_AND_WAKE_LOCK_RELEASED',timeout=30)
    shell('sync',timeout=60)
    assert termux('test ! -e '+PHONE+' && test ! -e '+boot+' && test -x '+PREFIX+'/bin/bash && echo CLEANED_WITH_TERMUX_PRESERVED')=='CLEANED_WITH_TERMUX_PRESERVED'
    after=int(shell('df -k /data').splitlines()[-1].split()[3])*1024
    result=dict(schema='samsung-training-cleaned-v1',completed=True,trainingStopped=True,stoppedUpdate=proof['latestUpdate'],samples=proof['samples'],
        localTime=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),removedRoot=PHONE,removedBootEntry=boot,
        temporaryFilesRemoved=removed,backupArchive=proof['archive'],backupArchiveSha256=proof['archiveSha256'],
        backupFilesVerified=proof['manifestFilesVerified'],backupBytes=proof['archiveBytes'],latestCheckpoint=proof['latestCheckpoint'],
        latestCheckpointSha256=proof['latestCheckpointSha256'],inferenceWeights=proof['inferenceWeights'],
        availableBytesBefore=before,availableBytesAfter=after,availableBytesIncrease=after-before,
        availableBytesBeforeArchiving=original_available,netTaskSpaceReleasedBytes=after-original_available,
        genericTermuxEnvironmentPreserved=True,otherPhoneFilesPreserved=True,macNotTouched=True,windowsTrainingNotStarted=True,
        sealedTestsRun=0,notificationCleanup=notification,rootAndBootAbsenceVerified=True)
    save(local/'CLEANUP_COMPLETED.json',result);save(HERE/'PHONE_TASK_CLOSED.json',result)
    text=f'''# 三星训练停止、完整备份与清理

已按用户要求在5321更新、170272样本完整安全点保存退出；控制器、训练器及编码器正常闭合，开机入口已停用并存入归档。Mac任务没有任何操作，Windows原训练继续保持暂停。

完整任务归档：`{proof['archive']}`，{proof['archiveBytes']}字节，SHA256 `{proof['archiveSha256']}`。手机原目录的{proof['manifestFilesVerified']}个普通文件逐一核SHA通过，包括全部模型、数据、代码、日志及专属Ubuntu运行环境；归档保留符号链接等元数据。`FILES_VERIFIED.jsonl`记录逐文件验收，`BACKUP_VERIFIED.json`记录完整续训状态和逐张量核验。

最新完整断点：`{proof['latestCheckpoint']}`，SHA256 `{proof['latestCheckpointSha256']}`。推理权重：`{proof['inferenceWeights']}`，同目录last.json提供元数据，已与完整断点逐张量核对。其他历史断点与全部训练记录也已提取至restored-artifacts，完整运行环境保存在原始tar中。

已清理手机专属目录`{PHONE}`，其下训练数据、权重、PRoot根文件系统、运行环境、日志、导出和临时缓存全部移除；原开机脚本已移入本机归档。另移除{len(removed)}个逐一匹配本机原件SHA的本任务传输临时文件，取消本任务91030通知并释放Termux唤醒锁。Termux/Termux:API/Termux:Boot应用、通用前缀和其他手机目录保留。

与生成备份前相比，手机可用空间净增加{(after-original_available)/2**30:.2f}GiB，清理后可用{after/2**30:.2f}GiB。最后删除阶段增加{(after-before)/2**30:.2f}GiB，其中还包含本次备份新生成的临时归档；净释放数没有把该临时归档重复算成原任务占用。本任务已经关闭，不会自动恢复三星训练。此次没有运行任何封存验收或删除本机历史模型和数据。
'''
    (local/'REPORT.md').write_text(text,'utf-8')
    handoff=HERE.parent/'HANDOFF.md';old=handoff.read_text('utf-8')
    note=f'''2026-10-30最新三星收尾：用户要求停止训练并清理。已在5321更新、170272样本完整保存退出，全部专属任务目录约6.9GB完整取回到`{local}`，归档及{proof['manifestFilesVerified']}普通文件SHA和最新导出逐张量均通过。完整断点SHA `{proof['latestCheckpointSha256']}`。手机训练根目录、专属开机入口和已核验传输临时文件均已清理，通用Termux应用环境和其他手机文件保留。证据见`phone_samsung_v1/PHONE_TASK_CLOSED.json`及D盘收尾REPORT.md。三星任务已关闭；后续读取该收尾记录，不再访问已删除的手机训练路径。Mac继续既有独立分支，未发送任何Mac命令或停止指令，外部监听保持已结束。Windows原训练和原自动跟进仍暂停，封存验收仍未执行。

'''
    handoff.write_text(old.replace('# 第三阶段当前接手入口\n\n','# 第三阶段当前接手入口\n\n'+note,1),'utf-8')
    print(json.dumps({k:result[k] for k in ['completed','stoppedUpdate','samples','backupArchive','backupFilesVerified','availableBytesAfter','availableBytesIncrease','macNotTouched']}),flush=True)

if __name__=='__main__':main()
