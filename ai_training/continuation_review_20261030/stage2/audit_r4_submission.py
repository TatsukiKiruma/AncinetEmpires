"""静态核对R4窄修订、repair2原件和原模型预算，不运行Torch或GPU。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
ROOT = STAGE1.parents[2]
VERSION = HERE / 'runner_v3_repair3'
PREVIOUS = HERE / 'runner_v3_repair2'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


if __name__ == '__main__':
    expected = '2f2c10828fcced34e5ecba44c90bc24989a4a6a513905e84d9f0377012b5ff0b'
    assert sha(VERSION / 'CONTROL_CONTRACT.json') == expected
    assert sha(PREVIOUS / 'CONTROL_CONTRACT.json') == 'baf0644c8c679889f0e176e47392843802db83bd6e60ed4620d245c211f3031a'
    control, previous = read(VERSION / 'CONTROL_CONTRACT.json'), read(PREVIOUS / 'CONTROL_CONTRACT.json')
    for directory, contract in [(VERSION, control), (PREVIOUS, previous)]:
        for entry in contract['sources']:
            assert sha(directory / entry['path']) == entry['sha256'], entry['path']
    for key, value in previous['ioPolicy'].items():
        assert control['ioPolicy'][key] == value, key
    changes = read(VERSION / 'R4_CHANGESET.json')
    for entry in changes['unchangedBytewise']:
        assert sha(VERSION / entry['path']) == sha(PREVIOUS / entry['path']) == entry['sha256']
    assert (PREVIOUS / 'recovery.py').read_text('utf-8').replace('continuation-control-v3-repair2', 'continuation-control-v3-repair3') == (VERSION / 'recovery.py').read_text('utf-8')
    science = read(STAGE1 / 'SCIENCE_CONTRACT.json')
    assert sha(STAGE1 / 'SCIENCE_CONTRACT.json') == '4a3072f855ae3401eed3b83da7451bf1106e303d346b8c42bd816b6b73b994e0'
    assert sha(STAGE1 / 'RUNNER_CONTRACT.json') == '27041dff9a1bde4354094bf4101e4b62a002107d4788caeccedc8590283e2ecd'
    for entry in science['scienceSources'] + science['inputs']:
        assert sha(ROOT / entry['path']) == entry['sha256']
    snapshot = HERE / 'revisions/submission-2'
    old_evidence = read(snapshot / 'EVIDENCE_MANIFEST.json')
    mutable = {'REPORT.md', 'REVIEW_REQUEST.json', 'EVIDENCE_MANIFEST.json', 'REMEDIATION_REPORT.md',
               'REPAIR_AUDIT.json', 'audit_repair_submission.py', 'README.md', 'STORAGE_LOCATION.json'}
    for entry in old_evidence['entries']:
        path = Path(entry['path'])
        preserved = snapshot / path.name if path.parent == HERE and path.name in mutable else path
        assert sha(preserved) == entry['sha256'], str(preserved)
    artifacts = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')
    assert sha(artifacts / 'lr-1e-4/checkpoint.pt') == '317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32'
    assert sha(artifacts / 'lr-1e-4/ARM_BUDGET.json') == '9e8d1bf2d0f32b339569a9e4c3eb4603d3704f3bc95fd4a5a9cd7e6322abda0d'
    assert {p.name for p in artifacts.iterdir() if p.is_dir()} == {'lr-1e-4', 'miopen-db', 'miopen-cache'}
    validation = read(VERSION / 'LIGHT_VALIDATION.json')
    assert validation['passed'] and validation['unittestCases'] == 26 and len(validation['cliCases']) == 7
    assert validation['real2mOptimizerUpdates'] == validation['gpuForwardCalls'] == validation['gpuLazyInitAttempts'] == validation['newArenaGames'] == 0
    regression = read(VERSION / 'R4_PREVIOUS_REGRESSION.json')
    assert regression['passed'] and regression['actualFailures'] == 1 and regression['actualErrors'] == 0
    cases = [read(path) for path in (VERSION / 'fixtures').glob('r4-*/R4_RESULT.json')]
    assert len(cases) == 4 and all(case['passed'] and case['defaultIoCap'] == case['defaultHeartbeatSeconds'] == .5 for case in cases)
    result = dict(passed=True, controlSha256=expected, currentSources=len(control['sources']),
                  previousSourcesUnchanged=len(previous['sources']), originalEvidencePreserved=len(old_evidence['entries']),
                  defaultParameterR4CaseOutputs=len(cases), inheritedBytewiseUnchanged=len(changes['unchangedBytewise']),
                  ioLimitsUnchanged=True, recoveryLogicUnchangedExceptVersion=True,
                  originalCheckpointAndClosedLedgerUnchanged=True, real2mOptimizerUpdates=0,
                  gpuForwardCalls=0, newArenaGames=0, nextArmsNotStarted=True, runApproved=False)
    (HERE / 'R4_SUBMISSION_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(result, ensure_ascii=False))
