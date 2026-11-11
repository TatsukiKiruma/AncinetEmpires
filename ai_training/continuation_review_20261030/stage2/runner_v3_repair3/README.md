# R4窄修订：待审，未批准GPU执行

当前控制合同SHA256为 `2f2c10828fcced34e5ecba44c90bc24989a4a6a513905e84d9f0377012b5ff0b`。

本修订只解决正常优化/完整克隆占用闸门时心跳误停。心跳每0.5秒非阻塞获取闸门，繁忙时跳过/合并本周期；主线程优化前后仍同步写账本。真实写入异常仍在释放闸门前设置failure，阻止下一批。未拉长固定等待期限，文件I/O重试上限仍0.5秒。

`R4_DIFF.patch` 是repair2到本版I/O模块的窄差分；`R4_CHANGESET.json` 验证train、frozen、watch、preflight_guard、已有两套测试和run_checks共7个文件逐字节不变。恢复模块仅更换控制版本字符串，原精确异常/预算/闭合逻辑不变。阶段一科学/数值/采样/编码/评测原件未改。完整V2来源差分和谱系仍在CONTROL_DIFF/SCIENTIFIC_LINEAGE中。

验证见 `LIGHT_VALIDATION.json`：26项合同、7个真实CLI正负例均通过，CUDA初始化尝试0。新增默认参数回归使用0.85秒优化＋0.85秒克隆，覆盖三个心跳周期，无I/O故障时继续下一批；随后真实Windows写锁失败时不开始下一批。`R4_PREVIOUS_REGRESSION.json` 和日志证明同一默认参数回归会识别保留的repair2误停。

所有预算保护继承repair2：同armId/原账本、4小时、80k/10k上限，原异常false字段不改；正常闭合保守记5秒收尾；未闭合V3禁止自动恢复。原检查点仍最多剩17936样本/2242更新/11933.0414379秒，后续运行继续扣减。原臂未恢复，后两臂未启动，最终测试封存。

实际GPU执行仍必须由reviews中的下一轮 `stage2-control-code-approval-v1` 以本合同精确SHA给出 `approved_to_run`。无效模板不能执行，当前审查单也不能启动训练。不要使用repair2的代码批准SHA或旧调度脚本。运行结构及5秒收尾计费的详细说明见上一版README，仅参考设计，不复用上一版执行命令。

本轮只更新本地审查材料，不跨对话发送，不修改STATE/reviews，不创建第三阶段。
