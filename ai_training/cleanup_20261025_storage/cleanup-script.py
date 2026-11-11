"""按已授权清单整理历史产物；所有删除均来自预先保存的逐文件清单。"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
TRAIN = ROOT / 'ai_training'
OUT = TRAIN / 'cleanup_20261025_storage'
OUT.mkdir(exist_ok=True)
PLAN = json.loads((ROOT / '_work/training-cleanup-proposal-20261025.json').read_text(encoding='utf-8'))
ARCHIVE = TRAIN / 'hard_native_3000_20261022/original-backup-02/original-data.tar'
RESTORE = TRAIN / 'hard_native_3000_20261022/preserved-original-save-20261025'
SOURCE_SUFFIXES = {'.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.ps1', '.sh', '.html', '.css', '.md', '.toml', '.yaml', '.yml'}

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def walk(root):
    if not root.exists() or root.is_symlink() or root.is_junction():
        return
    for item in root.iterdir():
        if item.is_symlink() or item.is_junction():
            continue
        if item.is_dir():
            yield from walk(item)
        elif item.is_file():
            yield item

def checked(path):
    absolute = Path(os.path.abspath(path))
    if not absolute.is_relative_to(TRAIN) or absolute == TRAIN:
        raise RuntimeError(f'目标不在训练目录内：{absolute}')
    current = absolute
    while current != TRAIN:
        if current.is_symlink() or current.is_junction():
            raise RuntimeError(f'目标经过链接：{current}')
        current = current.parent
    if absolute.resolve() != absolute:
        raise RuntimeError(f'目标解析变化：{absolute}')
    return absolute

def extract_backup():
    if (OUT / 'backup-extraction.json').exists():
        raise RuntimeError('提取回执已存在，避免覆盖')
    receipt = json.loads((ARCHIVE.parent / 'BACKUP_VERIFIED.json').read_text())
    expected = {}
    for line in (ARCHIVE.parent / 'device-files.sha256').read_text().splitlines():
        if len(line) > 66:
            expected[line[66:]] = line[:64]
    RESTORE.mkdir(exist_ok=False)
    entries, excluded, total = [], {}, 0
    # 只排除明确的旧采集根；未知个人数据保守保留。
    with tarfile.open(ARCHIVE, 'r:') as tar:
        for member in tar:
            parts = PurePosixPath(member.name).parts
            if '..' in parts or member.name.startswith('/'):
                raise RuntimeError('备份路径越界')
            if not member.isfile():
                if not member.isdir():
                    raise RuntimeError(f'需人工判断的备份链接：{member.name}')
                continue
            total += member.size
            old = '/files/.aeii/phone-' in member.name
            if old:
                key = '/'.join(parts[:6])
                excluded[key] = excluded.get(key, 0) + member.size
                continue
            target = checked(RESTORE.joinpath(*parts))
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as source, target.open('xb') as dest:
                shutil.copyfileobj(source, dest)
            digest = sha(target)
            if target.stat().st_size != member.size or expected.get(member.name) != digest:
                raise RuntimeError(f'存档校验失败：{member.name}')
            entries.append({'path': str(target.relative_to(ROOT)), 'archivePath': member.name, 'bytes': member.size, 'sha256': digest})
    apk = ARCHIVE.parent / 'original.apk'
    if sha(apk) != receipt['originalApkSha256']:
        raise RuntimeError('原APK摘要不匹配')
    shutil.copy2(apk, RESTORE / 'original.apk')
    if sha(RESTORE / 'original.apk') != receipt['originalApkSha256']:
        raise RuntimeError('原APK复制校验失败')
    for name in ['BACKUP_VERIFIED.json', 'device-files.sha256']:
        shutil.copy2(ARCHIVE.parent / name, RESTORE / name)
    save('backup-extraction.json', {'archive': str(ARCHIVE), 'archiveBytes': ARCHIVE.stat().st_size,
        'originalArchiveSha256FromReceipt': receipt['archiveSha256'], 'archiveHashRecomputed': False,
        'allExtractedFilesMatchOriginalDeviceSha256': True, 'files': entries,
        'originalApkSha256': receipt['originalApkSha256'], 'originalApkBytes': apk.stat().st_size,
        'excludedOldExperimentBytes': excluded, 'payloadBytes': total,
        'note': '仅提取并核验存档和其他非phone实验资料；未修改手机；完整tar尚待执行阶段删除。'})
    print(json.dumps({'extractedFiles': len(entries), 'extractedBytes': sum(e['bytes'] for e in entries), 'apkBytes': apk.stat().st_size}, ensure_ascii=False), flush=True)

def prepare():
    if (OUT / 'delete-plan.json').exists():
        raise RuntimeError('删除清单已存在，避免覆盖')
    scopes = [TRAIN / row['path'] for row in PLAN['第一二批候选']]
    protected = set()
    protected_dirs = set()
    critical_roots = [ROOT / 'src', ROOT / 'tools', ROOT / 'assets', ROOT / 'APK']
    critical_roots += [TRAIN / name for name in ['phone_2m_scratch100_20261024', 'phone_2m_workers_20261024',
        'phone_2m_continue900_20261024', 'hard_native_1000_20261022', 'hard_native_second_20261023',
        'hard_native_admission_20261024', 'phone_collection_handoff_20261024', 'pretrain_preflight_20261022',
        'hard_native_3000_20261022/assets', 'data_acceptance_20261016', 'dual_stream_v2_phase1_20261020',
        'dual_stream_v2_phase2_20261020', 'dual_stream_v2_phase5_20261020', 'expert_iteration_2m_20261022']]
    all_files = list(walk(TRAIN))
    print(json.dumps({'stage': 'inventory', 'files': len(all_files)}), flush=True)
    source_files = [f for f in all_files if f.suffix in SOURCE_SUFFIXES]
    critical_files = set(source_files)
    for folder in critical_roots:
        critical_files.update(walk(folder))
    # 检查当前源码、测试与配置中的静态路径；登记模型另行精确保留。
    path_cache = {}
    for f in list(critical_files):
        current_code = any(f.is_relative_to(folder) for folder in critical_roots) and f.suffix in {'.ts', '.tsx', '.py', '.js', '.mjs'}
        if not (current_code or f.name.endswith('.test.ts')) or f.stat().st_size > 2 * 1024**2:
            continue
        text = f.read_text(encoding='utf-8-sig', errors='replace')
        for match in re.finditer(r'''["']([^"'\r\n]{3,400})["']''', text):
            value = match.group(1).replace('\\\\', '/')
            if '/' not in value and '\\' not in value:
                continue
            for parent in [f.parent, ROOT, TRAIN]:
                key = str(parent / value)
                if key not in path_cache:
                    try:
                        raw = Path(os.path.abspath(key))
                        path_cache[key] = raw.resolve() if raw.exists() else None
                    except (OSError, ValueError):
                        path_cache[key] = None
                candidate = path_cache[key]
                if candidate is None or not candidate.is_relative_to(TRAIN):
                    continue
                if candidate.is_file():
                    protected.add(candidate)
                elif candidate.is_dir() and candidate != TRAIN and any(candidate.is_relative_to(s) for s in scopes):
                    protected_dirs.add(candidate)
    registry = json.loads((ROOT / 'src/game/ai/models/model_registry.json').read_text(encoding='utf-8'))
    registry_status = []
    for entry in registry['policies'].values():
        ck = entry.get('checkpoint')
        if not ck:
            continue
        target = TRAIN / ck['relativePath']
        exists = target.is_file()
        registry_status.append({'path': str(target), 'existedBefore': exists})
        if exists:
            protected.add(target.resolve())
            critical_files.add(target)
    # 不因清理让可选冠军测试从执行变成跳过。
    champion = TRAIN / 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
    if champion.is_file():
        protected.add(champion.resolve())
        critical_files.add(champion)
    candidates = []
    for f in all_files:
        if not any(f.is_relative_to(scope) for scope in scopes):
            continue
        st = f.stat()
        if f.suffix in SOURCE_SUFFIXES or f.resolve() in protected or any(f.is_relative_to(d) for d in protected_dirs):
            continue
        # 轻量清单、实验结论、日志、数据划分等证据保留；清理训练数据和大体积序列化产物。
        name = f.name.lower()
        data = f.suffix.lower() in {'.pt', '.pth', '.bin', '.npy', '.npz', '.gz', '.tar', '.zip', '.pkl', '.pickle', '.safetensors'}
        data |= f.suffix.lower() == '.jsonl' and not re.search(r'manifest|ledger|receipt|index|budget|registry', name)
        data |= f.suffix.lower() in {'.json', '.snapshot'} and st.st_size >= 1024**2 and not re.search(r'manifest|summary|report|metrics|index|registry|split', name)
        if data:
            checked(f)
            candidates.append({'path': str(f.relative_to(ROOT)), 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns,
                'device': st.st_dev, 'inode': st.st_ino, 'links': st.st_nlink})
    save('protected-paths.json', {'files': sorted(map(str, protected)), 'directories': sorted(map(str, protected_dirs)), 'registry': registry_status})
    print(json.dumps({'stage': 'hash-protected', 'files': len(critical_files), 'candidates': len(candidates)}), flush=True)
    snapshot = []
    for f in sorted(critical_files):
        if not f.is_file():
            continue
        snapshot.append({'path': str(f.relative_to(ROOT)), 'bytes': f.stat().st_size, 'sha256': sha(f)})
    save('preserved-before.json', snapshot)
    backup = json.loads((OUT / 'backup-extraction.json').read_text(encoding='utf-8'))
    st = ARCHIVE.stat()
    candidates.append({'path': str(ARCHIVE.relative_to(ROOT)), 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns,
        'device': st.st_dev, 'inode': st.st_ino, 'links': st.st_nlink})
    save('delete-plan.json', {'created': time.time(), 'files': candidates, 'note': '仅删除逐项列出的真实文件；不删除目录、不经过联接。'})
    print(json.dumps({'candidates': len(candidates), 'logicalGiB': sum(x['bytes'] for x in candidates)/2**30, 'protectedHashed': len(snapshot), 'protectedDirectories': len(protected_dirs)}), flush=True)

def execute():
    if (OUT / 'deleted.jsonl').exists():
        raise RuntimeError('执行日志已存在，不重复执行')
    plan = json.loads((OUT / 'delete-plan.json').read_text(encoding='utf-8'))
    backup = json.loads((OUT / 'backup-extraction.json').read_text(encoding='utf-8'))
    for f in backup['files']:
        if sha(ROOT / f['path']) != f['sha256']:
            raise RuntimeError('提取存档已变化')
    if sha(RESTORE / 'original.apk') != backup['originalApkSha256']:
        raise RuntimeError('提取APK已变化')
    for f in plan['files']:
        target = checked(ROOT / f['path'])
        st = target.stat()
        if (st.st_size, st.st_mtime_ns, st.st_ino) != (f['bytes'], f['mtimeNs'], f['inode']):
            raise RuntimeError(f'预检后文件变化：{target}')
    before = shutil.disk_usage(ROOT)
    save('space-before.json', {'free': before.free, 'used': before.used, 'time': time.time()})
    count = logical = unique_released = 0
    with (OUT / 'deleted.jsonl').open('x', encoding='utf-8') as log:
        for f in plan['files']:
            target = checked(ROOT / f['path'])
            st = target.stat()
            if (st.st_size, st.st_mtime_ns, st.st_ino) != (f['bytes'], f['mtimeNs'], f['inode']):
                raise RuntimeError('删除前文件变化')
            last_link = st.st_nlink == 1
            target.unlink()
            count += 1
            logical += f['bytes']
            unique_released += f['bytes'] if last_link else 0
            log.write(json.dumps({**f, 'lastLinkRemoved': last_link}, ensure_ascii=False) + '\n')
            log.flush()
    after = shutil.disk_usage(ROOT)
    save('deletion-result.json', {'filesDeleted': count, 'logicalBytesDeleted': logical,
        'lastLinkContentBytesRemoved': unique_released, 'diskFreeBefore': before.free,
        'diskFreeAfter': after.free, 'diskFreeDelta': after.free-before.free,
        'caveat': '磁盘空闲变化包含系统及其它进程活动；最后硬链接内容大小不等于分配簇大小。', 'time': time.time()})
    print((OUT / 'deletion-result.json').read_text(encoding='utf-8'), flush=True)

def verify():
    snapshot = json.loads((OUT / 'preserved-before.json').read_text(encoding='utf-8'))
    def verify_one(row):
        f = ROOT / row['path']
        if not f.is_file() or sha(f) != row['sha256']:
            return row['path']
        return None
    # 完整核对同一份保护清单；并行读取仅减少等待，不减少检查对象。
    with ThreadPoolExecutor(max_workers=8) as pool:
        changed = [result for result in pool.map(verify_one, snapshot) if result is not None]
    plan = json.loads((OUT / 'delete-plan.json').read_text(encoding='utf-8'))
    remaining = [r['path'] for r in plan['files'] if (ROOT / r['path']).exists()]
    save('preserved-verification.json', {'checkedFiles': len(snapshot), 'changedOrMissing': changed, 'deleteTargetsStillExist': remaining})
    print(json.dumps({'checkedFiles': len(snapshot), 'changedOrMissing': changed, 'deleteTargetsStillExist': remaining}, ensure_ascii=False), flush=True)
    if changed or remaining:
        raise RuntimeError('清理核验未通过')

def resume_prepare():
    # 复用已经完整完成并落盘的依赖扫描结果，不缩小任何保护路径。
    evidence = json.loads((OUT / 'protected-paths.json').read_text(encoding='utf-8'))
    protected = {Path(s) for s in evidence['files']}
    protected_dirs = {Path(s) for s in evidence['directories']}
    scopes = [TRAIN / row['path'] for row in PLAN['第一二批候选']]
    critical_roots = [ROOT / 'src', ROOT / 'tools', ROOT / 'assets', ROOT / 'APK']
    critical_roots += [TRAIN / name for name in ['phone_2m_scratch100_20261024', 'phone_2m_workers_20261024',
        'phone_2m_continue900_20261024', 'hard_native_1000_20261022', 'hard_native_second_20261023',
        'hard_native_admission_20261024', 'phone_collection_handoff_20261024', 'pretrain_preflight_20261022',
        'hard_native_3000_20261022/assets', 'data_acceptance_20261016', 'dual_stream_v2_phase1_20261020',
        'dual_stream_v2_phase2_20261020', 'dual_stream_v2_phase5_20261020', 'expert_iteration_2m_20261022']]
    all_files = list(walk(TRAIN))
    critical_files = {f for f in all_files if f.suffix in SOURCE_SUFFIXES}
    for folder in critical_roots:
        critical_files.update(walk(folder))
    for row in evidence['registry']:
        if row['existedBefore']:
            critical_files.add(Path(row['path']))
    champion = TRAIN / 'v16/out/v16_20260926_core/experiments/P1/s2026/P1_final.json'
    if champion.is_file():
        critical_files.add(champion)
    candidates = []
    scope_strings = [str(s).lower() + os.sep for s in scopes]
    dir_strings = [str(s).lower() + os.sep for s in protected_dirs]
    for f in all_files:
        text = str(f).lower()
        if not any(text.startswith(s) for s in scope_strings):
            continue
        st = f.stat()
        if f.suffix in SOURCE_SUFFIXES or f.resolve() in protected or any(text.startswith(d) for d in dir_strings):
            continue
        name = f.name.lower()
        data = f.suffix.lower() in {'.pt', '.pth', '.bin', '.npy', '.npz', '.gz', '.tar', '.zip', '.pkl', '.pickle', '.safetensors'}
        data |= f.suffix.lower() == '.jsonl' and not re.search(r'manifest|ledger|receipt|index|budget|registry', name)
        data |= f.suffix.lower() in {'.json', '.snapshot'} and st.st_size >= 1024**2 and not re.search(r'manifest|summary|report|metrics|index|registry|split', name)
        if data:
            checked(f)
            candidates.append({'path': str(f.relative_to(ROOT)), 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns,
                'device': st.st_dev, 'inode': st.st_ino, 'links': st.st_nlink})
    st = ARCHIVE.stat()
    candidates.append({'path': str(ARCHIVE.relative_to(ROOT)), 'bytes': st.st_size, 'mtimeNs': st.st_mtime_ns,
        'device': st.st_dev, 'inode': st.st_ino, 'links': st.st_nlink})
    save('delete-plan.json', {'created': time.time(), 'files': candidates, 'note': '复用完整依赖扫描；保持全部保护路径；逐文件删除。'})
    print(json.dumps({'stage': 'hash-protected-parallel', 'files': len(critical_files), 'candidates': len(candidates)}), flush=True)
    def fingerprint(f):
        return {'path': str(f.relative_to(ROOT)), 'bytes': f.stat().st_size, 'sha256': sha(f)}
    snapshot = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for row in pool.map(fingerprint, sorted(critical_files)):
            snapshot.append(row)
            if len(snapshot) % 10000 == 0:
                print(json.dumps({'hashed': len(snapshot)}), flush=True)
    save('preserved-before.json', snapshot)
    print(json.dumps({'candidates': len(candidates), 'logicalGiB': sum(x['bytes'] for x in candidates)/2**30, 'protectedHashed': len(snapshot)}), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['extract', 'prepare', 'resume-prepare', 'execute', 'verify'])
    args = parser.parse_args()
    {'extract': extract_backup, 'prepare': prepare, 'resume-prepare': resume_prepare, 'execute': execute, 'verify': verify}[args.mode]()
