# 约200万参数与4秒束搜索

当前进度读 `PIPELINE_STATE.json`、`PIPELINE_FAILURE.json` 和 `REPORT.md`。文件中保存的running不是实际进程存活证明；进程入口另见 `PROCESS.json`。

本轮新架构为1,966,910个参数，权重7,867,640字节。输入与动作指针沿用v2，模型身份独立为 `dual-stream-v3-2m-v1`。PyTorch与TypeScript分模块实现，使用可靠的通用矩阵实现；旧v2及全部历史模型保持原位。

`execution-contract.json`规定正式训练及一次有限学习率修正；`protocol-v2.json`和`sampling-plan-v2.json`保留三代600父局预登记。`evaluation-plan.json`在训练前冻结50个最终开局谱系和100个换边槽；历史未知真人谱系不能据此宣称完全排除。五图十局是已消费回归面板，另有20槽扩展开发，所有外部对手均为Original-APKlikeAI-Hard。

新困难APK原生数据仍为0/3000，不能使用旧普通原生局或项目困难AI轨迹补写其数量。已验收历史/真人数据和项目引擎新采样分别标记，Value只来自可靠自然终局。三代结束后停止，不无限追加。新模型不会部署到GUI。

仓库根目录恢复：

```powershell
& 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe' -B -X utf8 ai_training/expert_iteration_2m_20261022/pipeline.py --run
```

流水线跳过已完成且strict通过的阶段，从训练检查点恢复。源码、模型或索引身份不匹配、数据流失败、未完成对局或低于12GiB空间时保存现场并停止；不要覆盖旧尝试来消除错误。

独立工程检查：

```powershell
npx tsc --noEmit -p ai_training/expert_iteration_2m_20261022/tsconfig.json
node node_modules/vitest/vitest.mjs run src/ai_runtime/dual_v3 --maxWorkers=1
& 'C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe' -B -X utf8 -m pytest ai_training/expert_iteration_2m_20261022/test_training.py -q
```

`parity.ts <模型前缀>`核对对应 `export_reference.py` 生成的105个前向参考；`verify_game.ts <对局目录>`不加载模型，重放全部实际动作及记录的反扑。strict只证明规则一致，不证明最优或完整搜索。

参数量、梯度及权重更新、loss、前向一致性和程序完成均不等于实战棋力提升。最终结论须结合全部对照、配对战果、截断/错误、时延、覆盖、对手回退与未知谱系限制。
