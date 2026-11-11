"""补充原样计划供归档轨迹永久排重，不改写已有证据。"""
import shutil
from prepare_phase53 import DIR, AUDIT, sha
from run_league import save, read

registry = AUDIT / 'evaluation-archives.json'
if registry.exists():
    print('归档排重登记已经存在，保持原件')
else:
    roots = ['phase53-audit/v3-search-archive', 'phase53-audit/v4-attempt01-search-archive']
    additions = []
    for name in roots:
        source = DIR / name / 'candidate-plan.json'
        target = DIR / name / 'candidate-search-battles/plan.json'
        if not target.exists():
            shutil.copyfile(source, target)
        assert sha(source) == sha(target)
        additions.append(dict(source=str(source.relative_to(DIR)), added=str(target.relative_to(DIR)), sha256=sha(source)))
    save(registry, dict(directories=roots, supplementalPlans=additions, note='仅补充原样计划以支持永久排重，原归档文件均未改写'))
    print(dict(archives=len(roots), supplementalPlans=len(additions)))
