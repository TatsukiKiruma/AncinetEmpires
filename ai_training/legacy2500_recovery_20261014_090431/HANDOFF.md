# 历史2500局候选数据包交接

交付：2026/10/14 09:30:53（北京时间）。**可用454个独特空间输入，来自48局的456行独立验证快照；旧整局严格恢复通过0局。** 未启动训练，未改R7。

- A 0局：没有现行规则下整条旧轨迹严格通过。
- B 50局：475行完整状态独立验证通过；隔离人口上限编码碰撞后，最终使用48局456行，去重得到训练304行、内部验证150行。
- C 1105局：本地原始轨迹缺失；哈希特征不能恢复棋盘，当前只能留档。
- D 1345局：初态检查已确认不兼容；进一步恢复尚未完成，不能据此声称永久不可恢复。

## 使用合同

读取 [manifest](package/manifest.json)、[schema](package/schema.json)，再读取 [训练数据](package/train.jsonl) 和 [内部验证数据](package/validation.jsonl)。使用R7同哈希冻结引擎、34/20/53编码器和HeuristicAI；候选按引擎原顺序，targetActionIndex为新教师硬标签。必须关闭value loss，不使用旧reward/winner。每行保留stateJson、stateHash和全部来源。

这是 `legacy-no-initial-income-v1` 历史课程，不能作为当前正常开局数据，也不能作为新独立验收集。地图家族划分不得重拆为逐行随机分割。建议只作后续独立实验的少量课程补充；尚无训练收益证据。

**尚未完成跨任务去重**：读取R7运行中文件前缀未见重叠，但它不是最终清单。采用前须再次核对；本任务不写入R7、不自动接入训练。

## 证据入口

- [完整报告](DATA_AUDIT_REPORT.md)、[逐场景统计](scenario_report.json)、[地图统计](map_report.json)
- [资产清单](asset_inventory.json)、[缺失清单](missing_assets.json)、[压缩成员完整性](archive_audit.json)
- [逐局最终结果](episode_results.jsonl)、[原始轨迹入口日志](replay_results.jsonl)、[逐快照结果](snapshot_results.jsonl)
- [失败证据](snapshot_failure_evidence.json)、[全包复验](package_verification.json)、[负对照](checks.json)
- [冻结身份](freeze_manifest.json)、[去重/碰撞/泄漏](dedup_leakage.json)、[跨任务重叠](cross_task_overlap.json)
- [文件保护记录](protection_record.json)、[清理记录](cleanup_record.json)

## 断点恢复

在仓库根目录的PowerShell 7执行：

```powershell
pwsh -NoProfile -File .\ai_training\legacy2500_recovery_20261014_090431\resume.ps1
```

只使用已安装Node/tsx和Python标准库；不安装依赖、不启动模型训练。命令串行运行、限制线程、禁GPU，最多四小时；校验冻结身份和原始记录hash，跳过已完成记录。清理过的逐行缓存可按旧完整快照重建，重建结果必须与断点输入/标签身份相同。

只核验已发布包（约30秒）：

```powershell
$env:TSX_DISABLE_CACHE='1'
node --import tsx .\ai_training\legacy2500_recovery_20261014_090431\verify_package.ts
```

恢复后的报告/清理可运行 `node .../write_reports.mjs`、`node .../cleanup.mjs`；清理只处理本目录的可再生逐行缓存，拒绝链接，不递归。原始轨迹、旧归档、历史模型、唯一失败证据均不得删除。
