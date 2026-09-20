# AncientEmpires AI 后继执行任务书
## v6.0｜指挥官重招募专项、全部学习模型重训与策略验证、后续修复和扩容

**日期：2026-09-21（Asia/Tokyo）**  
**推荐开发基线：`path-b-spatial-ai`**  
**本次远端核查HEAD：`a0a9dcdd483cb951a72734805504c947176d5d79`**  
**qwen对照HEAD：`85a87a0edb64de18a8b8eced9226ffb1cd1b48e9`**  
**配套：`AncinetEmpires_AI_Commander_Review_20260921_v6.md`、任务JSON与启动指令。**

> 本书是待执行任务规范，不是已经完成的重训/对战报告。本次已核查远端代码和此前v5任务书；没有在用户训练机运行项目测试、重新训练或重跑完整对局。所有性能阈值、样本量和预算是本轮实验设计建议，不是实测结果。

## 0. 用户目标、顺序与权限

用户要求解释“指挥官阵亡后，金币足够却不重招募”，核查机制是否进入训练；增加各策略所用学习模型的重训及验证对比，然后继续此前的修复任务。本轮落实为：

**冻结旧策略 → 查明重招募卡在哪一层 → 完成专项训练必需的最小修复 → 全部学习模型重训 → 所有策略分别对比 → 执行剩余v5修复 → 数据量/深度对照 → 受影响模型重训与最终交付。**

不能为了字面上“先重训再修复”，在指挥官动作不存在、动作编码相同、标签错位或验证泄漏时运行一轮注定无法回答问题的训练。也不要求先做完Worker/UI等所有工程事项，才允许离线重训。训练最小前置与后续完整修复明确分开。

### 0.1 文档优先级与工作区保护

先读实际有效AGENTS.md及用户最新指令，记录当前分支、HEAD、dirty差异。v6调整v5执行顺序，增加强制的全模型专项重训与数据量实验；v5仍是详细技术规范，旧文档不得删除。配套JSON只是导航。

若源码已更新，逐项核查并以实际测试标ALREADY_FIXED，不重复改回旧实现。不得自动切分支、reset --hard、覆盖用户未提交更改、删除旧数据/模型、push、发布、修改默认AI或调用收费云资源。对照分支采用只读快照/经允许的独立worktree，不混写旧分支。

本轮主训练域为**两方SD正常遭遇战**。SO与战役仅作为模式隔离/不应误招募的负对照，不擅自统一其规则。确有规则bug只允许凭规则证据作最小修正；不为让AI赢而降低费用、取消单位上限或强改终局。

### 0.2 “每个策略重新训练”的准确含义

每一个**实际启用、可恢复的独立学习模型/编码版本**进入重训清单；每一个策略包装器进入独立评测清单。共享权重只训练一次，不伪造多个独立模型。

Heuristic、Random和不使用学习权重的S00没有可训练参数，必须评测但训练状态记NOT_APPLICABLE。NET_B单步与NET_B-S10共享权重：一个重训checkpoint，两个评测arm。BC-blend及收官混合策略同理。S01/S11需单独价值资格，不能把未训练的value强行当作合格。

历史同一模型每个epoch快照不要求全部重新训练；保留原始快照作回归。任何用户当前实际使用的学习版本都不得悄悄漏掉。文件缺失、编码不兼容或数据不可恢复必须明确列出，不能以Heuristic fallback冒充该模型完成验证。

## 1. 当前核查事实：机制已存在，接入与学习并未充分证明

1. **规则层已支持。** SD配置`commanderRecruitBaseCost=400`、`commanderRecruitCostGrowth=100`；实际费用读取玩家`commanderDeathCount`。初始基础费用400，真实阵亡1/2/3次后分别为500/600/700，除非有明确价格覆盖。[S01][S02]
2. **死亡记录已存在。** 引擎记录死亡次数并保留指挥官等级/经验；重招募执行读取保留值。指挥官死亡本身不应替代当前模式的自然终局判定。[S03]
3. **“有钱”不是全部条件。** 招募还取决于模式/名单、阵营活跃、未有存活指挥官、单位数上限、城堡归属和占位、pending等。当前指挥官population=0，不得一概以“人口满”解释禁招，也不得免除真实单位数量上限。[S01][S04][S22]
4. **训练观察已暴露相关字段。** Observation输出动态recruitCosts、死亡次数和保留等级/经验；但暴露给数据文件不等于编码器和训练器实际使用。[S09]
5. **旧MLP不是完全不认识。** 45维动作招募段包含精确unitClass序和getUnitCost。仍需检查状态层在“尚未有合法招募候选”时，能否表达存钱目标、缺席状态和保留价值。[S10]
6. **空间路线存在信息缺口。** 24维空间动作没有区分具体招募兵种及实际费用；同城堡同落点不同兵种可得到相同输入。全局经济未接入policy，单靠加深/扩样无法补齐未输入的信息。[S11][S12]
7. **部分数据和评测用了错误模式。** 空间pilot导出、空间benchmark及200回合工具使用无参createDemoState；裸demo没有注入SD规则，默认指挥官价格为空。因此这些路径不会生成合法的指挥官重招募动作。[S05—S08]
8. **不能泛化为历史2500局都缺失。** 归档转换的实际覆盖必须扫描；不能由pilot缺陷推断30k或977737条中重招募样本为0。[S13][S21]
9. **启发式已有恢复逻辑。** scoreRecruit存在shouldRestoreCommander、高恢复分及不足费用时抑制普通招募；但受威胁城堡防守分支优先，启发式也不是绝对最优教师。[S15]
10. **不能仅凭裸demo解释用户那一局。** 实际应用默认走官方遭遇战构造。必须抓取当前失败状态和实际policy/model/rules，而不是根据界面名称猜模式。[S19]

**本轮初始结论：RULE_IMPLEMENTED / PIPELINE_PARTIAL / COMMANDER_POLICY_NOT_VERIFIED。** 不是“机制完全没写”，也不是“已有代码所以模型已经会了”。

## 2. 任务总表与依赖

| ID | 阶段 | 任务 | 前置 | 核心交付 |
|---|---|---|---|---|
| C60 | 专项准备 | 冻结版本、全部模型/策略登记、捕获失败状态 | 无 | inventory、policy-model映射、失败快照 |
| C61 | 专项准备 | 死亡→涨价→合法重招募生命周期回归 | C60 | 规则测试、模式矩阵、字段/入口审计 |
| C62 | 专项准备 | 重招募决策漏斗与旧策略基线 | C60、C61 | 每策略失败归因与冻结前结果 |
| C63 | 最小修复 | 修模式接入、编码、重建、候选、分区及安全训练入口 | C61、C62 | 真实入口修复、反例与数值一致性 |
| C64 | 专项数据 | 扫描2500局并建立重招募课程与共同数据集 | C61、C63 | 覆盖漏斗、来源分区、课程数据 |
| C65 | 专项重训 | 对全部登记学习模型重训 | C63、C64 | 每模型新checkpoint、学习曲线、消费索引 |
| C66 | 专项验证 | 所有策略前后对比与同局换边 | C62、C65 | 专项/整局矩阵、失败反例、阶段结论 |
| C67 | 后续修复 | 完成剩余v5：Worker、空间搜索、全局评测/加载等 | C66；独立项可提前并行 | 实际调用链与故障测试 |
| C68 | 扩容实验 | 3万/15万×2块/4块；有收益再30万/合格全量 | C63—C67相关项 | 数据/容量学习曲线与成本比较 |
| C69 | 条件迭代 | 学生访问状态纠错、自然价值与2×2搜索消融 | 合格教师/标签及相关前置 | 纠错或价值独立证据 |
| C70 | 最终复核 | 受影响模型重训、全策略回归、冻结留出 | C67、选中候选相关项 | 最终对照、模型卡与可选部署资格 |
| C71 | 交接 | 更新状态、实际命令、真实结果与未完成事项 | 各阶段 | CURRENT_TRAINING_STATUS与NEXT_ACTION |

C60—C66是用户本次明确要求的优先工作，不得只完成代码审计便结束。C67的Worker缺少浏览器资源，不应阻塞可信离线C65/C66；但该环境在线资格不能通过。C69教师未合格也不阻塞合格历史数据的policy重训。

## 3. C60｜冻结现状与完整策略/模型登记

### 操作

记录HEAD/dirty-hash、引擎规则版本、当前UI选择、实际加载模型路径/SHA256、特征版本、搜索配置、运行设备与依赖。建立`policy-model-matrix.json`，不能只抄App下拉框。

最低检查对象：

| 对象 | 训练要求 | 评测要求 |
|---|---|---|
| 原始Heuristic | 无权重，不训练；改进版本另命名 | 固定基线、专项与整局 |
| Random | 不训练，显式RNG种子 | 健全性/下界对照，非唯一对手 |
| S00纯启发式搜索 | 无学习权重则不训练 | 固定有效配置与预算 |
| 当前实际使用的BC/hashed/线性模型版本 | 每个独立活跃编码版本重导出、重训 | 纯BC及相关blend/收官wrapper分别跑 |
| NET_A | 重训 | 纯策略；接入的搜索wrapper也测 |
| NET_B | 重训一次 | net_b_1ply与net_b_s10分别测 |
| Spatial 32ch/2块 | 修复后重训 | 单步；搜索适配器存在后单列S10 |
| Spatial 32ch/4块 | C68正式新对照，不假装当前已存在 | 同数据、同预算对照 |
| S01/S11等价值策略 | 重训所依赖价值头，不重复训练同一权重 | 标签不足可诊断但必须VALUE_HOLD，不得认证 |
| 当前仓库/本地注册的其他学习策略 | 发现即补入清单 | 不得因上表未列而遗漏 |

保存旧checkpoint，不默认覆盖src模型。旧模型按旧编码加载；不能拿新编码喂旧权重再报告旧模型退步。

### 失败状态捕获

在本地真实对局中自动捕获“本方指挥官缺席、账户金币达到动态价格”的状态，并保留前一段死亡/占位/金币轨迹。没有用户那一局的快照，则生成真实引擎可回放的专项失败例，标为REPRODUCED_CASE而非声称还原了用户那局。

快照含gameId、stateVersion、完整GameState、rulesHash、policyId/modelHash、actionCode、全部合法候选、前后状态、终止原因。模型加载失败或回退必须单独记录。

### 验收

每个策略都有明确modelId或NOT_APPLICABLE；共享模型关系清晰；缺资源逐项BLOCKED_RESOURCE。产出inventory、policy-model矩阵和失败快照清单。

## 4. C61｜完整规则生命周期与模式隔离

### 4.1 必须验证的链条

用真实GameEngine合法动作完成：

`指挥官存活 → 真实战斗/合法规则伤害致死 → 死亡计数仅加1 → 判断自然终局 → 进入本方可行动阶段 → 获取费用和合法招募 → 扣费创建新指挥官 → 处理pending → 继续作战 → 再次死亡再招募。`

直接删除unit并把deathCount手填为1，只能作字段边界单元测试，不能代替生命周期回归或自然可达训练轨迹。不会通过修改胜负条件让原本已输的状态复活。

费用权威入口：

```text
price = getUnitCost(state, playerId, 'commander')
SD无覆盖时 price = 400 + 100 * commanderDeathCount
price=null 表示禁用，不是0金币，不得以 price || 400 兜底。
```

deathCount=0的400是基础费用；首名初始指挥官阵亡一次后的首次重招募通常是500，不要把“第一次重招募”误标成400。

### 4.2 最低规则反例集

以下所有行均应有测试；边界金币可用白盒状态设置并标合成测试，不声称全由官方开局UI产生。

| 类别 | 例子 | 必须验证 |
|---|---|---|
| 涨价 | 死亡1/2/3次 | 动态价500/600/700；后续按配置计算 |
| 精确余额 | cost-1、cost、cost+1 | 不足拒绝，够价扣费精确 |
| 重复死亡记录 | 多次getState/clone/回放 | 死亡仅记录一次，不重复涨价 |
| 存活/待部署重复 | 已有存活或pending指挥官 | 不允许再生成第二名 |
| 单位数量 | count=limit-1、count=limit | 前者可按其他条件招募，后者拒绝 |
| 人口 | 指挥官population=0且人口已满 | 不因“需新增人口”错误禁招；仍检查单位数量及规则实际条件 |
| 城堡为空 | 本方拥有空城堡 | 在其他条件满足时存在重招募动作 |
| 普通己军占城堡 | 金币够，但城堡被本方普通兵占据 | 当前无重招募动作；可合法移开后恢复 |
| 敌军占城堡/无己方城堡 | 有足够金币 | 正确解释阻塞，不穿透占位或远程招募 |
| pending锁 | 任意招募待处理 | 依真实规则处理pending后再评估，不绕过锁 |
| 重招募后pending | 招募成功后 | 处理move/wait/允许的end_turn，避免无限卡住 |
| SD继续游戏 | 指挥官死亡但仍满足生存条件 | 不提前写自然败/结束episode |
| 真正失败 | 已满足当前模式自然失败条件 | 不再训练“复活翻盘”伪轨迹 |
| SO/战役/自定义 | 显式禁招或死亡即败规则 | 保留其规则，不能为通过测试统一改成SD |
| 价格覆盖 | 有效覆盖/明确null | 按getUnitCost，不按硬编码400/500 |
| 等级经验 | 有等级指挥官死亡再招 | 保留规则规定的等级/经验；HP按现有已验证规则，不擅自改满血 |
| 视角 | P0/P1、非同号联盟ID | 费用/计数归属玩家正确，终局按联盟正确解释 |
| 输入恢复 | save/clone/Observation重建 | 合法动作、动态价、保留值、下一步结果一致 |

标准SD里“无兵但有己方城堡”与“无兵无城堡”必须分开验证。复用现有规则报告/测试，先确认现有可执行用例，再补缺口。[S01—S04][S22]

### 4.3 实际入口审计

枚举所有createDemoState、createGameState、env.reset和快照导入调用。训练、数据生成、评测必须声明mode及有效rulesHash。修正SD任务误用裸demo的入口；保留裸demo作为显式DEFAULT_NO_COMMANDER_RECRUIT负对照，不全局篡改DEFAULT_RULE_CONFIG。

若用demo做SD规则测试，显式传`getApkSkirmishRuleConfig('SD')`；正式棋力验证优先当前可用官方两方SD地图。metadata写“SD”不能代替真正注入规则，override不得偷偷覆盖回null。

### 验收产物

`commander-rule-audit.json`、`rules-entrypoint-matrix.json`、真实生命周期回放、费用边界测试与日志。规则正确则ALREADY_IMPLEMENTED，不能虚构“新增重招募机制”的成果。

## 5. C62｜决策漏斗：把“不招募”定位到实际一层

### 5.1 每次机会记录

建议新增纯诊断函数`explainCommanderRecruitment(state, playerId)`及统一telemetry；函数是本轮待实现接口，不是现有命令。

```text
mode, rulesHash, playerId, isCurrentPlayer, engineTerminal, isActivePlayer,
commanderPresent, commanderDeathCount, reserveLevel, reserveExp,
commanderRecruitPrice, gold, goldGap, unitCount, unitLimit,
population, populationLimit, commanderPopulation,
ownedCastles, castleOccupants, pendingUnitId,
recruitableClassAllowed, legalCommanderActionCodes,
preFilterCommanderActions, postFilterCommanderActions,
beamCommanderActions, expandedCommanderActions,
commanderLogitsScoresRanks, selectedActionCode,
selectedSource, fallbackReason, modelHash, stateHash
```

Gold足够但原始合法动作不存在，应归因规则/状态/模式，不算模型“漏选”；原始存在而筛选消失，归因候选；最终候选存在却未选择，才进入策略偏好诊断。动作选出但engine.step失败、结果过期或pending卡住，另归执行/运行时。

### 5.2 统一原因码

`MODE_DISABLED / NATURAL_TERMINAL / INACTIVE_PLAYER / NOT_CURRENT_TURN / COMMANDER_ALREADY_PRESENT / INSUFFICIENT_GOLD / UNIT_LIMIT / POPULATION_RULE_BLOCK / NO_OWN_CASTLE / CASTLE_OCCUPIED / PENDING_LOCK / RECRUIT_LIST_DISABLED / LEGAL_GENERATION_MISMATCH / FILTER_DROPPED / POLICY_REJECTED / EXECUTION_REJECTED / STALE_RESULT / LOAD_FALLBACK / REASON_UNKNOWN`。

多因素可以同时存在，保留原因列表，不只返回一个遮住其余问题。不要把未知填成“模型数据少”。

### 5.3 旧策略专项基线

在修编码/权重前，以C61有效规则分别运行旧策略：安全立即重招募、需先移开占位单位、金币暂不足需攒钱、敌军迫近需先防守、可立即取得自然胜利无需先招募、第二/第三次阵亡涨价、重招募后pending处理。

必须区分“可以招募”与“此时最优动作就是招募”。只有在预先标注的无争议正例中，才把不立即招募计作错误；其他情况用可接受动作集合、后续计划和实际对局评价。不能用“所有有钱都强制招募”的规则替代学习。

保持旧模型文件不变，旧策略在正确SD环境中的结果为主要前基线；原错误demo路径只作为缺陷复现，不与新SD结果混算棋力提升。

### 产物

`commander-decision-funnel.jsonl`、`commander-baseline-matrix.json`、逐策略失败快照、遗漏层分布。未提供用户原局面时结论明确限定于可复现测试域。

## 6. C63｜只先修“重训必须依赖”的部分

### 6.1 重招募感知与动作编码

在共享数据schema内保留：存活/缺席、真实死亡次数、动态价格与价格是否有效、保留等级/经验、本方现金与缺口、是否有可用城堡、单位数余量、pending、当前模式相关规则。

动作至少包含精确unitClass、动态费用、花费后金币、招募位置/部署阶段。空间policy必须读到全局条件；即使当前暂时无合法指挥官候选，也应能看到未来恢复费用，支持存钱和腾位置。费用为null与0、无坐标与(0,0)不能混淆。

复用NET_A/B已有正确45维动作特征，不再把它们说成“完全不识别兵种”。给各模型编码版本分别记录变更；必要时新增状态/动作版本。BC/hashed特征也须重导出，不能混用旧缓存。

对同城堡同落点不同兵种、同几何不同deathCount、同金币不同费用、相同合法候选但不同重招募需求做反例；动作序重排不应改变actionCode对应评分。修复前空间v1应可复现碰撞，修复后必须消失。

### 6.2 状态重建与观察契约

不能直接`rules: obs.rules`就当完成还原。必须核对：Observation的`priceOverrides`到GameState的`prices`映射；null/undefined的“无限制/未设置”语义；`commanderCastleRecruitUsesPending`等源字段；pending来源；死亡次数和reserve；当前阵营、数量限制与完整规则指纹。[S09][S13]

观察缺失无法唯一恢复的关键字段，要从可信规则manifest/完整状态快照恢复并记录证据；不能猜默认值。恢复不了则隔离该数据来源。测试重建前后动态费用、全部合法动作集合以及执行重招募后的状态一致。

### 6.3 候选与标签

指挥官候选不得在前48/64粗筛中静默被移除。优先全合法候选；必须检索时训练/验证/部署使用一致规则，记录全候选召回与候选内准确率。不得向验证候选注入正确答案后宣称真实召回100%。

搜索保留指挥官候选不等于强制选择；招募后需要处理pending的后继也应可展开。代码级修复配额应与是否重训分开登记，避免把候选机制提升全归功于权重。

### 6.4 可信训练/评测最小边界

先按对局/根家族分train/dev/final，取消实际Python入口逐状态random_split；原局、死亡后续局、镜像与相邻状态同组。checkpoint不可变，禁用默认deploy-to-src。加载失败回退需如实标记，初始化权重不许冒充训练模型。

先补最小结果聚合：自然胜/负/平与未解决/错误分开；局面无指挥官不等于自然败；每个模型/数据/规则hash和实际样本消费可追溯。PyTorch导出与TS推理核对全部候选logits及value，不能只看argmax。

### 6.5 不作为本阶段强制阻塞的项目

Worker全套浏览器集成、UI美化、更深的对手回应搜索、大规模架构扩展，放C67以后。离线评测必须仍有可信计时/进程停止与状态完整性，但不要求浏览器测试先全部完成。

### 验收

专项规则、编码、重建、候选、根分区、数值一致性通过后开放C65。禁止本阶段只输出新manifest而真实训练入口继续读旧文件。

## 7. C64｜扫描2500局，补齐真正缺的重招募经验

### 7.1 全资产扫描与覆盖漏斗

扫描可用历史资产与实际训练输入，不等于立刻将全部样本投入优化。报告：发现/可读/可重建/规则合格/用于train的episode数，不能把“历史有2500局”填进本模型消费数。

对每个来源、模型训练集合与split，统计：

```text
episodesTotal, episodesSdRecruitEnabled, episodesWithCommanderDeath,
commanderDeathEvents, recoverableDeathEvents, legalRehireOpportunityEvents,
opportunityStateCount, chosenCommanderRehireActions,
selectedPolicyTargetsCommanderRehire, consumedCommanderTargets,
first/second/thirdPlusDeathBuckets, costBuckets,
blockedCastleCases, savingCases, pendingResolutionCases,
uniqueEpisodes, uniqueRoots, duplicateStateRate, quarantineByReason
```

一场死亡后几十个相邻状态不是几十次独立恢复机会。首次机会事件应有稳定episode/deathEvent/player身份；分别报事件数和状态数。

扫描到足够真实示范就优先利用；不足时补课程/合格教师纠错。不预填“没有任何重招募样本”。对混入多方、SO和旧规则的数据分轨处理；本轮SD模型不默默把不兼容来源混用。

### 7.2 专项课程

从合法回放的真实死亡事件抽取，必要时用规则合法构造并保存生成/回放证据：

A. 安全立即重招募；B. 金币不足时等待收入并避免无意义花掉恢复资金；C. 己方普通兵让出城堡再招；D. 多次死亡与涨价；E. 招募后pending正常解锁；F. 敌军压城先解围再招；G. 可自然取胜时先赢、不多做招募；H. 已无生存条件/禁招模式，不产生虚假复活目标。

恢复收入、等级与战斗价值使用真实引擎，不写“只要招募就+1胜利”。训练positive并非全是“金币够立即买”，须保留策略上合理的延后/拒绝例，避免模型只会机械补指挥官。

### 7.3 教师和标签

已有Heuristic恢复偏好可以作行为来源，不能无条件当最优答案。无争议局部例以引擎回放和小型有界oracle建立可接受动作/动作序列；复杂域使用通过对应域评估的教师。未知或不完整搜索建议标LOW_CONFIDENCE，不进入高置信正式policy目标。

行为动作、教师建议、自然终局value分三轨。自然value从完整同源episode终局回填，指挥官死亡不直接标-1；没有自然终局为null/mask=0，不因材料落后或时间到而补0。自定义任务成功可作独立辅助标签，不能叫“自然获胜”。[M01][M02]

### 7.4 首轮共同训练池

先用小样本测试加载/学习；正式专项建议`D_R30`为30k唯一状态，跨全部合格训练分区来源抽样，建议70%通用、30%重招募相关课程。该30%含正例、准备动作、合理延后和负例，不是30%强制买指挥官。比例在看结果前冻结，缺足够独立状态时下调并如实报告，不能重复复制凑唯一条数。

每个模型使用相同的状态ID、目标资格和分区，仅编码不同；报告各自实际消费的交集/缺失。保留独立未过采样开发集，以免高专项比例掩盖普通局面退化。可做一个同结构、同更新预算、无专项过采样的控制实验来区分数据贡献。

### 产物

`commander-coverage-audit.json`、原始扫描摘要、规则/来源/分区manifest、专项场景标签与依据、`D_R30`消费索引、隔离清单。全量扫描失败的来源单列，继续可信来源任务，不凭空宣称扫描完整。

## 8. C65｜全部学习模型专项重训

### 8.1 执行最低范围

按C60清单，对每个当前有效、可恢复的独立学习模型至少完成一个正式重训run。最低覆盖当前活跃BC类、NET_A、NET_B、Spatial-2block；C60发现更多当前使用的学习编码版本必须补入。未启用的历史备份可仅保留对照，不逐快照重复训练。

相同输入schema仍有效时，可预注册从头训练或续训；特征语义/维度改变通常从头训练。迁移权重必须有显式映射与新modelId，不能静默截断/补零后宣称等价续训。旧模型只读归档。

NET_B的新权重供1ply/S10等共享；BC新权重供纯策略/blend/收官等共享。学习value不足时先policy-only训练，保留valueMask=0及VALUE_HOLD；不得让无自然标签阻塞全部policy训练。

### 8.2 训练与资源

各模型先做≤64真实状态tiny检查，包含指挥官/普通兵区分与涨价边界；冲突/等价动作先核查。首轮各一个seed完整训练用于全覆盖比较，重要候选再补多seed，不声称单seed证明架构普遍优势。

预注册优化器、LR、batch/候选、最大更新/epoch、早停依据、数据顺序seed。相同状态呈现预算是基本对照；不同架构允许合理优化器配置，但不能只给偏好的模型无限调参。建议起步6epochs、最多12，具体应看学习曲线且受统一预算限制。

保存每epoch模型、最佳开发模型、末模型和可恢复optimizer/scheduler/RNG。所有输出进入新run/model目录。记录设备真实后端与精度，不根据旧聊天配置擅自升级驱动或租GPU。

空间数据采用分片/二进制/流式加载与候选批量gather；当前全JSON常驻方式不能直接放大到近百万样本。仅24×20×20 FP32张量、977737状态约35GiB，尚未含候选/对象/训练内存，此数为容量计算不是实测RAM峰值。[S14]

### 8.3 必须报告

普通/专项train-dev loss、Top-1/Top-k、可接受动作集准确率；指挥官候选相对普通兵分数/排序、动态费用分桶表现、存钱/腾城堡/pending处理表现；实际state/episode/root/目标消费数；训练步数、epoch、时间与资源峰值。

训练脚本不能授予棋力QUALIFIED。重训输出必须经已训练权重的Torch/TS数值一致性检查，再进入C66。

## 9. C66｜每个策略分别验证，而不是只看一个新模型

### 9.1 三层验证

**规则层：** C61全部用例，期望0规则错误、0非法招募、0错误费用、0重复指挥官。属于机制正确性，不是策略选择比例。

**专项策略层：** 在独立根上测立即恢复、筹资、让出城堡、涨价、pending与合理延后。建议开发至少24个独立根、最终至少12个另行冻结根；每根各做双方视角/座位映射。数量不足只报探索性，不以镜像或换编号补足独立根。

**完整对局层：** 正常官方两方SD开局为主体，另有死亡后续局诊断。每个策略都对同一Heuristic与可恢复历史冠军；新模型还与自己的旧checkpoint配对对比。Random只作下界。

建议小型开发矩阵每arm至少8个独立根×2座位，对手按共同协议；最终选出候选后使用更大的冻结矩阵。不是要求对所有arm盲目做全组合循环赛。未知模型/配置不能混进同一行。

### 9.2 需要分别列出的arm

旧/新纯BC、旧/新BC-blend及当前收官wrapper；旧/新NET_A；旧/新NET_B-1ply与NET_B-S10；旧/新Spatial-1ply；S00；已实现且接入正确的Spatial-S10；Heuristic、Random。S01/S11只有value资格满足才进正式矩阵，否则明确诊断/DEFERRED原因，不假装训练了不存在的模型。

先保留冻结搜索/混合参数测权重变化；候选保留机制修复作为独立因素记录。模型与搜索同时改变的总体收益可报告，但不能全部归因于“重新训练”。

### 9.3 核心指标与分母

- 机制：合法重招募动作生成率（在已证明可招状态）、费用正确率、重复招募/执行失败率。
- 决策：无争议正例的有效恢复率、首次有效机会到恢复的本方决策数/回合数；需腾位/等待的准备计划成功率。
- 反例：不合法状态尝试率、应先防守/可直接赢时的错误强招率、无意义消耗恢复资金率。
- 行为后果：恢复后存活、城堡保全、后续收入/局势、再次死亡原因；不把短期存活或金币多直接当胜利。
- 棋力：W/L/真实D/T/E，自然胜率W/N、自然完成率、分域/座位、普通开局退化。
- 成本：真实端到端P50/P95/P99/Max、超限、fallback、搜索节点；每局各自统计后再汇总。

所有截止未恢复的机会标未解决/失败类型，不能只平均已恢复的成功例。`有钱但不招比例`不能代替`应招而漏招比例`。

### 9.4 阶段验收

规则/编码/输入安全用例要求全部通过。无争议恢复正例可预注册≥95%的目标，但这只是项目验收目标，不适用于全部复杂局势；开发结果看完不能放宽。保留样本数和根聚类不确定性，不能用很少的例子声称普遍可靠。

完整对局胜率/非劣界预先冻结；截断不能算0.5分，错误不能删除。若专项改善但完整开局退步，标LOCAL_IMPROVEMENT_GENERAL_REGRESSION并保留旧冠军，不因此拒绝交付真实实验结果。

产物：全策略前后矩阵、逐局/逐机会telemetry、失败回放、模型排序及局限。C60任一登记学习模型未训练/未测，应在覆盖表明确，不能写“全部完成”。完成后进入C67，不在首轮指标不佳时无限补训。

## 10. C67｜接续之前v5的剩余修复

C63完成的部分标已复用，不从头重做。对应关系：

| v5任务 | v6处理 |
|---|---|
| V50快照/预算 | C60及本书资源章；保留历史和更正账目 |
| V51可信评估 | C63/C66先完成最小链，C67统一全部runner/CLI/失败门禁 |
| V52空间v2 | C63先补专项和global；C67补完整状态/威胁/边界/叠放审计 |
| V53数据链 | C63/C64已落实；C67消除其他旁路与全量加载瓶颈 |
| V54真实Worker | C67主任务，不再用queueMicrotask伪看门狗 |
| V55训练 | C65专项全模型；C68数据/深度对照，不停留小试训 |
| V56空间搜索 | C67接入空间scorer和有效对手阶段 |
| V57学生纠错 | C69条件执行 |
| V58value/消融 | C69条件执行 |
| V59整局/留出 | C66先比较，C70冻结最终；已看开发集不冒充最终 |

### 10.1 在线执行

Worker隔离昂贵推理/搜索，调用方同一t0预算、请求stateHash/version、可终止、合法低成本fallback、迟到结果丢弃。Auto/Sandbox真实入口必须接线，不只新增无人使用的wrapper。

每底层Action端到端1000ms目标，建议850ms停止新增搜索、950ms返回校验；真实超限不裁剪。预加载成本单列，发生于请求内的冷加载计入。不是整回合1秒，整回合累计也要报。

故障测试含1200ms慢worker、无回复、异常、坏模型、换图、手动走子、同一turn状态变化、停止Auto、过期回包。不得把浏览器非硬实时环境说成任何机器绝不超过1秒。

### 10.2 搜索

复用真实引擎clone和候选合法性，明确Spatial-S10区别于旧NET_B-S10。至少在专项关注：移开堵城单位→重招募→pending部署，以及敌方移动→攻击、集火、反占领。搜索不能把指挥官单次死亡当胜利终局，也不能每个底层动作都翻转value视角。

先保留启发式叶评估做S00/S10；VALUE_HOLD不阻塞策略先验搜索。候选保留在粗筛前生效，记录实际展开/完成回应，而不是仅显示“看见过对手”。

### 10.3 修复后是否重训

只改Worker/UI/日志、不改变输入/权重/策略语义：无需无意义重训，但必须重测运行时。改变特征、规则还原、数据标签、策略头或目标：所有受影响模型重新导出并重训，原阶段产物保留；只改变搜索：重跑对应搜索arm，不冒充权重进步。

## 11. C68｜数据量与网络深度的正式对照

本轮不把旧v5的30k建议当永久数据上限。先全资产扫描与根分区，再扩大合格训练池；不得把held-out根一起训练掉。

固定C63修复后的输入/全局policy、相同数据筛选和目标资格：

| arm | 数据 | 架构 | 问题 |
|---|---|---|---|
| A | D_R30，约30k | 32ch/2块 | 修复后基线 |
| B | D_R150，约150k | 32ch/2块 | 数据覆盖增益 |
| C | 与A完全相同 | 32ch/4块 | 加深的增益 |
| D | 与B完全相同 | 32ch/4块 | 数据与容量共同增益 |

D_R30嵌套于D_R150，维持预注册的来源/阶段/专项混合定义，dev/final始终相同；root不足或合格状态不足时下调并报告，不复制条目凑150k。A若与C65身份完全一致可复用；任何输入/heads/数据hash改变不可借用。

先比较固定更新/状态呈现预算，另报告预设上限内充分训练的结果。仅固定epoch会同时改变大数据组更新次数，不能叫纯数据因果结论。先各1seed筛选，再给关键对照补seed；不同时加宽。

有稳定开发与实战收益后，把选中结构扩至约300k及**合格训练分区全量**。全量不是把全部2500局不分域/不留出塞进去。无收益时保留学习曲线和失败状态，不自动继续加深加数据直至偶然变好。

对其他学习家族：C65全部完成专项重训；C68若更大共同数据池证明有效，C70至少让主要可部署家族做同数据量复核，或如实声明比较的训练量不同。不能以空间模型独享更多数据来宣称架构本身更优。

## 12. C69｜条件性的学生纠错与自然价值验证

默认一轮学生访问状态纠错。选取学生实际漏重招、浪费恢复资金、占位不腾开、pending卡住或招募后立即送死的训练域状态，向合格教师查询。教师没通过复杂域时只使用可靠局部域；别让不可靠教师批量强化错误。[M01]

value仅使用自然终局同源标签。保留败方轨迹供value学习，但不自动把败方每步当policy专家。指挥官阵亡后继续对局，直到实际自然终局或诚实截断。value数据不足，先policy-only而非伪造0标签。[M02]

同预算评估S00/S10/S01/S11；value改善与棋力改善分别结论。S01/S11无效就保留S10/S00。所有对手阶段和回报视角通过真实规则测试。该步骤不能绕过C65“全部学习模型至少一次重训”的要求。

## 13. C70—C71｜最终回归与可执行交接

模型或输入在C67—C69变更后，按照影响清单重训相应家族，重跑其所有wrapper。最终候选从开发结果选择，冻结model/encoder/rules/config/split hash，再运行一次未见根矩阵。

最终建议覆盖独立正常开局和专项根、双方座位、Heuristic与可恢复旧冠军；32根×2座位×2对手=128局可作预算方案，不是32张地图或统计功效保证。主比较用根家族聚类不确定区间，地图层另报。全截断、错误hash、缺分区、缺关键遥测不能晋级。

仅当质量与对应运行环境通过，更新显式可选模型指针；默认AI仍不变。UI记录模式、指挥官当前价格、不能招募的规则理由、实际modelId与fallback，便于用户复核“有钱为什么没买”。

更新CURRENT_TRAINING_STATUS顶部：真实训练输入、模型hash、各策略表现、专项是否学会、普通对局是否退化、未完成任务、实际命令和日志。旧“全闭环通过”保留为历史并标明被本轮复核替代，不删除失败记录。

## 14. 预算：保证任务会推进，而非再次被旧建议卡死

本轮是用户新增的专项重训与扩容要求，不是上一轮重复改runId。保留历史账本；区分**用户明确硬限制**与**前版助手建议上限**。未经用户明确授权的收费/远端资源仍禁止；前版建议30k或2000查询不得无依据变成永久硬锁。

开始前profile短小基准，制定新的本地execution-budget并原子预留。必须至少为C65每个有效学习家族1fit和C66每个策略评估预留资源，然后再分配扩容/多seed/value。若用户已有更严格硬限，不能覆盖；明确资源不足也不能声明全模型完成。

建议本地封顶规划（不是要求全部用完，也不是预计交付耗时）：

| 项目 | 建议 |
|---|---|
| 正式fit | 本轮最多16；先覆盖全部登记家族，再矩阵/多seed；实际家族数超预算需如实列缺口 |
| 初始数据 | tiny≤64；流程smoke 5k—10k；专项正式约30k |
| 扩容 | 150k→300k→合格train全量，按证据逐级 |
| 每fit | 起步6epochs，最多12或冻结更新上限；统一记录状态呈现总量 |
| 新启动对局 | 建议最多1024，含采集/续局/失败/开发/消融；最终预留≤128 |
| 教师标签查询 | 建议最多10000，仅明确为生成纠错标签的查询；普通对局搜索另计 |
| 性能/故障探针 | 建议≤2000请求，重复探针不当独立棋力样本 |
| 并发 | 初始2，全局最多8且不超过实测内存/CPU承载；各Agent不可各拿一套 |
| 本地重计算窗口 | 建议累计≤28800秒；到限保存并终止作业，不留下无界后台任务 |
| 外部费用/推送 | 不允许 |

总状态呈现、候选评分次数、CPU/加速器实际时间、峰值内存和磁盘都记账。fit配额不是有意让一个模型多训练几轮的漏洞；失败/重试单列但同样核销真实资源。

旧matchSearchCalls误算成daggerLabelQueries时，追加有证据的ledger_correction，不删除历史消耗；未知保持UNKNOWN，不补0。没有浏览器不阻塞离线训练，没有可靠value不阻塞policy，没有全局教师不阻塞合格历史数据。确实不够执行全部时交付已完成的真实结果、缺口和最小下一步，不虚构训练记录。

## 15. 证据、测试与报告不能互相冒充

每任务使用四列：

```text
implementationStatus: NOT_STARTED / IN_PROGRESS / IMPLEMENTED / ALREADY_FIXED
verificationStatus: NOT_RUN / PASS / FAIL / BLOCKED_RESOURCE
qualityStatus: NOT_APPLICABLE / NOT_EVALUATED / LOCAL_SIGNAL / HOLD / QUALIFIED
runtimeStatus: NOT_APPLICABLE / NOT_RUN / PASS_IN_TESTED_ENV / FAIL
```

每条结果标来源CODE_REVIEW / HISTORICAL_REPORT / THIS_RUN_MEASUREMENT。脚本退出0、文件生成、原有单测全绿，都不能自动变成棋力QUALIFIED。所有汇总从原始JSONL计算，缺失关键数据为null/未测，不写0或PASS。

无非法、无错误费用、合法候选可区分等规则门禁可以要求100%；“必须重招募率100%”不能应用于复杂战略场景。某个wrapper依赖模型fallback赢了，不能把棋力归给未成功加载的模型。

### 建议产物树

```text
docs/training/reports/<newRunId>/
  inventory.json
  policy-model-matrix.json
  task-status.json
  rules-entrypoint-matrix.json
  commander-rule-audit.json
  commander-coverage-audit.json
  commander-baseline-matrix.json
  evaluation-protocol.json
  all-model-training-coverage.json
  all-policy-before-after.json
  capacity-data-comparison.json
  promotion-record.json
  budget.json
  budget-ledger.jsonl
  NEXT_ACTION.md
training_runs/<newRunId>/
  snapshots/
  datasets/
  manifests/
  consumed-samples/
  checkpoints/<modelId>/
  evaluations/
  telemetry/
  logs/
```

每个大工件有路径、字节数、SHA256、生成命令和所属runId。可复用已有布局，不为目录完整创建空的PASS文件。

## 16. 启动、命令与完成定义

现有基础命令（先核对依赖和项目约定）：

```sh
git branch --show-current
git rev-parse HEAD
git status --short
npm run lint
npm test
npm run build
npm run apk:skirmish-rule-report -- --check
```

APK报告如依赖本地解包资源缺失，明确BLOCKED_RESOURCE，继续不依赖APK的引擎专项回归。新commander audit/train/eval CLI须由Agent实现并测试参数后，才写成真实复现命令；本书不伪造已存在的脚本。

不要直接执行旧空间训练入口，因为其默认会覆盖src；先执行C63安全入口修复。dry-run不得真的训练或对战。普通实现不反复请求确认；重大规则冲突、明确硬预算或权限边界按实际约束处理。

**首个实质交付：能指出不招募发生在哪一层，并有真实生命周期/编码/候选回归。**

**专项完成：全部有效学习模型已经重训，全部注册策略分别验证；任何未完成对象明确列出，不能只训练空间模型便称“全部”。**

**本轮完成：专项完成后继续剩余修复，并给出有控制的扩容/加深结果或明确的未执行条件；最终按证据决定保留旧冠军、局部使用或可选升级。**

不得以“再次生成新任务书”替代执行这些任务；不得以“已经实现涨价函数”替代证明模型会正确重招募。

## 17. 固定提交证据索引

以下是本次源码核查依据；链接固定到本次HEAD。代码事实不等于已运行测试，历史数据条数不等于本轮消费数。配套JSON/scenario catalog均是待执行规格。

- **[S01] 规则配置与动态费用**：[src/game/rule_config.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/rule_config.ts)。DEFAULT_RULE_CONFIG、getUnitCost、getRecruitableUnits、canRecruitUnitClass：默认 commander 价格为空；按死亡次数涨价；单位数限制与人口分别校验。
- **[S02] SD/SO遭遇战规则**：[src/game/apk_skirmish.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/apk_skirmish.ts)。getApkSkirmishRuleConfig：SD base=400/growth=100，SO禁用指挥官招募；官方场景构造注入规则。
- **[S03] 死亡、保留等级与招募执行**：[src/game/engine.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/engine.ts)。recordCommanderDeaths/removeDeadUnits、recruit_to_castle/recruit_and_deploy：记录死亡次数与保留等级/经验、扣费及pending；终局由引擎决定。
- **[S04] 合法招募动作生成**：[src/game/rules.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/rules.ts)。getLegalActions 招募段：pending限制、城堡所有权与占位、合法兵种；不能凭有钱直接判定动作合法。
- **[S05] 裸demo初态**：[src/game/demo_map.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/demo_map.ts)。createDemoState(rules?)：无参不注入SD规则；默认规则禁用指挥官购买。
- **[S06] 空间试训数据生成**：[tools/skirmish_spatial_dataset_export.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_spatial_dataset_export.ts)。generateSpatialEpisodeSamples 使用无参createDemoState；这条路径不会生成合法指挥官重招募示范。
- **[S07] 空间短局基准**：[tools/skirmish_spatial_match_benchmark.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_spatial_match_benchmark.ts)。无参createDemoState、默认80个底层动作；seed仅记录并未传入策略RNG；Heuristic自身会调用Math.random，不能宣称对局必定确定。
- **[S08] 200回合诊断入口**：[tools/run_match_evaluation_200turns.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/run_match_evaluation_200turns.ts)。无参createDemoState；记录seed并不等于控制随机性；需要统一规则、动作/墙钟保护与终局口径。
- **[S09] 训练观察输出**：[src/game/env.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/env.ts)。Observation/getObservation含commanderDeathCount、recruitCosts、reserve等级经验及价格规则；Observation不等于可直接赋给GameState。
- **[S10] MLP状态与45维动作**：[tools/skirmish_network_features.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_network_features.ts)。encodeGameActionV2招募段包含unitClass和getUnitCost；状态层仍需审核缺席期间的死亡次数/费用/保留信息。
- **[S11] 空间状态/动作编码**：[src/game/ai/spatial_tensor_encoder.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/spatial_tensor_encoder.ts)。24维动作没有精确招募兵种/价格；空间全局量缺重招募经济链；不是证明历史样本为零。
- **[S12] 空间网络结构**：[python/spatial_resnet_model.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/python/spatial_resnet_model.py)。32通道2残差块；global进入value而不进入policy。
- **[S13] 历史归档转换**：[tools/convert_archive_to_spatial.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/convert_archive_to_spatial.ts)。PvP优先顺序截取30k、前48候选、手工重建、局部winnerAfter标签；缺完整消费/来源证明。
- **[S14] 空间训练入口**：[python/train_spatial_resnet.py](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/python/train_spatial_resnet.py)。逐状态random_split、全量JSON载入内存、默认直接部署；重训前需最小修复。
- **[S15] 启发式招募**：[src/game/ai/heuristic_ai.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/heuristic_ai.ts)。scoreRecruit已有shouldRestoreCommander、高恢复优先级和存钱逻辑；受威胁城堡防守分支在前，不能把它的每个选择当绝对最优。
- **[S16] 空间加载与单步选择**：[src/game/ai/spatial_neural_adapter.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/spatial_neural_adapter.ts)。直接argmax；加载异常会使用初始化权重；value仅显示不能当校准胜率。
- **[S17] 策略注册与旧NET_B搜索**：[src/game/ai/neural_ai_adapter.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/neural_ai_adapter.ts)。heuristic/random/net_b_s10/net_b_1ply/spatial_resnet_v1；同一NET_B权重可用于多个策略。
- **[S18] Auto真实调用**：[src/game/ai/play.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/ai/play.ts)。同步getAiAction、200底层动作保护；需后续Worker接入及终止原因展示。
- **[S19] 默认应用初态**：[src/game/default_state.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/src/game/default_state.ts)。应用默认通过官方遭遇战地图构造；不能把裸demo缺陷直接归因于用户界面每一局。
- **[S20] 评估与晋级**：[tools/skirmish_evaluation_core.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_evaluation_core.ts)。已有纯函数但部分缺失证据可漏检；本轮必须缺字段拒绝资格。
- **[S21] 训练状态与历史资产**：[docs/training/CURRENT_TRAINING_STATUS.md](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/docs/training/CURRENT_TRAINING_STATUS.md)。2500局/977737条为历史资产记录；不等于当前checkpoint的实际训练量。
- **[S22] 已有规则报告**：[tools/apk_skirmish_rule_report.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/apk_skirmish_rule_report.ts)。规则报告源包含SD commander基础费400、population=0；复用对应项目探针并补专项反例。
- **[S23] 搜索教师**：[tools/skirmish_search_teacher.ts](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/tools/skirmish_search_teacher.ts)。候选粗筛/配额/回应搜索需实际trace证明指挥官候选的去向。
- **[S24] 基础命令**：[package.json](https://github.com/TatsukiKiruma/AncinetEmpires/blob/a0a9dcdd483cb951a72734805504c947176d5d79/package.json)。npm run lint、npm test、npm run build及apk:skirmish-rule-report是现有脚本。
- **[M01] Ross, Gordon & Bagnell (2011)**：[DAgger原论文页面](https://proceedings.mlr.press/v15/ross11a)。支持学生访问状态纠错思路，不保证当前教师的棋力。
- **[M02] Farama Foundation**：[Terminated/Truncated说明](https://farama.org/Gymnasium-Terminated-Truncated-Step-API)。自然终局与外部保护截断必须区分；本项目仍按自己的引擎接口实现。
