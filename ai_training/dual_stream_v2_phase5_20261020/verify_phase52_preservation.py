"""只读核对旧代及本轮归档，单独保存当前核验收据。"""
from run_league import DIR, ROOT, read, save, sha

before = read(DIR / 'phase52-audit/before.json')
changed = [p for p, entry in before['files'].items() if not (ROOT / p).is_file() or sha(ROOT / p) != entry['sha256']]
archives = {}
for folder in (DIR / 'generations/gen_03').glob('training-attempt*'):
    manifest = read(folder / 'ARCHIVE_MANIFEST.json')
    diff = [p for p, digest in manifest['files'].items() if not (folder / p).is_file() or sha(folder / p) != digest]
    archives[folder.name] = dict(files=len(manifest['files']), changed=diff)
result = dict(passed=not changed and all(not e['changed'] for e in archives.values()), protectedFiles=before['count'], changed=changed, trainingArchives=archives)
save(DIR / 'phase52-audit/current-preservation.json', result)
print(result); assert result['passed']
