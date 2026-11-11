"""仅冻结一次复验种子扩展；不修改父合同或授予执行权限。"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAGE2 = HERE.parent
STUDY = STAGE2.parent


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


if __name__ == '__main__':
    target = STAGE2 / 'REPLICATION_CONTRACT.json'
    if target.exists():
        raise FileExistsError('冻结合同已存在，禁止覆盖')
    bindings = [STUDY / 'reviews/stage2-review-6.json', STUDY / 'reviews/stage2-results-audit6.json',
                STUDY / 'STAGE2_REPLICATION_DISPATCH.json', STUDY / 'stage1/SCIENCE_CONTRACT.json',
                STUDY / 'stage1/RUNNER_CONTRACT.json', STUDY / 'stage1/SOURCE_MANIFEST.json',
                STUDY / 'stage1/stage2-configs/lr-1e-4.json', STAGE2 / 'runner_v4_sync1/CONTROL_CONTRACT.json',
                STAGE2 / 'revisions/submission-6/SNAPSHOT.json']
    sources = sorted(HERE.glob('*.py')) + [HERE / 'CONFIG.json', HERE / 'TRANSFORMATIONS.json', HERE / 'SOURCE_DIFF.patch',
                                         STAGE2 / 'create_replication_runner.py']
    def entries(paths):
        return [dict(path=p.as_posix(), sha256=sha(p)) for p in paths]
    contract = dict(schema='continuation-sampler-seed-extension-v1', arm='lr-1e-4-seed20261031',
                    parentScienceContractSha256=sha(STUDY / 'stage1/SCIENCE_CONTRACT.json'),
                    parentRunnerContractSha256=sha(STUDY / 'stage1/RUNNER_CONTRACT.json'),
                    parentControlContractSha256=sha(STAGE2 / 'runner_v4_sync1/CONTROL_CONTRACT.json'),
                    reviewSha256=sha(STUDY / 'reviews/stage2-review-6.json'),
                    actualConfigSha256=sha(HERE / 'CONFIG.json'),
                    scientificDifference={'seed': {'from': 20261030, 'to': 20261031}},
                    evaluation='编码和离线/实战使用未改动父配置；训练sampler使用独立CONFIG的20261031并记录扩展身份',
                    unchangedNumerics=True, unchangedModelAndOptimizerRng=True,
                    budget=dict(samples=80000, updates=10000, cumulativeWallSeconds=14400, separateArmId=True),
                    decisionRule=json.loads((STUDY / 'STAGE2_REPLICATION_DISPATCH.json').read_text('utf-8'))['decisionRuleBeforeReplication'],
                    bindings=entries(bindings), sources=entries(sources),
                    authorization='第六轮限定条件授权；仅seed扩展且预检全部通过后可执行，无权启动第三阶段')
    target.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(dict(replicationContractSha256=sha(target), sourceFiles=len(sources))))
