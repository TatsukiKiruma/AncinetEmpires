"""静态核查本轮代码、冻结原件与首轮保留映射，不初始化Torch或GPU。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE1 = HERE.parent / 'stage1'
ROOT = STAGE1.parents[2]
VERSION = HERE / 'runner_v3_repair2'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


if __name__ == '__main__':
    assert sha(STAGE1 / 'SCIENCE_CONTRACT.json') == '4a3072f855ae3401eed3b83da7451bf1106e303d346b8c42bd816b6b73b994e0'
    assert sha(STAGE1 / 'RUNNER_CONTRACT.json') == '27041dff9a1bde4354094bf4101e4b62a002107d4788caeccedc8590283e2ecd'
    assert sha(STAGE1 / 'SOURCE_MANIFEST.json') == 'd6a02a59ee44273cded5ce7653ec1c0e9c4a1f9b396da6e25d1cb976285de192'
    original = read(STAGE1 / 'SCIENCE_CONTRACT.json')
    for entry in original['scienceSources'] + original['inputs']:
        assert sha(ROOT / entry['path']) == entry['sha256'], entry['path']
    contract_sha = sha(VERSION / 'CONTROL_CONTRACT.json')
    assert contract_sha == 'baf0644c8c679889f0e176e47392843802db83bd6e60ed4620d245c211f3031a'
    control = read(VERSION / 'CONTROL_CONTRACT.json')
    for entry in control['sources']:
        assert sha(VERSION / entry['path']) == entry['sha256'], entry['path']
    for entry in control['preservedEvidence']:
        assert sha(entry['path']) == entry['sha256'], entry['path']
    old_control = read(HERE / 'runner_v3_repair1/CONTROL_CONTRACT.json')
    for entry in old_control['sources']:
        assert sha(HERE / 'runner_v3_repair1' / entry['path']) == entry['sha256']
    keep = read(HERE / 'REVISION1_PRESERVATION.json')
    mapping = {str(Path(item['original'])): Path(item['preserved']) for item in keep['mapping']}
    old_manifest = read(HERE / 'revisions/submission-1/EVIDENCE_MANIFEST.json')
    for entry in old_manifest['entries']:
        path = mapping.get(str(Path(entry['path'])), Path(entry['path']))
        assert sha(path) == entry['sha256'], str(path)
    artifacts = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1')
    assert sha(artifacts / 'lr-1e-4/checkpoint.pt') == '317e3bf8b14db63b65c4eed503e32641f64d85ecd051dcf28085357f091f7e32'
    assert sha(artifacts / 'lr-1e-4/ARM_BUDGET.json') == '9e8d1bf2d0f32b339569a9e4c3eb4603d3704f3bc95fd4a5a9cd7e6322abda0d'
    assert {p.name for p in artifacts.iterdir() if p.is_dir()} == {'lr-1e-4', 'miopen-db', 'miopen-cache'}
    validated = read(VERSION / 'LIGHT_VALIDATION.json')
    assert validated['passed'] and validated['unittestCases'] == 24 and len(validated['cliCases']) == 7
    assert validated['real2mOptimizerUpdates'] == validated['gpuForwardCalls'] == validated['newArenaGames'] == validated['gpuLazyInitAttempts'] == 0
    result = dict(passed=True, currentControlSha256=contract_sha, currentControlSources=len(control['sources']),
                  originalScienceSources=len(original['scienceSources']), originalEvidencePreserved=len(old_manifest['entries']),
                  originalWorkspaceFilesCopied=len(mapping), supersededControlSourcesUnchanged=len(old_control['sources']),
                  originalCheckpointAndClosedLedgerUnchanged=True, nextArmsNotStarted=True,
                  real2mOptimizerUpdatesThisRepair=0, gpuForwardCallsThisRepair=0, newArenaGamesThisRepair=0,
                  finalTestPredictionsThisRepair=0, controlRunApproved=False)
    (HERE / 'REPAIR_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(result, ensure_ascii=False))
