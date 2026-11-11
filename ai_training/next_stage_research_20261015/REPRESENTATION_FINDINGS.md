# 表示、推理合同与搜索预算核查

核查日期：2026-10-15（北京时间）。本文件为下一阶段研究的子专题证据。已读根 AGENTS.md、训练区 AGENTS.md、README.md、status/CURRENT.md，检查工作区状态。除本研究目录新增脚本、统计和报告外，不修改任何文件；不训练、不推进对局、不操作手机。

以下源码路径相对仓库根。结论区分已核实、代码推断、建议和待验证。

## 1. 规则和运行路径身份

**已核实：**逐条比较 R8 `identity/manifest.json` 中全部公共 `src` 条目的 sourceSha256 与当前文件，30/30 完全相同，含 engine/rules/env/types/abilities、APK地图、spatial encoder/conv、heuristic。因此本次不能笼统把 R8 判为过时规则。源码相同也不代表全部原生 APK 规则均已验收。

**已核实：**R8 manifest 不含当前 `shared_spatial_policy.ts`、`action_ordering.ts`、`neural_ai_adapter.ts` 等应用入口；研究 worker 与应用入口存在候选顺序和投降过滤差异。历史 Python/TS parity 只覆盖各自冻结执行路径。

复核方法：读取 manifest.files，逐个对 `source` 当前文件计算 SHA-256，与 `sourceSha256` 比较；未修改冻结快照。该身份观察时间先于本报告，不替代后续开训前再次冻结。

## 2. 实际模型和输入

`src/game/ai/spatial_tensor_encoder.ts:43–164` 定义多个 schema，默认常量仍为 V15 的26通道；V19显式为34通道。实际权重决定所用 schema，不能由默认常量推断实际运行模型。

**已核实：**R8 `checkpoints/r1_warm/best.json` 实读为：

|项目|值|
|---|---|
|架构|spatial_resnet_32ch_2res|
|schema|spatial34_global20_actionSemantics53_v19|
|空间输入|34×20×20|
|全局输入|20|
|候选语义|53，另有actor/landing/target三坐标|
|参数|56,754|
|JSON大小|1,230,291 bytes|
|FP32参数大小|227,016 bytes，约221.7 KiB|
|globalPolicyPool|未启用|

参数计数：stem 9,824；4个卷积各9,248；value两层共1,729；policy两层共8,209。

`spatial_conv_net.ts:535–599`：policy提取三个坐标各32维局部特征，接53语义和20 global，169→48→1；value为GAP32+global20，52→32→1。五层3×3卷积的理论局部感受野为11×11。**代码推断：**无policy GAP时，三个坐标远处的完整棋盘不直接进入候选logit，主要只经20个聚合量体现；这不是已完成架构消融的棋力结论。

## 3. 手机20图尺寸：当前不存在超20裁切

脚本 `representation_map_audit.ts` 读取父任务一致快照 `snapshot_20261015_233413/03_curriculum-continuity.json` 的真实地图集合，用公共 `parseAppApkSkirmishMap` 解码项目APK地图资产，只读解析，不创建或推进对局。输出为 `representation_map_audit.json`。

输入SHA-256：`b3193de160ea8656147fddef3f0d57ec354ed3010151811e5bcf3b03a9fb55f1`。结果20图，**宽或高超过20的数量为0；最大宽、高均为19**。

|地图|宽×高|
|---|---|
|(2) Crossed swords|11×18|
|(2) Duel|13×13|
|(2) Icy Paths|15×15|
|(2) Liberty Port|13×13|
|(2) Mourningstar|11×11|
|(2) Peak Island|15×15|
|(2) Swamplands|10×10|
|(2) The Crossing|15×10|
|(3) Frozen fields|15×12|
|(3) Glu|13×19|
|(3) Midway|17×12|
|(3) classic 2|17×12|
|(4) Critical mass|15×15|
|(4) Crossroads|11×19|
|(4) Shadowlands|19×19|
|(4) Solitude|15×15|
|(4) The Crucible|19×19|
|(4) Waterways|15×15|
|(4) Winterstorm|13×13|
|(4) classic 1|16×15|

编码器对超过20的格子确实会略过（`:73–74、374–381、430–434`），但**不可把这个通用限制写成当前3000局已经发生的缺陷**。本核查使用项目保存的APK资产，不声称逐一核对手机每份序列化快照的地图字节。

## 4. 缺失语义及证据强弱

完整编码循环和global槽见 `spatial_tensor_encoder.ts:379–580`。

|字段/机制|代码事实|证据边界|
|---|---|---|
|exp/等级|没有直接编码；有效攻防可间接体现部分等级|R8已见exp不同而完整输入相同；未来升级语义可能不同，尚未证明每个别名改变最优动作|
|状态类型/计时|没有直接写状态类型、remainingTicks/Turns|攻防仅间接包含部分状态效果，毒/致盲消退等未来语义待专项验收|
|movementRemaining|Ch32写hasMoved?0:stats.move，非真实剩余力|rules.ts:320–338实际读取真实剩余力和hasPostAttackMoved，需突击专项反事实|
|治疗标记|没有写入|R8发现历史别名，但当前canHealTarget不读取该标记，不应直接宣称必有棋力损失|
|支援标记|没有写入|rules.ts:403–413确实用hasBeenSupportedThisTurn筛支援候选|
|pending实体/来源|global13和action31仅布尔|rules.ts:307–329、441–487对empty_castle和commander_castle有不同限制|
|同格堆叠|每格通道为覆盖写入|同阵营多个实体不会完整保留；pending招募可同格堆叠，数据实际频率待统计|
|墓碑|空间/全局均无寿命、归属|summon仅有召唤者和spawnPos，当前可召唤候选不代表未来墓碑收益完整|
|多人身份|同联盟合为己方，全部敌人合为敌方|已构造完整当前输入相同、指定下一敌人合法行动不同的反例，见下节|
|经济/回合身份|敌金币和军值取各敌最大值；无每敌队伍顺序|不能区分下一支行动敌军的具体局势|
|规则/脚本|完整规则参数和脚本目标不进入网络|规则设置跨场景可能影响未来转移，必须做完整观测验收|
|地形|road/bridge/snow等被合并，防御单独写入|不同兵种移动代价未完整表示；不是所有合并都必然产生精确碰撞|

R8 `evidence/alias_audit.json:13–20` 有相同输入和相同合法代码，却有治疗标记/exp差异；末尾还有unit.id差异、合法actionCodes不同。`STAGE_REPORT.md:79–87` 记录隔离1238核心状态别名、255标签冲突输入、21704重复行，原因可能重叠，不能相加。16对同教师流重新查询消除这些样本的标签差异，不证明未来策略无害。

R12 `first_disagreement_feature_check.json` 仅证明8对首分歧动作没有精确特征同一，不能证明整个表示充分。Env observation已含真实移动力、治疗/支援、pending、status和graves（`env.ts:987–1007`），不能把“环境有字段”当“模型已看到”。

## 5. 多人/联盟静态因果别名反例

脚本 `representation_alias_probe.ts` 构造四玩家静态状态：0与3同盟；1和2为独立敌人；两敌兵属性完全相同、坐标不同。只交换这两个敌兵ownerId，不移动单位、不执行引擎step。对两状态使用当前V19完整编码和规范有序合法候选。

**实际结果：**

- 当前完整网络输入相同：true。
- 当前玩家合法actionCodes相同：true。
- 指定敌方team1的合法actionCodes相同：false。
- 当前完整输入指纹：`4384eabb1c66ea0c097b78b610265c507aead260e72c0de4ddb9f03673f5ac77`。

原始两状态和合法代码保存在 `representation_alias_probe.json`。这是**完整当前输入下丢失未来行动者语义的存在性反例**，区别于仅发现字段未编码：敌军具体归属确实决定哪个单位可在team1行动。它没有证明手机数据中发生频率，也没有证明当前最优动作必然不同；更不能据此直接给模型性能损失的数值。

## 6. 候选、mask和部署合同

`shared_spatial_policy.ts:105–117` 先按actionCode规范Unicode顺序排序，再按权重schema编码，exact tie取最小code；`action_ordering.ts:75–116` 对重复code拒绝。

但R8–R12研究执行 `r8.../research/policy.ts:21–28`，直接用传入引擎legal顺序，严格大于argmax；`research/common.ts:22–33` 的输入hash也包含该顺序。**改变排序就是改变策略合同，不能直接套用历史parity。**

共享预测器评分全部传入候选；应用 `spatial_neural_adapter.ts:216` 和NET_B `neural_ai_adapter.ts:223` 会过滤surrender。研究worker使用完整集合，训练用完整CE和投降margin。后续须冻结是否包含投降，不能离线和部署各用一套集合。

`env.ts:1022–1048` 的actionMask为变长合法候选对应全true；固定动作空间另有indexes，不能混作定长全动作mask。NET_B是另一个356维state/45维action、4×4网格+敌我各10实体槽的模型（`runtime/skirmish_network_features.ts:20–37`）。

## 7. pending、换手、初次收入与标签

- `engine.ts:115–128` 仅applyInitialTurnStart=true发初次收益；clone():140–144不重发。`apk_skirmish.ts:258、276–277` 默认已做初次结算；Env reset不能再发。R8 `research/common.ts:15` 显式传true。
- 原子动作不是玩家回合。`engine.ts:946–963` 动作后清pending、死亡/胜负及淘汰换人；`:1003–1023` 无有效动作可自动换手。复合原生动作拆分必须核验真实转移，不能固定N动作换手。
- Env maxPlies按 `(turn−1)*playerCount+currentIndex+1` 估计（`env.ts:294–299`），不是原子步预算。
- Env done同时含自然终局和maxPlies截断，后者还可给军值/金币代理胜负奖励（`:717–748`）。value标签不能直接复制done/reward，需独立记录terminated/truncated/outcome provenance。winner是联盟ID，多人不能当玩家ID。
- Engine不保存策略随机流；Env seed主要是存储。R8策略显式state/calls且教师查询流独立（`research/common.ts:16–20`、`evidence/rng_contract.json`）。接续与反事实须复制双方策略RNG，不能只传最初seed。

## 8. 搜索预算和教师限制

R8 B100真正冻结算法在 `r8.../frozen/ai_training/v17/teachers/battle_search_b100.ts`，并非当前应用的BattleSearchAI。

- `evidence/b100_runtime_audit.json:147–169`：topK6、friendlyRolloutSteps1、oppDepth3、pendingFirst、attackSafety、twoStage。冻结算法`:467–477` pending再缩候选，`:927–1001` 根候选topK；不是穷举全合法集，也不是“100节点搜索”。
- Q按状态派生随机流，R跨决策持久流，通用runner RNG不是内部流（`v17/teachers/b100_policy.ts:245–345`）。
- R8 baseline_summary：Q4胜8负8截断，其中7时间1动作；R4胜9负7截断，其中6时间1动作。胜场多于网络的观察不等于已获教师资格。
- 当前应用S00/S10为200ms软限/20nodes（`neural_ai_adapter.ts:168–170、194–196`）；NET_B S10为150nodes、850ms停止/950ms返回目标（`:299–302`）。search teacher默认984nodes/beam8已被应用覆写（`runtime/skirmish_search_teacher.ts:78–96`）。
- 当前bounded search最多己方4后续原子步、敌方5原子步、默认深度8（`runtime/v7_heuristic_bounded_search.ts:450、596、624`），不能视作完整玩家回合对抗。

## 9. R8–R12约束与成本

R9两生产输入可学但纠正组0胜4负。R9b九安全输入9/9，实战安全0胜13负1截断。R10长链391输入382/391、单步339/391；训练父局长链161步获胜，但新14槽仅1胜、没有新增胜槽。R11/R12训练0更新；R12仅The Crossing座位1一个合格家族，同状态同seed复验不是独立样本。

R12 `action_budget_diagnostic.json`：两支线最长连续学生动作444/480，50/86换手就耗尽近3000原子动作。行动效率是优先诊断方向，但不能据此强制结束回合或直接认定死循环。

**成本推断：**代表模型约0.22MiB FP32，存储不是主要部署瓶颈。按代码结构，主干每决策约18.66M理论MAC（实际边界略少），每候选约8160MAC；35/377候选约0.29M/3.08M额外MAC。实际还含合法枚举、威胁图、伤害预测、克隆与日志。此为算式估计，**不是手机时延实测**，不可将源注释“<15ms”当验收。

R8 `evidence/training_cost_profile.json`：100更新/batch32为1.878秒，4197样本，候选median35/max377，线性估12000更新225秒。仅该环境小诊断，不覆盖百万样本转换和对局成本。

## 10. 推荐阻断门槛

1. 先通过原生完整状态→TS strict/转移、pending/初次收益/自动换手/联盟胜负专项；失败样本隔离，forced不能代替strict。
2. 新schema先做真实数据完整输入别名审计，补突击剩余力、pending堆叠、墓碑、状态计时、多人归属、规则设置的可复现反事实。未见频率和已证存在性分别报告。
3. 冻结engine-order或canonical，以及是否含投降；切换必须做全候选、标签和mask映射，另验TS/Python编码/logits/value/argmax，覆盖20图及极端候选数。
4. 先比较补字段、policy GAP/实体表示的小消融；现有证据不支持直接堆容量，也不支持跳过表示审计。
5. 纯策略和搜索分别报告实际目标设备p50/p95/p99、deadline miss、自然终局率和动作效率。教师先在全新训练父家族和匹配预算下取得资格，再生成昂贵标签。

复现静态统计：在根目录执行 `node --import tsx ai_training/next_stage_research_20261015/representation_map_audit.ts` 或 `representation_alias_probe.ts`。已有输出使用wx防覆盖；重新核查须先把脚本输出路径改为新的研究文件，不覆盖现有证据。
