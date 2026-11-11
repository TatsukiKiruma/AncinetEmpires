# 2414局2M模型接v6搜索后的手机20局对战结果

在小米8（c2357770）顺序执行。模型、对手决策和权威引擎均运行于手机；电脑只负责部署、状态查询与结果整理。

困难对手为项目的APK内嵌困难脚本桥接OriginalApkLikeHardAI，可能回退到Java源码移植；不是直接操作APK原生对局。简单对手为项目默认HeuristicAI。

模型使用2414局导出权重，全部1966910个FP32参数；装配公共DualStreamTurnSearchAI的v6回合搜索，780毫秒主预算、220节点、束宽6、最多3单位、完整队列。不套用旧0.5M外置校准，使用2M自身价值头。网络及搜索均在手机执行，同步FIFO仅连接同机Node与PyTorch进程。

五张官方双人图各换边一次，两类对手各10局、先后手各5局。SD、300初始金币、30人口上限、等级上限3。

预算为每局10000动作、200回合、1800秒有效墙钟；温控等待另计。截断与错误不计自然胜负。

| 对手 | 胜 | 负 | 和 | 截断/错误 | 模型平均毫秒 | P95毫秒 | 最大毫秒 |
|---|---:|---:|---:|---:|---:|---:|---:|
| APK困难脚本桥接 | 4 | 6 | 0 | 0 | 321.75 | 805.15 | 884.92 |
| 简单启发式 | 10 | 0 | 0 | 0 | 315.52 | 775.90 | 1017.40 |

端到端耗时包含合法动作生成、搜索分支编码、同机通信、各次网络前向、动作选择及在线合法性确认，不包含真实引擎执行和日志写入。根决策和队列动作分别统计；一根可有多次前向，不能把每步前向累计耗时当成单次网络速度。780毫秒是主搜索预算，既有反扑最多再借用70毫秒；同步前向及系统调度可使实际耗时更长，超时原样报告。

开始前单独做3次不执行动作的前向预热。两线程PyTorch inference_mode，所有参数requires_grad=false，没有优化器、反向或训练。

## 逐局结果

| 对手 | 地图 | 模型手序 | 结果 | 动作数 | 回合数 |
|---|---|---|---|---:|---:|
| hard | (2) Duel.aem | 先手 | model_win | 496 | 19 |
| hard | (2) Duel.aem | 后手 | model_loss | 197 | 9 |
| hard | (2) Crossed swords.aem | 先手 | model_loss | 621 | 15 |
| hard | (2) Crossed swords.aem | 后手 | model_win | 1049 | 25 |
| hard | (2) Mourningstar.aem | 先手 | model_loss | 571 | 17 |
| hard | (2) Mourningstar.aem | 后手 | model_win | 856 | 25 |
| hard | (2) Liberty Port.aem | 先手 | model_loss | 906 | 25 |
| hard | (2) Liberty Port.aem | 后手 | model_loss | 884 | 23 |
| hard | (2) The Crossing.aem | 先手 | model_loss | 579 | 18 |
| hard | (2) The Crossing.aem | 后手 | model_win | 346 | 11 |
| simple | (2) Duel.aem | 先手 | model_win | 168 | 7 |
| simple | (2) Duel.aem | 后手 | model_win | 165 | 7 |
| simple | (2) Crossed swords.aem | 先手 | model_win | 544 | 15 |
| simple | (2) Crossed swords.aem | 后手 | model_win | 324 | 10 |
| simple | (2) Mourningstar.aem | 先手 | model_win | 494 | 15 |
| simple | (2) Mourningstar.aem | 后手 | model_win | 368 | 11 |
| simple | (2) Liberty Port.aem | 先手 | model_win | 1010 | 25 |
| simple | (2) Liberty Port.aem | 后手 | model_win | 776 | 20 |
| simple | (2) The Crossing.aem | 先手 | model_win | 344 | 11 |
| simple | (2) The Crossing.aem | 后手 | model_win | 326 | 10 |

## 搜索根和队列耗时

| 对手 | 根数 | 根平均ms | 根P95ms | 根最大ms | 队列步数 | 队列平均ms | 队列P95ms | 搜索节点 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| hard | 1515 | 679.31 | 835.78 | 884.92 | 1692 | 1.60 | 5.93 | 11079 |
| simple | 1618 | 646.47 | 814.90 | 1017.40 | 1708 | 2.00 | 6.73 | 10450 |

## 同地图同种子的无搜索基线

{"hard": {"withoutSearch": {"model_loss": 9, "model_win": 1}, "withSearch": {"model_win": 4, "model_loss": 6}}, "simple": {"withoutSearch": {"model_win": 8, "model_loss": 2}, "withSearch": {"model_win": 10}}}

两次评测的模型二进制SHA、地图初态、对手种子及共有公共源码完全一致。v6框架同时包含其既有战术候选排序、风险守卫和队列，区别于无搜索版softPriors直接argmax，比较反映整套推理策略，不能把差异只归因于展开节点。搜索采用墙钟预算，设备状态会影响展开节点数；仅20局开发面板，不宣称独立泛化或显著棋力提升。

## 困难桥接诊断

{"runtimeDecisions": 1935, "nativeFallbacks": 0, "rejectedPlans": 0, "runtimeErrors": 0}

完整逐步记录位于results/matches/<局ID>/steps.jsonl；每步保留动作、前后摘要、端到端/编码/前向耗时及困难桥接诊断。此次只静态核对文件摘要和保存日志链，没有重新执行任何已记录动作，不做重放校验。

这20局用于固定地图和当前运行设置下的小样本评测；地图可能与预训练来源重叠，不视为独立未知地图泛化结论。
