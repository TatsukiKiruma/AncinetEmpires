"""冻结父代价值插值运行时，完整归档上一版冠军面板，准备同版本重测。"""
import shutil
from run_league import DIR, ROOT, read, save, sha

receipt = DIR / 'phase51-audit/parent-runtime-freeze.json'
if receipt.exists():
    assert all(sha(ROOT / p) == digest for p, digest in read(receipt)['runtime'].items())
    raise SystemExit(0)
assert read(DIR / 'generations/gen_02/value-calibration.json')['passed']
source = (DIR / 'champion-search-arena').resolve()
archive = (DIR / 'champion-search-arena-v2-archive').resolve()
assert source.parent == DIR.resolve() and archive.parent == DIR.resolve() and not archive.exists()
hashes = {p.relative_to(source).as_posix(): sha(p) for p in source.rglob('*') if p.is_file()}
source.rename(archive)
assert all(sha(archive / p) == digest for p, digest in hashes.items())
source.mkdir()
runtime = {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted((ROOT / 'src/ai_runtime/dual_v2').glob('*.ts')) if not p.name.endswith('.test.ts')}
plan = read(archive / 'plan.json')
plan.update(runtimeSha256=runtime, valueRuntimeRevision='parent-logits-v1')
save(source / 'plan.json', plan)
for name, backup in [('RUNTIME_REVISION.json', 'RUNTIME_REVISION-before-parent.json'), ('phase51-audit/runtime-freeze.json', 'runtime-freeze-v2.json')]:
    shutil.copyfile(DIR / name, DIR / 'phase51-audit' / backup)
revision = read(DIR / 'RUNTIME_REVISION.json')
revision['gen2InitialRuntimeSha256'] = revision['gen2RuntimeSha256']
revision.update(gen2RuntimeSha256=runtime, parentValueExtension='phase51-audit/parent-runtime-freeze.json')
save(DIR / 'RUNTIME_REVISION.json', revision)
frozen = read(DIR / 'phase51-audit/runtime-freeze.json')
frozen.update(runtime=runtime, secondArchivedChampionSearch=hashes, secondArchive='champion-search-arena-v2-archive')
save(DIR / 'phase51-audit/runtime-freeze.json', frozen)
save(receipt, dict(runtime=runtime, archive=str(archive.relative_to(DIR)), files=hashes, valueProtocol='generations/gen_02/parent-calibration-protocol.json', reason='首轮24候选价值未过门禁；按原授权加入父代logits插值；候选实战尚未启动'))
print(f'上一版{len(hashes)}文件SHA保全；同一新运行时的冠军搜索56槽待重测')
