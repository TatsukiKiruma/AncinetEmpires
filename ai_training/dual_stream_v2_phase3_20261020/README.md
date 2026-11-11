# 双流 v2 阶段3

阶段1/2为只读依赖；本目录独立保存新真人准入、紧凑原始局面流、课程训练、校准和实战证据。公共适配器为src/ai_runtime/dual_v2/pure_ai.ts，不接入应用策略入口。

41份新来源并非40份1v1：实际SD为2人3份、4人19份、5人4份、6人14份；SO为4人1份。详见new_replays/admission.json。原3255个父局/响应及其分区不变，新增32训练/9开发；来源不等于统计独立或已证明最优的人类教师。

## 复跑入口

在仓库根目录运行。不要直接对已封存文件重新执行生成命令；复现实验应换新输出目录并记录配置身份。

```text
node --openssl-legacy-provider --import tsx ai_training/dual_stream_v2_phase3_20261020/admit.ts
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/corpus.ts <lane=0..3> 4
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/ensure_coverage.ts
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase3_20261020/train.py check
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase3_20261020/train.py train
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase3_20261020/calibrate.py
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/parity.ts prepare
node ai_training/run.mjs C:/Users/SHIINA/AppData/Local/Programs/Python/Python312/python.exe -X utf8 dual_stream_v2_phase3_20261020/reference.py
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/parity.ts node
node ai_training/run.mjs node dual_stream_v2_phase3_20261020/browser_runner.mjs dual-v2-stage3-pure
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/battle.ts play <lane=0..3> 4
node ai_training/run.mjs node --import tsx dual_stream_v2_phase3_20261020/battle.ts replay 0 1
npx tsc -p ai_training/dual_stream_v2_phase3_20261020/tsconfig.json --noEmit
```

`pipeline.py`只按顺序等待四份采样收据、补足自然结果覆盖并执行训练、校准、PyTorch/Node参考；不会启动Chrome、实战、搜索或手机。`stream.ts`恢复压缩原始状态并逐前态SHA验证、权威枚举和永久排重，再进行在线D2增强和编码，以长度前缀TypedArray帧有背压发送；不生成全量特征文件。TS最多256个待组批样本，Python预取最多2批。

`batch_model.py`仅用于训练批处理，参数和导出合同不变，批次padding有实体/动作mask；与阶段2单样本前向及梯度比较见batch-equivalence.json。真实Chrome验收沿用阶段2浏览器执行器，专属Profile在finally中检查路径并清理。

任何未通过质量门禁都在gate-summary.json和REPORT.md中披露。既有来源与开发面板均已被消费，不称独立最终泛化；不按实战胜负重新选择训练参数。
