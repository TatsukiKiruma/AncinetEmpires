# 正式 BC 基线训练命令

在 PowerShell 执行以下命令。输出文件带时间戳，使用完整训练集和验证集，训练 3 轮。

```powershell
Set-Location C:\code\AncinetEmpires
$trainStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
npm run train:skirmish:bc -- `
  --dataset-manifest training_runs/server_archive_20260913/dataset/manifest.json `
  --feature-dim 4096 `
  --feature-extractor hashed-action-v3 `
  --max-candidates 64 `
  --objective label `
  --learning-rate 0.1 `
  --epochs 3 `
  --progress-interval-ms 2000 `
  --out "training_runs/models/sd-bc-v3-$trainStamp.json"
```

启动后先显示完整数据校验进度（977,737 条），然后每轮显示训练（886,494 条）和验证（91,243 条）进度，包括百分比、速度、已用时间及本阶段预计剩余时间。默认约每 2 秒刷新，检查发生在样本处理边界。每轮结束输出命中率和跳过数，全部完成后保存模型并输出汇总。

进度写到 stderr，`--json` 仍保持 stdout 为最终 JSON；需要静默运行可加 `--no-progress`。训练期间不要关闭终端；当前模型在所有轮次结束后保存，进度显示不提供断点续训能力。

本次仅增加进度显示与验证回调，不改变特征、候选、样本顺序、权重更新或模型参数。由于训练器源文件参与生成器指纹，新增日志后源码指纹会变化；此前兼容性报告记录的是变更前快照。相关测试已确认有无进度输出时训练指标及模型权重相同，现有归档数据无需因此重新导出。

验证记录：类型检查通过；训练器及数据集测试 10 项通过；16 条样本的真实 CLI 检查通过，校验/训练/验证均显示 100%，stdout 可独立解析为 JSON。没有自动启动正式全量训练。
