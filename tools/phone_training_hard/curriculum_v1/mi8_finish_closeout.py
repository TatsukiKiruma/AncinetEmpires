"""根据已经核验并持久化的清单继续小米清理与报告。"""
from pathlib import Path
import hashlib
import json
import re
from device import OUT,REMOTE,root

def main():
    dest=OUT/'mi8-delivery-20261029';summary=json.loads((dest/'SUMMARY.json').read_text(encoding='utf-8'))
    receipt=dest/'CLEANUP.json'
    if receipt.exists():summary['deleted']=json.loads(receipt.read_text(encoding='utf-8'))['deleted']
    for pkg in ['net.toyknight.aeii.android','net.toyknight.aeii.worker01']:assert not root('pidof '+pkg,check=False)
    for b in summary['backups']:
        archive=Path(b['archive']);assert archive.resolve().parent==dest.resolve()
        assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==b['sha256']
        base=b['base'];targets=b['targets']
        if base=='/data/local/tmp':assert set(base+'/'+n for n in targets)=={REMOTE+s for s in ['', '-w00','-w01']}
        else:
            assert base in ['/data/user/0/'+p+'/files/.aeii-hard-production' for p in ['net.toyknight.aeii.android','net.toyknight.aeii.worker01']]
            assert all(re.fullmatch(r'hc7-mi8-20261027-v1-w0[01]-\d{4}-r\d{4}',n) for n in targets)
        # 小米su有较小的命令长度限制，保持每组短于4KiB。
        for offset in range(0,len(targets),8):
            paths=[base+'/'+n for n in targets[offset:offset+8]]
            command='rm -rf -- '+' '.join(paths)+'; for p in '+' '.join(paths)+'; do test ! -e "$p" || exit 1; done; echo removed'
            assert len(command)<3500 and root(command)=='removed'
            summary['deleted']=list(dict.fromkeys(summary['deleted']+paths))
            receipt.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print('清理确认',b['label'],len(targets),flush=True)
    summary['after']=root('df -k /data');summary['completed']=True
    receipt.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    report='# 小米采集停止、下载核验和清理报告\n\n2026-10-29按用户要求通过STOP协议停止，未补采。833局成功原件下载并通过静态核验，共'+str(summary['actions'])+'条动作；167局标记为待补。所有原件和任务文件逐文件匹配手机SHA后再清理。\n\n## 缺口分类\n\n| 状态标记 | 局数 | 含义 |\n|---|---:|---|\n'
    labels={'failed':'多次执行失败，旧预算耗尽','observation_cell_without_natural_end':'观察门禁未开放，未启动','stopped':'收到本次停止请求，未自然结束','stopped_pending':'停止时已尝试但未结案','not_started_before_stop':'停止前尚未启动'}
    for key,count in summary['gapReasons'].items():report+='| '+key+' | '+str(count)+' | '+labels.get(key,key)+' |\n'
    report+='\n全部失败尝试按类型：'+json.dumps(summary['attemptReasons'],ensure_ascii=False)+'。错误原文统计：'+json.dumps(summary['errorMessages'],ensure_ascii=False)+'。历史construction_mismatch及隔离成功原件均保留，不计合格完成。进程消失和原生错误码不直接推断为某一规则或系统故障。\n\n## 文件入口\n\n- 全部1000局.csv：每局种子、初态SHA、地图、人数、状态、启动次数、动作/回合、胜者、原件目录及重复轨迹。\n- 待补对局.csv：167局缺口与失败链。\n- 待补完整输入.json：完整冻结job、旧失败证据和实际启动次数，collectionAuthorized=false。\n- VERIFIED_PARENTS.json：833局逐局核验信息。\n- FAILED_ATTEMPTS.json：全部失败错误和最后状态。\n- task-roots/、w00-raw/、w01-raw/：完整任务和对局原件；对应tar及手机摘要也保留。\n- CLEANUP.json：清理目标、备份SHA和前后空间。\n\n## 核验及边界\n\n成功局通过manifest大小/SHA、gzip完整读取、动作索引/身份、状态帧数与动作数一致、人口、初态回执/冻结请求摘要、自然终局和线程退出检查。没有执行strict/forced/原生回放，因此不是逐步合法性证明。\n\n手机本批3个任务目录及指定前缀尝试目录已清理。游戏APK、个人存档、其他任务和公共注入工具保留。本次停止时仍未结案的局也列为待补，不冒充自然失败。后续补采须另行授权并关联旧预算与证据，不覆盖历史或重采成功局。\n\n相同轨迹组：'+json.dumps(summary['duplicateTrajectoryGroups'],ensure_ascii=False)+'。\n'
    (dest/'REPORT.md').write_text(report,encoding='utf-8')
    closed={'status':'stopped_downloaded_verified_cleaned','path':str(dest.resolve()),'naturalParents':833,'pendingParents':167,'recollection':False}
    (OUT/'MI8_CLOSED_COLLECTION.json').write_text(json.dumps(closed,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:summary[k] for k in ['naturalParents','pendingParents','actions','gapReasons','attemptReasons','before','after']},ensure_ascii=False))

if __name__=='__main__':main()
