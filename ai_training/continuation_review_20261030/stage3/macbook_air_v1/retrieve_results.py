"""取回Mac全部正式成果及工程证据，校验已有输入，不改远端环境。"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path, PurePosixPath
import shlex
import shutil
import subprocess
import tarfile
import time
import uuid

from device import HERE, DATA, REMOTE, ssh


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)


def local_root(tag):
    assert tag.startswith('return-') and all(v.isalnum() or v == '-' for v in tag)
    return DATA / 'returns' / tag


def stage():
    tag = 'return-' + dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
    local = local_root(tag)
    local.mkdir(parents=True, exist_ok=False)
    save_new(HERE / ('RETURN_STARTED-' + tag + '.json'), dict(tag=tag, local=str(local), phase='packaging'))
    code = (HERE / 'return_snapshot.py').read_text('utf-8')
    code += '\nsnapshot(' + repr(REMOTE) + ',' + repr(tag) + ')\n'
    result = json.loads(ssh('cd ' + shlex.quote(REMOTE) + ' && runtime/venv/bin/python -B -c ' + shlex.quote(code), timeout=900))
    save_new(local / 'REMOTE_PACKAGE.json', result)
    save_new(HERE / ('RETURN_PACKAGE-' + tag + '.json'), dict(local=str(local), **result))
    print(json.dumps(dict(tag=tag, local=str(local), archiveBytes=result['archiveBytes'], files=result['fileCount'])), flush=True)


def download(source, destination, expected_sha, expected_bytes=None):
    destination = Path(destination)
    if destination.exists():
        assert sha(destination) == expected_sha, '已有文件身份不符，保留且停止：' + str(destination)
        return
    temporary = destination.with_name(destination.name + '.' + uuid.uuid4().hex[:8] + '.partial')
    log = destination.with_name(temporary.name + '.scp.log')
    args = ['scp', '-q', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15',
            '-o', 'ControlMaster=no', '-o', 'ControlPath=none', 'macbook:' + source, temporary.name]
    with log.open('xb') as stream:
        child = subprocess.Popen(args, cwd=destination.parent, stdout=stream, stderr=subprocess.STDOUT)
        started = time.monotonic()
        next_report = started + 25
        while child.poll() is None:
            time.sleep(2)
            now = time.monotonic()
            if now >= next_report:
                received = temporary.stat().st_size if temporary.exists() else 0
                print(json.dumps(dict(phase='downloading', receivedBytes=received, expectedBytes=expected_bytes,
                                      percent=round(received / expected_bytes * 100, 1) if expected_bytes else None,
                                      averageMiBPerSecond=round(received / (now - started) / 2**20, 2))), flush=True)
                next_report = now + 25
            if now - started > 2400:
                child.terminate()
                child.wait(timeout=15)
                raise TimeoutError('传输超时，保留未完成文件：' + str(temporary))
    assert child.returncode == 0, 'SCP失败，保留日志：' + str(log)
    assert expected_bytes is None or temporary.stat().st_size == expected_bytes
    assert sha(temporary) == expected_sha, '传输SHA不符，保留未完成文件：' + str(temporary)
    temporary.rename(destination)


def transfer(tag):
    local = local_root(tag)
    package = read(local / 'REMOTE_PACKAGE.json')
    assert shutil.disk_usage(local).free > package['archiveBytes'] * 2 + 2 * 2**30, 'D盘剩余空间不足以保留归档和解包结果'
    download(package['remoteManifest'], local / 'SNAPSHOT_MANIFEST.json', package['manifestSha256'])
    manifest = read(local / 'SNAPSHOT_MANIFEST.json')
    assert manifest['tag'] == tag and manifest['fileCount'] == package['fileCount']
    download(package['remoteArchive'], local / 'macbook-stage3-results.tar', package['archiveSha256'], package['archiveBytes'])
    save_new(local / 'ARCHIVE_VERIFIED.json', dict(passed=True, archiveSha256=package['archiveSha256'],
                                                  archiveBytes=package['archiveBytes'], originalFilesPreserved=True))
    print(json.dumps(dict(passed=True, phase='archive_received', tag=tag, local=str(local))), flush=True)


def extract(tag):
    local = local_root(tag)
    package = read(local / 'REMOTE_PACKAGE.json')
    assert read(local / 'ARCHIVE_VERIFIED.json')['passed']
    manifest = read(local / 'SNAPSHOT_MANIFEST.json')
    expected = {'mac-snapshot/' + row['file']: row for row in manifest['files']}
    expected['SNAPSHOT_MANIFEST.json'] = dict(sha256=package['manifestSha256'], bytes=(local / 'SNAPSHOT_MANIFEST.json').stat().st_size)
    seen = set()
    normalized = set()
    with tarfile.open(local / 'macbook-stage3-results.tar') as archive:
        for member in archive:
            relative = PurePosixPath(member.name)
            assert member.isfile() and not relative.is_absolute() and '..' not in relative.parts
            assert all(':' not in part and '\\' not in part for part in relative.parts)
            assert member.name in expected and member.name not in seen
            key = member.name.casefold()
            assert key not in normalized, '归档存在Windows大小写冲突'
            normalized.add(key)
            seen.add(member.name)
            target = local.joinpath(*relative.parts)
            assert target.resolve().is_relative_to(local.resolve())
            row = expected[member.name]
            assert member.size == row['bytes']
            if target.exists():
                assert target.stat().st_size == row['bytes'] and sha(target) == row['sha256']
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            source = archive.extractfile(member)
            with source, target.open('xb') as stream:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(block)
                    stream.write(block)
            assert target.stat().st_size == row['bytes'] and digest.hexdigest() == row['sha256'], member.name
            if len(seen) % 100 == 0:
                print(json.dumps(dict(phase='extracting_verified', files=len(seen), total=len(expected))), flush=True)
    assert seen == set(expected)
    save_new(local / 'FILES_VERIFIED.json', dict(passed=True, files=manifest['fileCount'], bytes=manifest['fileBytes'],
                                                archiveSha256=package['archiveSha256'], everyFileSha256Verified=True))
    print(json.dumps(dict(passed=True, phase='files_verified', files=manifest['fileCount'], bytes=manifest['fileBytes'])), flush=True)


def inputs(tag):
    local = local_root(tag)
    work = local / 'mac-snapshot/work'
    index = read(work / 'BASE_INPUTS_INDEX.json')
    manifest = read(local / 'SNAPSHOT_MANIFEST.json')
    assert sha(work / 'BASE_INPUTS_INDEX.json') == manifest['frozenInputs']['indexSha256']
    phone_rows = read(HERE.parent / 'phone_samsung_v1/PAYLOAD_FILES.json')['files']
    sources = {row['target']: Path(row['source']) for row in phone_rows}
    payload = DATA / 'payload'
    verified = []
    for row in index['files']:
        candidates = [payload / row['target']]
        if row['target'] in sources:
            candidates.append(sources[row['target']])
        candidates.append(local / 'mac-snapshot/work' / row['target'])
        source = next((p for p in candidates if p.is_file() and p.stat().st_size == row['bytes'] and sha(p) == row['sha256']), None)
        assert source is not None, '本机冻结输入缺失或身份不同：' + row['target']
        verified.append(dict(row, localFile=str(source)))
    assert index['sealedParents'] == 0 and len(verified) == manifest['frozenInputs']['count']
    value = dict(passed=True, files=verified, count=len(verified), bytes=sum(row['bytes'] for row in verified),
                 indexSha256=manifest['frozenInputs']['indexSha256'], sealedParents=0,
                 meaning='冻结输入在Mac与本机分别逐文件核SHA；复用本机已有原件，不重复复制。')
    save_new(local / 'LOCAL_INPUTS_VERIFIED.json', value)
    print(json.dumps(dict(passed=True, phase='inputs_verified', count=value['count'], bytes=value['bytes'])), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['stage', 'transfer', 'extract', 'inputs'])
    parser.add_argument('--tag')
    args = parser.parse_args()
    if args.action == 'stage':
        stage()
    else:
        assert args.tag
        globals()[args.action](args.tag)
