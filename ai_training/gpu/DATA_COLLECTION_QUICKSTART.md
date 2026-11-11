# 调用GPU采集困难AI训练原始数据

适用当前Windows电脑上的项目困难AI复刻与C++ HIP后端，不加载2M模型。输出完整对局记录，来源为`project-apk-hard-replica-gpu`；训练张量转换尚未接通。正式采集仍暂停，以下是独立采集试运行说明，写文档不会自动运行这些命令。

## 准备

在PowerShell进入仓库根目录`C:\code\AncinetEmpires`。需要本机Node、tsx依赖、`ai_training/.venv-rocm`中的ROCm SDK、冻结`ai_training/hard_curriculum3000_pc_gpu_20261029/JOBS.json`及其SHA匹配的本地APK地图资产。

首次或原生源码变化时运行`ai_training/gpu/native/build.cmd`；其VS与Node头文件路径按本机配置，换机器先核对[构建说明](native/README.md)。策略生成器变化时先运行`node tools/extract_apk_hard_runtime.mjs`，不要手改生成资产。然后检查并生成当前worker包：

```powershell
node tools/extract_apk_hard_runtime.mjs --check
node node_modules/typescript/bin/tsc --noEmit -p ai_training/gpu/tsconfig.json
node ai_training/run.mjs node gpu/native/build_worker.mjs
```

## 采集一批独立完整记录

本机建议从64并发开始；希望降低瞬时CPU和内存压力时用32。下面取冻结输入中的前64个不同job，各跑一次完整对局。每次必须使用D盘仓库外的新输出目录，避免高频写入触发代码差异刷新。通用run.ts支持绝对输出路径；旧批次的drive.ts仍绑定旧位置，不可直接复用。

```powershell
$gpuRun = 'D:/AncientEmpiresData/data_trial_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
node ai_training/run.mjs node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out $gpuRun --benchmark --single-batch --workers 64 --limit 64 --native --gpu-range --gpu-distance --shared-assets --shared-worker-code --compact-records --record-chunk-kib 1024
```

`--native`启用C++ HIP；`--gpu-range`和`--gpu-distance`启用GPU范围搜索与距离场；共享参数减少重复读取；合并记录减少写操作。`--benchmark`表示独立实验输出，当前合并格式要求此模式，不自动截成100步。不要加`--max-actions`，仍保留job自身异常保护。修改`--workers`时同步修改`--limit`，以保持完整单批。

这是冻结输入的重新执行，不自动生成新场景，也不自动成为新增训练父局。**正常数据采集不要加`--repeat-first 32`**；该参数仅用来复现相同32局的1／2／4份性能对照，重复副本不能作为独立训练样本。

## 查看结果和正常停止

```powershell
Get-Content "$gpuRun/PROGRESS.json"
Get-Content "$gpuRun/RESULTS.json"
# 需要停止时，在另一个PowerShell窗口使用同一输出路径：
Set-Content "$gpuRun/STOP" '请求正常停止'
```

每局在`parent-编号/attempt-1/`输出`job.json`、`initial.json`、`decisions.jsonl.gz`、`final.json`、`result.json`。每条决策含step、完整before、action、afterSha256和telemetry；`RUN.json`保留来源身份。只将`natural=true`且无error的结果记为自然结束。STOP在当前动作后收尾，强制杀进程可能损失最后未写块，不具备逐动作断点恢复。

若需要同时记录性能，在相同采集命令前使用测量器，两个`--out`须相同：

```powershell
node ai_training/run.mjs .venv-rocm/Scripts/python.exe gpu/native/benchmark.py --out $gpuRun -- node --openssl-legacy-provider --import tsx gpu/parallel/run.ts --out $gpuRun --benchmark --single-batch --workers 64 --limit 64 --native --gpu-range --gpu-distance --shared-assets --shared-worker-code --compact-records --record-chunk-kib 1024
```

此命令是上一条采集命令的替代形式，应另选新目录，不要对已完成目录重复运行。Windows PDH计数器需要执行环境具备读取权限；未知GPU样本不能当0。

## 进入训练前

先按原父局和seed排重、保存来源身份、区分自然／截断／错误，并验证编码及标签合同。困难AI记录的专用张量转换与准入尚未实现于本轮；不要直接调用`gpu/prepare.ts`或`verify_collection.ts`，它们面向另一种模型自对局格式且会严格重放。当前不训练、不生成张量、不改变2414／268分区。

旧`production-v2`仍暂停且源码身份不匹配当前版。正式恢复须另行完成版本迁移、成功局引用和attempt预算保护；不能删除STOP／锁或覆盖RUN来强行接续。详细原因、参数与证据见[汇总文档](OPTIMIZATION_SUMMARY.md)。
