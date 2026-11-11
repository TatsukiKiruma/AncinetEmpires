"""新增等价优化后的116局工程证据与旧95.7MB索引保全，单独扩展空间预算。"""
import time
from run_league import DIR, read, save, sha

target = DIR / 'phase53-audit/gen4-resource-extension.json'
if not target.exists():
    protocol = DIR / 'phase53-audit/gen4-protocol.json'
    save(target,dict(generation=4,createdAt=time.time(),originalProtocolSha256=sha(protocol),originalEvidenceCapBytes=1200000000,evidenceCapBytes=1350000000,minimumFreeBytes=12*1024**3,reason='已复现旧对手逐格JSON复制瓶颈，需新增56槽冠军基准与相同60初态工程复测，并保全95.7MB旧训练排重索引；不删除旧模型、数据或证据',qualityAndTimingThresholdsUnchanged=True,trainingProtocolUnchanged=True,trainingCheckpointsStillUseOriginalCap=True,extraGamesForQualityTraining=False,oldIndexBytes=(DIR / 'evaluation-exclusions.txt.gz').stat().st_size))
revision = read(DIR / 'RUNTIME_REVISION.json')
revision['v4EvidenceRetentionExtension'] = dict(receipt=target.relative_to(DIR).as_posix(),receiptSha256=sha(target))
save(DIR / 'RUNTIME_REVISION.json',revision)
print(dict(evidenceCapBytes=read(target)['evidenceCapBytes'],protocolUnchanged=sha(DIR / 'phase53-audit/gen4-protocol.json') == read(target)['originalProtocolSha256']))
