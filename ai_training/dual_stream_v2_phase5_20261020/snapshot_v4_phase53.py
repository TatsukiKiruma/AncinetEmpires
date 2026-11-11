"""保全首版v4源码与只读接口扩展前的全部规则文件。"""
import shutil
from prepare_phase53 import AUDIT, ROOT, DIR, sha
from run_league import read, save

target = AUDIT / 'v4-attempt01-source'
assert not target.exists()
freeze = read(AUDIT / 'runtime-freeze.json')
files = list({**freeze['runtime'], **freeze['harness']})
files += [p.relative_to(ROOT).as_posix() for p in (ROOT / 'src/game').glob('*.ts') if not p.name.endswith('.test.ts')]
files += ['ai_training/dual_stream_v2_phase5_20261020/RUNTIME_REVISION.json', 'ai_training/dual_stream_v2_phase5_20261020/phase53-audit/runtime-freeze.json']
for name in files:
    source = ROOT / name
    dest = target / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
save(target / 'manifest.json', {name:sha(ROOT / name) for name in files})
save(AUDIT / 'queue-readonly-extension-protocol.json', dict(reason='首版v4正式队列已测得大于0.5ms；不修改规则与权重，只减少快返路径快照和字符串分配', plannedChanges=['新增GameEngine只读快照相等比较，不暴露私有状态', '保留最终队列expectedStateHash，快返改为直接比较完整预期状态', '权威构造、克隆、动作、回合与结算方法AST完全保持；新增方法单独验证'], evaluation='首版v4完整原件归档，最终运行时重新测两组56搜索槽，不按战果选参数'))
print(dict(files=len(files)))
