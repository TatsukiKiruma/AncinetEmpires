"""同步2414局完成模型、完整检查点及日志，逐文件核对，不训练或重放。"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

from device import HERE, PHONE, root, call, write
from status import process

DEST = HERE / 'completion'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(name):
    return json.loads(root('cat ' + PHONE + '/job/' + name))


def main():
    assert not (HERE / 'SYNC_2414.json').exists(), '已有同步回执，不覆盖历史证据'
    complete = read('output/COMPLETE.json')
    exit_record = read('CONTROLLER_EXIT.json')
    assert complete['status'] == 'complete' and complete['cumulativeParents'] == 2414
    assert complete['samples'] == 325181 and complete['updates'] == 40648
    assert complete['globalStep'] == 241899 and complete['cumulativeSamples'] == 1935189
    assert complete['automaticBeyond2414'] is False and exit_record['returncode'] == 0
    workers = read('output/WORKERS.json')
    identities = [read('CONTROLLER_STARTED.json'), workers['coordinator'], *workers['workers'], workers['encoder']]
    stopped = [process(identity) for identity in identities]
    assert not any(p['identityMatched'] for p in stopped), '登记训练进程尚未全部退出'
    final = complete['finalCheckpoint']
    assert final['file'] in {'checkpoint-0.pt', 'checkpoint-1.pt'}
    assert root('sha256sum ' + PHONE + '/job/output/' + final['file']).split()[0] == final['sha256']
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    prefix = '/data/local/tmp/aeii-2414-completion-' + stamp
    listing, hashes, remote_archive = prefix + '-files.txt', prefix + '-sha256.txt', prefix + '.tar'
    # 排除可重建输入工作副本及运行时；其余任务文件、检查点和日志全部保留。
    command = r'''set -e
test "$(readlink -f SOURCE)" = SOURCE
cd SOURCE
find . \( -path ./job/inputs -o -path ./job/node -o -name __pycache__ \) -prune -o -type f -print | sort > LIST
while IFS= read -r FILE; do sha256sum "$FILE"; done < LIST > HASHES
tar -cf ARCHIVE -T LIST
chmod 644 ARCHIVE
sha256sum ARCHIVE
'''.replace('SOURCE', PHONE).replace('LIST', listing).replace('HASHES', hashes).replace('ARCHIVE', remote_archive)
    digest = root(command, timeout=120).split()[-2]
    manifest = root('cat ' + hashes)
    expected = {}
    for line in manifest.splitlines():
        file_sha, name = line.split(None, 1)
        name = name.lstrip('*').removeprefix('./')
        assert name not in expected
        expected[name] = file_sha
    assert 'job/output/' + final['file'] in expected
    assert 'job/output/COMPLETE.json' in expected and 'job/CONTROLLER_EXIT.json' in expected
    assert {'job/output/final.json', 'job/output/final.bin'} <= set(expected), '缺少导出模型'
    assert any(name.endswith('METRICS.jsonl') for name in expected), '缺少更新日志'
    DEST.mkdir(exist_ok=True)
    (DEST / 'PHONE_SHA256SUMS').write_text(manifest + '\n', encoding='utf-8')
    archive = DEST / 'phone-completion.tar'
    assert not archive.exists(), '传输包已存在，保留现场后再处理'
    call('pull', remote_archive, archive, timeout=180)
    assert sha(archive) == digest, '传输包摘要不一致'
    extracted = set()
    with tarfile.open(archive, 'r') as tar:
        for member in tar:
            assert member.isfile(), member.name
            name = member.name.removeprefix('./')
            assert name in expected and name not in extracted
            target = (DEST / name).resolve()
            assert target.is_relative_to(DEST.resolve())
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                assert sha(target) == expected[name], name
            else:
                with target.open('xb') as output:
                    shutil.copyfileobj(tar.extractfile(member), output)
            assert sha(target) == expected[name], name
            extracted.add(name)
    assert extracted == set(expected), '包内容与逐文件清单不一致'
    # 再次核对手机源文件，确认传输期间源数据没有变化。
    root('cd ' + PHONE + ' && sha256sum -c ' + hashes + ' > ' + prefix + '-post-check.txt', timeout=120)
    complete_local = json.loads((DEST / 'job/output/COMPLETE.json').read_text(encoding='utf-8'))
    assert complete_local == complete
    checkpoint = DEST / 'job/output' / final['file']
    assert sha(checkpoint) == final['sha256']
    verified = [{'relativePath': name, 'local': str((DEST / name).resolve()),
                 'remote': PHONE + '/' + name, 'sha256': expected[name], 'bytes': (DEST / name).stat().st_size}
                for name in sorted(expected)]
    receipt = {'status': 'complete', 'checkedUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
               'phoneRoot': PHONE, 'destination': str(DEST.resolve()), 'files': verified,
               'fileCount': len(verified), 'totalFileBytes': sum(item['bytes'] for item in verified),
               'archiveBytes': archive.stat().st_size, 'archiveSha256': digest,
               'allFileHashesVerified': True, 'phoneSourceHashesReverifiedAfterTransfer': True,
               'finalCheckpoint': str(checkpoint.resolve()), 'finalCheckpointSha256': final['sha256'],
               'complete': complete, 'controllerExit': exit_record, 'registeredProcesses': stopped,
               'newTrainingStarted': False, 'strictReplayExecuted': False, 'phoneFilesDeleted': False}
    write(DEST / 'SYNC_RECEIPT.json', receipt)
    write(HERE / 'SYNC_2414.json', receipt)
    print(json.dumps({k: v for k, v in receipt.items() if k not in {'files', 'complete', 'registeredProcesses'}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
