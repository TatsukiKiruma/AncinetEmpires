# Path3 表示实验本轮报告

日期：2026 年 10 月 3 日  
状态：**两臂训练、四候选共80局DEV评测及收尾核验全部完成；按用户要求暂停，目标未达成。**

本轮只检验三个路径事实能否在同一离线监督协议下产生可测差异，不构成 `16/20` 达标声明。用户已要求：本轮四个固定候选的完整 DEV20 汇总完成后暂停，不开启下一轮训练、搜索或表示实验。

## 冻结合同

正式合同见 [`PATH3_EXPERIMENT_PLAN.md`](PATH3_EXPERIMENT_PLAN.md)，冻结配置见 [`path3_config.json`](out/continuous16_20261003/path3_config.json)。新输入 schema 为 `spatial34_global20_actionSemantics56_v19_path3`：旧 policy 输入 `0:149` 原位保留，新增三列位于 `149:152`，旧 globals 从 `149:169` 右移到 `152:172`。迁移起点 SHA-256 为 `485a2a67fe46eb2bd805e953e4edfa54200fc38655e5b9df358420693bf8b2e6`；其函数与 θ1 在新增三列权重为零时保持一致。

监督目标由冻结参考分布 `p0` 决定。teacher rank 统计严格高于当前 score 的候选数量，同分同 rank，`q = softmax(-rank/2)`。如果 `p0` 首选的 teacher rank 为 0，目标严格等于 `p0`；否则目标为 `0.75*p0 + 0.25*q`。门控不读取训练中模型的当前首选。损失为目标交叉熵加 `0.1 KL(p0||p)`；若更新前批均值 KL 大于 `0.1`，不执行该步。

两臂仅有一个输入差异：control 把新增三维置零，path3 使用真实路径事实。两臂从同一迁移起点开始，使用同一数据、seed 42、有序 batch、AdamW 无权重衰减、学习率 `5e-5`、batch 64、梯度裁剪 0.5、CPU threads 2。只训练 `pol_dense1` 和 `pol_dense2`，固定保存点为真实更新 400 与 800。

## 数据与身份

[`path3_replay_v1/manifest.json`](out/continuous16_20261003/path3_replay_v1/manifest.json) SHA-256 为 `4d5cf5d01ab837c7bfe35378d597333ea50e541a41ebbe3957df252749ea2594`；[`path3_replay.jsonl`](out/continuous16_20261003/path3_replay_v1/path3_replay.jsonl) SHA-256 为 `8a8b01119cf25e915cdca33f44c7f838b58381eb1786099192e1479ce73e6b42`。

- 共 2387 个状态，训练 1715、holdout 672。
- 训练 36 个 true family，holdout 14 个 true family，交集为 0。
- 五张地图、两个来源、三个阶段共 30 个格均有覆盖；采样顺序按 map→phase→source→family 分层。
- teacher raw score 只生成监督 rank/target，不进入空间张量、globals、候选语义或输入身份。
- holdout 来自历史训练源内部的家族隔离，不能当作独立棋力证据。

训练配置 SHA-256 为 `467d369a823ee6ed82377f12bb53ab9e2864efa86253748ace6278f6e4488cae`，训练源码身份 SHA-256 为 `fa612cc638fe7fd3672a4910ecb0f38954a3b3d3daf2bc33aaee1b67d499c022`。完整身份见 [`path3_experiment_identity.json`](out/continuous16_20261003/path3_experiment_identity.json)。

## 正式训练与冻结审计

control 与 path3 均完成 800 次真实 optimizer step，均未触发 KL 早停，并在 400/800 写出固定模型。

| 臂 | 步数 | 400 模型 SHA-256 | 800 模型 SHA-256 |
|---|---:|---|---|
| control | 800 | `0e5de083bb7d85982dc298c6bce22f478e726d3b4c4cdfdf61959cbbd7f7ceb6` | `cbcaf43afe5fd5e4438a2c80a3d86be18b38eaafae84ca3aa4c63fbf84f2c7f5` |
| path3 | 800 | `29e28b7acb28ba7f0d0a2debba0404a9df6897a937a8dac3bc6935f034f7e955` | `1af4a1e0fca180914bfbf53043f8283d9c680b1d0a3041297de691258f8f41ca` |

对两个 `train_state.pt` 做了 CPU threads 2 的逐张量只读审计，结果记录在 [`path3_training_pair_check.json`](out/continuous16_20261003/path3_training_pair_check.json)：

- 两臂 config、data、manifest、init 和 source 身份一致，只有声明的 arm 不同。
- 800 步的 `batchSamplesSha256` 逐步全部相同；哈希载荷同时包含 `sampleId` 与 `inputIdentity`，因此证明的是相同有序样本批，而不只是相同分层计数。
- 800 步的联合分层计数也逐步相同。
- stem、所有 residual block 和 value head 的 14 个张量在两臂中都与迁移起点逐位相同，两臂之间也逐位相同。
- 两臂相对起点发生变化的张量都严格限于 `pol_dense1.weight/bias` 与 `pol_dense2.weight/bias`。
- control 在 400/800 的新增三列均有 `nonzeroCount=0`；path3 在 400/800 均有 132 个非零权重。

## 路径列与 holdout 分析

只读分析见 [`path3_checkpoint_analysis.json`](out/continuous16_20261003/path3_checkpoint_analysis.json)。路径列权重如下：

| 候选 | step | Path3 列 L2 | 最大绝对值 | 非零数 |
|---|---:|---:|---:|---:|
| control | 400 | 0 | 0 | 0 |
| control | 800 | 0 | 0 | 0 |
| path3 | 400 | 0.109781 | 0.016099 | 132 |
| path3 | 800 | 0.193103 | 0.028186 | 132 |

800 步时，control/path3 在 672 条 holdout 上相对 `p0` 的首选保持率分别为 94.494% 与 94.643%，平均参考 KL 分别为 0.06612 与 0.06505。当前首选的 teacher rank 均值分别为 2.9494 与 2.9420，进入 teacher 最高分集合的比例分别为 71.577% 与 71.875%。这些差异很小，只描述训练源内部行为；交叉熵或 teacher rank 不能替代 DEV20 自然胜率。

按阶段看，path3 800 在开局/中盘/后期的首选变化率分别为 1.786%、4.464%、9.821%；control 800 分别为 1.786%、4.464%、10.268%。两臂在后期比开局更常改变首选，但这仍不是棋力结论。

## 三类 parity 与旧输出保持

1. **旧 schema 回归**：旧模型输出保持不变的直接证据，是 [`parity_legacy_after_path3/typescript_forward.json`](out/continuous16_20261003/parity_legacy_after_path3/typescript_forward.json) 与 [`parity_baseline/typescript_forward.json`](out/continuous16_20261003/parity_baseline/typescript_forward.json) 在 20 个案例上的 TypeScript 逐案例精确比较；两份记录整体相等，包括候选顺序、action logits、value 与 best action。另行的 [`parity_legacy_after_path3/report.json`](out/continuous16_20261003/parity_legacy_after_path3/report.json) 验证 TS↔Python 一致性，但其中的数值容差不能用来推断改前改后输出不变。
2. **迁移起点与 smoke**：[`parity_path3_initial/report.json`](out/continuous16_20261003/parity_path3_initial/report.json) 和 [`parity_path3_smoke/report.json`](out/continuous16_20261003/parity_path3_smoke/report.json) 各 20 个案例全部通过，均无 argmax 不一致。迁移起点还与旧 θ1 的受测 action logits、value、best action 保持一致。
3. **正式固定检查点**：control/path3 的 400/800 共四个模型各完成 20 案例 TS↔Python parity，全部通过且均无 argmax 不一致。四份报告的最大 logit 绝对差在 `9.5367431640625e-06` 至 `1.1444091796875e-05` 之间，最大 value 绝对差均不超过 `8.940696716308594e-08`。

冻结的 TS/Python 源码 SHA、测试计数及基础 parity 入口见 [`path3_ts_source_freeze.json`](out/continuous16_20261003/path3_ts_source_freeze.json)。

## Python 旧 V15 回归边界

Path3 专用加载回归保留了 V15 `26/53` 同形加载与历史 GAP 尾部扩展，并明确拒绝把普通 `34/53` 检查点直接按前缀复制成 `34/56`；这类迁移必须走独立迁移器。

Path3 相关的 25 项 Python 测试全部通过。单独运行旧 [`test_v15_parity.py`](../python/tests/test_v15_parity.py) 的实际结果是 **10 passed、1 failed**。失败来自未在本轮修改的 [`v14_spatial_encoder.py`](../python/v14_spatial_encoder.py)：它调用 `estimate_counter_damage_v15` 时传入该函数不支持的 `project_exp` 参数。这个旧 V15 适配器调用签名问题不属于 Path3 模型加载或 TS↔Python 前向 parity 的失败，也不能记录为本轮已修复。

## 完整 DEV20 结果

每个候选均完成固定五图、双座、每图两 seed，共 20 局；仅 `NATURAL_WIN` 计胜，步数截断仍计入分母。四份证据均为 `validPanel=true`，各自模型SHA、种子、评测上限、H0和源码身份一致，无错误或启发式回退。

| 候选 | 固定检查点 | 完整局数 | 自然胜 | 自然负 | 步数截断 | 状态 |
|---|---:|---:|---:|---:|---:|---|
| control | 400 | 20 | 2（10%） | 17 | 1 | 未晋升 |
| control | 800 | 20 | 6（30%） | 12 | 2 | 未晋升 |
| path3 | 400 | 20 | 2（10%） | 16 | 2 | 未晋升 |
| path3 | 800 | 20 | 4（20%） | 13 | 3 | 未晋升 |

新增Path3相对同训练步数控制组的自然胜场差为400步0场、800步−2场；步数截断均多1场。本轮没有观察到新增三维路径事实带来的胜率收益。最佳候选为control 800的6/20，与θ1历史DEV成绩相同，仍远低于16/20。单次20局开发评测也不足以证明泛化能力提高。

本轮合计14次自然胜、58次自然负、8次步数截断；80局中错误、fallback、墙钟超时均为0。正式冠军P1保持不变，未晋升任何候选，CONFIRM20消费为0。训练及评测进程已全部结束，按用户要求停止并暂停持续目标；后续动作等待用户另行指示。

完整汇总见 [`path3_round_closeout.json`](out/continuous16_20261003/path3_round_closeout.json)。各候选的原始20局验收证据为 [`control 400`](out/continuous16_20261003/path3_control_u0400.dev_evidence.json)、[`control 800`](out/continuous16_20261003/path3_control_u0800.dev_evidence.json)、[`path3 400`](out/continuous16_20261003/path3_treatment_u0400.dev_evidence.json)、[`path3 800`](out/continuous16_20261003/path3_treatment_u0800.dev_evidence.json)。全部对局结束后重新核对冻结身份引用的63个文件，差异0，见 [`path3_source_closeout.json`](out/continuous16_20261003/path3_source_closeout.json)。

## 仅供恢复任务时参考的后续事项（本轮不执行）

1. 优先定位自然败局与步数截断的重复行为：按地图、座位和阶段检查循环移动、占城停滞、指挥官暴露与收官失败，先确认限制胜率的具体决策错误。
2. 在重新训练前验证监督标签的实际收益。当前 L1 排序与三维路径输入只有很小的离线差异，旧搜索教师也未通过收益门槛；不宜仅凭训练损失降低就扩大蒸馏规模。
3. 若用户恢复优化，围绕一个已证实的失败原因重新登记小型对照，继续保留家族隔离、源码与模型身份、完整对局分母。DEV 只用于筛选，独立 CONFIRM20 仍保持未消费。

工程维护另有旧 V15 调用签名不兼容、训练 optimizer/RNG 完整恢复与大数据内存问题；这些应单独处理，不能把维护完成写成棋力提升。
