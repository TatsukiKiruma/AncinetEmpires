"""冻结算法不变；验证收据、隔离异常局并监督剩余开发局，不授予封存资格。"""
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid

ROOT = Path('C:/code/AncinetEmpires')
HERE = Path(__file__).resolve().parent
OLD = HERE.with_name('stage4_v5')
DATA = Path('D:/AncientEmpiresData/continuation_stage4_v5_20261101_v1')
OUTPUT = DATA / HERE.name
NODE = Path('C:/Program Files/nodejs/node.exe')
RESERVE = 4 * 1024**3


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(file, payload, immutable=False):
    file.parent.mkdir(parents=True, exist_ok=True)
    pending = file.with_name(file.name + '.' + uuid.uuid4().hex + '.pending')
    try:
        with pending.open('x', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            os.link(pending, file)
            pending.unlink()
        else:
            os.replace(pending, file)
    finally:
        if pending.exists():
            pending.unlink()


def tree_hashes(folder):
    return {str(p): digest(p) for p in sorted(folder.rglob('*')) if p.is_file()}


def validate(plan, recovery):
    for file, expected in plan['runtime']['files'].items():
        if digest(ROOT / file) != expected:
            raise RuntimeError('原冻结运行时变化：' + file)
    for file, expected in plan['preserved'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('历史保全文件变化：' + file)
    for file, expected in recovery['sources'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('恢复源码变化：' + file)
    for file, expected in recovery['preservedInterrupted'].items():
        if digest(Path(file)) != expected:
            raise RuntimeError('中断原件变化：' + file)
    if digest(Path(plan['model']['prefix'] + '.bin')) != plan['model']['binSha256']:
        raise RuntimeError('基础权重变化')
    if (OLD / 'FINAL_TEST_ATTEMPT.json').exists() or (OLD / 'STOP').exists() or (HERE / 'STOP').exists():
        raise RuntimeError('停止标志或封存令牌存在，禁止恢复开发调度')


def disk_check():
    free = shutil.disk_usage(DATA).free
    if free < RESERVE:
        raise RuntimeError(f'D盘空间不足，至少保留4GiB，当前{free}字节；未启动新局')
    probe = OUTPUT / ('.write-probe-' + uuid.uuid4().hex)
    with probe.open('xb') as stream:
        stream.write(b'V5-resume-io-probe\n')
        stream.flush()
        os.fsync(stream.fileno())
    probe.unlink()
    return free


def close_tree(child):
    if child.poll() is None:
        subprocess.run(['taskkill.exe', '/PID', str(child.pid), '/T', '/F'], capture_output=True, timeout=30,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    child.wait(timeout=30)


def main():
    plan = read(OLD / 'PLAN.json')
    recovery = read(HERE / 'RECOVERY_PLAN.json')
    validate(plan, recovery)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # 锁由操作系统随进程释放；历史锁文件保持原样，不以删除文件代替进程核验。
    with (OUTPUT / 'ACTIVE.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        games = []
        for receipt in sorted((DATA / 'C1').glob('*.receipt.json')):
            row = read(receipt)
            if row['runtime'] != plan['runtime']['sha256'] or row['config'] != plan['configHashes']['C1']:
                raise RuntimeError('旧收据身份错误')
            for file, expected in row['files'].items():
                if digest(Path(file)) != expected:
                    raise RuntimeError('旧完成局收据不符：' + file)
            folder = receipt.with_name(receipt.name.removesuffix('.receipt.json'))
            summary = read(folder / 'SUMMARY.json')
            if not summary['complete'] or not summary['gpuExited'] or len(summary['games']) != 1:
                raise RuntimeError('旧完成局合同不符')
            for game in summary['games']:
                games.append({**game, 'artifactDirectory': str(folder / game['id'])})
        if len(games) != 6:
            raise RuntimeError('旧完成局数量变化，需人工复核')
        # 原中断局永久占用局号，不能以新实绩替换它。
        missing = ['p3-10-s0']
        done = {game['id'] for game in games} | set(missing)
        ids = read(OLD / 'DEV_SUBSET.json')['ids']
        for match in ids:
            if match in done:
                continue
            validate(plan, recovery)
            free = disk_check()
            folder = OUTPUT / match
            receipt = OUTPUT / (match + '.receipt.json')
            if receipt.exists():
                prior = read(receipt)
                if prior['recoveryPlanSha256'] != digest(HERE / 'RECOVERY_PLAN.json'):
                    raise RuntimeError('恢复收据版本变化')
                for file, expected in prior['files'].items():
                    if digest(Path(file)) != expected:
                        raise RuntimeError('恢复收据不符：' + file)
                summary = read(folder / 'SUMMARY.json')
            else:
                if folder.exists():
                    raise RuntimeError('已有未完整落盘尝试，禁止覆盖或重跑：' + match)
                subset = OUTPUT / (match + '-subset.json')
                if not subset.exists():
                    save(subset, {'panelSha256': plan['panelSha256'], 'ids': [match]}, True)
                if read(subset) != {'panelSha256': plan['panelSha256'], 'ids': [match]}:
                    raise RuntimeError('单局子集变化')
                progress = {'stage': 'recovery_development', 'config': 'C1', 'match': match,
                            'completed': len(games), 'interrupted': missing, 'total': 18,
                            'updatedMs': int(time.time() * 1000), 'pid': os.getpid(), 'freeBytes': free,
                            'sealedAccess': 0, 'trainingUpdates': 0}
                save(HERE / 'PROGRESS.json', progress)
                save(OLD / 'PROGRESS.json', {**progress, 'recoveryProgress': str(HERE / 'PROGRESS.json')})
                print(json.dumps(progress, ensure_ascii=False), flush=True)
                stamp = str(time.time_ns())
                with (OUTPUT / (match + '-' + stamp + '.stdout.log')).open('x') as out, \
                     (OUTPUT / (match + '-' + stamp + '.stderr.log')).open('x') as err:
                    command = [str(NODE), 'ai_training/run.mjs', 'node', '--import', 'tsx', str(HERE / 'arena.ts'),
                               str(OLD / 'config-C1.json'), str(folder), 'dev', str(subset)]
                    child = subprocess.Popen(command, cwd=ROOT, stdout=out, stderr=err,
                                             creationflags=subprocess.CREATE_NO_WINDOW)
                    started = time.time()
                    try:
                        while child.poll() is None:
                            now = time.time()
                            heartbeat = folder / 'HEARTBEAT.json'
                            last = read(heartbeat)['updatedMs'] / 1000 if heartbeat.exists() else started
                            reason = None
                            if now - last > 180:
                                reason = 'external_no_progress_watchdog'
                            elif now - started > 1920:
                                reason = 'external_wall_watchdog'
                            elif shutil.disk_usage(DATA).free < 1024**3:
                                reason = 'disk_reserve_exhausted'
                            if reason:
                                close_tree(child)
                                save(HERE / (match + '-FAILURE.json'), {'classification': reason, 'natural': False,
                                     'pid': child.pid, 'preserved': tree_hashes(folder), 'sealedAccess': 0}, True)
                                raise RuntimeError(reason + '：' + match)
                            if (HERE / 'STOP').exists() or (OLD / 'STOP').exists():
                                close_tree(child)
                                raise RuntimeError('用户停止，原始尝试保留')
                            try:
                                child.wait(timeout=2)
                            except subprocess.TimeoutExpired:
                                pass
                        if child.returncode:
                            raise RuntimeError(f'评测退出异常：{match}，退出码{child.returncode}')
                    finally:
                        close_tree(child)
                summary = read(folder / 'SUMMARY.json')
                if not summary['complete'] or not summary['gpuExited'] or len(summary['games']) != 1 or summary['games'][0]['error']:
                    raise RuntimeError('新局完成或服务退出合同失败')
                save(receipt, {'recoveryPlanSha256': digest(HERE / 'RECOVERY_PLAN.json'), 'files': tree_hashes(folder)}, True)
            games.extend({**game, 'artifactDirectory': str(folder / game['id'])} for game in summary['games'])
            save(HERE / 'COMPLETED.json', {'games': games, 'missing': missing, 'sealedAccess': 0})
        validate(plan, recovery)
        save(HERE / 'RESULTS.json', {'games': games, 'missing': missing, 'completeCoverage': False,
             'sealedAccess': 0, 'trainingUpdates': 0, 'runtimeMixed': True}, True)
        report = '# V5恢复开发评测报告\n\n已核验并复用6局；剩余11局已评测。原p3-10-s0停滞原件保留，未重跑。\n\n完整覆盖门禁不成立，停止后续C2/C3、候选锁定及封存验收。异常不计自然负局。\n\n新增有界压缩写入、逐步心跳、磁盘预检与进程外看门狗；搜索算法、模型及配置保持冻结。恢复前后评测器I/O版本不同，报告披露混合身份。训练更新0、封存访问0。\n'
        save(HERE / 'DEVELOPMENT_GATE_REPORT.json', {'status': 'development_gate_rejected', 'reason': 'incomplete_coverage',
             'completed': len(games), 'missing': missing, 'sealedAccess': 0, 'trainingUpdates': 0}, True)
        (HERE / 'DEVELOPMENT_GATE_REPORT.md').write_text(report, encoding='utf-8')
        save(HERE / 'RUN_CLOSED.json', {'childrenRemaining': 0, 'trainingUpdates': 0, 'sealedAccess': 0}, True)
        save(HERE / 'EVIDENCE_MANIFEST.json', {'files': {**tree_hashes(OUTPUT), **tree_hashes(HERE)}, 'sealedAccess': 0}, True)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        save(HERE / ('RUN_FAILURE_' + str(time.time_ns()) + '.json'), {'error': repr(error), 'sealedAccess': 0}, True)
        raise
