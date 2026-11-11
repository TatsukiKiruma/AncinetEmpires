"""静态验证获批接续故障和历史证据保留，不运行训练或前向。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTIFACTS = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')
CONTROL = HERE / 'runner_v3_repair3'
STAGE1 = HERE.parent / 'stage1'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


if __name__ == '__main__':
    assert sha(CONTROL / 'CONTROL_CONTRACT.json') == '2f2c10828fcced34e5ecba44c90bc24989a4a6a513905e84d9f0377012b5ff0b'
    control = read(CONTROL / 'CONTROL_CONTRACT.json')
    for entry in control['sources']:
        assert sha(CONTROL / entry['path']) == entry['sha256']
    assert sha(STAGE1 / 'SCIENCE_CONTRACT.json') == '4a3072f855ae3401eed3b83da7451bf1106e303d346b8c42bd816b6b73b994e0'
    assert sha(STAGE1 / 'RUNNER_CONTRACT.json') == '27041dff9a1bde4354094bf4101e4b62a002107d4788caeccedc8590283e2ecd'
    assert sha(STAGE1.parent / 'reviews/stage2-review-3.json') == 'a60ee34cc12a2e3def073512b6ae489b8af5a9840f6a68c6e4e256462c87dcab'
    snapshot = HERE / 'revisions/submission-3'
    previous = read(snapshot / 'EVIDENCE_MANIFEST.json')
    mutable_docs = {'REPORT.md', 'REVIEW_REQUEST.json', 'EVIDENCE_MANIFEST.json', 'R4_REMEDIATION_REPORT.md',
                    'R4_SUBMISSION_AUDIT.json', 'README.md', 'STORAGE_LOCATION.json'}
    canonical_ledger = ARTIFACTS / 'lr-1e-4/ARM_BUDGET.json'
    for entry in previous['entries']:
        path = Path(entry['path'])
        if path == canonical_ledger:
            path = HERE / 'revisions/submission-1/original-ARM_BUDGET.json'
        elif path.parent == HERE and path.name in mutable_docs:
            path = snapshot / path.name
        assert sha(path) == entry['sha256'], str(path)
    fault = read(HERE / 'V3_RESUME1_FAULT.json')
    assert fault['passed'] and fault['actualNewUpdates'] == fault['actualNewSamples'] == fault['gpuForwardCalls'] == 0
    assert fault['exitCode'] == 1 and fault['closure']['status'] == 'failed'
    assert fault['sharingRetryEvents'] == 0
    assert sha(canonical_ledger) == fault['currentClosedLedgerSha256'] == '0475e1532ef21df8b0627de8cdf8ca9fab6c2c357ecedba84eec75ab47e17b8b'
    assert sha(HERE / 'revisions/v3-resume1-fault/ARM_BUDGET.json') == sha(canonical_ledger)
    assert sha(Path(fault['newExceptionCheckpoint'])) == fault['newExceptionCheckpointSha256']
    assert fault['remainingWallSeconds'] == 11918.56766039999
    assert len(fault['repeatedResumeRejected']) == 3
    assert {p.name for p in ARTIFACTS.iterdir() if p.is_dir()} == {'lr-1e-4', 'lr-1e-4-v3-resume1', 'miopen-db', 'miopen-cache'}
    result = dict(passed=True, priorEvidenceEntriesPreserved=len(previous['entries']), approvedControlSourcesUnchanged=len(control['sources']),
                  originalCheckpointAndClosedSnapshotPreserved=True, canonicalLedgerAdvancedOnlyByApprovedAttempt=True,
                  latestChargedSeconds=fault['currentClosedLedger']['consumedWallSeconds'], remainingSeconds=fault['remainingWallSeconds'],
                  realNewUpdates=0, realNewSamples=0, gpuForwardCalls=0, newArenaGames=0, nextArmsNotStarted=True,
                  latestCheckpointAutoRecoveryAllowed=False, authoritativeCodeChanged=False)
    (HERE / 'RESUME1_SUBMISSION_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(result, ensure_ascii=False))
