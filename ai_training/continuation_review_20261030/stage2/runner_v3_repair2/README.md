# V3预算I/O修复：待协调者代码审核

当前唯一提交审核的版本为本目录。`CONTROL_CONTRACT.json` SHA256：

```text
baf0644c8c679889f0e176e47392843802db83bd6e60ed4620d245c211f3031a
```

合同中pending及approvedToRun=false记录生成时点，不能原地改字节冒充批准。执行必须提供协调者在 `reviews/` 下独立生成的 `stage2-control-code-approval-v1`，decision必须为`approved_to_run`，精确绑定本合同SHA、原预算及此单一异常checkpoint SHA。`APPROVAL_TEMPLATE_NOT_VALID.json` 仅是无效示例，位置及decision均不具执行资格。当前 `stage2-review-1.json` 只允许代码修复，真实入口已证实会拒绝它启动训练。

本轮只做预检、Windows隔离文件夹具和三参数CPU合成夹具。真实2M新增更新0，GPU前向0，新实战0，原检查点及闭合账本没有改写。

## 模块与身份

- `frozen.py` 显式导入未改的阶段一模块，拒绝同名模块遮蔽。
- `io_control.py` 处理唯一临时文件、Windows共享冲突有界重试、预算/优化互斥闸门和心跳故障传播。
- `recovery.py` 校验新控制合同、协调者执行批准及精确异常恢复条件。
- `train.py` 复用原fresh/update/Encoder/Sampler及固定离线入口，只改变控制和持久化。
- `watch.py` 仅看PROGRESS和RUN_CLOSURE，不读取活动预算账本。

`SCIENTIFIC_LINEAGE.json` 列出原90项依赖和新增控制职责，`CONTROL_DIFF.patch` 提供原train/budget与新入口/控制模块完整差分。原科学/运行器合同不变；新checkpoint.executionIdentity显式包含V3控制SHA和frozenV2身份，不声称运行器版本相同。离线和实战仍由原V2评测入口执行，因此其结果为V2评测身份，训练控制谱系另记。旧 `audit_stage2.py` 针对V2状态，不能不经适配直接宣称V3检查点同一运行器；V3完整性可以使用本版本的只读恢复检查器核查。

## 有界持久化与预算

仅Windows PermissionError的winerror5/32/33允许重试，普通写入每操作最多0.5秒；检查点序列化最多等待5秒，闭合证据最多2秒。所有等待计入ArmBudget。持久拒绝、超时、非文件共享异常均停止。超时写线程只能留下唯一临时文件，主线程不提升其结果；不删除失败原件。

心跳持久化失败在释放优化闸门前公布，主线程在每次优化前重新检查，已进入的完整更新及克隆屏障共用同一锁。收尾异常作为附加错误保存，保留最初异常。RUN_CLOSURE和进程退出码必须同时检查，RESULT存在本身不能代表成功。

正常最终闭合保守加记5秒收尾预留，账本同时记录observedWallSeconds与shutdownTailReservationSeconds，恢复使用更大的consumedWallSeconds，预留不退还。它覆盖最终账本替换、2秒闭合证据及退出前小量工作。无法闭合并预记收尾的V3账本禁止自动恢复，需独立核算再审。原V2唯一异常按独立核验的2466.9585621秒下限桥接，后续仍继承原臂/账本。

已进入的单次GPU原生调用及操作系统内核调用不能由Python强行抢占；调用前后检查预算，停止后只允许有界安全保存，不能据此追加优化。新GPU吞吐、序列化原生调用行为尚未实测，本轮不作保证。

检查点使用不可变的新文件名，LATEST指向最后已保存文件。未来最多约100次周期保存/臂，三臂从头上界约7.5GB；本次原臂只剩2242次更新，实际新增更少。保留旧文件，不清理历史资产，继续执行磁盘剩余10GiB停止条件。

## 本轮已执行的只读验证

```powershell
$gpuPython = 'C:/code/AncinetEmpires/ai_training/.venv-rocm/Scripts/python.exe'
$controlDir = 'C:/code/AncinetEmpires/ai_training/continuation_review_20261030/stage2/runner_v3_repair2'
& $gpuPython -X utf8 "$controlDir/train.py" --preflight-only
& $gpuPython -X utf8 "$controlDir/train.py" --preflight-only --resume 'D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4/checkpoint.pt'
```

正式验证日志见 `LIGHT_VALIDATION.json`／`.log`，24项合同、7个CLI正负例。CLI检查由 `preflight_guard.py` 包裹真实argparse入口，任何CUDA惰性初始化会失败。`run_checks.py` 要求新报告路径，不覆盖首次结果；测试输出和合成检查点全部是本目录fixtures，不能晋升模型。

## 待批准后的单臂命令形状

以下未执行，不能用无效模板替代协调者真实批准：

```powershell
& $gpuPython -X utf8 "$controlDir/train.py" --reviewed-stage `
  --config 'C:/code/AncinetEmpires/ai_training/continuation_review_20261030/stage1/stage2-configs/lr-1e-4.json' `
  --resume 'D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4/checkpoint.pt' `
  --out 'D:/AncientEmpiresData/continuation_stage2_20261030_v1/lr-1e-4-v3-resume1' `
  --code-approval '协调者实际批准文件的绝对路径'
```

必须沿用原独立MIOpen环境。原armId、原账本路径、cursor62064、7758更新、模型/AdamW/RNG均继承，最多剩17936样本、2242更新、11933.0414379秒，运行入口、重试和收尾继续扣减。原false字段和异常文件不修改。后两臂依次仍从原2414/AdamW开始，不串接；每个合格终点才困难20＋简单20，最终测试封存。

不要再使用旧 `run_remaining.ps1` 作为新修订调度器。当前只提交代码，不启动GPU、不启动后两臂、不新增实战、不推进第三阶段。
