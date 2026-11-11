"""一次性生成待审核控制合同及完整差分，不生成执行批准。"""
import difflib
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent.parent / 'stage1'
PRESERVED = HERE.parent / 'revisions/submission-1'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    path = HERE / name
    if path.exists():
        raise FileExistsError('待审核合同已存在，必须另建版本，不能静默刷新：' + name)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf-8')


def main():
    if (HERE / 'CONTROL_CONTRACT.json').exists():
        raise FileExistsError('控制合同已存在，禁止覆盖')
    save('EXACT_RECOVERY_BINDING.json', dict(
        schema='stage2-exact-io-fault-binding-v1', approvedToRun=False,
        checkpointSha256='317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32',
        armId='f167ec70-dd0b-48bd-9af0-fb6a45452d3e',
        ledgerPath='D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4/ARM_BUDGET.json',
        closedLedgerSha256=sha(PRESERVED / 'original-ARM_BUDGET.json'),
        modelDigest='45f7b31a68fb08a125c290e2123ace2b4811f5b41a3ba2ce1693e437775f05c9',
        optimizerDigest='c7dc06b09b41202a3394069544a75b694c94c215631d4322b2e791dcb67c01ac',
        consumedSecondsMinimum=2466.9585621000006, completedUpdates=7758, completedSamples=62064,
        purpose='仅此已独立核验的预算I/O异常；实际恢复仍需下一轮精确代码批准'))
    science = json.loads((STAGE1 / 'SCIENCE_CONTRACT.json').read_text('utf-8'))
    save('SCIENTIFIC_LINEAGE.json', dict(
        schema='stage2-control-science-lineage-v1',
        frozenScienceContractSha256=sha(STAGE1 / 'SCIENCE_CONTRACT.json'),
        frozenRunnerContractSha256=sha(STAGE1 / 'RUNNER_CONTRACT.json'),
        originalScienceSources= science['scienceSources'],
        scientificFunctionsInherited=['runtime.fresh', 'runtime.update', 'runtime.Encoder', 'runtime.Sampler',
                                      'runtime.restore_rng', 'runtime.rng_state', 'offline.py', 'arena.ts', 'compare_arena.py'],
        changedControl=['新入口train.py', '预算写入/心跳互斥io_control.py', '精确异常桥接recovery.py', '只读watch.py'],
        distinction='V2合同验证原件和继承的数值依赖，V3另加控制合同；新executionIdentity包含两者，不宣称运行器相同。',
        evaluation='离线及实战仍由未改V2入口执行，结果身份是V2评测身份；训练控制V3谱系另记，跨版本控制差异必须披露。'))
    patches = []
    for old, new in [('train.py', 'train.py'), ('budget.py', 'io_control.py')]:
        patches.extend(difflib.unified_diff((STAGE1 / old).read_text('utf-8').splitlines(True),
                                          (HERE / new).read_text('utf-8').splitlines(True),
                                          fromfile='frozen-stage1/' + old, tofile='runner_v3_repair1/' + new))
    (HERE / 'CONTROL_DIFF.patch').write_text(''.join(patches), 'utf-8')
    source_names = sorted([p.name for p in HERE.glob('*.py')] + ['EXACT_RECOVERY_BINDING.json', 'SCIENTIFIC_LINEAGE.json', 'CONTROL_DIFF.patch'])
    evidence_names = ['original-ARM_BUDGET.json', 'original-LATEST.json', 'original-ERROR.json', 'original-RESTORE.json', 'original-stderr.log']
    save('CONTROL_CONTRACT.json', dict(
        schema='stage2-versioned-control-contract-v1', protocol='continuation-control-v3-repair1',
        status='pending_coordinator_code_review', approvedToRun=False,
        frozenScienceContractSha256=sha(STAGE1 / 'SCIENCE_CONTRACT.json'),
        frozenRunnerContractSha256=sha(STAGE1 / 'RUNNER_CONTRACT.json'),
        sources=[dict(path=name, sha256=sha(HERE / name)) for name in source_names],
        preservedEvidence=[dict(path=(PRESERVED / name).as_posix(), sha256=sha(PRESERVED / name)) for name in evidence_names],
        ioPolicy=dict(windowsSharingErrors=[5, 32, 33], retrySeconds=.5, checkpointSeconds=5,
                      shutdownEvidenceSeconds=2, heartbeatSeconds=.5, stopNewBatchOnHeartbeatFailure=True,
                      countAllWaitsInOriginalArmBudget=True, immutableCheckpointFiles=True),
        executionGate='必须由reviews中的stage2-control-code-approval-v1以此合同精确SHA作approved_to_run；本文件不批准执行。',
        numericalChanges=False, samplingChanges=False, evaluationChanges=False))
    save('APPROVAL_TEMPLATE_NOT_VALID.json', dict(
        schema='stage2-control-code-approval-v1', decision='example_do_not_run',
        controlContractSha256=sha(HERE / 'CONTROL_CONTRACT.json'),
        exactRecoveryCheckpointSha256='317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32',
        sampleBudgetPerArm=80000, updateBudgetPerArm=10000, wallSecondsPerArm=14400,
        learningRateArms=[.00005, .0001, .00024495],
        instruction='仅供协调者填写独立reviews批准文件；此模板位置和decision均不具执行资格。'))
    print(json.dumps(dict(controlContractSha256=sha(HERE / 'CONTROL_CONTRACT.json'), sourceFiles=len(source_names))))


if __name__ == '__main__':
    main()
