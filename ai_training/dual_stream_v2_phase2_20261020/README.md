# 双流 v2 阶段 2

模型结构与权重合同见[公共模型说明](../../src/ai_runtime/dual_v2/MODEL.md)。证据入口为REPORT.md、gate-summary.json、DELIVERY_MANIFEST.json。本目录最多50,000,000字节，不生成全量训练特征。

## 复跑

在仓库根目录运行；Python需要NumPy、PyTorch。下例使用本机已有解释器；其他机器替换解释器路径，不安装新环境。

```text
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/samples.ts prepare
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase2_20261020/verify_torch.py reference initial
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/gates.ts sanity
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/gates.ts parity initial
node ai_training/run.mjs node dual_stream_v2_phase2_20261020/browser_runner.mjs initial
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase2_20261020/verify_torch.py overfit
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase2_20261020/verify_torch.py reference overfit
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/gates.ts parity overfit
node ai_training/run.mjs node dual_stream_v2_phase2_20261020/browser_runner.mjs overfit
node ai_training/dual_stream_v2_phase2_20261020/public_checks.mjs
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/gates.ts speed
node ai_training/run.mjs node --import tsx dual_stream_v2_phase2_20261020/finalize.ts
```

速度命令应在其他检查/训练进程结束后独立运行。预热后完整记录100次，不删除慢样本；输入合法集合预先生成，口径与阶段1相同。Chrome要求本机真实Chrome可启动，仅访问本地临时HTTP服务；无论成功或失败均在finally中关闭专属进程并清理已核验路径的Profile。

训练通过`samples.ts stream`直接调用阶段1准入器与packTensorBatch，经带背压的长度前缀二进制管道送入Python。64个不同真实前态分别为12/12/16条原生2/3/4人SD、4/4条真人2/3人SO、8/8条真人5/6人SD；所有来源属于manifest的train分区，40条原生样本拥有可信自然结果，真人valueMask始终关闭。samples.bin只保存这一小批量和9个明确标记的架构夹具，用于三端复算；训练重新从来源流读取，并逐数组核对冻结小样本。

新增的SO样本从原有真实SO分层读取，不修改源状态规则。开发阶段早期配置和失败数值/速度证据保存在attempt01～attempt04及独立诊断文件；它们是旧配置记录，不代表当前最终门禁。所有现有来源均为已消费开发材料，Top-1过拟合不是泛化或棋力结论。

`generate_kernels.py`在仓库根目录运行，可确定重建公共矩阵内核；没有运行时eval或动态代码生成。模型/encoder/桥接均不引用该生成器。最终化脚本只生成报告、状态增补和当前交付清单，不启动训练、对战、搜索或部署。
