# V13 Agent 任务书：把空间AI训练接成可验证的棋力改进闭环

**版本：审查建议稿，2026-09-24。这里的 V13 是本次建议的下一轮工作编号，不代表仓库已有V13实现。**  
**仓库：`TatsukiKiruma/AncinetEmpires`**  
**审查分支：`path-b-spatial-ai`**  
**审查提交：`b8c0c24312a551a3cf20802f820e3f1edf798395`**  
**首先阅读：`V13_REVIEW.md`；证据索引：`evidence_manifest.json`。**

## A. 任务目标与禁止事项

目标不是增加版本号、生成更多报告或让训练loss更漂亮，而是得到**可追溯、可复现、在相同条件下比现有AI更好的候选策略**。本轮先修可信度，再完成一次真正的有界训练小实验。没有经过强度验证的候选不替换生产AI。

保留HeuristicAI基线；不得为了胜率改游戏规则、地图资源、合法动作、终局条件或对手强度。不得覆盖历史模型、历史失败结果或其他agent工作；不得默认push、上传、购入算力或改生产默认策略。不要把未执行的计划当成已执行成果，不要把Git blob ID写成文件SHA-256。

读取实际本地HEAD与未提交修改。HEAD与审查提交不同，就生成delta清单后针对当前源码确认问题；**不得为了匹配任务书强行reset用户代码**。缺少原始地图、数据或权限时，报告具体阻塞，并继续不依赖该资源的任务，不虚构重放或训练成功。

### 本轮自动推进规则

通过前置门槛后，继续执行已授权的本地有界任务，不在每一步都请求重复确认。先检查项目已有预算与运行配置；没有更宽授权时采用下述建议硬上限。它们是**停止上限，不是耗时预测或棋力保证**：

| 资源 | 第一轮闭环建议上限 |
|---|---|
| 新归档重放/新采集root | 最多64个独立初始root；已有可信空间数据可复用 |
| 新的搜索标签 | 最多2,048个决策点，每root最多32个；先跑128个并检查质量 |
| 新训练 | 最多4个短运行；每运行最多8 epochs且最多12,000次optimizer更新，先小拟合测试 |
| 开发对战 | 第一批总计不超过64场实际执行比赛；镜像缓存复用；后续扩测单列预算 |
| 总体本地计算 | 在项目既有授权范围内；无既有预算时，默认累计墙钟不超过2小时，任务可断点续跑 |
| 内存 | 启动前探测可用内存，保留系统余量；禁止预载预计超过可用内存的数据 |

达到上限立即落盘实际进度与续跑命令，标记`BUDGET_EXHAUSTED`；不把剩余任务写成完成。完整确认矩阵、全部1395归档重放、大规模RL与付费训练不在这份默认小实验授权内。

## B. 执行顺序、角色与文件所有权

```
T13-00 冻结与差异检查
  ├─ T13-01 训练器修复
  ├─ T13-02 评测与模型身份契约
  └─ T13-03 数据身份与教师来源
       ↓
T13-04 候选/编码/跨语言一致性
       ↓
T13-05 同协议评测现有权重
       ↓
T13-06 搜索教师资格与统一内核
       ↓
T13-07 小规模真实训练（明确教师的CE基线必须完成；搜索标签不合格时不训搜索ranker）
       ↓
T13-08 学生状态上的DAgger/等工作量消融（预算与教师合格后）
       ├─ T13-09 价值头（条件分支，不抢主线资源）
       └─ T13-10 冻结候选与浏览器验收（强度达标后）
```

建议一个主控、三个子agent。训练子agent独占`python/train_spatial_resnet.py`及Python测试；评测子agent独占新的`v13/tools/eval_*`与结果汇总；数据/教师子agent独占转换与搜索标签工具。`src/game/ai/shared_*`、编码器、适配器、注册表由主控协调合并，不允许多个agent同时修改同一核心文件。

所有新输出写到 `v13/out/<runId>/<taskId>/` 或 `v13/models/<runId>/`。这些是**建议新建路径**。每个输出拥有唯一写入者。调用历史工具时显式覆盖输出目录；不得落回`v10/out`、`v11/out`、`v12/out`默认目录。禁止一边训练写checkpoint，一边评测读取同名未完成文件；采用临时文件＋完成后原子重命名。

## C. 统一验收与统计口径

### C1. 不可缺少的五道门

| 门 | 通过条件 | 未通过时禁止事项 |
|---|---|---|
| G0 可追溯 | HEAD/dirty diff、数据/权重真实SHA、实际运行命令与环境完整 | 不解释强度变化来自模型 |
| G1 数值与契约 | 掩码测试、loss账本、候选/编码一致性、有效标签索引、数据分区均通过 | 不启动正式训练扩量 |
| G2 评测有效 | 同策略同配置全轨迹一致、全座位、独立seed分区、终局原因与错误分开 | 不宣布模型更强/更弱的广泛结论 |
| G3 学习有用 | 至少完成明确教师的真实训练；held-out动作指标有效；搜索ranker还须教师合格 | 不扩展无效标签、不把工程修复当学习收益 |
| G4 放行 | 冻结确认集上的实战改进与延迟/故障约束同时通过 | 不自动改生产模型 |

源码自检不是棋力验收；一图两seed不是确认实验；达到99%小集合训练准确率也不是泛化证明。

### C2. 对战结果与统计单位

每局必须记录`NATURAL_WIN / NATURAL_LOSS / NATURAL_DRAW / STEP_LIMIT / TURN_LIMIT / WALL_TIMEOUT / CANCELLED / ENGINE_ERROR / POLICY_ERROR`之一。按引擎实际语义识别终局，不能简单用`winner===null`当成统一截断，也不能把异常当平局。

主要报告自然胜局、自然负局、自然平局、未决和错误的原始计数。若存在未决，公布总计划局数、已执行局数、自然结束局数、完整配对数与缺失原因。未决不是自然负局；同时给出“未决全不胜/全胜”的胜率上下界，不能只删掉失败/超时后展示漂亮的条件胜率。真实自然平局单列，是否另算0.5分必须预先规定，不能混入胜率定义。

候选与参考策略按相同 `(map, setup, initialSeed, seat)` 匹配。多人数地图遍历实际玩家座位/联盟，不硬编码2人；同一初始root下的换座位、变体和多个候选共享依赖关系。镜像可重复验证确定性，但不能把相同镜像重复计为独立样本。

不直接合并2人和4人的原始胜率作为单一“总棋力”。报告每图每座位结果，并以预声明地图权重汇总候选减基准的配对差值。置信区间按初始root/seed区组重采样；地图数较少时，明确结论只覆盖被测地图。若评估跨地图泛化，需要独立的地图族留出。

第一批是开发试验，不承担显著性保证。扩测样本量用pilot的独立区组方差估算，不能把“2,522个决策标签”当成证明胜率提升5pp所需的独立比赛数。开发集选候选，冻结确认集只用于预先指定候选；禁止在确认集上挑最佳seed或不停改门槛。

建议放行目标：确认集配对自然胜率增量的单侧95%置信下界大于0；同时无技术错误、完整报告未决，并满足预声明的截断上限和关键场景非劣要求。这里是建议验收政策，不是现有项目已经达到的结果。样本不足时结论写`INCONCLUSIVE`而不是“基本通过”。

### C3. 每场比赛的最小记录

```json
{
  "runId": "...",
  "codeCommit": "...",
  "dirtyDiffSha256": null,
  "engineRulesHash": "...",
  "mapHash": "...",
  "baseRootId": "...",
  "seed": 0,
  "seat": 0,
  "allianceId": "...",
  "requestedPolicyId": "...",
  "actualPolicyId": "...",
  "checkpointSha256": "...",
  "encoderSchema": "...",
  "candidateSchema": "...",
  "teacherKernelVersion": null,
  "outcomeKind": "NATURAL_WIN",
  "winnerPlayerId": null,
  "winnerAllianceId": null,
  "steps": 0,
  "turns": 0,
  "fallbackCount": 0,
  "deadlineMissCount": 0,
  "engineTransitions": 0,
  "trajectoryDigest": "..."
}
```

这是待实现的字段示意，不能把占位符当真实证据。实际winner字段类型和联盟解析必须以引擎定义为准。

---

## T13-00｜冻结现状与更正结论索引

**优先级：P0。依赖：无。**

输入：当前本地HEAD、`V13_REVIEW.md`、V12两份报告、`src/game/ai/models/model_registry.json`、`v12/models/`。

执行：记录当前commit、分支、dirty diff和已存在工件；计算实际本地文件SHA-256，建立训练run→数据→split→best/last权重→评测→UI的引用链。检查任务书中的缺陷是否已被新提交修复，已修复项写`ALREADY_FIXED`并附测试，而不是重复修改。

把审查中列出的撤回/纠正写入新`claim_ledger.json`：每条包括原陈述、出处、当前判定、理由、需要的新证据。尤其包括镜像重复数、价值标签熵、混合教师、数据扩容比较和17/20原始记录缺失。保留原报告不覆盖，只新增更正索引。

产物：`source_snapshot.json`、`artifact_identity.json`、`claim_ledger.json`、`delta_since_review.md`。验收：任何“当前最好模型”都能解析到唯一真实权重摘要；不存在把计划消费清单当训练完成证明的条目。

## T13-01｜修复训练器与最小反例回归

**优先级：P0。依赖：T13-00。**

修改范围：`python/train_spatial_resnet.py`及其测试。不要同时更换网络架构、标签与优化器，避免把修复和训练方案混在一起。

执行要求：

- train/val指标统一在一个位置累计，按明确的样本/有效标签权重归一；最后不满batch、epoch上限、global-update-limit提前结束均正确。梯度每有效batch只更新一次。
- `val_pred`与`val_target`使用同一索引集合，强制shape相同；`None`、mask=false、全mask、混合mask均测试。策略损失和准确率只对有效策略标签计分。全监督为空的batch不凭空记为有效学习。
- 显式传入的split/init文件不存在立即失败。没有真实root/episode身份的正式数据不许回退到`ep_{idx//60}`；仅历史诊断可显式开启legacy模式，并在结果中打水印。
- 分离`split_seed`、`model_seed`和`data_order_seed`；正式对照使用同一冻结manifest。拒绝train/val/test根族交集、未知root、冲突sampleId和非有限标签。
- 旧`consumed_manifest`改成明确的planned兼容输出，或停用；训练消费证据只来自成功optimizer更新后的记录。保存optimizer/scheduler/RNG用于真实resume，JSON部署权重与训练resume工件分别管理。
- 对soft/equiv模式明确目标公式；不要宣称“接受所有等价动作”，同时又用硬CE持续惩罚非单一标签。未经引擎验证的“同类型动作”不得归入等价组。

必须新增反例：`[+1,-1]`＋`[true,false]`掩码；2预测/3target报错的旧形状；loss `[1,2,3]`的均值；缺失split路径；重复sampleId对应不同stateHash；相同固定split下不同model seed；所有mask均false；global cap跨epoch。

验收：测试能使旧缺陷版本失败、修复后通过；训练器不再静默更改实验设置。附带`review_reproductions.py`只作反例说明，必须把测试接进真实训练代码，而不是另写一份永远自洽的玩具实现。

产物：`trainer_regression.json`、测试代码、实际运行日志、`trainer_fix_notes.md`。本任务不宣称棋力提高。

## T13-02｜建立配对评测v3与真实模型身份

**优先级：P0。依赖：T13-00。**

复用并修正`v12/tools/eval_paired_seats.ts`的思路，在新路径实现正式入口，不继续让所有脚本各有一套协议。

1. 运行前计算实际载入文件SHA-256，连同编码/候选schema传入推理上下文。修复`setDefaultSpatialWeights`或自定义predictor注入后的身份来源，严禁继续把旧registry SHA附在新权重决策上。结果必须记录请求策略与实际策略。
2. 所有策略与可能存在的环境随机流明确分离；记录种子派生方式。正式评测禁止默认Math.random。避免让seat奇偶、策略分配与seed选择成为同一个变量。
3. 每个`map/setup/seed`的全heuristic镜像只计算一次并缓存，多个seat引用相同mirrorId。再次重跑只用于确定性验证，不增加独立样本数。
4. 同策略自检比较逐步动作与状态摘要、终局、步数，而不仅是delta=0。增加故障注入：换一份权重、故意非法动作、触发超时/步数上限、取消、引擎异常，分类与身份都必须正确。
5. 依据实际玩家与联盟遍历座位，检查winner表示的是player还是alliance。保存完整轨迹或可重放动作序列；正式强度评测禁静默fallback。若产品模式允许fallback，要单独作为混合策略评测，报告触发率。
6. 分出`dev_seen_roots`、`dev_heldout_seeds`和`confirmation`。使用新seed本身不是协议缺陷；同源变体与同一地图家族的划分需要遵守预声明泛化目标。
7. 记录冷/热启动延迟、p50/p95/p99、deadlineMiss、搜索转移数和完整端到端耗时；旧代码的同步`deadlineMs`只是事后标志，不能当硬截止保证。

产物：新评测入口及测试、`eval_protocol_v3.json`、`eval_selftest.json`、`checkpoint_identity_selftest.json`、冻结manifest。验收：G2通过，错误/截断不会被伪装成胜负改善；实际权重与遥测hash一致。

## T13-03｜数据v3：身份、来源与终局标签分离

**优先级：P0。依赖：T13-00。**

输入：现有空间池及可访问的原始dataset/episode摘要。不要默认重放所有1395局。先从不同地图、局长、阶段选择小批次，单独记录可访问/不可访问的源。

新增或恢复：

```text
sampleId = hash(sourceArchiveId, episodeId, step, subjectPlayer, schemaVersion)
baseRootId / rootFamilyId / episodeId / parentVariantId
stateHash / initialStateHash / rulesHash / mapHash
behaviorPolicyId / behaviorCheckpointHash
labelTeacherId / teacherKernelVersion / teacherBudget / labelProvenance
legalActionCodes / candidateActionCodes / targetActionCode / targetActionIndex
encoderSchema / candidateSchema
outcomeKind / naturalWinner / adjudicatedWinner / outcomeLabelSource
policyLossMask / valueLossMask / replayVerificationLevel
```

episode由分支、扰动或DAgger派生时，保留祖先baseRoot用于分区，不能换个sampleId就进验证集。sampleId不得依赖输出行序号。训练输入只含预测时可用的信息；终局胜者、教师Q、teacher action等是标签/元数据，不能泄漏进棋盘特征。

把`behaviorPolicyId`与`labelTeacherId`分开。首先恢复“谁给标签”；可以按原始policy字段筛选，也可以在同一合法状态重标注，不因一局有两个策略就整局报废。首个明确教师基线不按胜负筛选训练行。

对7局终局标签缺失：通过可信episode摘要、玩家/联盟映射与重放检查修复。不把`adjudicatedWinner`填进`naturalWinner`。未终局value保持mask=false，裁定目标如需研究单独命名。给出修复前后覆盖率、独立自然终局数与独立玩家轨迹数；不能把`H(label|episode,player)=0`当作标签无用的证据。

增强重放核验：初始与关键步比较规范化完整状态，包括经济、单位状态、pending、规则、当前玩家；没有原始逐步state hash时，明确可验证字段和不可验证部分。`PASS`不升级为没有证据支持的“全内部状态一致”。

存储方面，现有Python加载器一次性读取全部JSONL；扩量前估算张量、候选和Python对象内存。优先只物化被抽样的决策点，采用分片/索引/内存映射或流式读取；不要将九百多万步全部展开为巨型JSON浮点张量再读进内存。

产物：`dataset_v3_manifest.json`、`teacher_mix_audit.json`、`outcome_repair_report.json`、`lineage_split_check.json`及小规模v3数据。验收：身份稳定、来源可追溯、分区无祖先泄漏、错误数据隔离、无猜测终局。

## T13-04｜统一候选与编码契约，做真正小集合拟合

**优先级：P0。依赖：T13-01、T13-03；与T13-02完成后联调。**

第一选择是在小规模训练/验证中用全合法候选，trunk仅计算一次、候选分块打分以控制内存。若性能需要筛选，建立训练/推理共享、**不依赖正确标签**的候选选择器；采用启发式排序、动作类型覆盖及明确危急动作保留规则，并记录版本。

教师动作未进入共享候选时，不许悄悄插入后把coverage写成100%。先记录选择器原始teacher recall及缺失类型，再修选择器，或把该行政策标签标为不可监督；正式报告同时给出未过滤总体的覆盖率。对关键动作的低覆盖不能靠删除困难状态掩盖。

记录并测试：合法动作总数、候选数、各类型保留率、教师动作覆盖、指挥官救援/重招募/占领动作覆盖；同一状态全候选与受限候选的预测差异；正确actionCode解码再编码一致；target索引必须在成功解码后确定。

至少构造128个干净、互异、可追溯的诊断状态。先做特征碰撞与等价动作检查，再用固定标签测试是否可拟合至约99%的等价动作训练准确率。该值是诊断目标，不是强度门槛；无法达到时先定位不可区分动作、状态缺失、标签噪声、维度/权重导出错误，不直接无限加epoch。

跨语言测试同一权重与状态的tensor、global、candidate semantics、logits、value、argmax；预声明数值容差并报告最大误差。近似tie单独分析，不能把真实不同动作都判成浮点误差。候选置换后相应logits应一致，tie-break用稳定actionCode规则。

编码审计专门覆盖：超过20×20地图应显式拒绝或采用声明过的扩展，不能静默裁掉；不同敌方身份/轮次；状态效果；单位类别别名；实际可达攻击与简化曼哈顿威胁之间的差别。只有证明信息冲突后再补schema，不一次改几十通道。

产物：`candidate_contract.json`、`candidate_coverage.json`、`encoding_collision_cases.json`、`python_ts_parity.json`、`tiny_fit_metrics.json`。验收：G1通过；输出中能指出还未支持的地图/模式，而不是静默运行。

## T13-05｜同一协议重测已经存在的模型

**优先级：P1。依赖：T13-02、T13-04。**

必须建立模型清单，不能只测方便加载的一份：

| 优先顺序 | 真实候选 | 目的 |
|---|---|---|
| 基准 | 当前HeuristicAI镜像 | 座位基线与确定性控制 |
| 第一批 | 当前src实际载入的`spatial_resnet_v2_checkpoint.json` | 判断用户能用到的网络到底是什么 |
| 第一批 | `v12/models/budget_s42.json` | 对齐已有配对负结果 |
| 第一批 | `v12/models/v2_honest_s42.json` | 测修正后全量池真正的候选 |
| 扩测 | `v12/models/v2_honest_s42_last.json` | best/last的强度与离线准确率差别 |
| 扩测 | `v12/models/budget_s1337.json`、`budget_s2026.json` | 训练随机性与旧切分效应 |
| 扩测 | `v12/models/diag_grouped_s42.json` | 旧30k真实分组诊断对照 |

第一批建议一张2人图和Crossroads四人图，各两个未用于训练的合法seed、全部实际座位，按预算分批；先验证地图可加载且自然结束比例足够。这个规模只是开发方向读数，不能宣称普遍棋力。若当前环境不支持某模式，缩小并明确适用范围，不冒称覆盖全游戏。

正式关闭fallback。记录每种候选的hash、结果分布、完整配对、关键战术错误、招募机会条件下的行为、延迟和截断。条件行为统计可以帮助定位，不当成因果结论。用同状态回放比较“网络犯了什么错”，不要只看整局动作类型边际比例。

产物：`existing_checkpoint_matrix.jsonl`、`existing_checkpoint_summary.md`、失败重放最小案例。验收：至少实际测了当前src权重、budget_s42与修正池best；其余未跑项明确为planned，不伪造全面矩阵。现有网络全弱不阻止T13-07的明确教师小实验，反而提供基线。

## T13-06｜把搜索代理变成可检验的教师

**优先级：P1。依赖：T13-02、T13-04。**

输入：`src/game/ai/battle_search_ai.ts`、`v12/tools/search_labels.ts`、V11/V12可验证的残局或新采样训练状态。不要把只有console的17/20当作教师资格证书。

### 统一内核

运行策略和标签工具共用同一个候选评估内核。显式传入状态、主体玩家/联盟、candidate actionCode、搜索预算、固定RNG配置；固定配置重复运行以及候选重排，按actionCode对齐的结果都要稳定。优先用`hash(stateHash, actionCode, rolloutReplicate, kernelVersion)`派生随机流，而不是候选序号。用于动作比较的随机续局可设计共同随机数，但必须说明环境/策略的流如何配对，并避免把RNG消耗顺序当作策略效果。

记录实际搜索的候选数、节点/转移数、friendly atomic actions、是否抵达己方回合边界、是否探测敌方有效行动，以及截断原因。不要再把“走3个原子动作后静态评估”统称完整maximin。先在2人局解决回合边界，再对多人局显式定义下一位敌人、同盟行动与多敌方效用；不默认把所有人当一个零和对手。

候选生成包含基准动作以及经验证的战术候选，不仅按合法动作前缀取前K；对手回应同理。保留预算上限，不能为了穷尽一个大回合失去终止性。使用状态缓存时key包含规则、当前玩家、pending、单位状态与预算相关信息，不能只hash棋盘图像。

### 教师资格测试

构造至少包含以下类别的回归集：立即取胜；避免指挥官可防止的死亡；移动后攻击/占领；远程单位最小射程与反击；城堡/部署/pending；招募与保留经济的可区分选择；结束回合的明显时机；多人局下一行动者威胁。夹具使用真实引擎，不改规则以迎合策略。

小局面用更充分的枚举或明确可证明的终局作参考。一般中盘的深搜索也只是更强代理，标签必须写`PROXY`，不能写成“最优Q”或“真实胜率”。至少对一批标签做增加预算/不同续局seed的稳定性检查，以及从候选动作后继续到自然结局的校验。代理改善和胜率改善分别报告。

比较三种预算：HeuristicAI；相同部署预算的有界搜索；更充分但仅离线使用的教师。任何“神经网络增益”消融必须在同一搜索预算下比较；不同预算的教师优势不能算网络学习成果。

线上搜索若要进入产品候选，必须使用可取消worker或明确硬预算，保留合法基准动作作为超时返回值。保守阈值或fallback只减少风险，**不保证棋力不低于启发式**。

产物：`teacher_kernel_contract.json`、`teacher_invariance_tests.json`、`teacher_tactical_suite.json`、`teacher_budget_comparison.jsonl`、`teacher_qualification.md`。

验收：关键确定性和合法性测试全部通过；已知必胜/必救残局不得因预算语义错误系统性漏判；教师在独立开发局面的优势有真实证据。证据不足标`PROVISIONAL`或`UNQUALIFIED`，后者禁止T13-07搜索ranker支路，但不禁止明确Heuristic教师的CE诊断基线。

## T13-07｜完成分布一致的小规模真实训练

**优先级：P1，主线交付。依赖：T13-01—05；搜索支路另依赖T13-06资格。**

不要让这一轮再次只完成审计。先在通过G1/G2后跑一个明确教师的训练小实验；所有计划行、实际优化行、best/last权重与评测都落盘。

### 采样与标签

固定训练/验证/确认分区，按baseRoot分组，训练采样按地图、人数、阶段和关键动作机会分层。每root每阶段限额，避免长局覆盖整个池。验证集独立固定，不能为了凑相同行数重新切分。地图变体、镜像或同源DAgger状态留在同一祖先分区。

可从32—64个训练root起步，总计512—2,048个带完整候选与状态身份的重点决策；具体数值是pilot规模，不是“足够训强AI”的保证。使用已有可信空间池时先恢复来源与候选，不声称重新生成了独立游戏。

为每个状态记录基准动作、教师候选排序、标签是否是确切终局或代理、搜索预算及所有候选分数。**保留基准已经最好的状态和坏替代动作**，否则门控只学到“总该覆盖基准”。不因best-minus-baseline=0就把整条记录删除。

旧标签池和空间池root完全不相交时，禁止按行号/最近坐标拼接。可以从旧标签的可信原始状态重新编码，也可以在目标空间分布重新标注；若跨人数/地图，明确这是域迁移而非同分布训练。

### 一次只改一项的实验顺序

| 臂 | 固定内容 | 本臂变化 | 解释目标 |
|---|---|---|---|
| B0 | 共同状态集、候选、split、更新预算，2残差块 | 明确Heuristic教师的CE策略基线 | 能否学会指定教师，不再混合标签 |
| B1 | 与B0相同 | 已有`global_policy_pool`开关 | 全局棋盘摘要是否改善远端决策 |
| B2 | 固定前一阶段选定架构及共同状态 | 合格搜索教师的soft排序/成对排序 | 搜索信号是否被网络学到；必须加同状态标签对照 |
| B3 | 固定架构、更新总数与训练样本呈现次数 | 加学生状态纠错，替换等量旧样本 | DAgger数据是否有增益，而非单纯多训练 |

默认资源下优先B0，再执行一个有明确意义的扩展；不要为了填满四臂而用未合格教师。三次不同初始化的正式重复应在固定split与相同预算下进行，预算不足就报告尚未重复，不能把不同验证集的旧三seed替代新对照。

B2不直接把量级可达数千的原始ΔQ与网络logit或启发式分数相加。可采用同一状态内的softmax教师分布，温度/尺度仅在训练分区确定；或只对超过教师噪声阈值的候选对做排序。记录负ΔQ候选、基准最好状态和不确定tie；增加等价组损失时遵守T13-01的真实语义。

如果搜索在很多动作上给出不同数字，但大预算或自然结局验证不支持其排序，停止B2，修教师或降权这类代理，不继续扩量。低Spearman相关只说明不同/噪声也可能更大，不证明有价值信息。

### 训练与评测记录

启动时探测真实设备、PyTorch版本、可用后端、线程和内存；不预设AMD显卡一定可用某个训练后端，也不擅自重装驱动。保留机器环境信息以便解释预算差异。

数据manifest、split、配置和初始权重hash先冻结；记录optimizer实际更新数、有效策略/价值监督数、unique sample/unique root、各类型曝光数。保留best及last，不按验证准确率自动复制到src。正式比较保留固定样本呈现次数或固定更新数，并同时报告wall time与搜索转移数。

离线指标：全候选top1/等价组准确率、每类型/阶段/合法候选数分桶、关键场景错误率、仅有可信教师Q时的归一化后悔值。实战指标：按T13-02协议，不把精确复制标签与赢棋混为一谈。

产物：训练数据小分片及manifest、配置、实际消费ledger、best/last权重、真实训练日志、`pilot_training_report.md`、配对对战原始记录。验收：至少B0真实训练及评测完成；扩展臂的收益能归因于单个变化，或给出明确负结果和失败实例。不得只产出“下次训练建议”。

## T13-08｜学生访问状态上的DAgger与网络增益消融

**优先级：P2。依赖：T13-07；合格且可调用的标签教师。**

学生在训练分区进行真实rollout；查询教师给学生遇到的状态标签，不只重复导出原教师轨迹。优先查询分歧、指挥官危险、经济机会、阶段转折，但同时保留一定未筛选随机状态以测量选择偏差。测试/确认对局中发现的问题不得反灌训练后还继续把同一集合叫确认集。

明确采集策略：teacher/student混合概率、是否采用教师动作继续走、每root采样上限、教师预算以及随机流。保留`behaviorPolicyId=student`、`labelTeacherId=...`。纠错样本入池后，用optimizer账本验证它们确实被消费；“写进计划manifest”不算执行。

最小对照：原训练集继续训练的B-control，与原集＋纠错状态的B-dagger，初始权重相同、优化更新数/曝光数相同、split相同，checkpoint hash不同。禁止拿相同checkpoint对比并宣称DAgger零收益。

部署形态消融：纯学生网络；基准heuristic；相同预算的搜索；同搜索＋网络；可选同搜索＋置零/无信息网络控制。没有有效网络时的输出和预算必须可核对，确保优势不是更长搜索、不同候选覆盖或fallback偷换策略。

产物：`dagger_collection.jsonl`、`dagger_consumption_audit.json`、`equal_work_controls.json`、`learning_ablation.jsonl`、失败重放。验收：学习臂与控制臂身份不同且等工作量；收益只在开发集出现、确认集未测时必须明确标注。

## T13-09｜价值头：仅在标签与校准满足条件后启动

**优先级：P2，条件分支；不得挤占策略主线。依赖：T13-01、T13-03、T13-07。**

自然终局回报广播到同一玩家轨迹是允许的；`H(Y|episode,player)=0`不是停止理由。价值目标必须明确是“在何种后续策略下、从当前状态达到何种自然结果的预测”。行为策略混合时记录策略条件或承认估计的是混合分布，不宣称最优价值。

未自然终局样本不默认填0，不与兵力裁定混用。需要时间截断bootstrap时，单独设计方法和掩码，不能拿未经资格验证的随机value head当参考。按root/玩家轨迹适当加权，避免胜者行动次数多造成+1行占比支配。

固定held-out roots，比较常数预测器、仅赛前配置/座位预测器、仅经济/兵力基线与完整棋盘value。报告MSE/Brier、校准分桶、按地图/座位/阶段的误差及标签覆盖。通过验证之前保持`valueHeadQualified=false`，不显示成胜率、不接入搜索价值。

产物：`value_target_contract.json`、`value_baseline_comparison.json`、`value_calibration.json`。若没有足够独立自然终局或预算，状态写`DEFERRED_WITH_REASON`；不伪称“标签数学上无法学习”。

## T13-10｜冻结候选、浏览器一致性与最终交付

**优先级：P2。依赖：有足够开发证据的候选。**

在开发阶段选定候选后冻结：code/data/split/weights/encoder/candidate/search config/latency预算。确认集开始后不再改任何一项；改动即新候选，新确认安排，保留旧结果。

实际浏览器通过可取消worker运行候选，与Node评测对同一状态的动作、身份与数值结果比较；记录冷/热启动p50/p95/p99、deadlineMiss、取消和fallback。慢教师不直接作为1秒在线策略，除非实现有界/可中断版本并重新测速。测试worker是否真正收到注入的新权重，不能仅验证主线程cache。

默认生产HeuristicAI保持不动。若达到G4，生成可供用户审阅的部署候选manifest与回滚说明；**不在未授权时修改production默认项**。若未达到G4，明确列出最强已测候选、证据适用范围与未通过项。

最终包至少包含：

```text
v13/out/<runId>/
  final_summary.md
  task_status.json
  source_snapshot.json
  artifact_identity.json
  protocol_and_splits/
  tests/
  data_manifests/
  training_runs/
  match_results/
  failure_replays/
  reproduction_commands.md
  promotion_decision.json
v13/models/<runId>/
  <candidate>_best.json
  <candidate>_last.json
```

这些是建议交付路径；不必为未运行的阶段创建假内容。状态只使用`DONE / FAILED / BLOCKED / DEFERRED / INCONCLUSIVE / BUDGET_EXHAUSTED`并给证据。没有新模型时不能写“训练完成”；没有确认评测时不能写“已达到强AI”。

## D. 可用命令与环境注意

以下命令对应已读取的现有路径，均需在真实仓库根目录与已安装依赖环境执行。本审查没有运行它们，不把它们列为通过测试。

```bash
git rev-parse HEAD
git status --short
npm run lint
npm test
```

`package.json`中的test本身已经是`vitest run`，无需再追加重复run参数。V11专用回归配置也存在，但覆盖范围不能代替新增V13测试：

```bash
npx --no-install vitest run --config vitest.v11.config.mjs
```

历史V12配对入口可用来重现旧协议行为，不作为修复后正式协议的替代。用新的输出路径，场景名须带引号：

```bash
node --openssl-legacy-provider v12/tools/run-tool.mjs v12/tools/eval_paired_seats.ts --candidate heuristic --scenario "SDPLAN:sd-normal:(4) Crossroads.aem" --seeds 2026070501,2026070502 --seats 0,1,2,3 --max-steps 20000 --out v13/out/<runId>/legacy_protocol_reproduction.json
```

其中`<runId>`必须替换为本轮真实ID。此命令用历史归档seed，只是回归重现，不是独立确认。

Node地图工具需要真实可用的`APK/_analysis/unpack`和`training_configs/sd_training_plan_20260705.json`。历史报告说明`.aem`解密依赖OpenSSL legacy provider；缺少地图/配置就报告环境阻塞，不能私自构造不同起始状态替代。Windows沙箱的spawn限制如需已有shim，先读实际loader，不盲目复制历史启动参数。

修复后的训练CLI示例应由执行agent按真实新增参数输出。不要把这里提出但尚未实现的`split_seed`、新eval入口或新schema说成现有命令。训练前先运行CLI `--help`和小夹具，确保配置被实际解析。

## E. 最终总结必须回答的七个问题

1. 当前实际被测和被浏览器加载的是哪份权重？真实SHA是什么？
2. 当前候选与修复前基准相比，哪些改变来自工程修复，哪些来自新增学习？
3. 真正优化过多少unique state、多少独立root、多少教师/学生状态？
4. 哪些对局自然结束，哪些截断/报错，统计独立单位是什么？
5. 修正全量池模型、明确教师基线、搜索蒸馏和DAgger分别表现如何？未执行项是否清楚分开？
6. 有无跨地图/座位/阶段退化？线上延迟与实际fallback是否满足约束？
7. 下一步应扩大哪一种已经证明有用的资源，或停止哪条被有效实验否定的支路？

不要再用“更多训练”“更多数据”“更大模型”替代以上回答。

## F. 取证与方法来源

所有仓库事实见配套`V13_REVIEW.md`和`evidence_manifest.json`，其中URL固定到审查提交。优先读取：

- `python/train_spatial_resnet.py`：损失、掩码、split、manifest与设备选择。
- `tools/convert_archive_to_spatial.ts`、`src/game/ai/shared_spatial_policy.ts`：训练/推理候选差异。
- `src/game/ai/spatial_neural_adapter.ts`、`models/model_registry.json`：真实模型身份与部署。
- `v12/tools/eval_paired_seats.ts`及`paired_budget_s42.json`：镜像、seed、座位与当前原始读数。
- `src/game/ai/battle_search_ai.ts`、`v12/tools/search_labels.ts`：搜索回合语义、候选预算、RNG及代理标签。

方法依据为DAgger与Expert Iteration的原始研究，不把它们当本项目已达成效果的证据：

Ross, Gordon & Bagnell (2011), https://proceedings.mlr.press/v15/ross11a.html  
Anthony, Tian & Barber (2017), https://arxiv.org/abs/1705.08439
