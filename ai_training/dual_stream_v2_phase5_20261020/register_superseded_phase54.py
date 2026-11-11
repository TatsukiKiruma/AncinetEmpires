"""先登记被追加指令替代的完整搜索面板，等待中的后处理也能永久排重。"""
import shutil
from run_league import DIR, read, save, sha
from phase54_paths import audit_directory

audit = audit_directory(); protocol = read(audit / 'protocol.json')
previous = (DIR / protocol['previousPhaseSummary']).parent
registry = DIR / 'phase53-audit/evaluation-archives.json'
backup = audit / 'evaluation-archives-before-preaddition.json'
if not backup.exists(): shutil.copyfile(registry,backup)
record = read(registry)
for arm in ['champion-search-arena','candidate-search-arena']:
    name = (previous / arm).relative_to(DIR).as_posix()
    if name not in record['directories']: record['directories'].append(name)
save(registry,record)
save(audit / 'registry-preaddition.json',dict(passed=True,backupSha256=sha(backup),registrySha256=sha(registry),directories=record['directories']))
print('旧双链112搜索槽已加入永久排重登记；当前等待器将读取此登记')
