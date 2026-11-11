"""只读复核最终产物、源码和封存清单，在本轮根目录写验证汇总。"""
import datetime
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PHONE = HERE/'phone'
SEEN = {}


def digest(file):
    value = hashlib.sha256(file.read_bytes()).hexdigest()
    SEEN[str(file.relative_to(ROOT)).replace('\\', '/')] = value
    return value


def read(file):
    digest(file)
    return json.loads(file.read_text(encoding='utf8'))


def bind(directory, relative, expected):
    file = (directory/relative).resolve()
    assert file.is_relative_to(directory.resolve()), relative
    assert digest(file) == expected, str(file)
    return file


releases = sorted(p for p in PHONE.glob('release-*') if p.is_dir() and not p.name.endswith('.partial'))
assert releases, '尚无最终原生发布'
release = releases[-1]
summary = read(release/'summary.json')
assert summary['finalRelease'] and summary['allRequestedProcessed'] and summary['processedSegments'] == 5012
assert summary['pendingSegments'] == 0 and summary['sourceStable']
assert not summary['trainingStarted'] and not summary['trainingAuthorized'] and not summary['modelSchemaAccepted']
native = read(release/'manifest.json')
for relative, expected in native['inputHashes'].items():
    bind(ROOT, relative, expected)
bucket_file = PHONE/'endpoints/parent-buckets.jsonl'
digest(bucket_file)
buckets = {r['parentId']: r['configSha256'] for r in map(json.loads, bucket_file.read_text(encoding='utf8').splitlines())}
config_inputs = {name: value for name, value in native['inputHashes'].items() if '/configs/' in name and name.endswith('.bin')}
assert sum('/full_v6/configs/' in name for name in config_inputs) == 3000
for name, value in config_inputs.items():
    assert value == buckets[Path(name).stem]
for relative, expected in native['artifacts'].items():
    bind(release, relative, expected)
for relative, expected in native['tools'].items():
    bind(PHONE, relative, expected)
for parent, expected in native['parentValueEvidence'].items():
    bind(release, 'parent_values/'+parent+'.json', expected)
completion = read(release/'union-completion.json')
assert completion['processedSegments'] == len(completion['receipts']) == 5012
for ident, expected in completion['receipts'].items():
    bind(PHONE/'full_v6/receipts', ident+'.json', expected)
identity = read(PHONE/'full_v6/source-identity.json')
for relative, expected in identity['source'].items():
    bind(ROOT, relative, expected)

replay = HERE/'replay'
seal = read(replay/'EVIDENCE_MANIFEST.json')
sealed_paths = {r['path'] for r in seal['artifacts']}
actual_paths = {p.relative_to(replay).as_posix() for p in replay.rglob('*')
                if p.is_file() and p.name != 'EVIDENCE_MANIFEST.json' and not p.name.endswith('.tmp')}
assert actual_paths == sealed_paths, '真实回放封存后出现增删文件'
for item in seal['artifacts']:
    file = bind(replay, item['path'], item['sha256'])
    assert file.stat().st_size == item['bytes']
real = read(replay/'final-summary.json')
assert real['completeReceipts'] == 257 and real['acceptedGames'] == 255 and real['rejectedGames'] == 2
assert real['acceptedPolicyRows'] == 484681 and not real['modelSchemaAccepted'] and not real['trainingAuthorized']
manifest = read(replay/'manifest.json')
for relative, expected in manifest['source']['hashes'].items():
    bind(ROOT, relative, expected)
for relative, expected in manifest['converterHashes'].items():
    bind(replay, relative, expected)
regression = read(HERE/'real-regression-verification.json')
assert regression['tests'] == regression['passed'] == 7 and regression['failed'] == 0
assert digest(replay/'EVIDENCE_MANIFEST.json') == regression['replaySealSha256']
for relative, expected in regression['sourceHashes'].items():
    bind(replay, relative, expected)
native_tests = read(HERE/'native-regression-verification.json')
assert native_tests['passed'] == native_tests['tests'] == 14 and native_tests['failed'] == 0
for relative, expected in native_tests['sourceHashes'].items():
    bind(HERE, relative, expected)
assert digest(HERE/'native-validation.log') == native_tests['logSha256']
assert native_tests['typecheckPassed'] and native_tests['resourceDerivationPassed']
resource_runs = [read(ROOT/f) for f in native['inputHashes'] if '/resource-execution-' in f]
for run in resource_runs:
    assert run['sourceStable'] and run['baselineSourceIdentity'] == identity['sourceId']
    driver = run.get('driverFile', 'run_resource_budget.py')
    variant = native_tests['resourceDriverVariants'][driver]
    assert run['derivedDriverSha256'] == variant['derivedDriverSha256']
    assert run['resourceDriverSha256'] == variant['sha256']
reviews = [read(p) for p in sorted(HERE.glob('release_review_*.json'))]
review = next((r for r in reversed(reviews) if r['checkpoint'] == release.relative_to(HERE).as_posix()), None)
assert review and review['passed'] and review['processed'] == 5012 and review['pending'] == 0
bind(HERE, review['auditorScript'], review['auditorSha256'])
for relative, expected in review['sourceHashes'].items():
    bind(HERE, relative, expected)
integrity = read(replay/'integrity-report.json')
assert integrity['gzipIntegrityAndReceiptPassed'] == 257 and integrity['sourceStable']
archive_reports = [read(ROOT/f) for f in native['inputHashes'] if '/archive-integrity-' in f]
assert len(archive_reports) == 1 and archive_reports[0]['accepted'] and len(archive_reports[0]['archives']) == 69
logical = sum(p.stat().st_size for p in HERE.rglob('*') if p.is_file())
free = shutil.disk_usage(ROOT).free
assert logical < 1342177280 and free >= 12*1024**3
for relative, expected in SEEN.copy().items():
    assert hashlib.sha256((ROOT/relative).read_bytes()).hexdigest() == expected
report = dict(passed=True, checkedAt=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
              nativeSegments=5012, nativeParents=3000, replayUniqueResponses=257,
              nativeCompactIntegrityVerified=True, replaySealedFiles=len(seal['artifacts']),
              sourceArchiveHashesVerified=69, nativeCodeTestsPassed=14, replayCodeTestsPassed=7,
              nativeParentConfigsVerified=3000, productionConfigCopiesVerified=len(config_inputs),
              typecheckPassed=True, resourceDerivationPassed=True,
              independentIndexReview=review['checkpoint'], nativeRelease=release.relative_to(HERE).as_posix(),
              newLogicalBytesBeforeSummary=logical, cFreeBytes=free, outputLimitBytes=1342177280,
              trainingStarted=False, evaluationGamesGenerated=0, phoneControlsTouched=False,
              modelSchemaAccepted=False, returnEligible=False,
              scope='复核已运行转换的全量发布索引与SHA/CRC证据；没有另做第二次全量规则重放，也未验证具体模型前向',
              inputHashes=SEEN)
(HERE/'validation-summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps({k: v for k, v in report.items() if k != 'inputHashes'}, ensure_ascii=False))
