# 旧 episode 数据集断点迁移

迁移入口会把旧 episode 按小批次直接导出为 compact feature 数据集，不生成 full dataset。每个完成的 checkpoint 都包含不可变 manifest、分片哈希和训练/验证集划分；中途按 `Ctrl+C` 后，使用完全相同的参数重新运行即可续接。

## 推荐运行方式

在项目根目录 `C:\code\AncinetEmpires` 打开 PowerShell，先用一个批次验证环境和输出：

```powershell
.\tools\migrate_old_training_data.ps1 -StopAfterBatches 1
```

该命令完成第一个新 checkpoint 后会主动暂停。确认无异常后，去掉测试参数正式运行：

```powershell
.\tools\migrate_old_training_data.ps1
```

默认参数延续原迁移方案：

- 输入：`training_runs\episodes\sd_training_plan_20260705_heuristic-apk-like-balanced`
- 每个 checkpoint：10 个 episode
- 每个 episode 最多：300 个样本
- 特征：`hashed-action-v3`，4096 维，最多 64 个候选
- 重标注：`fast-rollout`，包含 heuristic 评分与快速 rollout
- 验证集比例：10%，按 `scenario + seed` 稳定切分

按此前实测吞吐，完整 fast-rollout 迁移仍可能需要约 70 小时。时间会随 CPU、磁盘和 episode 长度变化。

## 停止与继续

需要暂停时：

1. 在运行迁移的终端按一次 `Ctrl+C`。
2. 等待 Node/npm 进程退出。
3. 以后在同一项目目录执行完全相同的命令。

例如：

```powershell
.\tools\migrate_old_training_data.ps1
```

恢复时会逐个验证已完成 checkpoint 的 manifest、分片大小和 SHA-256：

- 校验通过：直接跳过，不重复计算。
- 当前批次只有 `.partial` 等半成品：移动到运行目录的 `interrupted` 子目录，再重跑该批次。
- checkpoint 校验失败：停止并报错，不会静默使用损坏数据。

因此，强制停止最多损失当前未完成 checkpoint 的计算。默认每批 10 个 episode；如果希望缩小重算粒度，可以从第一次运行起使用：

```powershell
.\tools\migrate_old_training_data.ps1 -BatchEpisodes 5
```

续跑时必须继续带上 `-BatchEpisodes 5`。不要同时启动两个相同迁移进程。

## 查看状态

另开一个 PowerShell 窗口执行：

```powershell
.\tools\migrate_old_training_data.ps1 -Status
```

状态会显示：

- `running`：正在处理当前批次；
- `paused`：由 `-StopAfterBatches` 主动暂停；
- `failed`：本次运行失败，可根据错误修复后续跑；
- `complete`：最终 manifest 已生成并通过验证。

状态文件位于内容寻址的迁移目录内，文件名为 `migration-status.json`。进度只在 checkpoint 完成后增加，当前批次运行期间样本数不会实时跳动。

## 参数一致性

迁移目录由输入文件哈希和生成参数共同确定。修改以下任一项目都会创建新的迁移 ID，而不是接着旧结果运行：

- 输入 JSONL 内容或训练计划；
- `BatchEpisodes`；
- `MaxSamplesPerEpisode`；
- `ShardSamples`；
- 特征维度、候选采样或验证集切分参数；
- 重标注模式及 rollout 参数。

这能避免把不同规则生成的数据误合并。续跑时请复制原命令，不要临时更改参数。

如果只需要更快的 heuristic 重标注，可以从头创建另一个迁移：

```powershell
.\tools\migrate_old_training_data.ps1 -RelabelMode heuristic
```

该结果与默认 fast-rollout 数据集不是同一个版本，不能用来续接默认任务。

## 完成后的验证与训练

迁移完成时终端和 `-Status` 都会给出最终 `manifest.json` 的绝对路径。可再手动验证一次：

```powershell
npm run validate:skirmish:features -- --manifest "这里替换为最终 manifest.json 路径"
```

训练时直接传最终 manifest，不需要合并或复制 checkpoint 分片：

```powershell
npm run train:skirmish:bc -- --dataset-manifest "这里替换为最终 manifest.json 路径"
```

最终 manifest 引用 `checkpoints` 中所有已验证分片。请保留整个迁移运行目录，不能只移动 manifest 文件。

## 已有未完成产物

此前未带 checkpoint 的单体迁移目录会保留，新的断点迁移器不会自动复用其中的 `.partial` 文件。原因是旧单体分片无法证明完整批次边界，直接拼接可能造成缺样、重样或标签规则混用。

确认新迁移完整结束并完成训练验证前，不要删除旧目录。新任务也要预留足够磁盘空间。
