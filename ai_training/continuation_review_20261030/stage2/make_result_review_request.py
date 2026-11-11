"""将闭合三臂及本地证据绑定到第六轮结果审核请求。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(Path(path).read_text('utf-8-sig'))


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


if __name__ == '__main__':
    comparison = read(HERE / 'TRIAL_COMPARISON.json')
    proposal = read(HERE / 'STAGE3_PROPOSAL.json')
    manifest = read(HERE / 'EVIDENCE_MANIFEST.json')
    assert comparison['experimentsComplete'] and comparison['sameFullBudgetSamplerState']
    assert manifest['candidateArenaGames'] == 120 and manifest['allFormalUpdates'] == 30000
    assert read('D:/AncientEmpiresData/continuation_stage2_20261030_v1/V4_PIPELINE_STATUS.json')['arm'] == 'complete'
    executions = []
    for arm in comparison['arms']:
        executions.append({key: arm[key] for key in ['arm', 'updates', 'samples', 'actualExitCode', 'wallChargedSeconds',
                                                   'checkpointSha256', 'modelSha256', 'recordedMetricRows',
                                                   'missingMetricUpdates', 'clippingFraction', 'outcomes', 'score', 'gates', 'qualified']})
    request = dict(schema='stage-review-request-v1', stage=2, revision=6,
                   createdAt=datetime.now(timezone.utc).isoformat(),
                   workerThreadId='01a1897c-9690-7823-93c8-1e4458f3ca94',
                   coordinatorThreadId='01a18926-e4f6-7d92-9a41-f0e4426453a4',
                   status='completed_screening_result_review_requested', experimentsComplete=True,
                   stageCompletionApproved=False, respondsTo='reviews/stage2-review-5.json',
                   approvalSha256=sha(HERE.parent / 'reviews/stage2-review-5.json'),
                   report='stage2/REPORT.md', reportSha256=sha(HERE / 'REPORT.md'),
                   evidenceManifest='stage2/EVIDENCE_MANIFEST.json',
                   evidenceManifestSha256=sha(HERE / 'EVIDENCE_MANIFEST.json'),
                   evidenceFiles=manifest['count'], evidenceBytes=manifest['bytes'],
                   comparison='stage2/TRIAL_COMPARISON.json', comparisonSha256=sha(HERE / 'TRIAL_COMPARISON.json'),
                   artifactRoot='D:/AncientEmpiresData/continuation_stage2_20261030_v1',
                   approvedScienceContractUnchanged=sha(HERE.parent / 'stage1/SCIENCE_CONTRACT.json'),
                   approvedRunnerContractUnchanged=sha(HERE.parent / 'stage1/RUNNER_CONTRACT.json'),
                   approvedControlContractSha256='18cadae52968a1aa313938f26393b83ea85d6710d8f8ccc687f7f4d8daa0cce5',
                   realExecution=executions, sameFullBudgetSamplerState=True,
                   formalUpdates=30000, formalAtomicExposures=240000, formalCandidateArenaGames=120,
                   reusedBaselineArenaGames=40, finalTestPredictions=0,
                   additionalFormalUpdatesAfterV4Approval=manifest['additionalFormalUpdatesAfterV4Approval'],
                   isolatedEngineeringForwardSamples=8, engineeringOptimizerUpdatesThisV4Smoke=0,
                   historicalSyntheticControlUpdates=208,
                   qualifiedArms=comparison['qualifiedArms'], recommendation=proposal['selectedArm'],
                   stage3Proposal='stage2/STAGE3_PROPOSAL.json', stage3ProposalSha256=sha(HERE / 'STAGE3_PROPOSAL.json'),
                   stage3SuggestedBudget={key: proposal[key] for key in ['additionalAtomicExposureBudget', 'additionalUpdateBudget', 'additionalWallSecondsBudget']},
                   stage3AuthorizedBudget=dict(samples=0, updates=0, wallSeconds=0), stage3Started=False,
                   validation=['三臂原生退出码0、唯一RUN_CLOSURE、原预算闭合、完整AdamW/有限性/导出及LR逐条核对通过',
                               '12次固定1299态预测身份与分层汇总，额外前向0；120局唯一ID/静态摘要链及基线配对检查通过',
                               '全部历史失败、异常false检查点、单条指标缺口及控制谱系保留；最终测试封存',
                               '同步控制9合同/5CLI和一次工程验证为先前批准证据；本轮辅助Python编译/PowerShell解析及实际审计通过',
                               '公共代码未改，公共lint/test/build未重跑；历史训练检查失败未记为通过'],
                   coordinatorActionRequested='审核三臂结果及门槛判定；存在合格候选才评审第三阶段提案，无通过候选则维持正式预算0。',
                   stateAndReviewsModified=False, selfApproved=False, coordinatorMessageDelivered=False,
                   communicationStatus='stage2/COMMUNICATION_STATUS.json',
                   communication='仅写本地交付供既有heartbeat读取，不重试已拒绝的跨聊天发送',
                   explicitUserAuthorizationPending=False)
    (HERE / 'REVIEW_REQUEST.json').write_text(json.dumps(request, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps(dict(revision=6, experimentsComplete=True, recommendedArm=proposal['selectedArm'], evidenceFiles=manifest['count'])))
