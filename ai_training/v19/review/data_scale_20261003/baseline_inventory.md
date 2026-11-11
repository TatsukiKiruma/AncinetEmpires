# Baseline 模型身份与加载入口盘点

日期：2026年10月3日。此盘点只读取模型、源码和既有报告，重算文件 SHA-256；没有启动训练、采样或对局。

## 结论

P1 与 θ1 都可由现有 `v17/tools/arena_run_v17.ts --model` 在冻结 H0 原五图 DEV20 协议中直接加载。两者的实测字节 SHA 与既有登记完全一致：P1 为 `b705b52a25a8954c3c71417997f552db1a0faa792269f667db76e83236e06899`，θ1 为 `0089afe67e14462819bcc80601180e690327c40400b1aa9bd0bad03f19a30b47`。P1 已有同协议 5/20，θ1 已有 6/20；在没有模型字节或推理合同变化的情况下，不应再花成本复验同 SHA。

旧 2500 局 BC 模型也确实存在，SHA 为 `37ef149b42408277093ac0adf94c4d7bb3de808f24a2f4fc4ec38b29ad7901c8`。它是 `hashed-action-v3` 的 4096 维线性 ranker，不是空间网络。仓库已有 `loadBcModel` 与纯 `createBcRankerPolicy` 入口，但冻结 DEV20 arena 只直载空间网络，所以它需要独立的 `CandidatePolicyV16` 适配。适配必须保留固定动作编码、稳定破平与零 H0 回退，不能调用 hybrid 或 blend。

UI 内置模型的登记文件 SHA 为 `f4635487db6b3428e774e52af391ffb120f3a20ef2dd016ad380051c23f598ff`；所有实际存在的登记 checkpoint 均与登记 SHA 一致。可作为纯 policy 的 UI 候选中，三个空间模型可被 arena 直接加载，NET_B 1-ply 需要 dense 模型适配。搜索臂、blend、H0 本身不能放进纯 policy baseline 比较。

θ1 的旧 53 维 v19 schema 在最后一轮 Path3 扩展后仍可复用。当前源码把 `spatial34_global20_actionSemantics53_v19` 与 `spatial34_global20_actionSemantics56_v19_path3` 作为两个独立 schema 明确登记；Path3 只在旧 53 列后追加三列，编码器测试验证旧 53 列逐字节不变。既有 Path3 报告还保存了20个案例在修改前后 TypeScript 前向逐案例精确相等的证据。此次在当前工作树重新执行两个无对局定向测试，`path3_spatial_encoder.test.ts` 与 `schema_v19.test.ts` 共14项全部通过。因此，θ1 的加载、编码和前向入口不需要因为 Path3 的56维 schema而另做适配。

## 可比性清单

| 候选 | 模型身份 | 当前冻结 DEV20 入口 | 已有成绩 | 建议 |
|---|---|---|---|---|
| 旧 2500 局 BC | `37ef149…7901c8`；`hashed-action-v3`，4096 维，最多64候选 | 需独立 BC 适配 | 旧协议正常开局 0/24；抽样离线动作命中率 42.30%，都不可直接当作当前 DEV20 | 最优先补一轮可比 baseline |
| P1:s2026 | `b705b52…e06899`；26通道、v15 语义、2残差块 | 直接加载 | DEV20 5/20；已消费 FRESH40 9/40 | 同 SHA 不重跑 |
| θ1 | `0089afe…a30b47`；34通道、v19 语义、2残差块 | 直接加载 | DEV20 6/20；已消费 FRESH40 9/40；未晋升 | 同 SHA 不重跑 |
| UI Spatial v2 | `1721ca1…5af92`；历史24通道 v13 兼容语义 | 直接加载 | 未找到同一冻结 DEV20 成绩 | 后置 |
| UI Spatial DAgger | `efec05c…fbf9b`；历史24通道 v13 兼容语义 | 直接加载 | 未找到同一冻结 DEV20 成绩 | 后置 |
| UI Spatial v1 | `a6a88b2…e9577f`；v1 24通道/16全局/24动作语义 | 直接加载 | 未找到同一冻结 DEV20 成绩 | 后置 |
| UI NET_B 1-ply | `4839e4c…1a888b2`；dense-45 双头网络 | 需独立 dense 1-ply 适配 | 未找到同一冻结 DEV20 成绩 | 若要解释 UI 纯网络体验，排第二 |

旧 BC 的“超过50%”历史数字不能当作正常开局对 H0 的纯模型胜率。已核对的 53.34%～55.79% 是抽样离线动作命中率；`blend 26/48=54.17%` 混合了正常开局与优势残局且启发式参与决策；`15/24=62.5%` 的对手是弱旧 smoke 模型。当前没有证据表明这个 2500 局纯 BC 在正常开局对启发式的自然胜率超过50%。来源见 `v19/review/scaling_diagnosis_20261003/AI_TRAINING_SCALING_REPORT.md`、`training_runs/evaluation_20260918/report.md` 和 `training_runs/iteration_20260918/report.md`。

## UI 登记项边界

- `spatial_v2_experimental`、`spatial_dagger_experimental`、`spatial_resnet_v1` 是纯空间 policy，可直载。历史文件没有显式 `encoderSchemaId`，当前 loader 依据受控兼容规则分别解释为 v13 或 v1 语义。
- `net_b_1ply` 是 UI 已实现的纯 1-ply policy，但不是空间权重，需为 arena 单独适配。
- `s10_spatial_search` 与 `spatial_v2_experimental` 共用 `1721ca1…5af92`；前者加入 bounded search，不能再算纯 checkpoint baseline。
- `net_b_s10` 与 `net_b_1ply` 共用 `4839e4c…1a888b2`；前者加入搜索，不能与 1-ply 的纯模型成绩混称。
- `s00_search` 是启发式搜索；`heuristic` 是冻结 H0；`random` 只适合作规则冒烟。
- `spatial_v2_smoke_100` 虽有登记 checkpoint，但当前 UI `getAiAction` 没有执行分支；`net_a` 同样没有独立执行分支，现状会落入 H0 fallback。两者在修正入口前都不能产生有效纯模型成绩。

## 最少必要复验

1. 先为旧 2500 局 BC 做窄适配和无对局的加载/动作合法性验证，然后只跑一轮冻结 DEV20。这是唯一兼具用户记忆价值且缺少当前协议成绩的主要 baseline。
2. 若需要核对“UI 中实际可选的纯网络是否更强”，再适配并评测 NET_B 1-ply。
3. 只有前两项仍不能解释历史强模型线索，或确需完整 UI 排名时，才依次评测三个可直载空间模型。

P1 与 θ1 不应再次复验同 SHA。P1 在 policy 组源码变化后已经由 `v19/tools/verify_policy_group_change.py` 做过端到端行为复验，结论是旧 DEV20 仍可引用；θ1 的 DEV20 与 FRESH40 也已经完成并写入当前状态。这样可以把后继评测成本集中在真正缺失可比证据的模型上。

在跑任何新 DEV20 前，UI 模型只需按推理家族做三组最新规则兼容测试，不必每个 checkpoint 重复一整套：

1. 三个 UI 空间模型共享一次加载、候选编码、合法动作包含性和稳定 argmax 测试；它们共用空间 predictor 入口，只需覆盖各自 schema 的加载分支。
2. NET_B 1-ply 单独覆盖 dense-45 状态/动作编码、合法动作映射、稳定破平、零 fallback 和身份上报。
3. 旧 2500 局 BC 单独覆盖 hashed-action-v3、固定动作空间、64候选上限语义、稳定破平和零 H0 回退。

只有某组无对局兼容测试失败、引擎/规则/H0/编码依赖摘要变化，或该模型本来就没有当前协议成绩时，才需要完整对局复验。这样既保留最新规则下的可信度，也避免把 UI 每个模型都无条件重跑。
