"""仅汇总已自然结束的手机父局，供正式分片接手；原始证据保留在原目录。"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / 'ai_training/hard_native_1000_20261022'
ADB = 'C:/Users/SHIINA/OneDrive/Documents/闲聊/手机投屏/scrcpy-win64-v5.0.1/adb.exe'


def read(command: str, missing: bool = False) -> str:
    assert "'" not in command
    result = subprocess.run([ADB, '-s', 'c2357770', 'shell', 'su', '-c', "'" + command + "'"], capture_output=True, timeout=25)
    if result.returncode and not missing:
        raise RuntimeError(result.stderr.decode('utf-8', 'replace'))
    return result.stdout.decode('utf-8', 'replace').strip()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    assert not destination.exists()
    inputs = json.loads(source.read_text(encoding='utf-8'))
    records, roots, duplicates = {}, [], []
    for sequence in (1, 2):
        receipt = TASK / f'runs/production-02/jobs/{sequence:04d}/collection-receipt.json'
        value = json.loads(receipt.read_text(encoding='utf-8'))
        assert value['collectionComplete'] and value['naturalEnd']
        records[sequence] = {'sequenceIndex': sequence, 'parentId': value['parentId'], 'source': str(receipt), 'receiptSha256': sha(receipt), 'naturalEnd': True}
    for item in inputs:
        phone, package = item['root'], item['package']
        assert re.fullmatch(r'/data/local/tmp/aeii-[A-Za-z0-9_-]+', phone)
        assert re.fullmatch(r'net\.toyknight\.aeii\.(?:android|worker0[1-3])', package)
        state = json.loads(read('cat ' + phone + '/STATE.json'))
        ledger = read('cat ' + phone + '/completed.tsv', missing=True)
        candidates = {}
        for line in ledger.splitlines():
            sequence, parent, attempt, epoch = line.split()
            candidates[attempt] = (int(sequence), parent, int(epoch))
        # 原控制器收尾间隙的自然终局也可保留，仍要求完整manifest和线程退出。
        attempt = state.get('attempt')
        if attempt and re.fullmatch(r'[A-Za-z0-9_-]+', attempt):
            folder = f'/data/user/0/{package}/files/.aeii-hard-production/{attempt}'
            terminal = read('cat ' + folder + '/STATE.json', missing=True)
            if terminal:
                terminal = json.loads(terminal)
                if terminal.get('standalonePhase') == 'complete':
                    candidates.setdefault(attempt, (int(state['activeSeq']), terminal['parentId'], int(state.get('updatedEpoch', 0))))
        for attempt, (sequence, parent, epoch) in candidates.items():
            assert re.fullmatch(r'[A-Za-z0-9_-]+', attempt)
            folder = f'/data/user/0/{package}/files/.aeii-hard-production/{attempt}'
            manifest_text = read('cat ' + folder + '/artifact-manifest.json')
            result_text = read('cat ' + folder + '/result.json')
            exited_text = read('cat ' + folder + '/THREAD_EXITED.json')
            manifest, result, exited = json.loads(manifest_text), json.loads(result_text), json.loads(exited_text)
            assert manifest['naturalEnd'] and result['naturalEnd'] and result.get('truncationReason') is None
            assert manifest['parentId'] == result['parentId'] == exited['parentId'] == parent
            assert manifest['attemptId'] == result['attemptId'] == exited['attemptId'] == attempt
            assert len(manifest['files']) == 6
            assert any(f['name'] == 'result.json' and f['sha256'] == hashlib.sha256(result_text.encode()).hexdigest() for f in manifest['files'])
            record = {'sequenceIndex': sequence, 'parentId': parent, 'attemptId': attempt, 'package': package, 'phoneDirectory': folder, 'sourceRoot': phone, 'completedEpoch': epoch, 'naturalEnd': True, 'actions': result['actions'], 'elapsedSeconds': result['elapsedSeconds'], 'pathCounts': result['pathCounts'], 'manifest': manifest, 'result': result, 'threadExit': exited, 'phoneOriginalsPreserved': True}
            if sequence in records:
                duplicates.append(record)
            else:
                records[sequence] = record
        roots.append({'root': phone, 'package': package, 'state': state, 'completedTsv': ledger})
    values = [records[key] for key in sorted(records)]
    output = {'schema': 'aeii-preserved-natural-parents-v1', 'utc': dt.datetime.now(dt.timezone.utc).isoformat(), 'completedParents': len(values), 'remainingParents': 1000 - len(values), 'parents': values, 'duplicateNaturalAttemptsPreserved': duplicates, 'sourceRoots': roots, 'independentReplayDeferred': True, 'dataMovedOrDeleted': False}
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'completedParents': len(values), 'remainingParents': 1000 - len(values), 'duplicates': len(duplicates), 'output': str(destination)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
