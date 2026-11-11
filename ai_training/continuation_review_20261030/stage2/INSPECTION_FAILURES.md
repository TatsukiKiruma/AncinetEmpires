# 只读取证工具首次失败记录

以下不是额外训练、模型故障或实战，不改真实检查点、原件或账本。

- `reproduce_windows_replace.py` 第一版在隔离夹具中假设 `shareFlags=7` 一定允许覆盖已打开的目标，断言失败。实际两个共享模式都在读句柄存活时收到 WinError 5，关闭后成功。第一版源码保存在 `revisions/reproduce_windows_replace-v1.py`，第一版夹具在 `windows-replace-fixture/`。第二版只将已实测的“打开拒绝／关闭成功”作为断言，附加控制如实保留在 `WINDOWS_REPLACE_REPRO.json`，没有宣称识别出真实故障的句柄持有者。
- `inspect_checkpoint.py` 第一版遗漏基线路径中的 `ai_training/`，在任何检查点加载前报 `FileNotFoundError`。第一版源码保存在 `revisions/inspect_checkpoint-v1.py`，更正位置指针后重新执行。没有运行模型前向、更新或改变恢复资格。
- 初始沙箱 CIM 查询不可用；没有据此声称同机无其他 GPU 进程。正式训练通过工具的非沙箱权限执行，WinError 5 是运行时文件替换失败，不是自动审批拒绝。
