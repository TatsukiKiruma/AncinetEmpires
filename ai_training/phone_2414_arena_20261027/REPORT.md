# 2414局模型手机20局对战结果

在小米8（c2357770）顺序执行。模型、对手决策和权威引擎均运行于手机；电脑只负责部署、状态查询与结果整理。

困难对手为项目的APK内嵌困难脚本桥接OriginalApkLikeHardAI，可能回退到Java源码移植；不是直接操作APK原生对局。简单对手为项目默认HeuristicAI。

模型使用2414局导出权重，全部1966910个FP32参数；策略为logits加训练既有softPriors的稳定argmax，没有额外搜索。

五张官方双人图各换边一次，两类对手各10局、先后手各5局。SD、300初始金币、30人口上限、等级上限3。

预算为每局10000动作、200回合、1800秒有效墙钟；温控等待另计。截断与错误不计自然胜负。

| 对手 | 胜 | 负 | 和 | 截断/错误 | 模型平均毫秒 | P95毫秒 | 最大毫秒 |
|---|---:|---:|---:|---:|---:|---:|---:|
| APK困难脚本桥接 | 1 | 9 | 0 | 0 | 79.72 | 148.31 | 243.31 |
| 简单启发式 | 8 | 2 | 0 | 0 | 88.86 | 160.90 | 324.43 |

端到端耗时包含权威合法动作生成、编码、手机进程通信、网络前向、动作选择及在线合法性确认，不包含引擎执行和日志写入；单候选强制动作也逐步记录。SUMMARY同时提供非平凡决策及网络纯前向统计。

开始前单独做3次不执行动作的前向预热。两线程PyTorch inference_mode，所有参数requires_grad=false，没有优化器、反向或训练。

## 逐局结果

| 对手 | 地图 | 模型手序 | 结果 | 动作数 | 回合数 |
|---|---|---|---|---:|---:|
| hard | (2) Duel.aem | 先手 | model_loss | 181 | 8 |
| hard | (2) Duel.aem | 后手 | model_loss | 268 | 11 |
| hard | (2) Crossed swords.aem | 先手 | model_win | 1080 | 28 |
| hard | (2) Crossed swords.aem | 后手 | model_loss | 640 | 15 |
| hard | (2) Mourningstar.aem | 先手 | model_loss | 349 | 13 |
| hard | (2) Mourningstar.aem | 后手 | model_loss | 623 | 19 |
| hard | (2) Liberty Port.aem | 先手 | model_loss | 744 | 21 |
| hard | (2) Liberty Port.aem | 后手 | model_loss | 498 | 16 |
| hard | (2) The Crossing.aem | 先手 | model_loss | 645 | 20 |
| hard | (2) The Crossing.aem | 后手 | model_loss | 465 | 15 |
| simple | (2) Duel.aem | 先手 | model_win | 130 | 6 |
| simple | (2) Duel.aem | 后手 | model_loss | 352 | 15 |
| simple | (2) Crossed swords.aem | 先手 | model_win | 431 | 13 |
| simple | (2) Crossed swords.aem | 后手 | model_win | 355 | 11 |
| simple | (2) Mourningstar.aem | 先手 | model_loss | 894 | 26 |
| simple | (2) Mourningstar.aem | 后手 | model_win | 372 | 13 |
| simple | (2) Liberty Port.aem | 先手 | model_win | 609 | 18 |
| simple | (2) Liberty Port.aem | 后手 | model_win | 1217 | 32 |
| simple | (2) The Crossing.aem | 先手 | model_win | 338 | 12 |
| simple | (2) The Crossing.aem | 后手 | model_win | 299 | 11 |

## 困难桥接诊断

{"runtimeDecisions": 1910, "nativeFallbacks": 0, "rejectedPlans": 0, "runtimeErrors": 0}

完整逐步记录位于results/matches/<局ID>/steps.jsonl；每步保留动作、前后摘要、端到端/编码/前向耗时及困难桥接诊断。此次只静态核对文件摘要和保存日志链，没有重新执行任何已记录动作，不做重放校验。

这20局用于固定地图和当前运行设置下的小样本评测；地图可能与预训练来源重叠，不视为独立未知地图泛化结论。
