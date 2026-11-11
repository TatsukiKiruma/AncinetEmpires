# 第2代恢复与证据入口

在项目根目录运行：

```powershell
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -B -X utf8 dual_stream_v2_gen02_20261021/run_league.py --target-gen 2
```

源码、规则、模型、输入或合同变化会拒绝续接；不能修改断言绕过。已完成代数不会重训。未完成正式槽必须先strict审计、保全原attempt再登记新路径，不能覆盖前缀。checkpoint保留优化器、RNG、游标与输入SHA；最多49个未保存更新重算。全程不清理旧证据。

Chrome沙箱若出现Crashpad启动错误，先归档失败收据，再以同一冻结browser_runner.mjs在沙箱外执行实际核验；不得拿旧源码收据顶替。旧v2合同和源码快照、首次导入错误及全部Chrome尝试均保留。

合同只支持第2代；后续第3代需要新的用户授权及预登记。当前状态、胜负与所有失败以gate-summary.json和league-state.json为准。
