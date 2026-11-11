# 固定第39轮的端点、血缘与联盟结果审计

本目录独立审计固定快照 `../snapshot_20261016_001729`，观察时点为2026-10-16 00:17:30（北京时间），只覆盖已完成第39轮及其此前段，不追踪正在采集的第40轮或后续状态。未操作手机、训练、运行规则对局或修改phone投影/consumer/运行器。

## 实际结果

`audit-summary.json`记录：2026-10-16 00:37:50完成，耗时98.973秒，5012/5012段通过，差异0：

|项目|数量|
|---|---:|
|原始父局|3000|
|续跑段|2012|
|原局动作|4,238,038|
|追加动作|3,894,235|
|合计动作|8,132,273|
|原生自然终局父局|2953|
|循环停止|1|
|固定快照中尚未结束|46|

s2466的最终来源为`s2466-c0033`，累计84,100动作，原生h仍未终局，按固定outcomes及stalemate策略标为循环停止。其余46局为The Crucible 45局、Shadowlands 1局，均保留未结束，不赋和局或胜负。这里的未结束/停止状态仅对应固定快照。

**所有policyEligible、valueEligible、returnEligible均为false。** actorAllianceLabels仅是原生结果解释metadata，须由主汇总结合TS转移资格另行释放，不能直接喂训练器。

补充分桶已对3000份实际config复读并核对原验收SHA，全为SD。**人数必须区分：**源地图的2/3/4人局数量分别1008/840/1152，实际config启用2/3/4队的数量分别1944/528/528。1560份预设派生初态中包含700份明确人工残局、860份其他预设局；不能把源地图人数当作实际多方竞争人数。`bucket-output-verification.json`独立核对分桶的config SHA及启用队伍与parent-outcomes的actor队伍相同。

## 证据文件

- `segment-receipts.jsonl`：5012条逐段回执，包含实际config/initial/final SHA、动作解压内容SHA、父ID、全局offset/end、原生h及唯一存活联盟、验收结果和全false资格。
- `parent-outcomes.jsonl`：3000条原始父局记录，包含最终段来源、血缘终点SHA、累计动作、原生赢家联盟及初始启用队伍的联盟符号metadata。
- `audit-summary.json`：固定快照身份、统计、69份源tar.gz的大小/SHA及读取耗时。源归档共约5.99GB，按顺序遍历；未解压states到磁盘。
- `source-identity.json`：固定catalog/status/outcomes/旧chain/stalemate文件及此次运行源码、native_reader源码的SHA；执行结束核对未变化。
- `output-verification.json`：独立复算5012条链接、3000父局最终来源、动作总数、联盟metadata和资格字段，全通过，并记录核心产物SHA。
- `parent-buckets.jsonl`、`bucket-summary.json`：补充分桶，来源为原局实际config与固定catalog/两份manifest，原有核心回执未改。`configMode`直接来自C0585e.f；人数区分`sourceMapPlayerCount`（config.map.d源地图队伍表）与`configuredPlayerCount`（config.i启用队伍）。人工残局由plan.kind=`advantage_endgame`、非null state及derivation.profile共同判定；其他预设兵种/技能局只标hasPresetState，不冒称残局。

## 完成了哪些检查

1. 每个config/initial/final通过本目录上一级native_reader严格完整消费；四组件、null和64位字段均保留原解析语义。
2. 实际config seed与catalog及段结果seed相同。initial/final的原始队伍表j、联盟k分别与config.i/j一致；definitions及规则也与原config完整一致。原局initial当前队伍类型与config.i一致。
3. 实际final.h与固定catalog或segment结果相同；h>=0时必须仅有一个仍存活联盟，且其联盟ID等于h。**h不按位掩码或玩家ID解析**：如s0001联盟为[1,2,3,4]，终局h=3、存活team=2，而不是team=3，也不是bits0/1两队。
4. 续跑parent_id必须指向实际前段；global_offset等于前段globalEnd；前段final与后段initial全快照SHA完全相等，并核对result.parent_final_sha256。续跑config SHA与原局config字节相同；原生记录的initial/final board SHA也核对。
5. 全部动作流读取到尾，核对JSONL行数、index、续跑global_index，以及`ai_seed=原局seed+全局序号*104729`。续跑action_types与结果计数相同。压缩actions流经过gzip尾部校验。
6. 外层tar.gz读取到gzip尾，校验CRC/ISIZE并计算源压缩文件完整SHA；读取前后大小/mtime不变。未解释或复跑中间states，不能把外层gzip验证冒充每个内部states.gz都已重新逐帧校验。
7. 最终父局outcome覆盖的final_source和global_actions与实际链尾一致；所有续跑归回原局，不新增独立对局数。

## 与旧第33轮chain的关系

固定快照中的旧`07_continuation-chain-verification.json`只声明检查到第33轮、追加3,341,954动作。**本目录是新做的第39轮全部2012段端点/SHA血缘和动作索引审计**，追加覆盖3,894,235动作。它不覆盖或改写旧报告，也不把端点链接一致解释为第39轮所有中间状态的原生回放/TS strict规则已经通过。

当前证据可以支持“原生最终结果与保存的父段链接完整、动作序号/种子连续”。它不独立支持“全部TS转移已验收”“原生完整候选mask已验收”“模型输入parity已通过”或“训练标签已释放”。

整个目录含源码、文档和补充分桶约7.04MB（约6.71MiB），小于10MiB。主审计和分桶两个TypeScript解码器均通过strict单文件类型检查。后续release设计风险见`RELEASE_BUILDER_REVIEW.md`，它是设计审查，尚非最终builder实现验收。

## 复现与资源边界

```text
python -X utf8 ai_training/data_acceptance_20261016/phone/endpoints/audit_endpoints.py
python -X utf8 ai_training/data_acceptance_20261016/phone/endpoints/verify_outputs.py
python -X utf8 ai_training/data_acceptance_20261016/phone/endpoints/build_buckets.py
```

脚本使用新建模式拒绝覆盖现有输出；复验应复制到新研究输出目录并显式调整输入/输出身份，不删除旧证据。运行主审计和补充分桶均在每份归档前检查C盘12GiB水位，低于阈值仅停止自身。主审计结束实测可用20,876,836,864字节；整个目录输出上限10MiB。源码可严格TypeScript检查，未安装任何依赖或启动APK。
