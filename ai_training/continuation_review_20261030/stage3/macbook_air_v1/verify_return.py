"""验收取回文件、完整续训状态、推理导出和指标谱系；不运行模型评测。"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import pickle
import shutil

from device import HERE, DATA, STAGE3, REMOTE
from retrieve_results import local_root, read, sha, save_new


def tensor_digest(mapping):
    import torch
    digest = hashlib.sha256()
    for name, value in sorted(mapping.items()):
        digest.update(str(name).encode())
        if isinstance(value, torch.Tensor):
            digest.update(str(value.dtype).encode())
            digest.update(str(tuple(value.shape)).encode())
            digest.update(value.detach().cpu().contiguous().numpy().tobytes())
        elif isinstance(value, dict):
            digest.update(tensor_digest(value).encode())
        else:
            digest.update(pickle.dumps(value, protocol=4))
    return digest.hexdigest()


def verify_export(prefix, state):
    import numpy as np
    metadata = read(prefix.with_suffix('.json'))
    binary = prefix.with_suffix('.bin').read_bytes()
    assert metadata['parameters'] == 1966910 and len(binary) == 1966910 * 4
    assert metadata['dtype'] == 'float32-le'
    assert {row['name'] for row in metadata['tensors']} == set(state)
    offset = 0
    for entry in metadata['tensors']:
        assert entry['offset'] == offset
        actual = np.frombuffer(binary, dtype='<f4', count=entry['length'], offset=offset * 4).reshape(entry['shape'])
        assert actual.tobytes() == state[entry['name']].contiguous().numpy().astype('<f4').tobytes(), entry['name']
        offset += entry['length']
    assert offset == metadata['parameters']
    return dict(prefix=str(prefix), sha256=sha(prefix.with_suffix('.bin')), tensorsBitwiseExact=True)


def verify_metrics(local, training):
    inherited = DATA.parent / 'phone_samsung_v1/returns/20261030T204810-71377923/version-004500/METRICS_THROUGH_CHECKPOINT.jsonl'
    sources = [inherited] + sorted(training.glob('METRICS-*.jsonl'))
    rows = {}
    provenance = {}
    for source in sources:
        count = 0
        with source.open(encoding='utf-8') as stream:
            for line in stream:
                if not line.strip():
                    continue
                row = json.loads(line)
                update = row['update']
                assert 1 <= update <= 100000 and row['samples'] == update * 32
                if source == inherited:
                    assert update <= 4500
                else:
                    assert update > 4500
                assert update not in rows or rows[update] == row, '重复指标内容不一致：' + str(update)
                rows[update] = row
                count += 1
        provenance[str(source)] = dict(rows=count, sha256=sha(source))
    assert sorted(rows) == list(range(1, 100001)), '完整训练指标存在缺口'
    destination = local / 'METRICS_THROUGH_100000.jsonl'
    with destination.open('x', encoding='utf-8') as stream:
        for update in range(1, 100001):
            stream.write(json.dumps(rows[update], ensure_ascii=False) + '\n')
    result = dict(passed=True, updates=100000, inheritedUpdates=4500, macUpdates=95500,
                  eachUpdateExactlyOnce=True, sources=provenance, file=str(destination), sha256=sha(destination))
    save_new(local / 'METRICS_PROVENANCE.json', result)
    return result


def main(tag):
    import torch
    torch.set_num_threads(2)
    local = local_root(tag)
    assert not (local / 'RETURN_RECEIPT.json').exists(), '已经验收，不覆盖历史收据'
    transferred = read(local / 'FILES_VERIFIED.json')
    inputs = read(local / 'LOCAL_INPUTS_VERIFIED.json')
    assert transferred['passed'] and inputs['passed']
    snapshot = local / 'mac-snapshot'
    work = snapshot / 'work'
    training = work / 'training'
    manifest = read(local / 'SNAPSHOT_MANIFEST.json')
    package = read(local / 'REMOTE_PACKAGE.json')
    complete = read(training / 'COMPLETE.json')
    latest = read(training / 'LATEST.json')
    checkpoint = training / latest['file']
    assert sha(checkpoint) == latest['sha256'] == manifest['latestCheckpoint']['sha256']
    assert complete['lastCheckpoint'] == latest and complete['updates'] == 100000
    assert sha(work / 'MAC_CONTRACT.json') == complete['contractSha256'] == manifest['contractSha256']
    contract = read(work / 'MAC_CONTRACT.json')
    external = {}
    for name, expected in contract['files'].items():
        if name.startswith(REMOTE + '/'):
            source = snapshot / name[len(REMOTE) + 1:]
        elif name.startswith('/'):
            # 系统Node的原始摘要保留在远端合同和打包门禁中，不伪造本机安装。
            external[name] = dict(sha256=expected, verifiedOnMacBeforePackaging=True)
            continue
        else:
            source = work / name
        assert sha(source) == expected, name
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    for key in ['model', 'optimizer', 'scheduler', 'sampler', 'rng', 'dropoutRng', 'config']:
        assert key in saved
    assert saved['updates'] == saved['scheduler']['last_epoch'] == 100000
    assert saved['sampler']['cursor'] == 3200000
    assert saved['config'] == read(work / 'SCIENCE_CONFIG.json')
    assert saved['contractSha256'] == complete['contractSha256']
    assert saved['source4500CheckpointSha256'] == '93db8a6361ee127f44142e54f6d1987677c011b25eb5691dc5030218aa3d50b5'
    assert not saved['engineeringOnly'] and not saved['pendingAccumulatedGradients']
    assert saved['runtime']['device'] == 'cpu' and saved['runtime']['threads'] == 2
    for key in ['exp_avg', 'exp_avg_sq']:
        assert sum(value[key].numel() for value in saved['optimizer']['state'].values()) == 1966910
    assert saved['rng']['torch'].dtype == torch.uint8 and saved['rng']['torch'].numel() > 0
    assert tensor_digest(saved['model']) == complete['modelDigest']
    assert tensor_digest(saved['optimizer']) == complete['optimizerDigest']
    assert all(torch.isfinite(value).all().item() for value in saved['model'].values())
    assert all(sha(training / name) == digest for name, digest in complete['lastExport'].items())
    exports = [verify_export(training / 'last', saved['model'])]
    diagnostics = read(training / 'DIAGNOSTICS.json')
    assert [row['update'] for row in diagnostics] == [20000, 40000, 60000, 80000, 100000]
    for diagnostic in diagnostics:
        point = diagnostic['checkpoint']
        source = training / point['file']
        assert sha(source) == point['sha256']
        state = torch.load(source, map_location='cpu', weights_only=False)
        assert state['updates'] == diagnostic['update']
        prefix = training / Path(diagnostic['prefix']).name
        exports.append(dict(update=state['updates'], **verify_export(prefix, state['model'])))
    restores = []
    for source in sorted(training.glob('RESTORE-*.json')):
        row = read(source)
        for key in ['modelExact', 'adamWMomentsAndStepsExact', 'cpuRngBytesExact', 'samplerCursorExact', 'dropoutRngExact']:
            assert row[key], source.name + '/' + key
        restores.append(dict(file=source.name, update=row['update'], sourceSha256=row['sourceSha256']))
    closures = [read(source) for source in sorted(training.glob('RUN_CLOSURE-*.json'))]
    assert all(row['error'] is None and row['encoderStopped'] for row in closures)
    assert any(row['completedUpdates'] == 100000 for row in closures)
    assert read(snapshot / 'CONTROLLER_EXIT.json')['phase'] == 'complete'
    metrics = verify_metrics(local, training)
    version = local / 'version-100000'
    version.mkdir(exist_ok=False)
    for suffix in ['.bin', '.json']:
        shutil.copy2(training / ('last' + suffix), version / ('model-100000' + suffix))
    save_new(version / 'EXPOSURE.json', saved['sampler']['exposures'])
    save_new(version / 'SCIENCE_CONFIG.json', saved['config'])
    save_new(version / 'VERSION.json', dict(update=100000, samples=3200000, checkpoint=str(checkpoint),
                                          checkpointSha256=latest['sha256'], inferenceModel=str(version / 'model-100000.bin'),
                                          inferenceSha256=sha(version / 'model-100000.bin'), tensorsBitwiseExact=True,
                                          bestCandidateSelected=False, sealedTestEvaluated=False))
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).isoformat(timespec='seconds')
    result = dict(schema='mac-stage3-return-v1', passed=True, returnedBeijing=now, local=str(local), remoteRoot=REMOTE,
                  updates=100000, samples=3200000, sourceUpdate=4500, macAdditionalUpdates=95500,
                  files=manifest['fileCount'], bytes=manifest['fileBytes'], checkpointFiles=len(list(training.glob('*.pt'))),
                  archiveBytes=package['archiveBytes'], archiveSha256=package['archiveSha256'],
                  latestCheckpoint=dict(latest, localFile=str(checkpoint)),
                  inferenceModel=str(version / 'model-100000.bin'), inferenceMetadata=str(version / 'model-100000.json'),
                  modelDigest=complete['modelDigest'], optimizerDigest=complete['optimizerDigest'],
                  fullResumeStatePresent=True, exports=exports, restoreSegments=restores,
                  metricsUpdates=metrics['updates'], metricsProvenance=str(local / 'METRICS_PROVENANCE.json'),
                  frozenInputFiles=inputs['count'], frozenInputBytes=inputs['bytes'], inputReceipt=str(local / 'LOCAL_INPUTS_VERIFIED.json'),
                  originalFilesPreserved=True, macTaskCompletedAndExitedBeforePackaging=True,
                  engineeringEvidenceReturned=True, engineeringWeightsPromoted=False, externalRuntimeFiles=external,
                  lastDiagnostic=dict(update=100000, degraded=diagnostics[-1]['degraded'], plateau=diagnostics[-1]['plateau']),
                  bestCandidateSelected=False, newOfflineOrArenaEvaluationRun=False, sealedTestsRun=0,
                  stage3FinalAcceptanceComplete=False, publicModelDeployed=False, hostTrainingStarted=False)
    save_new(local / 'RETURN_RECEIPT.json', result)
    receipt = dict(passed=True, tag=tag, local=str(local), receipt=str(local / 'RETURN_RECEIPT.json'),
                   receiptSha256=sha(local / 'RETURN_RECEIPT.json'), updates=100000, samples=3200000,
                   checkpointSha256=latest['sha256'], files=manifest['fileCount'], originalFilesPreserved=True,
                   sealedTestsRun=0, stage3FinalAcceptanceComplete=False)
    save_new(HERE / ('RETURN_RECEIPT-' + tag + '.json'), receipt)
    save_new(HERE / 'RETURN_LATEST.json', receipt)
    note = f'''# MacBook Air阶段三成果取回

取回验收时间：{now}。Mac于2026-10-31 08:53:25（北京时间）完成累计100000更新、3200000样本，从三星4500完整点独立新增95500更新。训练和控制进程已在打包前退出。本次只传输、核验和归档，没有执行新的离线诊断、开发实战、封存测试或模型部署。

- 100k推理权重：[version-100000/model-100000.bin](version-100000/model-100000.bin)，配套[元数据](version-100000/model-100000.json)。原始导出保留在mac-snapshot/work/training/last.bin和last.json。
- 完整续训断点：[原始100k检查点](mac-snapshot/work/training/{latest['file']})；SHA256：`{latest['sha256']}`。包含模型、AdamW一二阶矩与步数、100k scheduler、采样器游标、CPU随机状态和先验dropout随机状态。未重新训练或推进优化器。
- 全部{result['checkpointFiles']}个现存正式检查点、五个诊断节点的模型与逐态结果、训练记录、源码、合同、恢复/闭合证据，以及单独标记的工程试验原件均在mac-snapshot目录。工程权重不可作为正式候选。
- [完整1至100000更新指标](METRICS_THROUGH_100000.jsonl)每步恰好一条；1至4500继承来源和Mac新增95500条的摘要、地址见[指标谱系](METRICS_PROVENANCE.json)。
- 全部{manifest['fileCount']}个取回文件均与Mac逐文件SHA256一致；归档{package['archiveBytes']}字节，SHA256为`{package['archiveSha256']}`。见[传输清单](SNAPSHOT_MANIFEST.json)、[文件核验](FILES_VERIFIED.json)和[最终收据](RETURN_RECEIPT.json)。
- 冻结训练/开发输入{inputs['count']}文件、{inputs['bytes']}字节已在Mac和本机分别逐文件核SHA。本机原件复用而不重复传输；精确本机路径见[输入核验](LOCAL_INPUTS_VERIFIED.json)。mac-snapshot省略work/inputs、work/raw-store、work/dev-cache，不能把缺少这些副本的目录直接视为即开即用训练环境；跨机器运行还需要按路径映射配置环境。

100k开发诊断记录degraded=true、plateau=true，终点尚未被选为最佳。40k及其他原有候选文件均已保留；全局最多三个开发实战候选与唯一一次封存验收预算不变。最终开发实战、唯一候选/先验锁定及329父局离线＋54局封存验收仍待后续执行，阶段三尚未最终验收。

Mac任务目录`{REMOTE}`及全部原件保留，未清理Mac环境或修改LaunchAgent。Windows原训练与原自动跟进继续保持暂停；三星任务按此前收尾状态保持，不在本次操作范围内。
'''
    (local / 'README.md').write_text(note, 'utf-8')
    handoff = STAGE3 / 'HANDOFF.md'
    old = handoff.read_text('utf-8')
    save_new(local / 'HANDOFF_BEFORE_RETURN.json', dict(file=str(handoff), sha256=sha(handoff), content=old))
    insertion = f'''2026-10-31最新Mac成果已取回：用户明确授权取回。Mac已于08:53:25完成100000更新、3200000样本并退出。全部{manifest['fileCount']}个成果/工程证据文件、{result['checkpointFiles']}个现存正式检查点已复制到`{local}`，归档和每个文件SHA均通过。100k完整断点SHA `{latest['sha256']}`，推理bin逐张量核对；1至100000完整指标、冻结输入{inputs['count']}文件本机路径和SHA谱系均已验证。Mac原件及环境保留，无新训练/评测/实战/封存操作。100k诊断degraded=true、plateau=true，尚未选最佳；阶段三最终验收未完成。当前收据`macbook_air_v1/RETURN_LATEST.json`，D盘入口README.md。历史“训练中/待取回”条目不再是当前状态，不得据此恢复任何任务。

'''
    anchor = '# 第三阶段当前接手入口\n\n'
    assert anchor in old
    handoff.write_text(old.replace(anchor, anchor + insertion, 1), 'utf-8')
    print(json.dumps(receipt, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    main(parser.parse_args().tag)
