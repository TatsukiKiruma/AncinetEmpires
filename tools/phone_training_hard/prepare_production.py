"""冻结低开销困难采集器、真实人口配置和手机剩余998局任务。"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TASK = ROOT / 'ai_training/hard_native_1000_20261022'
ROUND = os.environ.get('AEII_PRODUCTION_ROUND', '01')
if len(ROUND) != 2 or not ROUND.isdigit() or int(ROUND) < 1:
    raise ValueError('生产部署编号需要明确的两位正整数')
OUT = TASK / ('production-independent-' + ROUND)
REMOTE = '/data/local/tmp/aeii-hard-production-20261022-' + ROUND
PRIVATE = '/data/user/0/net.toyknight.aeii.android/files/.aeii-hard-production'
USER_APK = Path('C:/Users/SHIINA/Downloads/aer-4.2.5.1-patch.apk.1')


def sha(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path: Path, value: object) -> None:
    with path.open('x', encoding='utf-8', newline='\n') as output:
        json.dump(value, output, ensure_ascii=False, separators=(',', ':'))
        output.write('\n')


def main() -> None:
    plan_path = TASK / 'PLAN.json'
    plan = json.loads(plan_path.read_text(encoding='utf-8'))
    assert len(plan['jobs']) == 1000
    inputs = plan['inputs']
    assert sha(USER_APK) == plan['apkSha256'], '用户指定APK与冻结来源不符'
    for name in ('baseConfigZip', 'javaBridge', 'sharedApk'):
        assert sha(Path(inputs[name]['path'])) == inputs[name]['sha256'], name
    OUT.mkdir(exist_ok=False)
    completed = []
    for index in (1, 2):
        receipt = TASK / f'runs/production-02/jobs/{index:04d}/collection-receipt.json'
        value = json.loads(receipt.read_text(encoding='utf-8'))
        assert value['collectionComplete'] is True and value['naturalEnd'] is True
        # 已完成证据按原SHA保留，不以新来源标签改写历史数据。
        for relative, expected in value['evidenceHashes'].items():
            assert sha(receipt.parent / relative) == expected, relative
        completed.append({'index': index, 'parentId': value['parentId'], 'receipt': str(receipt), 'sha256': sha(receipt)})
    shutil.copy2(inputs['baseConfigZip']['path'], OUT / 'base-config.zip')
    with zipfile.ZipFile(OUT / 'base-config.zip') as archive:
        (OUT / 'input-config.bin').write_bytes(archive.read(inputs['baseConfigEntry']))
    decoded = subprocess.run(['node', '--import', 'tsx', str(HERE / 'production_population.ts'), str(OUT / 'input-config.bin')],
                             cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
    population = json.loads(decoded.stdout)
    with zipfile.ZipFile(inputs['sharedApk']['path']) as archive:
        original = archive.read('assets/hard-ai/runtime.html')
    original_html = original.decode('utf-8')
    anchor = 'const TEAM_POPULATION_LIMIT = 100;'
    assert original_html.count(anchor) == 1
    fixed_html = original_html.replace(anchor, f'const TEAM_POPULATION_LIMIT = {population["populationLimit"]};')
    # 就绪标记只供原生页面加载回调读取，不参与评分、规则或随机数。
    before_body, body_end, after_body = fixed_html.rpartition('</body>')
    assert body_end
    fixed_html = before_body + f'<script>window.__AEII_NATIVE_POP_LIMIT__={population["populationLimit"]};</script>\n' + body_end + after_body
    (OUT / 'hard-ai-runtime.fixed.html').write_text(fixed_html, encoding='utf-8', newline='\n')
    html_hash = hashlib.sha256(fixed_html.encode('utf-8')).hexdigest()
    sources = ['production_runtime.frida.js', 'production_worker.rhino.js', 'production_controller.sh', 'production_thaw.sh',
               'native_engine_collect.rhino.js', 'production_population.ts', 'prepare_production.py', 'deploy_production.py']
    source_dir = OUT / 'source'
    source_dir.mkdir()
    for name in sources:
        shutil.copy2(HERE / name, source_dir / name)
    bridge = Path(inputs['javaBridge']['path']).read_text(encoding='utf-8')
    native = (HERE / 'native_engine_collect.rhino.js').read_text(encoding='utf-8')
    worker = (HERE / 'production_worker.rhino.js').read_text(encoding='utf-8')
    runtime = (HERE / 'production_runtime.frida.js').read_text(encoding='utf-8')
    assert 'Java.deoptimizeEverything' not in runtime and 'Java.deoptimizeBootImage' not in runtime
    expected = {'package': plan['package'], 'sha256': plan['apkSha256']}
    bundle = bridge + '\nglobalThis.Java=bridge;\n'
    for name, value in [('HARD_EXPECTED', expected), ('HARD_NATIVE_SOURCE', native), ('HARD_WORKER_SOURCE', worker), ('HARD_FIXED_HTML', fixed_html)]:
        bundle += 'const ' + name + '=' + json.dumps(value, ensure_ascii=True) + ';\n'
    bundle += runtime
    (OUT / 'collector.bundle.js').write_text(bundle, encoding='utf-8', newline='\n')
    (OUT / 'controller.sh').write_text((HERE / 'production_controller.sh').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    (OUT / 'production_thaw.sh').write_text((HERE / 'production_thaw.sh').read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    (OUT / 'inject-path.txt').write_text('/data/local/tmp/aeii-hard-inject-17.2.5\n', encoding='utf-8', newline='\n')
    (OUT / 'attempt-prefix.txt').write_text('hp1000-20261022-p' + ROUND + '\n', encoding='utf-8', newline='\n')
    (OUT / 'configs').mkdir()
    index_lines, jobs = [], []
    for sequence, original_job in enumerate(plan['jobs'][2:], 3):
        job = {**original_job, 'attemptId': '__ATTEMPT__'}
        config = {'package': plan['package'], 'job': job, 'outputDirectory': PRIVATE + '/__ATTEMPT__',
                  'baseConfigZip': REMOTE + '/base-config.zip', 'baseConfigName': inputs['baseConfigEntry'],
                  'taskRoot': REMOTE, 'planSha256': sha(plan_path), 'total': 1000, 'sequenceIndex': sequence,
                  'patchHTMLSha': html_hash, **population,
                  'strategyFamily': 'apk_hard_original_with_population_alignment', 'independentReplayDeferred': True,
                  'maxSeconds': 21600, 'maxActiveSeconds': 21600, 'maxActions': job['maxActions']}
        filename = f'{sequence:04d}.json'
        write(OUT / 'configs' / filename, config)
        index_lines.append(f'{sequence} {job["parentId"]} {REMOTE}/configs/{filename}\n')
        jobs.append({'sequenceIndex': sequence, 'parentId': job['parentId'], 'map': job['map'], 'seed': job['seed']})
    (OUT / 'index.txt').write_text(''.join(index_lines), encoding='utf-8', newline='\n')
    write(OUT / 'PRODUCTION_PLAN.json', {'schema': 'phone-hard-original-production-v2', 'createdUtc': dt.datetime.now(dt.timezone.utc).isoformat(),
          'sourcePlanSha256': sha(plan_path), 'alreadyCompleted': completed, 'remaining': 998, 'targetParents': 1000,
          'jobs': jobs, 'computerRequired': False, 'remoteRoot': REMOTE, 'privateRoot': PRIVATE,
          'apkSha256': plan['apkSha256'], 'userSpecifiedApk': str(USER_APK), 'userSpecifiedApkExactMatch': True,
          'originalHTMLSha256': hashlib.sha256(original).hexdigest(),
          'runtimeHTMLSha256': html_hash, **population, 'apkFileModified': False,
          'populationRepair': '从原生配置解码本批真实上限；仅对运行时网页常量作一致性修正，逐步核对原生上限',
          'fallbackPolicy': '原样执行j.b.call；读取原有lastAccepted字段区分JS与Java困难回退',
          'failurePolicy': '失败局保存且不计完成，继续其他父局，再单独重试，所有尝试独立目录',
          'performancePolicy': '无全VM去优化、无逐动作Frida回调、缓冲数据流、局末同步', 'independentReplayDeferred': True})
    write(OUT / 'SOURCE_SHA256.json', {str(path.relative_to(OUT)).replace('\\', '/'): sha(path) for path in OUT.rglob('*') if path.is_file()})
    print(json.dumps({'remaining': 998, 'populationLimit': population['populationLimit'], 'bundleBytes': (OUT / 'collector.bundle.js').stat().st_size, 'remoteRoot': REMOTE}, ensure_ascii=False))


if __name__ == '__main__':
    main()
