"""冻结第一轮剩余414局，复用已完成2000局的训练实现和编码资产。"""
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
OLD = HERE.parent / 'phone_2m_continue1000_20261025'
FIRST = HERE.parent / 'phone_2m_scratch100_20261024'
PHONE = '/data/local/tmp/aeii-2m-continue414-20261027'
ROOTFS = '/data/local/tmp/aeii-2m-scratch100-20261024/runtime/rootfs'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    assert not (HERE / 'PLAN.json').exists(), '冻结计划不能覆盖'
    sync = load(OLD / 'SYNC_2000.json')
    complete = sync['complete']
    assert sync['allFileHashesVerified'] and complete['cumulativeParents'] == 2000
    assert complete['globalStep'] == 201251 and complete['cumulativeSamples'] == 1610008
    previous = load(OLD / 'PLAN.json')
    split = load(FIRST / 'SPLIT.json')
    order = load(FIRST / 'REFERENCE_ORDER.json')['epoch1']
    assert len(order) == 2414 and order[1000:2000] == [p['parentId'] for p in previous['inputs']]
    assert sha(FIRST / 'SPLIT.json') == previous['trainDevSplitSha256']
    assert sha(FIRST / 'REFERENCE_ORDER.json') == previous['referenceOrderSha256']
    byid = {p['parentId']: p for p in split['train']}
    chosen = [byid[pid] for pid in order[2000:]]
    assert len(chosen) == len({p['parentId'] for p in chosen}) == 414
    assert len({byid[pid]['groupId'] for pid in order}) == 2414
    assert not {p['groupId'] for p in chosen} & {p['groupId'] for p in split['dev']}
    assert not {p['parentId'] for p in chosen} & set(split['knownFailedParentIds'])
    names = ['config.bin', 'initial.bin', 'final.bin', 'actions.jsonl.gz', 'states.bin.gz', 'result.json']
    inputs = []
    for ordinal, parent in enumerate(chosen, 2001):
        result = load(Path(parent['directory']) / 'result.json')
        assert result['parentId'] == parent['parentId'] and result['naturalEnd'] and not result['truncationReason']
        count = parent['knownAtomicActions'] or parent['intendedAtomicPositions']
        assert count > 0
        for name in names:
            assert sha(Path(parent['directory']) / name) == parent['files'][name]['sha256']
        inputs.append({**parent, 'trainingOrdinal': ordinal, 'expectedSamples': count,
                       'nativeDirectory': '/continue2414/inputs/' + parent['parentId'],
                       'coreFiles': {name: parent['files'][name] for name in names}})
    checkpoint = Path(sync['finalCheckpoint'])
    assert sha(checkpoint) == sync['finalCheckpointSha256']
    source_auth = load(OLD / 'completion/job/PHONE_AUTHORIZED.json')
    plan = {'schema': 'phone-2m-continue414-v1', 'parentRange': [2001, 2414], 'parents': 414,
            'previousParents': 2000, 'workers': 2, 'baseStep': complete['globalStep'],
            'baseSamples': complete['cumulativeSamples'], 'baseSegmentSamples': complete['samples'],
            'baseCheckpoint': str(checkpoint), 'baseCheckpointSha256': sync['finalCheckpointSha256'],
            'baseStateDigests': complete['finalCheckpoint']['stateDigests'],
            'baseCheckpointIdentity': source_auth['files'],
            'baseParentOrder': [p['parentId'] for p in previous['inputs']],
            'intendedSamples': sum(p['expectedSamples'] for p in inputs),
            'rawInputBytes': sum(f['bytes'] for p in inputs for f in p['coreFiles'].values()),
            'inputs': inputs, 'trainDevSplitSha256': sha(FIRST / 'SPLIT.json'),
            'referenceOrderSha256': sha(FIRST / 'REFERENCE_ORDER.json'),
            'phoneOnlyOptimizerUpdates': True, 'hostOptimizerUpdates': 0,
            'newStrictReplayExecuted': False, 'automaticBeyond2414': False,
            'apkUnitLimitUsesPopulation': True}
    assert plan['intendedSamples'] == 325181
    protocol = load(OLD / 'PROTOCOL.json')
    protocol.update(schema='phone-2m-continue414-protocol-v1',
                    authorization='用户授权从2000局完整状态继续剩余414局，2个worker，完成后保存停止，不再重放校验',
                    initialization='resume_full_state_after_2000_parents', authorizedParents=414,
                    stopAfterCumulativeParents=2414, previousParents=2000,
                    resumeTestAfterUpdates=None, restoreBothWorkerRngFromBase=True)
    # 数学实现、模型和编码器直接复制，不重新打包公共规则或重做回放。
    unchanged = ['model.py', 'batch_model.py', 'accurate_ops.py', 'train_phone.py',
                 'workers_runtime.py', 'encoder.bundle.mjs', 'start_encoder.mjs']
    for name in unchanged:
        shutil.copy2(OLD / name, HERE / name)
        assert sha(HERE / name) == source_auth['files'][name]
    text = (OLD / 'train_continue.py').read_text(encoding='utf-8')
    text = text.replace('/continue2000', '/continue2414').replace('automaticBeyond2000', 'automaticBeyond2414')
    text = text.replace("auth['authorizedParents']!=1000", "auth['authorizedParents']!=414")
    text = text.replace("'parents':1000,'cumulativeParents':2000", "'parents':414,'cumulativeParents':2414")
    text = text.replace("checkpoint('authorized_1000_parents_complete')", "checkpoint('authorized_414_parents_complete')")
    text = text.replace('继承1000局完整状态，只追加第1001—2000局一遍', '继承2000局完整状态，只追加第2001—2414局一遍')
    text = text.replace('已完成1000局', '已完成2000局').replace('第1001—2000局授权预算', '第2001—2414局授权预算')
    barrier = "            if not args.resume and step-initial_step==10:checkpoint('controlled_resume_barrier');progress('resume_barrier');return 75\n"
    assert barrier in text
    text = text.replace(barrier, '')
    (HERE / 'train_continue.py').write_text(text, encoding='utf-8', newline='\n')
    stream = (OLD / 'streaming.py').read_text(encoding='utf-8').replace('/continue2000', '/continue2414')
    (HERE / 'streaming.py').write_text(stream, encoding='utf-8', newline='\n')
    device = (OLD / 'device.py').read_text(encoding='utf-8').replace('aeii-2m-continue1000-20261025', 'aeii-2m-continue414-20261027')
    (HERE / 'device.py').write_text(device, encoding='utf-8', newline='\n')
    monitor = (OLD / 'resource_monitor.sh').read_text(encoding='utf-8').replace('aeii-2m-continue1000-20261025', 'aeii-2m-continue414-20261027')
    (HERE / 'resource_monitor.sh').write_text(monitor, encoding='utf-8', newline='\n')
    deploy = (OLD / 'deploy.py').read_text(encoding='utf-8')
    cleanup = "    cleanup=load(HERE/'CACHE_CLEANUP_RESULT.json');assert not cleanup['mismatches'] and cleanup['allDeletedFilesBackedUpAndShaVerified']\n"
    assert cleanup in deploy
    deploy = deploy.replace(cleanup, '')
    deploy = deploy.replace('/continue2000', '/continue2414').replace('automaticBeyond2000', 'automaticBeyond2414')
    deploy = deploy.replace('aeii-2m-continue1000', 'aeii-2m-continue414').replace('aeii-continue1000', 'aeii-continue414')
    deploy = deploy.replace('20261025', '20261027').replace("'authorizedParents':1000", "'authorizedParents':414")
    deploy = deploy.replace("'parents':1000", "'parents':414").replace("'cumulativeParentBudget':2000", "'cumulativeParentBudget':2414").replace("'stopAfter':2000", "'stopAfter':2414")
    deploy = deploy.replace('用户明确要求模型日志同步到电脑、清理已备份缓存后用2worker从1000局续训到2000局，不做重放校验',
                            '用户明确要求继承2000局完整状态，2worker训练剩余414局，保存停止，不做重放校验')
    (HERE / 'deploy.py').write_text(deploy, encoding='utf-8', newline='\n')
    write('PLAN.json', plan)
    write('PROTOCOL.json', protocol)
    write('RUNTIME_DERIVATION.json', {'source': str(OLD), 'unchangedFiles': {n: sha(HERE / n) for n in unchanged},
                                   'changes': ['独立工作挂载及414局预算', '完整继承2000局状态', '取消第10步人为恢复屏障'],
                                   'strictReplayExecuted': False, 'hostOptimizerUpdates': 0})
    print(json.dumps({'parents': 414, 'range': [2001, 2414], 'samples': plan['intendedSamples'],
                      'updates': (plan['intendedSamples'] + 7) // 8, 'rawInputBytes': plan['rawInputBytes']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
