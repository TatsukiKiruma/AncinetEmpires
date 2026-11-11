"""第二轮授权清理：逐文件计划，保留模型、文档、源码与当前训练数据。"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
import os
import io
import pickletools
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'ai_training/cleanup_20261025_round2'
OUT.mkdir(exist_ok=True)
REVIEW = json.loads((ROOT / '_work/mixed-assets-review-20261025.json').read_text(encoding='utf-8'))
SOURCE = {'.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh', '.ps1', '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.html', '.css'}

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def digest(path):
    with open(path, 'rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def walk(folder):
    # 不跟随目录联接或其他重解析点。
    with os.scandir(folder) as items:
        for item in items:
            st = item.stat(follow_symlinks=False)
            if getattr(st, 'st_file_attributes', 0) & 0x400 or item.is_symlink():
                continue
            if item.is_dir(follow_symlinks=False):
                yield from walk(item.path)
            elif item.is_file(follow_symlinks=False):
                yield Path(item.path), st

def checked(path):
    target = Path(os.path.abspath(path))
    if not any(target.is_relative_to(ROOT / name) for name in ['ai_training', 'captures']):
        raise RuntimeError(f'删除目标不在授权区域：{target}')
    part = target
    while part != ROOT:
        if part.is_symlink() or part.is_junction():
            raise RuntimeError(f'删除目标经过链接：{part}')
        part = part.parent
    if target.resolve() != target or not target.is_file():
        raise RuntimeError(f'删除目标不是已核对的真实文件：{target}')
    return target

def rel(path):
    return str(path.relative_to(ROOT)).replace('\\', '/')

def member_digest(stream):
    return hashlib.file_digest(stream, 'sha256').hexdigest()

def packages():
    results = []
    scratch = ROOT / 'ai_training/phone_2m_scratch100_20261024'
    for name in ['phone_2m_scratch100_20261024', 'phone_2m_workers_20261024', 'phone_2m_continue900_20261024']:
        folder = ROOT / 'ai_training' / name
        archive = folder / ('training-payload.tar' if name == scratch.name else 'payload.tar')
        plan = json.loads((folder / 'PLAN.json').read_text(encoding='utf-8')) if (folder / 'PLAN.json').exists() else {}
        inputs = {r['parentId']: r for r in plan.get('inputs', [])}
        node_hashes = {}
        if 'continue900' in name:
            node_archive = folder / 'runtime-assets/node-v22.14.0-linux-arm64.tar.xz'
            with tarfile.open(node_archive, 'r:xz') as source:
                for n in ['bin/node', 'LICENSE']:
                    with source.extractfile('node-v22.14.0-linux-arm64/' + n) as stream:
                        node_hashes['job/node/' + n] = member_digest(stream)
        rows, failures = [], []
        with tarfile.open(archive, 'r:') as tar:
            for item in tar:
                if item.isdir():
                    continue
                if not item.isfile() or '..' in PurePosixPath(item.name).parts or item.name.startswith('/'):
                    failures.append({'member': item.name, 'reason': '非普通安全成员'})
                    continue
                if name == scratch.name:
                    copy = folder / item.name if item.name.startswith('data/') else folder / 'payload' / item.name
                elif item.name == 'job/base-checkpoint.pt':
                    copy = Path(plan['baseCheckpoint'])
                elif item.name.startswith('job/inputs/'):
                    parts = item.name.split('/')
                    copy = Path(inputs[parts[2]]['directory']) / '/'.join(parts[3:])
                else:
                    copy = folder / item.name.removeprefix('job/')
                with tar.extractfile(item) as stream:
                    h = member_digest(stream)
                expected = node_hashes.get(item.name)
                origin = str(node_archive) + ':' + item.name if expected else str(copy)
                if expected is None and copy.is_file():
                    expected = digest(copy)
                matched = expected == h
                rows.append({'member': item.name, 'bytes': item.size, 'sha256': h, 'copy': origin, 'matched': matched})
                if not matched:
                    failures.append({'member': item.name, 'reason': '独立副本缺失或内容不同', 'copy': origin})
        results.append({'archive': rel(archive), 'allMembersDuplicated': not failures, 'members': rows, 'failures': failures, 'archiveSha256': digest(archive)})
        print(json.dumps({'archive': rel(archive), 'members': len(rows), 'unconfirmed': len(failures)}, ensure_ascii=False), flush=True)
    save('package-verification.json', results)

def plan():
    if (OUT / 'delete-plan.json').exists():
        raise RuntimeError('已有清单，不覆盖')
    package_checks = json.loads((OUT / 'package-verification.json').read_text(encoding='utf-8'))
    allowed_packages = {r['archive'] for r in package_checks if r['allMembersDuplicated']}
    # 仅解析序列化格式，不反序列化或执行模型代码；结合生成源码确认是校准缓存。
    calibration_checks = []
    calibration_files = list((ROOT / 'ai_training/dual_stream_v2_phase4_20261020').glob('*-calibration.pt'))
    calibration_files += list((ROOT / 'ai_training/dual_stream_v2_phase51_cache_archive_20261021').glob('*.pt.gz'))
    expected = {'maximum', 'targetHead', 'weight', 'waste', 'recruit', 'valueLogits', 'target', 'active', 'bucket', 'army', 'income', 'sources'}
    for file in calibration_files:
        with (gzip.open(file, 'rb') if file.suffix == '.gz' else file.open('rb')) as stream:
            data = stream.read()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            metadata = next(n for n in archive.namelist() if n.endswith('/data.pkl'))
            strings = {arg for op, arg, pos in pickletools.genops(archive.read(metadata)) if isinstance(arg, str)}
        calibration_checks.append({'path': rel(file), 'isCalibrationCache': expected <= strings and 'state_dict' not in strings,
            'producer': 'ai_training/dual_stream_v2_phase4_20261020/calibrate.py:collect', 'sha256': digest(file)})
    save('calibration-verification.json', calibration_checks)
    confirmed_calibration = {r['path'] for r in calibration_checks if r['isCalibrationCache']}
    groups = REVIEW['candidates'] + [
        {'label': '旧v2教材', 'prefixes': ['ai_training/dual_stream_v2_phase3_20261020/corpus/']},
        {'label': '已核验校准缓存', 'prefixes': sorted(confirmed_calibration)}]
    entries = []
    for name in ['ai_training', 'captures', 'src', 'tools', 'assets', 'APK', 'docs']:
        entries.extend(walk(ROOT / name))
    print(json.dumps({'scannedFiles': len(entries)}), flush=True)
    hard = json.loads((ROOT / 'ai_training/hard_native_admission_20261024/SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
    raw_keep = {}
    for parent in hard['parents']:
        for name, metadata in parent['files'].items():
            file = Path(parent['directory']) / name
            raw_keep[rel(file)] = metadata
    protected = [Path(s) for group in REVIEW['keep'].values() for s in group]
    fixtures = {f'ai_training/data_acceptance_20261016/phone/full_v6/{part}/{name}' for part, names in [
        ('receipts', ['s0003.json', 's0005.json']), ('candidate_shards', ['s0003.jsonl.gz', 's0005.jsonl.gz'])] for name in names}
    delete, kept = [], []
    for file, st in entries:
        r = rel(file)
        group = next((g for g in groups if any(
            (r.startswith(s.split('*')[0]) and '.interrupted-' in r) if '*' in s else (r.startswith(s) if s.endswith('/') else r == s)
            for s in g['prefixes'])), None)
        if not group:
            continue
        if r in fixtures or r in raw_keep:
            kept.append({'path': r, 'reason': '当前数据或测试夹具'})
            continue
        is_package = r in allowed_packages
        if not is_package and any(file == p or file.is_relative_to(p) for p in protected):
            kept.append({'path': r, 'reason': '清单指定保护路径'})
            continue
        label, name = group['label'], file.name.lower()
        selected = is_package
        if label == '已核验校准缓存':
            selected = r in confirmed_calibration
        elif label == '失败Frida版本':
            selected = file.suffix in {'.pyd', '.xz', '.pyc'} or name.startswith('aeii-hard-frida-')
        elif label != '重复部署包':
            selected = file.suffix == '.gz' and not re.search(r'model|weight|checkpoint|\.pt\.gz$', name)
            selected |= '.interrupted-' in name
            selected |= file.suffix == '.jsonl' and not re.search(r'manifest|index|ledger|receipt|status|metric|summary|report', name)
            # 未压缩旧采集包逐项确认没有模型、源码或文档，才列入。
            if label == '旧普通AI原始采集' and file.suffix == '.tar':
                with tarfile.open(file, 'r:') as tar:
                    members = tar.getmembers()
                    selected = all(not m.isfile() or (PurePosixPath(m.name).suffix.lower() not in {'.pt', '.pth', '.onnx', '.safetensors', '.md', '.txt', '.py', '.ts', '.js'} and not re.search(r'(model|weight|checkpoint)', PurePosixPath(m.name).name, re.I)) for m in members)
        if file.suffix in SOURCE and file.suffix != '.jsonl':
            selected = False
        if selected:
            checked(file)
            delete.append({'path': r, 'group': label, 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns,
                'inode': st.st_ino, 'links': st.st_nlink})
        else:
            kept.append({'path': r, 'reason': '保留模型、源码、文档、元数据或未确认条件项'})
    save('conditional-retained.json', {'testDependentDatasetsKept': REVIEW['additionalConditional'][0],
        'calibrationCachesVerified': calibration_checks,
        'packagesKept': [r for r in package_checks if not r['allMembersDuplicated']],
        'reason': '不改旧测试；校准缓存经生成源码和序列化字段核验，其他不能完整确认的条件项保留。'})
    deleted_names = {f['path'] for f in delete}
    if deleted_names & set(raw_keep):
        raise RuntimeError('清单误包含困难原始数据')
    save('delete-plan.json', {'files': delete, 'logicalBytes': sum(f['bytes'] for f in delete), 'scope': '逐文件删除，不递归移除目录；所有JSON、文档、源码、模型及未确认资产保留'})
    save('retained-candidates.json', kept)
    survivors = [(f, st) for f, st in entries if rel(f) not in deleted_names and not f.is_relative_to(OUT)]
    def fingerprint(item):
        f, st = item
        h = digest(f)
        key = rel(f)
        if key in raw_keep and (st.st_size != raw_keep[key]['bytes'] or h != raw_keep[key]['sha256']):
            raise RuntimeError(f'困难原件摘要不匹配：{key}')
        return {'path': key, 'bytes': st.st_size, 'sha256': h}
    records = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for row in pool.map(fingerprint, survivors):
            records.append(row)
            if len(records) % 20000 == 0:
                print(json.dumps({'protectedHashed': len(records)}), flush=True)
    seen = {r['path'] for r in records}
    if set(raw_keep) - seen:
        raise RuntimeError('困难原件缺失')
    save('protected-before.json', records)
    save('hard3000-before.json', {'parents': len(hard['parents']), 'uniqueParents': len({p['parentId'] for p in hard['parents']}), 'files': len(raw_keep), 'allSha256Matched': True})
    print(json.dumps({'deleteFiles': len(delete), 'logicalGiB': sum(r['bytes'] for r in delete)/2**30, 'protected': len(records)}), flush=True)

def execute():
    if (OUT / 'deleted.jsonl').exists():
        raise RuntimeError('已有删除记录，不重复执行')
    if not (OUT / 'protected-before.json').exists():
        raise RuntimeError('保护摘要未完成')
    plan = json.loads((OUT / 'delete-plan.json').read_text(encoding='utf-8'))
    for row in plan['files']:
        st = checked(ROOT / row['path']).stat()
        if (st.st_size, st.st_mtime_ns, st.st_ino) != (row['bytes'], row['mtimeNs'], row['inode']):
            raise RuntimeError(f'扫描后候选变化：{row["path"]}')
    before = shutil.disk_usage(ROOT).free
    save('space-before.json', {'free': before, 'at': time.time()})
    unique = 0
    with (OUT / 'deleted.jsonl').open('x', encoding='utf-8') as log:
        for row in plan['files']:
            file = checked(ROOT / row['path'])
            st = file.stat()
            if (st.st_size, st.st_mtime_ns, st.st_ino) != (row['bytes'], row['mtimeNs'], row['inode']):
                raise RuntimeError('删除前文件变化')
            last = st.st_nlink == 1
            file.unlink()
            unique += row['bytes'] if last else 0
            log.write(json.dumps({**row, 'lastLinkRemoved': last}, ensure_ascii=False) + '\n')
            log.flush()
    after = shutil.disk_usage(ROOT).free
    result = {'filesDeleted': len(plan['files']), 'logicalBytesDeleted': plan['logicalBytes'], 'lastLinkContentBytes': unique,
        'diskFreeBefore': before, 'diskFreeAfter': after, 'diskFreeDelta': after-before, 'note': '磁盘差值含系统并行活动；压缩及硬链接使内容大小不等于实际释放量。'}
    save('deletion-result.json', result)
    print(json.dumps(result, ensure_ascii=False), flush=True)

def verify():
    records = json.loads((OUT / 'protected-before.json').read_text(encoding='utf-8'))
    def check(row):
        f = ROOT / row['path']
        return row['path'] if not f.is_file() or digest(f) != row['sha256'] else None
    with ThreadPoolExecutor(max_workers=8) as pool:
        changed = [r for r in pool.map(check, records) if r]
    plan = json.loads((OUT / 'delete-plan.json').read_text(encoding='utf-8'))
    remaining = [r['path'] for r in plan['files'] if (ROOT / r['path']).exists()]
    result = {'filesChecked': len(records), 'changedOrMissing': changed, 'deleteTargetsStillExist': remaining}
    save('integrity-after.json', result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    if changed or remaining:
        raise RuntimeError('清理完整性检查失败')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['packages', 'plan', 'execute', 'verify'])
    mode = parser.parse_args().mode
    globals()[mode]()
