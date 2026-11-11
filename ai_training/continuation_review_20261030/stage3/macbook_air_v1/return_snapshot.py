"""在Mac专属目录冻结训练成果包，保留原件，不运行训练或评测。"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8'))


def save_new(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def snapshot(root, tag):
    root = Path(root).resolve(strict=True)
    assert re.fullmatch(r'return-[A-Za-z0-9-]+', tag)
    work = root / 'work'
    training = work / 'training'
    complete = read(training / 'COMPLETE.json')
    latest = read(training / 'LATEST.json')
    progress = read(training / 'PROGRESS.json')
    assert complete['updates'] == latest['updates'] == progress['update'] == 100000
    assert complete['samples'] == progress['samples'] == 3200000
    assert complete['phase'] == 'training_complete' and progress['phase'] == 'complete'
    assert complete['lastCheckpoint'] == latest
    assert not complete['sealedTestEvaluated']
    assert read(root / 'CONTROLLER_EXIT.json')['phase'] == 'complete'
    assert not any((training / name).exists() for name in ['BLOCKED.json', 'CONTROLLER_BLOCKED.json'])
    for name in ['TRAINER_IDENTITY.json', 'CONTROLLER_IDENTITY.json']:
        identity = read(root / name)
        current = subprocess.run(['/bin/ps', '-p', str(identity['pid']), '-o', 'lstart=,command='],
                                 capture_output=True, text=True).stdout.strip()
        assert current != identity.get('fingerprint'), '任务进程仍在运行：' + name
    contract_sha = sha(work / 'MAC_CONTRACT.json')
    assert complete['contractSha256'] == contract_sha == '570daeee4786796971e67627a2e56e9476d5baf7fd3164dc7af67b8ede410eab'
    assert sha(training / latest['file']) == latest['sha256']
    contract = read(work / 'MAC_CONTRACT.json')
    for name, expected in contract['files'].items():
        source = Path(name) if Path(name).is_absolute() else work / name
        assert sha(source) == expected, '冻结代码身份不符：' + name

    # 输入在两端分别逐文件验证；已有输入不再重复打包。
    index_path = work / 'BASE_INPUTS_INDEX.json'
    assert sha(index_path) == contract['inputsIndexSha256']
    inputs = read(index_path)
    input_bytes = 0
    for row in inputs['files']:
        relative = Path(row['target'])
        assert not relative.is_absolute() and '..' not in relative.parts
        source = work / relative
        assert not source.is_symlink()
        assert source.stat().st_size == row['bytes'] and sha(source) == row['sha256'], row['target']
        input_bytes += row['bytes']
    assert inputs['sealedParents'] == 0

    exports = root / 'exports'
    exports.mkdir(exist_ok=True)
    folder = exports / tag
    folder.mkdir(exist_ok=False)
    files = []
    omitted = {'runtime', 'cache', 'exports'}
    reused = {'raw-store', 'inputs', 'dev-cache'}
    for base, directories, names in os.walk(root, followlinks=False):
        parent = Path(base)
        relative_parent = parent.relative_to(root)
        allowed = []
        for name in sorted(directories):
            path = parent / name
            if name == '__pycache__' or (parent == root and name in omitted):
                continue
            if parent == work and name in reused:
                continue
            assert not path.is_symlink(), '成果目录含未声明链接：' + str(path)
            allowed.append(name)
        directories[:] = allowed
        for name in sorted(names):
            path = parent / name
            if parent == root and path.suffix == '.tar':
                continue
            assert path.is_file() and not path.is_symlink()
            state = path.stat()
            digest = sha(path)
            after = path.stat()
            assert (state.st_size, state.st_mtime_ns) == (after.st_size, after.st_mtime_ns)
            files.append(dict(file=path.relative_to(root).as_posix(), bytes=state.st_size,
                              sha256=digest, mtimeNs=state.st_mtime_ns))
    files.sort(key=lambda row: row['file'])
    manifest = dict(schema='mac-stage3-results-snapshot-v1', tag=tag, sourceRoot=str(root),
                    createdBeijing=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(),
                    updates=100000, samples=3200000, latestCheckpoint=latest,
                    contractSha256=contract_sha, files=files, fileCount=len(files),
                    fileBytes=sum(row['bytes'] for row in files),
                    frozenInputs=dict(passed=True, count=len(inputs['files']), bytes=input_bytes,
                                      indexSha256=sha(index_path), sealedParents=0,
                                      omittedDirectories=['work/' + value for value in sorted(reused)]),
                    excludedRuntimeAndCaches=True, originalFilesPreserved=True,
                    offlineOrArenaEvaluationRun=False, sealedTestsRun=0)
    manifest_path = folder / 'SNAPSHOT_MANIFEST.json'
    save_new(manifest_path, manifest)
    archive = folder / 'macbook-stage3-results.tar'
    with tarfile.open(archive, 'x', format=tarfile.PAX_FORMAT) as tar:
        tar.add(manifest_path, arcname='SNAPSHOT_MANIFEST.json', recursive=False)
        for row in files:
            source = root / row['file']
            state = source.stat()
            assert (state.st_size, state.st_mtime_ns) == (row['bytes'], row['mtimeNs'])
            tar.add(source, arcname='mac-snapshot/' + row['file'], recursive=False)
            after = source.stat()
            assert (after.st_size, after.st_mtime_ns) == (state.st_size, state.st_mtime_ns)
    with archive.open('rb') as stream:
        os.fsync(stream.fileno())
    receipt = dict(schema='mac-stage3-results-package-v1', tag=tag, remoteArchive=str(archive),
                   archiveBytes=archive.stat().st_size, archiveSha256=sha(archive),
                   remoteManifest=str(manifest_path), manifestSha256=sha(manifest_path),
                   fileCount=len(files), fileBytes=manifest['fileBytes'],
                   frozenInputFiles=len(inputs['files']), frozenInputBytes=input_bytes,
                   latestCheckpoint=latest, originalFilesPreserved=True, epoch=time.time())
    save_new(folder / 'PACKAGE.json', receipt)
    print(json.dumps(receipt, ensure_ascii=False), flush=True)
