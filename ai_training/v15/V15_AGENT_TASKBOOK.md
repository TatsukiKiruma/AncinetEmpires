# V15 Agent 任务书：修正证据链，完成受控纠错实验

版本：1.0；2026-09-25。依据 `main@c1b9ac038fad98ed97bfd72a801fd564747acd07` 及已有未提交修改。

必读：[V14b 审核](../v14/V14B_AUDIT_REVIEW.md)、[数据契约](V15_DATA_CONTRACT.md)、[实验协议](V15_EXPERIMENT_PROTOCOL.md)。本文未重复的字段、预算与统计定义以两份配套文档为准。

## 0. 执行约定

本轮目标是修复已证明的正确性问题，建立干净 C2 基线，完成 D0/D1/D2 的公平比较，并用真实规则解释主要失败窗口。硬检查通过后必须继续实际训练与开发对战；实验负面不等于任务失败。

所有沟通、报告与新代码注释使用中文。保持 UI。新增模块遵守单一职责；共享逻辑放公共模块，研究脚本放 `v15/tools/`。不得重置既有修改、删除旧工件、修改规则使测试变容易，或自动替换生产模型。

每次执行使用新的 `v15/out/<runId>/`，建议 `v15_YYYYMMDD_<用途>`；输出存在时拒绝覆盖，只有显式恢复同一身份运行才允许续写。原 V14 工具若硬编码输出目录，应先提供可注入输出路径或新包装器，不能运行后覆盖历史结果。

文中新增文件是目标接口，不是现成 CLI。实现后交付真实 `--help`、完整命令、输入与输出 SHA。生产训练禁止 `--deploy-to-src`、`--legacy-bug-repro`、`--allow-legacy-grouping`。

### 0.1 分工与唯一文件所有权

用户可按下表派发；本任务文档不自动启动 agent。独立部分可并行，共享文件由唯一负责人修改。**所有执行者都不是仓库中唯一工作的人，不得撤回其他人的修改；接口冲突先协调，按实际变更适配。**

| 角色 | 任务/职责 | 独占实现范围 |
|---|---|---|
| A 协调/评测 | T15-00、09、11；冻结协议和最终裁决 | `v15/tools/identity_*`、`eval_*`、`package_*`、协议/清单；必要的 V14 评测公共修复 |
| B 规则/编码 | T15-02；公共输入版本实现 | `src/game/rules.ts`、必要的纯战斗模块、`engine.ts` 的等价抽取；TS encoder/shared policy/predictor；`python/spatial_resnet_model.py` 的 schema 加载/导出 |
| C 训练/运行 | T15-03、06、08 的训练与消费对照 | `python/train_spatial_resnet.py`、训练生命周期测试、`v15/tools/train_*`、运行配置及日志 |
| D 状态/教师 | T15-01、07、10 | `v15/tools/replay_*`、`labeler_*`、`teacher_*`、`counterfactual_*`；新研究教师模块 |
| E 数据 | T15-04、08 的采集/匹配池 | `v15/tools/dataset_*`、`collect_*`、`build_groups_*`、split 和输入身份模块 |
| F 一致性验证 | T15-05；独立核对 B/C 接口 | `v15/tools/parity_*`、相关测试、`python/verify_parity.py`、必要的 Python 编码验证适配 |

若只有一个 agent，可按同样任务依赖顺序执行。多人时 B 不顺手改训练循环，C 不自行改 schema 导出，E 不另写一个标签器，F 发现公共缺陷交给其 owner 修复。T15-08 由 C 汇总验收，E 交付冻结数据和 sampler 输入。

### 0.2 Gate 与执行顺序

| Gate | 条件 | 限制 |
|---|---|---|
| G0 | T15-00 完成初始身份、预算、root 命名空间和所有权冻结 | 可开始实现；运行前更新实际依赖身份 |
| GL | T15-01 标签/状态合同通过 | 才能生成正式 L1 数据 |
| GR | T15-02 规则及 schema 正反例通过 | 才能冻结新 schema 数据 |
| GO | T15-03 总预算、final、恢复、sampler 回归通过 | 才能启动正式固定预算训练 |
| GD | T15-04 基础数据验收通过 | 正式训练只使用其冻结产物 |
| GP | T15-05 新 schema 数值/输入验证通过 | 正式模型输出需同路径导出验证 |
| GE | T15-09A 评测自测、成本校准及清单冻结通过 | 正式开发/确认对战前必须通过 |
| GC | T15-06 三 seed C2 训练、开发对战完成 | 供 T15-08 比较；数据采集可在 C2-42 final 冻结后提前开始 |
| GI | T15-08 有效三 seed 对照完成 | 支持选择或否定纠错候选，不等于强度提升 |
| GT | T15-10 搜索教师相应资格 | 只约束搜索标签分支 |

```text
T15-00
 ├─ T15-01 状态/标签 ───────────┐
 ├─ T15-02 规则/schema ─────────┼─ T15-04 数据 ─┐
 ├─ T15-03 训练生命周期 ────────┼─ T15-05 验证 ─┼─ T15-06 C2 ─ T15-08 D组
 └─ T15-09A 评测协议 ──────────┴───────────────┘       │           │
     旧开发轨迹/夹具 ─ T15-07 反事实（新C2产生后补充）    └───────────┤
     T15-01/02/09A ─ T15-10 搜索研究（独立分支）                   │
                                             T15-09B/C 对战/条件确认 ─ T15-11
```

T15-05 可先用夹具/小池验证，不等待正式全量采集；全量产物在 T15-04 冻结后补 hash/抽样核对。T15-09A 是 T15-09 的独立前置验收，不能因整个 T15-09 尚未 DONE 阻塞基础训练链。T15-07 新模型补充分析不阻塞未定向加权的 D 组主线。

## 1. T15-00：冻结工作区、勘误与可执行预算

**owner A；优先级 P0；输出 `T15-00/`。**

步骤：

1. 记录实际 branch/HEAD、tracked/untracked 修改、Node/Python/PyTorch、设备/线程/内存与依赖版本。保留 `v13/temp.md` 和其他已有文件。
2. 保存相关源码原始内容或可恢复的基线+patch、字节 SHA；标记工作区起始/运行时/最终三个身份。源文件在他人并发修改时暂停冻结该模块，避免一份快照包含前后混合内容。
3. 建立 `prior_evidence.json`，引用审核原始 JSON 与 SHA，不重新跑所有旧实验。区分可复用的测量、必须重跑的受影响接口。
4. 新建 `v14b_errata.md`，逐条更正：错误教师探针；37/40 状态不同；tiny 实际优化 127；end_turn 尚未证明；反击升级与旧 schema 反例；D 更新/N 混淆；假空 epoch 崩塌；三人 34/36 与 26/36 两种口径。
5. 将实验协议转成实际配置：数据源、所有清单、master seeds、训练预算、caps、对局 ID、缓存合同、sampler/调度、产物路径。成本预检后允许在正式运行前冻结 cap 修订；保留修订理由与旧配置。
6. 检查独立 root 命名空间及祖先交集；确认用清单冻结后不用于调参。指定每项文件 owner，保存集成次序。

验收：任一训练/评测都能定位其启动时源码、数据、模型、命令；新运行没有覆盖旧产物；计划预算可计算而不是“跑若干 epoch”。历史内容不可恢复写 UNKNOWN。

产物：`source_start.json`、`source_bundle/`、`environment.json`、`prior_evidence.json`、`v14b_errata.md`、`protocol.json`、`root_manifests/`、`ownership.md`。后续每次运行另写 runtime snapshot。

## 2. T15-01：真实窗口恢复与独立标签器

**owner D；P0；依赖 G0；输出 `T15-01/`。**

入口调查：`v14/tools/teacher_qualification_probe.ts`、`collect_student_states.ts`、`v14/review/audit_v14b_windows.ts`。可复用有效的引擎/codec 逻辑，但不能继承错误重放与共享 RNG。

步骤：

1. 实现精确快照/完整 action trace 两种恢复入口；返回状态、stateHash、行动玩家、联盟、合法码摘要与 fidelity。缺证据时返回诊断状态，禁止自动用 AI “走到相同步数”。
2. 建立主标签 L1 包装，固定逐状态 seed，独立实例；行为 H0 和标签 L1 的版本、随机状态分别记录。
3. 资格探针分成固定键复现、跨键多样性、候选顺序、无状态污染、合法性五个独立报告。replicate 不得偷偷改变“固定键”用例的 seed。
4. 历史审核第 37/114 步作为回归调查；缺完整旧轨迹时保留其审核证据，不伪造“新的精确历史复现”。新采集至少 128 个精确窗口，以它们完成正式 GL。
5. 新窗口包含 2p/3p、非 playerId=allianceId 的联盟夹具、pending 与特殊动作；测试联盟只影响结果视角，不混淆 getAction 的 playerId。
6. 相同确定性行动上限下，标签查询开/关各走至少 4 个 root（2p/3p 各 2），逐动作、逐状态 hash 一致；按需同时测试非主体座位，覆盖旧代码推进对手 RNG 的位置。

验收：128 窗口恢复校验全通过；固定键三次标签一致；所有正式标签在允许集内；查询前后状态不变；开/关标签的行为轨迹完全一致。异常整行 quarantine 并使对应硬检查失败，不能删除异常后报告零违规。

跨 seed 标签不同只记多样性。GL 只证明可用标签合同，不证明教师强于 H0，也不要求从生产 `heuristic_ai.ts` 删除随机项。

产物：`replay_contract.json`、`labeler_contract.json`、`labeler_reproducibility.json`、`query_isolation.json`、完整窗口及轨迹、失败反例；新公共标签接口供 E/D 共用。

## 3. T15-02：修复反击结算投影与 schema 分派

**owner B；P0；依赖 G0；输出 `T15-02/`。**

步骤：

1. 以真实引擎 attack 顺序为权威：主动伤害、状态附加、攻击者经验/升级、反击资格、反击伤害、后续状态/经验和动作效果。只改变预测或抽取等价公共步骤，不改变游戏规则。
2. 修复 `estimateCounterDamage` 漏掉的攻击者升级。使用共享无副作用解析或经过验证的轻量投影；避免在训练工具里再复制一套战斗公式。
3. 最小回归：道路相邻 0 级满血士兵，经验 0 与 90，levelCap=3；对应反击 25 与 22。增加刚好低于阈值/越过阈值、达到等级上限、击杀目标无反击、致盲、已有状态、counter_storm、射程正反例。
4. 检查预测不修改原状态；核验返回值确为反击本身，不能把升级/治疗/站城等引起的总 HP 差全叫反击。验证完整战后 HP/等级/状态作为辅助。
5. 显式实现 V13/V14/V15 状态和动作编码分派，联动 Python schema 加载/导出与 TS shared policy。未知 schema、维度矛盾、缺身份的新权重 fail-fast。
6. 旧模型兼容验收走真实 shared policy，而非只调用 encoder 单函数。保留 V13 反例旧值 50、V14 升级旧值 25、新 V15 值 22 的独立 golden；历史实际缺陷运行路径另标 runtime，不混用。
7. 测量相同状态集的编码/推理耗时与 clone 数；若新实现因每候选全引擎模拟显著变慢，优先共享解析并复验正确性，报告最终成本。

验收：原规则套件继续通过，新增正反例全部与真实合法引擎结果一致；状态不污染；公共语义变化使用新 schema；旧路径兼容或明确拒绝且有影响清单；候选构建仍不依赖标签。

产物：`combat_projection_results.json`、`schema_contract.json`、`schema_compatibility.json`、golden 输入/输出、成本记录、公共代码 patch。已有 145 个断言通过不能代替新增升级断言。

## 4. T15-03：训练预算、final、恢复和按更新采样

**owner C；P0；依赖 G0；输出 `T15-03/`。**

步骤：

1. 修复达到 global update limit 后外层继续空 epoch 的控制流，明确 `GLOBAL_UPDATE_LIMIT` 正常退出；更新注释中无证据的“logits 过大导致崩塌”解释。
2. 统一所有退出路径的真实 final 与 resumable state 保存：预算耗尽、正常 epoch 结束、受控暂停；真实异常保留最后已确认有效状态并标失败。
3. 按数据契约保存累计消费和 sampler/RNG 游标；恢复检查数据、split、schema、预算与调度身份。旧 state 缺必要字段时拒绝精确恢复。
4. 增加显式按 update 的 LR 调度，不悄悄改变旧 epoch 调度含义。训练记录每步 LR，验证与协议公式一致。
5. 增加可注入确定性 batch/sampler 计划及消费台账，支持每步 16+16 的来源配额。不能靠复制 JSONL 长度近似保证曝光。
6. 增加明确 train-only 诊断模式，允许 128 个样本全部进入优化；正式训练仍禁止缺验证集。诊断使用 final/训练命中作为输出依据，不能用单行 val 选 best。

有针对性的回归（使用小型真实模型/数据，不需要长训练）：

- epoch 有 4 个 batch，总预算 3：正好 3 次更新、无第 4 步，无伪零 epoch，final 对应第三次更新。
- 总预算刚好一整个 epoch、跨 epoch、在中途停下：更新/曝光/LR 均与计划相符。
- 相同初始状态连续跑 8 步，与第 3 步保存后恢复至 8 步：CPU 固定环境下采样序列、LR、消费一致，权重按预登记容差比较；不能只比较最终 accuracy。
- 已完成预算后恢复：0 次额外更新，幂等收尾；改变 schema/data hash 的恢复被拒绝。
- 人为注入非有限输入或 loss 时报告真实错误，不与零消费混淆。

验收：上述测试通过；预算不会因 resume 重置；正式有效曝光可从 update ledger 精确复算；best/final/state 清楚区分。

产物：`trainer_lifecycle_results.json`、`resume_equivalence.json`、`sampler_contract.json`、`lr_trace.json`、更新后的实际 CLI 文档。由 B 实现 schema 模型接口，C 只对接，不并发改其文件。

## 5. T15-04：去污染数据与历史模型正确重评

**owner E；P0；基础数据依赖 GL/GR；输出 `T15-04/`。**

步骤：

1. 按数据契约实现 stateHash、policyInputKey、decisionKey、冲突报告；测试改标签、候选重排不会拆分同一输入，真正改变输入会被识别。
2. 审计历史池 9,547 行的有效来源；重新统计不含标签的跨分区交集。历史“150 组重复”是旧 key 的读数，不预设新 key 得到同一个数。
3. 形成旧 schema 的干净评估子集，逐个重评 C1 三 seed 的 best/last，共六个 checkpoint。按实际保存标签报告历史模仿准确率；如另用 L1 重标，必须另列指标，不混称相同任务。
4. 模型、数据和推理 schema 必须匹配。历史复测注明是保存输入评估、旧运行路径复现还是修正分派后的在线推理；六个模型各自给 top-1/top-k/CE 和 SHA，不平移 seed 42 last 的降幅。
5. 可信原始状态按 V15 重编码、按 L1 重标，构建新基础 train/val；按契约隔离重复和冲突，保留原始视图及过滤比例。
6. 检查全部候选计数、14 动作码、actor/target/招募兵种、棋盘边界、NaN/Inf、规则指纹、标签映射。替换/删除标签字段后重建输入，摘要不变。
7. 去重后不足协议最低规模时，仅从预留追加清单补样；不能移动 val 家族进 train 或复制行伪造独立数据。

验收：正式池 root 家族交集和 policyInputKey 交集为 0；候选缺失、未知动作、坐标错误、标签映射错误均为 0；每个样本可追溯精确状态和标签键；有效 roots/unique inputs/各类型分布符合协议，或明确标小试限制。

产物：`input_identity_tests.json`、`dedup_audit.json`、`label_conflicts.jsonl`、`historical_checkpoint_reeval.json`、新数据/split/快照索引、`quarantine.jsonl`、`dataset_manifest.json`、分层采样记录。

注意：混合 train/val/test 的全量准确率只作数据描述，不作泛化主结论；线上训练过程中的 train accuracy 与固定模型在固定 train 子集的评估也要分开。

## 6. T15-05：新输入、导出与 TS/Python 一致性

**owner F；P0；依赖 GL/GR/GO，小池可先行；输出 `T15-05/`。**

步骤：

1. 列出原 48 案例的 runtime/input/checkpoint SHA，与新 schema 的受影响范围；作为历史证据保留，不直接改其版本号。
2. 构建至少 128 个新诊断状态：复用适用旧场景并补升级、历史兼容、pending、联盟、地图边缘、null 坐标、单候选、大量候选。候选覆盖全部 14 类型，策略过滤的 surrender 可在编码单测单列。
3. 从同一快照、同一允许集合分别检查 TS 编码与 Python 验证路径；同一检查点比较输入、逐码 logits、trunk、最终 actionCode。value 若可读一并比较，但 value 未训练不能据此取得价值学习资格。
4. 受控精确并列使用合成相同 logits；新 V15 共同 tie-break 为最高 logit，再按规范 actionCode 的代码点顺序（不用 localeCompare）。近似并列单列，不通过加任意 epsilon 改写高低排序。
5. 候选反序及 3 个固定乱序，标签同步映射，对齐 logits、loss、梯度及一次 optimizer 更新；不能只测输入顺序 hash。
6. 正式 C2/D 模型每次导出，抽取固定诊断子集再经 shared policy 验证 schema 与动作；运行身份不同的缓存不复用。

容差预登记：输入 float32 最大绝对差 ≤1e-6；前向 atol/rtol 均 1e-4；固定 CPU 梯度/一次更新 atol/rtol 均 1e-5。非有限数直接失败。最高分差大于两倍该例最大 logit 数值差时最终动作必须相同；近似并列报告幅度、容差与选择，不随结果放宽门槛。

空候选的 shared policy 明确拒绝或返回类型化无动作结果，调用方处理；不能输出不在合法集中的 end_turn。旧 schema 的 tie-break 保留其历史版本，不能为历史模型静默换新规则。

### 小样本诊断的复用与触发

已接受“127 优化状态 +1 验证状态、三个导出模型全 128 命中”的历史证据，不重做 M0～M5。

新 schema/训练器已变更，本轮做一次 seed 42、真正 **128 个训练状态**的 train-only 回归：从固定可恢复状态集构建新 schema/L1 任务，读取并记录 V14 成功 stageB 的完整诊断配置，仅作新 schema/数据和正常退出所需的适配，先最多 8,000 更新，必要时延至 16,000。最终目标 ≥127/128 且训练 CE<0.05，导出 TS 同样满足；未达标先定位具体失败状态，不扩充正式池。诊断允许按预登记训练命中条件提前结束；选 final，不用验证占位挑模型。

该回归证明新链路没有明显可拟合性退步；不补写旧 V14“三 seed、128 个均被优化”的验收。正式训练仍按协议保留 weight decay 和 3,000 更新，不移植 tiny 设置。

产物：`parity_inputs_manifest.json`、Python/TS 原始数值、`forward_parity.json`、`permutation_update.json`、`tie_break.json`、单次诊断配置/消费/final/TS 重评及 `gate_GP.json`。

## 7. T15-06：完成干净 C2 三 seed 基线

**owner C；P1；依赖 GL/GR/GO/GD/GP，开发对战依赖 GE；输出 `T15-06/`。**

步骤：

1. 校验 frozen 数据/split/schema/标签器与运行身份；生成确切 batch/验证计划。先 100 更新成本校准，不据准确率改预算。
2. 按实验协议完成 seeds 42/1337/2026，各 3,000 更新、96,000 有效曝光。保存每 250 验证、500/1500/3000 权重、best/final/state。
3. 离线评估固定权重的干净 train/val；给 top-1、top-k、CE、动作类型、阶段、人数/地图、候选数桶。每层给分母；不存在样本写无覆盖，不能用 0/0 当通过。
4. 只在有证明的样本报告 acceptable-set accuracy；其他情况下单动作教师分歧不能全部称为坏棋。
5. A 执行三 final 的冻结开发面板；C 汇总学习曲线、固定模型指标与实际比赛身份。D 从开发轨迹补 T15-07 的真实窗口。

验收：三条实际训练消费完全可重算、final 导出合法一致、开发对战全部计划项已执行且自然/截断结果明确；可量化学习/泛化差距。单场触及冻结 cap 属于已执行的截断；计划中尚未运行的场次不能据此算完成。外部预算耗尽时记录 BUDGET_EXHAUSTED，不授予 GC。准确率或胜率变高不是本任务 DONE 的前提，执行有效且结论完整才是。

产物：每 seed 配置/命令、batch ledger、best/final/state、离线分层结果、`baseline_comparison.md`、开发对战引用、`frozen_c2.json`。

解释边界：C1→C2 同时含必要规则修复、标签合同、去污染与调度修正，属于新正确基线；不能将全部差值归因于其中单独一项。

## 8. T15-07：结合回合规则归因真实失败

**owner D；P1；依赖 GL/GR/GE；旧轨迹先行，C2 开发后补充；输出 `T15-07/`。**

按协议第 4 节完成 20～50 个（目标 32）窗口的有限反事实。每个窗口交付精确状态、完整合法集、候选选择理由、延续策略、到达边界、每分支消费和原始结果。

必须覆盖的判定点：

- 一玩家阶段含多次移动/攻击/招募，不把原子动作深度当敌我轮换。
- capture 会使用行动机会，延后可能只是独立单位换序；只判真正机会损失。
- 招募 pending 的解除可能比再次招募更重要；回合开始的经济/站城伤害由引擎实际触发。
- HP=2 单位的存在不等于应继续攻击；wait 与 end_turn 的成本/后续机会分别比较。
- 支援可恢复行动、突击允许攻击后移动；常规“一单位一动作”假设不适用。
- 指挥官死亡、最后单位死亡是否淘汰由规则开关与建筑/联盟决定。
- 多人局必须等到真实下个敌人回应，盟友回合不机械记作敌方。

验收：区分 PROVEN_LOCAL、ROLLOUT_SUPPORTED、UNKNOWN；至少给可复现的正确与错误策略对照检验 oracle。若未发现确定错误也如实报告，不为了交差给 end_turn 人造标签。

产物：`window_selection.json`、`counterfactual_branches.jsonl`、`failure_taxonomy.json`、逐窗口中文解释、`next_data_targets.md`。最后文件只建议按证据定向补样，不能追溯改动已冻结 D 组采样。

## 9. T15-08：重做匹配工作量的 D0/D1/D2

**训练 owner C、数据 owner E；P1；正式比较依赖 GC；输出 `T15-08/`。**

### 9.1 E：采集与匹配

1. C2-42 final 冻结后即可准备共同 D1/D2 采集清单，复用 D 的 L1，先确认查询隔离测试通过。
2. 主体座位行为分别 H0/C2-42，其他座位 H0；只把主体决策纳入主池。若另外采其他座位，另列池与分析，不混称学生决策。
3. 从同一 root 清单采两分支，按协议匹配 N、分层、root 配额；过滤旧池已见和验证交集，记录有多少新增信息真正保留。
4. 将新状态都重新调用同一个 L1 打标签，保存逐状态 RNG 键；禁止 `teacherRngKey=null` 却宣称可复现。
5. 固定共享旧池序列与新池循环序列，生成三个组每 update 的 batch 计划及有效监督 mask。

### 9.2 C：训练与比较

1. 同 seed 三组从相同 C2-s final 权重开始，统一重建 optimizer/scheduler。
2. 严格执行 1,500 更新、48,000 曝光；D1/D2 各旧/新 24,000，D0 旧 48,000。每 seed 都提供逐步 LR/前 16 旧样本一致性核验。
3. seed 42 检查整个链路有效后继续其他两 seed；不能因 D0 较弱提前截停控制组。
4. A 对九 final 运行相同开发面板；给 D0−C2、D1−D0、D2−D1、D2−C2 的 root 配对统计、截断界与三 seed 明细。

验收：预算与配置的已控制项实际相同；新池唯一数/消费频率/层分布均有原始清单证据；无法控制的差异如实列出。发生不匹配则该比较 INCONCLUSIVE，修复后在新实验 ID 重跑受影响组，不能只改表头。

产物：两臂原轨迹、`matched_groups.json`、新池与 split、batch 计划、九模型的训练/离线/开发结果、`controlled_factors.json`、`dagger_conclusion.md`。

不做多轮 DAgger 扩展、强教师软标签或 end_turn 加权。一个受控单轮实验比同时改变多项更能回答本轮问题。

## 10. T15-09：可信评测与条件独立确认

**owner A；P0/P1；分 A/B/C 三段验收；输出 `T15-09/`。**

### 10.1 T15-09A：正式模型出炉前完成 GE

- 复用并审查 `v14/tools/eval_v14_protocol.ts`、`eval_v14_match.ts`、`eval_v14_aggregate.ts`；补初始状态/引擎/地图/随机流等缓存身份，不能仅复用声称版本字符串。
- 聚合先按被测联盟从 winner 重算视角，不能直接信镜像行的 NATURAL_LOSS 字样。
- 故障注入覆盖：候选自然胜+镜像超时、候选超时+镜像自然负、双超时、规则平局、候选淘汰但盟友仍存活、非法动作/崩溃、重复行/缺臂、缓存身份变化。
- 用 V14b 六份原 games 重算历史表，得到审核中的 34/36 候选自然完成、26/36 完整配对及逐 seed 区间；主 V15 的 root/地图权重与旧聚合不同，另列版本，不能要求两种权重总数值相同。
- 完成成本预检、固定 caps/roots/对局 ID/缓存与恢复规则，输出 GE。

### 10.2 T15-09B：开发面板

逐模型校验权重/schema/runtimeId，再执行协议中的 240 候选臂和可复用镜像计划。按完整 ID 写入增量 JSONL，恢复跳过身份匹配的完成项；失败项不伪造结果，不重复计数。将错误、截断、未运行分别列出。

交付全计划/自然子集、root 聚类区间、地图/座位、三 seed、端到端延迟。报告所有预登记组，不只展示最好模型。结果为负也需写出下一资源应投向何处。

### 10.3 T15-09C：满足选择条件才执行

按协议选择唯一 final 候选，冻结 SHA 后运行学生确认清单；未满足条件则 DEFERRED，并保存“为何不消耗确认集”的机器可读判断。

相对 C2 改善、相对 H0 发布候选资格、浏览器部署资格分别裁决。即使全部通过，本轮只提交 `PROMOTION_CANDIDATE` 建议和精确范围，生产替换仍留给用户另行决定。

产物：`eval_selftest.json`、`calibration.json`、`arena_manifest.json`、games/轨迹/统计、`selection_decision.json`、条件 `frozen_candidate.json`/确认结果/浏览器资格、`promotion_decision.json`。

## 11. T15-10：回合与联盟感知的搜索教师研究

**owner D；P2 条件分支；依赖 GL/GR/GE；输出 `T15-10/`。**

承接 V14 T14-07 的未完成项，不能用修好 HeuristicAI 探针代替新教师内核。主线不等它。

最低有界工作：完成新教师内核合同和 64/256/1024 转换预算的同状态诊断，证明是否真正越过玩家阶段并看到对手回应；如主线资源不足，明确 DEFERRED 和可执行续接，不伪造资格。

实现约束：

1. 策略与离线标签器使用同一内核；按 actionCode 派生独立评分/rollout 流。候选顺序不得决定某动作拿到哪个随机流。
2. 实际引擎构建 move→attack/capture、recruit→pending 处理、support→再行动、attack→post_attack_move；包含合法 end_turn。每次对外只返回当前第一步。
3. 同一玩家继续行动时价值视角不翻转；按实际行动者/联盟推进。2 阵营可用根联盟 maximin；3+ 阵营声明 MaxN、自利 rollout 或 paranoid 近似及局限。
4. 所有引擎转换计入预算；未评分动作、未跨边界、混合深度、fallback 和取消单列。若合法候选数超过预算，不得假装已穷举。
5. 静态代理分、有限 rollout 胜利、限定范围强制获胜分开。不能只用同一叶子评分宣称教师比 H0 强。
6. T-label 通过需合法、可复现、无状态污染、预算准确、已证明关键战术无回退。T-strong 必须另做教师专属开发/确认对战；T-online 是独立延迟/取消资格。

产物：`search_kernel_contract.json`、`search_horizon_coverage.json`、`budget_profile.json`、`teacher_invariance.json`、资格分项及原始反例。没有教师强度证据时写 T-strong NOT_MEASURED/INCONCLUSIVE，不写“搜索路线无效”。

## 12. T15-11：最终交付与独立核验

**owner A；P1；全部实际执行项收尾后；输出 `T15-11/`。**

必须完成：

1. 汇总每任务 acceptance，而非按目录存在自动生成 DONE；主线未完成、条件分支未启用、资源耗尽分别标明。
2. 从原始 update ledgers 重算 3,000/1,500 与曝光，从原 games 重算完整分母/区间；随机选择一个已完成模型经正式 shared policy 重放固定诊断输入。
3. 校验源码、协议、数据、模型、输出 hash 链。最终源码变更对哪些运行有影响逐项说明；不能用最后 HEAD 追认所有历史运行。
4. 输出 `final_report.md`，回答：已证明修好了什么；当前差距如何变化；D0/D1/D2 能支持什么；主要规则错误证据；什么尚不确定；下一笔资源的具体实验。
5. 明确 `NO_PROMOTION / INCONCLUSIVE / PROMOTION_CANDIDATE`，附发布范围与未完成资格。没有对 H0 优势时直接建议保留 H0。
6. 输出其他 agent 可执行的恢复/续接命令，写明剩余预算与待处理反例。不要只写“建议下一轮重做”。

最终目录至少包含：

```text
v15/out/<runId>/
  protocol.json                 # 已冻结配置和清单引用
  task_status.json               # 各任务及子 gate 的真实状态
  runtime_snapshots/             # 实际启动时依赖身份
  T15-00/ ... T15-11/            # 原始证据与任务产物
  final_report.md
  claim_ledger.json              # 结论 -> 输入/代码/原始读数
  package_manifest.json          # 文件 SHA、用途与依赖
  next_agent_handoff.md
```

验收：第三方仅凭这些文件能复算主要表格、定位每个模型的真实输入语义、恢复未完成运行；主结论有证据边界；现有修改及生产默认得到保留。

## 13. 已存在的命令与使用边界

以下路径/参数在编写时已确认存在，仅供入口核对；研究脚本可能硬编码旧 run，因此先读其输出路径再执行。

```powershell
git status --short --branch
git rev-parse HEAD
python python/train_spatial_resnet.py --help
```

TypeScript 工具由以下已有 runner 执行，`<已实现脚本>` 是占位符，不可原样运行：

```text
node --openssl-legacy-provider v12/tools/run-tool.mjs <已实现脚本> <实际参数>
```

已有规则套件可指定新的诊断 run，避免覆盖历史：

```powershell
$env:V14_RUN_ID = 'v15_rule_precheck_20260925'
node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/rule_suite.test.ts
node --openssl-legacy-provider v12/tools/run-tool.mjs v14/tools/codec_roundtrip.test.ts
```

执行前若同名目录已存在，换唯一 runId。这两条现有规则命令的输出仍在 `v14/out/<V14_RUN_ID>/`，在 V15 manifest 中引用其 SHA，或由负责人新增显式输出参数后改写路径。

本机审核时 `py` 启动器不可用，`python` 可用；以执行者实际环境核对为准。`--global-update-limit` 已有，但其退出/恢复控制流需 T15-03 修复；`--lr-schedule` 已有但当前按 epoch；train-only、update 调度、固定来源 batch 计划均是待实现接口。

禁止先拼一条含尚不存在参数的“完整训练命令”并声称可运行。T15-03/06 必须产出与实际 parser 对应的最终命令。
