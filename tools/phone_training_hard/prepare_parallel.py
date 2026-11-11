"""把明确分配的原父局冻结成手机独立多进程队列，不改原APK决策代码。"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TASK = ROOT / 'ai_training/hard_native_1000_20261022'


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def main() -> None:
    spec_path = Path(sys.argv[1]).resolve()
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    out = Path(spec['outputDirectory']).resolve()
    assert out.is_relative_to(TASK)
    remote = spec['remoteRoot']
    assert re.fullmatch(r'/data/local/tmp/aeii-hard-(?:concurrency|production-parallel)-[A-Za-z0-9_-]+', remote)
    assert 1 <= len(spec['workers']) <= 4 and 0 <= spec['limit'] <= len(spec['workers'])
    source_plan = TASK / 'PLAN.json'
    plan = json.loads(source_plan.read_text(encoding='utf-8'))
    frozen = TASK / 'production-independent-05'
    html = (frozen / 'hard-ai-runtime.fixed.html').read_text(encoding='utf-8')
    html_sha = hashlib.sha256(html.encode()).hexdigest()
    bridge = Path(plan['inputs']['javaBridge']['path']).read_text(encoding='utf-8')
    native = (HERE / 'native_engine_collect.rhino.js').read_text(encoding='utf-8')
    worker_source = (HERE / 'process_worker.rhino.js').read_text(encoding='utf-8')
    runtime = (HERE / 'production_runtime.frida.js').read_text(encoding='utf-8')
    assert 'Java.deoptimizeEverything' not in runtime and '.implementation =' not in runtime
    all_jobs = [seq for worker in spec['workers'] for seq in worker['sequences']]
    assert len(all_jobs) == len(set(all_jobs)) and all(3 <= seq <= 1000 for seq in all_jobs)
    assert len(all_jobs) + spec['initialDone'] == spec['total']
    out.mkdir(parents=True, exist_ok=False)
    master = out / 'master'
    master.mkdir()
    shutil.copy2(spec_path, out / 'SPEC.json')
    if spec.get('preservedParents'):
        preserved = Path(spec['preservedParents'])
        prior = json.loads(preserved.read_text(encoding='utf-8'))
        assert prior['completedParents'] == spec['initialDone']
        assert len({p['sequenceIndex'] for p in prior['parents']}) == spec['initialDone']
        assert not set(all_jobs).intersection(p['sequenceIndex'] for p in prior['parents'])
        shutil.copy2(preserved, master / 'PRESERVED_PARENTS.json')
    shutil.copy2(HERE / 'process_master.sh', master / 'master.sh')
    importance = Path(spec['processImportanceJar']).resolve()
    assert importance.is_file() and sha(importance) == spec['processImportanceJarSha256']
    shutil.copy2(importance, master / 'process-importance.jar')
    if spec.get('operatingCeiling') is not None:
        assert spec['operatingCeiling'] == 2 and spec['limit'] <= 2 and len(spec['workers']) >= 2
        (master / 'OPERATING_CEILING').write_text('2\n', encoding='utf-8', newline='\n')
    (master / 'global.env').write_text(f'TOTAL={spec["total"]}\nINITIAL_DONE={spec["initialDone"]}\nLIMIT={spec["limit"]}\nWORKER_COUNT={len(spec["workers"])}\n', encoding='utf-8', newline='\n')
    rows, workers = [], []
    for assignment in spec['workers']:
        wid, package = assignment['workerId'], assignment['package']
        assert re.fullmatch(r'w0[0-3]', wid) and re.fullmatch(r'net\.toyknight\.aeii\.(?:android|worker0[1-3])', package)
        assert re.fullmatch(r'[a-f0-9]{64}', assignment['installedSha256'])
        assert 10000 < assignment['uid'] < 99000
        assert assignment['sequences']
        local = out / wid
        local.mkdir()
        phone = remote + '-' + wid
        rows.append(f'{wid} {package} {assignment["uid"]} {phone}\n')
        values = {'PACKAGE': package, 'APP_UID': assignment['uid'], 'ACTIVITY': 'net.toyknight.aeii.android.AndroidLauncher', 'GLOBAL_ROOT': remote, 'WORKER_ID': wid, 'TOTAL': len(assignment['sequences'])}
        (local / 'worker.env').write_text(''.join(f'{key}={value}\n' for key, value in values.items()), encoding='utf-8', newline='\n')
        for source, target in [('process_controller.sh', 'controller.sh'), ('process_thaw.sh', 'process_thaw.sh')]:
            shutil.copy2(HERE / source, local / target)
        shutil.copy2(frozen / 'base-config.zip', local / 'base-config.zip')
        (local / 'inject-path.txt').write_text('/data/local/tmp/aeii-hard-inject-17.2.5\n', encoding='utf-8', newline='\n')
        prefix = spec['attemptPrefix'] + '-' + wid
        assert re.fullmatch(r'[A-Za-z0-9_-]{1,50}', prefix)
        (local / 'attempt-prefix.txt').write_text(prefix + '\n', encoding='utf-8', newline='\n')
        bundle = bridge + '\nglobalThis.Java=bridge;\n'
        for key, value in [('HARD_EXPECTED', {'package': package, 'sha256': assignment['installedSha256']}), ('HARD_NATIVE_SOURCE', native), ('HARD_WORKER_SOURCE', worker_source), ('HARD_FIXED_HTML', html)]:
            bundle += 'const ' + key + '=' + json.dumps(value, ensure_ascii=True) + ';\n'
        bundle += runtime
        (local / 'collector.bundle.js').write_text(bundle, encoding='utf-8', newline='\n')
        (local / 'configs').mkdir()
        index = []
        for sequence in assignment['sequences']:
            job = {**plan['jobs'][sequence - 1], 'attemptId': '__ATTEMPT__'}
            config = {'package': package, 'job': job, 'outputDirectory': f'/data/user/0/{package}/files/.aeii-hard-production/__ATTEMPT__', 'baseConfigZip': phone + '/base-config.zip', 'baseConfigName': plan['inputs']['baseConfigEntry'], 'taskRoot': phone, 'globalRoot': remote, 'workerId': wid, 'populationLimit': 30, 'populationCaps': [30] * 6, 'patchHTMLSha': html_sha, 'planSha256': sha(source_plan), 'sourceApkSha256': plan['apkSha256'], 'installedApkSha256': assignment['installedSha256'], 'sequenceIndex': sequence, 'maxActions': 20000, 'independentReplayDeferred': True, 'strategyFamily': 'apk_hard_original_process_isolated'}
            name = f'{sequence:04d}.json'
            write(local / 'configs' / name, config)
            index.append(f'{sequence} {job["parentId"]} {phone}/configs/{name}\n')
        (local / 'index.txt').write_text(''.join(index), encoding='utf-8', newline='\n')
        workers.append({**assignment, 'remoteRoot': phone, 'bundleSha256': sha(local / 'collector.bundle.js')})
    (master / 'workers.tsv').write_text(''.join(rows), encoding='utf-8', newline='\n')
    write(master / 'DISPATCH.json', {'sourcePlanSha256': sha(source_plan), 'sourceApkSha256': plan['apkSha256'], 'total': spec['total'], 'alreadyCompleted': spec['initialDone'], 'workers': workers, 'cpuLimitPercent': 90, 'computerRequired': False, 'independentReplayDeferred': True})
    sources = out / 'source'
    sources.mkdir()
    for name in ['prepare_parallel.py', 'deploy_parallel.py', 'process_controller.sh', 'process_master.sh', 'process_thaw.sh', 'process_worker.rhino.js', 'production_runtime.frida.js', 'native_engine_collect.rhino.js', 'ProcessImportance.java', 'build_process_importance.py']:
        shutil.copy2(HERE / name, sources / name)
    write(out / 'PLAN.json', {**spec, 'sourceSpecSha256': sha(spec_path), 'sourcePlanSha256': sha(source_plan), 'sourceApkSha256': plan['apkSha256'], 'populationLimit': 30, 'patchHTMLSha256': html_sha, 'workers': workers})
    write(out / 'SOURCE_SHA256.json', {str(p.relative_to(out)).replace('\\', '/'): sha(p) for p in out.rglob('*') if p.is_file()})
    print(json.dumps({'outputDirectory': str(out), 'remoteRoot': remote, 'workers': len(workers), 'pendingParents': len(all_jobs), 'initialDone': spec['initialDone']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
