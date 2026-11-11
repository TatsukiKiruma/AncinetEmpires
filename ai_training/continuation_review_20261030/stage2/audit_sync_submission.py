"""只读核查同步候选、工程不可晋升和原正式状态保持。"""
import hashlib
import json
from pathlib import Path
import sys

import torch

HERE = Path(__file__).resolve().parent
CONTROL = HERE / 'runner_v4_sync1'
sys.path.insert(0, str(CONTROL))
from frozen import STAGE1, load_runtime
from recovery import read, validate_control, inspect_resume


def sha(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


if __name__ == '__main__':
    cfg = read(STAGE1 / 'stage2-configs/lr-1e-4.json')
    identity, _ = validate_control(cfg)
    assert identity['controlContractSha256'] == '18cadae52968a1aa313938f26393b83ea85d6710d8f8ccc687f7f4d8daa0cce5'
    smoke_dir = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1/engineering-v4-sync1-smoke1')
    result, launch = read(smoke_dir / 'ENGINEERING_RESULT.json'), read(smoke_dir / 'LAUNCH_RESULT.json')
    assert result['passed'] and launch['exitCode'] == 0 and not launch['timedOut'] and launch['parentWallSeconds'] < 300
    assert result['forwardSamples'] == 8 and result['optimizerUpdates'] == result['arenaGames'] == result['finalTestPredictions'] == 0
    assert result['partitionBytes'] == 371872287 and result['canonicalLedgerAndSourceUnchanged']
    assert result['sourceSamplerCursor'] == 62064 and result['engineeringSamplerCursor'] == 62072
    assert sha(smoke_dir / 'engineering.pt') == result['checkpointSha256']
    state = torch.load(smoke_dir / 'engineering.pt', map_location='cpu', weights_only=False)
    assert state['engineeringOnly'] and not state['promotable'] and not state['recoveryAllowed']
    assert state['optimizerUpdates'] == 0 and state['engineeringForwardSamples'] == 8
    assert sum(value['exp_avg'].numel() for value in state['optimizer']['state'].values()) == 1966910
    runtime = load_runtime()
    assert runtime.tensor_digest(state['model']) == result['modelDigest'] == '45f7b31a68fb08a125c290e2123ace2b4811f5b41a3ba2ce1693e437775f05c9'
    assert runtime.tensor_digest(state['optimizer']) == result['optimizerDigest'] == 'c7dc06b09b41202a3394069544a75b694c94c215631d4322b2e791dcb67c01ac'
    try:
        inspect_resume(smoke_dir / 'engineering.pt', state, cfg, identity)
    except ValueError as error:
        engineering_rejected = str(error)
    else:
        raise AssertionError('工程状态不得作为正式恢复输入')
    artifacts = smoke_dir.parent
    assert sha(artifacts / 'lr-1e-4/ARM_BUDGET.json') == '0475e1532ef21df8b0627de8cdf8ca9fab6c2c357ecedba84eec75ab47e17b8b'
    assert sha(artifacts / 'lr-1e-4-v3-resume1/checkpoint-007758-0f026e6c5cfc48b8819513e6425bddf2.pt') == '74b326d3981af8364252442991641e4d697b8b674b6eaa683f5a94cdf3181175'
    assert not (artifacts / 'lr-5e-5').exists() and not (artifacts / 'lr-2.4495e-4').exists()
    snapshot = HERE / 'revisions/submission-4'
    old = read(snapshot / 'EVIDENCE_MANIFEST.json')
    mutable = {'REPORT.md', 'REVIEW_REQUEST.json', 'EVIDENCE_MANIFEST.json', 'V3_RESUME1_REPORT.md',
               'V3_RESUME1_FAULT.json', 'RESUME1_SUBMISSION_AUDIT.json', 'README.md', 'STORAGE_LOCATION.json'}
    for item in old['entries']:
        path = Path(item['path'])
        if path.parent == HERE and path.name in mutable:
            path = snapshot / path.name
        assert sha(path) == item['sha256'], str(path)
    audited = dict(passed=True, controlContractSha256=identity['controlContractSha256'],
                   previousEvidencePreserved=len(old['entries']), engineeringForwardSamples=8,
                   engineeringStateFormalRecoveryRejected=engineering_rejected, real2mOptimizerUpdates=0,
                   newFormalSamples=0, newGames=0, finalTestPredictions=0,
                   originalCheckpointAndCanonicalLedgerUnchanged=True, sourceSamplerCursor=62064,
                   engineeringSamplerCursor=62072, gpuSmokeParentSeconds=launch['parentWallSeconds'],
                   formalCodeExecutionApproved=False, engineeringRunCount=1)
    (HERE / 'SYNC_SUBMISSION_AUDIT.json').write_text(json.dumps(audited, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(audited, ensure_ascii=False))
