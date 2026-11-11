"""按SHA归档本轮新生成的校准统计，保留650MB管理目录空间；不移动旧代资产。"""
import os
from run_league import DIR, ROOT, read, save, sha

assert read(DIR / 'generations/gen_02/value-calibration.json')['passed']
archive = (DIR.parent / 'dual_stream_v2_phase51_cache_archive_20261021').resolve()
assert archive.parent == DIR.parent.resolve() and archive.is_relative_to(ROOT.resolve())
archive.mkdir(exist_ok=True)
files = {}
for name in ['train-calibration.pt.gz', 'dev-calibration.pt.gz']:
    source = (DIR / 'generations/gen_02' / name).resolve()
    target = (archive / name).resolve()
    assert source.parent == (DIR / 'generations/gen_02').resolve() and target.parent == archive
    if source.exists():
        digest = sha(source)
        assert not target.exists(), '归档目标已存在，禁止覆盖'
        size = source.stat().st_size; source.rename(target)
    else:
        prior = read(DIR / 'phase51-audit/calibration-cache-archive.json')['files'][source.relative_to(DIR).as_posix()]
        digest, size = prior['sha256'], prior['bytes']
    assert sha(target) == digest
    files[source.relative_to(DIR).as_posix()] = dict(path=target.relative_to(ROOT).as_posix(), sha256=digest, bytes=size)
save(DIR / 'phase51-audit/calibration-cache-archive.json', dict(files=files, reason='本轮新缓存按内容SHA保全至兄弟目录；旧第0/1代和新模型/检查点/对局原件保持原位；临时与最终管理目录继续受650MB限制'))
print(f'新缓存归档{sum(p["bytes"] for p in files.values())}字节，内容SHA保持')
