"""归档已完成的验证报告，并保留当前状态文档中的历史记录。"""
import json
from pathlib import Path

root=Path('training_runs/endgame_20260918')
summary=json.loads((root/'summary.json').read_text(encoding='utf-8'))
assert summary['games']==200 and all(summary['checks'].values())
report=(root/'report.md').read_text(encoding='utf-8')
report+='''
## 复现与代码入口

在项目根目录运行以下 PowerShell 命令，使用冻结的独立矩阵，并输出到新目录：

```powershell
node --openssl-legacy-provider --import tsx tools/skirmish_iteration_eval.ts --workers 8 --config training_runs/endgame_20260918/holdout-config.json --out-dir "training_runs/endgame_20260918/recheck-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

策略：`tools/skirmish_endgame_policy.ts`；历史与持续目标：`tools/skirmish_endgame_memory.ts`；真实路径代价：`tools/skirmish_navigation_features.ts`。

示范提取、数据构建、训练、选参、统计审计分别由 `tools/skirmish_endgame_export.ts`、`tools/skirmish_endgame_dataset.py`、`tools/skirmish_endgame_train.ts`、`tools/skirmish_endgame_select.py`、`tools/skirmish_endgame_report.py` 提供。

原始报告、完整 JSON 统计、模型、检查点、配置、哈希及逐局轨迹位于 `training_runs/endgame_20260918/`。保留的模型权重为 `training_runs/pvp_navigation_20260918/fresh-v4-p0.json`；必须配合 `finish` 策略才能复现实验组合的结果，单独加载权重对应纯 BC 基线。
'''
(root/'report.md').write_text(report,encoding='utf-8')
Path('docs/training/ENDGAME_ITERATION_20260918.md').write_text(report,encoding='utf-8')
stats=summary['evaluation'];candidate=stats['holdout/v4-memory'];baseline=stats['holdout/v4-ai-only']
accepted='通过' if summary['independentAcceptancePassed'] else '未通过'
latest=f'''## 2026-09-18 收官修正与独立验证（最新）

已完成用户要求的四项任务，共 200 场新对局（含 24 场失败快照示范生成），实战验证统一 8 worker。已有 v4＋启发式收官策略的开发回归为正常 6/8、残局 11/12、超时 0/20；独立种子为正常 {candidate['normal']['wins']}/16、残局 {candidate['endgame']['wins']}/12、超时 {candidate['total']['timeouts']}/28、非法动作 {candidate['total']['illegalActions']}，独立验收{accepted}。同一独立矩阵的纯 v4 为正常 {baseline['normal']['wins']}/16、残局 {baseline['endgame']['wins']}/12、超时 {baseline['total']['timeouts']}/28。

新增持续目标、真实路径推进、实际移动历史、撤退例外及己方城镇保护。11 个有效来源导出 885 条训练／148 条验证动作，排除 4 个破坏己方城镇的正标签；完成 10%/25% 两组各 3 轮重训并保存最佳轮次。验证集选出的 25% 新权重实战退步，保留已有 v4 权重及实验策略，游戏默认 AI 未切换。

仍有 Icy Paths 正常开局 0/4、个别残局收官缓慢的问题。445 项测试、类型检查、构建及 54 状态／2,026 候选特征一致性检查通过。完整结果、反例、代码入口和复现命令见 [ENDGAME_ITERATION_20260918.md](ENDGAME_ITERATION_20260918.md)。以下为前序记录。

'''
statusPath=Path('docs/training/CURRENT_TRAINING_STATUS.md')
status=statusPath.read_text(encoding='utf-8')
status=status.replace('## 2026-09-18 真人补训与 v4 路径特征（最新）','## 2026-09-18 真人补训与 v4 路径特征（前序）',1)
header='# SD 训练当前状态与后继任务\n\n'
assert status.startswith(header) and '## 2026-09-18 收官修正与独立验证（最新）' not in status
statusPath.write_text(header+latest+status[len(header):],encoding='utf-8')
print('报告及当前状态文档已更新。')
