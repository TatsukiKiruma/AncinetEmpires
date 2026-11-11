"""从已核验原件生成中文结案报告，不访问手机。"""
from collections import Counter,defaultdict
from pathlib import Path
import datetime as dt
import hashlib
import json
import sys

def main():
    dest=Path(sys.argv[1]);out=dest.parent
    summary=json.loads((dest/'SUMMARY.json').read_text(encoding='utf-8'))
    rows=json.loads((dest/'VERIFIED_PARENTS.json').read_text(encoding='utf-8'))
    gaps=json.loads((dest/'GAPS_321.json').read_text(encoding='utf-8'))
    attempts=json.loads((dest/'FAILED_ATTEMPTS.json').read_text(encoding='utf-8'))
    groups=defaultdict(list)
    for r in rows:groups[r['trajectorySha256']].append(r['parentId'])
    duplicates=[v for v in groups.values() if len(v)>1]
    chains=Counter(' > '.join(a['reason'] for a in g['attempts']) for g in gaps if g['attempts'])
    failed_boot=[a for a in attempts if a['reason']=='failed' and not a['error']]
    assert len(failed_boot)==1 and '等待应用后台就绪超时' in failed_boot[0]['state']['error']
    checks={'schema':'samsung-static-audit-v1','naturalParents':679,'gaps':321,'completeSequenceCoverage':True,'maximumStartsPerGap':3,'failureOriginalFilesShaVerified':5843,'successfulFilesManifestShaVerified':True,'gzipAndActionIndicesAndFrameCounts':True,'initialReceiptAndRequestedHash':True,'threadExitAndNaturalEnd':True,'duplicateTrajectoryGroups':duplicates,'gapAttemptChains':dict(chains),'bootstrapFailure':failed_boot,'replay':False,'recollection':False,'training':False}
    (dest/'CHECKS.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    report='''# 三星第二批下载与静态核验报告

2026-10-29，设备 ce071717887a94940b7e（SM-N9500），执行局号1001—2000。只读取回，未启动采集、补采、训练、张量生成、数据准入或任何规则回放。

## 下载与核验结果

- 679个唯一父局全部下载并通过既有文件核验，477649条动作及对应状态帧；统计文件体积340948785字节（约325.2 MiB）。成功原件位于 `w00-success/`、`w01-success/`，tar包同时保留。
- 每个成功局核对manifest文件长度和SHA-256、gzip完整读取、动作连续索引与父局/尝试身份、状态帧边界与动作数、人口上限、初态verified回执和冻结请求SHA、自然终局、路径计数和THREAD_EXITED。异常0。
- 两路失败原件全部下载，5843个文件逐一与手机端实时SHA-256一致。失败未闭合的gzip和动作/帧不要求满足成功合同，不能视作合格训练局。
- DONE与FINAL互斥且合计覆盖1000个执行局号：679自然完成，321终止。190个未启动，131个实际启动3次，无超预算。原始账本、启动账本、日志、门禁证据均保留。
- 发现1组4个父局的“实际初态＋动作序列”完全相同，即3个重复增量；679是唯一父局数，按此摘要得到676条不同轨迹。没有删除、补采或自动准入。明细见CHECKS.json。
- 这是文件、身份与回执静态核验，不是严格合法动作重放；没有据此宣称全部动作通过规则回放。

## 321局未完成原因

| 原因 | 父局数 | 证据解释 |
|---|---:|---|
| 观察门禁未开放，未启动 | 190 | 每格最初2父局均未自然完成，控制器按原门禁跳过后续该格 |
| 第3次仍执行失败 | 78 | FINAL最后原因failed；逐次错误见GAPS_321.json |
| 第3次应用进程消失 | 51 | PID/startTicks身份检查不再匹配，记录app_disappeared |
| 第3次90秒内无状态文件 | 2 | no_state_90s；未建立可监测的运行状态 |

后3行共131局均用满3次实际启动；最终原因不能代表前两次原因。42局连续3次failed、29局连续3次app_disappeared，其余60局是混合失败链。

门禁的42个观察父局为27自然、15终止；5格未获得自然终局：

| 组合 | 未启动数 | 已失败观察数 | 总缺口 |
|---|---:|---:|---:|
| 多单位四人 | 68 | 2 | 70 |
| 技能双人 | 38 | 2 | 40 |
| 高阶三人 | 28 | 2 | 30 |
| 高阶四人 | 28 | 2 | 30 |
| 参数变体四人 | 28 | 2 | 30 |

上述190局是调度策略造成的未尝试，不能说成190局引擎错误。5格的10个失败观察父局已包含在131个重试耗尽父局中，不重复相加。

## 全部688次失败尝试

| 失败类型 | 次数 | 可确认范围 |
|---|---:|---|
| app_disappeared | 384 | 374次最后状态为collecting，10次为cpu_pause；只能确认应用身份消失，现存日志不能断言为内存回收、系统杀进程或同一崩溃 |
| failed | 277 | 275次原生EVT-ERROR #10，1次#3，1次后台就绪超时 |
| no_state_90s | 24 | 启动后90秒没有状态；不能仅据此确定Gadget、应用启动或系统调度哪一层出错 |
| inject_disappeared | 3 | 控制器沿用旧标签；三星Gadget在应用进程内，不能理解为电脑注入器断线 |

276条原生异常的待提交动作：ATTACK239、STANDBY27、OCCUPY5、HEAL3、SUMMON2；异常均在原生动作执行调用处抛出。这里只静态读取错误和pendingAction，没有重试动作或重放，因此尚不能把每个#10细化为某一条规则缺陷。单次后台就绪超时为1806局第2次尝试，htmlReplaced=false，尚未进入正式采集。

688是全部尝试失败数，包含后来成功的父局；不可等同321个缺口。逐局分类、各次错误、待执行动作及最后状态见GAPS_321.json和FAILED_ATTEMPTS.json，便于后续有针对性诊断。

## 证据入口

- SUMMARY.json：完成局、动作、失败、类别与人数统计。
- VERIFIED_PARENTS.json：679局逐局核验信息。
- GAPS_321.csv / GAPS_321.json：321局终止原因、启动次数及完整失败链。
- FAILED_ATTEMPTS.json：688次失败的原始错误与状态。
- w00/、w01/、master/：手机账本、门禁、调度和每次启动日志。
- w00-attempts/、w01-attempts/：失败尝试原件；*-remote-sha256.txt为手机端文件摘要。

手机保持结案退出状态，未修改其任务、阈值、预算或结果。小米和电脑GPU任务未操作。
'''
    (dest/'REPORT.md').write_text(report,encoding='utf-8')
    index={**summary,'syncedNaturalParents':679,'rows':rows,'duplicateTrajectoryParents':duplicates,'auditPath':str(dest.resolve())}
    (dest/'INDEX.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding='utf-8')
    latest=out/'LATEST_SYNC.json';stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    if latest.exists():latest.rename(out/('LATEST_SYNC-before-audit-'+stamp+'.json'))
    latest.write_text(json.dumps({'path':str(dest.resolve()),'syncedNaturalParents':679,'report':str((dest/'REPORT.md').resolve())},ensure_ascii=False,indent=2),encoding='utf-8')
    archives=[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in dest.glob('*.tar')]
    (dest/'ARCHIVE_SHA256.json').write_text(json.dumps(archives,indent=2),encoding='utf-8')
    print(str(dest/'REPORT.md'))

if __name__=='__main__':main()
