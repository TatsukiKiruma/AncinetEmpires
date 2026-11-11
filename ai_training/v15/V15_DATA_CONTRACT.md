# V15 数据与运行契约

版本：1.0。配套 [任务书](V15_AGENT_TASKBOOK.md) 与 [实验协议](V15_EXPERIMENT_PROTOCOL.md)。以下是待实现接口要求，不表示当前工具已支持。

## 1. 身份分层

| 身份 | 内容与用途 | 禁止替代关系 |
|---|---|---|
| `runtimeId` | 依赖源码字节 SHA、配置、运行库、线程/设备、策略版本 | Git HEAD 不足以替代工作区身份 |
| `rootFamilyId` | 初始生成配置、地图/规则、原始随机流与祖先轨迹家族 | 改 runId、座位、重标版本不得产生“新独立 root” |
| `sourceStateKey` | 家族、分支轨迹与原子动作位置 | 同 step 不代表同状态 |
| `stateHash` | 完整规则状态的规范序列化摘要 | 张量相同不证明状态相同 |
| `policyInputKey` | 模型实际收到的全部输入，不含标签；候选顺序无关 | 目标动作、分区、教师、root、规则元数据不能混入以拆散重复输入 |
| `decisionKey` | 状态输入及按 actionCode 对齐的候选映射 | 用于动作对齐；不替代更严格的模型输入查重 |
| `sampleId` | 来源、编码/标签版本及样本产物身份 | 不同 sampleId 不等于不同信息 |
| `checkpointSha256` | 实际权重文件字节摘要 | 文件名、模型 seed、声称的 best 不足以标识权重 |

文件 SHA 一律对原始字节计算。可另存 UTF-8/LF 规范化摘要解释换行变化，但不能替代字节 SHA。mtime 只能作为时间信息。无法恢复旧内容时写 UNKNOWN，不猜“仅换行差异”。

运行前、实际训练/评测启动时、运行结束各保存一次依赖快照。公共源码发生变化时，使受影响 gate 和缓存失效；无关文档改动不要求重训。长进程必须绑定启动时源码副本或运行包，不能事后拿最终工作区解释其结果。

## 2. 真实状态、轨迹与视角

### 2.1 精确恢复

优先保存 `GameEngine.getState()` 完整快照和初始状态至窗口的全部动作码。允许：

- `EXACT_SNAPSHOT`：恢复后完整规则状态摘要、当前玩家、合法动作集一致。
- `VERIFIED_REPLAY`：从可信初始快照逐步执行完整原动作前缀，并与归档摘要核对。

只有已保存窗口动作、缺中间轨迹且依靠重新调用 AI 猜回历史的，标 `RECONSTRUCTED_UNVERIFIED`。它可以用于诊断，不能冒充真实历史学生窗口。Observation 缺字段的记录标 `OBSERVATION_PARTIAL`，不得用于本轮正式标签和规则证明。

保存 pending、墓碑、状态持续时间、移动/行动/突击后移动、已受支援/治疗标记、单位生成计数、重招信息、规则覆盖、脚本状态等完整字段。不得通过补默认值把未知信息伪装为恢复成功。构造引擎可能规范化状态，须验证规范化前后的差异是否被合同明确允许。

重放每一步：解码成功 → 动作属于该玩家真实合法集 → `step` → 校验下一状态。出现首个不一致即停止该条链，记录前后快照，不沿分叉轨迹继续生成所谓原状态。

### 2.2 玩家与联盟

- `actingPlayerId` 是当前行动玩家；传给要求 playerId 的 `getAction/getLegalActions` 接口。
- `rootAllianceId = getAllianceId(state, subjectPlayerId)` 用于结果、收益和敌我判断；不能把联盟 ID 传入玩家 ID 参数。
- 真实行动顺序取 `getTurnPlayerIds` 并由引擎推进。下家可能是盟友，也可能已有玩家被淘汰。
- `rawActionStep`、`playerTransitions`、`subjectTurnsCompleted`、`fullRounds` 单列；不能用一个含混的 depth/ply 代替。
- `winner=null` 未终局，`-1` 规则平局，其余为联盟赢家；时间/步数上限不产生自然终局标签。

## 3. 三种随机流必须隔离

1. **环境/初始生成流**：只决定 root 初始条件。
2. **行为流**：每座位独立实例，决定对局实际动作。H0 保留冻结的历史行为语义。
3. **标签流 L1**：独立教师实例/状态，不读写行为流；所有正式训练组采用同一 L1。

建议 L1 的稳定键：`hash(labelerVersion, labelSeedBase, stateHash, actingPlayerId, replicateId)`。同一状态主标签固定 `replicateId=0`；不要纳入行号、访问次数、数据分区或候选数组下标。PRNG 算法、取 hash 位数、数值转换方式写入版本合同。

L1 是“冻结 HeuristicAI 实现 + 独立逐状态 RNG 包装”的新标签器身份，不宣称与历史有状态启发式标签逐位相同，更不宣称比 H0 更强。新基线和 D1/D2 都用 L1 重标，以免标签版本成为组间混淆。

复现测试分别报告：

- 同一完整状态、同一键，每次重建/恢复相同 RNG，重复三次；这才是同种子复现。
- 不同键的多样性独立统计；出现差异不是复现失败。
- 候选重排只影响候选遍历时，按动作码对齐标签/评分。若旧 H0 不具此性质，不修改 H0 来通过；L1 需要的稳定排序属于其版本的一部分。
- 查询前后引擎状态/合法集不变；打开、关闭标签查询，行为轨迹逐动作相同。

轨迹不变性测试使用确定性步数上限、足够的墙钟余量。标签计算增加时间，不能用同一紧墙钟下的轨迹长度差误判 RNG 干扰。实际采集仍记录总墙钟与截断位置。

## 4. 候选、schema 与标签

### 4.1 候选构建

- 正式动作编解码以 `src/game/env.ts` 的实现为基础，覆盖 Action 联合的全部 14 类型。
- 保存引擎合法集与策略允许集。主实验统一过滤 `surrender`，记录过滤版本；其他动作不能静默删除。
- 从状态及允许集生成全部候选，再按动作码定位标签。换标签、删标签字段，输入完全不变。
- `wait` 与 `end_turn` 含义不同；不因二者可能结束活动而合并动作类型。
- 单个候选无法解码/编码，隔离整行并记录原因；空允许集返回明确诊断/无动作结果，禁止凭空生成可能非法的 end_turn。
- 策略输入不含未来赢家、教师分数元数据、targetIndex、可接受答案集合或样本分区。

### 4.2 Schema 不是维度别名

新修复暂定命名 `spatial26_global20_actionSemantics53_v15`；若确认必须变更维度，则在正式采集前冻结准确的新名称和字段表。本轮不为无关目的增加维度。

| 路径 | 语义要求 |
|---|---|
| 历史 V13 `24/20/32` | 恢复有证据的历史状态/候选语义；审核反例的历史反击槽为 50 |
| 历史 V14 `26/20/53` | 保持该 schema 的既有语义，包括升级反例的旧估计 25，供历史复核 |
| 新 V15 | 相同反例应与引擎对齐为 22；远程不反击样例为 0 |

历史语义中的缺陷保留在显式历史适配器内，不能作为当前规则正确性的 oracle。版本分派必须贯穿数据生成、Python 加载/导出、TS 加载和 shared policy 状态/候选编码。不得只选择 24/26 通道；同维度新旧语义也要区分。

缺 schema 的历史权重只对有明确来源/形状白名单的模型进行显式迁移，并标 `legacyAssumption`；未知组合拒绝。正式 V15 产物必须有显式 schema。若历史路径无法可靠恢复，应明确拒绝并报告受影响调用方，不能静默使用新语义。

特别区分两种复测：原 V14b **实际有缺陷运行路径**的历史复现，以及**纠正历史 schema 分派后**的模型复测。二者 runtimeId 不同；已有权重 SHA 相同也不能混用结果。为 V13 恢复历史语义不代表能重用 V14b 中错误加载路径的评测缓存。

### 4.3 标签证据等级

- L1 单动作标签：训练硬 CE；它是可复现的模仿目标，不等于唯一最优动作。
- `acceptableActionCodes`：只有明确规则证明或完整限定回应范围的证明才能填写。一次 rollout 相同得分不能证明动作等价。
- 有限延续/搜索：保存 `scoreKind`、已评分掩码、边界、预算和未完成原因。代理分不转成概率或真实 value 标签。
- 当前主实验 `valueWeight=0`，`valueLossMask=false`；截断状态不写假胜负。

## 5. 不依赖标签的输入身份和去重

### 5.1 `policyInputKey` 算法要求

按网络真正消费的数据定义：schema/布局/形状 + float32 空间与全局输入 + 候选输入的**多重集合**。

每个候选输入含 actor/landing/target 坐标、null 掩码、semantics 等实际消费字段。规范化序列化后按字节排序，保留重复项与数量；候选逆序、随机重排不得改变 key。float32 使用明确的小端字节及长度前缀，拒绝 NaN/Inf；负零的处理固定并纳入 key 版本。

不含 targetActionCode/index、教师、rootFamilyId、分区、胜者，也不额外加入未被网络读取的规则/地图元数据。actionCode/单位 ID 若只是输出映射而非网络输入，不进入此 key，另用 `decisionKey` 保存其对应关系。因此即使更换了单位 ID，只要输入实际相同，仍能发现重复。

另算 `stateInputKey`（空间+全局）用于状态压缩碰撞诊断。stateInputKey 相同但候选集不同要报告；它不自动等于完整任务重复。原始输入不同也不证明网络实际局部池化表示充分。

目标冲突要分层：同 policyInputKey 的不同目标动作码、不同目标候选特征分别统计。两个动作码映射为同一候选特征时单列 alias，不能凭空认定它们等价或认定为标签噪声。

### 5.2 分区策略

先按完整 root 家族分区，家族的座位、重放、扰动、学生分支、重标均留在同一分区。再查 policyInputKey 交集，不因家族不同就放过重复输入。

本轮默认保留既定 train 分配，不把 val/test 家族搬进 train：

1. train 内按 key 合并重复，保存来源数量和原频率；主池每 key 一个固定 L1 标签。
2. val 中与 train 重复的行排除出“干净泛化指标”；val 内重复按 key 合并。
3. 旧 test 中与 train 或用于选择的 val 重复的行同样隔离；旧 test 已公开使用，标历史诊断集。
4. 原始分区视图保留，单列去除原因、地图/阶段/动作比例变化与有效 root 数。不能仅报告更有利的视图。
5. 新 D1/D2 训练池不得含冻结 val/test 输入；本轮“新状态规模”还要排除旧训练池已见输入。其被排除量必须报告。

若不同完整状态映射同一输入而 L1 目标冲突，记录冲突实例，先定位缺规则字段还是教师差异。不得只保留更容易预测的答案。主实验可隔离此类冲突簇并报告损失覆盖；发现它主导样本时先修必要特征，再冻结新版本。

根家族交集和正式离线分区 policyInputKey 交集均为 0 才通过数据 gate。这仍不表示语义近重复或泛化问题全部消失。

### 5.3 独立确认对局的特殊规则

新确认 root 不能来自开发/训练祖先。独立生成对局仍可能经过相同开局状态：保留整局，不因候选表现或“见过某个状态”删除确认对局。报告已见输入覆盖作为辅助信息。离线去重与完整对局确认不可混成同一筛选规则。

## 6. 最低交付字段

```text
runtimeId、runId、protocolHash、taskId
rootFamilyId、parentRootId、lineageId、sourceStateKey、sampleId
scenarioId、mapHash、initialStateHash、rulesHash、rootSeed
stateSnapshotRef、stateHash、stateFidelity、replayVerificationRef
actingPlayerId、subjectPlayerId、subjectAllianceId、rootAllianceId、turnPlayerIds
rawActionStep、playerTransitions、subjectTurnsCompleted、fullRounds
behaviorPolicyBySeat、behaviorCheckpointSha256、behaviorRngContractId
labelTeacherId、labelerVersion、teacherRngKey、replicateId、teacherBudget、teacherStopReason
encoderSchemaId、candidateSchemaId、orderingId、policyActionFilterId
engineLegalActionCodes、policyAllowedActionCodes、candidateActionCodes
spatialTensor、globalFeatures、candidateActions、candidateCounts、missingActionCodes
stateInputKey、policyInputKey、decisionKey、inputKeyVersion
targetActionCode、targetActionIndex、targetCandidateFeatureKey、labelEvidenceKind
acceptableActionCodes、policyLossMask、valueLossMask、valueTarget、outcomeKind
samplingStratum、samplingProbability、duplicateMultiplicity、partition、quarantineReason
```

可分为索引表与外部快照，不要求每一行重复大对象；引用必须可解析并附 SHA。精确采样概率不能计算时写 null 和设计说明，不伪造均匀分布。

## 7. 训练消费与恢复

- `globalUpdateLimit` 是本逻辑运行的总 optimizer steps；`maxStepsPerEpoch` 是每 epoch 上限，不能替代总预算。
- 每次真实 optimizer step 记录 updateIndex、当前 LR、batch 实际样本 ID、旧/新来源、policy/value mask、loss 有效分母、batchSize。
- 台账必须能计算实际曝光总数、唯一 policyInputKey 数、唯一 sourceStateKey/root 数、各类型/阶段消费、计划但未消费数量。计划文件不是消费证据。
- 正式 policy-only 训练中全部 batch 样本必须有有效 policy 监督；隔离样本不占有效曝光预算。
- 用完总预算立即正常退出。零消费 epoch 不参与平均、不推进 scheduler、不触发退化保护。合法值为 `trainMetrics=null, consumed=0`，不写伪零准确率。
- `final` 是最后一次真实更新的权重，`best` 是预登记干净验证准则选出的权重；分别记录 selectedAtUpdate 和保存 SHA。
- 原子保存可恢复 state：模型、optimizer、scheduler、累计更新/曝光、采样游标、随机状态（Python/NumPy/Torch/设备、DataLoader 或自定义 sampler）、best 信息和输入/协议身份。
- 恢复同一逻辑运行时累计预算不重置。若旧 state 缺少必要进度，拒绝精确 resume；可另建 `weights-only warm-start` 新运行，不能宣称等价续跑。
- 最后更新处保存 state/final，即使在 epoch 中间退出；恢复若已到预算，只做身份核对和幂等收尾。

## 8. 任务状态和证据

每任务写 `task_status.json`：任务 ID、owner、status、reason、依赖 runtime/hash、逐条 acceptance、证据路径、命令、预算消费、剩余工作、恢复命令。

`NOT_STARTED / RUNNING / DONE / FAILED / BLOCKED / INCONCLUSIVE / BUDGET_EXHAUSTED / DEFERRED` 含义分别为未开始、执行中、验收完成、已证伪验收条件、前置缺失、结果无法裁决、预算耗尽、条件分支未启用。任务状态与 `PASS/FAIL/INCONCLUSIVE` 实验结论分开：完成一个有效负实验可以 DONE，但不能把未跑对战写 DONE。

证据标签使用 `MEASURED / CODE_CONFIRMED / HISTORICAL / HYPOTHESIS`。缺失读数写 null。每项 DONE 必须有原始输入/输出及统计程序；不以文件存在、入口可导入、旧报告声称通过代替实际验收。
