"""保全第3代首轮训练/校准/三端产物，共用60局数据不移动。"""
import shutil
from run_league import DIR, ROOT, read, save, sha

folder = (DIR / 'generations/gen_03').resolve()
archive = (folder / 'training-attempt01-prior-aware').resolve()
assert folder.is_relative_to(ROOT.resolve()) and archive.parent == folder and not archive.exists()
keep = {'games', 'initial', 'league-plan.json', 'extraction-summary.json'}
entries = [p for p in folder.iterdir() if p.name not in keep]
identities = {p.relative_to(folder).as_posix(): sha(p) for entry in entries for p in ([entry] if entry.is_file() else entry.rglob('*')) if p.is_file()}
assert read(folder / 'model-node-parity.json')['passed'] and read(folder / 'model-browser-parity.json')['passed']
assert read(folder / 'model-browser-parity.json')['chromeProfileCleaned']
archive.mkdir()
for entry in entries:
    assert entry.parent == folder and not entry.is_symlink()
    entry.rename(archive / entry.name)
assert all(sha(archive / p) == digest for p, digest in identities.items())
save(archive / 'ARCHIVE_MANIFEST.json', dict(files=identities, reason='先验纠错及冻结通过，但绝对无谓wait<=2未过；完整保全后仅用训练池加入待机约束，不按实战反选'))
save(folder / 'wait-repair-protocol.json', dict(schema='train-only-wait-constraint-v1', generation=3, warmModel='generations/gen_03/training-attempt01-prior-aware/model', warmSha256=sha(archive / 'model.bin'), parentModel='generations/gen_00/model', permittedParameterRows=['what_entity.weight[4]', 'what_entity.bias[4]'], miningSplit='train', anchorRate=20000/141381, margin=.5, hingeWeight=10., klWeight=1., l2=.01, optimizer='Adam', steps=2000, lr=2e-5, minLr=2e-6, gradientClip=1., devUsedForOptimization=False, battleUsedForOptimization=False))
print(dict(archivedFiles=len(identities), modelSha256=sha(archive / 'model.bin')))
