"""进程退出后补齐证据；在读取前排除运行锁及可变显示文件。"""
import datetime
import hashlib
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLD = HERE.with_name('stage4_v5')
ROOT = HERE.parents[2]
DATA = Path('D:/AncientEmpiresData/continuation_stage4_v5_20261101_v1')


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def publish(file, value):
    with file.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())


def main():
    if not (HERE / 'RUN_CLOSED.json').exists():
        raise RuntimeError('评测未关闭，禁止收尾')
    if (HERE / 'EVIDENCE_MANIFEST.json').exists():
        raise RuntimeError('证据清单已经存在，禁止覆盖')
    recovery = read(HERE / 'RECOVERY_PLAN.json')
    plan = read(OLD / 'PLAN.json')
    for file, expected in recovery['sources'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('恢复源码摘要变化：' + file)
    for file, expected in recovery['preservedInterrupted'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('中断原件摘要变化：' + file)
    for file, expected in plan['preserved'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('历史保全文件变化：' + file)
    for file, expected in plan['runtime']['files'].items():
        if digest(ROOT / file) != expected:
            raise RuntimeError('冻结运行时变化：' + file)
    files = {}
    ids = []
    for directory in [DATA / 'C1', DATA / 'stage4_v5_resume_20261101_v2', DATA / HERE.name]:
        for receipt in directory.glob('*.receipt.json'):
            row = read(receipt)
            for file, expected in row['files'].items():
                actual = digest(Path(file))
                if actual != expected:
                    raise RuntimeError('完成收据变化：' + file)
                files[file] = actual
            files[str(receipt)] = digest(receipt)
            output = receipt.with_name(receipt.name.removesuffix('.receipt.json'))
            summary = read(output / 'SUMMARY.json')
            if not summary['complete'] or not summary['gpuExited'] or len(summary['games']) != 1:
                raise RuntimeError('完成合同不符')
            ids.append(summary['games'][0]['id'])
    if len(ids) != len(set(ids)) or len(ids) != 16:
        raise RuntimeError('完成局覆盖数量错误')
    gate = read(HERE / 'DEVELOPMENT_GATE_REPORT.json')
    if gate['status'] != 'development_gate_rejected' or gate['summary']['completed'] != 16:
        raise RuntimeError('门禁结论错误')
    if (OLD / 'FINAL_TEST_ATTEMPT.json').exists():
        raise RuntimeError('封存令牌不应存在')
    publish(HERE / 'FINALIZATION_REPAIR.json', {
        'completedAt': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),
        'evaluationsComplete': True, 'completedReceiptsVerified': 16, 'missing': gate['summary']['missing'],
        'originalFailurePreserved': 'RUN_FAILURE_1793546339093470000.json',
        'repair': '原清单先哈希全部文件再过滤，可能读取监督器持有的ACTIVE.lock；本次进程退出后先排除运行锁和可变显示文件再读取。',
        'runtimeAndHistoricalHashesVerified': True, 'childrenRemaining': 0, 'sealedAccess': 0, 'trainingUpdates': 0
    })
    excluded = []
    for directory in [DATA / HERE.name, HERE]:
        for file in sorted(directory.rglob('*')):
            if not file.is_file():
                continue
            if file.name in {'ACTIVE.lock', 'PROGRESS.json', 'EVIDENCE_MANIFEST.json'} or file.suffix in {'.pyc', '.pending'}:
                excluded.append(str(file))
                continue
            files[str(file)] = digest(file)
    files.update(recovery['preservedInterrupted'])
    publish(HERE / 'EVIDENCE_MANIFEST.json', {'created': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'files': files, 'excludedBeforeRead': excluded, 'completedGames': ids, 'childrenRemaining': 0,
         'trainingUpdates': 0, 'sealedAccess': 0})
    for file, expected in files.items():
        if digest(Path(file)) != expected:
            raise RuntimeError('收尾后证据摘要不一致：' + file)
    print(json.dumps({'finalized': True, 'verifiedGames': len(ids), 'evidenceFiles': len(files), 'sealedAccess': 0}))


if __name__ == '__main__':
    main()
