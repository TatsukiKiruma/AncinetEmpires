# AncientEmpires V11：V10复核与以棋力为中心的后继任务

审查日期：2026-09-23（Asia/Singapore）  
仓库：TatsukiKiruma/AncinetEmpires  
分支：path-b-spatial-ai  
审查提交：`4451947355e9683437a6fc1348cf01657eaf50e3`  
起点报告：`v10/V10_TASK_COMPLETION_REPORT.md`，优先使用 `v10/fix_01/` 修正版工件。

## 0. 结论与执行边界

V10有真实训练、比赛和负结果，不应被概括为“只写文档”。然而，新增价值样本的状态错位、回合搜索的根动作遗漏、训练消费口径不实等源码问题，阻止了我们从这些结果推断“价值学习/DAgger/回合规划本身无效”。

本轮方向调整：**保留现有引擎、共享推理接口和可追溯实验基础；暂停弱纯策略直接替代启发式，以及多条新算法同时铺开。先建立“保留Heuristic基线候选的局部策略改进器”，再训练网络学习经过核验的改进，最后逐渐扩大网络控制范围。** 这是待检验的工程与研究方案，不保证必然达到某个胜率。

此次交付是远端源码审查和已有数字复算，不是重新训练或复跑比赛。未读取到本地大数据集、全部模型字节和浏览器日志，不能量化受污染样本的精确数量。`audit_arithmetic.json`仅为算术复核，不是新棋力实验。

Agent开始时读取当前HEAD与dirty状态。如果分支已前进，优先检查本报告中的问题是否已修复；不得回退覆盖用户更新。所有训练和采集必须使用新的runId。不得改游戏规则、擅自替换生产默认AI、付费租算力、上传工件或push。旧证据只标注失效或被替代，不静默改写。

## 1. V10结果应如何评价

### 1.1 实际结果

同一行中的W/L/D/T分别指自然胜/自然负/自然平/资源截断。以下数字来自已提交报告，并非本次重新对局。[E01–E03]

| 实验与策略 | N | W/L/D/T | W/N | W/(W+L) |
|---|---:|---|---:|---:|
| T10-01 旧纯策略 | 40 | 5/29/0/6 | 12.5% | 14.7% |
| T10-01 新纯策略 | 40 | 0/33/0/7 | 0% | 0% |
| T10-01 S00 | 22 | 7/6/0/9 | 31.8% | 53.8% |
| T10-01 S10 | 20 | 5/4/0/11 | 25.0% | 55.6% |
| T10-04 S00 | 26 | 4/10/0/12 | 15.4% | 28.6% |
| T10-04 回合搜索 | 40 | 0/29/0/11 | 0% | 0% |
| T10-03 A：初始模型 | 20 | 0/17/0/3 | 0% | 0% |
| T10-03 B：旧数据续训 | 20 | 0/16/0/4 | 0% | 0% |
| T10-03 C：加入纠错 | 20 | 0/20/0/0 | 0% | 0% |

不能把S10的55.6%自然终局条件胜率解释为超过S00：其55%的比赛被截断，实际W/N为25%，且两臂场次不一致。T10-01和T10-04也是不同实验，不横向拼接为学习曲线。应按共同的地图、初态、配置、seed、座位家族重建配对比较。

### 1.2 完成度与效果分开

- **T10-01**：新旧权重确实参赛；当前新纯策略没有显示收益。搜索确认矩阵未对齐跑满，不能给算法优劣定论。
- **T10-02**：形成454局证据池、349自然结束、105截断，报告写79,595去重状态；这些是回放池口径，不是网络已优化79,595个状态。回放有效性需要重验。
- **T10-03**：完成A/B/C短程实验；3980条新样本在分区清单中，不等于全部参与梯度更新；不能据此否定充分训练的DAgger。
- **T10-04**：宏动作剩余序列执行已接入，是实质进展；但根动作、预算和回应仍存在结构问题，不能作为合格强教师。
- **T10-05**：架构和损失实验确有代码与权重；架构外部评测读取了存在状态错位的数据，且只短程适配一次，不能选出可靠架构赢家。
- **T10-06**：已实现终局标签、mask与拟合；输入状态错位使当前价值结果必须重新解释并重做。
- **T10-07/08**：报告明确尚未完成合格专家迭代与最终确认/浏览器验收。这些不能补记为已完成。

## 2. 必须先处理的源码问题

### F01｜P0｜价值样本把开局棋盘与后续动作/结果配在一起

位置：`tools/v10_value_learning.ts::extractEndgameValueSamples`。[E04]

函数先创建`state`，然后`new GameEngine(state)`。循环中合法动作和当前玩家来自engine，但编码仍然调用：

```ts
encodeGameStateSpatial(state, curPlayer, 'v2');
encodeCandidateActionSpatial(state, curPlayer, a, 'v2');
// 记录 turn: state.turn
```

而`GameEngine`构造函数深拷贝初态，推进engine不会更新外部`state`。[E05] 因而中后期样本的棋盘、金币、单位和动作特征可能是开局状态，动作索引却对应后续合法动作集合。这是可从源码直接推出的状态错位，不是“可能欠拟合”的猜测。

修复必须一次性取得`const currentState = engine.getState()`，合法动作、tensor、globals、动作特征、turn和stateHash全部对应同一个currentState。不能仅把turn字段修掉。

**影响范围**：价值数据、依赖它训练的policy/value权重、价值校准与value-in-search结果；`evalT10_05`也用该价值数据集评估架构，相关val_id/val_ood数字不能作为可靠架构选择依据。[E06] 不把影响无证据地扩大到全部旧BC权重或DAgger：后者采样当前使用curState。[E11]

### F02｜P0｜回放错误不是“没有抛异常”；失败前缀没有回滚

`replayEpisodeCoverage`按默认地图设置重放动作，只catch异常；实际`engine.step`遇到非法动作会返回失败信息而不抛异常。[E05,E07] 因此`replayErrors=0`不足以证明合法完整复现。

采集器会改变initialGold、unitLimit、levelCap，但部分回放仍用默认设置。[E08] 应从真实初态/设置恢复，核验初态hash、每步合法性和终局；不能因为回放能继续就接收。

价值提取器在发现某一后续步非法之前，已经将前面样本push到全局数组；发现`replayFailed`后仅continue，不移除该episode此前的样本。[E04] 必须先存episode局部缓冲，整条回放验证后提交，否则整局隔离并写失败位置。缺失初态或真实结果无法重建时明确隔离，不猜测补齐。

### F03｜P0｜回合搜索默认候选不包含所有必要单步行动

位置：`tools/v10_turn_aware_search.ts::generateMacroActions`。[E09]

当前单步只收end_turn与两类招募，然后添加move→attack/capture/wait。默认prior=off时直接attack、capture、repair、heal、support、summon、wait、post_attack_move没有系统地保留。现实可出现“本回合已经移动、现在可直接致胜攻击”，生成器却没有该攻击候选。

宏动作followup取整个玩家的合法集合，不限定是刚移动的单位，因此还可能生成move(A)→wait(B)。合法不等于这正是“同一单位移动后攻击”的宏动作语义。跨单位计划如果需要，应作为显式组合计划而不是混入单位宏动作。

修复：根候选首先保留必要合法单步，至少包括Heuristic首选、真实立即胜利/避免立即失败候选、pending解决动作；再添加约束清楚的宏动作。后续算力筛选需记录删除理由，不能按类型悄悄丢掉关键动作。

### F04｜P0/P1｜搜索预算、展开顺序和价值尺度尚不成立

[E09,E10,E12]

1. 宏动作生成已经clone并step所有move，但不计入transitionCount，也没有生成阶段deadline。
2. 根候选仍逐个完整推演，第一候选可吃掉预算；己方rollout内部没有墙钟检查。并非真正公平的等工作量根调度。
3. `moveThreatScore`读移动前`unit.pos`而不是`action.to`；同一单位的各目的地得到同一距离分数。后面仍只保留8个move。
4. 部分分支到达对手后评分，另一些停在己方回合就评分，视野不可比。不得以未看到反击的乐观叶节点压过完整回应分支。
5. 当前formal入口S00按节点预算，回合搜索写死128transitions；“相同实际仿真工作量”未建立。启发式内部也可能额外step，需要统一追踪。
6. 回合搜索入口将`wallClockExceeded`写为false，不是从真实返回值推导；它不能证明没有软预算超时。
7. 当前叶值为启发式原始分数加`0.5*V`，V∈[-1,1]时任意两候选间排序差最多改变1分；若原分数差为数百，价值头几乎没有排序作用。且V在对手回应前的sim上计算，启发式分数却可能来自回应后最坏状态。必须统一状态、视角和尺度后再测试value作用。不能仅将权重任意增大。

### F05｜P0｜“消费3980条新记录”由训练前清单冒充

`python/train_spatial_resnet.py`在创建DataLoader和训练前，根据train_indices写consumed_manifest。[E13] DAgger校验读取同一个清单，再宣称新样本全部消费，形成自证闭环。

实际C臂14991训练行；1epoch、batch128、最多87更新。[E03,E08] 因而最多处理11136条样本曝光，在无放回shuffle的一轮中至少3855条训练行不会被处理。不能由此断言必须遗漏多少“新”行，但可以确定计划清单不是实际梯度消费清单。

修复：只有在成功optimizer.step后累计该批样本ID、次数、teacher/value mask参与情况；导出planned/loaded/optimized_unique/exposures/updates五类口径。未知root必须显式拒绝；当前“非val就train”的兜底以及零验证时按尾行拆分也应移除。[E13]

小问题一并修复：达到max_steps时先break后累加loss，最后一个已优化批次的损失会遗漏；max_steps是每epoch重置，需与新globalUpdateLimit区分。[E14]

### F06｜P1｜训练目标和架构对照还不能支持路线结论

- DAgger、价值与结构适配的主要对照仅1epoch、单seed；4块新增层和GAP新增输入保持随机初始化，不保证扩展前后输出相同。[E06,E15] 此类结果只回答“短程迁移适配怎样”，不是结构能力上限。
- 价值数据的policy标签直接用实际行为动作，包含弱学生动作；联合训练不应不加区别地模仿这些动作。应独立设policyLossMask和valueLossMask；没有合格教师标签的真实败局状态，仍可用于value但不强制做政策模仿。[E04,E14]
- `loss_ablation.ts`里的teacherQ是单步启发式叶评价，不是深度搜索价值；CE target仍是轨迹行为。soft目标与CE可能冲突。[E16]
- teacherQ的自然胜利赋1000，而非终局启发式可高于1000；这破坏了“确切胜利优先”的标签语义。自然平局与联盟视角也必须单独处理。温度1不经过分数尺度核验，可能把soft标签近似变成极尖锐argmax。
- 先后移动不同单位的可交换计划，并不必然产生相同的单步afterstate；当前以单步hash相同定义equivalence，不能声称解决了整回合顺序等价。
- 929对无碰撞只检验三张图的开局动作对，不证明所有后期/pending/兵种/状态编码无信息损失。[E17]
- DAgger分块时sampleId/rootFamilyId使用本块m，不包含matchOffset；seed变量虽然计算，Heuristic仍用默认随机源。需要审计不同真实状态共用ID、块间根混合；在没有原始样本统计前仅列为风险，不虚报碰撞数。[E11]

## 3. 路线选择：从“完全替代”改为“先学可靠改进”

### 3.1 短期主线

采用以下混合决策链，保留纯策略作为独立实验臂：

```
真实状态s → Heuristic基准动作a0
          → 完整合法动作与战术宏动作候选
          → 网络提出/排序少量候选
          → 同状态、同视野的有限比较
          → 有足够改进证据才覆盖a0；否则保留a0
```

这不是把“所有时候回退Heuristic”包装为训练成功。每个覆盖都要记录是否带来正/负收益；最终必须证明学习模块相对相同预算的不带网络系统有增益。

核心学习量可为`ΔQ(s,a)=Q_ref(s,a)-Q_ref(s,a0)`。Q_ref若来自有限Heuristic rollout，名字必须标为代理参考，不叫最优Q或真实胜率。离线更长rollout/自然终局/确切局部战术可以逐步提高标签质量。不要将未经校准的输出直接叠加到任意量纲的heuristic分数。

网络输入优先利用引擎可核验的行动后特征：伤害与反击、行动后HP/生存、真实占领/收入/可招募状态、行动结束标志、pending、单位类型与能力，以及局部/全局空间编码。避免用另一份手写近似规则去推测引擎已经能精确给出的效果。

### 3.2 中期：有证据的专家迭代

局部改进器在固定战术集和开发比赛上有效后，生成明确优于基准动作的训练样本，再蒸馏成学生；用学生提高同预算候选质量，迭代增加覆盖范围。无需把“全局教师已经显著超过Heuristic”设为一切局部标签生成的前置条件；但也不因函数叫search就把它认证为专家。

DAgger仍可保留为解决学生访问分布的辅线，但下一次实验必须记录真实消费并训练到预注册更新上限或验证早停。仅1epoch失败不等于方法被否定。

### 3.3 暂不投入的方向

暂不从零展开完整AlphaZero/PPO/大Transformer流水线，不以购买更大GPU替代上述状态/动作修复，不再次同时扩量、扩深、换损失、启用value、改搜索预算。原因是当前证据尚不能区分基础实现问题与算法问题，而不是这些方法原则上不可行。

## 4. 可执行V11任务

下列门槛是本次实验设计起点，不是普遍定律。全部新任务初始TODO。

### T11-00｜P0｜冻结证据并建立最小失败复现

依赖：无。输出新runId、source snapshot、issue ledger；将F01对应数据/权重/派生指标标为`INVALID_INPUT_ALIGNMENT_PENDING_REBUILD`，其余逐项标注“实测负结果”“统计不足”或“未运行”，不统统作废。

首轮仅选12–20个可定位真实状态与少量精确合成单元测试，直接调用实际仓库模块，不用重写一份公式模拟测试代替。

必须包含：已移动单位可直接攻击并自然获胜；直接capture/heal/summon/pending；多步回放后状态与初态不同；变金币/人口/等级设置；后段非法动作整局隔离；训练max_steps使计划ID与优化ID不同；并列候选排序与基准动作不变。

验收：每项旧实现在相应关键断言上失败，修复后通过；不要求先跑全仓所有耗时训练测试才能进入下一步。

### T11-01｜P0｜真实回放与训练样本对齐

依赖：T11-00。主要文件：`tools/v10_value_learning.ts`、`tools/v10fix/pipeline.ts`、`tools/v10fix/loss_ablation.ts`、轨迹导出入口；优先抽出唯一replay与snapshot采样函数供三处共用。

每局保存或可严格恢复initialState、setup、rulesHash、engineSource、policy/seed流、actionHistory以及终局。每条动作先在当前合法集合定位，再执行并检查接受结果；按步核验state hash或至少固定抽样hash和终局hash。仅检查异常不合格。

数据行携带`episodeId/rootFamilyId/sampleId/step/subjectPlayer/currentPlayer/stateHash/encoderSchema/actionListHash/terminationReason/policyLossMask/valueLossMask`。currentPlayer与subjectPlayer不混同；同一阵营多步不反复翻转value符号。当前状态的tensor/global/candidates须能由snapshot重算完全一致或在明示浮点误差内一致。

episode事务提交；失败不残留前缀value标签。旧数据可回放则重建，无法恢复则隔离，不为凑349局人工补初态。已截断但轨迹正确的样本可以保留policy标签，value必须null。

冻结三个集合：同地图新根验证、明确未见地图诊断、最终确认测试。最终测试不再追加到训练池。覆盖报告输出原始局数/合法回放局数/自然终局局数/唯一状态/各分区/实际优化消费，避免继续合并为单个“训练完成”。

**产物**：`replay_validation.json`、`invalid_episodes.jsonl`、`dataset_v11_manifest.json`、`split_v11.json`、小型可复核snapshot集。

### T11-02｜P0｜保底合法动作的回合规划器

依赖：T11-00；可与T11-01并行。

先修F03/F04，不再加另一套复杂搜索框架。保留所有合法单步的生成能力，搜索cap前强制保留基准首选、确切立即制胜和需要解决pending的动作。仅同单位后续接入单位宏动作；跨单位组合另设类型并逐步验证。

引入唯一transition计数/计时上下文，覆盖候选生成、探针、rollout及启发式内部真实仿真。每次昂贵工作开始前检查剩余预算；Node固定工作量模式与浏览器deadline模式分开。不能用`unsafeBypassValidationForTests`给正式训练搜索加速。

所有根先做廉价同层评估，再轮转扩展。比较同一阶段的叶子；优先比较实际到达自然终局或同一换手视野的候选。不完整分支记录`INCOMPLETE_HORIZON`并保守处理，不伪装为安全。预算不够时应返回已核验基准动作，而不是未评分的数组第一个动作。

对手move按目的地和真实攻击链排序；覆盖第二次攻击及两单位组合的专门fixture，不宣称穷举所有回应。返回最坏回应后的实际leafState，后续value在该同一状态上评价。

关键验收：立即自然获胜机会不漏；基准首选始终存在；零神经干预时可复现冻结基准选择/约定基准搜索；候选置换不造成无解释变化；预算账本真实；无非法macro步与静默失败；软/硬超时字段如实生成。

**产物**：`candidate_coverage.json`、`search_transition_profile.json`、`tactical_regression.json`、相同工作量的有/无神经候选对照。

### T11-03｜P0｜真实优化消费与损失接口

依赖：T11-00。主要文件：`python/train_spatial_resnet.py`、`python/spatial_resnet_model.py`、训练驱动。

训练前planned_manifest与训练后optimized_manifest分开；仅成功step后记录样本ID、policy/value有效样本、累计exposures和参数更新。显式globalUpdateLimit，不混淆每epoch上限。保存optimizer状态或明确重新初始化，控制组相同处理。修复最后batch损失漏计。

未知root、重复sampleId对应不同stateHash、空验证集、输入schema不匹配必须失败或隔离计数；不能默认未知root进train。对DAgger新增root应更新训练白名单并检查与验证/确认祖先无重叠。

policy-only、value-only、joint三种mask均做梯度单元测试。没有教师标签的弱学生行为数据不自动参与policy CE。真实value标签不等于认可这一步行为是好动作。

架构扩展如保留实验，新增GAP权重从零、附加残差块末层零初始化，先证明扩展时预测保持一致；或者从头训练各架构并明确比较方式。不再用一轮随机扩展后的适配结果决定架构。

**产物**：`optimizer_consumption.json`、`gradient_mask_tests.json`、`training_config.json`、可恢复训练状态、actual curves。

### T11-04｜P1｜第一次可归因的“学习改进基准”实验

依赖：T11-01/02/03。这是V11第一项正式棋力训练，不等待另外一轮大而全审计。

起点采用现有Heuristic作为可用基准，保留S00作对照；不是预先认证S00更强。挑100–200个多地图/双方座位的真实困难决策，明确区分：确切立即胜负、战术交换、占领/经济、长期布局。仅前两类有强证据时给“已验证错误”标签，其他记录代理收益和不确定性。

离线在同一snapshot、同一续局策略与共同随机流下比较基准动作a0及有限候选。不同根候选获得同视野与同工作量；每条label保存预算、counterfactual trajectories和outcome。无需每个状态都跑很多完整局，先将大预算分配给有分歧/临界收益状态。

训练一个小型候选增益预测/排序模块，可使用现有CNN加行动后特征；首轮不同时扩大深度。训练目标为有来源说明的ΔQ或可靠偏好分布，而非伪胜率。对不可靠标签mask或降低权重。CE与soft监督指向不同策略时必须选择清楚的目标，不能无解释相加。

初始建议最多4次正式fit（两臂×两seed），新教师查询先以10000次决策级查询为上限，同时记录总transition和墙钟；同一决策上大量探针不能隐藏在“1次查询”内。不足则交付分阶段结果，不偷偷缩数据又保留原目标名称。

三个必要对照：Heuristic；保留基准的规划器、不带学习模块；相同预算的规划器＋学习模块。纯网络独立列示，不与混合胜率混称。学习模块归零/置乱臂用于区分学习信息与单纯增加算力。

开发验收：关键fixture无退化；高风险负向覆盖率不增加；局部可靠收益先成立，再跑整局；有/无学习模块同预算成绩和正负干预贡献均报告。没有净收益就不晋级，保留失败证据并根据最大错误类型改一项因素。

**产物**：`counterfactual_labels.jsonl`、`label_quality.json`、`residual_ranker_curves.json`、`intervention_audit.json`、`strength_ablation.json`。

### T11-05｜P1/P2｜正确数据上的价值或DAgger辅线（二选一优先）

依赖：T11-01/03。与T11-04结果联合决定投入，不同时默认跑完全部组合。

价值辅线：用正确当前状态和真实自然结局，先与由训练集估计的常数基线、简单军力/经济回归基线比较。按根对局分组，报告Brier/MSE、排序、校准、地图/座位/阶段/采集策略分层；不能只用低ECE资格认证，常数预测也可能有低ECE。若存在自然平局，`(V+1)/2`应称预期得分而非纯获胜概率，或使用W/D/L三类头。

先验证训练集可以学到value信号，再训练到预注册更新上限/独立验证早停。value-only先固定policy或使用独立head，避免一开始破坏可用策略。集成搜索时在同一个afterstate统一量纲：例如分开的value-only叶评价臂，或经训练集拟合/验证的标准化组合；保留自然终局绝对优先。记录价值真的改变排序的频率及改变后的收益。

DAgger辅线：在训练根内采样，修复块ID与真实随机流。建议训练数据按来源分层抽样，让新纠错每batch占20%–30%作为起点；实际消费可核验。至少保留基准、不加新样本续训、加新样本三臂，B/C使用相同更新预算。先看可靠战术错误是否减少，再看整局，不以一般动作分歧或“邻接敌人”直接认证自杀。

无论选哪一条，只有重新生成的数据和新的runId才能覆盖旧负结果。旧V10权重不重新登记成已修复训练来源。

### T11-06｜P1｜冻结确认与产品验收

依赖：T11-04获得候选或T11-05带来可靠收益。

开发阶段20场/臂用于排错。正式确认冻结候选、地图/初态设置/种子、双方策略、预算和终止规则。建议100个不同起局家族×双方座位作为下一档目标；有效样本按根聚类，不将相同轨迹重复计数。实际资源不足可分块，但比较必须先取共同完成的配对块，未跑项单列。

报告W/L/D/T/ERROR/NOT_RUN，W/N、(W+0.5D)/N（T单列）、已分胜负局条件胜率、自然完成率。截断高时用双方一致的延长上限作敏感性实验，不能用启发式分数把截断宣布成自然获胜。

用根级配对bootstrap或相应配对区间分析学习模块增益；明确开发/确认/未见地图三个口径。不反复挑选同一测试集；出现失败后回归开发并使用新的确认集。

浏览器仅在候选具备棋力价值后做真实E2E：完整请求包含初始开销、序列化、fallback、推理、搜索、返回和落子验证。约1秒是产品目标，不是任何硬件保证；p50/p95/p99/max及真实超时、取消/过期状态全部记录。主线程不能被所谓fallback长计算阻塞。

生产晋级必须同时有棋力收益、合法性、可靠性；仅基准Heuristic占据全部选择而混合臂成绩相同，不算学习成功。

## 5. 执行节奏与止损

第一批只做T11-00至03的最小必要修复和12–20个直接回归测试。复用已通过且与这些缺陷无关的工程实现，不重新全量重建V7–V10工具。

第二批只完成T11-04的一次受控学习实验。若局部参考教师比基准更差，停止蒸馏，先改参考规划；若训练集信号学不会，停止大赛，查数据/梯度；若局部改善但整局变差，分析干预错误和访问分布，不马上扩网。

T11-05辅线根据第二批证据选择，T11-06仅对达到开发要求的候选启动。一次只改变有明确假设的因素，所有“没提升”都应留下可解释结果。

建议下一次交付不再用一张“全部完成”总表，而回答：修复了哪些失败断言；哪些状态被正确标注并实际优化；相同预算下学习模块带来多少有益/有害覆盖；在冻结比赛中是否改善；哪些目标尚未检验。

## 6. 证据索引

以下仓库链接均固定在本次审查提交，源码与报告的证据等级不同。报告成绩是历史实测记录，代码行为由静态审查确认，不冒充本次全套复跑。

- **[E01]** V10总体简报：[v10/V10_TASK_COMPLETION_REPORT.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/v10/V10_TASK_COMPLETION_REPORT.md)

- **[E02]** 修正后的比赛、采集与校准结果：[v10/fix_01/TASKS_1_5_RESULTS.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/v10/fix_01/TASKS_1_5_RESULTS.md)

- **[E03]** A/B/C数据、预算与比赛：[v10/fix_01/dagger_controlled_report.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/v10/fix_01/dagger_controlled_report.json)

- **[E04]** 价值采样状态错位、局部失败未回滚、行为目标：[tools/v10_value_learning.ts#L80-L230](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10_value_learning.ts#L80-L230)

- **[E05]** 构造深拷贝；非法step返回失败而非抛异常：[src/game/engine.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/src/game/engine.ts)

- **[E06]** 价值与结构实验准备、评测数据来源：[tools/v10fix/pipeline.ts#L525-L830](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10fix/pipeline.ts#L525-L830)

- **[E07]** 默认设置回放、仅catch异常、数据池与分区：[tools/v10fix/pipeline.ts#L290-L515](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10fix/pipeline.ts#L290-L515)

- **[E08]** 起局参数变化、分块采集、单epoch87更新：[tools/v10fix/collectors.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10fix/collectors.ts)

- **[E09]** 宏动作遗漏、跨单位followup和回应排序：[tools/v10_turn_aware_search.ts#L105-L255](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10_turn_aware_search.ts#L105-L255)

- **[E10]** 根调度、预算、叶评价/value尺度与状态：[tools/v10_turn_aware_search.ts#L260-L425](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10_turn_aware_search.ts#L260-L425)

- **[E11]** on-policy当前状态采样、块ID和随机流：[tools/v10_dagger_controlled.ts#L60-L265](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10_dagger_controlled.ts#L60-L265)

- **[E12]** 实际macro后续执行、128预算与超时字段：[tools/v7_unified_evaluation.ts#L340-L445](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v7_unified_evaluation.ts#L340-L445)

- **[E13]** 训练前生成消费清单、分区、optimizer入口：[python/train_spatial_resnet.py#L320-L460](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/python/train_spatial_resnet.py#L320-L460)

- **[E14]** 损失、mask、max_steps和最后batch累计：[python/train_spatial_resnet.py#L95-L270](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/python/train_spatial_resnet.py#L95-L270)

- **[E15]** 新增GAP输入与附加残差块的初始化：[python/spatial_resnet_model.py#L178-L260](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/python/spatial_resnet_model.py#L178-L260)

- **[E16]** 单步teacherQ、终局1000、行为CE与温度1：[tools/v10fix/loss_ablation.ts#L35-L170](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10fix/loss_ablation.ts#L35-L170)

- **[E17]** 仅三地图开局动作对的碰撞审计：[tools/v10_representation_ablation.ts#L45-L105](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/tools/v10_representation_ablation.ts#L45-L105)

- **[E18]** 结构对照读数与数据路径：[v10/fix_01/representation_ablation.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/4451947355e9683437a6fc1348cf01657eaf50e3/v10/fix_01/representation_ablation.json)


## 7. 方法参考与适用范围

- Ross, Gordon & Bagnell (2011), *A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning*. https://proceedings.mlr.press/v15/ross11a.html 。支持“学生行为改变后续访问分布、需要交互式数据聚合”的方法背景，不证明本项目这次一轮实验应当成功。
- Anthony, Tian & Barber (2017), *Thinking Fast and Slow with Deep Learning and Tree Search*. https://arxiv.org/abs/1705.08439 。支持规划与泛化交替改进的Expert Iteration方向，不将Hex结果直接外推成本战棋的性能。
- Silver et al. (2018), *Residual Policy Learning*. https://arxiv.org/abs/1812.06298 。参考其“在已有可用策略上学习改进”的思想。该论文是机器人连续控制；本文的离散战棋候选增益排序是针对本项目的新设计建议，不宣称直接复现论文算法或具备单调提升保证。
