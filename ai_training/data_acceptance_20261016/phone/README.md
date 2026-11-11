# 原生3000局的紧凑转换与验收

本目录只读取已封存归档，不连接手机。本轮不训练、不生成新评测局、不修改采集控制或公共规则。

`snapshot_20261016_001729/`固定2026-10-16 00:17:30 +08:00、第39轮：3000个父局、2012个续段、8,132,273条宏动作。更晚手机采集不纳入本轮截止点。`endpoints/`已独立校验全部端点、动作序号/种子与逐字节续跑链接，不代表中间转移通过。

`full_v6/receipts/`是唯一合并收据目录。各`shard_*_v6`保存同一冻结源码产生的独立父局分片。`merge_shards.py`只引用已经关闭的gzip，不复制状态大文件；主遍历随后读取这些收据继续。`pilot_*`、`stratified_v5`等早期夹具与旧投影保留为诊断，不进入v6资格汇总。

## 转换合同

`consumer.ts`逐条读原生宏动作的before快照，以权威项目引擎和宏展开器执行strict原子动作；比较后继原生投影的受限规则语义，并比较两种状态构造产生的完整TS合法候选集合。每个已放行动作还记录规范候选顺序、索引、候选摘要和完整TS状态前后摘要。

这里的候选比较不是原生Java候选oracle验证。非当前玩家行动资源的规范化也不是网络观察完全相等。详见`PROJECTION_REVIEW.md`；所有具体目标网络的`modelSchemaAccepted=false`，本目录不宣称旧34通道网络可直接消费。

每个宏动作展开的原子样本权重合计为1，标签来源为`native_macro_commitment`；这些子动作不是各自独立询问原生AI得到的选择。第一次分歧后停止该段规则验收。已闭合前缀与失败宏步整组分离，尾部没有验过不等于已经证明每条动作有错。

## 发布与读取

`build_release.ts`将端点、分桶、原始配置SHA、冻结源码、输入交付SHA与逐段收据合并。默认只生成`checkpoint-*`，其中pending显式列出；`--final`要求5012段全部有独立封存收据、原始归档身份复核与全部紧凑完整性检查通过，才生成`release-*`。`union-completion.json`绑定每份收据SHA与全量覆盖，不要求主进程重复读取已由其他分片封存的states。发布过程中使用`.partial`暂存目录，只有完整manifest写出并通过资源检查后才改名。尚无最终发布时不能声称全量完成。

`release-index.jsonl`里的合格来源全部归属`train`；现有数据不再留出评测比例。只有闭合且完整的宏步可取得来源层policy标签资格。任一父局段转移不通过、未结束或循环停止，其整父局value保持mask。自然终局且全父链通过的结果才产生按行动方联盟计算的±1目标；return全部mask。确认循环尾部按已哈希的冻结政策排除，不制造平局。

`compact_reader.ts`使用索引读取已有压缩分片，不导出dense张量。它先检查相同压缩字节的SHA、gzip/CRC、头尾与收据一致、状态摘要链、宏组完整性、规范候选索引与联盟身份，再调用发布回调。value还要求父局结果证据及其SHA。路径同时检查词法边界和realpath，不能经junction引用phone目录外的数据。训练器仍应先确认最终release manifest及目标网络schema，不能直接扫描`candidate_shards`当作训练集。

所有value证据文件、端点输入与工具身份都由发布manifest/索引绑定。续段从其已验证原生初态单独重建；观察约定为`continuous-ts-chain-v1`，不能把跨段潜在字段重置说成完整原生网络观察一致。

## 资源

整个本轮目录累计新增上限1.25GiB，C盘至少保留12GiB。按局流读归档，不把states全量解压落盘，不复制源包。初始4个重放后，逐次依据实测余量扩至6个，再于16逻辑CPU、6任务总CPU约50.8%/可用内存约26GB时扩至最多8个持续重放。新增任务均BELOW_NORMAL优先级、Node heap限1536MiB。`run_below_normal.py`只改变自身及子进程调度/内存限额，调用同一个冻结转换器，不改变动作或规则。未触碰手机进程、ADB、Frida或采集器。

## 验证入口

`run_resource_budget_pending.py`是登记过的第三版资源派生：在前述两处守卫之外，只在构建归档队列前过滤已有封存收据的段。AST复核确认仅增加这一条过滤语句；它不改变任何新job的内容与inputHash。跳过段的生产分片收据SHA逐一登记在`skippedSealedReceiptHashes`中，最终发布同时绑定这些SHA、全部69份源归档SHA、5012段union收据和全部紧凑分片完整性。该优化用于本地任务重新分工，避免每次重复读入已验states，不代替来源或标签检查。

资源预算修订依据：续段压缩均值约268780字节，实测全量交付预计约1.1GiB，故将自定新增上限由1GiB调整为1.25GiB，C盘12GiB底线不变。冻结`run_phone.py`及全部转换/规则源码保持原SHA；其原1GiB守卫到限时只退出自身。后续`run_resource_budget.py`先核对冻结基准SHA，再通过AST仅替换两处资源节点：累计输出阈值，以及枚举到并行改名的`.partial`时跳过消失项。job、inputHash、动作与状态处理代码均不变。每次派生执行单独登记基准SHA、实际派生代码SHA、启动器SHA和该次新增收据SHA，最终发布绑定这些证据。运行身份中的基准源码身份不能代替实际资源启动器身份。

```powershell
node --import tsx --test ai_training/data_acceptance_20261016/native_reader/reader.test.ts ai_training/data_acceptance_20261016/phone/projection.test.ts ai_training/data_acceptance_20261016/phone/compact_reader.test.ts
python -X utf8 ai_training/data_acceptance_20261016/phone/merge_shards.py
node --import tsx ai_training/data_acceptance_20261016/phone/build_release.ts
```

全量来源层验收已完成，权威结果为[最终release](release-2026-10-15T21-05-00-859Z/summary.json)与[最终报告](../REPORT.md)。旧checkpoint仅为历史进度证据；5012段均有收据，pending为0。具体模型schema仍待验，本轮未训练。
