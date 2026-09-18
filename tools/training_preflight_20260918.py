"""保存训练前检查证据，不覆盖现有训练数据或模型。"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import server_archive_incremental as connection

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'training_runs/preflight_20260918'
OUT.mkdir(exist_ok=True)


def snapshot():
    code = connection.COMMON + '''
import sys, tarfile
deployment = json.loads((ROOT / 'deployment_manifest.json').read_text())
for relative, expected in deployment['sourceFiles'].items():
    file = (ROOT / relative).resolve()
    assert file.is_relative_to(ROOT) and digest(file) == expected
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
    for relative in ['deployment_manifest.json', *deployment['sourceFiles']]:
        archive.add(ROOT / relative, arcname=relative, recursive=False)
'''
    bundle = OUT / 'deployed-source.tar.gz'
    with bundle.open('wb') as output:
        subprocess.run(['ssh', *connection.OPTIONS, connection.HOST, 'python3 -'], input=code.encode(), stdout=output, check=True)
    destination = OUT / 'deployed-source'
    destination.mkdir(exist_ok=True)
    with tarfile.open(bundle) as archive:
        for member in archive.getmembers():
            assert member.isfile() and (destination / member.name).resolve().is_relative_to(destination.resolve())
        archive.extractall(destination, filter='data')
    deployment = json.loads((destination / 'deployment_manifest.json').read_text())
    report = {'identical': [], 'lineEndingOnly': [], 'changed': [], 'missing': []}
    for relative, expected in deployment['sourceFiles'].items():
        deployed = (destination / relative).read_bytes()
        assert hashlib.sha256(deployed).hexdigest() == expected
        local = BASE / relative
        if not local.exists():
            report['missing'].append(relative)
        elif hashlib.sha256(local.read_bytes()).hexdigest() == expected:
            report['identical'].append(relative)
        elif local.read_bytes().replace(b'\r\n', b'\n') == deployed.replace(b'\r\n', b'\n'):
            report['lineEndingOnly'].append(relative)
        else:
            report['changed'].append(relative)
    (OUT / 'source-comparison.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: len(v) if k in ['identical', 'lineEndingOnly'] else v for k, v in report.items()}, ensure_ascii=False), flush=True)


def gate(name):
    npm = 'npm.cmd' if sys.platform == 'win32' else 'npm'
    commands = {
        'lint': [npm, 'run', 'lint'],
        'test': [npm, 'test'],
        'build': [npm, 'run', 'build'],
    }
    if name == 'apk':
        results = []
        for report in ['language-rule', 'skirmish-rule', 'unit', 'terrain', 'script', 'map', 'dex', 'training']:
            command = [npm, 'run', f'apk:{report}-report', '--', '--check']
            with (OUT / f'apk-{report}.log').open('w', encoding='utf-8') as output:
                result = subprocess.run(command, cwd=BASE, stdout=output, stderr=subprocess.STDOUT)
            results.append({'report': report, 'exitCode': result.returncode})
            print(json.dumps(results[-1]), flush=True)
        (OUT / 'apk-gates.json').write_text(json.dumps(results, indent=2))
        return
    with (OUT / f'{name}.log').open('w', encoding='utf-8') as output:
        result = subprocess.run(commands[name], cwd=BASE, stdout=output, stderr=subprocess.STDOUT)
    (OUT / f'{name}-result.json').write_text(json.dumps({'exitCode': result.returncode}))
    print(name, result.returncode, flush=True)


def summarize():
    import math
    dataset = json.loads((BASE / 'training_runs/server_archive_20260913/dataset/manifest.json').read_text())
    fingerprint = subprocess.check_output(['node', '--openssl-legacy-provider', '--import', 'tsx', '--input-type=module', '-e', "import {resolveFeatureGeneratorFingerprint} from './tools/skirmish_generator_fingerprint.ts'; console.log(await resolveFeatureGeneratorFingerprint());"], cwd=BASE, text=True).strip()
    assert fingerprint == dataset['generator']['options']['generatorFingerprint']
    train = json.loads((OUT / 'smoke-train.json').read_text(encoding='utf-8-sig'))['summary']
    play = json.loads((OUT / 'smoke-play.json').read_text(encoding='utf-8-sig'))['summary']
    replay = json.loads((OUT / 'forced-replay.json').read_text(encoding='utf-8-sig'))['totals']
    model = json.loads((OUT / 'smoke-bc.json').read_text())
    assert len(model['weights']) == 4096 and all(math.isfinite(x) for x in model['weights'])
    assert model['datasetId'] == dataset['datasetId']
    assert model['featureExtractor'] == 'hashed-action-v3' and model['maxCandidates'] == 64
    assert train['epochs'][0]['train']['samples'] == 5000 and train['epochs'][0]['val']['samples'] == 1000
    assert train['epochs'][0]['train']['skipped'] == train['epochs'][0]['val']['skipped'] == 0
    assert play['episodeCount'] == play['terminalCount'] == 2
    assert play['illegalActionCount'] == play['stoppedByMaxStepsCount'] == play['timeoutCount'] == 0
    assert replay['failed'] == replay['parseErrors'] == 0 and replay['passed'] >= 112
    gates = {name: json.loads((OUT / f'{name}-result.json').read_text()) for name in ['lint', 'test', 'build']}
    assert all(x['exitCode'] == 0 for x in gates.values())
    apk = json.loads((OUT / 'apk-gates.json').read_text())
    assert all(x['exitCode'] == 0 for x in apk)
    report = {'datasetId': dataset['datasetId'], 'generatorFingerprint': fingerprint, 'fingerprintMatches': True, 'modelSha256': hashlib.sha256((OUT / 'smoke-bc.json').read_bytes()).hexdigest(), 'gates': gates, 'apkGates': apk, 'forcedReplay': replay, 'smokeTraining': train['epochs'], 'smokeModel': train['model'], 'smokePlay': play, 'readyForFullTraining': True, 'productionModelReady': False}
    (OUT / 'summary.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    if sys.argv[1] == 'snapshot':
        snapshot()
    elif sys.argv[1] == 'summarize':
        summarize()
    else:
        gate(sys.argv[1])
