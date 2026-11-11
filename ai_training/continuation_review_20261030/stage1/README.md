# 第一阶段执行入口

从 `C:/code/AncinetEmpires` 执行。独立 GPU 环境为 `ai_training/.venv-rocm/Scripts/python.exe`。GPU 计算须使用本机已授权的非沙箱执行与本阶段独立缓存；沙箱预热超时记录已保留。

```powershell
$gpuPython = 'C:/code/AncinetEmpires/ai_training/.venv-rocm/Scripts/python.exe'
$stageDir = 'C:/code/AncinetEmpires/ai_training/continuation_review_20261030/stage1'
$env:MIOPEN_USER_DB_PATH = "$stageDir/miopen-db-r2"
$env:MIOPEN_CUSTOM_CACHE_DIR = "$stageDir/miopen-cache-r2"
node node_modules/typescript/bin/tsc --noEmit -p "$stageDir/tsconfig.json"
& $gpuPython -X utf8 "$stageDir/final_validate.py"
```

`PARTITIONS.json`、离线面板及两个实战面板已冻结，不重新运行 `partition.ts` 或 `freeze.ts`。完整分区清单约372MB；日常先读 `DATA_SUMMARY.json`、`GROUPING.json` 和 `REPORT.md`。原始快照的无损寻址副本在 `D:/AncientEmpiresData/continuation_stage1_20261030_v1/raw-store`；`STORE_INVENTORY.json` 给出每父局身份。训练只按请求编码当前独立前态，不建立全量张量缓存。

第一轮整改增加 `SCIENCE_CONTRACT.json` 与 `RUNNER_CONTRACT.json`。它们由阶段二配置指定摘要，当前仍待协调审核；任何科学依赖、入口、固定配置或面板变化会在GPU计算／游戏推进之前拒绝。普通源码清单刷新不会更新批准合同。先做无计算预检：

合同内的pending状态记录生成时点。协调者批准时应在 `reviews/` 引用确切SHA，不原地修改合同status以免摘要失效；后续修订同样走新版本审核。

```powershell
& $gpuPython -X utf8 "$stageDir/train.py" --config "$stageDir/STAGE2_CONFIG.json" --preflight-only
& $gpuPython -X utf8 "$stageDir/offline.py" --config "$stageDir/STAGE2_CONFIG.json" --preflight-only
node --import tsx "$stageDir/arena.ts" --config "$stageDir/STAGE2_CONFIG.json" --preflight-only
```

协调者批准第二阶段以后，阶段二执行者可使用以下入口，每臂独立从原2414模型与AdamW恢复。下面只是可审核命令，本阶段未执行它们。

```powershell
& $gpuPython -X utf8 "$stageDir/train.py" --config "$stageDir/stage2-configs/lr-1e-4.json" --out 'C:/code/AncinetEmpires/ai_training/continuation_review_20261030/stage2/lr-1e-4' --reviewed-stage
```

另外两臂配置为 `lr-5e-5.json` 和 `lr-2.4495e-4.json`。配置固定80000有效原子样本、batch8、微批1、200更新预热及同形衰减；每100更新保存完整状态，每2500更新评估固定离线面板。每臂累计4小时，恢复到新输出目录仍继承原臂账本，排除停止间隔，含编码／诊断／保存。编码和诊断分别受剩余预算内120／600秒期限约束，零剩余预算不初始化或更新模型。可用空间低于10GiB、非有限、非法标签或连续两次旧开发显著退化也停止。

只保存最后完整批次屏障。计算／标签异常检查点不可自动恢复，不能跳过半批；正常周期、显式停止或操作超时的完整状态可以在预算未耗尽时 `--resume`，必须保留原账本路径和armId，且与登记的最新检查点SHA匹配。V1工程检查点缺新预算／身份合同，保留原件但拒绝自动恢复。

新目录必须不存在。`--engineering-updates` 限制为0—100且写入不可晋升标记；该类检查点无法用于正式试训恢复。阶段二必须从原基线开始，不能使用 `runs/engineering-*`。

固定离线评估及40局开发实战：

```powershell
& $gpuPython -X utf8 "$stageDir/offline.py" --model '候选导出前缀的绝对路径' --out '新的离线结果目录'
node --import tsx "$stageDir/arena.ts" '候选导出前缀的绝对路径' '新的40局结果目录' $gpuPython
& $gpuPython -X utf8 "$stageDir/compare_arena.py" "$stageDir/arena-baseline-r2/SUMMARY.json" '候选40局目录/SUMMARY.json' --out '新的配对比较.json'
```

困难与简单各20局，完整面板禁止增减；同槽换边、相同初态和种子。模型使用FP32 logits加现有softPriors稳定argmax，不搜索。比较器要求完整唯一40局ID、面板、实际手序及执行合同一致；自然配对不完整时完整得分变化留空，不可按子集均值直接晋升。`seat`是颜色，`actualHand`按初态currentPlayer判断并独立汇总。历史40局原件不改，附加映射见 `BASELINE_EXECUTION_ADAPTER.json`。最终测试面板留到第三阶段，编码服务显式拒绝test与隔离父局。

原件审计与资格边界见 `REPORT.md`；新增工作只在本目录及D盘专用副本目录，没有修改协调者的 `STATE.json` 或 `reviews/`。
