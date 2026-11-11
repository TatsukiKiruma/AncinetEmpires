"""只读检查故障检查点的优化器步数、日程与游标，不修改恢复资格。"""
import json
from pathlib import Path

import torch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
folder = Path('D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4')
base = torch.load(ROOT / 'ai_training/phone_2m_continue414_20261027/completion/job/output/checkpoint-1.pt', map_location='cpu', weights_only=False)
state = torch.load(folder / 'checkpoint.pt', map_location='cpu', weights_only=False)
increments = [float(value['step']) - float(base['optimizer']['state'][key]['step'])
              for key, value in state['optimizer']['state'].items()]
assert increments and set(increments) == {7758.}
assert state['global_step'] == 249657 and state['sampler']['cursor'] == 62064
assert state['scheduler']['last_epoch'] == 7758
assert not state['pendingAccumulatedGradients'] and not state['recoveryAllowed']
ledger = json.loads((folder / 'ARM_BUDGET.json').read_text('utf-8'))
report = dict(passed=True, optimizerStateEntries=len(increments), optimizerStepIncrement=7758,
              globalStep=state['global_step'], samplerCursor=state['sampler']['cursor'],
              schedulerLastEpoch=state['scheduler']['last_epoch'], nextLearningRate=state['optimizer']['param_groups'][0]['lr'],
              recoveryAllowed=state['recoveryAllowed'], pendingAccumulatedGradients=state['pendingAccumulatedGradients'],
              checkpointArmBudget=state['armBudget'], closedLedger=ledger,
              remainingSampleBudget=80000 - 62064, remainingUpdateBudget=10000 - 7758,
              remainingWallBudgetSeconds=14400 - max(ledger['consumedWallSeconds'], state['armBudget']['consumedWallSeconds']),
              modelModified=False, forwardCalls=0, optimizerUpdates=0,
              interpretation='7758次完整更新由所有AdamW步数及保存游标共同支持；仅有7757条指标。恢复资格保持false，未执行恢复。')
(HERE / 'FORENSIC_CHECKPOINT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
print(json.dumps(report, ensure_ascii=False))
